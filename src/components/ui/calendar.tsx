import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, dayKey, formatDayShort, mondayOf, weekdayOf } from '@/lib/format'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLong = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const shift = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const label = (month: string) => monthLong.format(new Date(`${month}-01T00:00:00Z`))

/** The header every calendar shares: previous, the month or year, next. */
export function CalendarHeading({ text, onPrev, onNext, prevDisabled }: { text: string; onPrev: () => void; onNext: () => void; prevDisabled?: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <button type="button" aria-label="Previous" disabled={prevDisabled} onClick={onPrev} className="flex size-touch items-center justify-center rounded-lg hover:bg-secondary disabled:opacity-40">
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <span className="font-display text-lg font-medium" aria-live="polite">{text}</span>
      <button type="button" aria-label="Next" onClick={onNext} className="flex size-touch items-center justify-center rounded-lg hover:bg-secondary">
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * A month of days, used by every date control in the app. In week mode a tap picks the whole week
 * and the row lights up together. Days before `min` cannot be picked.
 */
export function MonthDays({ value, onPick, mode = 'day', min }: { value?: string; onPick: (day: string) => void; mode?: 'day' | 'week'; min?: string }) {
  const today = dayKey()
  const [month, setMonth] = useState((value ?? min ?? today).slice(0, 7))
  const first = mondayOf(`${month}-01`)
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(first, w * 7 + i)))
    .filter((week) => week.some((d) => d.startsWith(month)))
  const selectedWeek = value ? mondayOf(value) : undefined

  return (
    <div>
      <CalendarHeading text={label(month)} onPrev={() => setMonth(shift(month, -1))} onNext={() => setMonth(shift(month, 1))} prevDisabled={Boolean(min && month <= min.slice(0, 7))} />
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">
        {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="space-y-1">
        {weeks.map((week) => {
          const inWeek = mode === 'week' && week[0] === selectedWeek
          return (
            <div key={week[0]} className={cn('grid grid-cols-7 rounded-lg', mode === 'week' && 'hover:bg-secondary', inWeek && 'bg-primary text-primary-foreground hover:bg-primary')}>
              {week.map((d) => {
                const chosen = mode === 'day' && d === value
                const outside = !d.startsWith(month)
                const blocked = Boolean(min && d < min)
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={blocked}
                    onClick={() => onPick(mode === 'week' ? mondayOf(d) : d)}
                    aria-label={mode === 'week' ? `Week of ${formatDayShort(mondayOf(d))}` : formatDayShort(d)}
                    aria-current={chosen || (inWeek && weekdayOf(d) === 1) ? 'date' : undefined}
                    className={cn(
                      'tabular flex h-10 items-center justify-center rounded-lg text-sm disabled:opacity-30',
                      mode === 'day' && !blocked && 'hover:bg-secondary',
                      outside && !inWeek && 'text-muted-foreground/60',
                      weekdayOf(d) > 5 && !inWeek && !chosen && 'text-muted-foreground',
                      d === today && !chosen && !inWeek && 'font-bold text-primary-strong underline underline-offset-4',
                      d === today && inWeek && 'font-bold underline underline-offset-4',
                      chosen && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                    )}
                  >
                    {Number(d.slice(8))}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Twelve months of a year. Picks the first of the month. */
export function YearMonths({ value, onPick }: { value: string; onPick: (day: string) => void }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)))
  const current = value.slice(0, 7)
  const thisMonth = dayKey().slice(0, 7)
  return (
    <div>
      <CalendarHeading text={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} />
      <div className="grid grid-cols-3 gap-1">
        {MONTHS.map((m, i) => {
          const month = `${year}-${String(i + 1).padStart(2, '0')}`
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(`${month}-01`)}
              aria-label={label(month)}
              aria-current={month === current ? 'date' : undefined}
              className={cn(
                'flex min-h-touch items-center justify-center rounded-lg font-semibold hover:bg-secondary',
                month === thisMonth && month !== current && 'text-primary-strong underline underline-offset-4',
                month === current && 'bg-primary text-primary-foreground hover:bg-primary',
              )}
            >
              {m}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The footer buttons every picker shares. */
export function PickerButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-touch flex-1 items-center justify-center rounded-lg border-2 font-display font-semibold tracking-[0.06em] uppercase',
        primary ? 'border-foreground hover:bg-secondary' : 'border-transparent text-muted-foreground hover:bg-secondary',
      )}
    >
      {children}
    </button>
  )
}
