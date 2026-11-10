import type { ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { Clock, ClockAlert, PackageSearch, TriangleAlert, UserRound, UserRoundX } from 'lucide-react'
import { needsApproval } from '@/data/queries'
import { formatDayRelative, formatHours, formatPercent, formatTime, dayKey } from '@/lib/format'
import { JOB_STATUS_LABEL, JOB_STATUS_TONE } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { CapacitySummary, DayCapacity, JobCard, ScheduledJob } from '@/types'
import { RegoPlate } from './rego-plate'
import { StatusPill } from './status-pill'
import { SyncBadge } from './sync-badge'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border bg-card text-card-foreground shadow-card', className)}>{children}</div>
}

export function JobStatusPill({ job, className }: { job: JobCard; className?: string }) {
  const paused = job.status === 'IN_PROGRESS' && !job.timeEntries.some((t) => !t.endedAt)
  return (
    <StatusPill
      tone={JOB_STATUS_TONE[job.status]}
      label={paused ? 'Paused' : JOB_STATUS_LABEL[job.status]}
      className={className}
    />
  )
}

function Flag({ icon: Icon, colour, children }: { icon: typeof Clock; colour: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: colour }}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

/** Warnings a controller needs to spot without opening the job. */
export function JobFlags({ s }: { s: ScheduledJob }) {
  const { job, booking } = s
  const flags: ReactNode[] = []
  if (s.atRisk) flags.push(<Flag key="risk" icon={TriangleAlert} colour="var(--status-blocked)">Past promised time</Flag>)
  if (booking.technicianIds.length === 0) flags.push(<Flag key="un" icon={UserRoundX} colour="var(--status-blocked)">Unassigned</Flag>)
  if (needsApproval(job) && job.status !== 'WAITING_APPROVAL') {
    flags.push(<Flag key="appr" icon={ClockAlert} colour="var(--status-approval)">Extra work needs approval</Flag>)
  }
  if (job.status === 'WAITING_PARTS' && job.partsEta) {
    flags.push(<Flag key="parts" icon={PackageSearch} colour="var(--status-parts)">Parts due {formatTime(job.partsEta)}</Flag>)
  }
  if (job.status === 'BLOCKED' && job.blockedReason) {
    flags.push(<Flag key="blocked" icon={TriangleAlert} colour="var(--status-blocked)">{job.blockedReason}</Flag>)
  }
  if (!flags.length) return null
  return <div className="flex flex-col gap-1">{flags}</div>
}

/** The standard job summary: plate first, then vehicle, work, when, who and state. */
export function JobTile({
  s,
  to,
  params,
  showDay = false,
  className,
}: {
  s: ScheduledJob
  to: LinkProps['to']
  params?: Record<string, string>
  showDay?: boolean
  className?: string
}) {
  const { booking, job, vehicle, customer, technicians } = s
  return (
    <Link
      to={to}
      params={params as never}
      className={cn(
        'block rounded-xl border bg-card p-3 shadow-card transition-colors hover:border-foreground/40 active:border-foreground/40',
        s.atRisk && 'border-status-blocked',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="sm" />
        <JobStatusPill job={job} />
      </div>
      <div className="mt-2 truncate font-display text-lg font-medium">
        {vehicle.make} {vehicle.model}
      </div>
      <div className="truncate">{booking.serviceName}</div>
      <div className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-4" aria-hidden="true" />
          {showDay && `${formatDayRelative(dayKey(booking.startAt))}, `}
          {formatTime(booking.startAt)}, {formatHours(booking.estimatedLabourHours)}
        </span>
        <span className="inline-flex items-center gap-1">
          <UserRound className="size-4" aria-hidden="true" />
          {technicians.length ? technicians.map((t) => t.name.split(' ')[0]).join(', ') : 'No technician'}
        </span>
        <span className="truncate">{customer.name}</span>
      </div>
      <div className="mt-2 empty:hidden">
        <JobFlags s={s} />
      </div>
      {job.sync.status !== 'synced' && <SyncBadge status={job.sync.status} className="mt-2" />}
    </Link>
  )
}

/** Booked versus available hours. Confirmed is solid, tentative is hatched, the rest is free. */
export function CapacityBar({
  capacity,
  className,
}: {
  capacity: Pick<CapacitySummary, 'availableHours' | 'freeHours'> & { confirmedHours?: number; bookedHours?: number; tentativeHours: number }
  className?: string
}) {
  const booked = capacity.confirmedHours ?? capacity.bookedHours ?? 0
  const total = Math.max(capacity.availableHours, booked + capacity.tentativeHours, 0.01)
  const over = capacity.freeHours < 0
  return (
    <div
      className={cn('flex h-3 overflow-hidden rounded-full bg-accent', className)}
      role="img"
      aria-label={`${formatHours(booked)} booked of ${formatHours(capacity.availableHours)} available`}
    >
      <div className={cn('h-full', over ? 'bg-status-blocked' : 'bg-foreground')} style={{ width: `${(booked / total) * 100}%` }} />
      <div className="hatched h-full bg-secondary" style={{ width: `${(capacity.tentativeHours / total) * 100}%` }} />
    </div>
  )
}

export function CapacityFigures({ capacity }: { capacity: CapacitySummary }) {
  const over = capacity.freeHours < 0
  const items = [
    { label: 'Available', value: formatHours(capacity.availableHours) },
    { label: 'Confirmed', value: formatHours(capacity.confirmedHours) },
    { label: 'Tentative', value: formatHours(capacity.tentativeHours) },
    { label: over ? 'Over' : 'Free', value: formatHours(Math.abs(capacity.freeHours)), tone: over ? 'text-status-blocked' : 'text-primary-strong' },
    { label: 'Booked', value: formatPercent(capacity.utilisation) },
  ]
  return (
    <dl className="tabular flex flex-wrap gap-x-6 gap-y-2">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-sm text-muted-foreground">{i.label}</dt>
          <dd className={cn('font-display text-2xl font-medium', i.tone)}>{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function freeLabel(c: DayCapacity) {
  if (c.unavailableReason) return { sick: 'Off sick', leave: 'On leave', training: 'Training' }[c.unavailableReason]
  return c.freeHours < 0 ? `${formatHours(-c.freeHours)} over` : `${formatHours(c.freeHours)} free`
}
