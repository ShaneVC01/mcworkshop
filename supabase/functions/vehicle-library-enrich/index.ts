/**
 * vehicle-library-enrich: fills the type, fuel and years of each model from workshop history.
 *
 * POST /functions/v1/vehicle-library-enrich   { "dryRun": true }
 * Header: x-api-key
 *
 * Read only on the NetSuite side. It runs four aggregate SuiteQL queries over the customer vehicle
 * records and past jobs. The queries return counts grouped by model, never a registration, VIN,
 * customer or note. The result goes to our database through apply_vehicle_library_history.
 *
 * Rules, chosen to prefer a blank over a wrong answer:
 *   Type   the past job type is the strongest signal ("4WD Vehicle Service" or "Passenger Car Service"),
 *          so it decides when 4WD wins on its own. Otherwise a clear commercial body (van, cab chassis,
 *          single cab) decides, then the job type, then a clear passenger body (hatch, sedan, coupe).
 *          Each needs agreement of 75 to 80 percent. A model split between types stays empty.
 *   Fuel   votes from the vehicle's fuel field (typos mapped) and the job type's (DIESEL) or (PETROL).
 *          At least 2 votes and 80 percent agreement.
 *   Years  the lowest and highest model year seen, ignoring a lone year far from the rest. The end year
 *          is left open for models seen in 2022 or later, because they are probably still built.
 * Anything that does not meet a rule stays empty for staff to set.
 */
import { readParams, withApiKey } from '../_shared/http/api-key.ts'
import { runSuiteQLAll } from '../_shared/netsuite/suiteql.ts'
import { dbError, getAdminClient } from '../_shared/supabase/admin.ts'

type Class = '4wd' | 'passenger' | 'light-commercial'
type Fuel = 'diesel' | 'petrol' | 'hybrid' | 'electric'

const A = 'FROM customrecord_nx_asset a WHERE a.custrecord_nxc_na_model IS NOT NULL'
const Q = {
  stats: `SELECT a.custrecord_nxc_na_model AS model_id, COUNT(*) AS vehicles ${A} GROUP BY a.custrecord_nxc_na_model ORDER BY a.custrecord_nxc_na_model`,
  years: `SELECT a.custrecord_nxc_na_model AS model_id, a.custrecordnxc_na_yearmodel AS yr, COUNT(*) AS n ${A} AND a.custrecordnxc_na_yearmodel BETWEEN 1950 AND 2027 GROUP BY a.custrecord_nxc_na_model, a.custrecordnxc_na_yearmodel ORDER BY a.custrecord_nxc_na_model, a.custrecordnxc_na_yearmodel`,
  fuel: `SELECT a.custrecord_nxc_na_model AS model_id, a.custrecord_nxc_na_fueltype AS label, COUNT(*) AS n ${A} AND a.custrecord_nxc_na_fueltype IS NOT NULL GROUP BY a.custrecord_nxc_na_model, a.custrecord_nxc_na_fueltype ORDER BY a.custrecord_nxc_na_model, a.custrecord_nxc_na_fueltype`,
  body: `SELECT a.custrecord_nxc_na_model AS model_id, a.custrecord_nxc_na_bodytype AS label, COUNT(*) AS n ${A} AND a.custrecord_nxc_na_bodytype IS NOT NULL GROUP BY a.custrecord_nxc_na_model, a.custrecord_nxc_na_bodytype ORDER BY a.custrecord_nxc_na_model, a.custrecord_nxc_na_bodytype`,
  jobs: `SELECT a.custrecord_nxc_na_model AS model_id, BUILTIN.DF(c.custevent_nxc_job_subtype) AS label, COUNT(*) AS n FROM supportcase c JOIN customrecord_nx_asset a ON a.id = c.custevent_nx_case_asset WHERE a.custrecord_nxc_na_model IS NOT NULL AND c.custevent_nxc_job_subtype IS NOT NULL GROUP BY a.custrecord_nxc_na_model, BUILTIN.DF(c.custevent_nxc_job_subtype) ORDER BY a.custrecord_nxc_na_model, BUILTIN.DF(c.custevent_nxc_job_subtype)`,
}

interface Count { model_id: string; label?: string; n: string | number }
const num = (v: unknown) => Number(v) || 0

/** Maps the free text fuel field, including its typos, to our fuel codes. Anything else is ignored. */
export function fuelFromText(raw: string): Fuel | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (s.includes('hybrid')) return 'hybrid'
  if (s.includes('electric')) return 'electric'
  if (/d[ie]+s[ie]+l/.test(s)) return 'diesel'
  if (/petrol|unleaded|e85|lpg|\bgas\b/.test(s)) return 'petrol'
  return null
}

/** Votes from a job type such as "4WD Vehicle Service (DIESEL), Report Work". */
export function jobVotes(label: string): { cls?: Class; fuel?: Fuel } {
  const parts = label.toUpperCase().split(',').map((p) => p.trim())
  const part = parts.find((p) => p.startsWith('4WD VEHICLE SERVICE') || p.startsWith('PASSENGER CAR SERVICE'))
  if (!part) return {}
  return {
    cls: part.startsWith('4WD') ? '4wd' : 'passenger',
    fuel: part.includes('(DIESEL)') ? 'diesel' : part.includes('(PETROL)') ? 'petrol' : undefined,
  }
}

/**
 * Only some body types say something about the class. Wagons, SUVs and dual cabs say nothing, but they
 * still count as 'other' so they dilute the share. Without that, 30 single cab Hilux would look like
 * unanimous evidence next to 900 dual cabs that were ignored.
 */
export function classFromBody(raw: string): Class | 'other' | null {
  const s = raw.toUpperCase().trim()
  if (!s) return null
  if (/\b(DUAL|DUEL|DAUL|CREW|EXTRA|SPACE|SUPER)\b/.test(s)) return 'other'
  if (/HATCH|SEDAN|COUPE|CONVERT/.test(s)) return 'passenger'
  if (/\bVAN\b|\bBUS\b|TRUCK|CAB CHASSIS|SINGLE CAB/.test(s)) return 'light-commercial'
  return 'other'
}

/** Job type first when 4WD wins, then a clear commercial body, then the job type, then a clear passenger body. */
export function decideClass(job: Map<Class, number> | undefined, body: Map<Class | 'other', number> | undefined): { key: Class; total: number } | null {
  const j = winner(job ?? new Map(), 2, 0.75)
  if (j?.key === '4wd') return j
  const b = winner(body ?? new Map(), 3, 0.8)
  if (b?.key === 'light-commercial') return { key: b.key, total: b.total }
  if (j) return j
  return b?.key === 'passenger' ? { key: b.key, total: b.total } : null
}

function winner<K extends string>(votes: Map<K, number>, minVotes: number, minShare: number): { key: K; total: number } | null {
  let total = 0
  let top: K | null = null
  for (const [k, v] of votes) {
    total += v
    if (top === null || v > (votes.get(top) ?? 0)) top = k
  }
  if (top === null || total < minVotes || (votes.get(top) ?? 0) / total < minShare) return null
  return { key: top, total }
}

/** Lowest and highest year seen, ignoring a lone year more than 3 years from every other year. */
export function yearRange(rows: { yr: number; n: number }[]): { from: number; to: number | null } | null {
  if (rows.length === 0) return null
  const total = rows.reduce((t, r) => t + r.n, 0)
  let kept = rows
  if (total >= 6) {
    kept = rows.filter((r) => r.n > 1 || rows.some((o) => o !== r && Math.abs(o.yr - r.yr) <= 3))
    if (kept.length === 0) kept = rows
  }
  const years = kept.map((r) => r.yr)
  const from = Math.min(...years)
  const to = Math.max(...years)
  return { from, to: to >= 2022 ? null : to }
}

Deno.serve(
  withApiKey({ name: 'vehicle-library-enrich', methods: ['POST'] }, async (ctx) => {
    const params = await readParams(ctx.req)
    const dryRun = params.dryRun === true || params.dryRun === 'true'

    const [stats, years, fuel, body, jobs] = await Promise.all([
      runSuiteQLAll<Count & { vehicles: string }>(ctx, Q.stats),
      runSuiteQLAll<Count & { yr: string }>(ctx, Q.years),
      runSuiteQLAll<Count>(ctx, Q.fuel),
      runSuiteQLAll<Count>(ctx, Q.body),
      runSuiteQLAll<Count>(ctx, Q.jobs),
    ])

    const jobClassVotes = new Map<string, Map<Class, number>>()
    const bodyClassVotes = new Map<string, Map<Class | 'other', number>>()
    const fuelVotes = new Map<string, Map<Fuel, number>>()
    const add = <K extends string>(map: Map<string, Map<K, number>>, id: string, key: K, n: number) => {
      const m = map.get(id) ?? new Map<K, number>()
      m.set(key, (m.get(key) ?? 0) + n)
      map.set(id, m)
    }
    for (const r of jobs) {
      const v = jobVotes(r.label ?? '')
      if (v.cls) add(jobClassVotes, String(r.model_id), v.cls, num(r.n))
      if (v.fuel) add(fuelVotes, String(r.model_id), v.fuel, num(r.n))
    }
    for (const r of body) {
      const c = classFromBody(r.label ?? '')
      if (c) add(bodyClassVotes, String(r.model_id), c, num(r.n))
    }
    for (const r of fuel) {
      const f = fuelFromText(r.label ?? '')
      if (f) add(fuelVotes, String(r.model_id), f, num(r.n))
    }
    const yearRows = new Map<string, { yr: number; n: number }[]>()
    for (const r of years) {
      const list = yearRows.get(String(r.model_id)) ?? []
      list.push({ yr: num(r.yr), n: num(r.n) })
      yearRows.set(String(r.model_id), list)
    }

    const rows = stats.map((s) => {
      const id = String(s.model_id)
      const cls = decideClass(jobClassVotes.get(id), bodyClassVotes.get(id))
      const fl = winner(fuelVotes.get(id) ?? new Map(), 2, 0.8)
      const yr = yearRange(yearRows.get(id) ?? [])
      return {
        model_id: id,
        vehicles: num(s.vehicles),
        vehicle_class: cls?.key ?? null,
        fuel_type: fl?.key ?? null,
        year_from: yr?.from ?? null,
        year_to: yr?.to ?? null,
        evidence: Math.max(cls?.total ?? 0, fl?.total ?? 0) || null,
      }
    })

    const { data, error } = await getAdminClient().rpc('apply_vehicle_library_history', { p_rows: rows, p_dry_run: dryRun })
    if (error) throw dbError(error)
    return { data, meta: { dryRun, modelsWithVehicles: rows.length } }
  }),
)
