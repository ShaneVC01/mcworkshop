/**
 * The service role client for our own database. Only Edge Functions use it, never the browser.
 * It bypasses row level security, so every function that uses it must be wrapped in withApiKey
 * and must validate its own inputs.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.47.10'
import { EdgeError } from '../http/response.ts'

let client: SupabaseClient | undefined

export function getAdminClient(): SupabaseClient {
  if (client) return client
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new EdgeError('not_configured', 500, 'The database connection is not available to this function.')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

/** Turns a database error into our error shape without leaking the query. */
export function dbError(error: { code?: string; message?: string }): EdgeError {
  return new EdgeError('database_error', 500, `Database error${error.code ? ` (${error.code})` : ''}: ${error.message ?? 'unknown'}`)
}
