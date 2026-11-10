import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarClock, Check, ExternalLink, LogIn, MessageSquare, Phone, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { Card, JobFlags, JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { StatusPill } from '@/components/domain/status-pill'
import type { StatusTone } from '@/components/domain/status-tones'
import { SyncBadge } from '@/components/domain/sync-badge'
import { ActionError, DataView, EmptyState, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from '@/components/ui/sheet'
import {
  addFindingToQuote, approveQuote, cancelBooking, checkInVehicle, declineQuote, moveJobStatus, sendQuoteForApproval,
} from '@/data/actions'
import { useAction, useActivity, useBooking, useInvoiceSummary, useQuote, useVehicleTimeline } from '@/data/hooks'
import {
  dayKey, formatDate, formatDateTime, formatDayRelative, formatDuration, formatHours, formatMoney, formatTime,
  minutesBetween, nowIso,
} from '@/lib/format'
import { JOB_STATUS_LABEL, TRANSITIONS } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { ApprovalStatus, Finding, JobCard, JobStatus, QuoteLine, ScheduledJob, Totals } from '@/types'

export const Route = createFileRoute('/_office/bookings/$id')({ component: BookingPage })

const tabs = ['Overview', 'Work', 'Findings', 'Quote', 'History', 'Activity'] as const
type Tab = (typeof tabs)[number]

const approvalTone: Record<ApprovalStatus, { tone: StatusTone; label: string }> = {
  'not-required': { tone: 'unavailable', label: 'For information' },
  draft: { tone: 'approval', label: 'Needs a quote' },
  'awaiting-customer': { tone: 'approval', label: 'Waiting for customer' },
  approved: { tone: 'confirmed', label: 'Approved' },
  declined: { tone: 'unavailable', label: 'Declined' },
}
const severity: Record<Finding['severity'], { label: string; colour: string }> = {
  monitor: { label: 'Monitor', colour: 'var(--status-unavailable)' },
  recommended: { label: 'Recommended', colour: 'var(--status-approval)' },
  safety: { label: 'Safety', colour: 'var(--status-blocked)' },
}

function BookingPage() {
  const { id } = Route.useParams()
  const booking = useBooking(id)
  const [tab, setTab] = useState<Tab>('Overview')

  return (
    <div className="mx-auto max-w-5xl px-4 pt-5 pb-10 sm:px-6">
      <DataView query={booking} loading={<Skeleton className="h-64" />}>
        {(s, sync) => (
          <>
            <Header s={s} sync={sync.status} />
            <div className="-mx-4 mt-5 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Job sections">
              <div className="flex min-w-max gap-1">
                {tabs.map((t) => {
                  const count = t === 'Findings' ? s.job.findings.length : t === 'Quote' ? s.job.quoteLines.filter((l) => l.status !== 'approved' && l.status !== 'declined').length : 0
                  return (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={cn(
                        'min-h-touch border-b-4 px-4 font-display text-lg tracking-wide',
                        tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
                      )}
                    >
                      {t}
                      {count > 0 && <span className="tabular ml-1.5 rounded-full bg-status-approval px-2 py-0.5 font-sans text-sm font-semibold text-white">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="pt-5" role="tabpanel">
              {tab === 'Overview' && <Overview s={s} />}
              {tab === 'Work' && <Work job={s.job} booking={s.booking} />}
              {tab === 'Findings' && <Findings job={s.job} onQuote={() => setTab('Quote')} />}
              {tab === 'Quote' && <QuoteTab job={s.job} />}
              {tab === 'History' && <HistoryTab vehicleId={s.vehicle.id} currentId={s.booking.id} />}
              {tab === 'Activity' && <ActivityTab jobId={s.job.id} />}
            </div>
          </>
        )}
      </DataView>
    </div>
  )
}

function Header({ s, sync }: { s: ScheduledJob; sync: 'synced' | 'pending' | 'failed' }) {
  const { vehicle, customer, job, booking, technicians, bay } = s
  const canMove = useCan('booking.move')
  const checkIn = useAction(checkInVehicle)
  const mobile = customer.mobile.replace(/\s/g, '')
  const action = 'inline-flex min-h-touch items-center gap-2 rounded-lg border-2 border-foreground px-4 font-display font-semibold tracking-[0.06em] uppercase hover:bg-secondary'
  return (
    <header>
      <div className="flex flex-wrap items-start gap-4">
        <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="lg" />
        <div className="min-w-56 flex-1">
          <h1 className="text-3xl">
            <Link to="/vehicles/$id" params={{ id: vehicle.id }} className="hover:underline">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </Link>
          </h1>
          <p className="text-lg">{customer.name}</p>
          <p className="tabular text-muted-foreground">
            {booking.number}, {booking.serviceName}
          </p>
        </div>
      </div>
      <div className="tabular mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <JobStatusPill job={job} />
        <span>{technicians.length ? technicians.map((t) => t.name.split(' ')[0]).join(', ') : 'No technician'}</span>
        {bay && <span>{bay.name}</span>}
        <span>
          {formatDayRelative(dayKey(booking.startAt))} {formatTime(booking.startAt)}, expected {formatTime(job.promisedAt)}
        </span>
        <SyncBadge status={sync} />
      </div>
      <div className="mt-2 empty:hidden">
        <JobFlags s={s} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {['BOOKED', 'CONFIRMED'].includes(job.status) && canMove && (
          <Button disabled={checkIn.isPending} onClick={() => void checkIn.run(job.id).catch(() => undefined)}>
            <LogIn aria-hidden="true" />
            Check in vehicle
          </Button>
        )}
        <a href={`tel:${mobile}`} className={action}>
          <Phone className="size-5" aria-hidden="true" />
          Call
        </a>
        <a href={`sms:${mobile}`} className={action}>
          <MessageSquare className="size-5" aria-hidden="true" />
          SMS
        </a>
        {canMove && (
          <Link to="/calendar" search={{ day: dayKey(booking.startAt) }} className={action}>
            <CalendarClock className="size-5" aria-hidden="true" />
            Reschedule
          </Link>
        )}
        <button type="button" disabled title="Available once the back office system is connected" className={cn(action, 'opacity-50')}>
          <ExternalLink className="size-5" aria-hidden="true" />
          Open in back office
        </button>
      </div>
      <div className="mt-2">
        <ActionError error={checkIn.error} />
      </div>
    </header>
  )
}

function Overview({ s }: { s: ScheduledJob }) {
  const { job, booking } = s
  const canMove = useCan('board.move')
  const move = useAction(moveJobStatus)
  const cancel = useAction(cancelBooking)
  const [next, setNext] = useState<JobStatus | ''>('')
  const options = TRANSITIONS[job.status]
  return (
    <div className="grid gap-5 @3xl:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-2 text-xl">Customer concern</h2>
        <p className="text-lg">"{job.customerConcern}"</p>
        {job.mechanicSummary && (
          <>
            <h3 className="mt-4 mb-1 text-lg">Technician summary</h3>
            <p>{job.mechanicSummary}</p>
            <p className="tabular text-sm text-muted-foreground">
              {job.completedBy}, {job.completedAt && formatDateTime(job.completedAt)}
            </p>
          </>
        )}
      </Card>
      <Card className="p-4">
        <h2 className="mb-2 text-xl">Booking</h2>
        <dl className="tabular grid grid-cols-2 gap-3">
          <Info label="Drop off" value={`${formatDate(booking.startAt)}, ${formatTime(booking.startAt)}`} />
          <Info label="Promised" value={formatTime(job.promisedAt)} />
          <Info label="Estimated labour" value={formatHours(booking.estimatedLabourHours)} />
          <Info label="Parts" value={{ ready: 'Ready', 'parts-risk': 'At risk', unknown: 'Not checked' }[booking.readiness]} />
        </dl>
        {canMove && options.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <Field label="Change status">
              <div className="flex gap-2">
                <select className={fieldClass} value={next} onChange={(e) => setNext(e.target.value as JobStatus)}>
                  <option value="">Choose a status</option>
                  {options.map((o) => (
                    <option key={o} value={o}>{JOB_STATUS_LABEL[o]}</option>
                  ))}
                </select>
                <Button variant="dark" disabled={!next || move.isPending} onClick={() => next && void move.run(job.id, next).then(() => setNext('')).catch(() => undefined)}>
                  Update
                </Button>
              </div>
            </Field>
            <div className="mt-2 space-y-2">
              <ActionError error={move.error ?? cancel.error} />
              {['BOOKED', 'CONFIRMED'].includes(job.status) && (
                <CancelButton pending={cancel.isPending} onCancel={() => void cancel.run(booking.id).then(() => history.back()).catch(() => undefined)} />
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function CancelButton({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  const [sure, setSure] = useState(false)
  if (!sure) return <Button variant="ghost" className="text-destructive" onClick={() => setSure(true)}>Cancel booking</Button>
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">Cancel this booking?</span>
      <Button variant="destructive" disabled={pending} onClick={onCancel}>Yes, cancel it</Button>
      <Button variant="ghost" onClick={() => setSure(false)}>Keep it</Button>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}

function Work({ job, booking }: { job: JobCard; booking: ScheduledJob['booking'] }) {
  const clocked = job.timeEntries.reduce((sum, t) => sum + minutesBetween(t.startedAt, t.endedAt ?? nowIso()), 0)
  const done = job.checklist.filter((c) => c.result || c.reading != null).length
  const progress = job.checklist.length ? done / job.checklist.length : 0
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <dl className="tabular grid grid-cols-2 gap-4 @2xl:grid-cols-4">
          <Info label="Estimated labour" value={formatHours(booking.estimatedLabourHours)} />
          <Info label="Clocked" value={formatDuration(clocked)} />
          <Info label="Checklist" value={`${done} of ${job.checklist.length}`} />
          <Info label="Remaining estimate" value={formatDuration(Math.max(0, booking.estimatedLabourHours * 60 - clocked))} />
        </dl>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${Math.round(progress * 100)} percent of checklist done`}>
          <div className="h-full bg-status-in-progress" style={{ width: `${progress * 100}%` }} />
        </div>
      </Card>
      <Card>
        <h2 className="border-b px-4 py-3 text-xl">Labour</h2>
        <ul className="divide-y">
          {job.labour.map((l) => (
            <li key={l.id} className="tabular flex items-center gap-3 px-4 py-3">
              <Check className={cn('size-5 shrink-0', l.done ? 'text-primary-strong' : 'text-border')} aria-label={l.done ? 'Done' : 'Not done'} />
              <span className="min-w-0 flex-1">
                {l.description}
                {l.source === 'additional' && <span className="ml-2 text-sm font-semibold text-status-approval">Additional</span>}
              </span>
              <span className="font-semibold">{formatHours(l.hours)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="border-b px-4 py-3 text-xl">Parts</h2>
        {job.parts.length === 0 ? (
          <p className="px-4 py-3 text-muted-foreground">No parts on this job.</p>
        ) : (
          <ul className="divide-y">
            {job.parts.map((p) => (
              <li key={p.id} className="tabular flex items-center gap-3 px-4 py-3">
                <Check className={cn('size-5 shrink-0', p.used ? 'text-primary-strong' : 'text-border')} aria-label={p.used ? 'Used' : 'Not used yet'} />
                <span className="min-w-0 flex-1">
                  {p.qty} x {p.name}
                  {p.source === 'technician' && <span className="ml-2 text-sm text-muted-foreground">added by technician</span>}
                </span>
                {p.unitCents > 0 && <span className="font-semibold">{formatMoney(p.qty * p.unitCents)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Findings({ job, onQuote }: { job: JobCard; onQuote: () => void }) {
  if (job.findings.length === 0) {
    return (
      <Card>
        <EmptyState title="No findings yet">Anything the technician reports during the inspection shows here straight away.</EmptyState>
      </Card>
    )
  }
  return (
    <ul className="space-y-4">
      {job.findings.map((f) => (
        <li key={f.id}>
          <FindingCard job={job} finding={f} onQuote={onQuote} />
        </li>
      ))}
    </ul>
  )
}

function FindingCard({ job, finding, onQuote }: { job: JobCard; finding: Finding; onQuote: () => void }) {
  const canQuote = useCan('quote.manage')
  const add = useAction(addFindingToQuote)
  const quoted = job.quoteLines.some((l) => l.findingId === finding.id)
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState(finding.suggestedAction ?? finding.title)
  const [hours, setHours] = useState(String(finding.extraLabourHours ?? 1))
  const [parts, setParts] = useState('')
  const a = approvalTone[finding.approvalStatus]
  const sev = severity[finding.severity]
  return (
    <Card className="p-4" >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="text-sm font-semibold" style={{ color: sev.colour }}>{sev.label}</span>
          <h3 className="text-xl">{finding.title}</h3>
        </div>
        <StatusPill tone={a.tone} label={a.label} />
      </div>
      <p className="mt-1">{finding.description}</p>
      {finding.suggestedAction && (
        <p className="tabular mt-1 text-muted-foreground">
          Suggested: {finding.suggestedAction}
          {finding.extraLabourHours ? `, about ${formatHours(finding.extraLabourHours)}` : ''}
        </p>
      )}
      {finding.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {finding.photos.map((src, i) => (
            <img key={i} src={src} alt={`Photo ${i + 1} of ${finding.title}`} className="h-28 w-36 rounded-lg border object-cover" />
          ))}
        </div>
      )}
      <p className="tabular mt-2 text-sm text-muted-foreground">
        {finding.createdBy}, {formatDateTime(finding.createdAt)}
      </p>
      {canQuote && !quoted && finding.approvalStatus !== 'approved' && (
        <div className="mt-3 border-t pt-3">
          {!open ? (
            <Button variant="dark" onClick={() => setOpen(true)}>Quote this work</Button>
          ) : (
            <div className="space-y-3">
              <Field label="Work to quote"><input className={fieldClass} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Labour hours"><input className={fieldClass} value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" /></Field>
                <Field label="Parts, $ ex GST"><input className={fieldClass} value={parts} onChange={(e) => setParts(e.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
              </div>
              <ActionError error={add.error} />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!description.trim() || !(Number(hours) >= 0) || add.isPending}
                  onClick={() =>
                    void add
                      .run(job.id, finding.id, { description, labourHours: Number(hours) || 0, partsCents: Math.round((Number(parts) || 0) * 100) })
                      .then(onQuote)
                      .catch(() => undefined)
                  }
                >
                  Add to quote
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function TotalsList({ totals }: { totals: Totals }) {
  return (
    <dl className="tabular space-y-1">
      <Line label="Labour" value={formatMoney(totals.labourCents)} />
      <Line label="Parts" value={formatMoney(totals.partsCents)} />
      <Line label="GST" value={formatMoney(totals.gstCents)} />
      <div className="flex items-baseline justify-between border-t pt-2">
        <dt className="font-semibold">Total inc GST</dt>
        <dd className="font-display text-3xl font-medium">{formatMoney(totals.totalCents)}</dd>
      </div>
    </dl>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}

function QuoteTab({ job }: { job: JobCard }) {
  const quote = useQuote(job.id)
  const invoice = useInvoiceSummary(job.id)
  return (
    <div className="grid gap-5 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <h2 className="text-xl">Additional work</h2>
        {job.quoteLines.length === 0 ? (
          <Card>
            <EmptyState title="No additional work quoted">Quote a finding from the Findings tab and it will appear here for the customer to approve.</EmptyState>
          </Card>
        ) : (
          <ul className="space-y-3">
            {job.quoteLines.map((line) => (
              <li key={line.id}>
                <QuoteLineCard jobId={job.id} line={line} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-3 text-xl">Approved work</h2>
          <DataView query={quote} loading={<Skeleton className="h-32" />}>
            {(q) => (
              <>
                <TotalsList totals={q.approved} />
                {q.awaitingCents > 0 && (
                  <p className="tabular mt-3 rounded-lg bg-status-approval/10 p-2 text-sm font-semibold text-status-approval">
                    {formatMoney(q.awaitingCents)} ex GST of extra work is not approved yet.
                  </p>
                )}
              </>
            )}
          </DataView>
        </Card>
        <Card className="p-4">
          <h2 className="mb-2 text-xl">Invoice</h2>
          <DataView query={invoice} loading={<Skeleton className="h-12" />}>
            {(inv) => (
              <div className="tabular">
                <div className="font-semibold">
                  {{ 'not-invoiced': 'Not invoiced yet', draft: 'Draft', sent: 'Sent to customer', paid: 'Paid' }[inv.status]}
                  {inv.number && `, ${inv.number}`}
                </div>
                {inv.status !== 'not-invoiced' && <div>{formatMoney(inv.totals.totalCents)} inc GST of {formatMoney(inv.totals.gstCents)}</div>}
                <p className="mt-1 text-sm text-muted-foreground">Invoices are raised in the back office system and shown here for reference.</p>
              </div>
            )}
          </DataView>
        </Card>
      </div>
    </div>
  )
}

function QuoteLineCard({ jobId, line }: { jobId: string; line: QuoteLine }) {
  const canQuote = useCan('quote.manage')
  const send = useAction(sendQuoteForApproval)
  const approve = useAction(approveQuote)
  const decline = useAction(declineQuote)
  const a = approvalTone[line.status]
  const busy = send.isPending || approve.isPending || decline.isPending
  const ex = line.labourCents + line.partsCents
  const run = (action: { run: (jobId: string, lineId: string) => Promise<unknown> }) => void action.run(jobId, line.id).catch(() => undefined)
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xl">{line.description}</h3>
        <StatusPill
          tone={a.tone}
          label={line.status === 'awaiting-customer' && line.sentAt ? `Waiting for customer, ${formatDuration(minutesBetween(line.sentAt, nowIso()))}` : line.status === 'draft' ? 'Not sent' : a.label}
        />
      </div>
      <dl className="tabular mt-2 space-y-1">
        <Line label={`Labour, ${formatHours(line.labourHours)}`} value={formatMoney(line.labourCents)} />
        <Line label="Parts" value={formatMoney(line.partsCents)} />
        <Line label="Total inc GST" value={formatMoney(Math.round(ex * 1.1))} />
      </dl>
      {canQuote && (line.status === 'draft' || line.status === 'awaiting-customer') && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          {line.status === 'draft' && (
            <Button disabled={busy} onClick={() => run(send)}>
              <Send aria-hidden="true" />
              Send for approval
            </Button>
          )}
          <Button variant={line.status === 'draft' ? 'outline' : 'primary'} disabled={busy} onClick={() => run(approve)}>
            <ThumbsUp aria-hidden="true" />
            Customer approved
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => run(decline)}>
            <ThumbsDown aria-hidden="true" />
            Customer declined
          </Button>
        </div>
      )}
      <div className="mt-2 empty:hidden">
        <ActionError error={send.error ?? approve.error ?? decline.error} />
      </div>
    </Card>
  )
}

function HistoryTab({ vehicleId, currentId }: { vehicleId: string; currentId: string }) {
  const timeline = useVehicleTimeline(vehicleId)
  return (
    <DataView query={timeline}>
      {(visits) => {
        const others = visits.filter((v) => v.booking.id !== currentId)
        if (others.length === 0) {
          return (
            <Card>
              <EmptyState title="First visit">This vehicle has no earlier jobs on file.</EmptyState>
            </Card>
          )
        }
        return (
          <ul className="space-y-3">
            {others.map((v) => (
              <li key={v.booking.id}>
                <Link to="/bookings/$id" params={{ id: v.booking.id }} className="block rounded-xl border bg-card p-4 shadow-card hover:border-foreground/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="tabular font-display text-lg font-medium">{formatDate(v.day)}</span>
                    <JobStatusPill job={v.job} />
                  </div>
                  <div>{v.serviceName}</div>
                  {v.job.findings.map((f) => (
                    <div key={f.id} className="text-sm text-muted-foreground">
                      {f.title}, {severity[f.severity].label.toLowerCase()}
                    </div>
                  ))}
                </Link>
              </li>
            ))}
          </ul>
        )
      }}
    </DataView>
  )
}

function ActivityTab({ jobId }: { jobId: string }) {
  const activity = useActivity(jobId)
  return (
    <DataView query={activity} isEmpty={(a) => a.length === 0} empty={<EmptyState title="No activity yet" />}>
      {(events) => (
        <ol className="space-y-3 border-l-2 pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-2 -left-[1.72rem] size-3 rounded-full border-2 border-background bg-foreground" aria-hidden="true" />
              <div className="font-semibold">{e.summary}</div>
              <div className="tabular text-sm text-muted-foreground">
                {e.actorName}, {formatDateTime(e.occurredAt)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </DataView>
  )
}
