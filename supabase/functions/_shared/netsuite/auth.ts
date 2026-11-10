/**
 * NetSuite OAuth 2 client credentials (machine to machine) with a certificate.
 * We sign a short lived JWT with our private key and swap it for an access token,
 * which is cached in memory until shortly before it expires.
 */
import { importPKCS8, SignJWT, type KeyLike } from 'npm:jose@5.9.6'
import { EdgeError } from '../http/response.ts'
import type { NetSuiteConfig } from './config.ts'

interface SigningKey {
  key: KeyLike
  alg: string
}

let signingKey: Promise<SigningKey> | undefined
let token: { value: string; expiresAt: number } | undefined
let inflight: Promise<string> | undefined

// ---- Private key handling -----------------------------------------------------------------

function derLength(length: number) {
  if (length < 0x80) return [length]
  const bytes: number[] = []
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff)
  return [0x80 | bytes.length, ...bytes]
}

function derTag(tag: number, content: Uint8Array) {
  return new Uint8Array([tag, ...derLength(content.length), ...content])
}

/** Wraps a PKCS#1 RSA key into PKCS#8, which is what Web Crypto can import. */
function pkcs1ToPkcs8(pkcs1: Uint8Array) {
  const version = new Uint8Array([0x02, 0x01, 0x00])
  // SEQUENCE { OID 1.2.840.113549.1.1.1 rsaEncryption, NULL }
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00])
  const octets = derTag(0x04, pkcs1)
  const body = new Uint8Array([...version, ...algorithm, ...octets])
  return derTag(0x30, body)
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(text: string) {
  const binary = atob(text)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * Rebuilds a clean PKCS#8 PEM from whatever was pasted into the secret: escaped newlines,
 * spaces instead of newlines, or a PKCS#1 "RSA PRIVATE KEY".
 */
function normalisePem(raw: string) {
  const text = raw.replace(/\\n/g, '\n').trim()
  const match = text.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/)
  if (!match) {
    throw new EdgeError('not_configured', 500, 'NETSUITE_PRIVATE_KEY is not a PEM private key (no BEGIN and END lines found).')
  }
  const label = match[1]!
  const body = match[2]!.replace(/[^A-Za-z0-9+/=]/g, '')
  let der: Uint8Array
  try {
    der = fromBase64(body)
  } catch {
    throw new EdgeError('not_configured', 500, 'NETSUITE_PRIVATE_KEY could not be decoded. Check it was pasted in full.')
  }
  if (label === 'RSA PRIVATE KEY') der = pkcs1ToPkcs8(der)
  else if (label === 'EC PRIVATE KEY') {
    throw new EdgeError('not_configured', 500, 'NETSUITE_PRIVATE_KEY is an EC key in SEC1 format. Convert it to PKCS#8 (BEGIN PRIVATE KEY) with openssl pkcs8 -topk8 -nocrypt.')
  } else if (label !== 'PRIVATE KEY') {
    throw new EdgeError('not_configured', 500, `NETSUITE_PRIVATE_KEY has an unsupported format (${label}). Use an unencrypted PKCS#8 key.`)
  }
  const lines = toBase64(der).match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`
}

/** RSA keys sign with PS256 (NetSuite no longer accepts RS256). EC keys use the matching ES algorithm. */
async function loadSigningKey(config: NetSuiteConfig): Promise<SigningKey> {
  const pem = normalisePem(config.privateKey)
  for (const alg of ['PS256', 'ES256', 'ES384', 'ES512']) {
    try {
      return { key: await importPKCS8(pem, alg), alg }
    } catch {
      // Try the next algorithm.
    }
  }
  throw new EdgeError('not_configured', 500, 'NETSUITE_PRIVATE_KEY could not be loaded as an RSA or EC private key.')
}

// ---- Token ----------------------------------------------------------------------------------

export function tokenEndpoint(config: NetSuiteConfig) {
  return `${config.restUrl}/services/rest/auth/oauth2/v1/token`
}

async function requestToken(config: NetSuiteConfig, onRequest: () => void): Promise<string> {
  signingKey ??= loadSigningKey(config).catch((error) => {
    signingKey = undefined
    throw error
  })
  const { key, alg } = await signingKey
  const aud = tokenEndpoint(config)
  const now = Math.floor(Date.now() / 1000)
  const assertion = await new SignJWT({ scope: ['rest_webservices'] })
    .setProtectedHeader({ alg, typ: 'JWT', kid: config.certificateId })
    .setIssuer(config.clientId)
    .setAudience(aud)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key)

  onRequest()
  let res: Response
  try {
    res = await fetch(aud, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
      }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new EdgeError('timeout', 504, 'NetSuite did not answer the token request in time.')
    }
    throw new EdgeError('netsuite_auth_failed', 502, 'Could not reach the NetSuite token endpoint. Check NETSUITE_REST_URL.')
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof body.access_token !== 'string') {
    // error and error_description from NetSuite are safe to return: they never contain credentials.
    const reason = [body.error, body.error_description].filter(Boolean).join(': ') || `HTTP ${res.status}`
    throw new EdgeError('netsuite_auth_failed', 502, `NetSuite refused the token request (${reason}).`)
  }
  const expiresIn = Number(body.expires_in) || 3600
  token = { value: body.access_token, expiresAt: Date.now() + (expiresIn - 120) * 1000 }
  return token.value
}

/** Returns a valid access token, reusing the cached one and sharing one request between concurrent callers. */
export async function getAccessToken(config: NetSuiteConfig, onRequest: () => void) {
  if (token && token.expiresAt > Date.now()) return token.value
  inflight ??= requestToken(config, onRequest).finally(() => {
    inflight = undefined
  })
  return inflight
}

export function clearAccessToken() {
  token = undefined
}
