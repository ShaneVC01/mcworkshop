/**
 * Write side of the data layer. Each function is named for a business action.
 * Every action saves locally, writes an activity event and queues an outbox entry.
 * Nothing here sends anything to NetSuite. See docs/supabase-handover.md.
 */
import { ADMIN_ONLY, defaultRolePermissions } from '@/auth/default-permissions'
import { getSession } from '@/auth/session'
import { dayAvailability, endAtFor, findConflicts, freeBay, startOutsideBreaks, workshopRules } from '@/lib/capacity'
import { addMinutes, addWorkingDays, at, dayKey, formatDayShort, formatHours, formatTime, fromMinutes, minutesBetween, minutesOfDay, normaliseRego, nowIso } from '@/lib/format'
import { JOB_STATUS_LABEL, canTransition, closeOutChecks, isFinished } from '@/lib/job-state'
import { partsLeadTime, priceItemLines } from '@/lib/item-lines'
import { resolveServicePlan } from '@/lib/service-profiles'
import type { Action, Bay, Booking, BookingExtra, BookingItem, BookingType, ChecklistItem, ChecklistTemplateItem, ClosedDay, Customer, Finding, FindingSeverity, Id, JobCard, JobStatus, PartOrder, QuoteLine, RegoState, Result, Role, ServiceProfile, ServiceTemplate, Skill, StaffUser, TemplatePart, Vehicle, VehicleModel, WorkshopSettings } from '@/types'
import { buildJobParts, type Database } from './mock/seed'
import {
  DataError, resetDemoData, retryOutboxEntry, setSimulateErrors, write, writeConfig, type WriteContext,
} from './mock/store'

const pending = { status: 'pending' as const }

function jobOf(db: Database, jobId: Id): JobCard {
  const job = db.jobs.find((j) => j.id === jobId)
  if (!job) throw new DataError('That job could not be found.')
  return job
}

function bookingFor(db: Database, id: Id): Booking {
  const booking = db.bookings.find((b) => b.id === id || b.jobId === id)
  if (!booking) throw new DataError('That booking could not be found.')
  return booking
}

function regoOf(db: Database, vehicleId: Id) {
  return db.vehicles.find((v) => v.id === vehicleId)?.registration ?? ''
}

function setStatus(ctx: WriteContext, job: JobCard, status: JobStatus) {
  if (job.status === status) return
  if (!canTransition(job.status, status)) {
    throw new DataError(`A job cannot go from ${JOB_STATUS_LABEL[job.status]} to ${JOB_STATUS_LABEL[status]}.`)
  }
  const from = job.status
  job.status = status
  ctx.log(job.id, 'job.status_changed', `${JOB_STATUS_LABEL[from]} to ${JOB_STATUS_LABEL[status]}`, { from, to: status })
}

function assertNoConflict(db: Database, proposal: Parameters<typeof findConflicts>[0], override?: boolean) {
  const conflicts = findConflicts(proposal, db.technicians, db.bays, db.bookings)
  const hard = conflicts.find((c) => c.hard)
  if (hard) throw new DataError(hard.message)
  if (conflicts.length && !override) throw new DataError(conflicts[0]!.message)
}

// ---- Customers and vehicles -----------------------------------------------------------------

type CustomerInput = { name: string; mobile: string; email?: string; address?: string; postcode?: string }

const digitsOf = (s: string) => s.replace(/\D/g, '')

/** One customer per mobile and per email, so the back office never gets two records for one person. */
function assertNotDuplicate(db: Database, input: Partial<CustomerInput>, ignoreId?: Id) {
  const others = db.customers.filter((c) => c.id !== ignoreId)
  const mobile = digitsOf(input.mobile ?? '')
  const sameMobile = mobile && others.find((c) => digitsOf(c.mobile) === mobile)
  if (sameMobile) throw new DataError(`${input.mobile} already belongs to ${sameMobile.name}. Use that customer instead.`)
  const email = input.email?.trim().toLowerCase()
  const sameEmail = email && others.find((c) => c.email?.toLowerCase() === email)
  if (sameEmail) throw new DataError(`${input.email} already belongs to ${sameEmail.name}. Use that customer instead.`)
}

export const createCustomer = (input: CustomerInput): Promise<Result<Customer>> =>
  write('customer.create', `New customer ${input.name}`, (c) => c.id, (ctx) => {
    assertNotDuplicate(ctx.db, input)
    const customer: Customer = { id: `c${ctx.id()}`, ...input, sync: pending }
    ctx.db.customers.push(customer)
    return customer
  })

/** Quick edits from the booking screen: mobile, email and address. */
export const updateCustomer = (customerId: Id, patch: Partial<CustomerInput>): Promise<Result<Customer>> =>
  write('customer.update', 'Customer details updated', customerId, (ctx) => {
    const customer = ctx.db.customers.find((c) => c.id === customerId)
    if (!customer) throw new DataError('That customer could not be found.')
    if (patch.name !== undefined && !patch.name.trim()) throw new DataError('The customer needs a name.')
    if (patch.mobile !== undefined && digitsOf(patch.mobile).length < 8) throw new DataError('Enter a full mobile number.')
    assertNotDuplicate(ctx.db, patch, customerId)
    Object.assign(customer, patch, { sync: pending })
    return customer
  })

export const createVehicle = (input: {
  registration: string; registrationState: RegoState; make: string; model: string; year?: number; odometerKm?: number; customerId: Id
}): Promise<Result<Vehicle>> =>
  write('vehicle.create', `New vehicle ${normaliseRego(input.registration)}`, (v) => v.id, (ctx) => {
    const registration = normaliseRego(input.registration)
    if (ctx.db.vehicles.some((v) => v.registration === registration)) {
      throw new DataError(`${registration} is already on file. Search for it instead.`)
    }
    const vehicle: Vehicle = { id: `v${ctx.id()}`, ...input, registration, sync: pending }
    ctx.db.vehicles.push(vehicle)
    return vehicle
  })

// ---- Bookings ---------------------------------------------------------------------------------

export interface CreateBookingInput {
  vehicleId: Id
  /** Catalogue services, first one leads. `label` replaces the service name, for example "150,000 km service". */
  services: { templateId: Id; label?: string }[]
  /** Work that is not a catalogue service, for example a quote the customer declined last time. */
  extras?: BookingExtra[]
  /** One off parts, labour and charges from the items list. Labour quantities are hours. */
  items?: BookingItem[]
  /** Service is the default. Repair only jobs do not get service reminders. */
  bookingType?: BookingType
  customerConcern: string
  /** Drop off time. The workshop assigns a mechanic and bay when the vehicle arrives. */
  startAt: string
  tentative?: boolean
  /** The reading given at booking. Saved to the vehicle when it is higher than the one on file. */
  odometerKm?: number
  /** Only controllers, managers and administrators may override a double booking warning. */
  override?: boolean
}

export const createBooking = (input: CreateBookingInput): Promise<Result<Booking>> =>
  write('booking.create', 'New booking', (b) => b.id, (ctx) => {
    const { db } = ctx
    const vehicle = db.vehicles.find((v) => v.id === input.vehicleId)
    const chosen = input.services
      .map((s) => ({ ...s, base: db.templates.find((t) => t.id === s.templateId) }))
      .filter((s): s is typeof s & { base: ServiceTemplate } => Boolean(s.base))
    const extras = input.extras ?? []
    const lines = priceItemLines(input.items ?? [], db.items)
    if (!vehicle || (!chosen.length && !extras.length && !lines.priced.length)) throw new DataError('Choose a vehicle and the work first.')
    const rate = db.settings.labourRateCents
    // The vehicle's own profile wins over the generic template when there is one.
    const plans = chosen.map((s) => ({ ...s, plan: resolveServicePlan(s.base, vehicle, db.library, db.profiles, rate) }))
    // Fitting labour and charges are part of something else, so they do not name the booking.
    const itemNames = lines.priced.filter((p) => !p.line.forItemId && p.item.kind !== 'charge').map((p) => p.item.name)
    const allNames = [...plans.map((p) => p.label ?? p.plan.template.name), ...extras.map((e) => e.description), ...itemNames]
    const names = allNames.length > 3 ? [...allNames.slice(0, 3), `plus ${allNames.length - 3} more`] : allNames
    const hours = plans.reduce((s, p) => s + p.plan.template.labourHours, 0) + extras.reduce((s, e) => s + e.labourHours, 0) + lines.labourHours

    const endAt = addMinutes(input.startAt, hours * 60)
    const technicianIds: Id[] = []
    const bayId = undefined
    const day = dayKey(input.startAt)
    // Ordered in parts must be here first. This cannot be overridden.
    const { orderedParts, partsReadyDay } = partsLeadTime(input.items ?? [], db.items)
    if (partsReadyDay && day < partsReadyDay) {
      throw new DataError(`${orderedParts[0]!.name} takes ${orderedParts[0]!.leadTimeDays} working days to arrive. Book on or after ${formatDayShort(partsReadyDay)}.`)
    }
    // Booked on the whole workshop's hours. The day must have room unless someone allowed to overrides it.
    const room = dayAvailability({ labourHours: hours, fromDay: day }, day, db.technicians, db.bookings)
    if (room.status === 'closed' || room.status === 'past') throw new DataError('The workshop is not taking bookings that day.')
    if (room.freeHours + 1e-6 < hours && !input.override) {
      throw new DataError(`${formatDayShort(day)} is full: ${formatHours(Math.max(0, room.freeHours))} free and this work needs ${formatHours(hours)}.`)
    }

    if (input.odometerKm && input.odometerKm > (vehicle.odometerKm ?? 0)) {
      vehicle.odometerKm = input.odometerKm
      vehicle.sync = pending
    }

    const parts = plans.map((p) => buildJobParts({ ...p.plan.template, name: p.label ?? p.plan.template.name }, ctx.id, rate))
    const n = ++db.counters.booking
    const serviceName = names.join(', ')
    const job: JobCard = {
      id: `j${n}`, number: `J-${n}`, division: plans[0]?.plan.template.division ?? 'servicing', bookingId: `b${n}`,
      vehicleId: vehicle.id, customerId: vehicle.customerId, status: input.tentative ? 'BOOKED' : 'CONFIRMED',
      customerConcern: input.customerConcern.trim() || `${serviceName} as booked.`,
      labour: [
        ...parts.flatMap((p) => p.labour),
        ...extras.map((e) => ({ id: ctx.id(), description: e.description, hours: e.labourHours, rateCents: rate, source: 'template' as const, done: false })),
        // Labour from the items list keeps its own rate, as it does on the back office.
        ...lines.priced.filter((p) => p.item.kind === 'labour').map((p) => {
          const forPart = p.line.forItemId ? db.items.find((i) => i.id === p.line.forItemId) : undefined
          const description = forPart && !p.item.standardHours ? `Fit ${forPart.name.charAt(0).toLowerCase()}${forPart.name.slice(1)}` : p.item.name
          return { id: ctx.id(), description, hours: p.line.qty, rateCents: p.item.unitCents, source: 'template' as const, itemId: p.item.id, done: false }
        }),
      ],
      parts: [
        ...parts.flatMap((p) => p.parts),
        ...extras.filter((e) => e.partsCents).map((e) => ({
          id: ctx.id(), name: `Parts for ${e.description.toLowerCase()}`, qty: 1, unitCents: e.partsCents, source: 'template' as const, used: false,
        })),
        ...lines.priced.filter((p) => p.item.kind !== 'labour').map((p) => ({
          id: ctx.id(), name: `${p.item.name} (${p.item.code})`, qty: p.line.qty, unitCents: p.item.unitCents, source: 'template' as const, itemId: p.item.id, used: false,
        })),
      ],
      checklist: parts.flatMap((p) => p.checklist),
      findings: [], quoteLines: [], timeEntries: [], notes: [],
      promisedAt: addMinutes(endAt, 60), sync: pending,
    }
    const booking: Booking = {
      id: `b${n}`, number: `B-${n}`, division: job.division, jobId: job.id, vehicleId: vehicle.id,
      customerId: vehicle.customerId, technicianIds, bayId, startAt: input.startAt, endAt,
      estimatedLabourHours: hours, serviceTemplateId: chosen[0]?.base.id, serviceName, bookingType: input.bookingType ?? 'service',
      tentative: Boolean(input.tentative), readiness: job.parts.length ? 'ready' : 'unknown', sync: pending,
    }
    db.jobs.push(job)
    db.bookings.push(booking)
    // Specialist parts get an order to place, due back by the booking day.
    for (const p of lines.priced.filter((x) => x.item.kind === 'part' && x.item.stocked === false && x.item.leadTimeDays)) {
      db.partOrders.push({
        id: ctx.id(), jobId: job.id, bookingId: booking.id, itemId: p.item.id, code: p.item.code, name: p.item.name, qty: p.line.qty,
        leadTimeDays: p.item.leadTimeDays!, status: 'to-order', orderBy: addWorkingDays(day, -p.item.leadTimeDays!), neededBy: day, sync: pending,
      })
    }
    ctx.log(job.id, 'booking.created', `Booked ${serviceName} for ${formatDayShort(dayKey(booking.startAt))} at ${formatTime(booking.startAt)}`, {
      registration: vehicle.registration, source: plans.some((p) => p.plan.source === 'profile') ? 'profile' : 'generic',
      bookingType: booking.bookingType,
      fromEarlierQuotes: extras.map((e) => e.sourceId).filter(Boolean),
      items: lines.priced.map((p) => ({ code: p.item.code, qty: p.line.qty })),
    })
    return booking
  })

export interface ReschedulePatch {
  startAt?: string
  /** null unassigns the booking. */
  technicianId?: Id | null
  durationHours?: number
  override?: boolean
}

/** Move in time, move between technicians, resize or unassign. One direct action, no forms. */
export const rescheduleBooking = (bookingId: Id, patch: ReschedulePatch): Promise<Result<Booking>> =>
  write('booking.reschedule', 'Booking moved', bookingId, (ctx) => {
    const { db } = ctx
    const booking = bookingFor(db, bookingId)
    const job = jobOf(db, booking.jobId)
    if (isFinished(job.status)) throw new DataError('A finished job cannot be moved.')
    const startAt = patch.startAt ?? booking.startAt
    const hours = patch.durationHours ?? booking.estimatedLabourHours
    const endAt = addMinutes(startAt, hours * 60)
    const technicianIds = patch.technicianId === undefined ? booking.technicianIds : patch.technicianId ? [patch.technicianId] : []
    const template = db.templates.find((t) => t.id === booking.serviceTemplateId)
    const span: [number, number] = [minutesOfDay(startAt), minutesOfDay(endAt)]
    const bayStillFree = booking.bayId && !findConflicts({ id: booking.id, startAt, endAt, technicianIds: technicianIds.length ? ['-'] : [], bayId: booking.bayId }, db.technicians, db.bays, db.bookings).length
    const bayId = !technicianIds.length ? undefined : bayStillFree ? booking.bayId : (freeBay(db.bays, db.bookings, dayKey(startAt), span, template?.bayType, booking.id)?.id ?? booking.bayId)
    assertNoConflict(db, { id: booking.id, startAt, endAt, technicianIds, bayId }, patch.override)

    const techChanged = technicianIds.join() !== booking.technicianIds.join()
    const timeChanged = startAt !== booking.startAt || hours !== booking.estimatedLabourHours
    Object.assign(booking, { startAt, endAt, technicianIds, bayId, estimatedLabourHours: hours, sync: pending })
    job.promisedAt = addMinutes(endAt, 60)
    if (techChanged) {
      const name = db.technicians.find((t) => t.id === technicianIds[0])?.name
      ctx.log(job.id, 'technician.assigned', name ? `Assigned to ${name}` : 'Moved to unassigned', { technicianIds })
    }
    if (timeChanged) {
      ctx.log(job.id, 'booking.rescheduled', `Moved to ${formatDayShort(dayKey(startAt))} at ${formatTime(startAt)}, ${hours} h`, { startAt, hours })
    }
    return booking
  })

export const confirmBooking = (bookingId: Id): Promise<Result<Booking>> =>
  write('booking.confirm', 'Booking confirmed', bookingId, (ctx) => {
    const booking = bookingFor(ctx.db, bookingId)
    booking.tentative = false
    setStatus(ctx, jobOf(ctx.db, booking.jobId), 'CONFIRMED')
    return booking
  })

export const cancelBooking = (bookingId: Id): Promise<Result<{ id: Id }>> =>
  write('booking.cancel', 'Booking cancelled', bookingId, (ctx) => {
    const { db } = ctx
    const booking = bookingFor(db, bookingId)
    const job = jobOf(db, booking.jobId)
    if (!['BOOKED', 'CONFIRMED'].includes(job.status)) throw new DataError('Only a booking that has not arrived can be cancelled.')
    ctx.log(job.id, 'booking.cancelled', `Cancelled ${booking.number}`, { registration: regoOf(db, booking.vehicleId) })
    db.bookings = db.bookings.filter((b) => b.id !== booking.id)
    db.jobs = db.jobs.filter((j) => j.id !== job.id)
    return { id: booking.id }
  })

// ---- Job flow -----------------------------------------------------------------------------------

/** "Vehicle arrived": the vehicle is on site and waits for the workshop controller to assign it. */
export const checkInVehicle = (jobId: Id, odometerKm?: number): Promise<Result<JobCard>> =>
  write('job.check-in', 'Vehicle arrived', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    setStatus(ctx, job, 'CHECKED_IN')
    const vehicle = ctx.db.vehicles.find((v) => v.id === job.vehicleId)
    if (vehicle && odometerKm) vehicle.odometerKm = odometerKm
    bookingFor(ctx.db, jobId).tentative = false
    ctx.log(job.id, 'vehicle.checked_in', `${vehicle?.registration ?? 'Vehicle'} arrived`, { odometerKm })
    return job
  })

/**
 * Gives an arrived vehicle to a mechanic at a time on their day, usually their next free slot.
 * Also used to reassign. Hard clashes (leave, sick) always stop it. Soft ones (overlap, past the shift)
 * need `override`, which only controllers, managers and administrators are offered.
 */
export const assignMechanic = (jobId: Id, technicianId: Id, startAt: string, override?: boolean): Promise<Result<Booking>> =>
  write('job.assign', 'Mechanic assigned', jobId, (ctx) => {
    const { db } = ctx
    const booking = bookingFor(db, jobId)
    const job = jobOf(db, booking.jobId)
    if (!['CHECKED_IN', 'READY_FOR_WORK'].includes(job.status)) {
      throw new DataError(`Only an arrived vehicle can be assigned. This one is ${JOB_STATUS_LABEL[job.status].toLowerCase()}.`)
    }
    const tech = db.technicians.find((t) => t.id === technicianId && t.active)
    if (!tech) throw new DataError('That mechanic could not be found.')
    const endAt = endAtFor(startAt, booking.estimatedLabourHours)
    const template = db.templates.find((t) => t.id === booking.serviceTemplateId)
    const span: [number, number] = [minutesOfDay(startAt), minutesOfDay(endAt)]
    const bayId = freeBay(db.bays, db.bookings, dayKey(startAt), span, template?.bayType, booking.id)?.id ?? booking.bayId
    assertNoConflict(db, { id: booking.id, startAt, endAt, technicianIds: [tech.id], bayId }, override)

    const reassigned = job.status === 'READY_FOR_WORK'
    Object.assign(booking, { technicianIds: [tech.id], startAt, endAt, bayId, sync: pending })
    job.promisedAt = addMinutes(endAt, 60)
    setStatus(ctx, job, 'READY_FOR_WORK')
    ctx.log(job.id, 'technician.assigned', `${reassigned ? 'Reassigned' : 'Assigned'} to ${tech.name}, ${formatDayShort(dayKey(startAt))} ${formatTime(startAt)} to ${formatTime(endAt)}`, {
      technicianIds: [tech.id], startAt, override: Boolean(override),
    })
    return booking
  })

export const moveJobStatus = (jobId: Id, status: JobStatus, detail?: { reason?: string; partsEta?: string }): Promise<Result<JobCard>> =>
  write('job.status', `Status: ${JOB_STATUS_LABEL[status]}`, jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (status === 'READY_FOR_WORK' && job.status === 'CHECKED_IN') {
      throw new DataError('Use Assign to give the vehicle to a mechanic.')
    }
    // Keep time honest: holding a job stops the clock.
    if (status !== 'IN_PROGRESS') closeOpenEntry(ctx, job)
    setStatus(ctx, job, status)
    if (status === 'WAITING_PARTS') {
      job.partsEta = detail?.partsEta
      bookingFor(ctx.db, jobId).readiness = 'parts-risk'
      ctx.log(job.id, 'parts.waiting', 'Waiting for parts', { eta: detail?.partsEta })
    }
    if (status === 'BLOCKED') job.blockedReason = detail?.reason ?? job.blockedReason
    if (status === 'IN_PROGRESS') {
      job.blockedReason = undefined
      bookingFor(ctx.db, jobId).readiness = 'ready'
    }
    return job
  })

function technicianIdFor(db: Database, job: JobCard) {
  return getSession()?.technicianId ?? bookingFor(db, job.id).technicianIds[0] ?? db.technicians[0]!.id
}

function closeOpenEntry(ctx: WriteContext, job: JobCard) {
  const open = job.timeEntries.find((t) => !t.endedAt)
  if (open) open.endedAt = ctx.now
  return Boolean(open)
}

export const startJob = (jobId: Id): Promise<Result<JobCard>> =>
  write('job.start', 'Job started', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (isFinished(job.status)) throw new DataError('This job is already complete.')
    const booking = bookingFor(ctx.db, jobId)
    // One tap start: a mechanic who grabs a vehicle before it is assigned records the arrival and
    // takes the job on the way through, so the trail still shows each step.
    if (['BOOKED', 'CONFIRMED'].includes(job.status)) setStatus(ctx, job, 'CHECKED_IN')
    if (job.status === 'CHECKED_IN') {
      const techId = technicianIdFor(ctx.db, job)
      if (!booking.technicianIds.includes(techId)) booking.technicianIds = [techId]
      setStatus(ctx, job, 'READY_FOR_WORK')
      const name = ctx.db.technicians.find((t) => t.id === techId)?.name ?? ctx.actor.name
      ctx.log(job.id, 'technician.assigned', `Taken by ${name} when starting`, { technicianIds: booking.technicianIds })
    }
    setStatus(ctx, job, 'IN_PROGRESS')
    booking.tentative = false
    if (!job.timeEntries.some((t) => !t.endedAt)) {
      job.timeEntries.push({ id: ctx.id(), technicianId: technicianIdFor(ctx.db, job), startedAt: ctx.now })
    }
    ctx.log(job.id, 'job.started', `Started by ${ctx.actor.name}`)
    return job
  })

export const pauseJob = (jobId: Id, reason?: string): Promise<Result<JobCard>> =>
  write('job.pause', 'Job paused', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (closeOpenEntry(ctx, job)) ctx.log(job.id, 'job.paused', reason ? `Paused: ${reason}` : 'Paused', { reason })
    return job
  })

export const resumeJob = (jobId: Id): Promise<Result<JobCard>> =>
  write('job.resume', 'Job resumed', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (isFinished(job.status)) throw new DataError('This job is already complete.')
    setStatus(ctx, job, 'IN_PROGRESS')
    if (!job.timeEntries.some((t) => !t.endedAt)) {
      job.timeEntries.push({ id: ctx.id(), technicianId: technicianIdFor(ctx.db, job), startedAt: ctx.now })
      ctx.log(job.id, 'job.resumed', `Resumed by ${ctx.actor.name}`)
    }
    return job
  })

/** Autosaved from the checklist. No page level save button. */
export const updateChecklistItem = (
  jobId: Id, itemId: Id, patch: Pick<ChecklistItem, 'result' | 'reading'>,
): Promise<Result<ChecklistItem>> =>
  write('checklist.update', 'Checklist updated', jobId, (ctx) => {
    const item = jobOf(ctx.db, jobId).checklist.find((c) => c.id === itemId)
    if (!item) throw new DataError('That checklist item could not be found.')
    Object.assign(item, patch)
    return item
  })

export interface FindingInput {
  title: string
  severity: FindingSeverity
  description: string
  photos: string[]
  suggestedAction?: string
  extraLabourHours?: number
  checklistItemId?: Id
}

/** The technician reports what they found. Pricing and the customer conversation belong to the advisor. */
export const addFinding = (jobId: Id, input: FindingInput): Promise<Result<Finding>> =>
  write('finding.create', `Finding: ${input.title}`, jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    const { checklistItemId, ...rest } = input
    const finding: Finding = {
      id: ctx.id(), jobId, ...rest,
      approvalStatus: input.suggestedAction?.trim() ? 'draft' : 'not-required',
      createdAt: ctx.now, createdBy: ctx.actor.name,
    }
    job.findings.push(finding)
    const item = job.checklist.find((c) => c.id === checklistItemId)
    if (item) {
      item.result = 'attention'
      item.findingId = finding.id
    }
    ctx.log(job.id, 'finding.created', `${input.title}, ${input.severity}`, { findingId: finding.id, severity: input.severity })
    return finding
  })

export const addPartUsed = (jobId: Id, input: { name: string; qty: number }): Promise<Result<JobCard>> =>
  write('parts.use', `Part used: ${input.name}`, jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    job.parts.push({ id: ctx.id(), name: input.name.trim(), qty: input.qty, unitCents: 0, source: 'technician', used: true })
    ctx.log(job.id, 'parts.used', `Used ${input.qty} x ${input.name.trim()}`)
    return job
  })

export const setPartUsed = (jobId: Id, partId: Id, used: boolean): Promise<Result<JobCard>> =>
  write('parts.use', 'Parts usage updated', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    const part = job.parts.find((p) => p.id === partId)
    if (part) part.used = used
    return job
  })

export const setLabourDone = (jobId: Id, lineId: Id, done: boolean): Promise<Result<JobCard>> =>
  write('labour.update', 'Work item updated', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    const line = job.labour.find((l) => l.id === lineId)
    if (line) line.done = done
    return job
  })

export const addJobNote = (jobId: Id, text: string): Promise<Result<JobCard>> =>
  write('note.add', 'Note added', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    job.notes.push({ id: ctx.id(), text: text.trim(), author: ctx.actor.name, createdAt: ctx.now })
    ctx.log(job.id, 'note.added', 'Note added')
    return job
  })

/** What still stops a job from being completed. Empty means ready. */
export function completionBlockers(job: JobCard): string[] {
  const out: string[] = []
  const open = job.checklist.filter((c) => c.required && (c.kind === 'reading' ? c.reading == null : !c.result))
  if (open.length) out.push(`${open.length} required checklist ${open.length === 1 ? 'item is' : 'items are'} not done`)
  const additional = job.labour.filter((l) => l.source === 'additional' && !l.done)
  if (additional.length) out.push(`${additional.length} approved extra ${additional.length === 1 ? 'job is' : 'jobs are'} not marked done`)
  return out
}

export const completeJob = (jobId: Id, input: { summary: string; odometerKm: number }): Promise<Result<JobCard>> =>
  write('job.complete', 'Job completed', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    const blockers = completionBlockers(job)
    if (blockers.length) throw new DataError(`Not ready to complete: ${blockers.join(', ')}.`)
    if (!input.odometerKm) throw new DataError('Enter the odometer reading.')
    closeOpenEntry(ctx, job)
    if (job.status !== 'IN_PROGRESS') setStatus(ctx, job, 'IN_PROGRESS')
    setStatus(ctx, job, 'TECH_COMPLETE')
    job.labour.forEach((l) => (l.done = true))
    job.mechanicSummary = input.summary.trim()
    job.odometerKmOut = input.odometerKm
    job.completedAt = ctx.now
    job.completedBy = ctx.actor.name
    const vehicle = ctx.db.vehicles.find((v) => v.id === job.vehicleId)
    if (vehicle) vehicle.odometerKm = input.odometerKm
    const clocked = job.timeEntries.reduce((s, t) => s + minutesBetween(t.startedAt, t.endedAt ?? ctx.now), 0)
    ctx.log(job.id, 'job.completed', `Completed by ${ctx.actor.name}`, { clockedMinutes: Math.round(clocked), odometerKm: input.odometerKm })
    return job
  })

// ---- Quotes and approval ----------------------------------------------------------------------------

function quoteLineOf(job: JobCard, lineId: Id): QuoteLine {
  const line = job.quoteLines.find((l) => l.id === lineId)
  if (!line) throw new DataError('That quote item could not be found.')
  return line
}

function setFindingApproval(job: JobCard, line: QuoteLine) {
  const finding = job.findings.find((f) => f.id === line.findingId)
  if (finding) finding.approvalStatus = line.status
}

export const addFindingToQuote = (
  jobId: Id, findingId: Id, input: { description: string; labourHours: number; partsCents: number },
): Promise<Result<QuoteLine>> =>
  write('quote.add', 'Quote item added', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (job.quoteLines.some((l) => l.findingId === findingId)) throw new DataError('That finding is already on the quote.')
    const line: QuoteLine = {
      id: ctx.id(), findingId, description: input.description.trim(), labourHours: input.labourHours,
      labourCents: Math.round(input.labourHours * ctx.db.settings.labourRateCents), partsCents: input.partsCents, status: 'draft',
    }
    job.quoteLines.push(line)
    setFindingApproval(job, line)
    return line
  })

export const sendQuoteForApproval = (jobId: Id, lineId: Id): Promise<Result<QuoteLine>> =>
  write('quote.send', 'Quote sent for approval', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    const line = quoteLineOf(job, lineId)
    line.status = 'awaiting-customer'
    line.sentAt = ctx.now
    setFindingApproval(job, line)
    ctx.log(job.id, 'quote.sent', `Sent for approval: ${line.description}`, { lineId })
    return line
  })

/** Customer said yes. The extra work lands on the technician's job and the booking grows to fit. */
export const approveQuote = (jobId: Id, lineId: Id): Promise<Result<QuoteLine>> =>
  write('quote.approve', 'Additional work approved', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    const line = quoteLineOf(job, lineId)
    if (line.status === 'approved') return line
    line.status = 'approved'
    line.decidedAt = ctx.now
    setFindingApproval(job, line)
    job.labour.push({
      id: ctx.id(), description: line.description, hours: line.labourHours, rateCents: ctx.db.settings.labourRateCents,
      source: 'additional', findingId: line.findingId, done: false,
    })
    if (line.partsCents) {
      job.parts.push({ id: ctx.id(), name: `Parts for: ${line.description}`, qty: 1, unitCents: line.partsCents, source: 'additional', used: false })
    }
    const booking = bookingFor(ctx.db, jobId)
    booking.estimatedLabourHours += line.labourHours
    booking.endAt = addMinutes(booking.endAt, line.labourHours * 60)
    job.promisedAt = addMinutes(job.promisedAt, line.labourHours * 60)
    if (job.status === 'WAITING_APPROVAL') setStatus(ctx, job, 'IN_PROGRESS')
    ctx.log(job.id, 'quote.approved', `Customer approved: ${line.description}`, { lineId, labourHours: line.labourHours })
    return line
  })

export const declineQuote = (jobId: Id, lineId: Id): Promise<Result<QuoteLine>> =>
  write('quote.decline', 'Additional work declined', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    const line = quoteLineOf(job, lineId)
    line.status = 'declined'
    line.decidedAt = ctx.now
    setFindingApproval(job, line)
    if (job.status === 'WAITING_APPROVAL') setStatus(ctx, job, 'IN_PROGRESS')
    ctx.log(job.id, 'quote.declined', `Customer declined: ${line.description}`, { lineId })
    return line
  })

// ---- Integration diagnostics and demo controls --------------------------------------------------------

export async function retrySync(entryId: Id) {
  retryOutboxEntry(entryId)
}

export async function setErrorSimulation(on: boolean) {
  setSimulateErrors(on)
}

export async function resetDemo() {
  resetDemoData()
}

// ---- Admin: staff and permissions -------------------------------------------------------------------
// App owned configuration. It is never sent to the back office system, so these skip the outbox.

const tidy = (text: string) => text.trim().replace(/\s+/g, ' ')
const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`))

function checkHours(start: string, end: string, breakMinutes: number) {
  if (!isTime(start) || !isTime(end)) throw new DataError('Enter hours like 07:00.')
  if (minutesOf(end) <= minutesOf(start)) throw new DataError('Finish time must be after the start time.')
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 180) throw new DataError('Break must be between 0 and 180 minutes.')
  if (breakMinutes >= minutesOf(end) - minutesOf(start)) throw new DataError('The break is longer than the shift.')
}

export interface StaffInput {
  id?: Id
  name: string
  role: Role
  title?: string
  active: boolean
  /** Set when this person is booked onto jobs. Null means they are not a technician. */
  technician: { skills: Skill[]; shiftStart: string; shiftEnd: string; breakMinutes: number } | null
}

export const saveStaffMember = (input: StaffInput): Promise<Result<StaffUser>> =>
  writeConfig(({ db, id }) => {
    const name = tidy(input.name)
    if (!name) throw new DataError('Enter a name.')
    const existing = input.id ? db.staff.find((u) => u.id === input.id) : undefined
    if (input.id && !existing) throw new DataError('That person could not be found.')
    if (db.staff.some((u) => u.id !== input.id && u.name.toLowerCase() === name.toLowerCase())) {
      throw new DataError(`${name} is already on the list.`)
    }
    if (input.role === 'mechanic' && !input.technician) throw new DataError('A mechanic needs shift hours.')
    if (input.technician) checkHours(input.technician.shiftStart, input.technician.shiftEnd, input.technician.breakMinutes)

    const me = getSession()
    if (existing && me?.id === existing.id && (!input.active || input.role !== existing.role)) {
      throw new DataError('You cannot change your own role or deactivate yourself.')
    }
    const otherAdmins = db.staff.filter((u) => u.id !== existing?.id && u.role === 'admin' && u.active)
    if ((input.role !== 'admin' || !input.active) && !otherAdmins.length) throw new DataError('Keep at least one active administrator.')

    const user: StaffUser = existing ?? { id: id('u'), name, role: input.role, active: input.active }
    if (!existing) db.staff.push(user)
    Object.assign(user, { name, role: input.role, title: tidy(input.title ?? '') || undefined, active: input.active })

    let tech = user.technicianId ? db.technicians.find((t) => t.id === user.technicianId) : undefined
    if (input.technician) {
      if (!tech) {
        tech = { id: id('t'), name, skills: [], shiftStart: '07:00', shiftEnd: '15:30', breakMinutes: 30, active: true, unavailable: [] }
        db.technicians.push(tech)
        user.technicianId = tech.id
      }
      Object.assign(tech, { name, ...input.technician, active: input.active })
    } else if (tech) {
      // Kept for history, but no longer offered for work.
      tech.active = false
      tech.name = name
    }
    return user
  })

export const saveRolePermissions = (role: Role, actions: Action[]): Promise<Result<Action[]>> =>
  writeConfig(({ db }) => {
    if (role === 'admin') throw new DataError('Administrators always have every permission.')
    const allowed = [...new Set(actions)].filter((a) => !ADMIN_ONLY.includes(a))
    db.rolePermissions[role] = allowed
    return allowed
  })

export const resetRolePermissions = (role: Role): Promise<Result<Action[]>> =>
  writeConfig(({ db }) => {
    db.rolePermissions[role] = defaultRolePermissions()[role]
    return db.rolePermissions[role]
  })

// ---- Admin: workshop hours, bays and closed days -----------------------------------------------------

export const saveWorkshopSettings = (
  patch: Partial<Pick<WorkshopSettings, 'openTime' | 'closeTime' | 'breaks' | 'gapMinutes' | 'dailyTargetHours' | 'labourRateCents'>>,
): Promise<Result<WorkshopSettings>> =>
  writeConfig(({ db }) => {
    const next = { ...db.settings, ...patch }
    const breaks = [...next.breaks].sort((a, b) => a.from.localeCompare(b.from))
    breaks.forEach((b, i) => {
      if (!isTime(b.from) || !isTime(b.to)) throw new DataError('Enter break times like 11:30.')
      if (minutesOf(b.to) <= minutesOf(b.from)) throw new DataError('Each break must end after it starts.')
      if (minutesOf(b.from) < minutesOf(next.openTime) || minutesOf(b.to) > minutesOf(next.closeTime)) throw new DataError('Breaks must sit inside opening hours.')
      if (i && minutesOf(b.from) < minutesOf(breaks[i - 1]!.to)) throw new DataError('Breaks cannot overlap.')
    })
    if (!Number.isInteger(next.gapMinutes) || next.gapMinutes < 0 || next.gapMinutes > 60) throw new DataError('The gap between vehicles must be 0 to 60 minutes.')
    next.breaks = breaks
    next.breakMinutes = breaks.reduce((s, b) => s + minutesOf(b.to) - minutesOf(b.from), 0)
    checkHours(next.openTime, next.closeTime, next.breakMinutes)
    const shiftHours = (minutesOf(next.closeTime) - minutesOf(next.openTime) - next.breakMinutes) / 60
    if (!(next.dailyTargetHours >= 0) || next.dailyTargetHours > shiftHours) {
      throw new DataError(`The daily target cannot be more than the ${shiftHours.toFixed(1)} working hours in a day.`)
    }
    if (!Number.isInteger(next.labourRateCents) || next.labourRateCents <= 0) throw new DataError('Enter a labour rate above zero.')
    db.settings = next
    return next
  })

/** Copies the default hours onto every active technician. Leave and training are untouched. */
export const applyHoursToTechnicians = (): Promise<Result<number>> =>
  writeConfig(({ db }) => {
    const { openTime, closeTime, breakMinutes } = db.settings
    const active = db.technicians.filter((t) => t.active)
    for (const t of active) Object.assign(t, { shiftStart: openTime, shiftEnd: closeTime, breakMinutes })
    return active.length
  })

export const addClosedDay = (day: string, reason: string): Promise<Result<{ closed: ClosedDay; bookingsOnDay: number }>> =>
  writeConfig(({ db }) => {
    if (!isDay(day)) throw new DataError('Choose a date.')
    if (db.settings.closedDays.some((d) => d.day === day)) throw new DataError('That day is already closed.')
    const closed: ClosedDay = { day, reason: tidy(reason) || 'Closed' }
    db.settings.closedDays = [...db.settings.closedDays, closed].sort((a, b) => a.day.localeCompare(b.day))
    return { closed, bookingsOnDay: db.bookings.filter((b) => b.startAt.slice(0, 10) === day).length }
  })

export const removeClosedDay = (day: string): Promise<Result<string>> =>
  writeConfig(({ db }) => {
    db.settings.closedDays = db.settings.closedDays.filter((d) => d.day !== day)
    return day
  })

export const saveBay = (input: { id?: Id; name: string; type: Bay['type'] }): Promise<Result<Bay>> =>
  writeConfig(({ db, id }) => {
    const name = tidy(input.name)
    if (!name) throw new DataError('Enter a bay name.')
    if (db.bays.some((b) => b.id !== input.id && b.name.toLowerCase() === name.toLowerCase())) throw new DataError(`${name} already exists.`)
    const existing = input.id ? db.bays.find((b) => b.id === input.id) : undefined
    if (input.id && !existing) throw new DataError('That bay could not be found.')
    const bay: Bay = existing ?? { id: id('bay'), name, type: input.type }
    Object.assign(bay, { name, type: input.type })
    if (!existing) db.bays.push(bay)
    return bay
  })

export const removeBay = (bayId: Id): Promise<Result<Id>> =>
  writeConfig(({ db }) => {
    const now = new Date().toISOString()
    const upcoming = db.bookings.filter((b) => b.bayId === bayId && b.endAt > now)
    if (upcoming.length) throw new DataError(`This bay has ${upcoming.length} booking${upcoming.length === 1 ? '' : 's'} coming up. Move them first.`)
    db.bays = db.bays.filter((b) => b.id !== bayId)
    return bayId
  })

// ---- Admin: vehicle library and service profiles -----------------------------------------------------

export const saveVehicleModel = (input: Omit<VehicleModel, 'id'> & { id?: Id }): Promise<Result<VehicleModel>> =>
  writeConfig(({ db, id }) => {
    const make = tidy(input.make)
    const model = tidy(input.model)
    const series = tidy(input.series ?? '') || undefined
    if (!make || !model) throw new DataError('Enter a make and a model.')
    if (!(input.yearFrom >= 1950 && input.yearFrom <= 2100)) throw new DataError('Enter the first model year, for example 2015.')
    if (input.yearTo !== undefined && input.yearTo < input.yearFrom) throw new DataError('The last year cannot be before the first.')
    const clash = db.library.find(
      (m) => m.id !== input.id && m.make.toLowerCase() === make.toLowerCase() && m.model.toLowerCase() === model.toLowerCase() &&
        (m.series ?? '').toLowerCase() === (series ?? '').toLowerCase() && m.yearFrom === input.yearFrom,
    )
    if (clash) throw new DataError('That make, model, series and year is already in the library.')
    const existing = input.id ? db.library.find((m) => m.id === input.id) : undefined
    if (input.id && !existing) throw new DataError('That vehicle could not be found in the library.')
    const entry: VehicleModel = existing ?? { ...input, id: id('m'), make, model, series }
    Object.assign(entry, { ...input, id: entry.id, make, model, series, engine: tidy(input.engine ?? '') || undefined })
    if (!existing) db.library.push(entry)
    return entry
  })

export const removeVehicleModel = (modelId: Id): Promise<Result<Id>> =>
  writeConfig(({ db }) => {
    const used = db.profiles.filter((p) => p.modelId === modelId).length
    if (used) throw new DataError(`${used} service profile${used === 1 ? ' uses' : 's use'} this vehicle. Make it inactive instead.`)
    db.library = db.library.filter((m) => m.id !== modelId)
    return modelId
  })

function checkParts(parts: TemplatePart[]) {
  for (const p of parts) {
    if (!tidy(p.name)) throw new DataError('Every part needs a name.')
    if (!(p.qty > 0)) throw new DataError(`Enter a quantity for ${p.name}.`)
    if (!Number.isInteger(p.unitCents) || p.unitCents < 0) throw new DataError(`Enter a price for ${p.name}.`)
  }
}

function checkChecklist(items: ChecklistTemplateItem[]) {
  if (items.some((c) => !tidy(c.label))) throw new DataError('Every checklist item needs a label.')
}

const cleanParts = (parts: TemplatePart[]) => parts.map((p) => ({ ...p, name: tidy(p.name) }))
const cleanChecklist = (items: ChecklistTemplateItem[]) => items.map((c) => ({ ...c, label: tidy(c.label) }))

export const saveServiceTemplate = (input: Omit<ServiceTemplate, 'id'> & { id?: Id }): Promise<Result<ServiceTemplate>> =>
  writeConfig(({ db, id }) => {
    const name = tidy(input.name)
    if (!name) throw new DataError('Enter a service name.')
    if (!(input.labourHours > 0 && input.labourHours <= 40)) throw new DataError('Enter labour hours between 0 and 40.')
    if (input.intervalKm !== undefined && !(Number.isInteger(input.intervalKm) && input.intervalKm > 0)) throw new DataError('Enter the interval in whole kilometres.')
    if (db.templates.some((t) => t.id !== input.id && t.name.toLowerCase() === name.toLowerCase())) throw new DataError(`${name} already exists.`)
    checkParts(input.parts)
    checkChecklist(input.checklist)
    const existing = input.id ? db.templates.find((t) => t.id === input.id) : undefined
    if (input.id && !existing) throw new DataError('That service could not be found.')
    const template: ServiceTemplate = existing ?? { ...input, id: id('svc'), name }
    Object.assign(template, { ...input, id: template.id, name, parts: cleanParts(input.parts), checklist: cleanChecklist(input.checklist) })
    if (!existing) db.templates.push(template)
    return template
  })

export const removeServiceTemplate = (templateId: Id): Promise<Result<Id>> =>
  writeConfig(({ db }) => {
    const profiles = db.profiles.filter((p) => p.templateId === templateId).length
    const bookings = db.bookings.filter((b) => b.serviceTemplateId === templateId).length
    if (profiles || bookings) throw new DataError('This service is already in use. Make it inactive instead.')
    db.templates = db.templates.filter((t) => t.id !== templateId)
    return templateId
  })

export const saveServiceProfile = (input: Omit<ServiceProfile, 'id'> & { id?: Id }): Promise<Result<ServiceProfile>> =>
  writeConfig(({ db, id }) => {
    if (!db.templates.some((t) => t.id === input.templateId)) throw new DataError('Choose the service this profile is for.')
    if (!db.library.some((m) => m.id === input.modelId)) throw new DataError('Choose the vehicle this profile is for.')
    if (!(input.labourHours > 0 && input.labourHours <= 40)) throw new DataError('Enter labour hours between 0 and 40.')
    if (db.profiles.some((p) => p.id !== input.id && p.templateId === input.templateId && p.modelId === input.modelId)) {
      throw new DataError('That vehicle already has a profile for this service. Edit that one instead.')
    }
    checkParts(input.parts)
    if (input.checklist) checkChecklist(input.checklist)
    const existing = input.id ? db.profiles.find((p) => p.id === input.id) : undefined
    if (input.id && !existing) throw new DataError('That profile could not be found.')
    const profile: ServiceProfile = existing ?? { ...input, id: id('p') }
    Object.assign(profile, {
      ...input, id: profile.id, parts: cleanParts(input.parts), checklist: input.checklist ? cleanChecklist(input.checklist) : undefined,
      notes: tidy(input.notes ?? '') || undefined,
    })
    if (!existing) db.profiles.push(profile)
    return profile
  })

export const removeServiceProfile = (profileId: Id): Promise<Result<Id>> =>
  writeConfig(({ db }) => {
    db.profiles = db.profiles.filter((p) => p.id !== profileId)
    return profileId
  })

// ---- Specialist parts ------------------------------------------------------------------------------

function partOrderOf(db: Database, id: Id) {
  const order = db.partOrders.find((o) => o.id === id)
  if (!order) throw new DataError('That part order no longer exists.')
  return order
}

const etaNote = (order: PartOrder) =>
  order.eta && order.eta > order.neededBy ? ` That is after the booking on ${formatDayShort(order.neededBy)}, so tell the customer.` : ''

/** The part has been ordered. The ETA can come now or later. */
export const markPartOrdered = (id: Id, input: { supplier: string; eta?: string }): Promise<Result<PartOrder>> =>
  write('parts.manage', 'Part ordered', id, (ctx) => {
    const order = partOrderOf(ctx.db, id)
    if (!input.supplier.trim()) throw new DataError('Say who it was ordered from.')
    Object.assign(order, { status: 'ordered', supplier: input.supplier.trim(), eta: input.eta || undefined, orderedAt: nowIso(), wrongPartAt: undefined, sync: pending })
    ctx.log(order.jobId, 'parts.ordered', `${order.name} (${order.code}) ordered from ${order.supplier}${order.eta ? `, due ${formatDayShort(order.eta)}` : ''}.${etaNote(order)}`, { orderId: id, eta: order.eta })
    return order
  })

/** The supplier gave a new date. */
export const setPartEta = (id: Id, eta: string): Promise<Result<PartOrder>> =>
  write('parts.manage', 'Part ETA updated', id, (ctx) => {
    const order = partOrderOf(ctx.db, id)
    if (!eta) throw new DataError('Pick the day it is due.')
    order.eta = eta
    order.sync = pending
    ctx.log(order.jobId, 'parts.eta', `${order.name} (${order.code}) now due ${formatDayShort(eta)}.${etaNote(order)}`, { orderId: id, eta })
    return order
  })

/** Checked in. A wrong part goes back to be ordered again. */
export const receivePart = (id: Id, correct: boolean, note?: string): Promise<Result<PartOrder>> =>
  write('parts.manage', correct ? 'Part received' : 'Wrong part received', id, (ctx) => {
    const order = partOrderOf(ctx.db, id)
    if (correct) {
      Object.assign(order, { status: 'received', receivedAt: nowIso(), note: note?.trim() || order.note, sync: pending })
      ctx.log(order.jobId, 'parts.received', `${order.name} (${order.code}) received and checked.`, { orderId: id })
    } else {
      Object.assign(order, { status: 'to-order', wrongPartAt: nowIso(), eta: undefined, note: note?.trim() || undefined, sync: pending })
      ctx.log(order.jobId, 'parts.wrong', `Wrong part delivered for ${order.name} (${order.code}). To be ordered again.${note ? ` ${note.trim()}` : ''}`, { orderId: id })
    }
    return order
  })

/** The customer said they are still bringing the vehicle in, by reply or on the phone. */
export const recordCustomerConfirmed = (bookingId: Id, how: 'phone' | 'reply' = 'phone'): Promise<Result<Booking>> =>
  write('booking.create', 'Customer confirmed', bookingId, (ctx) => {
    const booking = ctx.db.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new DataError('That booking no longer exists.')
    booking.customerConfirmedAt = nowIso()
    booking.tentative = false
    booking.sync = pending
    ctx.log(booking.jobId, 'booking.customer-confirmed', how === 'phone' ? 'Customer confirmed on the phone' : 'Customer confirmed by reply', { how })
    return booking
  })

// ---- Workshop day: place a vehicle on a mechanic's day -----------------------------------------------

const NOT_STARTED: JobStatus[] = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'READY_FOR_WORK']
const snapUp = (m: number) => Math.ceil(m / 15) * 15

/**
 * Puts a vehicle on a mechanic's day at a 15 minute mark. It keeps the gap after the vehicle before it,
 * never starts in a break, and pushes the vehicles after it to the right so each keeps the gap too.
 * Work already started is never moved.
 */
export const placeOnMechanic = (bookingId: Id, technicianId: Id, startAt: string): Promise<Result<{ booking: Booking; moved: number }>> =>
  write('job.assign', 'Moved on the workshop day', bookingId, (ctx) => {
    const { db } = ctx
    const booking = db.bookings.find((b) => b.id === bookingId)
    if (!booking) throw new DataError('That booking no longer exists.')
    const job = jobOf(db, booking.jobId)
    if (!NOT_STARTED.includes(job.status)) throw new DataError('Work has started on this vehicle, so it stays where it is.')
    const tech = db.technicians.find((t) => t.id === technicianId && t.active)
    if (!tech) throw new DataError('That mechanic could not be found.')
    const day = dayKey(startAt)
    const { gapMinutes } = workshopRules()
    const lane = db.bookings
      .filter((b) => b.id !== booking.id && b.technicianIds.includes(tech.id) && dayKey(b.startAt) === day)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))

    let start = snapUp(startOutsideBreaks(minutesOfDay(startAt)))
    const dropped = start
    const before = lane.filter((b) => minutesOfDay(b.startAt) <= dropped)
    const prev = before.at(-1)
    if (prev && minutesOfDay(prev.endAt) + gapMinutes > start) start = snapUp(startOutsideBreaks(minutesOfDay(prev.endAt) + gapMinutes))
    const newStart = at(day, fromMinutes(start))
    const endAt = endAtFor(newStart, booking.estimatedLabourHours)
    const changedTech = booking.technicianIds[0] !== tech.id
    Object.assign(booking, { technicianIds: [tech.id], startAt: newStart, endAt, sync: pending })
    job.promisedAt = addMinutes(endAt, 60)
    if (job.status === 'CHECKED_IN') setStatus(ctx, job, 'READY_FOR_WORK')
    ctx.log(job.id, changedTech ? 'technician.assigned' : 'booking.rescheduled', `Planned with ${tech.name}, ${formatTime(newStart)} to ${formatTime(endAt)}`, {
      technicianIds: [tech.id], startAt: newStart,
    })

    // Everything after it moves right, keeping the gap. Work already started stays put.
    let cursor = minutesOfDay(endAt)
    let moved = 0
    for (const b of lane.filter((x) => !before.includes(x))) {
      const s = minutesOfDay(b.startAt)
      if (s < cursor + gapMinutes && NOT_STARTED.includes(jobOf(db, b.jobId).status)) {
        const shifted = at(day, fromMinutes(snapUp(startOutsideBreaks(cursor + gapMinutes))))
        const shiftedEnd = endAtFor(shifted, b.estimatedLabourHours)
        Object.assign(b, { startAt: shifted, endAt: shiftedEnd, sync: pending })
        jobOf(db, b.jobId).promisedAt = addMinutes(shiftedEnd, 60)
        ctx.log(b.jobId, 'booking.rescheduled', `Moved to ${formatTime(shifted)} to make room for ${regoOf(db, booking.vehicleId)}`, { startAt: shifted })
        moved++
      }
      cursor = Math.max(cursor, minutesOfDay(b.endAt))
    }
    return { booking, moved }
  })

// ---- Close out: check, invoice, paid --------------------------------------------------------------

/** The workshop manager checks a finished job and releases it for invoicing. */
export const verifyJob = (jobId: Id): Promise<Result<JobCard>> =>
  write('job.verify', 'Checked, ready to invoice', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (!['TECH_COMPLETE', 'QUALITY_CHECK'].includes(job.status)) throw new DataError('Only work the mechanic has finished can be checked.')
    const failed = closeOutChecks(job).filter((c) => !c.ok)
    if (failed.length) throw new DataError(`Not ready to invoice: ${failed.map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).join('; ')}.`)
    const me = getSession()
    job.verifiedAt = nowIso()
    job.verifiedBy = me?.name
    job.sync = pending
    setStatus(ctx, job, 'READY_TO_INVOICE')
    ctx.log(job.id, 'job.status_changed', `Checked by ${me?.name ?? 'the workshop'} and released for invoicing`, { verified: true })
    return job
  })

/** The invoice is raised in the back office, so the customer can collect. Later this comes from the sync. */
export const markInvoiced = (jobId: Id): Promise<Result<JobCard>> =>
  write('job.payment', 'Invoiced, ready to collect', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (job.status !== 'READY_TO_INVOICE') throw new DataError('Only a checked job can be invoiced.')
    job.invoicedAt = nowIso()
    job.sync = pending
    setStatus(ctx, job, 'READY_FOR_CUSTOMER')
    return job
  })

/** The customer paid. This finishes the job. */
export const markPaid = (jobId: Id): Promise<Result<JobCard>> =>
  write('job.payment', 'Paid', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    if (job.status !== 'READY_FOR_CUSTOMER') throw new DataError('Only an invoiced job can be marked paid.')
    job.paidAt = nowIso()
    job.sync = pending
    setStatus(ctx, job, 'CLOSED')
    return job
  })
