/**
 * Write side of the data layer. Each function is named for a business action.
 * Every action saves locally, writes an activity event and queues an outbox entry.
 * Nothing here sends anything to NetSuite. See docs/supabase-handover.md.
 */
import { getSession } from '@/auth/session'
import { findConflicts, freeBay } from '@/lib/capacity'
import { addMinutes, dayKey, formatDayShort, formatTime, minutesBetween, minutesOfDay, normaliseRego } from '@/lib/format'
import { canTransition, isFinished, JOB_STATUS_LABEL } from '@/lib/job-state'
import type {
  Booking, ChecklistItem, Customer, Finding, FindingSeverity, Id, JobCard, JobStatus, QuoteLine, RegoState, Result,
  Vehicle,
} from '@/types'
import { buildJobParts, LABOUR_RATE_CENTS, type Database } from './mock/seed'
import { DataError, resetDemoData, retryOutboxEntry, setSimulateErrors, write, type WriteContext } from './mock/store'

export { LABOUR_RATE_CENTS }

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
    const template = db.templates.find((t) => t.id === input.serviceTemplateId)
    const vehicle = db.vehicles.find((v) => v.id === input.vehicleId)
    if (!template || !vehicle) throw new DataError('Choose a vehicle and a service first.')
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
      ...buildJobParts(template, ctx.id), findings: [], quoteLines: [], timeEntries: [], notes: [],
      promisedAt: addMinutes(endAt, 60), sync: pending,
    }
    const booking: Booking = {
      id: `b${n}`, number: `B-${n}`, division: template.division, jobId: job.id, vehicleId: vehicle.id,
      customerId: vehicle.customerId, technicianIds, bayId, startAt: input.startAt, endAt,
      estimatedLabourHours: template.labourHours, serviceTemplateId: template.id, serviceName: template.name,
      tentative: Boolean(input.tentative), readiness: template.parts.length ? 'ready' : 'unknown', sync: pending,
    }
    db.jobs.push(job)
    db.bookings.push(booking)
    ctx.log(job.id, 'booking.created', `Booked ${template.name} for ${formatDayShort(dayKey(booking.startAt))} at ${formatTime(booking.startAt)}`, {
      registration: vehicle.registration,
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
      labourCents: Math.round(input.labourHours * LABOUR_RATE_CENTS), partsCents: input.partsCents, status: 'draft',
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
      id: ctx.id(), description: line.description, hours: line.labourHours, rateCents: LABOUR_RATE_CENTS,
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
