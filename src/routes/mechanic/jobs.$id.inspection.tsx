import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Check, ChevronLeft, TriangleAlert } from 'lucide-react'
import { RegoPlate } from '@/components/domain/rego-plate'
import { SyncBadge } from '@/components/domain/sync-badge'
import { ActionError, DataView } from '@/components/states'
import { updateChecklistItem } from '@/data/actions'
import { useAction, useJobCard } from '@/data/hooks'
import { checklistProgress } from '@/features/mechanic/bits'
import { isFinished } from '@/lib/job-state'
import { cn } from '@/lib/utils'
import type { ChecklistItem, JobCard } from '@/types'

export const Route = createFileRoute('/mechanic/jobs/$id/inspection')({ component: InspectionPage })

/** One tap per item, saved as you go. Attention opens a finding. */
function InspectionPage() {
  const { id } = Route.useParams()
  const jobCard = useJobCard(id)
  return (
    <DataView query={jobCard}>
      {(s, sync) => {
        const { done, total } = checklistProgress(s.job)
        const readOnly = isFinished(s.job.status)
        return (
          <div className="mx-auto max-w-2xl px-4 pt-3 pb-8">
            <Link to="/mechanic/jobs/$id" params={{ id: s.job.id }} className="inline-flex min-h-touch items-center gap-1 font-semibold">
              <ChevronLeft className="size-5" aria-hidden="true" />
              Back to job
            </Link>
            <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b bg-background px-4 py-2">
              <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
              <h1 className="min-w-0 flex-1 truncate text-xl">Service checklist</h1>
              <span className="tabular font-display text-xl font-medium">
                {done} of {total}
              </span>
            </header>
            <div className="flex min-h-8 items-center justify-end">
              <SyncBadge status={sync.status} />
            </div>
            <ul className="space-y-2">
              {s.job.checklist.map((item) => (
                <li key={item.id}>
                  <ChecklistRow job={s.job} item={item} readOnly={readOnly} />
                </li>
              ))}
            </ul>
            <Link
              to="/mechanic/jobs/$id"
              params={{ id: s.job.id }}
              className="mt-6 flex min-h-touch-lg items-center justify-center rounded-lg bg-foreground font-display text-lg font-semibold tracking-[0.06em] text-background uppercase"
            >
              Done, back to job
            </Link>
          </div>
        )
      }}
    </DataView>
  )
}

function ChecklistRow({ job, item, readOnly }: { job: JobCard; item: ChecklistItem; readOnly: boolean }) {
  const save = useAction(updateChecklistItem)
  const navigate = useNavigate()
  const [reading, setReading] = useState(item.reading == null ? '' : String(item.reading))
  const choice = 'flex min-h-touch-lg flex-1 items-center justify-center gap-2 rounded-lg border-2 font-display text-lg font-semibold tracking-wide uppercase'

  const attention = () => {
    if (item.findingId) return
    void navigate({ to: '/mechanic/jobs/$id/findings/new', params: { id: job.id }, search: { item: item.id } })
  }

  return (
    <div className="rounded-xl border bg-card p-3 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold">{item.label}</span>
        {!item.required && <span className="text-sm text-muted-foreground">Optional</span>}
      </div>
      {item.kind === 'reading' ? (
        <label className="mt-2 flex items-center gap-3">
          <span className="sr-only">{item.label} in {item.unit}</span>
          <input
            value={reading}
            disabled={readOnly}
            inputMode="decimal"
            onChange={(e) => setReading(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => {
              const value = reading === '' ? undefined : Number(reading)
              if (value !== item.reading) void save.run(job.id, item.id, { reading: value }).catch(() => undefined)
            }}
            className="tabular h-14 w-28 rounded-lg border-2 border-input bg-background px-3 text-center font-display text-2xl font-medium"
          />
          <span className="text-lg">{item.unit}</span>
          {item.reading != null && <Check className="size-6 text-primary-strong" aria-label="Recorded" />}
        </label>
      ) : (
        <div className="mt-2 flex gap-2" role="group" aria-label={item.label}>
          <button
            type="button"
            aria-pressed={item.result === 'ok'}
            disabled={readOnly}
            onClick={() => void save.run(job.id, item.id, { result: 'ok' }).catch(() => undefined)}
            className={cn(choice, item.result === 'ok' ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}
          >
            <Check className="size-5" aria-hidden="true" />
            OK
          </button>
          <button
            type="button"
            aria-pressed={item.result === 'attention'}
            disabled={readOnly}
            onClick={attention}
            className={cn(choice, item.result === 'attention' ? 'border-status-approval bg-status-approval text-white' : 'border-input')}
          >
            <TriangleAlert className="size-5" aria-hidden="true" />
            {item.findingId ? 'Reported' : 'Attention'}
          </button>
        </div>
      )}
      <div className="mt-2 empty:hidden">
        <ActionError error={save.error} />
      </div>
    </div>
  )
}
