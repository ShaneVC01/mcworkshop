import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarPlus, CircleCheck, Coffee } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { useSession } from '@/auth/session'
import { CapacityBar, CapacityFigures, Card, freeLabel, JobTile } from '@/components/domain/job-bits'
import { PageHeader } from '@/components/shell/app-shell'
import { DataView, EmptyState, Skeleton } from '@/components/states'
import { useTodaySummary } from '@/data/hooks'
import { formatDayLong, formatHours, workingToday } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TodaySummary } from '@/types'

export const Route = createFileRoute('/_office/today')({ component: TodayPage })

const tiles: { key: keyof TodaySummary['counts']; label: string; colour: string }[] = [
  { key: 'arriving', label: 'Arriving', colour: 'var(--status-confirmed)' },
  { key: 'inProgress', label: 'In progress', colour: 'var(--status-in-progress)' },
  { key: 'approval', label: 'Need approval', colour: 'var(--status-approval)' },
  { key: 'parts', label: 'Awaiting parts', colour: 'var(--status-parts)' },
  { key: 'blocked', label: 'Blocked', colour: 'var(--status-blocked)' },
  { key: 'ready', label: 'Complete', colour: 'var(--foreground)' },
]

function TodayPage() {
  const day = workingToday()
  const summary = useTodaySummary(day)
  const user = useSession()
  const canBook = useCan('booking.create')

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <PageHeader
        title={`G'day, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle={formatDayLong(day)}
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
      <DataView
        query={summary}
        loading={
          <div className="space-y-4 px-4 sm:px-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        {(data) => (
          <div className="space-y-6 px-4 sm:px-6">
            <Card className="p-4 sm:p-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-xl">Workshop hours today</h2>
                <Link to="/calendar" className="min-h-touch content-center font-semibold text-primary-strong underline">
                  Open calendar
                </Link>
              </div>
              <CapacityBar capacity={data.capacity} className="mb-4 h-4" />
              <CapacityFigures capacity={data.capacity} />
            </Card>

            <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
              {tiles.map((t) => (
                <li key={t.key}>
                  <Link
                    to="/workshop"
                    className="block rounded-xl border bg-card p-4 shadow-card hover:border-foreground/40"
                    style={{ borderLeft: `6px solid ${t.colour}` }}
                  >
                    <div className="tabular font-display text-4xl font-medium">{data.counts[t.key]}</div>
                    <div className="text-muted-foreground">{t.label}</div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_22rem]">
              <section>
                <h2 className="mb-3 text-xl">Needs attention</h2>
                {data.needsAttention.length === 0 ? (
                  <Card>
                    <EmptyState icon={CircleCheck} title="Nothing needs attention">
                      No overdue, blocked or unassigned jobs right now.
                    </EmptyState>
                  </Card>
                ) : (
                  <ul className="grid gap-3 @2xl:grid-cols-2">
                    {data.needsAttention.map((s) => (
                      <li key={s.booking.id}>
                        <JobTile s={s} to="/bookings/$id" params={{ id: s.booking.id }} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-xl">Technicians</h2>
                <Card className="divide-y">
                  {data.capacity.byTechnician.map((c) => {
                    const tech = data.idleTechnicians.find((t) => t.id === c.technicianId)
                    return (
                      <div key={c.technicianId} className="p-3">
                        <div className="tabular flex items-baseline justify-between gap-2">
                          <span className="font-semibold">{data.technicians.find((t) => t.id === c.technicianId)?.name}</span>
                          <span className={cn('text-sm font-semibold', c.unavailableReason ? 'text-muted-foreground' : c.freeHours < 0 ? 'text-status-blocked' : 'text-primary-strong')}>
                            {freeLabel(c)}
                          </span>
                        </div>
                        {!c.unavailableReason && (
                          <>
                            <CapacityBar capacity={c} className="mt-2" />
                            <div className="tabular mt-1 flex justify-between text-sm text-muted-foreground">
                              <span>
                                {formatHours(c.bookedHours)} of {formatHours(c.availableHours)}
                              </span>
                              {tech && (
                                <span className="inline-flex items-center gap-1">
                                  <Coffee className="size-4" aria-hidden="true" />
                                  Not on a job
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </Card>
              </section>
            </div>
          </div>
        )}
      </DataView>
    </div>
  )
}
