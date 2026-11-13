/**
 * vehicle-library-list: one page of the vehicle library, filtered and searched in the database,
 * plus the lists the filter menus need.
 *
 * POST /functions/v1/vehicle-library-list
 *   { "search": "land cruiser", "makeId": "<uuid>", "modelId": "<uuid>", "sort": "name" | "popular", "vehicleClass": "4wd" | "none",
 *     "fuel": "diesel" | "none", "status": "active" | "inactive" | "all",
 *     "source": "netsuite" | "manual", "page": 1, "pageSize": 50 }
 * Header: x-api-key
 *
 * Reads our own tables only. It never calls NetSuite.
 */
import { readParams, withApiKey } from '../_shared/http/api-key.ts'
import { EdgeError } from '../_shared/http/response.ts'
import { dbError, getAdminClient } from '../_shared/supabase/admin.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CODE = /^[a-z0-9-]{1,40}$/

const COLUMNS =
  'id, name, base_model, family, series, make_id, make_name, year_from, year_to, vehicle_class, class_label, fuel_type, fuel_label, engine, source, is_active, needs_review, last_synced_at, vehicle_count, evidence_vehicles, attributes_source, notes'

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Search words keep letters, digits, spaces and a few joiners only, so they are safe inside a filter. */
function searchTokens(value: unknown) {
  return text(value)
    .replace(/[^\p{L}\p{N}\s\-./]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((t) => t.slice(0, 40))
}

Deno.serve(
  withApiKey({ name: 'vehicle-library-list', methods: ['GET', 'POST'] }, async (ctx) => {
    const p = await readParams(ctx.req)

    const page = p.page === undefined ? 1 : Number(p.page)
    const pageSize = p.pageSize === undefined ? 50 : Number(p.pageSize)
    if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new EdgeError('bad_request', 400, 'page must be a whole number from 1.')
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new EdgeError('bad_request', 400, 'pageSize must be a whole number from 1 to 100.')

    const makeId = text(p.makeId)
    const modelId = text(p.modelId)
    const sort = text(p.sort) || 'name'
    const vehicleClass = text(p.vehicleClass)
    const fuel = text(p.fuel)
    const status = text(p.status) || 'active'
    const source = text(p.source)
    if (modelId && !UUID.test(modelId)) throw new EdgeError('bad_request', 400, 'modelId is not valid.')
    if (!['name', 'popular'].includes(sort)) throw new EdgeError('bad_request', 400, 'sort must be name or popular.')
    if (makeId && !UUID.test(makeId)) throw new EdgeError('bad_request', 400, 'makeId is not valid.')
    if (vehicleClass && vehicleClass !== 'none' && !CODE.test(vehicleClass)) throw new EdgeError('bad_request', 400, 'vehicleClass is not valid.')
    if (fuel && fuel !== 'none' && !CODE.test(fuel)) throw new EdgeError('bad_request', 400, 'fuel is not valid.')
    if (!['active', 'inactive', 'all'].includes(status)) throw new EdgeError('bad_request', 400, 'status must be active, inactive or all.')
    if (source && !['netsuite', 'manual'].includes(source)) throw new EdgeError('bad_request', 400, 'source must be netsuite or manual.')

    const db = getAdminClient()

    let q = db.from('vehicle_library').select(COLUMNS, { count: 'exact' })
    if (makeId) q = q.eq('make_id', makeId)
    if (modelId) q = q.eq('id', modelId)
    if (vehicleClass) q = vehicleClass === 'none' ? q.is('vehicle_class', null) : q.eq('vehicle_class', vehicleClass)
    if (fuel) q = fuel === 'none' ? q.is('fuel_type', null) : q.eq('fuel_type', fuel)
    if (status !== 'all') q = q.eq('is_active', status === 'active')
    if (source) q = q.eq('source', source)
    // Every word must match the model, the make, the base model or the family.
    for (const t of searchTokens(p.search)) {
      q = q.or(`name.ilike.%${t}%,make_name.ilike.%${t}%,base_model.ilike.%${t}%,family.ilike.%${t}%`)
    }
    const from = (page - 1) * pageSize

    const ordered = sort === 'popular' ? q.order('vehicle_count', { ascending: false }).order('make_name').order('name') : q.order('make_name').order('name')

    const [list, makes, classes, fuels, lastSync, totals, needing, makeModels] = await Promise.all([
      ordered.range(from, from + pageSize - 1),
      db.from('vehicle_make_summary').select('id, name, is_active, active_models, models').order('name'),
      db.from('vehicle_classes').select('code, label').order('sort_order'),
      db.from('vehicle_fuel_types').select('code, label').order('sort_order'),
      db.from('sync_runs').select('finished_at, status, fetched, inserted, updated, deactivated, skipped')
        .eq('entity', 'vehicle_library').eq('status', 'succeeded').order('started_at', { ascending: false }).limit(1),
      db.from('vehicle_library').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('vehicle_library').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('needs_review', true),
      // The models of the chosen make, for the Model filter. Empty until a make is chosen.
      makeId ? db.from('vehicle_library').select('id, name, vehicle_count').eq('make_id', makeId).eq('is_active', true).order('name').limit(500) : Promise.resolve({ data: [], error: null }),
    ])
    for (const r of [list, makes, classes, fuels, lastSync, totals, needing, makeModels]) if (r.error) throw dbError(r.error)

    const sync = lastSync.data?.[0]
    return {
      data: {
        items: (list.data ?? []).map((r) => ({
          id: r.id, name: r.name, baseModel: r.base_model, family: r.family, series: r.series,
          makeId: r.make_id, makeName: r.make_name, yearFrom: r.year_from, yearTo: r.year_to,
          vehicleClass: r.vehicle_class, classLabel: r.class_label, fuel: r.fuel_type, fuelLabel: r.fuel_label,
          engine: r.engine, source: r.source, active: r.is_active, needsReview: r.needs_review, lastSyncedAt: r.last_synced_at,
          vehicleCount: r.vehicle_count, evidenceVehicles: r.evidence_vehicles, attributesSource: r.attributes_source, notes: r.notes,
        })),
        total: list.count ?? 0,
        facets: {
          makes: (makes.data ?? []).map((m) => ({ id: m.id, name: m.name, active: m.is_active, activeModels: m.active_models, models: m.models })),
          models: (makeModels.data ?? []).map((m: { id: string; name: string; vehicle_count: number }) => ({ id: m.id, name: m.name, vehicles: m.vehicle_count })),
          classes: classes.data ?? [],
          fuels: fuels.data ?? [],
        },
        summary: {
          activeModels: totals.count ?? 0,
          activeMakes: (makes.data ?? []).filter((m) => m.is_active).length,
          needingReview: needing.count ?? 0,
          lastSync: sync
            ? { at: sync.finished_at, fetched: sync.fetched, inserted: sync.inserted, updated: sync.updated, deactivated: sync.deactivated, skipped: sync.skipped }
            : null,
        },
      },
      meta: { page, pageSize, total: list.count ?? 0 },
    }
  }),
)
