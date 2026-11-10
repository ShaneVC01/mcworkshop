import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BadgeCheck, Check, ChevronLeft, ChevronRight, CircleCheck, Pause, Play, Plus, TriangleAlert } from 'lucide-react'
import { JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { SyncBadge } from '@/components/domain/sync-badge'
import { ActionError, DataView, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass, Sheet } from '@/components/ui/sheet'
import {
  addJobNote, addPartUsed, completeJob, completionBlockers, pauseJob, resumeJob, setLabourDone, setPartUsed, startJob,
} from '@/data/actions'
import { useAction, useJobCard } from '@/data/hooks'
import { checklistProgress, useElapsedMinutes } from '@/features/mechanic/bits'
import { formatDuration, formatHours, formatTime } from '@/lib/format'
import { isFinished } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { JobCard, ScheduledJob } from '@/types'

export const Route = createFileRoute('/mechanic/jobs/$id/')({ component: MechanicJobPage })

function MechanicJobPage() {
  const { id } = Route.useParams()
  const jobCard = useJobCard(id)
  return (
    <DataView query={jobCard} loading={<div className="space-y-3 p-4"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>}>
      {(s, sync) => <JobScreen s={s} sync={sync.status} />}
    </DataView>
  )
}

function JobScreen({ s, sync }: { s: ScheduledJob; sync: 'synced' | 'pending' | 'failed' }) {
  const { job, vehicle, booking } = s
  const { minutes, running } = useElapsedMinutes(job)
  const start = useAction(startJob)
  const pause = useAction(pauseJob)
  const resume = useAction(resumeJob)
  const [completing, setCompleting] = useState(false)
  const finished = isFinished(job.status)
  const started = job.timeEntries.length > 0
  const { done, total } = checklistProgress(job)
  const extra = job.labour.filter((l) => l.source === 'additional')
  const waiting = job.findings.filter((f) => f.approvalStatus === 'draft' || f.approvalStatus === 'awaiting-customer')
  const firstStart = job.timeEntries[0]?.startedAt
  const busy = start.isPending || pause.isPending || resume.isPending

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <div className="flex-1 px-4 pt-3 pb-6">
        <Link to="/mechanic" className="inline-flex min-h-touch items-center gap-1 font-semibold">
          <ChevronLeft className="size-5" aria-hidden="true" />
          My day
        </Link>

        <header className="mt-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="lg" />
            <JobStatusPill job={job} />
          </div>
          <h1 className="mt-3 text-3xl">
            {vehicle.make} {vehicle.model}
          </h1>
          <p className="text-xl">{booking.serviceName}</p>
        </header>

        <div className="tabular mt-4 flex items-center justify-between gap-3 rounded-xl bg-secondary p-4">
          <div>
            <div className="text-sm text-muted-foreground">{firstStart ? `Started ${formatTime(firstStart)}` : 'Not started'}</div>
            <div className="font-display text-3xl font-medium">{formatDuration(minutes)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Estimate</div>
            <div className="font-display text-3xl font-medium">{formatHours(booking.estimatedLabourHours)}</div>
          </div>
        </div>
        {sync !== 'synced' && <SyncBadge status={sync} className="mt-2" />}

        {extra.length > 0 && <ExtraWork job={job} />}
        {waiting.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-status-approval bg-status-approval/10 p-3 font-semibold">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-status-approval" aria-hidden="true" />
            {waiting.length === 1 ? 'One finding is' : `${waiting.length} findings are`} with the service advisor. Carry on with the booked work.
          </p>
        )}

        <ol className="mt-5 space-y-2">
          <StepRow n={1} title="Customer concern" done>
            <p className="mt-1 text-lg">"{job.customerConcern}"</p>
          </StepRow>
          <StepRow n={2} title="Service checklist" done={done === total} meta={`${done} of ${total}`} to="/mechanic/jobs/$id/inspection" id={job.id} />
          <StepRow n={3} title="Findings" done={job.findings.length > 0} meta={String(job.findings.length)} to="/mechanic/jobs/$id/findings/new" id={job.id} action="Report a finding">
            {job.findings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {job.findings.map((f) => (
                  <li key={f.id} className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-5 shrink-0" style={{ color: f.severity === 'safety' ? 'var(--status-blocked)' : 'var(--status-approval)' }} aria-hidden="true" />
                    <span>
                      <span className="font-semibold">{f.title}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        {{ 'not-required': 'noted', draft: 'sent to advisor', 'awaiting-customer': 'waiting for customer', approved: 'approved', declined: 'declined' }[f.approvalStatus]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </StepRow>
          <StepRow n={4} title="Parts used" done={job.parts.some((p) => p.used)} meta={`${job.parts.filter((p) => p.used).length} of ${job.parts.length}`}>
            <PartsUsed job={job} readOnly={finished} />
          </StepRow>
          <StepRow n={5} title="Notes" done={job.notes.length > 0} meta={String(job.notes.length)}>
            <Notes job={job} readOnly={finished} />
          </StepRow>
        </ol>

        {finished && job.mechanicSummary && (
          <div className="mt-5 rounded-xl bg-accent p-4 text-accent-foreground">
            <div className="flex items-center gap-2 font-display text-xl font-medium">
              <CircleCheck className="size-6" aria-hidden="true" />
              Job complete
            </div>
            <p className="mt-1">{job.mechanicSummary}</p>
          </div>
        )}
        <div className="mt-3 empty:hidden">
          <ActionError error={start.error ?? pause.error ?? resume.error} />
        </div>
      </div>

      {!finished && (
        <div className="sticky bottom-0 flex gap-3 border-t bg-background px-4 py-3">
          {!started ? (
            <Button size="lg" className="flex-1" disabled={busy} onClick={() => void start.run(job.id).catch(() => undefined)}>
              <Play aria-hidden="true" />
              Start job
            </Button>
          ) : (
            <>
              {running ? (
                <Button size="lg" variant="outline" className="flex-1" disabled={busy} onClick={() => void pause.run(job.id).catch(() => undefined)}>
                  <Pause aria-hidden="true" />
                  Pause
                </Button>
              ) : (
                <Button size="lg" variant="dark" className="flex-1" disabled={busy} onClick={() => void resume.run(job.id).catch(() => undefined)}>
                  <Play aria-hidden="true" />
                  Resume
                </Button>
              )}
              <Button size="lg" className="flex-1" onClick={() => setCompleting(true)}>
                <BadgeCheck aria-hidden="true" />
                Complete
              </Button>
            </>
          )}
        </div>
      )}

      <CompleteSheet key={String(completing)} open={completing} s={s} onClose={() => setCompleting(false)} />
    </div>
  )
}

function StepRow({
  n, title, done, meta, to, id, action, children,
}: {
  n: number
  title: string
  done: boolean
  meta?: string
  to?: '/mechanic/jobs/$id/inspection' | '/mechanic/jobs/$id/findings/new'
  id?: string
  action?: string
  children?: React.ReactNode
}) {
  const head = (
    <span className="flex min-h-14 items-center gap-3">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold', done ? 'bg-primary text-primary-foreground' : 'bg-secondary')}>
        {done ? <Check className="size-5" aria-label="Done" /> : n}
      </span>
      <span className="min-w-0 flex-1 font-display text-xl font-medium">{title}</span>
      {meta && <span className="tabular text-lg font-semibold">{meta}</span>}
      {to && !action && <ChevronRight className="size-6 text-muted-foreground" aria-hidden="true" />}
    </span>
  )
  return (
    <li className="rounded-xl border bg-card px-3 py-1 shadow-card">
      {to && id && !action ? (
        <Link to={to} params={{ id }} className="block">
          {head}
        </Link>
      ) : (
        head
      )}
      {(children || action) && (
        <div className="pb-3 pl-12">
          {children}
          {to && id && action && (
            <Link
              to={to}
              params={{ id }}
              className="mt-2 inline-flex min-h-touch-lg items-center gap-2 rounded-lg border-2 border-foreground px-5 font-display text-lg font-semibold tracking-[0.06em] uppercase"
            >
              <Plus className="size-5" aria-hidden="true" />
              {action}
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

function ExtraWork({ job }: { job: JobCard }) {
  const toggle = useAction(setLabourDone)
  const finished = isFinished(job.status)
  return (
    <section className="mt-4 rounded-xl border-2 border-primary bg-accent p-3 text-accent-foreground">
      <h2 className="text-xl">Additional work approved</h2>
      <ul className="mt-2 space-y-2">
        {job.labour.filter((l) => l.source === 'additional').map((l) => (
          <li key={l.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={l.done}
              disabled={finished || toggle.isPending}
              onClick={() => void toggle.run(job.id, l.id, !l.done).catch(() => undefined)}
              className="flex min-h-14 w-full items-center gap-3 rounded-lg bg-background px-3 text-left text-foreground"
            >
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border-2', l.done ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                {l.done && <Check className="size-5" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1 font-semibold">{l.description}</span>
              <span className="tabular font-semibold">+{formatHours(l.hours)}</span>
            </button>
          </li>
        ))}
      </ul>
      <ActionError error={toggle.error} />
    </section>
  )
}

function PartsUsed({ job, readOnly }: { job: JobCard; readOnly: boolean }) {
  const toggle = useAction(setPartUsed)
  const add = useAction(addPartUsed)
  const [name, setName] = useState('')
  return (
    <div className="space-y-2">
      {job.parts.length === 0 && <p className="text-muted-foreground">No parts listed for this job.</p>}
      <ul className="space-y-1">
        {job.parts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={p.used}
              disabled={readOnly}
              onClick={() => void toggle.run(job.id, p.id, !p.used).catch(() => undefined)}
              className="flex min-h-touch w-full items-center gap-3 text-left"
            >
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md border-2', p.used ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                {p.used && <Check className="size-4" aria-hidden="true" />}
              </span>
              <span>{p.qty} x {p.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void add.run(job.id, { name, qty: 1 }).then(() => setName('')).catch(() => undefined)
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Another part used</span>
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Another part used" />
          </label>
          <Button type="submit" variant="outline" disabled={!name.trim() || add.isPending}>Add</Button>
        </form>
      )}
      <ActionError error={toggle.error ?? add.error} />
    </div>
  )
}

function Notes({ job, readOnly }: { job: JobCard; readOnly: boolean }) {
  const add = useAction(addJobNote)
  const [text, setText] = useState('')
  return (
    <div className="space-y-2">
      {job.notes.map((n) => (
        <p key={n.id}>
          {n.text}
          <span className="tabular block text-sm text-muted-foreground">{n.author}, {formatTime(n.createdAt)}</span>
        </p>
      ))}
      {!readOnly && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) void add.run(job.id, text).then(() => setText('')).catch(() => undefined)
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Add a note</span>
            <input className={fieldClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note" />
          </label>
          <Button type="submit" variant="outline" disabled={!text.trim() || add.isPending}>Add</Button>
        </form>
      )}
      <ActionError error={add.error} />
    </div>
  )
}

function CompleteSheet({ open, s, onClose }: { open: boolean; s: ScheduledJob; onClose: () => void }) {
  const { job, vehicle } = s
  const complete = useAction(completeJob)
  const blockers = completionBlockers(job)
  const [summary, setSummary] = useState(
    `${s.booking.serviceName} completed.${job.labour.filter((l) => l.source === 'additional').map((l) => ` ${l.description} done.`).join('')} Road tested. No further concerns.`,
  )
  const [odometer, setOdometer] = useState(String(vehicle.odometerKm ?? ''))
  const { done, total } = checklistProgress(job)
  const checks = [
    { ok: blockers.length === 0, label: blockers.length ? blockers.join(', ') : 'Required checklist complete' },
    { ok: true, label: `${done} of ${total} checklist items recorded` },
    { ok: true, label: `${job.findings.length} ${job.findings.length === 1 ? 'finding' : 'findings'} submitted` },
    { ok: true, label: `${job.parts.filter((p) => p.used).length} parts recorded as used` },
  ]
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Complete job"
      footer={
        <Button
          size="lg"
          className="w-full"
          disabled={blockers.length > 0 || !summary.trim() || !Number(odometer) || complete.isPending}
          onClick={() => void complete.run(job.id, { summary, odometerKm: Number(odometer) }).then(onClose).catch(() => undefined)}
        >
          <BadgeCheck aria-hidden="true" />
          {complete.isPending ? 'Saving' : 'Complete job'}
        </Button>
      }
    >
      <div className="space-y-4">
        <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} />
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.label} className={cn('flex items-start gap-2 font-semibold', !c.ok && 'text-status-blocked')}>
              {c.ok ? <Check className="mt-0.5 size-5 shrink-0 text-primary-strong" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
              <span className="first-letter:uppercase">{c.label}</span>
            </li>
          ))}
        </ul>
        {blockers.length > 0 && (
          <Link to="/mechanic/jobs/$id/inspection" params={{ id: job.id }} className="inline-flex min-h-touch items-center font-semibold text-primary-strong underline">
            Go to the checklist
          </Link>
        )}
        <Field label="Technician summary">
          <textarea className={cn(fieldClass, 'h-auto py-2')} rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="Odometer, km">
          <input className={fieldClass} value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
        </Field>
        <ActionError error={complete.error} />
      </div>
    </Sheet>
  )
}
