import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarPlus, NotebookPen } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { JobTile } from '@/components/domain/job-bits'
import { PageHeader } from '@/components/shell/app-shell'
import { DataView, EmptyState } from '@/components/states'
import { useBookings } from '@/data/hooks'
import { dayKey, workingToday } from '@/lib/format'
import { isFinished } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { ScheduledJob } from '@/types'

export const Route = createFileRoute('/_office/bookings/')({ component: BookingsPage })

const filters = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
] as const

function BookingsPage() {
  const bookings = useBookings()
  const canBook = useCan('booking.create')
  const [filter, setFilter] = useState<(typeof filters)[number]['key']>('today')
  const today = workingToday()

  const pick = (list: ScheduledJob[]) => {
    if (filter === 'today') return list.filter((s) => dayKey(s.booking.startAt) === today).reverse()
    if (filter === 'upcoming') return list.filter((s) => dayKey(s.booking.startAt) > today && !isFinished(s.job.status)).reverse()
    return list.filter((s) => dayKey(s.booking.startAt) < today)
  }

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
      <div className="px-4 sm:px-6">
        <div className="mb-4 inline-flex rounded-lg border p-0.5" role="group" aria-label="Show">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn('min-h-10 rounded-md px-4 font-semibold', filter === f.key && 'bg-foreground text-background')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <DataView query={bookings}>
          {(list) => {
            const shown = pick(list)
            if (shown.length === 0) {
              return (
                <EmptyState icon={NotebookPen} title="No bookings here">
                  {filter === 'today' ? 'Nothing is booked for today.' : 'Nothing to show for this filter.'}
                </EmptyState>
              )
            }
            return (
              <ul className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
                {shown.map((s) => (
                  <li key={s.booking.id}>
                    <JobTile s={s} to="/bookings/$id" params={{ id: s.booking.id }} showDay={filter !== 'today'} />
                  </li>
                ))}
              </ul>
            )
          }}
        </DataView>
      </div>
    </div>
  )
}
