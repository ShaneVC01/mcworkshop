import { useState } from 'react'
import { TriangleAlert, UserRoundCheck } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { CapacityBar, freeLabel } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { statusTones } from '@/components/domain/status-tones'
import { ActionError, DataView, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { assignMechanic } from '@/data/actions'
import { useAction, useAssignPlan } from '@/data/hooks'
import { DAY_END, DAY_START } from '@/lib/capacity'
import { dayKey, formatDayRelative, formatHours, formatTime, fromMinutes, minutesOfDay, nowIso, toMinutes } from '@/lib/format'
import { JOB_STATUS_TONE } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { AssignOption, AssignPlan, Id } from '@/types'

const SPAN = DAY_END - DAY_START
const HOURS = Array.from({ length: SPAN / 60 + 1 }, (_, i) => DAY_START + i * 60)
const pct = (minutes: number) => `${(Math.min(Math.max(minutes, 0), SPAN) / SPAN) * 100}%`
const first = (name: string) => name.split(' ')[0]!
/** A time, with the day in front when it is not the day being planned. */
function when(iso: string, day: string) {
  if (dayKey(iso) === day) return formatTime(iso)
  const relative = formatDayRelative(dayKey(iso))
  return `${relative === 'Tomorrow' ? 'tomorrow' : relative} ${formatTime(iso)}`
}

/**
 * Assign an arrived vehicle. Every mechanic is shown with their day as on the calendar, and a dashed
 * block where this job would go in their next free slot. Pick a mechanic, then confirm in the footer.
 */
export function AssignSheet({ jobId, day, onClose }: { jobId: Id; day: string; onClose: () => void }) {
  const plan = useAssignPlan(jobId, day)
  const canOverride = useCan('booking.override-conflict')
  const assign = useAction(assignMechanic)
  const [pickedId, setPickedId] = useState<Id | undefined>()
  const p = plan.data?.data
  const options = p?.options ?? []
  const chosen = options.find((o) => o.technician.id === (pickedId ?? suggestedId(options)))
  const warning = Boolean(chosen?.slot && chosen.issue)
  const blocked = !chosen?.slot || (warning && !canOverride) || assign.isPending

  const confirm = () => {
    if (!p || !chosen?.slot) return
    void assign.run(p.job.job.id, chosen.technician.id, chosen.slot.startAt, Boolean(chosen.issue)).then(onClose).catch(() => undefined)
  }

  const footer = p && (
    <>
      {warning && chosen && (
        <p className="flex w-full items-start gap-2 font-semibold">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-status-blocked" aria-hidden="true" />
          {canOverride
            ? `${issueText(chosen, day)} You can still assign it if you are sure.`
            : `${issueText(chosen, day)} Only the workshop controller or manager can assign over this.`}
        </p>
      )}
      {assign.error && (
        <div className="w-full">
          <ActionError error={assign.error} />
        </div>
      )}
      <Button variant={warning ? 'destructive' : 'primary'} disabled={blocked} onClick={confirm}>
        <UserRoundCheck aria-hidden="true" />
        {!chosen?.slot
          ? 'Pick a mechanic'
          : `${warning ? 'Assign anyway to' : 'Assign to'} ${first(chosen.technician.name)}, ${when(chosen.slot.startAt, day)}`}
      </Button>
      <Button variant="outline" onClick={onClose}>
        Not now
      </Button>
    </>
  )

  return (
    <Sheet open onClose={onClose} wide="xl" title={p ? `Assign ${p.job.vehicle.registration}` : 'Assign a mechanic'} footer={footer}>
      <DataView query={plan} loading={<Skeleton className="h-80" />}>
        {(data) => (
          <AssignBody
            plan={data}
            chosenId={chosen?.technician.id}
            onPick={(id) => {
              assign.reset()
              setPickedId(id)
            }}
          />
        )}
      </DataView>
    </Sheet>
  )
}

/**
 * The earliest clean slot, but the mechanic pencilled in at booking when they are free the same day,
 * so the booking's plan wins unless it costs the customer a day.
 */
function suggestedId(options: AssignOption[]) {
  const earliest = options.find((o) => o.slot && !o.issue)
  const planned = options.find((o) => o.planned && o.slot && !o.issue)
  if (planned && earliest && dayKey(planned.slot!.startAt) === dayKey(earliest.slot!.startAt)) return planned.technician.id
  return earliest?.technician.id
}

function AssignBody({ plan, chosenId, onPick }: { plan: AssignPlan; chosenId?: Id; onPick: (id: Id) => void }) {
  const { job, options, day } = plan
  const planned = options.find((o) => o.planned)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <RegoPlate registration={job.vehicle.registration} state={job.vehicle.registrationState} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-medium">
            {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
          </div>
          <div className="text-sm">
            {job.booking.serviceName}. <span className="font-semibold">Needs {formatHours(job.booking.estimatedLabourHours)}.</span>
            {planned && <> Pencilled in for {first(planned.technician.name)} at booking.</>}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">The dashed block shows where this job goes in each mechanic's next free slot. When a mechanic has no room left today, their next free slot is on a later day.</p>

      {/* Hour ruler, tablet and up. On phone each row carries its own times in words. */}
      <div className="tabular hidden text-xs text-muted-foreground sm:flex">
        <div className="w-44 shrink-0" />
        <div className="relative h-5 flex-1">
          {HOURS.filter((_, i) => i % 2 === 0).map((h) => (
            <span key={h} className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full" style={{ left: pct(h - DAY_START) }}>
              {formatTime(fromMinutes(h)).replace(':00', '')}
            </span>
          ))}
        </div>
      </div>

      <div role="radiogroup" aria-label="Mechanics" className="space-y-2">
        {options.map((o) => (
          <MechanicRow key={o.technician.id} option={o} day={day} selected={o.technician.id === chosenId} onPick={() => onPick(o.technician.id)} />
        ))}
      </div>
    </div>
  )
}

function issueText(o: AssignOption, day: string) {
  const from = o.slot ? when(o.slot.startAt, day) : ''
  switch (o.issue) {
    case 'off':
      return o.capacity.unavailableReason ? `${freeLabel(o.capacity)} today.` : 'Not working today.'
    case 'no-room':
      return 'No time left today.'
    case 'runs-over':
      return `Free from ${from}, but the job runs into their next job or past the end of their shift.`
    case 'no-bay':
      return `Free from ${from}, but no suitable bay is free then.`
    default:
      return ''
  }
}

function MechanicRow({ option, day, selected, onPick }: { option: AssignOption; day: string; selected: boolean; onPick: () => void }) {
  const { technician: tech, capacity, slot, issue, jobs, missingSkills, planned } = option
  const unusable = !slot
  const summary = slot
    ? issue
      ? issueText(option, day)
      : `Next free ${when(slot.startAt, day)} to ${formatTime(slot.endAt)}.`
    : issueText(option, day)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={unusable}
      onClick={onPick}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl border-2 p-2 text-left sm:flex-row sm:items-stretch sm:gap-0 sm:p-0',
        selected ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
        unusable && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="block min-w-0 sm:w-44 sm:shrink-0 sm:border-r sm:p-2">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-lg font-medium">{tech.name}</span>
          {planned && <span className="shrink-0 rounded-full bg-secondary px-2 text-xs font-semibold">Booked</span>}
        </span>
        <span className={cn('tabular block text-sm font-semibold', capacity.unavailableReason ? 'text-muted-foreground' : capacity.freeHours < 0 ? 'text-status-blocked' : 'text-primary-strong')}>
          {freeLabel(capacity)}
        </span>
        {!capacity.unavailableReason && <CapacityBar capacity={capacity} className="mt-1 h-2" />}
      </span>
      <span className="block min-w-0 flex-1 sm:p-2">
        <Track option={option} day={day} selected={selected} />
        <span className={cn('mt-1 flex items-start gap-1.5 text-sm', issue ? 'font-semibold' : '')}>
          {issue && issue !== 'off' && <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-blocked" aria-hidden="true" />}
          <span>
            {summary}
            {jobs.length > 0 && ` ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} today.`}
            {missingSkills.length > 0 && ` Not set up for ${missingSkills.join(', ')} work.`}
          </span>
        </span>
      </span>
    </button>
  )
}

/** A mechanic's day, drawn like the calendar: shift, time off, their jobs and where this job would go. */
function Track({ option, day, selected }: { option: AssignOption; day: string; selected: boolean }) {
  const { technician: tech, jobs, slot } = option
  const shiftStart = toMinutes(tech.shiftStart)
  const shiftEnd = toMinutes(tech.shiftEnd)
  const now = nowIso()
  const nowAt = day === dayKey(now) ? minutesOfDay(now) : null
  return (
    <span aria-hidden="true" className="relative block h-12 overflow-hidden rounded-lg border bg-card">
      {HOURS.slice(1, -1).map((h) => (
        <span key={h} className="absolute inset-y-0 border-l border-border/70" style={{ left: pct(h - DAY_START) }} />
      ))}
      <span className="absolute inset-y-0 left-0 bg-secondary" style={{ width: pct(shiftStart - DAY_START) }} />
      <span className="absolute inset-y-0 right-0 bg-secondary" style={{ width: pct(DAY_END - shiftEnd) }} />
      {tech.unavailable
        .filter((u) => u.day === day)
        .map((u) => {
          const from = toMinutes(u.from ?? tech.shiftStart)
          const to = toMinutes(u.to ?? tech.shiftEnd)
          return <span key={`${u.day}-${u.from ?? 'all'}`} className="hatched absolute inset-y-1 rounded-md bg-secondary" style={{ left: pct(from - DAY_START), width: pct(to - from) }} />
        })}
      {jobs.map((s) => {
        const start = minutesOfDay(s.booking.startAt) - DAY_START
        const tone = statusTones[JOB_STATUS_TONE[s.job.status]]
        return (
          <span
            key={s.booking.id}
            className={cn('absolute inset-y-1 overflow-hidden rounded-md border-l-4 px-1 text-[11px] leading-[2.4rem] font-semibold whitespace-nowrap', s.booking.tentative && 'hatched')}
            style={{
              left: pct(start),
              width: pct(s.booking.estimatedLabourHours * 60),
              borderColor: tone.colour,
              backgroundColor: `color-mix(in srgb, ${tone.colour} 14%, var(--card))`,
            }}
          >
            <span className="max-sm:hidden">{s.vehicle.registration}</span>
          </span>
        )
      })}
      {slot && dayKey(slot.startAt) === day && (
        <span
          className={cn(
            'absolute inset-y-1 rounded-md border-2 border-dashed border-primary',
            selected ? 'bg-primary/30' : 'bg-primary/10',
          )}
          style={{ left: pct(minutesOfDay(slot.startAt) - DAY_START), width: pct(minutesOfDay(slot.endAt) - minutesOfDay(slot.startAt)) }}
        />
      )}
      {nowAt !== null && nowAt > DAY_START && nowAt < DAY_END && (
        <span className="absolute inset-y-0 w-0.5 bg-status-blocked" style={{ left: pct(nowAt - DAY_START) }} />
      )}
    </span>
  )
}
