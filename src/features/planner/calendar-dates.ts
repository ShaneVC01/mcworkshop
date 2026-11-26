/** Date helpers shared by the planner's views and its date picker. */
import { addDays, dayKey, formatDayShort, mondayOf } from '@/lib/format'

export type PlannerView = 'day' | 'week' | 'month'

const monthLong = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** YYYY-MM moved by a number of months. */
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export const monthLabel = (month: string) => monthLong.format(new Date(`${month}-01T00:00:00Z`))

/** What the picker button says: the day, the week or the month on screen. */
export function periodLabel(view: PlannerView, day: string) {
  if (view === 'month') return monthLabel(day.slice(0, 7))
  if (view === 'week') return `Week of ${formatDayShort(mondayOf(day))}`
  return day === dayKey() ? `Today, ${formatDayShort(day)}` : formatDayShort(day)
}

/** Every day of a month for the planner: from the Monday before the 1st to the Sunday after the last. */
export function monthDays(month: string) {
  const first = mondayOf(`${month}-01`)
  const days: string[] = []
  for (let d = first; d.startsWith(month) || d < `${month}-01` || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d)
  return days
}

