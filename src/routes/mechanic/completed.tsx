import { createFileRoute, Link } from '@tanstack/react-router'
import { CheckCheck } from 'lucide-react'
import { useSession } from '@/auth/session'
import { RegoPlate } from '@/components/domain/rego-plate'
import { DataView, EmptyState } from '@/components/states'
import { useCompletedJobs } from '@/data/hooks'
import { dayKey, formatDayRelative, formatDuration, minutesBetween } from '@/lib/format'

export const Route = createFileRoute('/mechanic/completed')({ component: CompletedPage })

function CompletedPage() {
  const user = useSession()
  const completed = useCompletedJobs(user?.technicianId)
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-8">
      <h1 className="mb-4 text-3xl">Completed</h1>
      <DataView
        query={completed}
        isEmpty={(jobs) => jobs.length === 0}
        empty={
          <EmptyState icon={CheckCheck} title="No completed jobs yet">
            Jobs you finish will be listed here.
          </EmptyState>
        }
      >
        {(jobs) => (
          <ul className="space-y-2">
            {jobs.map((s) => {
              const clocked = s.job.timeEntries.reduce((sum, t) => sum + minutesBetween(t.startedAt, t.endedAt ?? t.startedAt), 0)
              return (
                <li key={s.booking.id}>
                  <Link to="/mechanic/jobs/$id" params={{ id: s.job.id }} className="flex min-h-20 items-center gap-3 rounded-xl border bg-card p-3 shadow-card">
                    <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.booking.serviceName}</span>
                      <span className="tabular block truncate text-muted-foreground">
                        {formatDayRelative(dayKey(s.booking.startAt))}, {formatDuration(clocked)} clocked
                      </span>
                    </span>
                    <CheckCheck className="size-6 shrink-0 text-primary-strong" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </DataView>
    </div>
  )
}
