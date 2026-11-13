/**
 * Write side of the data layer. Each function is named for a business action.
 * Every action saves locally, writes an activity event and queues an outbox entry.
 * Nothing here sends anything to NetSuite. See docs/supabase-handover.md.
 */
import { ADMIN_ONLY, defaultRolePermissions } from '@/auth/default-permissions'
import { getSession } from '@/auth/session'
import { findConflicts, freeBay } from '@/lib/capacity'
import { addMinutes, dayKey, formatDayShort, formatTime, minutesBetween, minutesOfDay, normaliseRego } from '@/lib/format'
import { canTransition, isFinished, JOB_STATUS_LABEL } from '@/lib/job-state'
import { resolveServicePlan } from '@/lib/service-profiles'
import type {
  Action, Bay, Booking, ChecklistItem, ChecklistTemplateItem, ClosedDay, Customer, Finding, FindingSeverity, Id, JobCard,
  JobStatus, QuoteLine, RegoState, Result, Role, ServiceProfile, ServiceTemplate, Skill, StaffUser, TemplatePart,
  Vehicle, VehicleModel, WorkshopSettings,
} from '@/types'
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

export const createCustomer = (input: { name: string; mobile: string; email?: string; postcode?: string }): Promise<Result<Customer>> =>
  write('customer.create', `New customer ${input.name}`, (c) => c.id, (ctx) => {
    const customer: Customer = { id: `c${ctx.id()}`, ...input, sync: pending }
    ctx.db.customers.push(customer)
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
  serviceTemplateId: Id
  customerConcern: string
  startAt: string
  technicianId?: Id
  bayId?: Id
  tentative?: boolean
  /** Only controllers, managers and administrators may override a double booking warning. */
  override?: boolean
}

export const createBooking = (input: CreateBookingInput): Promise<Result<Booking>> =>
  write('booking.create', 'New booking', (b) => b.id, (ctx) => {
    const { db } = ctx
    const base = db.templates.find((t) => t.id === input.serviceTemplateId)
    const vehicle = db.vehicles.find((v) => v.id === input.vehicleId)
    if (!base || !vehicle) throw new DataError('Choose a vehicle and a service first.')
    // The vehicle's own profile wins over the generic template when there is one.
    const plan = resolveServicePlan(base, vehicle, db.library, db.profiles, db.settings.labourRateCents)
    const template = plan.template
    const endAt = addMinutes(input.startAt, template.labourHours * 60)
    const technicianIds = input.technicianId ? [input.technicianId] : []
    const span: [number, number] = [minutesOfDay(input.startAt), minutesOfDay(endAt)]
    const bayId = input.bayId ?? (technicianIds.length ? freeBay(db.bays, db.bookings, dayKey(input.startAt), span, template.bayType)?.id : undefined)
    assertNoConflict(db, { startAt: input.startAt, endAt, technicianIds, bayId }, input.override)

    const n = ++db.counters.booking
    const job: JobCard = {
      id: `j${n}`, number: `J-${n}`, division: template.division, bookingId: `b${n}`,
      vehicleId: vehicle.id, customerId: vehicle.customerId, status: input.tentative ? 'BOOKED' : 'CONFIRMED',
      customerConcern: input.customerConcern.trim() || `${template.name} as booked.`,
      ...buildJobParts(template, ctx.id, db.settings.labourRateCents), findings: [], quoteLines: [], timeEntries: [], notes: [],
      promisedAt: addMinutes(endAt, 60), sync: pending,
    }
    const booking: Booking = {
      id: `b${n}`, number: `B-${n}`, division: template.division, jobId: job.id, vehicleId: vehicle.id,
      customerId: vehicle.customerId, technicianIds, bayId, startAt: input.startAt, endAt,
      estimatedLabourHours: template.labourHours, serviceTemplateId: base.id, serviceName: template.name,
      tentative: Boolean(input.tentative), readiness: template.parts.length ? 'ready' : 'unknown', sync: pending,
    }
    db.jobs.push(job)
    db.bookings.push(booking)
    ctx.log(job.id, 'booking.created', `Booked ${template.name} for ${formatDayShort(dayKey(booking.startAt))} at ${formatTime(booking.startAt)}`, {
      registration: vehicle.registration, source: plan.source,
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

export const checkInVehicle = (jobId: Id, odometerKm?: number): Promise<Result<JobCard>> =>
  write('job.check-in', 'Vehicle checked in', jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
    setStatus(ctx, job, 'CHECKED_IN')
    const vehicle = ctx.db.vehicles.find((v) => v.id === job.vehicleId)
    if (vehicle && odometerKm) vehicle.odometerKm = odometerKm
    bookingFor(ctx.db, jobId).tentative = false
    ctx.log(job.id, 'vehicle.checked_in', `Checked in ${vehicle?.registration ?? ''}`, { odometerKm })
    return job
  })

export const moveJobStatus = (jobId: Id, status: JobStatus, detail?: { reason?: string; partsEta?: string }): Promise<Result<JobCard>> =>
  write('job.status', `Status: ${JOB_STATUS_LABEL[status]}`, jobId, (ctx) => {
    const job = jobOf(ctx.db, jobId)
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
    // One tap start: an arriving vehicle is checked in on the way through.
    if (['BOOKED', 'CONFIRMED'].includes(job.status)) setStatus(ctx, job, 'CHECKED_IN')
    setStatus(ctx, job, 'IN_PROGRESS')
    bookingFor(ctx.db, jobId).tentative = false
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
    if (input.role === 'mechanic' && !input.technician) throw new DataError('A technician needs shift hours.')
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
  patch: Partial<Pick<WorkshopSettings, 'openTime' | 'closeTime' | 'breakMinutes' | 'dailyTargetHours' | 'labourRateCents'>>,
): Promise<Result<WorkshopSettings>> =>
  writeConfig(({ db }) => {
    const next = { ...db.settings, ...patch }
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
