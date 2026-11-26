import { CalendarDays } from 'lucide-react'
import { MonthDays, PickerButton, YearMonths } from '@/components/ui/calendar'
import { Popover } from '@/components/ui/popover'
import { workingToday } from '@/lib/format'
import { periodLabel, type PlannerView } from './calendar-dates'

/**
 * Jump straight to any date. Day view picks a day, week view picks a whole week, month view picks a month.
 * Built from the same calendar parts as every other date control in the app.
 */
export function DatePicker({ view, day, onPick }: { view: PlannerView; day: string; onPick: (day: string) => void }) {
  return (
    <Popover
      align="center"
      label={view === 'month' ? 'Pick a month' : view === 'week' ? 'Pick a week' : 'Pick a day'}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          data-popover-trigger
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
          className="flex min-h-touch items-center gap-2 border-x px-4 font-semibold whitespace-nowrap"
        >
          <CalendarDays className="size-5 text-muted-foreground" aria-hidden="true" />
          {periodLabel(view, day)}
        </button>
      )}
    >
      {(close) => {
        const pick = (d: string) => {
          onPick(d)
          close()
        }
        return (
          <>
            {view === 'month' ? <YearMonths value={day} onPick={pick} /> : <MonthDays mode={view} value={day} onPick={pick} />}
            <div className="mt-3 flex">
              <PickerButton primary onClick={() => pick(workingToday())}>Today</PickerButton>
            </div>
          </>
        )
      }}
    </Popover>
  )
}
