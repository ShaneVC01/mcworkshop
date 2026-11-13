/** Read only SuiteQL queries through the REST query service. */
import type { RequestContext } from '../http/response.ts'
import { netsuiteFetch } from './client.ts'

interface SuiteQLResponse<T> {
  items: (T & { links?: unknown })[]
  count: number
  offset: number
  totalResults: number
  hasMore: boolean
}

export interface SuiteQLPage<T> {
  items: T[]
  count: number
  offset: number
  totalResults: number
  hasMore: boolean
}

/** Runs one page of a SuiteQL query. Limit is capped at 1000, which is NetSuite's page maximum. */
export async function runSuiteQL<T>(
  ctx: RequestContext,
  query: string,
  page: { limit: number; offset?: number },
): Promise<SuiteQLPage<T>> {
  const limit = Math.max(1, Math.min(1000, Math.floor(page.limit)))
  const offset = Math.max(0, Math.floor(page.offset ?? 0))
  const result = await netsuiteFetch<SuiteQLResponse<T>>(ctx, {
    method: 'POST',
    path: `/services/rest/query/v1/suiteql?limit=${limit}&offset=${offset}`,
    headers: { prefer: 'transient' },
    body: { q: query },
  })
  return {
    items: result.items.map(({ links: _links, ...row }) => row as T),
    count: result.count,
    offset: result.offset,
    totalResults: result.totalResults,
    hasMore: result.hasMore,
  }
}

/** Reads every page of a query (1000 rows at a time). A hard cap stops a runaway loop. */
export async function runSuiteQLAll<T>(ctx: RequestContext, query: string, maxRows = 50_000): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < maxRows; offset += 1000) {
    const page = await runSuiteQL<T>(ctx, query, { limit: 1000, offset })
    rows.push(...page.items)
    if (!page.hasMore) return rows
  }
  throw new Error('The result is larger than the allowed maximum.')
}
