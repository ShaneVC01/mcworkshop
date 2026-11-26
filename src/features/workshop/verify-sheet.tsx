import { Link } from '@tanstack/react-router'
import { CircleCheck, CircleX } from 'lucide-react'
import { RegoPlate } from '@/components/domain/rego-plate'
import { ActionError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { verifyJob } from '@/data/actions'
import { useAction } from '@/data/hooks'
import { formatDateTime } from '@/lib/format'
import { closeOutChecks } from '@/lib/job-state'
import type { ScheduledJob } from '@/types'

/** The workshop controller's check before a finished job can be invoiced. */
export function VerifySheet({ s, onClose }: { s: ScheduledJob; onClose: () => void }) {
  const verify = useAction(verifyJob)
  const checks = closeOutChecks(s.job)
  const ready = checks.every((c) => c.ok)
  return (
    <Sheet
      open
      onClose={onClose}
      title={<RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} />}
      footer={
        <>
          <Link to="/bookings/$id" params={{ id: s.booking.id }} className="inline-flex min-h-touch items-center rounded-lg border px-4 font-semibold hover:bg-secondary">
            Open job
          </Link>
          <Button size="lg" disabled={!ready || verify.isPending} onClick={() => void verify.run(s.job.id).then(onClose).catch(() => undefined)}>
            {verify.isPending ? 'Saving' : 'Ready to invoice'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>
          {s.booking.serviceName} for {s.customer.name}.{' '}
          {s.job.completedAt && `Finished by ${s.job.completedBy ?? 'the mechanic'} ${formatDateTime(s.job.completedAt)}.`}
        </p>
        <ul className="space-y-2" aria-label="Checks before invoicing">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              {c.ok ? <CircleCheck className="size-5 shrink-0 text-primary-strong" aria-label="Done" /> : <CircleX className="size-5 shrink-0 text-destructive" aria-label="Not done" />}
              <span className={c.ok ? undefined : 'font-semibold'}>{c.label}</span>
            </li>
          ))}
        </ul>
        {!ready && <p className="text-sm text-muted-foreground">Open the job to finish these, then check it again.</p>}
        <ActionError error={verify.error} />
      </div>
    </Sheet>
  )
}

