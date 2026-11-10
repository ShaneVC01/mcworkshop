/**
 * Live calls to NetSuite, through our Edge Functions. Read only.
 * Used by the Admin, Integration screen to test the connection. The rest of the
 * prototype still runs on mock data.
 */
import { nowIso } from '@/lib/format'
import type { EdgeMeta, IntegrationCustomer, Result } from '@/types'
import { callEdgeFunction } from './edge'

export { edgeConfigured, EdgeError } from './edge'

export interface CustomersTest {
  customers: IntegrationCustomer[]
  meta: EdgeMeta & { count?: number; hasMore?: boolean }
}

/** Lists the most recently created active customers from NetSuite (customers-list function). */
export async function testNetSuiteCustomers(limit = 25): Promise<Result<CustomersTest>> {
  const { data, meta } = await callEdgeFunction<IntegrationCustomer[]>('customers-list', { limit })
  return { data: { customers: data, meta }, sync: { status: 'synced', lastSyncedAt: nowIso() } }
}
