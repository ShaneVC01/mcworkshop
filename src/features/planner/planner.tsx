import { useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarPlus, ChevronLeft, ChevronRight, GripVertical, TriangleAlert, UserRoundX } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { CapacityBar, CapacityFigures, Card, freeLabel, JobFlags, JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { statusTones } from '@/components/domain/status-tones'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, EmptyState, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass, Sheet } from '@/components/ui/sheet'
import { confirmBooking, rescheduleBooking, type ReschedulePatch } from '@/data/actions'
import { useAction, useBays, useCapacity, useSchedule, useTechnicians } from '@/data/hooks'
import { DAY_END, DAY_START, findConflicts, SNAP_MINUTES, unavailableAllDay, type Conflict } from '@/lib/capacity'
import {
  addMinutes, addWorkingDays, at, dayKey, formatDayLong, formatDayShort, formatHours, formatTime, fromMinutes,
  minutesOfDay, mondayOf, toMinutes, workingToday,
} from '@/lib/format'
import { isFinished, JOB_STATUS_TONE } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { Bay, CapacitySummary, ScheduledJob, Skill, Technician } from '@/types'

const SPAN = DAY_END - DAY_START
const HOURS = Array.from({ length: SPAN / 60 }, (_, i) => DAY_START + i * 60)
const pct = (minutes: number) => `${(minutes / SPAN) * 100}%`
const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
const skills: Skill[] = ['servicing', 'diagnostics', 'suspension', 'electrical', 'brakes', 'accessories']

interface PendingMove {
  s: ScheduledJob
  patch: ReschedulePatch
  conflicts: Conflict[]
}

export function Planner({ day, onDayChange }: { day: string; onDayChange: (day: string) => void }) {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [techFilter, setTechFilter] = useState('all')
  const [skillFilter, setSkillFilter] = useState<'all' | Skill>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)

  const weekDays = useMemo(() => {
    const monday = mondayOf(day)
    return [0, 1, 2, 3, 4].map((n) => (n === 0 ? monday : addWorkingDays(monday, n)))
  }, [day])
  const range = view === 'day' ? [day] : weekDays

  const technicians = useTechnicians()
  const bays = useBays()
  const schedule = useSchedule(range[0]!, range.at(-1)!)
  const capacity = useCapacity(range)
  const move = useAction(rescheduleBooking)
  const canMove = useCan('booking.move')
  const canOverride = useCan('booking.override-conflict')
  const canBook = useCan('booking.create')
  const navigate = useNavigate()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )

  const all = schedule.data?.data ?? []
  const techs = (technicians.data?.data ?? []).filter(
    (t) => (techFilter === 'all' || t.id === techFilter) && (skillFilter === 'all' || t.skills.includes(skillFilter)),
  )
  const selected = all.find((s) => s.booking.id === selectedId) ?? null

  /** Every move goes through the same check: hard conflicts stop it, soft ones ask first. */
  const attemptMove = (s: ScheduledJob, patch: ReschedulePatch) => {
    move.reset()
    const startAt = patch.startAt ?? s.booking.startAt
    const hours = patch.durationHours ?? s.booking.estimatedLabourHours
    const technicianIds = patch.technicianId === undefined ? s.booking.technicianIds : patch.technicianId ? [patch.technicianId] : []
    const sameDay = all.filter((x) => dayKey(x.booking.startAt) === dayKey(startAt)).map((x) => x.booking)
    const conflicts = findConflicts(
      { id: s.booking.id, startAt, endAt: addMinutes(startAt, hours * 60), technicianIds, bayId: technicianIds.length ? s.booking.bayId : undefined },
      technicians.data?.data ?? [], bays.data?.data ?? [], sameDay,
    ).filter((c) => c.kind !== 'bay')
    if (conflicts.length) setPending({ s, patch, conflicts })
    else void move.run(s.booking.id, patch).catch(() => undefined)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const s = all.find((x) => x.booking.id === e.active.id)
    if (!s || !e.over) return
    if (e.over.id === 'unassigned') {
      if (s.booking.technicianIds.length) attemptMove(s, { technicianId: null })
      return
    }
    const left = e.active.rect.current.translated?.left ?? e.over.rect.left
    const duration = s.booking.estimatedLabourHours * 60
    const raw = DAY_START + ((left - e.over.rect.left) / e.over.rect.width) * SPAN
    const start = Math.min(Math.max(snap(raw), DAY_START), DAY_END - duration)
    const startAt = at(day, fromMinutes(start))
    const technicianId = String(e.over.id)
    if (startAt === s.booking.startAt && s.booking.technicianIds[0] === technicianId) return
    attemptMove(s, { startAt, technicianId })
  }

  const newBookingAt = (technicianId: string, minutes: number) => {
    if (!canBook) return
    void navigate({ to: '/bookings/new', search: { tech: technicianId, day, time: fromMinutes(snap(minutes)) } })
  }

  const dayCapacity = capacity.data?.data.find((c) => c.day === day)
  const unassigned = all.filter((s) => s.booking.technicianIds.length === 0 && dayKey(s.booking.startAt) === day)

  return (
    <div className="pb-8">
      <PageHeader
        title="Workshop planner"
        subtitle={view === 'day' ? formatDayLong(day) : `Week of ${formatDayLong(weekDays[0]!)}`}
        actions={
          canBook && (
            <Link
              to="/bookings/new"
              search={{ day }}
              className="inline-flex min-h-touch items-center gap-2 rounded-lg bg-primary px-5 font-display font-semibold tracking-[0.06em] text-primary-foreground uppercase shadow-button hover:bg-primary-hover"
            >
              <CalendarPlus className="size-5" aria-hidden="true" />
              New booking
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
        <div className="flex items-center rounded-lg border">
          <button type="button" aria-label="Previous day" className="flex size-touch items-center justify-center" onClick={() => onDayChange(addWorkingDays(day, view === 'day' ? -1 : -5))}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button type="button" className="min-h-touch border-x px-4 font-semibold" onClick={() => onDayChange(workingToday())}>
            Today
          </button>
          <button type="button" aria-label="Next day" className="flex size-touch items-center justify-center" onClick={() => onDayChange(addWorkingDays(day, view === 'day' ? 1 : 5))}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="View">
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn('min-h-10 rounded-md px-4 font-semibold capitalize', view === v && 'bg-foreground text-background')}
            >
              {v}
            </button>
          ))}
        </div>
        <select aria-label="Filter by technician" value={techFilter} onChange={(e) => setTechFilter(e.target.value)} className={cn(fieldClass, 'h-11 w-auto')}>
          <option value="all">All technicians</option>
          {(technicians.data?.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select aria-label="Filter by skill" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value as 'all' | Skill)} className={cn(fieldClass, 'h-11 w-auto')}>
          <option value="all">All skills</option>
          {skills.map((s) => (
            <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-4 px-4 sm:px-6">
        <ActionError error={move.error} />

        {view === 'day' && dayCapacity && (
          <Card className="p-4">
            <CapacityBar capacity={dayCapacity} className="mb-3 h-4" />
            <CapacityFigures capacity={dayCapacity} />
          </Card>
        )}

        <DataView query={schedule} loading={<Skeleton className="h-96" />}>
          {() =>
            view === 'week' ? (
              <WeekGrid days={weekDays} techs={techs} capacity={capacity.data?.data ?? []} jobs={all} onPick={(d) => { onDayChange(d); setView('day') }} />
            ) : techs.length === 0 ? (
              <Card>
                <EmptyState title="No technician matches those filters">Clear a filter to see the roster.</EmptyState>
              </Card>
            ) : (
              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                {/* Tablet and desktop: resource timeline */}
                <Card className="hidden overflow-x-auto sm:block">
                  <div className="min-w-[56rem]">
                    <div className="tabular flex border-b text-sm text-muted-foreground">
                      <div className="w-36 shrink-0 lg:w-44" />
                      <div className="relative h-8 flex-1">
                        {HOURS.map((h) => (
                          <span key={h} className="absolute top-1.5 -translate-x-1/2 first:translate-x-0" style={{ left: pct(h - DAY_START) }}>
                            {formatTime(fromMinutes(h))}
                          </span>
                        ))}
                      </div>
                    </div>
                    {techs.map((tech) => (
                      <TimelineRow
                        key={tech.id}
                        tech={tech}
                        day={day}
                        capacity={dayCapacity}
                        jobs={all.filter((s) => s.booking.technicianIds.includes(tech.id) && dayKey(s.booking.startAt) === day)}
                        canMove={canMove}
                        onOpen={setSelectedId}
                        onEmptyClick={newBookingAt}
                        onResize={(s, hours) => attemptMove(s, { durationHours: hours })}
                      />
                    ))}
                  </div>
                </Card>

                {/* Phone: day agenda per technician */}
                <div className="space-y-4 sm:hidden">
                  {techs.map((tech) => {
                    const jobs = all.filter((s) => s.booking.technicianIds.includes(tech.id) && dayKey(s.booking.startAt) === day)
                    const c = dayCapacity?.byTechnician.find((x) => x.technicianId === tech.id)
                    return (
                      <section key={tech.id}>
                        <div className="mb-2 flex items-baseline justify-between">
                          <h2 className="text-xl">{tech.name}</h2>
                          {c && <span className={cn('tabular text-sm font-semibold', c.unavailableReason ? 'text-muted-foreground' : c.freeHours < 0 ? 'text-status-blocked' : 'text-primary-strong')}>{freeLabel(c)}</span>}
                        </div>
                        {jobs.length === 0 ? (
                          <p className="rounded-xl border border-dashed p-4 text-muted-foreground">
                            {c?.unavailableReason ? 'Not available today.' : 'Nothing booked.'}
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {jobs.map((s) => (
                              <li key={s.booking.id}>
                                <AgendaItem s={s} onOpen={setSelectedId} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    )
                  })}
                </div>

                <UnassignedDrawer jobs={unassigned} canMove={canMove} onOpen={setSelectedId} />
              </DndContext>
            )
          }
        </DataView>
      </div>

      <BookingPreview
        key={selected?.booking.id ?? 'none'}
        s={selected}
        day={day}
        technicians={technicians.data?.data ?? []}
        bays={bays.data?.data ?? []}
        canMove={canMove}
        onClose={() => setSelectedId(null)}
        onMove={(s, patch) => {
          setSelectedId(null)
          attemptMove(s, patch)
        }}
      />

      <Sheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Check this move"
        footer={
          <>
            {pending && !pending.conflicts.some((c) => c.hard) && canOverride && (
              <Button
                variant="destructive"
                onClick={() => {
                  const p = pending
                  setPending(null)
                  void move.run(p.s.booking.id, { ...p.patch, override: true }).catch(() => undefined)
                }}
              >
                Book anyway
              </Button>
            )}
            <Button variant="outline" onClick={() => setPending(null)}>
              Leave it where it was
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-3">
            <RegoPlate registration={pending.s.vehicle.registration} state={pending.s.vehicle.registrationState} />
            <ul className="space-y-2">
              {pending.conflicts.map((c) => (
                <li key={c.message} className="flex items-start gap-2 font-semibold">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0 text-status-blocked" aria-hidden="true" />
                  {c.message}
                </li>
              ))}
            </ul>
            {pending.conflicts.some((c) => c.hard) ? (
              <p className="text-muted-foreground">This cannot be booked. Pick another time or technician.</p>
            ) : !canOverride ? (
              <p className="text-muted-foreground">Only the workshop controller or manager can double book. Ask them, or pick another time.</p>
            ) : (
              <p className="text-muted-foreground">You can double book if you are sure the work will fit.</p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}

// ---- Timeline ---------------------------------------------------------------------------------

function TimelineRow({
  tech, day, capacity, jobs, canMove, onOpen, onEmptyClick, onResize,
}: {
  tech: Technician
  day: string
  capacity?: CapacitySummary
  jobs: ScheduledJob[]
  canMove: boolean
  onOpen: (id: string) => void
  onEmptyClick: (technicianId: string, minutes: number) => void
  onResize: (s: ScheduledJob, hours: number) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tech.id })
  const c = capacity?.byTechnician.find((x) => x.technicianId === tech.id)
  const off = unavailableAllDay(tech, day)
  const blocks = tech.unavailable.filter((u) => u.day === day)
  const shiftStart = toMinutes(tech.shiftStart)
  const shiftEnd = toMinutes(tech.shiftEnd)

  return (
    <div className="flex border-b last:border-b-0">
      <div className="w-36 shrink-0 border-r p-2 lg:w-44">
        <div className="truncate font-display text-lg font-medium">{tech.name.split(' ')[0]}</div>
        {c && (
          <>
            <div className={cn('tabular text-sm font-semibold', c.unavailableReason ? 'text-muted-foreground' : c.freeHours < 0 ? 'text-status-blocked' : 'text-primary-strong')}>
              {freeLabel(c)}
            </div>
            {!c.unavailableReason && <CapacityBar capacity={c} className="mt-1 h-2" />}
          </>
        )}
      </div>
      <div
        ref={setNodeRef}
        data-track
        className={cn('relative h-28 flex-1', isOver && 'bg-accent')}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return
          const rect = e.currentTarget.getBoundingClientRect()
          onEmptyClick(tech.id, DAY_START + ((e.clientX - rect.left) / rect.width) * SPAN)
        }}
      >
        {HOURS.slice(1).map((h) => (
          <span key={h} className="pointer-events-none absolute inset-y-0 border-l border-border/70" style={{ left: pct(h - DAY_START) }} />
        ))}
        {/* outside shift */}
        <span className="pointer-events-none absolute inset-y-0 left-0 bg-secondary" style={{ width: pct(shiftStart - DAY_START) }} />
        <span className="pointer-events-none absolute inset-y-0 right-0 bg-secondary" style={{ width: pct(DAY_END - shiftEnd) }} />
        {blocks.map((u) => {
          const from = toMinutes(u.from ?? tech.shiftStart)
          const to = toMinutes(u.to ?? tech.shiftEnd)
          return (
            <span
              key={`${u.day}-${u.from ?? 'all'}`}
              className="hatched pointer-events-none absolute inset-y-1 flex items-center justify-center rounded-lg bg-secondary text-sm font-semibold text-status-unavailable"
              style={{ left: pct(from - DAY_START), width: pct(to - from) }}
            >
              {{ sick: 'Off sick', leave: 'On leave', training: 'Training' }[u.reason]}
            </span>
          )
        })}
        {!off && jobs.map((s) => <Block key={s.booking.id} s={s} canMove={canMove} onOpen={onOpen} onResize={onResize} />)}
      </div>
    </div>
  )
}

function blockStyle(s: ScheduledJob): CSSProperties {
  const tone = statusTones[JOB_STATUS_TONE[s.job.status]]
  return {
    borderColor: s.atRisk ? 'var(--status-blocked)' : tone.colour,
    backgroundColor: s.booking.tentative ? 'var(--card)' : `color-mix(in srgb, ${tone.colour} 14%, var(--card))`,
  }
}

function Block({
  s, canMove, onOpen, onResize,
}: {
  s: ScheduledJob
  canMove: boolean
  onOpen: (id: string) => void
  onResize: (s: ScheduledJob, hours: number) => void
}) {
  const locked = !canMove || isFinished(s.job.status)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: s.booking.id, disabled: locked })
  const [resizePx, setResizePx] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const start = minutesOfDay(s.booking.startAt) - DAY_START
  const duration = s.booking.estimatedLabourHours * 60
  const tone = statusTones[JOB_STATUS_TONE[s.job.status]]
  const Icon = tone.icon

  const beginResize = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const track = ref.current?.closest('[data-track]')?.getBoundingClientRect()
    if (!track) return
    const originX = e.clientX
    let delta = 0
    const onMove = (ev: PointerEvent) => {
      delta = ev.clientX - originX
      setResizePx(delta)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizePx(null)
      const minutes = Math.max(30, snap(duration + (delta / track.width) * SPAN))
      if (minutes !== duration) onResize(s, minutes / 60)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        ref.current = node
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${s.vehicle.registration}, ${s.booking.serviceName}, ${formatTime(s.booking.startAt)}, ${formatHours(s.booking.estimatedLabourHours)}`}
      onClick={() => onOpen(s.booking.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(s.booking.id)
        }
      }}
      className={cn(
        'absolute inset-y-1 flex touch-none flex-col overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left select-none',
        s.booking.tentative && 'hatched border border-l-4 border-dashed',
        locked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        isDragging && 'z-20 opacity-90 shadow-card',
      )}
      style={{
        ...blockStyle(s),
        left: pct(start),
        width: resizePx === null ? pct(duration) : `calc(${pct(duration)} + ${resizePx}px)`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" className="shrink-0 self-start" />
      <span className="mt-1 shrink-0 truncate text-sm leading-tight font-semibold">{s.booking.serviceName}</span>
      <span className="mt-0.5 flex shrink-0 items-center gap-1 truncate text-xs font-semibold" style={{ color: s.atRisk ? 'var(--status-blocked)' : tone.colour }}>
        {s.atRisk ? <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" /> : <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{s.atRisk ? 'Running late' : tone.label}</span>
      </span>
      {!locked && (
        <span
          onPointerDown={beginResize}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-y-0 right-0 flex w-4 cursor-ew-resize items-center justify-center text-foreground/50"
          aria-hidden="true"
        >
          <GripVertical className="size-3.5" />
        </span>
      )}
    </div>
  )
}

function AgendaItem({ s, onOpen }: { s: ScheduledJob; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(s.booking.id)}
      className={cn('flex w-full items-center gap-3 rounded-xl border-l-4 p-3 text-left', s.booking.tentative && 'hatched')}
      style={blockStyle(s)}
    >
      <div className="tabular w-20 shrink-0 text-sm font-semibold">
        {formatTime(s.booking.startAt)}
        <div className="font-normal text-muted-foreground">{formatHours(s.booking.estimatedLabourHours)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
        <div className="mt-1 truncate font-semibold">{s.booking.serviceName}</div>
        <JobStatusPill job={s.job} className="mt-1" />
      </div>
    </button>
  )
}

function UnassignedDrawer({ jobs, canMove, onOpen }: { jobs: ScheduledJob[]; canMove: boolean; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' })
  return (
    <section ref={setNodeRef} className={cn('rounded-xl border-2 border-dashed p-3', isOver && 'border-primary bg-accent')}>
      <h2 className="mb-2 flex items-center gap-2 text-xl">
        <UserRoundX className="size-5" aria-hidden="true" />
        Unassigned jobs
        <span className="tabular rounded-full bg-secondary px-2 text-base">{jobs.length}</span>
      </h2>
      {jobs.length === 0 ? (
        <p className="text-muted-foreground">Every job for this day has a technician. Drag a job here to unassign it.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {jobs.map((s) => (
            <li key={s.booking.id}>
              <UnassignedChip s={s} canMove={canMove} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function UnassignedChip({ s, canMove, onOpen }: { s: ScheduledJob; canMove: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: s.booking.id, disabled: !canMove })
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onOpen(s.booking.id)}
      className={cn('flex min-h-touch touch-none items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-left shadow-card', isDragging && 'relative z-20')}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
    >
      <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
      <span>
        <span className="block text-sm leading-tight font-semibold">{s.booking.serviceName}</span>
        <span className="tabular block text-sm text-muted-foreground">{formatHours(s.booking.estimatedLabourHours)}</span>
      </span>
    </button>
  )
}

// ---- Week ---------------------------------------------------------------------------------------

function WeekGrid({
  days, techs, capacity, jobs, onPick,
}: {
  days: string[]
  techs: Technician[]
  capacity: CapacitySummary[]
  jobs: ScheduledJob[]
  onPick: (day: string) => void
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="w-32 p-2 font-normal text-muted-foreground">Technician</th>
            {days.map((d) => {
              const c = capacity.find((x) => x.day === d)
              return (
                <th key={d} className="p-2 align-bottom font-normal">
                  <button type="button" onClick={() => onPick(d)} className="min-h-touch w-full text-left">
                    <span className="block font-display text-lg font-medium">{formatDayShort(d)}</span>
                    {c && (
                      <span className={cn('tabular block text-sm font-semibold', c.freeHours < 2 ? 'text-status-blocked' : 'text-primary-strong')}>
                        {c.freeHours < 0 ? `${formatHours(-c.freeHours)} over` : `${formatHours(c.freeHours)} free`}
                      </span>
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {techs.map((tech) => (
            <tr key={tech.id} className="border-b last:border-b-0">
              <th className="p-2 font-display text-lg font-medium">{tech.name.split(' ')[0]}</th>
              {days.map((d) => {
                const c = capacity.find((x) => x.day === d)?.byTechnician.find((x) => x.technicianId === tech.id)
                const count = jobs.filter((s) => s.booking.technicianIds.includes(tech.id) && dayKey(s.booking.startAt) === d).length
                return (
                  <td key={d} className="p-1.5 align-top">
                    <button type="button" onClick={() => onPick(d)} className={cn('min-h-16 w-full rounded-lg p-2 text-left hover:bg-secondary', c?.unavailableReason && 'hatched')}>
                      {c && (
                        <>
                          {!c.unavailableReason && <CapacityBar capacity={c} className="mb-1.5 h-2" />}
                          <span className={cn('tabular block text-sm font-semibold', c.unavailableReason ? 'text-muted-foreground' : c.freeHours < 0 ? 'text-status-blocked' : 'text-primary-strong')}>
                            {freeLabel(c)}
                          </span>
                          {!c.unavailableReason && <span className="tabular block text-sm text-muted-foreground">{count} {count === 1 ? 'job' : 'jobs'}</span>}
                        </>
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ---- Preview and move ---------------------------------------------------------------------------------

const TIMES = Array.from({ length: (DAY_END - DAY_START) / 30 }, (_, i) => fromMinutes(DAY_START + i * 30))
const DURATIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8]

function BookingPreview({
  s, day, technicians, bays, canMove, onClose, onMove,
}: {
  s: ScheduledJob | null
  day: string
  technicians: Technician[]
  bays: Bay[]
  canMove: boolean
  onClose: () => void
  onMove: (s: ScheduledJob, patch: ReschedulePatch) => void
}) {
  const [tech, setTech] = useState(s?.booking.technicianIds[0] ?? '')
  const [time, setTime] = useState(s ? fromMinutes(minutesOfDay(s.booking.startAt)) : '07:00')
  const [hours, setHours] = useState(s?.booking.estimatedLabourHours ?? 1)
  const confirm = useAction(confirmBooking)
  if (!s) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>

  const { booking, job, vehicle, customer } = s
  const locked = !canMove || isFinished(job.status)
  const changed = tech !== (booking.technicianIds[0] ?? '') || time !== fromMinutes(minutesOfDay(booking.startAt)) || hours !== booking.estimatedLabourHours
  const times = TIMES.includes(time) ? TIMES : [...TIMES, time].sort()
  const durations = DURATIONS.includes(hours) ? DURATIONS : [...DURATIONS, hours].sort((a, b) => a - b)

  return (
    <Sheet
      open
      onClose={onClose}
      title={<RegoPlate registration={vehicle.registration} state={vehicle.registrationState} />}
      footer={
        <>
          <Link
            to="/bookings/$id"
            params={{ id: booking.id }}
            className="inline-flex min-h-touch items-center rounded-lg bg-foreground px-5 font-display font-semibold tracking-[0.06em] text-background uppercase"
          >
            Open job
          </Link>
          {booking.tentative && canMove && (
            <Button disabled={confirm.isPending} onClick={() => void confirm.run(booking.id).then(onClose).catch(() => undefined)}>
              Confirm booking
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="font-display text-xl font-medium">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </div>
          <div>{customer.name}, {customer.mobile}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <JobStatusPill job={job} />
          <span className="tabular text-muted-foreground">{booking.number}</span>
        </div>
        <div>
          <div className="text-lg font-semibold">{booking.serviceName}</div>
          <p className="text-muted-foreground">"{job.customerConcern}"</p>
        </div>
        <dl className="tabular grid grid-cols-2 gap-3 rounded-xl bg-secondary p-3">
          <div>
            <dt className="text-sm text-muted-foreground">When</dt>
            <dd className="font-semibold">{formatDayShort(dayKey(booking.startAt))}, {formatTime(booking.startAt)} to {formatTime(booking.endAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Bay</dt>
            <dd className="font-semibold">{bays.find((b) => b.id === booking.bayId)?.name ?? 'Not set'}</dd>
          </div>
        </dl>
        <JobFlags s={s} />
        <ActionError error={confirm.error} />

        {!locked && (
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="font-display text-xl font-medium">Move or resize</legend>
            <Field label="Technician">
              <select className={fieldClass} value={tech} onChange={(e) => setTech(e.target.value)}>
                <option value="">Unassigned</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start">
                <select className={fieldClass} value={time} onChange={(e) => setTime(e.target.value)}>
                  {times.map((t) => (
                    <option key={t} value={t}>{formatTime(t)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Hours">
                <select className={fieldClass} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                  {durations.map((d) => (
                    <option key={d} value={d}>{formatHours(d)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Button
              variant="dark"
              disabled={!changed}
              onClick={() => onMove(s, { technicianId: tech || null, startAt: at(dayKey(booking.startAt) === day ? day : dayKey(booking.startAt), time), durationHours: hours })}
            >
              Move booking
            </Button>
          </fieldset>
        )}
      </div>
    </Sheet>
  )
}
