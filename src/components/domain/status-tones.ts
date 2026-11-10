import {
  CalendarCheck,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  ClockAlert,
  LogIn,
  PackageSearch,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
export type StatusTone =
  | 'confirmed'
  | 'checked-in'
  | 'in-progress'
  | 'approval'
  | 'parts'
  | 'blocked'
  | 'unavailable'
  | 'tentative'
  | 'complete'

export const statusTones: Record<StatusTone, { label: string; icon: LucideIcon; colour: string }> = {
  confirmed: { label: 'Confirmed', icon: CalendarCheck, colour: 'var(--status-confirmed)' },
  'checked-in': { label: 'Checked in', icon: LogIn, colour: 'var(--status-checked-in)' },
  'in-progress': { label: 'In progress', icon: Wrench, colour: 'var(--status-in-progress)' },
  approval: { label: 'Awaiting approval', icon: ClockAlert, colour: 'var(--status-approval)' },
  parts: { label: 'Awaiting parts', icon: PackageSearch, colour: 'var(--status-parts)' },
  blocked: { label: 'Blocked', icon: TriangleAlert, colour: 'var(--status-blocked)' },
  unavailable: { label: 'Unavailable', icon: CircleSlash, colour: 'var(--status-unavailable)' },
  tentative: { label: 'Tentative', icon: CircleDashed, colour: 'var(--status-tentative)' },
  complete: { label: 'Complete', icon: CircleCheck, colour: 'var(--status-complete)' },
}
