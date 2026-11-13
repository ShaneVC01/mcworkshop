/**
 * Shared response handling for every Edge Function: one JSON envelope, stable error codes,
 * CORS, correlation IDs and logging that never includes secrets or customer data.
 */

export type ErrorCode =
  | 'unauthorised'
  | 'bad_request'
  | 'method_not_allowed'
  | 'write_blocked'
  | 'not_configured'
  | 'netsuite_auth_failed'
  | 'netsuite_error'
  | 'netsuite_busy'
  | 'timeout'
  | 'database_error'
  | 'internal_error'

/** Throw this from any handler or shared module to return a clean error to the caller. */
export class EdgeError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'EdgeError'
  }
}

/** Per request context, passed to handlers and to the NetSuite client. */
export interface RequestContext {
  fn: string
  req: Request
  correlationId: string
  startedAt: number
  /** Counted by the NetSuite client, returned in meta. */
  netsuiteRequests: number
}

export interface HandlerResult {
  data: unknown
  meta?: Record<string, unknown>
}

function allowedOrigins() {
  return (Deno.env.get('EDGE_ALLOWED_ORIGINS') ?? 'http://localhost:5183')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'x-api-key, content-type, x-correlation-id',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-expose-headers': 'x-correlation-id',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
  const origin = req.headers.get('origin')
  const allowed = allowedOrigins()
  if (origin && (allowed.includes('*') || allowed.includes(origin))) headers['access-control-allow-origin'] = origin
  return headers
}

function json(ctx: RequestContext, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(ctx.req),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-correlation-id': ctx.correlationId,
    },
  })
}

function baseMeta(ctx: RequestContext) {
  return {
    correlationId: ctx.correlationId,
    durationMs: Date.now() - ctx.startedAt,
    netsuiteRequests: ctx.netsuiteRequests,
  }
}

export function ok(ctx: RequestContext, result: HandlerResult) {
  log(ctx, { status: 200 })
  return json(ctx, 200, { ok: true, data: result.data, meta: { ...baseMeta(ctx), ...result.meta } })
}

export function fail(ctx: RequestContext, error: unknown) {
  const e =
    error instanceof EdgeError
      ? error
      : new EdgeError('internal_error', 500, 'Something went wrong inside the function. Check the logs with the correlation ID.')
  if (!(error instanceof EdgeError)) {
    // Unexpected errors: log the type and message only. Messages here come from our own code or Deno, never secrets.
    console.error(JSON.stringify({ fn: ctx.fn, correlationId: ctx.correlationId, unexpected: String(error).slice(0, 300) }))
  }
  log(ctx, { status: e.status, code: e.code })
  return json(ctx, e.status, { ok: false, error: { code: e.code, message: e.message }, meta: baseMeta(ctx) })
}

/** One structured line per request. Only metadata, never payloads. */
export function log(ctx: RequestContext, extra: Record<string, unknown>) {
  console.log(
    JSON.stringify({ fn: ctx.fn, correlationId: ctx.correlationId, durationMs: Date.now() - ctx.startedAt, netsuiteRequests: ctx.netsuiteRequests, ...extra }),
  )
}
