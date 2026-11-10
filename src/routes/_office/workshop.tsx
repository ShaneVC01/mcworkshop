import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCan } from '@/auth/permissions'
import { JobFlags, JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { statusTones } from '@/components/domain/status-tones'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, Skeleton } from '@/components/states'
import { moveJobStatus } from '@/data/actions'
import { useAction, useWorkshopBoard } from '@/data/hooks'
import { formatDayLong, formatDuration, formatTime, minutesBetween, nowIso, workingToday } from '@/lib/format'
import { BOARD_COLUMNS, canTransition, JOB_STATUS_LABEL, JOB_STATUS_TONE } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { JobStatus, ScheduledJob } from '@/types'

export const Route = createFileRoute('/_office/workshop')({ component: WorkshopPage })

type Column = (typeof BOARD_COLUMNS)[number]

/** Today's execution: one card per vehicle, grouped by where it is up to. */
function WorkshopPage() {
  const day = workingToday()
  const board = useWorkshopBoard(day)
  const move = useAction(moveJobStatus)
  const canMove = useCan('board.move')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const onDragEnd = (e: DragEndEvent, jobs: ScheduledJob[]) => {
    const s = jobs.find((x) => x.job.id === e.active.id)
    const column = BOARD_COLUMNS.find((c) => c.key === e.over?.id)
    if (!s || !column || (column.statuses as readonly JobStatus[]).includes(s.job.status)) return
    move.reset()
    void move.run(s.job.id, column.dropStatus).catch(() => undefined)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Workshop" subtitle={formatDayLong(day)} />
      <div className="px-4 empty:hidden sm:px-6">
        <ActionError error={move.error} />
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
        {(jobs) => (
          <DndContext sensors={sensors} onDragEnd={(e) => onDragEnd(e, jobs)}>
            <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-6 sm:snap-none sm:px-6">
              {BOARD_COLUMNS.map((column) => (
                <BoardColumn
                  key={column.key}
                  column={column}
                  jobs={jobs.filter((s) => (column.statuses as readonly JobStatus[]).includes(s.job.status))}
                  canMove={canMove}
                />
              ))}
            </div>
          </DndContext>
        )}
      </DataView>
    </div>
  )
}

function BoardColumn({ column, jobs, canMove }: { column: Column; jobs: ScheduledJob[]; canMove: boolean }) {
  const { setNodeRef, isOver, active } = useDroppable({ id: column.key })
  const tone = statusTones[JOB_STATUS_TONE[column.dropStatus]]
  const Icon = tone.icon
  const allowed = active ? canTransition((active.data.current as { status: JobStatus }).status, column.dropStatus) : true
  return (
    <section
      ref={setNodeRef}
      aria-label={column.label}
      className={cn(
        'flex w-[82vw] max-w-80 shrink-0 snap-center flex-col rounded-xl bg-secondary sm:w-72',
        isOver && (allowed ? 'ring-2 ring-primary' : 'ring-2 ring-status-blocked'),
      )}
    >
      <h2 className="flex items-center gap-2 px-3 pt-3 pb-2 text-lg" style={{ color: tone.colour }}>
        <Icon className="size-5" aria-hidden="true" />
        <span className="text-foreground">{column.label}</span>
        <span className="tabular ml-auto rounded-full bg-background px-2 text-base text-foreground">{jobs.length}</span>
      </h2>
      <ul className="min-h-24 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {jobs.map((s) => (
          <li key={s.job.id}>
            <BoardCard s={s} canMove={canMove} />
          </li>
        ))}
        {jobs.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">No vehicles</li>}
      </ul>
    </section>
  )
}

function BoardCard({ s, canMove }: { s: ScheduledJob; canMove: boolean }) {
  const { job, vehicle, booking, technicians } = s
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    disabled: !canMove,
    data: { status: job.status },
  })
  const done = job.checklist.filter((c) => c.result || c.reading != null).length
  const progress = job.checklist.length ? Math.round((done / job.checklist.length) * 100) : 0
  const clocked = job.timeEntries.reduce((sum, t) => sum + minutesBetween(t.startedAt, t.endedAt ?? nowIso()), 0)
  const remaining = Math.max(0, booking.estimatedLabourHours * 60 - clocked)
  const waiting = job.quoteLines.find((l) => l.status === 'awaiting-customer' && l.sentAt)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'touch-none rounded-lg border bg-card p-3 shadow-card select-none',
        canMove && 'cursor-grab active:cursor-grabbing',
        s.atRisk && 'border-status-blocked',
        isDragging && 'relative z-30 opacity-95',
      )}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="sm" />
        <span className="tabular text-sm font-semibold">Due {formatTime(job.promisedAt)}</span>
      </div>
      <div className="mt-1.5 truncate font-display text-lg font-medium">
        {vehicle.make} {vehicle.model}
      </div>
      <div className="truncate text-sm">{booking.serviceName}</div>
      <div className="tabular mt-1 text-sm text-muted-foreground">
        {technicians.length ? technicians.map((t) => t.name.split(' ')[0]).join(', ') : 'No technician'}
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
        <JobFlags s={s} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <JobStatusPill job={job} />
        <Link
          to="/bookings/$id"
          params={{ id: booking.id }}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex min-h-touch items-center px-2 font-semibold text-primary-strong underline"
          aria-label={`Open ${vehicle.registration}, ${JOB_STATUS_LABEL[job.status]}`}
        >
          Open
        </Link>
      </div>
    </div>
  )
}
