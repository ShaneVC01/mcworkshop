import { useSyncExternalStore } from 'react'
import type { Role, StaffUser } from '@/types'

/** Mock sign in. The chosen staff member is kept in localStorage. Replaced by Supabase Auth later. */
const KEY = 'mcw-session'
const listeners = new Set<() => void>()
let cached: StaffUser | null | undefined

function load(): StaffUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StaffUser) : null
  } catch {
    return null
  }
}

export function getSession(): StaffUser | null {
  if (cached === undefined) cached = load()
  return cached
}

export function setSession(user: StaffUser | null) {
  cached = user
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user))
    else localStorage.removeItem(KEY)
  } catch {
    // Private browsing. The session lasts until the tab closes.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSession, () => null)
}

export function homeFor(role: Role) {
  return role === 'mechanic' ? '/mechanic' : '/today'
}

export const ROLE_LABEL: Record<Role, string> = {
  advisor: 'Service advisor',
  controller: 'Workshop controller',
  mechanic: 'Technician',
  manager: 'Workshop manager',
  admin: 'Administrator',
}
