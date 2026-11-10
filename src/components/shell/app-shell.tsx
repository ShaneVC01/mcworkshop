import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Outlet, useNavigate, type LinkProps } from '@tanstack/react-router'
import { LogOut, Moon, Search, Sun, X, type LucideIcon } from 'lucide-react'
import { ROLE_LABEL, setSession, useSession } from '@/auth/session'
import { RegoPlate } from '@/components/domain/rego-plate'
import { OfflineBanner } from '@/components/states'
import { useLiveData, useSearch } from '@/data/hooks'
import { cn } from '@/lib/utils'
import { InstallPrompt } from './install-prompt'
import { useTheme } from './theme'

export interface NavItem {
  to: LinkProps['to']
  label: string
  icon: LucideIcon
  exact?: boolean
}

/**
 * Adaptive shell on black chrome, as on the website.
 * Phone: top bar and bottom tab bar. Tablet: navigation rail. Desktop: sidebar.
 */
export function AppShell({ nav, showSearch = true }: { nav: NavItem[]; showSearch?: boolean }) {
  useLiveData()
  return (
    <div className="flex h-dvh flex-col bg-background sm:flex-row">
      <aside className="hidden w-[5.5rem] shrink-0 flex-col bg-chrome text-chrome-foreground sm:flex lg:w-60">
        <div className="flex h-16 items-center justify-center px-3 lg:justify-start lg:px-5">
          <img src="/logo-4wd.png" alt="McCormacks 4WD" className="h-6 w-auto lg:hidden" />
          <img src="/logo-mccormacks.png" alt="McCormacks 4WD" className="hidden h-8 w-auto lg:block" />
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2 lg:px-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="group relative flex min-h-touch-lg flex-col items-center justify-center gap-1 rounded-lg px-2 font-display text-xs tracking-wide transition-colors hover:bg-chrome-raised lg:min-h-touch lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-lg"
              activeProps={{ className: 'bg-chrome-raised text-chrome-foreground-active', 'aria-current': 'page' }}
            >
              <span className="absolute top-2 bottom-2 left-0 hidden w-1 rounded-full bg-chrome-accent group-aria-[current=page]:block" />
              <item.icon className="size-6 shrink-0 lg:size-5" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden p-3 lg:block">
          <UserMenu placement="top" />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="pt-safe z-20 shrink-0 bg-chrome text-chrome-foreground sm:border-b sm:bg-background sm:text-foreground">
          <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:px-5">
            <img src="/logo-mccormacks.png" alt="McCormacks 4WD" className="h-6 w-auto sm:hidden" />
            {showSearch ? <GlobalSearch /> : <div className="flex-1" />}
            <div className="lg:hidden">
              <UserMenu placement="bottom" />
            </div>
          </div>
        </header>
        <OfflineBanner />
        <InstallPrompt />
        <main className="@container min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <nav
          aria-label="Main"
          className="pb-safe grid shrink-0 auto-cols-fr grid-flow-col bg-chrome text-chrome-foreground sm:hidden"
        >
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 font-display text-[11px] tracking-wide"
              activeProps={{ className: 'text-chrome-foreground-active', 'aria-current': 'page' }}
            >
              <span className="absolute top-0 right-3 left-3 hidden h-1 rounded-b-full bg-chrome-accent in-aria-[current=page]:block" />
              <item.icon className="size-6" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

function UserMenu({ placement }: { placement: 'top' | 'bottom' }) {
  const user = useSession()
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (!user) return null
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)
  const item = 'flex min-h-touch w-full items-center gap-3 rounded-lg px-3 text-left font-medium hover:bg-secondary'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-touch w-full items-center gap-3 rounded-lg px-1.5 text-left hover:bg-chrome-raised sm:max-lg:hover:bg-secondary lg:px-2"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-display font-semibold text-primary-foreground">
          {initials}
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate font-semibold text-chrome-foreground-active">{user.name}</span>
          <span className="block truncate text-sm">{ROLE_LABEL[user.role]}</span>
        </span>
        <span className="sr-only lg:hidden">Account menu for {user.name}</span>
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-30 w-64 rounded-xl border bg-popover p-2 text-popover-foreground shadow-card lg:right-auto lg:left-0',
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          <div className="px-3 py-2 lg:hidden">
            <div className="font-semibold">{user.name}</div>
            <div className="text-sm text-muted-foreground">{ROLE_LABEL[user.role]}</div>
          </div>
          <button type="button" role="menuitem" className={item} onClick={toggle}>
            {dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setSession(null)
              void navigate({ to: '/login' })
            }}
          >
            <LogOut className="size-5" aria-hidden="true" />
            Switch user
          </button>
        </div>
      )}
    </div>
  )
}

/** Rego first search, available on every office screen. */
function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const results = useSearch(query)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
    }
  }, [])

  const hits = results.data?.data ?? []
  const go = (to: string) => {
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    void navigate({ to: to as LinkProps['to'] })
  }

  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:max-w-xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (hits[0]) go(hits[0].to)
        }}
      >
        <label className="relative block">
          <span className="sr-only">Search by rego, customer, mobile, VIN or booking number</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search rego or customer"
            autoComplete="off"
            autoCapitalize="characters"
            enterKeyHint="search"
            className="h-11 w-full rounded-lg border border-transparent bg-chrome-raised pr-10 pl-10 text-base text-white placeholder:text-white/60 sm:border-input sm:bg-secondary sm:text-foreground sm:placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-0 right-0 flex size-11 items-center justify-center text-muted-foreground"
              aria-label="Clear search"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </label>
      </form>
      {open && query.trim().length >= 2 && (
        <div className="absolute top-full right-0 left-0 z-30 mt-2 max-h-[60dvh] overflow-y-auto rounded-xl border bg-popover p-2 text-popover-foreground shadow-card max-sm:fixed max-sm:top-14 max-sm:right-2 max-sm:left-2">
          {results.isError ? (
            <p className="p-3 text-destructive">Search did not load. Try again.</p>
          ) : results.isPending ? (
            <p className="p-3 text-muted-foreground">Searching</p>
          ) : hits.length === 0 ? (
            <div className="p-3">
              <p className="font-semibold">Nothing found for "{query}"</p>
              <button type="button" className="mt-1 min-h-touch font-semibold text-primary-strong underline" onClick={() => go('/bookings/new')}>
                Start a booking for a new vehicle
              </button>
            </div>
          ) : (
            <ul>
              {hits.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => go(hit.to)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-secondary"
                  >
                    {hit.vehicle && (
                      <RegoPlate registration={hit.vehicle.registration} state={hit.vehicle.registrationState} size="sm" className="shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{hit.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">{hit.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 pb-4 sm:px-6">
      <div className="min-w-0">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
