import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarPlus, Check, History, Phone, TriangleAlert } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { Card, JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { SyncBadge } from '@/components/domain/sync-badge'
import { DataView, EmptyState } from '@/components/states'
import { useVehicle, useVehicleTimeline } from '@/data/hooks'
import { dayKey, formatDate, formatDayRelative, formatKm, formatTime } from '@/lib/format'
import { isFinished } from '@/lib/job-state'
import type { Finding, TimelineVisit } from '@/types'

export const Route = createFileRoute('/_office/vehicles/$id')({ component: VehiclePage })

const severityLabel: Record<Finding['severity'], string> = { monitor: 'Monitor', recommended: 'Recommended', safety: 'Safety' }

function VehiclePage() {
  const { id } = Route.useParams()
  const detail = useVehicle(id)
  const timeline = useVehicleTimeline(id)
  const canBook = useCan('booking.create')

  return (
    <div className="mx-auto max-w-4xl px-4 pt-5 pb-8 sm:px-6">
      <DataView query={detail}>
        {({ vehicle, customer, lastVisit, nextBooking, currentJob }, sync) => (
          <header className="mb-6">
            <div className="flex flex-wrap items-start gap-4">
              <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="lg" />
              <div className="min-w-56 flex-1">
                <h1 className="text-3xl">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </h1>
                <p className="text-lg">{customer.name}</p>
                <a href={`tel:${customer.mobile.replace(/\s/g, '')}`} className="inline-flex min-h-touch items-center gap-2 font-semibold text-primary-strong underline">
                  <Phone className="size-4" aria-hidden="true" />
                  {customer.mobile}
                </a>
              </div>
              {canBook && (
                <Link
                  to="/bookings/new"
                  search={{ vehicle: vehicle.id }}
                  className="inline-flex min-h-touch items-center gap-2 rounded-lg bg-primary px-5 font-display font-semibold tracking-[0.06em] text-primary-foreground uppercase shadow-button hover:bg-primary-hover"
                >
                  <CalendarPlus className="size-5" aria-hidden="true" />
                  Book this vehicle
                </Link>
              )}
            </div>
            <dl className="tabular mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-secondary p-4 sm:grid-cols-4">
              <Fact label="Odometer" value={formatKm(vehicle.odometerKm)} />
              <Fact label="Last service" value={lastVisit ? formatDate(lastVisit) : 'No visits yet'} />
              <Fact
                label="Next appointment"
                value={nextBooking ? `${formatDayRelative(dayKey(nextBooking.startAt))}, ${formatTime(nextBooking.startAt)}` : 'None booked'}
              />
              <div>
                <dt className="text-sm text-muted-foreground">Current status</dt>
                <dd className="mt-0.5">{currentJob ? <JobStatusPill job={currentJob} /> : <span className="font-semibold">Not in the workshop</span>}</dd>
              </div>
              {vehicle.vin && <Fact label="VIN" value={vehicle.vin} />}
            </dl>
            {sync.status !== 'synced' && <SyncBadge status={sync.status} className="mt-2" />}
          </header>
        )}
      </DataView>

      <h2 className="mb-3 text-2xl">Service history</h2>
      <DataView
        query={timeline}
        isEmpty={(visits) => visits.length === 0}
        empty={
          <Card>
            <EmptyState icon={History} title="No visits yet">
              This vehicle's services, findings and recommendations will build up here.
            </EmptyState>
          </Card>
        }
      >
        {(visits) => (
          <ol className="relative space-y-4 border-l-2 pl-5">
            {visits.map((visit) => (
              <Visit key={visit.booking.id} visit={visit} />
            ))}
          </ol>
        )}
      </DataView>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  )
}

function Visit({ visit }: { visit: TimelineVisit }) {
  const { job, booking } = visit
  const done = isFinished(job.status)
  const attention = job.checklist.filter((c) => c.result === 'attention' && !c.findingId)
  return (
    <li className="relative">
      <span className="absolute top-1.5 -left-[1.72rem] size-3 rounded-full border-2 border-background bg-foreground" aria-hidden="true" />
      <Link to="/bookings/$id" params={{ id: booking.id }} className="block rounded-xl border bg-card p-4 shadow-card hover:border-foreground/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="tabular font-display text-lg font-medium">{formatDate(visit.day)}</div>
          <JobStatusPill job={job} />
        </div>
        <div className="text-lg">{visit.serviceName}</div>
        {job.odometerKmOut && <div className="tabular text-sm text-muted-foreground">{formatKm(job.odometerKmOut)}</div>}
        <ul className="mt-2 space-y-1">
          {done && (
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-5 shrink-0 text-primary-strong" aria-hidden="true" />
              {job.mechanicSummary ?? 'Completed'}
            </li>
          )}
          {job.findings.map((f) => (
            <li key={f.id} className="flex items-start gap-2">
              <TriangleAlert
                className="mt-0.5 size-5 shrink-0"
                style={{ color: f.severity === 'safety' ? 'var(--status-blocked)' : 'var(--status-approval)' }}
                aria-hidden="true"
              />
              <span>
                <span className="font-semibold">{f.title}</span>
                <span className="text-muted-foreground">
                  , {severityLabel[f.severity].toLowerCase()}
                  {f.approvalStatus === 'approved' && ', fixed this visit'}
                  {f.approvalStatus === 'declined' && ', customer declined'}
                </span>
              </span>
            </li>
          ))}
          {attention.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-status-approval" aria-hidden="true" />
              {c.label} needs attention
            </li>
          ))}
        </ul>
      </Link>
    </li>
  )
}
