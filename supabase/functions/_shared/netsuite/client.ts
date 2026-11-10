/**
 * The only way Edge Functions talk to NetSuite.
 * Bounded concurrency, retries with exponential backoff and jitter on 429 and 5xx,
 * one token refresh on 401, timeouts, and logging of status codes only.
 */
import { EdgeError, type RequestContext } from '../http/response.ts'
import { clearAccessToken, getAccessToken } from './auth.ts'
import { getNetSuiteConfig } from './config.ts'

const MAX_ATTEMPTS = 4
const TIMEOUT_MS = 25_000

// ---- Concurrency limit (per function instance) -------------------------------------------------

let active = 0
const waiting: (() => void)[] = []

async function acquire(limit: number) {
  if (active < limit) {
    active++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
  active++
}

function release() {
  active--
  waiting.shift()?.()
}

// ---- Helpers --------------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function backoff(attempt: number, retryAfter: string | null) {
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10_000)
  const base = 400 * 2 ** (attempt - 1)
  return base + Math.random() * base * 0.5
}

/** Turns NetSuite's REST error body into a short, safe message. */
async function describeError(res: Response) {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const details = Array.isArray(body['o:errorDetails']) ? (body['o:errorDetails'] as Record<string, unknown>[]) : []
  const first = details[0] ?? {}
  const code = (first['o:errorCode'] as string | undefined) ?? (body.title as string | undefined) ?? `HTTP ${res.status}`
  const detail = ((first.detail as string | undefined) ?? (body.title as string | undefined) ?? '').slice(0, 400)
  return detail && detail !== code ? `${code}: ${detail}` : code
}

export interface NetSuiteRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Path under the REST base URL, for example /services/rest/query/v1/suiteql?limit=25 */
  path: string
  body?: unknown
  headers?: Record<string, string>
}

export async function netsuiteFetch<T>(ctx: RequestContext, request: NetSuiteRequest): Promise<T> {
  const config = getNetSuiteConfig()
  const url = `${config.restUrl}${request.path}`
  const logPath = request.path.split('?')[0]
  let refreshedToken = false

  for (let attempt = 1; ; attempt++) {
    const accessToken = await getAccessToken(config, () => ctx.netsuiteRequests++)
    await acquire(config.maxConcurrency)
    const started = Date.now()
    let res: Response
    try {
      ctx.netsuiteRequests++
      res = await fetch(url, {
        method: request.method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...request.headers,
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      release()
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
      console.log(JSON.stringify({ fn: ctx.fn, correlationId: ctx.correlationId, netsuite: { method: request.method, path: logPath, attempt, error: timedOut ? 'timeout' : 'network' } }))
      if (attempt < MAX_ATTEMPTS && !timedOut) {
        await sleep(backoff(attempt, null))
        continue
      }
      throw timedOut
        ? new EdgeError('timeout', 504, 'NetSuite did not answer in time.')
        : new EdgeError('netsuite_error', 502, 'Could not reach NetSuite.')
    }
    release()
    console.log(JSON.stringify({ fn: ctx.fn, correlationId: ctx.correlationId, netsuite: { method: request.method, path: logPath, attempt, status: res.status, ms: Date.now() - started } }))

    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T

    if (res.status === 401 && !refreshedToken) {
      // Token expired or was revoked early: get a new one once.
      refreshedToken = true
      clearAccessToken()
      await res.body?.cancel()
      continue
    }
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < MAX_ATTEMPTS) {
      await res.body?.cancel()
      await sleep(backoff(attempt, res.headers.get('retry-after')))
      continue
    }
    const message = await describeError(res)
    if (res.status === 429) throw new EdgeError('netsuite_busy', 503, `NetSuite is busy (concurrency limit). ${message}`)
    if (res.status === 401 || res.status === 403) throw new EdgeError('netsuite_auth_failed', 502, `NetSuite refused access. ${message}`)
    throw new EdgeError('netsuite_error', 502, `NetSuite returned an error. ${message}`)
  }
}
