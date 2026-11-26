import { BadgeCheck, CalendarCheck, CircleCheck, CircleDashed, CircleSlash, ClipboardCheck, ClockAlert, KeyRound, LogIn, PackageSearch, Receipt, TriangleAlert, UserRoundCheck, Wrench, type LucideIcon } from 'lucide-react'
export type StatusTone =
  | 'checking'
  | 'to-invoice'
  | 'collect'
  | 'paid'
  | 'confirmed'
  | 'checked-in'
  | 'assigned'
  | 'in-progress'
  | 'approval'
  | 'parts'
  | 'blocked'
  | 'unavailable'
  | 'tentative'
  | 'complete'

export const statusTones: Record<StatusTone, { label: string; icon: LucideIcon; colour: string }> = {
  confirmed: { label: 'Confirmed', icon: CalendarCheck, colour: 'var(--status-confirmed)' },
  'checked-in': { label: 'Waiting assignment', icon: LogIn, colour: 'var(--status-checked-in)' },
  // Same colour as arrived, told apart by the icon and the words.
  assigned: { label: 'Assigned', icon: UserRoundCheck, colour: 'var(--status-checked-in)' },
  'in-progress': { label: 'In progress', icon: Wrench, colour: 'var(--status-in-progress)' },
  approval: { label: 'Awaiting approval', icon: ClockAlert, colour: 'var(--status-approval)' },
  parts: { label: 'Awaiting parts', icon: PackageSearch, colour: 'var(--status-parts)' },
  blocked: { label: 'Blocked', icon: TriangleAlert, colour: 'var(--status-blocked)' },
  unavailable: { label: 'Unavailable', icon: CircleSlash, colour: 'var(--status-unavailable)' },
  tentative: { label: 'Tentative', icon: CircleDashed, colour: 'var(--status-tentative)' },
  complete: { label: 'Work complete', icon: CircleCheck, colour: 'var(--status-complete)' },
  checking: { label: 'Being checked', icon: ClipboardCheck, colour: 'var(--status-approval)' },
  'to-invoice': { label: 'Ready to invoice', icon: Receipt, colour: 'var(--status-parts)' },
  collect: { label: 'Ready to collect', icon: KeyRound, colour: 'var(--status-confirmed)' },
  paid: { label: 'Paid', icon: BadgeCheck, colour: 'var(--status-complete)' },
}
