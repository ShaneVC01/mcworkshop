import { useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleCheck, Clock, GripVertical, Hand, Lock, OctagonAlert, PackageSearch, TriangleAlert } from 'lucide-react'
import { JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { statusTones } from '@/components/domain/status-tones'
import { ActionError } from '@/components/states'
import { placeOnMechanic } from '@/data/actions'
import { useAction, useTechnicians, useWorkshopSettings } from '@/data/hooks'
import { availableMinutes, DAY_END, DAY_START } from '@/lib/capacity'
import { at, dayKey, formatHours, formatTime, fromMinutes, minutesOfDay, nowIso, toMinutes } from '@/lib/format'
import { isFinished, JOB_STATUS_TONE } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { ScheduledJob, Technician } from '@/types'

const SPAN = DAY_END - DAY_START
const HOURS = Array.from({ length: SPAN / 60 + 1 }, (_, i) => DAY_START + i * 60)
const pct = (m: number) => `${((m - DAY_START) / SPAN) * 100}%`
const NOT_STARTED = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'READY_FOR_WORK']

const progressOf = (s: ScheduledJob) => {
  const list = s.job.checklist
  return list.length ? Math.round((list.filter((c) => c.result || c.reading !== undefined).length / list.length) * 100) : 0
}

/** What needs the controller's eye, each with an icon and words. */
function alarmsOf(s: ScheduledJob) {
  const out: { icon: typeof Clock; label: string }[] = []
  if (s.atRisk) out.push({ icon: Clock, label: 'Running late' })
  if (s.job.status === 'WAITING_APPROVAL') out.push({ icon: Hand, label: 'Waiting on customer approval' })
  if (s.job.status === 'WAITING_PARTS') out.push({ icon: PackageSearch, label: 'Waiting on parts' })
  if (s.job.status === 'BLOCKED') out.push({ icon: OctagonAlert, label: s.job.blockedReason ?? 'Blocked' })
  return out
}

/**
 * The workshop controller's day: each mechanic's vehicles on a timeline with progress and alarms.
 * Vehicles not started yet can be dragged in 15 minute steps; dropping one in pushes the later ones right.
 */
export function MechanicDay({ jobs, canMove }: { jobs: ScheduledJob[]; canMove: boolean }) {
  // Live data: every change refreshes this view (useLiveData now, Supabase Realtime on bookings, job cards,
  // checklist items and time entries later), so progress shows as mechanics record it.
  const technicians = useTechnicians()
  const settings = useWorkshopSettings()
  const place = useAction(placeOnMechanic)
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)
  const now = useNowMinutes()
  // Pixels in 15 minutes on the timeline, measured when a drag starts, so the vehicle jumps in 15 minute steps.
  const [step, setStep] = useState(0)
  // A drag ends with a click on the vehicle. This stops that click from opening the booking.
  const dragged = useRef(false)
  const snapToQuarterHours: Modifier = ({ transform }) => (step ? { ...transform, x: Math.round(transform.x / step) * step } : transform)
  const open = (bookingId: string) => {
    if (dragged.current) return
    void navigate({ to: '/bookings/$id', params: { id: bookingId } })
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  )
  const day = dayKey()
  const breaks = settings.data?.data.breaks ?? []
  const working = (technicians.data?.data ?? []).filter((t) => availableMinutes(t, day) > 0)
  const waiting = jobs.filter((s) => s.job.status === 'CHECKED_IN' && s.booking.technicianIds.length === 0)

  const onDragStart = () => {
    dragged.current = true
    const lane = document.querySelector('[data-lane]')
    if (lane) setStep((lane.getBoundingClientRect().width / SPAN) * 15)
  }
  const endDrag = () => setTimeout(() => (dragged.current = false), 0)

  const onDragEnd = (e: DragEndEvent) => {
    endDrag()
    const s = jobs.find((x) => x.booking.id === e.active.id)
    if (!s || !e.over) return
    const quarters = step ? Math.round(e.delta.x / step) : 0
    // A planned vehicle moves by whole quarter hours from where it was. One from the tray lands where it was dropped.
    const minutes = s.booking.technicianIds.length
      ? minutesOfDay(s.booking.startAt) + quarters * 15
      : Math.round((DAY_START + (((e.active.rect.current.translated?.left ?? e.over.rect.left) - e.over.rect.left) / e.over.rect.width) * SPAN) / 15) * 15
    if (minutes === minutesOfDay(s.booking.startAt) && s.booking.technicianIds[0] === String(e.over.id)) return
    setMessage(null)
    place.reset()
    void place
      .run(s.booking.id, String(e.over.id), at(day, fromMinutes(Math.max(DAY_START, minutes))))
      .then((r) => setMessage(`${s.vehicle.registration} planned for ${formatTime(r.data.booking.startAt)}.${r.data.moved ? ` ${r.data.moved} later ${r.data.moved === 1 ? 'vehicle' : 'vehicles'} moved to make room.` : ''}`))
      .catch(() => undefined)
  }

  return (
    <div className="space-y-3 px-4 pb-6 sm:px-6">
      <ActionError error={place.error} />
      {message && <p role="status" className="font-semibold text-primary-strong">{message}</p>}
      <DndContext sensors={sensors} modifiers={[snapToQuarterHours]} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={endDrag}>
        {waiting.length > 0 && (
          <section aria-labelledby="tray" className="rounded-xl border-2 border-dashed p-3">
            <h2 id="tray" className="mb-2 text-lg">Waiting assignment</h2>
            <p className="mb-2 text-sm text-muted-foreground max-sm:hidden">Drag a vehicle onto a mechanic to plan it. Vehicles not started yet can be moved; work under way is locked.</p>
            <ul className="flex flex-wrap gap-2">
              {waiting.map((s) => (
                <li key={s.booking.id}><TrayChip s={s} canMove={canMove} /></li>
              ))}
            </ul>
          </section>
        )}

        <Key />

        {/* Tablet and desktop: the timeline */}
        <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-card sm:block">
          <div className="min-w-[60rem]">
            <div className="grid grid-cols-[13rem_1fr] border-b">
              <div />
              <div className="relative h-8">
                {HOURS.map((m) => (
                  <span key={m} className="absolute top-2 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground first:translate-x-0 last:-translate-x-full" style={{ left: pct(m) }}>
                    {formatTime(fromMinutes(m))}
                  </span>
                ))}
              </div>
            </div>
            {working.map((t) => (
              <Lane key={t.id} tech={t} jobs={jobs.filter((s) => s.booking.technicianIds.includes(t.id) && dayKey(s.booking.startAt) === day)} breaks={breaks} canMove={canMove} day={day} now={now} onOpen={open} />
            ))}
          </div>
        </div>
      </DndContext>

      {/* Phone: a list per mechanic */}
      <div className="space-y-4 sm:hidden">
        <p className="text-sm text-muted-foreground">Turn to a tablet or computer to move vehicles.</p>
        {working.map((t) => {
          const mine = jobs.filter((s) => s.booking.technicianIds.includes(t.id) && dayKey(s.booking.startAt) === day).sort((a, b) => a.booking.startAt.localeCompare(b.booking.startAt))
          return (
            <section key={t.id} className="space-y-2">
              <h2 className="text-xl">{t.name}</h2>
              {mine.length === 0 && <p className="text-muted-foreground">Nothing planned yet.</p>}
              {mine.map((s) => (
                <Link key={s.booking.id} to="/bookings/$id" params={{ id: s.booking.id }} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
                  <span className="tabular w-16 font-semibold">{formatTime(s.booking.startAt)}</span>
                  <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.booking.serviceName}</span>
                    <JobStatusPill job={s.job} />
                  </span>
                  <Alarms s={s} />
                </Link>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Lane({ tech, jobs, breaks, canMove, day, now, onOpen }: {
  tech: Technician; jobs: ScheduledJob[]; breaks: { from: string; to: string }[]; canMove: boolean; day: string; now: number; onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tech.id, disabled: !canMove })
  const booked = jobs.reduce((s, j) => s + j.booking.estimatedLabourHours, 0)
  const current = jobs.find((s) => s.job.status === 'IN_PROGRESS')
  const alarms = jobs.reduce((n, s) => n + alarmsOf(s).length, 0)
  const shiftStart = toMinutes(tech.shiftStart)
  const shiftEnd = toMinutes(tech.shiftEnd)
  const leave = tech.unavailable.filter((u) => u.day === day && u.from && u.to)
  return (
    <div className="grid grid-cols-[13rem_1fr] border-b last:border-b-0">
      <div className="space-y-0.5 border-r p-2">
        <p className="font-display text-lg font-medium">{tech.name}</p>
        <p className="tabular text-sm text-muted-foreground">{formatHours(booked)} of {formatHours(availableMinutes(tech, day) / 60)} planned</p>
        <p className="truncate text-sm">{current ? <>On <strong>{current.vehicle.registration}</strong>, {progressOf(current)}%</> : <span className="text-muted-foreground">Not on a job</span>}</p>
        {alarms > 0 && (
          <p className="flex items-center gap-1 text-sm font-semibold text-destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            {alarms} {alarms === 1 ? 'alarm' : 'alarms'}
          </p>
        )}
      </div>
      <div ref={setNodeRef} data-lane className={cn('relative h-28', isOver && 'bg-accent')} aria-label={`${tech.name}'s day`}>
        {/* 15 minute marks, hour lines, time outside the shift, breaks and leave */}
        {HOURS.map((m) => <span key={m} className="absolute inset-y-0 border-l" style={{ left: pct(m) }} aria-hidden="true" />)}
        <span className="hatched absolute inset-y-0 left-0" style={{ width: pct(shiftStart) }} aria-hidden="true" />
        <span className="hatched absolute inset-y-0 right-0" style={{ left: pct(shiftEnd) }} aria-hidden="true" />
        {breaks.map((b) => (
          <span key={b.from} className="absolute inset-y-0 flex items-start justify-center bg-secondary pt-1 text-xs text-muted-foreground" style={{ left: pct(toMinutes(b.from)), width: `${((toMinutes(b.to) - toMinutes(b.from)) / SPAN) * 100}%` }}>
            Break
          </span>
        ))}
        {leave.map((u) => (
          <span key={u.from} className="hatched absolute inset-y-0 flex items-center justify-center text-xs font-semibold text-muted-foreground" style={{ left: pct(toMinutes(u.from!)), width: `${((toMinutes(u.to!) - toMinutes(u.from!)) / SPAN) * 100}%` }}>
            {u.reason}
          </span>
        ))}
        {jobs.map((s) => <Block key={s.booking.id} s={s} canMove={canMove} onOpen={onOpen} />)}
        {now > DAY_START && now < DAY_END && <span className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-destructive" style={{ left: pct(now) }} role="img" aria-label={`Now, ${formatTime(fromMinutes(now))}`} />}
      </div>
    </div>
  )
}

function Block({ s, canMove, onOpen }: { s: ScheduledJob; canMove: boolean; onOpen: (id: string) => void }) {
  const movable = canMove && NOT_STARTED.includes(s.job.status)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: s.booking.id, disabled: !movable })
  const pressAt = useRef<[number, number] | null>(null)
  const finished = isFinished(s.job.status)
  const start = minutesOfDay(s.booking.startAt)
  const end = minutesOfDay(s.booking.endAt)
  const tone = statusTones[JOB_STATUS_TONE[s.job.status]]
  const progress = progressOf(s)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // A press that moved is a drag attempt, locked or not, never a tap to open.
      onPointerDownCapture={(e) => (pressAt.current = [e.clientX, e.clientY])}
      onClick={(e) => {
        const [x, y] = pressAt.current ?? [e.clientX, e.clientY]
        if (Math.hypot(e.clientX - x, e.clientY - y) < 6) onOpen(s.booking.id)
      }}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(s.booking.id)}
      aria-label={`${s.vehicle.registration}, ${s.booking.serviceName}, ${tone.label}, ${formatTime(s.booking.startAt)}. ${movable ? 'Drag to move, or open.' : finished ? 'Finished. Open.' : 'Work under way, locked. Open.'}`}
      className={cn('absolute top-2 bottom-2 overflow-hidden rounded-lg border text-left shadow-card', movable ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer', isDragging && 'z-20 opacity-90 shadow-lg ring-2 ring-primary')}
      style={{
        left: pct(start), width: `${((end - start) / SPAN) * 100}%`, borderLeft: `5px solid ${fillOf(s).edge}`, background: fillOf(s).fill,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <div className="h-full space-y-1 p-1.5">
        <span className="flex items-center gap-1.5">
          {movable ? <GripVertical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : finished ? <CircleCheck className="size-3.5 shrink-0 text-status-complete" aria-hidden="true" /> : <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="font-display text-sm font-semibold tracking-wide">{s.vehicle.registration}</span>
          <Alarms s={s} />
        </span>
        <span className="block truncate text-xs">{s.booking.serviceName}</span>
        <span className="flex items-center gap-1 text-xs" style={{ color: tone.colour }}>
          <tone.icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate font-semibold">{tone.label}</span>
        </span>
        {s.job.status !== 'CHECKED_IN' && !NOT_STARTED.includes(s.job.status) && (
          <span className="block h-1.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${progress} percent done`}>
            <span className="block h-full bg-status-in-progress" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
    </div>
  )
}

function Alarms({ s }: { s: ScheduledJob }) {
  const list = alarmsOf(s)
  if (!list.length) return null
  return (
    <span className="flex items-center gap-0.5 text-destructive">
      {list.map((a) => <a.icon key={a.label} className="size-4" aria-label={a.label} />)}
    </span>
  )
}

function TrayChip({ s, canMove }: { s: ScheduledJob; canMove: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: s.booking.id, disabled: !canMove })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('flex min-h-touch items-center gap-2 rounded-lg border bg-card px-2 py-1.5 shadow-card', canMove && 'cursor-grab touch-none', isDragging && 'relative z-20')}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
    >
      <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
      <span>
        <span className="block text-sm font-semibold">{s.booking.serviceName}</span>
        <span className="tabular block text-sm text-muted-foreground">{formatHours(s.booking.estimatedLabourHours)}</span>
      </span>
    </div>
  )
}

/** Minutes past midnight in Brisbane, ticking every 30 seconds so the now line moves through the day. */
function useNowMinutes() {
  const [now, setNow] = useState(() => minutesOfDay(nowIso()))
  useEffect(() => {
    const id = setInterval(() => setNow(minutesOfDay(nowIso())), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * The tint for a vehicle on the timeline: white until work starts, then the colour of where it stands.
 * Finished work (checked, invoiced, collected) goes light green. The status words stay on the card too.
 */
function fillOf(s: ScheduledJob) {
  const tint = (colour: string, amount: number) => `color-mix(in oklab, ${colour} ${amount}%, var(--card))`
  if (isFinished(s.job.status)) return { fill: tint('var(--status-complete)', 16), edge: 'var(--status-complete)' }
  if (NOT_STARTED.includes(s.job.status)) return { fill: 'var(--card)', edge: statusTones[JOB_STATUS_TONE[s.job.status]].colour }
  const colour = statusTones[JOB_STATUS_TONE[s.job.status]].colour
  return { fill: tint(colour, s.job.status === 'BLOCKED' ? 18 : 14), edge: colour }
}

const KEY = [
  { label: 'Not started, can move', colour: undefined, icon: GripVertical },
  { label: 'In progress', colour: 'var(--status-in-progress)', icon: Lock },
  { label: 'Waiting on approval or parts', colour: 'var(--status-approval)', icon: Hand },
  { label: 'Blocked', colour: 'var(--status-blocked)', icon: OctagonAlert },
  { label: 'Finished', colour: 'var(--status-complete)', icon: CircleCheck },
]

function Key() {
  return (
    <ul className="hidden flex-wrap gap-x-4 gap-y-1 text-sm sm:flex" aria-label="Key">
      {KEY.map((k) => (
        <li key={k.label} className="inline-flex items-center gap-1.5">
          <span
            className="flex size-5 items-center justify-center rounded border"
            style={{ background: k.colour ? `color-mix(in oklab, ${k.colour} 16%, var(--card))` : 'var(--card)', borderLeft: `3px solid ${k.colour ?? 'var(--border)'}` }}
            aria-hidden="true"
          >
            <k.icon className="size-3 text-muted-foreground" />
          </span>
          {k.label}
        </li>
      ))}
    </ul>
  )
}
