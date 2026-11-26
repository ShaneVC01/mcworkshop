import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BellRing, CalendarPlus, ChevronLeft, ChevronRight, CircleCheck, NotebookPen, Phone, Search } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { JobTile } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/sheet'
import { recordCustomerConfirmed } from '@/data/actions'
import { useAction, useBookings } from '@/data/hooks'
import { monthDays, monthLabel, shiftMonth } from '@/features/planner/calendar-dates'
import { CloseOutPanel } from '@/features/workshop/close-out'
import { addWorkingDays, dayKey, formatDateTime, formatDayLong, formatDayRelative, formatTime, normaliseRego, workingToday } from '@/lib/format'
import { CLOSE_OUT, isFinished, isUnconfirmed } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { ScheduledJob } from '@/types'

export const Route = createFileRoute('/_office/bookings/')({ component: BookingsPage })

type Tab = 'today' | 'unconfirmed' | 'finishing' | 'upcoming'

const digits = (s: string) => s.replace(/\D/g, '')

/** Rego, name, mobile or booking number. */
function matches(s: ScheduledJob, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const d = digits(q)
  return (
    normaliseRego(s.vehicle.registration).toLowerCase().includes(normaliseRego(q).toLowerCase()) ||
    s.customer.name.toLowerCase().includes(q) ||
    s.booking.number.toLowerCase().includes(q) ||
    (d.length >= 4 && digits(s.customer.mobile).includes(d))
  )
}

/**
 * The receptionist's page: who is coming today, who has not confirmed, what is coming up, and a quick search
 * for when a customer phones in.
 */
function BookingsPage() {
  const bookings = useBookings()
  const canBook = useCan('booking.create')
  const [tab, setTab] = useState<Tab>('today')
  const [query, setQuery] = useState('')
  const [withPast, setWithPast] = useState(false)
  const today = workingToday()
  const lastDay = addWorkingDays(today, 2)

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <PageHeader
        title="Bookings"
        actions={
          canBook && (
            <Link
              to="/bookings/new"
              className="inline-flex min-h-touch items-center gap-2 rounded-lg bg-primary px-5 font-display font-semibold tracking-[0.06em] text-primary-foreground uppercase shadow-button hover:bg-primary-hover"
            >
              <CalendarPlus className="size-5" aria-hidden="true" />
              New booking
            </Link>
          )
        }
      />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="relative min-w-64 flex-1">
            <span className="sr-only">Find a booking</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              className={cn(fieldClass, 'pl-10')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a booking: rego, name, mobile or booking number"
              autoComplete="off"
            />
          </label>
          <label className="flex min-h-touch items-center gap-2">
            <input type="checkbox" checked={withPast} onChange={(e) => setWithPast(e.target.checked)} className="size-5 accent-[var(--primary)]" />
            Include past bookings
          </label>
        </div>

        <DataView query={bookings}>
          {(list) => {
            if (query.trim()) {
              const found = list.filter((s) => (withPast || dayKey(s.booking.startAt) >= today) && matches(s, query))
              return found.length ? (
                <section aria-label="Search results" className="space-y-2">
                  <p className="text-muted-foreground">{found.length} {found.length === 1 ? 'booking' : 'bookings'} found{withPast ? '' : ' from today on'}.</p>
                  <Tiles list={[...found].sort((a, b) => b.booking.startAt.localeCompare(a.booking.startAt))} showDay />
                </section>
              ) : (
                <EmptyState icon={Search} title="No booking matches">
                  {withPast ? 'Try the rego without spaces or part of the name.' : 'Tick "Include past bookings" to search the history too.'}
                </EmptyState>
              )
            }

            const todays = list.filter((s) => dayKey(s.booking.startAt) === today)
            const unconfirmed = list.filter((s) => isUnconfirmed(s, today, lastDay)).sort((a, b) => a.booking.startAt.localeCompare(b.booking.startAt))
            const tabs: { key: Tab; label: string; count?: number; alert?: boolean }[] = [
              { key: 'today', label: 'Today', count: todays.length },
              { key: 'unconfirmed', label: 'Unconfirmed', count: unconfirmed.length, alert: unconfirmed.length > 0 },
              { key: 'finishing', label: 'Finishing', count: list.filter((s) => CLOSE_OUT.includes(s.job.status)).length },
              { key: 'upcoming', label: 'Upcoming' },
            ]
            return (
              <>
                <div className="grid grid-cols-2 rounded-lg border p-0.5 sm:inline-flex" role="group" aria-label="Show">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      aria-pressed={tab === t.key}
                      onClick={() => setTab(t.key)}
                      className={cn('flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 font-semibold sm:gap-2 sm:px-4', tab === t.key && 'bg-foreground text-background')}
                    >
                      {t.alert && <BellRing className="size-4 max-sm:hidden" aria-hidden="true" />}
                      {t.label}
                      {t.count !== undefined && (
                        <span className={cn('tabular rounded-full px-2 text-sm', t.alert ? 'bg-destructive text-destructive-foreground' : tab === t.key ? 'bg-background/20' : 'bg-secondary')}>
                          {t.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {tab === 'today' && <TodayTab list={todays} unconfirmed={unconfirmed.filter((s) => dayKey(s.booking.startAt) === today)} />}
                {tab === 'unconfirmed' && <Unconfirmed list={unconfirmed} />}
                {tab === 'finishing' && <CloseOutPanel jobs={list} />}
                {tab === 'upcoming' && <Upcoming list={list.filter((s) => dayKey(s.booking.startAt) >= today && !isFinished(s.job.status))} />}
              </>
            )
          }}
        </DataView>
      </div>
    </div>
  )
}

function Tiles({ list, showDay }: { list: ScheduledJob[]; showDay?: boolean }) {
  return (
    <ul className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
      {list.map((s) => (
        <li key={s.booking.id}>
          <JobTile s={s} to="/bookings/$id" params={{ id: s.booking.id }} showDay={showDay} />
        </li>
      ))}
    </ul>
  )
}

function TodayTab({ list, unconfirmed }: { list: ScheduledJob[]; unconfirmed: ScheduledJob[] }) {
  if (!list.length) return <EmptyState icon={NotebookPen} title="Nothing booked today">Use Upcoming to see what is coming.</EmptyState>
  const rest = list.filter((s) => !unconfirmed.includes(s)).sort((a, b) => a.booking.startAt.localeCompare(b.booking.startAt))
  return (
    <div className="space-y-5">
      {unconfirmed.length > 0 && (
        <section aria-labelledby="today-unconfirmed" className="space-y-2">
          <h2 id="today-unconfirmed" className="text-xl">Not confirmed yet, call before they are due</h2>
          <ConfirmList list={unconfirmed} />
        </section>
      )}
      <section aria-label="Today's bookings">
        <Tiles list={rest} />
      </section>
    </div>
  )
}

function Unconfirmed({ list }: { list: ScheduledJob[] }) {
  if (!list.length) {
    return <EmptyState icon={CircleCheck} title="Everyone has confirmed">Bookings for the next two working days whose reminder has no reply show here.</EmptyState>
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">Due in the next two working days. The reminder went out and the customer has not replied yet.</p>
      <ConfirmList list={list} />
    </div>
  )
}

function ConfirmList({ list }: { list: ScheduledJob[] }) {
  const confirm = useAction(recordCustomerConfirmed)
  return (
    <>
      <ActionError error={confirm.error} />
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.booking.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-status-approval bg-card p-3">
            <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
            <div className="min-w-56 flex-1">
              <p className="font-semibold">{s.customer.name}, {formatDayRelative(dayKey(s.booking.startAt))} at {formatTime(s.booking.startAt)}</p>
              <p className="text-sm text-muted-foreground">
                {s.booking.serviceName}. Reminder sent {formatDateTime(s.booking.reminderSentAt!)}, no reply.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${digits(s.customer.mobile)}`} className="inline-flex min-h-touch items-center gap-2 rounded-lg border px-3 font-semibold hover:bg-secondary">
                <Phone className="size-4" aria-hidden="true" />
                {s.customer.mobile}
              </a>
              <Link to="/bookings/$id" params={{ id: s.booking.id }} className="inline-flex min-h-touch items-center rounded-lg border px-3 font-semibold hover:bg-secondary">
                Open
              </Link>
              <Button disabled={confirm.isPending} onClick={() => void confirm.run(s.booking.id, 'phone').catch(() => undefined)}>
                Customer confirmed
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

/** The month ahead at a glance. Tap a day to list its bookings. */
function Upcoming({ list }: { list: ScheduledJob[] }) {
  const today = dayKey()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [day, setDay] = useState<string | undefined>()
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledJob[]>()
    for (const s of list) {
      const d = dayKey(s.booking.startAt)
      map.set(d, [...(map.get(d) ?? []), s])
    }
    return map
  }, [list])
  const chosen = day ? (byDay.get(day) ?? []).sort((a, b) => a.booking.startAt.localeCompare(b.booking.startAt)) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft aria-hidden="true" />
        </Button>
        <h2 className="min-w-44 text-center text-2xl">{monthLabel(month)}</h2>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-center font-display text-sm font-medium text-muted-foreground">{d}</div>
        ))}
        {monthDays(month).map((d) => {
          const jobs = byDay.get(d) ?? []
          const off = !d.startsWith(month) || d < today
          return (
            <button
              key={d}
              type="button"
              disabled={!jobs.length}
              onClick={() => setDay(d)}
              aria-label={`${formatDayLong(d)}, ${jobs.length} ${jobs.length === 1 ? 'booking' : 'bookings'}`}
              aria-pressed={day === d}
              className={cn(
                'flex min-h-16 flex-col items-start gap-1 rounded-lg border-2 p-1.5 text-left sm:min-h-24 sm:p-2',
                jobs.length ? 'border-border bg-card hover:border-foreground/40' : 'border-transparent bg-secondary/60',
                off && 'opacity-50',
                day === d && 'border-primary bg-accent',
                d === today && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              )}
            >
              <span className="font-display text-lg leading-none font-medium sm:text-2xl">{Number(d.slice(8))}</span>
              {jobs.length > 0 && (
                <span className="tabular text-xs font-semibold sm:text-sm">
                  {jobs.length}<span className="max-sm:sr-only"> {jobs.length === 1 ? 'booking' : 'bookings'}</span>
                </span>
              )}
              <span className="hidden flex-col gap-0.5 sm:flex">
                {jobs.slice(0, 3).map((s) => (
                  <span key={s.booking.id} className="truncate text-xs text-muted-foreground">{formatTime(s.booking.startAt)} {s.vehicle.registration}</span>
                ))}
                {jobs.length > 3 && <span className="text-xs text-muted-foreground">plus {jobs.length - 3} more</span>}
              </span>
            </button>
          )
        })}
      </div>
      {day && (
        <section aria-labelledby="day-list" className="space-y-2">
          <h2 id="day-list" className="text-xl">{formatDayLong(day)}</h2>
          {chosen.length ? <Tiles list={chosen} /> : <p className="text-muted-foreground">Nothing booked.</p>}
        </section>
      )}
    </div>
  )
}
