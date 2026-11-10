import type { Role } from '@/types'
import { useSession } from './session'

/** Permission matrix from the PRD. Enforced again by RLS and Edge Functions in later phases. */
export type Action =
  | 'calendar.view'
  | 'booking.create'
  | 'booking.move'
  | 'booking.override-conflict'
  | 'quote.manage'
  | 'job.work'
  | 'board.move'
  | 'reports.view'
  | 'money.view'
  | 'integration.view'

const matrix: Record<Action, Role[]> = {
  'calendar.view': ['advisor', 'controller', 'manager', 'admin'],
  'booking.create': ['advisor', 'controller', 'manager', 'admin'],
  'booking.move': ['advisor', 'controller', 'manager', 'admin'],
  'booking.override-conflict': ['controller', 'manager', 'admin'],
  'quote.manage': ['advisor', 'controller', 'manager', 'admin'],
  'job.work': ['mechanic', 'manager', 'admin'],
  'board.move': ['advisor', 'controller', 'manager', 'admin'],
  'reports.view': ['advisor', 'controller', 'manager', 'admin'],
  'money.view': ['advisor', 'controller', 'manager', 'admin'],
  'integration.view': ['admin'],
}

export function can(role: Role | undefined, action: Action) {
  return role ? matrix[action].includes(role) : false
}

export function useCan(action: Action) {
  return can(useSession()?.role, action)
}
