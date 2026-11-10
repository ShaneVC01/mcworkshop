import type { StatusTone } from '@/components/domain/status-tones'
import type { JobStatus } from '@/types'

/** Explicit job states from the PRD. Every transition writes an activity event. */
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  BOOKED: 'Booked',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  READY_FOR_WORK: 'Ready for work',
  IN_PROGRESS: 'In progress',
  WAITING_APPROVAL: 'Awaiting approval',
  WAITING_PARTS: 'Awaiting parts',
  BLOCKED: 'Blocked',
  TECH_COMPLETE: 'Tech complete',
  QUALITY_CHECK: 'Quality check',
  READY_FOR_CUSTOMER: 'Ready for customer',
  CLOSED: 'Closed',
}

export const JOB_STATUS_TONE: Record<JobStatus, StatusTone> = {
  BOOKED: 'tentative',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked-in',
  READY_FOR_WORK: 'checked-in',
  IN_PROGRESS: 'in-progress',
  WAITING_APPROVAL: 'approval',
  WAITING_PARTS: 'parts',
  BLOCKED: 'blocked',
  TECH_COMPLETE: 'complete',
  QUALITY_CHECK: 'complete',
  READY_FOR_CUSTOMER: 'complete',
  CLOSED: 'complete',
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
  TECH_COMPLETE: ['QUALITY_CHECK', 'READY_FOR_CUSTOMER', 'IN_PROGRESS'],
  QUALITY_CHECK: ['READY_FOR_CUSTOMER', 'IN_PROGRESS'],
  READY_FOR_CUSTOMER: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
}

export function canTransition(from: JobStatus, to: JobStatus) {
  return from === to || TRANSITIONS[from].includes(to)
}

/** Workshop board columns, in order. */
export const BOARD_COLUMNS = [
  { key: 'arriving', label: 'Arriving', statuses: ['BOOKED', 'CONFIRMED'], dropStatus: 'CONFIRMED' },
  { key: 'checked-in', label: 'Checked in', statuses: ['CHECKED_IN', 'READY_FOR_WORK'], dropStatus: 'CHECKED_IN' },
  { key: 'in-progress', label: 'In progress', statuses: ['IN_PROGRESS'], dropStatus: 'IN_PROGRESS' },
  { key: 'approval', label: 'Awaiting approval', statuses: ['WAITING_APPROVAL'], dropStatus: 'WAITING_APPROVAL' },
  { key: 'parts', label: 'Awaiting parts', statuses: ['WAITING_PARTS'], dropStatus: 'WAITING_PARTS' },
  { key: 'blocked', label: 'Blocked', statuses: ['BLOCKED'], dropStatus: 'BLOCKED' },
  {
    key: 'ready',
    label: 'Complete',
    statuses: ['TECH_COMPLETE', 'QUALITY_CHECK', 'READY_FOR_CUSTOMER'],
    dropStatus: 'TECH_COMPLETE',
  },
] as const satisfies readonly { key: string; label: string; statuses: JobStatus[]; dropStatus: JobStatus }[]

export const FINISHED: JobStatus[] = ['TECH_COMPLETE', 'QUALITY_CHECK', 'READY_FOR_CUSTOMER', 'CLOSED']
export const ON_SITE: JobStatus[] = ['CHECKED_IN', 'READY_FOR_WORK', 'IN_PROGRESS', ...HOLDS]

export function isFinished(status: JobStatus) {
  return FINISHED.includes(status)
}
