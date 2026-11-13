/**
 * Read side of the data layer. Each function is named for a business question.
 * Phase 1 answers from mock data. docs/supabase-handover.md says what each becomes.
 */
import { dayCapacity, findSlots } from '@/lib/capacity'
import {
  addWorkingDays, dayKey, gstOf, minutesBetween, normaliseRego, nowIso, workingToday,
} from '@/lib/format'
import { isFinished, ON_SITE } from '@/lib/job-state'
import { findLibraryModel, resolveServicePlan } from '@/lib/service-profiles'
import type {
  ActivityEvent, AvailabilityRequest, AvailabilitySlot, Bay, Booking, CapacitySummary, Id, InvoiceSummary,
  JobCard, Quote, Result, RolePermissions, ScheduledJob, SearchHit, ServiceActual, ServicePlan, ServiceProfile,
  ServiceTemplate, StaffUser, SyncLogEntry, Technician, TimelineVisit, TodaySummary, Totals, UtilisationReport,
  VehicleDetail, VehicleModel, WorkshopSettings,
} from '@/types'
import type { Database } from './mock/seed'
import { DataError, getDb, getSettings, read, type MockSettings } from './mock/store'

// ---- Shaping helpers (also used by actions) -----------------------------------------

export function toScheduled(db: Database, booking: Booking): ScheduledJob {
  const job = db.jobs.find((j) => j.id === booking.jobId)
  const vehicle = db.vehicles.find((v) => v.id === booking.vehicleId)
  const customer = db.customers.find((c) => c.id === booking.customerId)
  if (!job || !vehicle || !customer) throw new DataError('That booking could not be found.')
  return {
    booking, job, vehicle, customer,
    technicians: db.technicians.filter((t) => booking.technicianIds.includes(t.id)),
    bay: db.bays.find((b) => b.id === booking.bayId),
    atRisk: !isFinished(job.status) && nowIso() > job.promisedAt && dayKey(booking.startAt) <= dayKey(),
  }
}

function bookingOf(db: Database, id: Id) {
  const booking = db.bookings.find((b) => b.id === id || b.jobId === id)
  if (!booking) throw new DataError('That booking could not be found.')
  return booking
}

export function totalsOf(job: JobCard, source?: 'template'): Totals {
  const labour = job.labour.filter((l) => !source || l.source === source)
  const parts = job.parts.filter((p) => (source ? p.source === source : true))
  const labourCents = Math.round(labour.reduce((s, l) => s + l.hours * l.rateCents, 0))
  const partsCents = parts.reduce((s, p) => s + p.qty * p.unitCents, 0)
  const subtotalCents = labourCents + partsCents
  const gstCents = gstOf(subtotalCents)
  return { labourCents, partsCents, subtotalCents, gstCents, totalCents: subtotalCents + gstCents }
}

/** True when a job has additional work waiting on the advisor or the customer. */
export function needsApproval(job: JobCard) {
  return (
    job.status === 'WAITING_APPROVAL' ||
    job.findings.some((f) => f.approvalStatus === 'draft' || f.approvalStatus === 'awaiting-customer')
  )
}

const byStart = (a: ScheduledJob, b: ScheduledJob) => a.booking.startAt.localeCompare(b.booking.startAt)

// ---- Staff ---------------------------------------------------------------------------

export const getStaff = (): Promise<Result<StaffUser[]>> => read((db) => db.staff)
export const getTechnicians = (): Promise<Result<Technician[]>> => read((db) => db.technicians)
export const getBays = (): Promise<Result<Bay[]>> => read((db) => db.bays)
export const getServiceTemplates = (): Promise<Result<ServiceTemplate[]>> => read((db) => db.templates)

// ---- Admin: permissions, workshop settings and the service catalogue ----------------------------

export const getRolePermissions = (): Promise<Result<RolePermissions>> => read((db) => db.rolePermissions)
export const getWorkshopSettings = (): Promise<Result<WorkshopSettings>> => read((db) => db.settings)
export const getVehicleLibrary = (): Promise<Result<VehicleModel[]>> => read((db) => db.library)
export const getServiceProfiles = (): Promise<Result<ServiceProfile[]>> => read((db) => db.profiles)

/** What a booking would use for this vehicle and service: the profile if there is one, else the generic template. */
export const getServicePlan = (vehicleId: Id | undefined, templateId: Id): Promise<Result<ServicePlan>> =>
  read((db) => {
    const template = db.templates.find((t) => t.id === templateId)
    if (!template) throw new DataError('That service could not be found.')
    const vehicle = vehicleId ? db.vehicles.find((v) => v.id === vehicleId) : undefined
    return resolveServicePlan(template, vehicle, db.library, db.profiles, db.settings.labourRateCents)
  })

/**
 * Hours actually spent on finished jobs, so a profile's estimate can be checked against reality.
 * Keys are "template:<id>" for every job of that service and "profile:<id>" for jobs on the profile's model.
 */
export const getServiceActuals = (): Promise<Result<Record<string, ServiceActual>>> =>
  read((db) => {
    const sums = new Map<string, { total: number; n: number }>()
    const add = (key: string, hours: number) => {
      const cur = sums.get(key) ?? { total: 0, n: 0 }
      sums.set(key, { total: cur.total + hours, n: cur.n + 1 })
    }
    for (const job of db.jobs) {
      const hours = job.timeEntries.reduce(
        (sum, t) => sum + (t.endedAt ? minutesBetween(t.startedAt, t.endedAt) / 60 : 0), 0)
      const booking = db.bookings.find((b) => b.id === job.bookingId)
      if (!booking?.serviceTemplateId || !isFinished(job.status) || hours <= 0) continue
      add(`template:${booking.serviceTemplateId}`, hours)
      const vehicle = db.vehicles.find((v) => v.id === job.vehicleId)
      const model = vehicle ? findLibraryModel(vehicle, db.library) : undefined
      const profile = model && db.profiles.find((p) => p.templateId === booking.serviceTemplateId && p.modelId === model.id)
      if (profile) add(`profile:${profile.id}`, hours)
    }
    return Object.fromEntries([...sums].map(([key, v]) => [key, { samples: v.n, averageHours: v.total / v.n }]))
  })

// ---- Search, customers and vehicles ------------------------------------------------------

function vehicleDetail(db: Database, vehicleId: Id): VehicleDetail {
  const vehicle = db.vehicles.find((v) => v.id === vehicleId)
  if (!vehicle) throw new DataError('That vehicle could not be found.')
  const customer = db.customers.find((c) => c.id === vehicle.customerId)!
  const bookings = db.bookings.filter((b) => b.vehicleId === vehicleId).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const jobs = db.jobs.filter((j) => j.vehicleId === vehicleId)
  const now = nowIso()
  const past = bookings.filter((b) => isFinished(jobs.find((j) => j.id === b.jobId)!.status))
  return {
    vehicle, customer,
    lastVisit: past.at(-1)?.startAt,
    nextBooking: bookings.find((b) => b.startAt > now && !isFinished(jobs.find((j) => j.id === b.jobId)!.status)),
    currentJob: jobs.find((j) => ON_SITE.includes(j.status)),
  }
}

/** Rego first search across vehicles, customers and bookings. */
export const searchEverything = (query: string): Promise<Result<SearchHit[]>> =>
  read((db) => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const rego = normaliseRego(query)
    const digits = q.replace(/\D/g, '')
    const hits: SearchHit[] = []
    for (const v of db.vehicles) {
      const customer = db.customers.find((c) => c.id === v.customerId)!
      const match =
        v.registration.includes(rego) || v.vin?.toLowerCase().includes(q) ||
        `${v.make} ${v.model}`.toLowerCase().includes(q) || customer.name.toLowerCase().includes(q) ||
        (digits.length >= 4 && customer.mobile.replace(/\D/g, '').includes(digits))
      if (match) {
        hits.push({
          kind: 'vehicle', id: v.id, vehicle: v, to: `/vehicles/${v.id}`,
          title: `${v.year ?? ''} ${v.make} ${v.model}`.trim(), subtitle: customer.name,
        })
      }
    }
    for (const b of db.bookings) {
      const job = db.jobs.find((j) => j.id === b.jobId)!
      if (b.number.toLowerCase().includes(q) || job.number.toLowerCase().includes(q)) {
        const v = db.vehicles.find((x) => x.id === b.vehicleId)!
        hits.push({ kind: 'booking', id: b.id, vehicle: v, to: `/bookings/${b.id}`, title: `${b.number}, ${b.serviceName}`, subtitle: job.number })
      }
    }
    return hits.slice(0, 12)
  })

export const getVehicles = (query = ''): Promise<Result<VehicleDetail[]>> =>
  read((db) => {
    const q = query.trim().toLowerCase()
    const rego = normaliseRego(query)
    return db.vehicles
      .filter((v) => {
        if (!q) return true
        const c = db.customers.find((x) => x.id === v.customerId)!
        return v.registration.includes(rego) || `${v.make} ${v.model}`.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      })
      .map((v) => vehicleDetail(db, v.id))
  })

export const getVehicle = (vehicleId: Id): Promise<Result<VehicleDetail>> =>
  read((db) => vehicleDetail(db, vehicleId), [vehicleId])

export const getVehicleTimeline = (vehicleId: Id): Promise<Result<TimelineVisit[]>> =>
  read((db) =>
    db.bookings
      .filter((b) => b.vehicleId === vehicleId)
      .sort((a, b) => b.startAt.localeCompare(a.startAt))
      .map((booking) => ({
        booking, job: db.jobs.find((j) => j.id === booking.jobId)!, serviceName: booking.serviceName, day: dayKey(booking.startAt),
      })),
  )

// ---- Planning ----------------------------------------------------------------------------

const inRange = (b: Booking, fromDay: string, toDay: string) => {
  const d = dayKey(b.startAt)
  return d >= fromDay && d <= toDay
}

export const getSchedule = (fromDay: string, toDay: string): Promise<Result<ScheduledJob[]>> =>
  read((db) => db.bookings.filter((b) => inRange(b, fromDay, toDay)).map((b) => toScheduled(db, b)).sort(byStart))

function capacityFor(db: Database, days: string[]): CapacitySummary[] {
  return days.map((day) => dayCapacity(day, db.technicians, db.bookings, db.settings.dailyTargetHours))
}

export const getCapacity = (days: string[]): Promise<Result<CapacitySummary[]>> => read((db) => capacityFor(db, days))

export const findAvailability = (request: AvailabilityRequest): Promise<Result<AvailabilitySlot[]>> =>
  read((db) => findSlots(request, db.technicians, db.bays, db.bookings))

// ---- Bookings and job cards ------------------------------------------------------------------

export const getBookings = (): Promise<Result<ScheduledJob[]>> =>
  read((db) => db.bookings.map((b) => toScheduled(db, b)).sort((a, b) => byStart(b, a)))

/** Accepts a booking id or a job id. */
export async function getBooking(id: Id): Promise<Result<ScheduledJob>> {
  const known = getDb().bookings.find((b) => b.id === id || b.jobId === id)
  return read((db) => toScheduled(db, bookingOf(db, id)), known ? [known.id, known.jobId] : [])
}

export const getJobCard = getBooking

/** Today's vehicles plus anything on site or finished today. */
export const getWorkshopBoard = (day: string): Promise<Result<ScheduledJob[]>> =>
  read((db) =>
    db.bookings
      .map((b) => toScheduled(db, b))
      .filter((s) => {
        const d = dayKey(s.booking.startAt)
        // The day's vehicles, anything still on site, and anything finished today (even if booked for another day).
        return (
          (d === day && s.job.status !== 'CLOSED') ||
          ON_SITE.includes(s.job.status) ||
          (s.job.status !== 'CLOSED' && s.job.completedAt !== undefined && dayKey(s.job.completedAt) === day)
        )
      })
      .sort(byStart),
  )

export const getMyDay = (technicianId: Id, day: string): Promise<Result<ScheduledJob[]>> =>
  read((db) =>
    db.bookings
      .filter((b) => b.technicianIds.includes(technicianId) && dayKey(b.startAt) === day)
      .map((b) => toScheduled(db, b))
      .sort(byStart),
  )

export const getCompletedJobs = (technicianId: Id): Promise<Result<ScheduledJob[]>> =>
  read((db) =>
    db.bookings
      .filter((b) => b.technicianIds.includes(technicianId))
      .map((b) => toScheduled(db, b))
      .filter((s) => isFinished(s.job.status))
      .sort((a, b) => byStart(b, a))
      .slice(0, 20),
  )

// ---- Money -----------------------------------------------------------------------------------

export const getQuote = (jobId: Id): Promise<Result<Quote>> =>
  read((db) => {
    const job = db.jobs.find((j) => j.id === jobId)
    if (!job) throw new DataError('That job could not be found.')
    return {
      jobId, base: totalsOf(job, 'template'), additional: job.quoteLines, approved: totalsOf(job),
      awaitingCents: job.quoteLines
        .filter((l) => l.status === 'awaiting-customer' || l.status === 'draft')
        .reduce((s, l) => s + l.labourCents + l.partsCents, 0),
    }
  }, [jobId])

/** Read only. Invoices are raised in the back office system, never here. */
export const getInvoiceSummary = (jobId: Id): Promise<Result<InvoiceSummary>> =>
  read((db) => {
    const job = db.jobs.find((j) => j.id === jobId)
    if (!job) throw new DataError('That job could not be found.')
    const status = job.status === 'CLOSED' ? 'paid' : job.status === 'READY_FOR_CUSTOMER' ? 'sent' : 'not-invoiced'
    return {
      jobId, status, totals: totalsOf(job),
      number: status === 'not-invoiced' ? undefined : `INV-${job.number.slice(2)}`,
      issuedAt: status === 'not-invoiced' ? undefined : job.completedAt,
    }
  })

export const getActivity = (jobId: Id): Promise<Result<ActivityEvent[]>> =>
  read((db) => db.activity.filter((a) => a.jobId === jobId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)))

// ---- Summaries ---------------------------------------------------------------------------------

export const getTodaySummary = (day: string): Promise<Result<TodaySummary>> =>
  read((db) => {
    const all = db.bookings.map((b) => toScheduled(db, b))
    const today = all.filter((s) => dayKey(s.booking.startAt) === day)
    const live = all.filter((s) => {
      const d = dayKey(s.booking.startAt)
      return d === day || (d < day && ON_SITE.includes(s.job.status))
    })
    const count = (test: (s: ScheduledJob) => boolean) => live.filter(test).length
    const busy = new Set(live.filter((s) => s.job.status === 'IN_PROGRESS').flatMap((s) => s.booking.technicianIds))
    const capacity = dayCapacity(day, db.technicians, db.bookings, db.settings.dailyTargetHours)
    return {
      day, capacity,
      counts: {
        arriving: count((s) => ['BOOKED', 'CONFIRMED'].includes(s.job.status) && s.booking.technicianIds.length > 0),
        inProgress: count((s) => s.job.status === 'IN_PROGRESS'),
        approval: count((s) => needsApproval(s.job)),
        parts: count((s) => s.job.status === 'WAITING_PARTS'),
        blocked: count((s) => s.job.status === 'BLOCKED'),
        ready: count((s) => ['TECH_COMPLETE', 'QUALITY_CHECK', 'READY_FOR_CUSTOMER'].includes(s.job.status)),
        unassigned: today.filter((s) => s.booking.technicianIds.length === 0).length,
        atRisk: count((s) => s.atRisk),
      },
      needsAttention: live
        .filter((s) => s.atRisk || needsApproval(s.job) || ['WAITING_PARTS', 'BLOCKED'].includes(s.job.status) || s.booking.technicianIds.length === 0)
        .sort(byStart),
      technicians: db.technicians,
      idleTechnicians: db.technicians.filter(
        (t) => !busy.has(t.id) && (capacity.byTechnician.find((c) => c.technicianId === t.id)?.availableHours ?? 0) > 0,
      ),
    }
  })

export const getUtilisationReport = (): Promise<Result<UtilisationReport>> =>
  read((db) => {
    const today = workingToday()
    const dayKeys = [-1, 0, 1, 2, 3].map((n) => (n === 0 ? today : addWorkingDays(today, n)))
    const days = capacityFor(db, dayKeys)
    const finished = db.jobs.filter((j) => j.completedAt && dayKeys.includes(dayKey(j.completedAt)))
    const waits = db.jobs.flatMap((j) => j.quoteLines).filter((l) => l.sentAt)
      .map((l) => minutesBetween(l.sentAt!, l.decidedAt ?? nowIso()))
    return {
      days,
      technicians: db.technicians.map((technician) => {
        const mine = days.map((d) => d.byTechnician.find((c) => c.technicianId === technician.id)!)
        const availableHours = mine.reduce((s, c) => s + c.availableHours, 0)
        const bookedHours = mine.reduce((s, c) => s + c.bookedHours, 0)
        const clockedHours = db.jobs.flatMap((j) => j.timeEntries)
          .filter((t) => t.technicianId === technician.id && dayKeys.includes(dayKey(t.startedAt)))
          .reduce((s, t) => s + minutesBetween(t.startedAt, t.endedAt ?? nowIso()) / 60, 0)
        return { technician, availableHours, bookedHours, clockedHours, utilisation: availableHours ? bookedHours / availableHours : 0 }
      }),
      completedOnTime: finished.filter((j) => j.completedAt! <= j.promisedAt).length,
      completedLate: finished.filter((j) => j.completedAt! > j.promisedAt).length,
      averageApprovalWaitMinutes: waits.length ? waits.reduce((s, w) => s + w, 0) / waits.length : 0,
    }
  })

// ---- Integration diagnostics ----------------------------------------------------------------------

export const getSyncLog = (): Promise<Result<{ entries: SyncLogEntry[]; settings: MockSettings }>> =>
  read((db) => ({ entries: [...db.outbox].reverse(), settings: getSettings() }))
