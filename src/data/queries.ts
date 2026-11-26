/**
 * Read side of the data layer. Each function is named for a business question.
 * Phase 1 answers from mock data. docs/supabase-handover.md says what each becomes.
 */
import { dayAvailability, dayCapacity, findDays, monthAvailability, nextSlotFor, technicianCapacity } from '@/lib/capacity'
import { suggestServices } from '@/lib/service-suggestions'
import { addDays, addWorkingDays, dayKey, gstOf, minutesBetween, normaliseRego, nowIso, workingToday } from '@/lib/format'
import { CLOSE_OUT, ON_SITE, isFinished } from '@/lib/job-state'
import { matchesItem, partRisk, partsLeadTime, priceItemLines } from '@/lib/item-lines'
import { findLibraryModel, resolveServicePlan } from '@/lib/service-profiles'
import type {ActivityEvent, AssignOption, AssignPlan, AvailabilityRequest, Bay, Booking, BookingCandidate, BookingEstimate, BookingExtra, BookingHistory, BookingItem, CapacitySummary, CatalogueItem, DayAvailability, DuplicateMatch, Id, InvoiceSummary, JobCard, PartOrderRow, Quote, Result, RolePermissions, ScheduledJob, SearchHit, ServiceActual, ServicePlan, ServiceProfile, ServiceSuggestion, ServiceTemplate, StaffUser, SyncLogEntry, Technician, TimelineVisit, TodaySummary, Totals, UpsellItem, UtilisationReport, VehicleDetail, VehicleModel, WorkshopSettings} from '@/types'
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

// ---- Booking screen ------------------------------------------------------------------------

const digitsOf = (s: string) => s.replace(/\D/g, '')

function lastVisitOf(db: Database, customerId: Id) {
  return db.bookings
    .filter((b) => b.customerId === customerId && isFinished(db.jobs.find((j) => j.id === b.jobId)!.status))
    .map((b) => b.startAt)
    .sort()
    .at(-1)
}

/** Customers matching a rego, name, mobile or email, each with every vehicle they own. */
export const findBookingCustomers = (query: string): Promise<Result<BookingCandidate[]>> =>
  read((db) => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const rego = normaliseRego(query)
    const digits = digitsOf(q)
    const out: BookingCandidate[] = []
    for (const customer of db.customers) {
      const vehicles = db.vehicles.filter((v) => v.customerId === customer.id)
      const regoHit = rego.length >= 2 ? vehicles.find((v) => v.registration.includes(rego)) : undefined
      const matchedOn: BookingCandidate['matchedOn'] | undefined =
        regoHit ? 'rego'
        : digits.length >= 4 && digitsOf(customer.mobile).includes(digits) ? 'mobile'
        : customer.name.toLowerCase().includes(q) ? 'name'
        : q.includes('@') && customer.email?.toLowerCase().includes(q) ? 'email'
        : undefined
      if (matchedOn) out.push({ customer, vehicles, matchedOn, matchedVehicleId: regoHit?.id, lastVisit: lastVisitOf(db, customer.id) })
    }
    const rank = { rego: 0, mobile: 1, email: 2, name: 3 }
    return out.sort((a, b) => rank[a.matchedOn] - rank[b.matchedOn] || a.customer.name.localeCompare(b.customer.name)).slice(0, 8)
  })

/** One customer with every vehicle they own, for the booking screen. */
export const getBookingCustomer = (customerId: Id): Promise<Result<Omit<BookingCandidate, 'matchedOn'>>> =>
  read((db) => {
    const customer = db.customers.find((c) => c.id === customerId)
    if (!customer) throw new DataError('That customer could not be found.')
    return { customer, vehicles: db.vehicles.filter((v) => v.customerId === customerId), lastVisit: lastVisitOf(db, customerId) }
  }, [customerId])

/** Existing customers who look like the one being added: same mobile, email or rego, or the same name. */
export const findDuplicateCustomers = (input: {
  name?: string; mobile?: string; email?: string; registration?: string
}): Promise<Result<DuplicateMatch[]>> =>
  read((db) => {
    const mobile = digitsOf(input.mobile ?? '')
    const email = input.email?.trim().toLowerCase() ?? ''
    const name = input.name?.trim().toLowerCase() ?? ''
    const rego = normaliseRego(input.registration ?? '')
    const out: DuplicateMatch[] = []
    for (const customer of db.customers) {
      const vehicles = db.vehicles.filter((v) => v.customerId === customer.id)
      const reasons: string[] = []
      if (mobile.length >= 8 && digitsOf(customer.mobile) === mobile) reasons.push('Same mobile')
      if (email.includes('@') && customer.email?.toLowerCase() === email) reasons.push('Same email')
      if (rego.length >= 3 && vehicles.some((v) => v.registration === rego)) reasons.push(`Owns ${rego}`)
      if (name.length >= 4 && customer.name.toLowerCase() === name) reasons.push('Same name')
      if (reasons.length) out.push({ customer, vehicles, reasons })
    }
    return out
  })

/** Past visits, newest first, and work the customer was told about but did not go ahead with. */
export const getBookingHistory = (vehicleId: Id): Promise<Result<BookingHistory>> =>
  read((db) => {
    const visits = db.bookings
      .filter((b) => b.vehicleId === vehicleId)
      .map((booking) => ({ booking, job: db.jobs.find((j) => j.id === booking.jobId)!, serviceName: booking.serviceName, day: dayKey(booking.startAt) }))
      .filter((v) => isFinished(v.job.status))
      .sort((a, b) => b.day.localeCompare(a.day))
    const rate = db.settings.labourRateCents
    const upsell: UpsellItem[] = []
    for (const { job, day } of visits) {
      for (const line of job.quoteLines) {
        if (line.status === 'approved') continue
        const finding = job.findings.find((f) => f.id === line.findingId)
        upsell.push({
          id: line.id, jobId: job.id, day, description: line.description, severity: finding?.severity,
          kind: line.status === 'declined' ? 'declined' : 'not-answered',
          labourHours: line.labourHours, labourCents: line.labourCents, partsCents: line.partsCents,
        })
      }
      for (const finding of job.findings) {
        if (job.quoteLines.some((l) => l.findingId === finding.id) || finding.approvalStatus === 'approved') continue
        const hours = finding.extraLabourHours ?? 0.5
        upsell.push({
          id: finding.id, jobId: job.id, day, description: finding.suggestedAction ?? finding.title, severity: finding.severity,
          kind: finding.severity === 'monitor' ? 'monitor' : 'not-quoted',
          labourHours: hours, labourCents: Math.round(hours * rate), partsCents: 0,
        })
      }
    }
    return { visits, upsell }
  }, [vehicleId])

/** Scheduled services that suit this vehicle at this odometer reading. */
export const getServiceSuggestions = (vehicleId: Id, odometerKm?: number): Promise<Result<ServiceSuggestion[]>> =>
  read((db) => {
    const vehicle = db.vehicles.find((v) => v.id === vehicleId)
    if (!vehicle) throw new DataError('That vehicle could not be found.')
    return suggestServices(db.templates, { ...vehicle, odometerKm: odometerKm ?? vehicle.odometerKm }, db.library, db.profiles, db.settings.labourRateCents)
  })

/** Hours, skills and price for the chosen services and extras on this vehicle. */
export const getBookingEstimate = (
  vehicleId: Id, templateIds: Id[], extras: BookingExtra[], items: BookingItem[] = [],
): Promise<Result<BookingEstimate>> =>
  read((db) => {
    const vehicle = db.vehicles.find((v) => v.id === vehicleId)
    const rate = db.settings.labourRateCents
    const plans = templateIds
      .map((id) => db.templates.find((t) => t.id === id))
      .filter((t): t is ServiceTemplate => Boolean(t))
      .map((t) => resolveServicePlan(t, vehicle, db.library, db.profiles, rate))
    // Items carry their own price, as on the back office: labour items have their own hourly rate.
    const lines = priceItemLines(items, db.items)
    const serviceHours = plans.reduce((s, p) => s + p.template.labourHours, 0) + extras.reduce((s, e) => s + e.labourHours, 0)
    const labourHours = serviceHours + lines.labourHours
    const labourCents = Math.round(serviceHours * rate) + lines.labourCents
    const partsCents =
      plans.reduce((s, p) => s + p.template.parts.reduce((x, part) => x + part.qty * part.unitCents, 0), 0) +
      extras.reduce((s, e) => s + e.partsCents, 0) +
      lines.partsCents
    const subtotalCents = labourCents + partsCents
    const gstCents = gstOf(subtotalCents)
    const bayTypes = plans.map((p) => p.template.bayType)
    return {
      labourHours, labourCents, partsCents, subtotalCents, gstCents, totalCents: subtotalCents + gstCents,
      skills: [...new Set([...plans.map((p) => p.template.skill), ...lines.skills])],
      bayType: bayTypes.includes('hoist') || !bayTypes.length ? 'hoist' : bayTypes[0]!,
      profileNames: plans.filter((p) => p.source === 'profile').map((p) => p.template.name),
      ...partsLeadTime(items, db.items),
    }
  })

/** The whole items list, for Admin. */
const KIND_ORDER = { part: 0, labour: 1, charge: 2 }

/** The whole items list: parts, then labour, then charges, each by class and name. */
export const getItems = (): Promise<Result<CatalogueItem[]>> =>
  read((db) => [...db.items].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))

/** Parts, labour and charges matching a search on code, name or class, at most 12. */
export const searchItems = (query: string): Promise<Result<CatalogueItem[]>> =>
  read((db) => {
    // An exact part number first, then parts (they bring their fitting labour), then labour and charges.
    const bare = (s: string) => s.replace(/[\s-]+/g, '').toLowerCase()
    const exact = (i: CatalogueItem) => (bare(i.code) === bare(query) ? 0 : 1)
    return db.items
      .filter((i) => i.active && matchesItem(i, query))
      .sort((a, b) => exact(a) - exact(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name))
      .slice(0, 12)
  })

/** Each day of a month: can the workshop fit this work in? Month is YYYY-MM. */
export const getMonthAvailability = (request: AvailabilityRequest, month: string): Promise<Result<DayAvailability[]>> =>
  read((db) => monthAvailability(request, month, db.technicians, db.bookings))

/** Every opening on one day for this work. */
export const getDayAvailability = (request: AvailabilityRequest, day: string): Promise<Result<DayAvailability>> =>
  read((db) => dayAvailability(request, day, db.technicians, db.bookings))

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

export const findAvailability = (request: AvailabilityRequest): Promise<Result<DayAvailability[]>> =>
  read((db) => findDays(request, db.technicians, db.bookings))

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
          // Still here until paid, whatever day it was booked.
          CLOSE_OUT.includes(s.job.status) ||
          (s.job.status !== 'CLOSED' && s.job.completedAt !== undefined && dayKey(s.job.completedAt) === day)
        )
      })
      .sort(byStart),
  )

/**
 * A mechanic's next free time for the work: a clean slot today, otherwise the first clean slot on the next
 * working days (late in the day or when they are off), otherwise today's free time with its warning.
 */
function nextFreeSlot(...args: Parameters<typeof nextSlotFor>): ReturnType<typeof nextSlotFor> {
  const [tech, day, ...rest] = args
  const today = nextSlotFor(tech, day, ...rest)
  if (today.slot && !today.issue) return today
  for (let i = 1, d = addWorkingDays(day, 1); i <= 10; i++, d = addWorkingDays(d, 1)) {
    const later = nextSlotFor(tech, d, ...rest)
    if (later.slot && !later.issue) return later
  }
  return today
}

/**
 * Every mechanic as a choice for an arrived vehicle: their work that day, how full they are and
 * their next free time that suits this job. Clean slots first, earliest first.
 */
export const getAssignPlan = (jobId: Id, day: string): Promise<Result<AssignPlan>> =>
  read((db) => {
    const booking = bookingOf(db, jobId)
    const job = toScheduled(db, booking)
    const template = db.templates.find((t) => t.id === booking.serviceTemplateId)
    const others = db.bookings.filter((b) => b.id !== booking.id)
    const rank = (o: AssignOption) => (o.issue === 'off' ? 3 : o.issue === 'no-room' ? 2 : o.issue ? 1 : 0)
    const options = db.technicians
      .filter((t) => t.active)
      .map((technician): AssignOption => ({
        technician,
        capacity: technicianCapacity(technician, day, others),
        jobs: others
          .filter((b) => b.technicianIds.includes(technician.id) && dayKey(b.startAt) === day)
          .map((b) => toScheduled(db, b))
          .sort(byStart),
        ...nextFreeSlot(technician, day, booking.estimatedLabourHours, template?.bayType, db.bays, others),
        missingSkills: template && !technician.skills.includes(template.skill) ? [template.skill] : [],
        planned: booking.technicianIds.includes(technician.id),
      }))
      .sort((a, b) => rank(a) - rank(b) || (a.slot?.startAt ?? '').localeCompare(b.slot?.startAt ?? '') || a.technician.name.localeCompare(b.technician.name))
    return { job, day, options }
  }, [jobId])

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
        arriving: count((s) => ['BOOKED', 'CONFIRMED'].includes(s.job.status)),
        inProgress: count((s) => s.job.status === 'IN_PROGRESS'),
        approval: count((s) => needsApproval(s.job)),
        parts: count((s) => s.job.status === 'WAITING_PARTS'),
        blocked: count((s) => s.job.status === 'BLOCKED'),
        ready: count((s) => CLOSE_OUT.includes(s.job.status)),
        unassigned: live.filter((s) => s.job.status === 'CHECKED_IN' && s.booking.technicianIds.length === 0).length,
        atRisk: count((s) => s.atRisk),
      },
      needsAttention: live
        .filter((s) => s.atRisk || needsApproval(s.job) || ['WAITING_PARTS', 'BLOCKED'].includes(s.job.status) || (s.job.status === 'CHECKED_IN' && s.booking.technicianIds.length === 0))
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

/** Every specialist part order still open, plus those received in the last week, soonest booking first. */
export const getPartOrders = (): Promise<Result<PartOrderRow[]>> =>
  read((db) => {
    const today = dayKey()
    const weekAgo = addDays(today, -7)
    return db.partOrders
      .filter((o) => o.status !== 'received' || (o.receivedAt && dayKey(o.receivedAt) >= weekAgo))
      .map((order) => {
        const booking = db.bookings.find((b) => b.id === order.bookingId)!
        const vehicle = db.vehicles.find((v) => v.id === booking.vehicleId)!
        const customer = db.customers.find((c) => c.id === vehicle.customerId)!
        return { order, risk: partRisk(order, today), booking, vehicle, customer }
      })
      .sort((a, b) => a.order.orderBy.localeCompare(b.order.orderBy) || a.order.neededBy.localeCompare(b.order.neededBy))
  })

/** Part orders for one job, for the booking page. */
export const getJobPartOrders = (jobId: Id): Promise<Result<PartOrderRow[]>> =>
  getPartOrders().then((r) => ({ ...r, data: r.data.filter((x) => x.order.jobId === jobId) }))
