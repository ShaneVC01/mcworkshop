import { useSyncExternalStore } from 'react'
import { getDb, subscribe } from '@/data/mock/store'
import type { Action, Role } from '@/types'
import { ADMIN_ONLY } from './default-permissions'
import { useSession } from './session'

export type { Action }

/**
 * Who can do what. The matrix lives in the data (Admin, Roles and access) and starts from the PRD.
 * Administrators always keep every permission so nobody can lock themselves out, and the actions
 * in ADMIN_ONLY stay with administrators. Enforced again by RLS and Edge Functions in later phases.
 */
export function can(role: Role | undefined, action: Action) {
  if (!role) return false
  if (role === 'admin') return true
  if (ADMIN_ONLY.includes(action)) return false
  return getDb().rolePermissions[role]?.includes(action) ?? false
}

export function useCan(action: Action) {
  const role = useSession()?.role
  return useSyncExternalStore(subscribe, () => can(role, action), () => false)
}

/** True when the signed in role can open any Admin screen. */
export function useCanAdmin() {
  const role = useSession()?.role
  return useSyncExternalStore(subscribe, () => canAdmin(role), () => false)
}

export function canAdmin(role: Role | undefined) {
  return (['admin.workshop', 'admin.catalogue.view', 'admin.users', 'integration.view'] as Action[]).some((a) => can(role, a))
}
