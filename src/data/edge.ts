/**
 * Calls our Supabase Edge Functions. Each function is one business use case and is protected
 * by our API key (x-api-key). Only src/data may call this; screens use the data functions.
 */
import type { EdgeMeta } from '@/types'
import { DataError } from './mock/store'

export class EdgeError extends DataError {
  constructor(
    readonly code: string,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message)
    this.name = 'EdgeError'
  }
}

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
  meta?: EdgeMeta
}

export function edgeConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_EDGE_API_KEY)
}

export async function callEdgeFunction<T>(name: string, body?: Record<string, unknown>): Promise<{ data: T; meta: EdgeMeta }> {
  const base = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_EDGE_API_KEY
  if (!base || !key) {
    throw new EdgeError('not_configured', 'The connection is not set up on this device. Add VITE_SUPABASE_URL and VITE_EDGE_API_KEY to .env.local.')
  }

  let res: Response
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    throw new EdgeError(timedOut ? 'timeout' : 'network', timedOut ? 'The request took too long. Try again.' : 'Could not reach the server. Check the connection and try again.')
  }

  const envelope = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!envelope) throw new EdgeError('bad_response', `The server sent an unexpected response (HTTP ${res.status}).`)
  if (!res.ok || !envelope.ok || envelope.data === undefined || !envelope.meta) {
    throw new EdgeError(
      envelope.error?.code ?? 'error',
      envelope.error?.message ?? `The request failed (HTTP ${res.status}).`,
      envelope.meta?.correlationId,
    )
  }
  return { data: envelope.data, meta: envelope.meta }
}
