/**
 * Every Edge Function is wrapped in withApiKey. Callers must send our key in the x-api-key header.
 * The key lives in the EDGE_API_KEY secret. It may hold two keys separated by a comma during rotation.
 */
import { corsHeaders, EdgeError, fail, ok, type HandlerResult, type RequestContext } from './response.ts'

export interface EndpointOptions {
  /** Function name, used in logs. */
  name: string
  methods: ('GET' | 'POST')[]
}

const encoder = new TextEncoder()

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

/** Compares two strings in constant time by comparing their hashes. */
async function sameKey(given: string, expected: string) {
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

async function checkApiKey(req: Request) {
  const configured = (Deno.env.get('EDGE_API_KEY') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length >= 32)
  if (configured.length === 0) {
    throw new EdgeError('not_configured', 500, 'The API key secret EDGE_API_KEY is not set on this project.')
  }
  const given = req.headers.get('x-api-key') ?? ''
  let match = false
  for (const key of configured) {
    // Check every key so timing does not reveal which one matched.
    if (await sameKey(given, key)) match = true
  }
  if (!given || !match) throw new EdgeError('unauthorised', 401, 'Missing or invalid API key.')
}

export function withApiKey(options: EndpointOptions, handler: (ctx: RequestContext) => Promise<HandlerResult>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })

    const incoming = req.headers.get('x-correlation-id') ?? ''
    const ctx: RequestContext = {
      fn: options.name,
      req,
      correlationId: /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID(),
      startedAt: Date.now(),
      netsuiteRequests: 0,
    }

    try {
      if (!options.methods.includes(req.method as 'GET' | 'POST')) {
        throw new EdgeError('method_not_allowed', 405, `Use ${options.methods.join(' or ')}.`)
      }
      // The key check always runs before any NetSuite call.
      await checkApiKey(req)
      return ok(ctx, await handler(ctx))
    } catch (error) {
      return fail(ctx, error)
    }
  }
}

/** Reads optional JSON body parameters merged with query string parameters. */
export async function readParams(req: Request): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = Object.fromEntries(new URL(req.url).searchParams)
  if (req.method === 'POST' && (req.headers.get('content-type') ?? '').includes('application/json')) {
    const text = await req.text()
    if (text.trim()) {
      try {
        const body = JSON.parse(text)
        if (body && typeof body === 'object' && !Array.isArray(body)) Object.assign(params, body)
      } catch {
        throw new EdgeError('bad_request', 400, 'The request body is not valid JSON.')
      }
    }
  }
  return params
}
