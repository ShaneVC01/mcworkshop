import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Coffee, Play, Search } from 'lucide-react'
import { useSession } from '@/auth/session'
import { JobFlags, JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { DataView, EmptyState, Skeleton } from '@/components/states'
import { useMyDay } from '@/data/hooks'
import { addWorkingDays, formatDayLong, formatDayRelative, formatDuration, formatTime, normaliseRego, workingToday } from '@/lib/format'
import { isFinished } from '@/lib/job-state'
import type { ScheduledJob } from '@/types'

export const Route = createFileRoute('/mechanic/')({ component: MyDayPage })

function MyDayPage() {
  const user = useSession()
  const [day, setDay] = useState(workingToday())
  const [rego, setRego] = useState('')
  const myDay = useMyDay(user?.technicianId, day)
  const isToday = day === workingToday()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-8">
      <h1 className="text-3xl">
        {greeting}, {user?.name.split(' ')[0]}
      </h1>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" aria-label="Previous day" onClick={() => setDay(addWorkingDays(day, -1))} className="flex size-touch-lg items-center justify-center rounded-lg border">
          <ChevronLeft className="size-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-display text-xl font-medium">{formatDayRelative(day)}</div>
          <div className="text-sm text-muted-foreground">{formatDayLong(day)}</div>
        </div>
        <button type="button" aria-label="Next day" onClick={() => setDay(addWorkingDays(day, 1))} className="flex size-touch-lg items-center justify-center rounded-lg border">
          <ChevronRight className="size-6" aria-hidden="true" />
        </button>
      </div>

      <DataView query={myDay} loading={<div className="mt-5 space-y-3"><Skeleton className="h-64" /><Skeleton className="h-20" /></div>}>
        {(jobs) => {
          const open = jobs.filter((s) => !isFinished(s.job.status))
          const current = open.find((s) => s.job.status === 'IN_PROGRESS') ?? open[0]
          const q = normaliseRego(rego)
          const rest = jobs.filter((s) => s !== current && (!q || s.vehicle.registration.includes(q)))
          if (jobs.length === 0) {
            return (
              <EmptyState icon={Coffee} title={isToday ? 'No jobs for you today' : 'Nothing booked for you'}>
                Check with the workshop controller, or look at another day.
              </EmptyState>
            )
          }
          return (
            <>
              {current ? (
                <section className="mt-5">
                  <h2 className="mb-2 text-lg text-muted-foreground">{current.job.status === 'IN_PROGRESS' ? 'Now' : isToday ? 'Up next' : 'First job'}</h2>
                  <CurrentCard s={current} />
                </section>
              ) : (
                <p className="mt-5 rounded-xl bg-accent p-4 text-lg font-semibold text-accent-foreground">All jobs for this day are complete.</p>
              )}

              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="text-lg text-muted-foreground">{current ? 'Rest of the day' : 'Jobs'}</h2>
                  <label className="relative block w-44">
                    <span className="sr-only">Find a job by rego</span>
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      value={rego}
                      onChange={(e) => setRego(e.target.value)}
                      placeholder="Enter rego"
                      autoCapitalize="characters"
                      className="h-11 w-full rounded-lg border border-input bg-background pr-2 pl-10 uppercase placeholder:normal-case"
                    />
                  </label>
                </div>
                {rest.length === 0 ? (
                  <p className="text-muted-foreground">{q ? `No job of yours matches ${q}.` : 'Nothing else booked.'}</p>
                ) : (
                  <ul className="space-y-2">
                    {rest.map((s) => (
                      <li key={s.booking.id}>
                        <Link
                          to="/mechanic/jobs/$id"
                          params={{ id: s.job.id }}
                          className="flex min-h-20 items-center gap-3 rounded-xl border bg-card p-3 shadow-card active:border-foreground/40"
                        >
                          <span className="tabular w-20 shrink-0 font-display text-lg font-medium">{formatTime(s.booking.startAt)}</span>
                          <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" className="shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{s.vehicle.make} {s.vehicle.model}</span>
                            <span className="block truncate text-muted-foreground">{s.booking.serviceName}</span>
                          </span>
                          {isFinished(s.job.status) && <JobStatusPill job={s.job} className="max-sm:hidden" />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )
        }}
      </DataView>
    </div>
  )
}

function CurrentCard({ s }: { s: ScheduledJob }) {
  const { vehicle, booking, job } = s
  const started = job.timeEntries.length > 0
  return (
    <article className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="lg" />
        <JobStatusPill job={job} />
      </div>
      <h3 className="mt-4 text-3xl">
        {vehicle.make} {vehicle.model}
      </h3>
      <p className="text-xl">{booking.serviceName}</p>
      <p className="tabular mt-1 text-muted-foreground">
        {formatTime(booking.startAt)}, estimated {formatDuration(booking.estimatedLabourHours * 60)}, due {formatTime(job.promisedAt)}
      </p>
      <div className="mt-2 empty:hidden">
        <JobFlags s={s} />
      </div>
      <Link
        to="/mechanic/jobs/$id"
        params={{ id: job.id }}
        className="mt-5 flex min-h-16 w-full items-center justify-center gap-2 rounded-lg bg-primary font-display text-xl font-semibold tracking-[0.06em] text-primary-foreground uppercase shadow-button active:bg-primary-hover"
      >
        <Play className="size-6" aria-hidden="true" />
        {started ? 'Continue job' : 'Open job'}
      </Link>
    </article>
  )
}
