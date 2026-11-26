import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Lock, PackageSearch, X } from 'lucide-react'
import { DataView, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/sheet'
import { useAvailability, useDayAvailability, useMonthAvailability } from '@/data/hooks'
import { dayKey, formatDayLong, formatDayRelative, formatDayShort, formatHours, formatTime, weekdayOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AvailabilityRequest, BookingEstimate, DayAvailability } from '@/types'
import type { ChosenTime } from './booking-bits'
import { Select } from '@/components/ui/fields'

/**
 * Days with room for the work across the whole workshop, earliest first so each day fills before the next.
 * No mechanic is picked here: the workshop assigns one when the vehicle arrives.
 */
export function FitIn({
  request, preferredTime, chosen, onChoose, day, onDay, parts,
}: {
  request: AvailabilityRequest | null
  /** A drop off time picked on the calendar, used when that day offers it. */
  preferredTime?: string
  chosen: ChosenTime | undefined
  onChoose: (chosen: ChosenTime | undefined) => void
  day?: string
  onDay: (day: string | undefined) => void
  parts?: Pick<BookingEstimate, 'orderedParts' | 'partsReadyDay'>
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const fastest = useAvailability(day ? null : request)
  const onDayQuery = useDayAvailability(day ? request : null, day)
  const days: DayAvailability[] = day ? (onDayQuery.data ? [onDayQuery.data.data].filter((d) => d.status === 'open') : []) : (fastest.data?.data ?? [])
  // Only loading and error states are read from it, so one shape will do.
  const query = day ? (onDayQuery as unknown as typeof fastest) : fastest
  const picked = day ? onDayQuery.data?.data : undefined

  // Keep the choice in step with what is on screen: the first day and its first drop off time by default.
  const current = days.find((d) => d.day === chosen?.day) ?? days[0]
  const times = current?.dropOffTimes ?? []
  const time = chosen && chosen.day === current?.day && times.includes(chosen.time) ? chosen.time : preferredTime && times.includes(preferredTime) ? preferredTime : times[0]
  const next = current && time ? { day: current.day, time } : undefined
  useEffect(() => {
    if (next?.day !== chosen?.day || next?.time !== chosen?.time) onChoose(next)
  }, [next?.day, next?.time, chosen?.day, chosen?.time, onChoose]) // eslint-disable-line react-hooks/exhaustive-deps

  const slowest = parts?.orderedParts[0]
  return (
    <section aria-labelledby="fit-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fit-heading" className="text-2xl">When can we fit it in?</h2>
        <Button variant="outline" size="lg" disabled={!request} onClick={() => setCalendarOpen(true)}>
          <CalendarDays aria-hidden="true" />
          Pick a date
        </Button>
      </div>
      {slowest && parts?.partsReadyDay && (
        <div role="note" className="flex gap-3 rounded-xl border-2 border-status-parts bg-status-parts/10 p-3">
          <PackageSearch className="mt-0.5 size-5 shrink-0 text-status-parts" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Parts to order. The earliest day is {formatDayShort(parts.partsReadyDay)}.
            </p>
            <ul className="text-sm">
              {parts.orderedParts.map((p) => (
                <li key={p.code}>{p.name} ({p.code}): {p.leadTimeDays} working {p.leadTimeDays === 1 ? 'day' : 'days'} to arrive</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {!request ? (
        <p className="text-muted-foreground">Choose the work first and the days with room will show here.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {day ? (
              <>
                Room on <span className="font-semibold text-foreground">{formatDayLong(day)}</span>.{' '}
                <button type="button" className="min-h-touch font-semibold text-primary-strong underline" onClick={() => onDay(undefined)}>
                  Show the next days with room
                </button>
              </>
            ) : (
              `The next days with room for ${formatHours(request.labourHours)} of work. The workshop assigns a mechanic when the vehicle arrives.`
            )}
          </p>
          <DataView query={query} loading={<Skeleton className="h-40" />}>
            {() =>
              days.length === 0 ? (
                <p className="font-semibold">
                  {day
                    ? picked?.status === 'parts' ? 'The parts are not in by then. Pick a later date.' : 'That day is full. Pick another date.'
                    : 'Nothing fits in the next three weeks. Pick a date further out.'}
                </p>
              ) : (
                <>
                  <ul className="space-y-2" role="radiogroup" aria-label="Days with room">
                    {days.map((d) => {
                      const active = current?.day === d.day
                      const used = d.availableHours ? Math.min(1, d.bookedHours / d.availableHours) : 1
                      return (
                        <li key={d.day}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onChoose({ day: d.day, time: d.dropOffTimes[0]! })}
                            className={cn(
                              'tabular flex min-h-14 w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-2 px-4 py-2 text-left',
                              active ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
                            )}
                          >
                            <span className="w-32 font-display text-lg font-medium">{formatDayRelative(d.day)}</span>
                            <span className="flex min-w-40 flex-1 items-center gap-3">
                              <span className="h-2 w-24 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                                <span className="block h-full rounded-full bg-primary" style={{ width: `${used * 100}%` }} />
                              </span>
                              <span>{formatHours(Math.max(0, d.freeHours))} free of {formatHours(d.availableHours)}</span>
                            </span>
                            {active && <Check className="size-5 text-primary-strong" aria-hidden="true" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  {current && (
                    <label className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">Drop off on {formatDayRelative(current.day)} at</span>
                      <Select
                        className={cn(fieldClass, 'w-auto min-w-36')}
                        value={time}
                        onChange={(e) => onChoose({ day: current.day, time: e.target.value })}
                      >
                        {times.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                      </Select>
                      {time === times[0] && <span className="text-sm text-muted-foreground">Opening time, so the day fills from the start</span>}
                    </label>
                  )}
                </>
              )
            }
          </DataView>
        </>
      )}
      {calendarOpen && request && (
        <MonthCalendar
          request={request}
          initial={day ?? request.notBefore ?? dayKey()}
          selected={day}
          onClose={() => setCalendarOpen(false)}
          onPick={(d) => {
            onDay(d)
            onChoose(undefined)
            setCalendarOpen(false)
          }}
        />
      )}
    </section>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthName = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** A full month, most of the screen. Green days can take the work, red days are full. */
function MonthCalendar({
  request, initial, selected, onPick, onClose,
}: {
  request: AvailabilityRequest
  initial: string
  selected?: string
  onPick: (day: string) => void
  onClose: () => void
}) {
  const thisMonth = dayKey().slice(0, 7)
  const [month, setMonth] = useState(initial.slice(0, 7))
  const days = useMonthAvailability(request, month)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'PageDown') setMonth((m) => shiftMonth(m, 1))
      if (e.key === 'PageUp') setMonth((m) => (m > thisMonth ? shiftMonth(m, -1) : m))
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      previous?.focus?.()
    }
  }, [onClose, thisMonth])

  const [y, m] = month.split('-').map(Number) as [number, number]
  const label = monthName.format(new Date(Date.UTC(y, m - 1, 1)))
  const lead = weekdayOf(`${month}-01`) - 1

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="month-title"
        tabIndex={-1}
        className="pt-safe pb-safe relative flex h-dvh w-full flex-col bg-background shadow-card outline-none sm:h-[88dvh] sm:w-[88vw] sm:max-w-[1600px] sm:rounded-2xl"
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-5 sm:py-3">
          <Button variant="outline" size="icon" aria-label="Previous month" disabled={month <= thisMonth} onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <h2 id="month-title" className="min-w-40 text-center text-2xl sm:text-3xl">{label}</h2>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
          {month !== thisMonth && (
            <Button variant="ghost" onClick={() => setMonth(thisMonth)}>This month</Button>
          )}
          <div className="ml-auto flex items-center gap-3 max-md:order-last max-md:w-full max-md:justify-between">
            <Legend />
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-touch items-center justify-center rounded-lg hover:bg-secondary">
              <X className="size-6" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="px-3 pt-2 text-sm text-muted-foreground sm:px-5">
          For {formatHours(request.labourHours)} of work across the whole workshop. Pick a green day.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-3 sm:px-5">
          <div className="grid h-full min-h-[28rem] grid-cols-7 grid-rows-[auto] gap-1 sm:gap-2" style={{ gridAutoRows: 'minmax(0,1fr)' }}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="pb-1 text-center font-display text-sm font-medium text-muted-foreground sm:text-base">{d}</div>
            ))}
            {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} aria-hidden="true" />)}
            {days.isPending || days.isError
              ? Array.from({ length: 30 }, (_, i) => <Skeleton key={i} className="h-full min-h-14" />)
              : days.data!.data.map((d) => <DayCell key={d.day} day={d} selected={d.day === selected} onPick={onPick} />)}
          </div>
          {days.isError && <p className="mt-2 text-destructive">The calendar did not load. Try another month or close and open it again.</p>}
        </div>
      </div>
    </div>
  )
}

function DayCell({ day: d, selected, onPick }: { day: DayAvailability; selected: boolean; onPick: (day: string) => void }) {
  const date = Number(d.day.slice(8))
  const open = d.status === 'open'
  const text =
    d.status === 'open' ? `${formatHours(d.freeHours)} free` : d.status === 'full' ? 'Full' : d.status === 'closed' ? 'Closed' : d.status === 'parts' ? 'Parts not in' : ''
  return (
    <button
      type="button"
      disabled={!open}
      onClick={() => onPick(d.day)}
      aria-label={`${formatDayLong(d.day)}, ${open ? `${formatHours(d.freeHours)} free, drop off from ${formatTime(d.dropOffTimes[0]!)}` : text || 'past'}`}
      aria-current={selected ? 'date' : undefined}
      className={cn(
        'flex min-h-14 flex-col items-start justify-between rounded-lg border-2 p-1.5 text-left sm:p-2.5',
        open && 'border-primary bg-accent text-accent-foreground hover:bg-primary hover:text-primary-foreground',
        d.status === 'full' && 'border-destructive bg-destructive/10 text-destructive',
        d.status === 'closed' && 'border-transparent bg-secondary text-muted-foreground',
        d.status === 'parts' && 'border-status-parts/60 border-dashed bg-status-parts/10 text-foreground',
        d.status === 'past' && 'border-transparent text-muted-foreground/50',
        selected && 'ring-4 ring-ring ring-offset-2 ring-offset-background',
      )}
    >
      <span className="font-display text-lg leading-none font-medium sm:text-2xl">{date}</span>
      {d.status !== 'past' && (
        <span className="flex items-center gap-1 text-xs font-semibold sm:text-sm">
          {open ? <Check className="size-4 shrink-0" aria-hidden="true" /> : d.status === 'full' ? <X className="size-4 shrink-0" aria-hidden="true" /> : d.status === 'parts' ? <PackageSearch className="size-4 shrink-0 text-status-parts" aria-hidden="true" /> : <Lock className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="max-sm:sr-only">{text}</span>
        </span>
      )}
      {open && <span className="hidden text-sm whitespace-nowrap sm:block">of {formatHours(d.availableHours)}</span>}
    </button>
  )
}

function Legend() {
  const item = 'inline-flex items-center gap-1.5 text-sm'
  return (
    <div className="flex flex-wrap items-center gap-3" aria-label="Key">
      <span className={item}><span className="flex size-5 items-center justify-center rounded border-2 border-primary bg-accent"><Check className="size-3.5 text-primary-strong" aria-hidden="true" /></span>Fits</span>
      <span className={item}><span className="flex size-5 items-center justify-center rounded border-2 border-destructive bg-destructive/10"><X className="size-3.5 text-destructive" aria-hidden="true" /></span>Full</span>
      <span className={item}><span className="flex size-5 items-center justify-center rounded bg-secondary"><Lock className="size-3 text-muted-foreground" aria-hidden="true" /></span>Closed</span>
      <span className={item}><span className="flex size-5 items-center justify-center rounded border-2 border-dashed border-status-parts/60 bg-status-parts/10"><PackageSearch className="size-3 text-status-parts" aria-hidden="true" /></span>Parts not in</span>
    </div>
  )
}
