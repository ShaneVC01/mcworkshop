import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BadgeCheck, ClipboardCheck, LogIn, Receipt, UserRoundPen, UserRoundPlus } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { JobFlags, JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { statusTones } from '@/components/domain/status-tones'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { checkInVehicle } from '@/data/actions'
import { useAction, useWorkshopBoard } from '@/data/hooks'
import { AssignSheet } from '@/features/workshop/assign-sheet'
import { useCloseOut } from '@/features/workshop/use-close-out'
import { MechanicDay } from '@/features/workshop/mechanic-day'
import { dayKey, formatDayLong, formatDayRelative, formatDuration, formatTime, minutesBetween, nowIso, workingToday } from '@/lib/format'
import { BOARD_COLUMNS, JOB_STATUS_LABEL, JOB_STATUS_TONE, type BoardAction } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { Id, JobStatus, ScheduledJob } from '@/types'

type WorkshopView = 'board' | 'mechanics'

export const Route = createFileRoute('/_office/workshop')({
  validateSearch: (s: Record<string, unknown>): { view?: WorkshopView } => ({ view: s.view === 'mechanics' ? 'mechanics' : undefined }),
  component: WorkshopPage,
})

type Column = (typeof BOARD_COLUMNS)[number]

/**
 * Today's execution: one card per vehicle, grouped by where it is up to.
 * Each column has one button for its next step. Tapping anywhere else on a card opens the booking.
 */
function WorkshopPage() {
  const day = workingToday()
  const board = useWorkshopBoard(day)
  const arrive = useAction(checkInVehicle)
  const [arrivingId, setArrivingId] = useState<Id | null>(null)
  const [assignId, setAssignId] = useState<Id | null>(null)
  const canArrive = useCan('board.move')
  const canAssign = useCan('job.assign')
  const closeOut = useCloseOut()
  const view: WorkshopView = Route.useSearch().view ?? 'board'
  const navigate = Route.useNavigate()

  const run = (action: BoardAction, s: ScheduledJob) => {
    if (action === 'verify' || action === 'invoiced' || action === 'paid') return closeOut.run(action, s)
    if (action === 'arrived') {
      arrive.reset()
      setArrivingId(s.job.id)
      void arrive.run(s.job.id).catch(() => undefined).finally(() => setArrivingId(null))
    } else {
      setAssignId(s.job.id)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Workshop"
        subtitle={formatDayLong(day)}
        actions={
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="View">
            {([['board', 'Board'], ['mechanics', 'Mechanics']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => void navigate({ search: { view: key === 'board' ? undefined : key }, replace: true })}
                className={cn('min-h-11 rounded-md px-4 font-semibold', view === key && 'bg-foreground text-background')}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      <div className="px-4 empty:hidden sm:px-6">
        <ActionError error={arrive.error ?? closeOut.error} />
      </div>
      <DataView
        query={board}
        loading={
          <div className="flex gap-3 px-4 sm:px-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96 w-72 shrink-0" />
            ))}
          </div>
        }
      >
        {(jobs) => view === 'mechanics' ? (
          <MechanicDay jobs={jobs} canMove={canAssign} />
        ) : (
          <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-6 sm:snap-none sm:px-6">
            {BOARD_COLUMNS.map((column) => (
              <BoardColumn
                key={column.key}
                column={column}
                jobs={jobs.filter((s) => (column.statuses as readonly JobStatus[]).includes(s.job.status))}
                allowed={{ arrived: canArrive, assign: canAssign, reassign: canAssign, verify: closeOut.allowed('verify'), invoiced: closeOut.allowed('invoiced'), paid: closeOut.allowed('paid') }}
                busyId={arrivingId ?? closeOut.busyId}
                onAction={run}
              />
            ))}
          </div>
        )}
      </DataView>
      {closeOut.sheet}
      {assignId && <AssignSheet key={assignId} jobId={assignId} day={day} onClose={() => setAssignId(null)} />}
    </div>
  )
}

function BoardColumn({
  column, jobs, allowed, busyId, onAction,
}: {
  column: Column
  jobs: ScheduledJob[]
  allowed: Record<BoardAction, boolean>
  busyId: Id | null
  onAction: (action: BoardAction, s: ScheduledJob) => void
}) {
  const tone = statusTones[JOB_STATUS_TONE[column.tone]]
  const Icon = tone.icon
  const action = 'action' in column ? column.action : undefined
  return (
    <section aria-label={column.label} className="flex w-[82vw] max-w-80 shrink-0 snap-center flex-col rounded-xl bg-secondary sm:w-72">
      <h2 className="flex items-center gap-2 px-3 pt-3 pb-2 text-lg" style={{ color: tone.colour }}>
        <Icon className="size-5" aria-hidden="true" />
        <span className="text-foreground">{column.label}</span>
        <span className="tabular ml-auto rounded-full bg-background px-2 text-base text-foreground">{jobs.length}</span>
      </h2>
      <ul className="min-h-24 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {jobs.map((s) => (
          <li key={s.job.id}>
            <BoardCard s={s} action={action} allowed={action ? allowed[action] : false} busy={busyId === s.job.id} onAction={onAction} />
          </li>
        ))}
        {jobs.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">No vehicles</li>}
      </ul>
    </section>
  )
}

const NOT_ASSIGNED: JobStatus[] = ['BOOKED', 'CONFIRMED', 'CHECKED_IN']

/** A time, with the day in front when it is not today (a late arrival assigned to tomorrow morning). */
function withDay(iso: string) {
  if (dayKey(iso) === dayKey()) return formatTime(iso)
  const relative = formatDayRelative(dayKey(iso))
  return `${relative === 'Tomorrow' ? 'tomorrow' : relative} ${formatTime(iso)}`
}

function BoardCard({
  s, action, allowed, busy, onAction,
}: {
  s: ScheduledJob
  action?: BoardAction
  allowed: boolean
  busy: boolean
  onAction: (action: BoardAction, s: ScheduledJob) => void
}) {
  const { job, vehicle, booking, technicians } = s
  const done = job.checklist.filter((c) => c.result || c.reading != null).length
  const progress = job.checklist.length ? Math.round((done / job.checklist.length) * 100) : 0
  const clocked = job.timeEntries.reduce((sum, t) => sum + minutesBetween(t.startedAt, t.endedAt ?? nowIso()), 0)
  const remaining = Math.max(0, booking.estimatedLabourHours * 60 - clocked)
  const waiting = job.quoteLines.find((l) => l.status === 'awaiting-customer' && l.sentAt)
  const notAssigned = NOT_ASSIGNED.includes(job.status)
  const names = technicians.map((t) => t.name.split(' ')[0]).join(', ')

  return (
    <article
      className={cn(
        'relative rounded-lg border bg-card p-3 shadow-card transition-colors hover:border-foreground/40',
        s.atRisk && 'border-status-blocked',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="sm" />
        <span className="tabular text-sm font-semibold">
          {notAssigned ? `Drop off ${formatTime(booking.startAt)}` : `Due ${withDay(job.promisedAt)}`}
        </span>
      </div>
      {/* The whole card opens the booking. The link stretches over the card, the action button sits above it. */}
      <Link
        to="/bookings/$id"
        params={{ id: booking.id }}
        className="mt-1.5 block truncate font-display text-lg font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
        aria-label={`Open ${vehicle.registration}, ${vehicle.make} ${vehicle.model}, ${JOB_STATUS_LABEL[job.status]}`}
      >
        {vehicle.make} {vehicle.model}
      </Link>
      <div className="truncate text-sm">{booking.serviceName}</div>
      <div className="tabular mt-1 text-sm text-muted-foreground">
        {notAssigned
          ? names
            ? `Pencilled in for ${names}`
            : 'No mechanic yet'
          : `${names || 'No mechanic'}, from ${withDay(booking.startAt)}`}
        {job.status === 'IN_PROGRESS' && `, ${formatDuration(remaining)} left`}
      </div>
      {['IN_PROGRESS', 'WAITING_APPROVAL', 'WAITING_PARTS', 'BLOCKED'].includes(job.status) && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${progress} percent done`}>
            <div className="h-full bg-status-in-progress" style={{ width: `${progress}%` }} />
          </div>
          <span className="tabular text-sm font-semibold">{progress}%</span>
        </div>
      )}
      {waiting && (
        <div className="tabular mt-1 text-sm font-semibold text-status-approval">
          Waiting {formatDuration(minutesBetween(waiting.sentAt!, nowIso()))}
        </div>
      )}
      <div className="mt-1.5 empty:hidden">
        <JobFlags s={s} hideUnassigned={notAssigned} />
      </div>
      <div className="mt-2">
        <JobStatusPill job={job} />
      </div>
      {action && allowed && (
        <CardAction action={action} busy={busy} rego={vehicle.registration} onClick={() => onAction(action, s)} />
      )}
      {action === 'assign' && !allowed && (
        <p className="mt-2 text-sm text-muted-foreground">Waiting for the workshop controller to assign.</p>
      )}
    </article>
  )
}

const ACTION_LABEL: Record<BoardAction, string> = { arrived: 'Vehicle arrived', assign: 'Assign', reassign: 'Reassign', verify: 'Check job', invoiced: 'Mark invoiced', paid: 'Mark paid' }
const ACTION_ICON = { arrived: LogIn, assign: UserRoundPlus, reassign: UserRoundPen, verify: ClipboardCheck, invoiced: Receipt, paid: BadgeCheck } satisfies Record<BoardAction, typeof LogIn>

function CardAction({ action, busy, rego, onClick }: { action: BoardAction; busy: boolean; rego: string; onClick: () => void }) {
  const Icon = ACTION_ICON[action]
  return (
    <Button
      variant={action === 'reassign' ? 'outline' : 'primary'}
      className="relative z-10 mt-2 w-full"
      disabled={busy}
      aria-label={`${ACTION_LABEL[action]}, ${rego}`}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      {busy ? 'Saving' : ACTION_LABEL[action]}
    </Button>
  )
}
