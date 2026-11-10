/**
 * Every function that changes data in NetSuite must go through this guard.
 * NetSuite is production only, so writes are dry run unless NETSUITE_WRITE_MODE is "live",
 * and a function may only be switched to live after Shane approves that specific write.
 */
import { getNetSuiteConfig } from './config.ts'

export type WriteDecision<T> = { mode: 'live' } | { mode: 'dry-run'; wouldSend: T }

/**
 * Returns "live" only when writes are switched on. Otherwise returns the payload that would have
 * been sent, so the caller can return it for review without calling NetSuite.
 */
export function guardWrite<T>(fn: string, payload: T): WriteDecision<T> {
  if (getNetSuiteConfig().writeMode === 'live') return { mode: 'live' }
  console.log(JSON.stringify({ fn, writeMode: 'dry-run', note: 'NetSuite write skipped' }))
  return { mode: 'dry-run', wouldSend: payload }
}
