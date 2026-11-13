/**
 * The vehicle library synced from the back office system, read through our Edge Functions.
 * The tables hold makes and models. Filtering, search and paging happen in the database.
 */
import { nowIso } from '@/lib/format'
import type { LibraryFilters, LibraryHistoryResult, LibraryPage, LibrarySyncResult, Result } from '@/types'
import { callEdgeFunction } from './edge'

export { edgeConfigured } from './edge'

/** One page of the library with the filter lists and summary figures. */
export async function getLibraryPage(filters: LibraryFilters): Promise<Result<LibraryPage>> {
  const { data } = await callEdgeFunction<LibraryPage>('vehicle-library-list', { ...filters })
  return { data, sync: { status: 'synced', lastSyncedAt: data.summary.lastSync?.at ?? nowIso() } }
}

/** Copies makes and models from the back office system. A dry run only reports what would change. */
export async function syncVehicleLibrary(dryRun = false): Promise<LibrarySyncResult> {
  const { data } = await callEdgeFunction<LibrarySyncResult>('vehicle-library-sync', { dryRun })
  return data
}

/** Works out type, fuel and years for each model from the workshop's past vehicles and jobs. */
export async function enrichVehicleLibrary(dryRun = false): Promise<LibraryHistoryResult> {
  const { data } = await callEdgeFunction<LibraryHistoryResult>('vehicle-library-enrich', { dryRun })
  return data
}
