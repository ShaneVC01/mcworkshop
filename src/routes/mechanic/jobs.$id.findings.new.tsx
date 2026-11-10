import { useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Camera, ChevronLeft, Minus, Plus, X } from 'lucide-react'
import { RegoPlate } from '@/components/domain/rego-plate'
import { ActionError, DataView } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from '@/components/ui/sheet'
import { addFinding } from '@/data/actions'
import { useAction, useJobCard } from '@/data/hooks'
import { readPhoto } from '@/features/mechanic/bits'
import { formatHours } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FindingSeverity, ScheduledJob } from '@/types'

export const Route = createFileRoute('/mechanic/jobs/$id/findings/new')({
  validateSearch: (s: Record<string, unknown>): { item?: string } => ({ item: typeof s.item === 'string' ? s.item : undefined }),
  component: NewFindingPage,
})

const severities: { key: FindingSeverity; label: string; colour: string }[] = [
  { key: 'monitor', label: 'Monitor', colour: 'var(--status-unavailable)' },
  { key: 'recommended', label: 'Recommended', colour: 'var(--status-approval)' },
  { key: 'safety', label: 'Safety', colour: 'var(--status-blocked)' },
]

function NewFindingPage() {
  const { id } = Route.useParams()
  const jobCard = useJobCard(id)
  return <DataView query={jobCard}>{(s) => <FindingForm s={s} />}</DataView>
}

/** The technician says what they found. The advisor prices it and talks to the customer. */
function FindingForm({ s }: { s: ScheduledJob }) {
  const { item: itemId } = Route.useSearch()
  const item = s.job.checklist.find((c) => c.id === itemId)
  const navigate = useNavigate()
  const save = useAction(addFinding)
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(item?.label ?? '')
  const [severity, setSeverity] = useState<FindingSeverity>('recommended')
  const [description, setDescription] = useState('')
  const [action, setAction] = useState('')
  const [hours, setHours] = useState(0)
  const [photos, setPhotos] = useState<string[]>([])
  const [photoError, setPhotoError] = useState<Error | null>(null)

  const back = () => void navigate({ to: item ? '/mechanic/jobs/$id/inspection' : '/mechanic/jobs/$id', params: { id: s.job.id } })

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPhotoError(null)
      const photo = await readPhoto(file)
      setPhotos((p) => [...p, photo])
    } catch (err) {
      setPhotoError(err as Error)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3 pb-8">
      <Link to={item ? '/mechanic/jobs/$id/inspection' : '/mechanic/jobs/$id'} params={{ id: s.job.id }} className="inline-flex min-h-touch items-center gap-1 font-semibold">
        <ChevronLeft className="size-5" aria-hidden="true" />
        Back
      </Link>
      <header className="mb-4 flex items-center gap-3">
        <RegoPlate registration={s.vehicle.registration} state={s.vehicle.registrationState} size="sm" />
        <h1 className="text-2xl">Report a finding</h1>
      </header>

      <div className="space-y-5">
        <Field label="What is it?">
          <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Front brake pads" />
        </Field>

        <div>
          <span className="mb-1 block font-semibold">How serious?</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Severity">
            {severities.map((sev) => (
              <button
                key={sev.key}
                type="button"
                role="radio"
                aria-checked={severity === sev.key}
                onClick={() => setSeverity(sev.key)}
                className={cn('min-h-touch-lg rounded-lg border-2 px-1 font-display text-base font-semibold tracking-wide sm:text-lg', severity !== sev.key && 'border-input')}
                style={severity === sev.key ? { borderColor: sev.colour, backgroundColor: sev.colour, color: '#fff' } : undefined}
              >
                {sev.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="What did you find?">
          <textarea className={cn(fieldClass, 'h-auto py-2')} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pads approximately 2 mm" />
        </Field>

        <div>
          <span className="mb-1 block font-semibold">Photo</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`Photo ${i + 1}`} className="size-24 rounded-lg border object-cover" />
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setPhotos((p) => p.filter((_, n) => n !== i))}
                  className="absolute -top-2 -right-2 flex size-9 items-center justify-center rounded-full bg-foreground text-background"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            ))}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e)} aria-label="Take a photo" />
            <Button size="lg" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera aria-hidden="true" />
              Take photo
            </Button>
          </div>
          <div className="mt-2 empty:hidden">
            <ActionError error={photoError} />
          </div>
        </div>

        <Field label="Suggested fix" hint="Leave empty if it only needs noting. A suggested fix goes to the service advisor to quote.">
          <input className={fieldClass} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Replace front brake pads" />
        </Field>

        <div>
          <span className="mb-1 block font-semibold">Extra labour</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Less time" onClick={() => setHours((h) => Math.max(0, h - 0.5))} className="flex size-touch-lg items-center justify-center rounded-lg border-2 border-input">
              <Minus className="size-6" aria-hidden="true" />
            </button>
            <span className="tabular w-24 text-center font-display text-3xl font-medium" aria-live="polite">{formatHours(hours)}</span>
            <button type="button" aria-label="More time" onClick={() => setHours((h) => h + 0.5)} className="flex size-touch-lg items-center justify-center rounded-lg border-2 border-input">
              <Plus className="size-6" aria-hidden="true" />
            </button>
          </div>
        </div>

        <ActionError error={save.error} />
        <Button
          size="lg"
          className="w-full"
          disabled={!title.trim() || !description.trim() || save.isPending}
          onClick={() =>
            void save
              .run(s.job.id, {
                title: title.trim(), severity, description: description.trim(), photos,
                suggestedAction: action.trim() || undefined, extraLabourHours: hours || undefined, checklistItemId: item?.id,
              })
              .then(back)
              .catch(() => undefined)
          }
        >
          {save.isPending ? 'Saving' : 'Save finding'}
        </Button>
      </div>
    </div>
  )
}
