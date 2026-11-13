/**
 * vehicle-library-sync: copies the vehicle makes and models from NetSuite into our database.
 *
 * POST /functions/v1/vehicle-library-sync   { "dryRun": true }
 * Header: x-api-key
 *
 * Read only on the NetSuite side (two SuiteQL selects). It writes only to our own tables,
 * through the sync_vehicle_library function in one transaction. With dryRun it reads from
 * NetSuite and reports what would change without writing anything.
 *
 * The sync owns names, make, active flag and NetSuite stamps. It never touches the fields
 * staff set (family, series, years, class, fuel, engine, notes).
 */
import { readParams, withApiKey } from '../_shared/http/api-key.ts'
import { runSuiteQLAll } from '../_shared/netsuite/suiteql.ts'
import { dbError, getAdminClient } from '../_shared/supabase/admin.ts'

interface MakeRow { id: string; name?: string; abbreviation?: string; isinactive?: string | boolean; lastmodified?: string }
interface ModelRow extends MakeRow { model?: string; make_id?: string }

const MAKES = `SELECT id, name, abbreviation, isinactive, lastmodified FROM customrecord_ajg_make ORDER BY id`
const MODELS = `SELECT id, name, custrecord_agj_model AS model, custrecord_make AS make_id, abbreviation, isinactive, lastmodified
  FROM customrecord_ajg_make_model ORDER BY id`

/** NetSuite returns checkboxes as 'T' or 'F'. */
const isTrue = (v: unknown) => v === true || (typeof v === 'string' && ['t', 'true', 'y', '1'].includes(v.trim().toLowerCase()))

function toIso(value?: string) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

Deno.serve(
  withApiKey({ name: 'vehicle-library-sync', methods: ['POST'] }, async (ctx) => {
    const params = await readParams(ctx.req)
    const dryRun = params.dryRun === true || params.dryRun === 'true'

    const [makes, models] = await Promise.all([runSuiteQLAll<MakeRow>(ctx, MAKES), runSuiteQLAll<ModelRow>(ctx, MODELS)])

    const db = getAdminClient()
    let runId: string | undefined
    if (!dryRun) {
      const { data, error } = await db
        .from('sync_runs')
        .insert({ entity: 'vehicle_library', correlation_id: ctx.correlationId })
        .select('id')
        .single()
      if (error) throw dbError(error)
      runId = data.id as string
    }

    const { data: result, error } = await db.rpc('sync_vehicle_library', {
      p_makes: makes.map((m) => ({
        id: String(m.id), name: m.name ?? '', abbreviation: m.abbreviation ?? null,
        inactive: isTrue(m.isinactive), modified: toIso(m.lastmodified),
      })),
      p_models: models.map((m) => ({
        id: String(m.id), name: m.name ?? '', base_model: m.model ?? null, abbreviation: m.abbreviation ?? null,
        make_id: m.make_id ? String(m.make_id) : null, inactive: isTrue(m.isinactive), modified: toIso(m.lastmodified),
      })),
      p_dry_run: dryRun,
    })

    if (error) {
      if (runId) {
        await db.from('sync_runs').update({
          status: 'failed', finished_at: new Date().toISOString(), error_code: error.code ?? 'database_error',
          error_message: (error.message ?? '').slice(0, 300),
        }).eq('id', runId)
      }
      throw dbError(error)
    }

    const totals = result as {
      makes: { fetched: number; inserted: number; updated: number; deactivated: number }
      models: { fetched: number; inserted: number; updated: number; deactivated: number; skipped: number }
    }
    if (runId) {
      await db.from('sync_runs').update({
        status: 'succeeded', finished_at: new Date().toISOString(),
        fetched: totals.makes.fetched + totals.models.fetched,
        inserted: totals.makes.inserted + totals.models.inserted,
        updated: totals.makes.updated + totals.models.updated,
        deactivated: totals.makes.deactivated + totals.models.deactivated,
        skipped: totals.models.skipped,
      }).eq('id', runId)
    }

    return { data: result, meta: { dryRun } }
  }),
)
