import type { StatusTone } from '@/components/domain/status-tones'
import type { JobCard, JobStatus } from '@/types'

/** Explicit job states from the PRD. Every transition writes an activity event. */
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  BOOKED: 'Booked',
  CONFIRMED: 'Confirmed',
  // The vehicle is here but nobody has been given the work yet.
  CHECKED_IN: 'Waiting assignment',
  // The workshop controller has given it to a mechanic. The mechanic starting it makes it In progress.
  READY_FOR_WORK: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING_APPROVAL: 'Awaiting approval',
  WAITING_PARTS: 'Awaiting parts',
  BLOCKED: 'Blocked',
  // The mechanic has finished. The workshop manager checks it before it can be invoiced.
  TECH_COMPLETE: 'Work complete',
  QUALITY_CHECK: 'Being checked',
  // Checked and released: the back office can invoice it.
  READY_TO_INVOICE: 'Ready to invoice',
  // Invoiced, so the customer can collect and pay.
  READY_FOR_CUSTOMER: 'Invoiced, ready to collect',
  // Paid. Nothing left to do.
  CLOSED: 'Paid',
}

export const JOB_STATUS_TONE: Record<JobStatus, StatusTone> = {
  BOOKED: 'tentative',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked-in',
  READY_FOR_WORK: 'assigned',
  IN_PROGRESS: 'in-progress',
  WAITING_APPROVAL: 'approval',
  WAITING_PARTS: 'parts',
  BLOCKED: 'blocked',
  TECH_COMPLETE: 'complete',
  QUALITY_CHECK: 'checking',
  READY_TO_INVOICE: 'to-invoice',
  READY_FOR_CUSTOMER: 'collect',
  CLOSED: 'paid',
}

const HOLDS: JobStatus[] = ['WAITING_APPROVAL', 'WAITING_PARTS', 'BLOCKED']

/** Allowed moves. Holds can always return to In progress. */
export const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  BOOKED: ['CONFIRMED', 'CHECKED_IN'],
  CONFIRMED: ['CHECKED_IN', 'BOOKED'],
  CHECKED_IN: ['READY_FOR_WORK', 'IN_PROGRESS', 'CONFIRMED'],
  READY_FOR_WORK: ['IN_PROGRESS', 'CHECKED_IN', ...HOLDS],
  IN_PROGRESS: [...HOLDS, 'TECH_COMPLETE', 'READY_FOR_WORK'],
  WAITING_APPROVAL: ['IN_PROGRESS', 'WAITING_PARTS', 'BLOCKED'],
  WAITING_PARTS: ['IN_PROGRESS', 'WAITING_APPROVAL', 'BLOCKED'],
  BLOCKED: ['IN_PROGRESS', 'WAITING_APPROVAL', 'WAITING_PARTS'],
  TECH_COMPLETE: ['QUALITY_CHECK', 'READY_TO_INVOICE', 'IN_PROGRESS'],
  QUALITY_CHECK: ['READY_TO_INVOICE', 'IN_PROGRESS'],
  READY_TO_INVOICE: ['READY_FOR_CUSTOMER', 'QUALITY_CHECK'],
  READY_FOR_CUSTOMER: ['CLOSED'],
  CLOSED: [],
}

export function canTransition(from: JobStatus, to: JobStatus) {
  return from === to || TRANSITIONS[from].includes(to)
}

/** The one button a workshop board column offers on each card. */
export type BoardAction = 'arrived' | 'assign' | 'reassign' | 'verify' | 'invoiced' | 'paid'

/**
 * Workshop board columns, in order. `tone` colours the heading. `action` is the button on each card:
 * Arriving gets "Vehicle arrived", Waiting assignment gets "Assign", Assigned gets "Reassign".
 */
export const BOARD_COLUMNS = [
  { key: 'arriving', label: 'Arriving', statuses: ['BOOKED', 'CONFIRMED'], tone: 'CONFIRMED', action: 'arrived' },
  { key: 'waiting', label: 'Waiting assignment', statuses: ['CHECKED_IN'], tone: 'CHECKED_IN', action: 'assign' },
  { key: 'assigned', label: 'Assigned', statuses: ['READY_FOR_WORK'], tone: 'READY_FOR_WORK', action: 'reassign' },
  { key: 'in-progress', label: 'In progress', statuses: ['IN_PROGRESS'], tone: 'IN_PROGRESS' },
  { key: 'approval', label: 'Awaiting approval', statuses: ['WAITING_APPROVAL'], tone: 'WAITING_APPROVAL' },
  { key: 'parts', label: 'Awaiting parts', statuses: ['WAITING_PARTS'], tone: 'WAITING_PARTS' },
  { key: 'blocked', label: 'Blocked', statuses: ['BLOCKED'], tone: 'BLOCKED' },
  { key: 'verify', label: 'To check', statuses: ['TECH_COMPLETE', 'QUALITY_CHECK'], tone: 'TECH_COMPLETE', action: 'verify' },
  { key: 'invoice', label: 'Ready to invoice', statuses: ['READY_TO_INVOICE'], tone: 'READY_TO_INVOICE', action: 'invoiced' },
  { key: 'collect', label: 'Ready to collect', statuses: ['READY_FOR_CUSTOMER'], tone: 'READY_FOR_CUSTOMER', action: 'paid' },
] as const satisfies readonly { key: string; label: string; statuses: JobStatus[]; tone: JobStatus; action?: BoardAction }[]

/** Statuses that only the Assign step can set, so the generic status picker leaves them out. */
export const ASSIGN_ONLY: JobStatus[] = ['READY_FOR_WORK', 'READY_TO_INVOICE', 'READY_FOR_CUSTOMER', 'CLOSED']

export const FINISHED: JobStatus[] = ['TECH_COMPLETE', 'QUALITY_CHECK', 'READY_TO_INVOICE', 'READY_FOR_CUSTOMER', 'CLOSED']
/** Work done but the vehicle has not left paid: check, invoice, collect. */
export const CLOSE_OUT: JobStatus[] = ['TECH_COMPLETE', 'QUALITY_CHECK', 'READY_TO_INVOICE', 'READY_FOR_CUSTOMER']
export const ON_SITE: JobStatus[] = ['CHECKED_IN', 'READY_FOR_WORK', 'IN_PROGRESS', ...HOLDS]

export function isFinished(status: JobStatus) {
  return FINISHED.includes(status)
}

/**
 * Booked for today or the next two working days, reminded, and the customer has not said they are coming.
 * The receptionist calls these.
 */
export function isUnconfirmed(s: { booking: { startAt: string; reminderSentAt?: string; customerConfirmedAt?: string }; job: { status: string } }, today: string, lastDay: string) {
  const day = s.booking.startAt.slice(0, 10)
  return day >= today && day <= lastDay && Boolean(s.booking.reminderSentAt) && !s.booking.customerConfirmedAt && ['BOOKED', 'CONFIRMED'].includes(s.job.status)
}

/**
 * What the workshop manager confirms before a job can be invoiced. Every one must pass.
 * The prototype checks what the job records; staff also eyeball the vehicle.
 */
export function closeOutChecks(job: JobCard) {
  const pendingQuotes = job.quoteLines.filter((q) => q.status === 'awaiting-customer').length
  return [
    { key: 'checklist', label: 'Inspection checklist finished', ok: job.checklist.every((c) => c.result || c.reading !== undefined) },
    { key: 'labour', label: 'Every labour line marked done', ok: job.labour.every((l) => l.done) },
    { key: 'parts', label: 'Every part marked used or taken off', ok: job.parts.every((p) => p.used) },
    { key: 'quotes', label: pendingQuotes ? `${pendingQuotes} extra work ${pendingQuotes === 1 ? 'quote has' : 'quotes have'} no answer` : 'Every extra work quote answered', ok: pendingQuotes === 0 },
    { key: 'odometer', label: 'Odometer reading out recorded', ok: job.odometerKmOut !== undefined },
  ]
}

export type CloseOutStep = 'verify' | 'invoiced' | 'paid'

/** The next close out step for a job, if it has one. */
export const closeOutStepOf = (s: { job: { status: JobStatus } }): CloseOutStep | undefined =>
  ['TECH_COMPLETE', 'QUALITY_CHECK'].includes(s.job.status) ? 'verify'
    : s.job.status === 'READY_TO_INVOICE' ? 'invoiced'
      : s.job.status === 'READY_FOR_CUSTOMER' ? 'paid'
        : undefined
