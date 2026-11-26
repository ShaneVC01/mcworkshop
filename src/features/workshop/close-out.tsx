import { Link } from '@tanstack/react-router'
import { BadgeCheck, ClipboardCheck, Phone, Receipt } from 'lucide-react'
import { JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { ActionError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { CLOSE_OUT, closeOutStepOf } from '@/lib/job-state'
import type { ScheduledJob } from '@/types'
import { useCloseOut } from './use-close-out'

const STEP = {
  verify: { label: 'Check job', icon: ClipboardCheck },
  invoiced: { label: 'Mark invoiced', icon: Receipt },
  paid: { label: 'Mark paid', icon: BadgeCheck },
} as const

/** The button for a job's next step, or nothing when this person cannot take it. */
export function CloseOutButton({ s, closeOut }: { s: ScheduledJob; closeOut: ReturnType<typeof useCloseOut> }) {
  const step = closeOutStepOf(s)
  if (!step || !closeOut.allowed(step)) return null
  const { label, icon: Icon } = STEP[step]
  const busy = closeOut.busyId === s.job.id
  return (
    <Button variant={step === 'paid' ? 'primary' : 'outline'} disabled={busy} onClick={() => closeOut.run(step, s)} aria-label={`${label}, ${s.vehicle.registration}`}>
      <Icon aria-hidden="true" />
      {busy ? 'Saving' : label}
    </Button>
  )
}

const GROUPS = [
  { step: 'verify', title: 'To check', hint: 'The mechanic has finished. The workshop controller checks the job before it is invoiced.' },
  { step: 'invoiced', title: 'Ready to invoice', hint: 'Checked. Raise the invoice, then mark it invoiced so the customer can collect.' },
  { step: 'paid', title: 'Ready to collect', hint: 'Invoiced. Mark paid when the customer pays at reception.' },
] as const

/** Every vehicle not yet paid for, in its close out step, with that step's button. */
export function CloseOutPanel({ jobs, emptyText }: { jobs: ScheduledJob[]; emptyText?: string }) {
  const closeOut = useCloseOut()
  const open = jobs.filter((s) => CLOSE_OUT.includes(s.job.status))
  if (!open.length) return <p className="text-muted-foreground">{emptyText ?? 'Nothing to check, invoice or collect.'}</p>
  return (
    <div className="space-y-5">
      <ActionError error={closeOut.error} />
      {GROUPS.map((g) => {
        const list = open.filter((s) => closeOutStepOf(s) === g.step)
        if (!list.length) return null
        return (
          <section key={g.step} aria-labelledby={`close-${g.step}`} className="space-y-2">
            <h3 id={`close-${g.step}`} className="text-xl">
              {g.title} <span className="tabular rounded-full bg-secondary px-2 text-base">{list.length}</span>
            </h3>
            <p className="text-sm text-muted-foreground">{g.hint}</p>
            <ul className="space-y-2">
              {list.map((s) => (
                <li key={s.booking.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3">
                  <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
                  <div className="min-w-56 flex-1">
                    <p className="font-semibold">{s.customer.name}</p>
                    <p className="text-sm text-muted-foreground">{s.booking.serviceName}</p>
                  </div>
                  <JobStatusPill job={s.job} />
                  <div className="flex flex-wrap gap-2">
                    {g.step === 'paid' && (
                      <a href={`tel:${s.customer.mobile.replace(/\D/g, '')}`} className="inline-flex min-h-touch items-center gap-2 rounded-lg border px-3 font-semibold hover:bg-secondary">
                        <Phone className="size-4" aria-hidden="true" />
                        {s.customer.mobile}
                      </a>
                    )}
                    <Link to="/bookings/$id" params={{ id: s.booking.id }} className="inline-flex min-h-touch items-center rounded-lg border px-3 font-semibold hover:bg-secondary">
                      Open
                    </Link>
                    <CloseOutButton s={s} closeOut={closeOut} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {closeOut.sheet}
    </div>
  )
}
