import { Check, Lock, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/domain/job-bits'
import { dayKey, formatDayLong, formatHours } from '@/lib/format'
import { monthDays } from './calendar-dates'
import { cn } from '@/lib/utils'
import type { CapacitySummary, ScheduledJob } from '@/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Less than this many free hours and the day shows as full. */
const FULL_BELOW = 1

/**
 * The month at a glance on the whole workshop's hours: green days have room, red days are full or over.
 * Tap a day to open it.
 */
export function MonthGrid({ month, capacity, jobs, onPick }: { month: string; capacity: CapacitySummary[]; jobs: ScheduledJob[]; onPick: (day: string) => void }) {
  const days = monthDays(month)
  const today = dayKey()
  return (
    <Card className="p-2 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm" aria-label="Key">
        <span className="inline-flex items-center gap-1.5"><Check className="size-4 text-primary-strong" aria-hidden="true" />Room</span>
        <span className="inline-flex items-center gap-1.5"><TriangleAlert className="size-4 text-destructive" aria-hidden="true" />Full or over</span>
        <span className="inline-flex items-center gap-1.5"><Lock className="size-4 text-muted-foreground" aria-hidden="true" />Closed</span>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-center font-display text-sm font-medium text-muted-foreground sm:text-base">{d}</div>
        ))}
        {days.map((d) => {
          const c = capacity.find((x) => x.day === d)
          const outside = !d.startsWith(month)
          const past = d < today
          // Free time on a day already gone means nothing, so past days just show what was booked.
          const closed = !c || c.availableHours === 0 || past
          const full = !closed && c.freeHours < FULL_BELOW
          const count = jobs.filter((s) => dayKey(s.booking.startAt) === d).length
          const status = past ? `${count} ${count === 1 ? 'booking' : 'bookings'}` : closed ? 'Closed' : full ? (c.freeHours < 0 ? `${formatHours(-c.freeHours)} over` : 'Full') : `${formatHours(c.freeHours)} free`
          const used = c && c.availableHours ? Math.min(1, (c.confirmedHours + c.tentativeHours) / c.availableHours) : 0
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={`${formatDayLong(d)}, ${status}, ${count} ${count === 1 ? 'booking' : 'bookings'}`}
              aria-current={d === today ? 'date' : undefined}
              className={cn(
                'flex min-h-16 flex-col items-start gap-1 rounded-lg border-2 p-1.5 text-left sm:min-h-24 sm:p-2',
                closed ? 'border-transparent bg-secondary text-muted-foreground' : full ? 'border-destructive bg-destructive/10' : 'border-primary/60 bg-accent',
                (outside || past) && 'opacity-50',
                d === today && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              )}
            >
              <span className="font-display text-lg leading-none font-medium sm:text-2xl">{Number(d.slice(8))}</span>
              <span className={cn('flex items-center gap-1 text-xs font-semibold sm:text-sm', full && 'text-destructive', !closed && !full && 'text-primary-strong')}>
                {past ? null : closed ? <Lock className="size-3.5 shrink-0" aria-hidden="true" /> : full ? <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /> : <Check className="size-4 shrink-0" aria-hidden="true" />}
                <span className="max-sm:sr-only">{status}</span>
              </span>
              {!closed && (
                <>
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-background" aria-hidden="true">
                    <span className={cn('block h-full rounded-full', full ? 'bg-destructive' : 'bg-primary')} style={{ width: `${used * 100}%` }} />
                  </span>
                  <span className="tabular hidden text-sm text-muted-foreground sm:block">{count} {count === 1 ? 'booking' : 'bookings'}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
