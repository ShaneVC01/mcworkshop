/** Reads the NetSuite secrets. Only names are ever reported, never values. */
import { EdgeError } from '../http/response.ts'

export interface NetSuiteConfig {
  accountId: string
  /** Base URL with no trailing slash, for example https://1234567.suitetalk.api.netsuite.com */
  restUrl: string
  clientId: string
  certificateId: string
  privateKey: string
  maxConcurrency: number
  /** Anything other than "live" is treated as dry run. */
  writeMode: 'live' | 'dry-run'
}

const REQUIRED = ['NETSUITE_ACCOUNT_ID', 'NETSUITE_REST_URL', 'NETSUITE_CLIENT_ID', 'NETSUITE_CERTIFICATE_ID', 'NETSUITE_PRIVATE_KEY'] as const

let cached: NetSuiteConfig | undefined

function normaliseRestUrl(value: string) {
  let url = value.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  // Accept the base URL with or without a /services/... path.
  url = url.replace(/\/services(\/.*)?$/i, '').replace(/\/+$/, '')
  return url
}

export function getNetSuiteConfig(): NetSuiteConfig {
  if (cached) return cached
  const missing = REQUIRED.filter((name) => !(Deno.env.get(name) ?? '').trim())
  if (missing.length) {
    throw new EdgeError('not_configured', 500, `These secrets are not set on the project: ${missing.join(', ')}.`)
  }
  const concurrency = Number(Deno.env.get('NETSUITE_MAX_CONCURRENCY') ?? '')
  cached = {
    accountId: Deno.env.get('NETSUITE_ACCOUNT_ID')!.trim(),
    restUrl: normaliseRestUrl(Deno.env.get('NETSUITE_REST_URL')!),
    clientId: Deno.env.get('NETSUITE_CLIENT_ID')!.trim(),
    certificateId: Deno.env.get('NETSUITE_CERTIFICATE_ID')!.trim(),
    privateKey: Deno.env.get('NETSUITE_PRIVATE_KEY')!,
    maxConcurrency: Number.isInteger(concurrency) && concurrency > 0 ? Math.min(concurrency, 10) : 2,
    writeMode: (Deno.env.get('NETSUITE_WRITE_MODE') ?? '').trim().toLowerCase() === 'live' ? 'live' : 'dry-run',
  }
  return cached
}
