import type { Action, Role, RolePermissions } from '@/types'

/**
 * Starting permissions for each role, from the PRD. Administrators can change them in Admin,
 * Roles and access. Enforced again by RLS and Edge Functions in later phases.
 * Pure data, so the seed can use it without pulling in the store.
 */

export const ROLES: Role[] = ['advisor', 'controller', 'mechanic', 'manager', 'admin']

export interface ActionInfo {
  action: Action
  label: string
  hint: string
  group: 'Planning' | 'Jobs and quotes' | 'Reports' | 'Admin'
  /** Always administrators only. Not shown as a switch for other roles. */
  adminOnly?: boolean
}

export const ACTIONS: ActionInfo[] = [
  { action: 'calendar.view', label: 'See the calendar', hint: 'Open the planner and technician timeline.', group: 'Planning' },
  { action: 'booking.create', label: 'Make bookings', hint: 'Book a vehicle in and pick a time.', group: 'Planning' },
  { action: 'booking.move', label: 'Move bookings', hint: 'Drag a booking to another time or technician.', group: 'Planning' },
  { action: 'booking.override-conflict', label: 'Override a double booking warning', hint: 'Book over a clash after being warned.', group: 'Planning' },
  { action: 'board.move', label: 'Move jobs on the workshop board', hint: 'Change a job between stages.', group: 'Jobs and quotes' },
  { action: 'quote.manage', label: 'Send and manage quotes', hint: 'Price additional work and record approval.', group: 'Jobs and quotes' },
  { action: 'job.work', label: 'Work on jobs', hint: 'Start jobs, tick checklists, record findings.', group: 'Jobs and quotes' },
  { action: 'reports.view', label: 'See reports', hint: 'Utilisation and workshop summaries.', group: 'Reports' },
  { action: 'money.view', label: 'See prices and totals', hint: 'Quote and invoice amounts.', group: 'Reports' },
  { action: 'admin.workshop', label: 'Change workshop hours, bays and closed days', hint: 'Default hours, daily target, labour rate, bays.', group: 'Admin' },
  { action: 'admin.catalogue.view', label: 'See the vehicle library and service profiles', hint: 'Read only.', group: 'Admin' },
  { action: 'admin.catalogue.edit', label: 'Edit the vehicle library and service profiles', hint: 'Times, parts and checklists for each service.', group: 'Admin' },
  { action: 'admin.users', label: 'Manage staff and permissions', hint: 'Add people, set roles, change what roles can do.', group: 'Admin', adminOnly: true },
  { action: 'integration.view', label: 'See the connection to the back office system', hint: 'Test the connection and review sent changes.', group: 'Admin', adminOnly: true },
]

export const ADMIN_ONLY: Action[] = ACTIONS.filter((a) => a.adminOnly).map((a) => a.action)

const everyone: Role[] = ['advisor', 'controller', 'manager', 'admin']

export function defaultRolePermissions(): RolePermissions {
  const grants: Record<Action, Role[]> = {
    'calendar.view': everyone,
    'booking.create': everyone,
    'booking.move': everyone,
    'booking.override-conflict': ['controller', 'manager', 'admin'],
    'quote.manage': everyone,
    'job.work': ['mechanic', 'manager', 'admin'],
    'board.move': everyone,
    'reports.view': everyone,
    'money.view': everyone,
    // Catalogue editing starts with administrators only. Grant it to managers here if wanted.
    'admin.workshop': ['admin'],
    'admin.catalogue.view': ['controller', 'manager', 'admin'],
    'admin.catalogue.edit': ['admin'],
    'admin.users': ['admin'],
    'integration.view': ['admin'],
  }
  const out = Object.fromEntries(ROLES.map((r) => [r, [] as Action[]])) as RolePermissions
  for (const [action, roles] of Object.entries(grants) as [Action, Role[]][]) {
    for (const role of roles) out[role].push(action)
  }
  return out
}
