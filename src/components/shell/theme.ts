import { useSyncExternalStore } from 'react'

const KEY = 'mcw-theme'
const listeners = new Set<() => void>()

function isDark() {
  return document.documentElement.classList.contains('dark')
}

export function applyStoredTheme() {
  try {
    document.documentElement.classList.toggle('dark', localStorage.getItem(KEY) === 'dark')
  } catch {
    // Light theme is the default.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false)
  return {
    dark,
    toggle: () => {
      const next = !isDark()
      document.documentElement.classList.toggle('dark', next)
      try {
        localStorage.setItem(KEY, next ? 'dark' : 'light')
      } catch {
        // Not remembered in private browsing.
      }
      listeners.forEach((l) => l())
    },
  }
}
