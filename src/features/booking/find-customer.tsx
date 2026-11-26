import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Search, UserPlus } from 'lucide-react'
import { Card } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { ActionError, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from '@/components/ui/sheet'
import { createCustomer, createVehicle } from '@/data/actions'
import { useAction, useBookingCustomers, useDuplicateCustomers } from '@/data/hooks'
import { formatDate, normaliseRego } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BookingCandidate, DuplicateMatch, Id } from '@/types'
import { emptyVehicle, vehicleReady, type VehicleDraft } from './booking-bits'
import { VehicleFields } from './vehicle-fields'

export interface Picked {
  customerId: Id
  vehicleId?: Id
}

const MATCH_LABEL: Record<BookingCandidate['matchedOn'], string> = {
  rego: 'Rego match',
  mobile: 'Mobile match',
  email: 'Email match',
  name: 'Name match',
}

/** The first thing on a new booking: one search box in the middle of the screen. */
export function FindCustomer({ onPick }: { onPick: (picked: Picked) => void }) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const deferred = useDeferredValue(query)
  const results = useBookingCustomers(deferred)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const hits = deferred.trim().length >= 2 ? (results.data?.data ?? []) : []
  const pick = (c: BookingCandidate, vehicleId?: Id) =>
    onPick({ customerId: c.customer.id, vehicleId: vehicleId ?? c.matchedVehicleId ?? (c.vehicles.length === 1 ? c.vehicles[0]!.id : undefined) })

  return (
    <div className={cn('mx-auto flex w-full max-w-2xl flex-col px-4', adding || hits.length ? 'pt-8 pb-10' : 'min-h-[70dvh] justify-center')}>
      <h1 className="mb-1 text-center text-3xl sm:text-4xl">New booking</h1>
      <p className="mb-5 text-center text-muted-foreground">Search by rego, mobile or customer name.</p>
      <label className="relative block">
        <span className="sr-only">Search by rego, mobile or customer name</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setAdding(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) pick(hits[0])
          }}
          placeholder="Rego, mobile or customer name"
          autoComplete="off"
          enterKeyHint="search"
          className="h-16 w-full rounded-xl border-2 border-foreground bg-background pr-4 pl-13 text-xl shadow-card"
        />
      </label>

      {adding ? (
        <NewCustomer seed={query} onPick={onPick} onCancel={() => setAdding(false)} />
      ) : (
        query.trim().length >= 2 && (
          <div className="mt-3 space-y-2" aria-live="polite">
            {results.isError ? (
              <ActionError error={results.error} />
            ) : results.isPending || deferred !== query ? (
              <Skeleton className="h-24" />
            ) : hits.length === 0 ? (
              <p className="rounded-xl bg-secondary px-4 py-3">
                <span className="font-semibold">No customer found for "{query.trim()}".</span> Check the spelling, or add them below.
              </p>
            ) : (
              <ul className="space-y-2" aria-label="Matching customers">
                {hits.map((c) => (
                  <CandidateCard key={c.customer.id} candidate={c} onPick={pick} />
                ))}
              </ul>
            )}
            <Button variant={hits.length ? 'outline' : 'primary'} size="lg" className="w-full" onClick={() => setAdding(true)}>
              <UserPlus aria-hidden="true" />
              New customer
            </Button>
          </div>
        )
      )}
    </div>
  )
}

function CandidateCard({ candidate: c, onPick }: { candidate: BookingCandidate; onPick: (c: BookingCandidate, vehicleId?: Id) => void }) {
  return (
    <li className="rounded-xl border bg-card shadow-card">
      <button
        type="button"
        onClick={() => onPick(c)}
        className="flex min-h-touch-lg w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-t-xl px-4 pt-3 pb-2 text-left hover:bg-secondary"
      >
        <span className="font-display text-xl font-medium">{c.customer.name}</span>
        <span className="tabular">{c.customer.mobile}</span>
        <span className="min-w-0 truncate text-sm text-muted-foreground">{c.customer.email}</span>
        <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-sm font-semibold text-accent-foreground">{MATCH_LABEL[c.matchedOn]}</span>
        <span className="basis-full text-sm text-muted-foreground">
          {c.lastVisit ? `Last visit ${formatDate(c.lastVisit)}` : 'No visits yet'}
        </span>
      </button>
      {c.vehicles.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t px-3 py-2">
          {c.vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onPick(c, v.id)}
              aria-label={`Book ${v.registration}, ${v.make} ${v.model}, for ${c.customer.name}`}
              className={cn(
                'flex min-h-touch items-center gap-2 rounded-lg border-2 px-2 py-1 text-left hover:border-primary',
                v.id === c.matchedVehicleId ? 'border-primary bg-accent' : 'border-transparent',
              )}
            >
              <RegoPlate registration={v.registration} state={v.registrationState} size="sm" />
              <span className="text-sm">{v.year} {v.make} {v.model}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

/** Guess which field the search text belongs in, so nothing is typed twice. */
function seedFrom(query: string) {
  const q = query.trim()
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 8 && digits.length === q.replace(/\s/g, '').length) return { mobile: q }
  if (q.includes('@')) return { email: q }
  if (/\d/.test(q) && /[a-z]/i.test(q) && normaliseRego(q).length <= 7) return { registration: normaliseRego(q) }
  return { name: q }
}

/** First visit: the basics for the customer and their vehicle, checked against everyone on file as it is typed. */
function NewCustomer({ seed, onPick, onCancel }: { seed: string; onPick: (picked: Picked) => void; onCancel: () => void }) {
  const initial = useMemo(() => seedFrom(seed), [seed])
  const [person, setPerson] = useState({ name: initial.name ?? '', mobile: initial.mobile ?? '', email: initial.email ?? '' })
  const [vehicle, setVehicle] = useState<VehicleDraft>({ ...emptyVehicle, registration: initial.registration ?? '' })
  const check = useDeferredValue({ ...person, registration: vehicle.registration })
  const duplicates = useDuplicateCustomers(check)
  const matches = duplicates.data?.data ?? []
  // A shared mobile, email or rego is the same customer. A shared name alone is only a warning.
  const blocking = matches.filter((m) => m.reasons.some((r) => r !== 'Same name'))
  const addCustomer = useAction(createCustomer)
  const addVehicle = useAction(createVehicle)
  const busy = addCustomer.isPending || addVehicle.isPending
  const ready = person.name.trim() && person.mobile.replace(/\D/g, '').length >= 8 && vehicleReady(vehicle) && !blocking.length
  const set = (key: keyof typeof person) => (e: React.ChangeEvent<HTMLInputElement>) => setPerson((p) => ({ ...p, [key]: e.target.value }))

  const save = async () => {
    try {
      const customer = await addCustomer.run({
        name: person.name.trim(), mobile: person.mobile.trim(), email: person.email.trim() || undefined,
      })
      const created = await addVehicle.run({
        registration: vehicle.registration, registrationState: vehicle.state, make: vehicle.make.trim(), model: vehicle.model.trim(),
        year: Number(vehicle.year) || undefined, odometerKm: Number(vehicle.odometerKm) || undefined, customerId: customer.data.id,
      })
      onPick({ customerId: customer.data.id, vehicleId: created.data.id })
    } catch {
      // Shown below.
    }
  }

  return (
    <Card className="mt-4 space-y-4 p-4 @container">
      <h2 className="text-2xl">New customer</h2>
      <div className="grid gap-3 @lg:grid-cols-2">
        <Field label="Name"><input className={fieldClass} value={person.name} onChange={set('name')} autoComplete="off" autoFocus={!initial.name} /></Field>
        <Field label="Mobile"><input className={fieldClass} value={person.mobile} onChange={set('mobile')} inputMode="tel" autoComplete="off" /></Field>
        <div className="@lg:col-span-2">
          <Field label="Email, if they have one"><input className={fieldClass} value={person.email} onChange={set('email')} inputMode="email" autoComplete="off" /></Field>
        </div>
      </div>
      <DuplicateWarning matches={matches} onPick={onPick} rego={normaliseRego(vehicle.registration)} />
      <h3 className="pt-1 text-xl">Their vehicle</h3>
      <VehicleFields value={vehicle} onChange={setVehicle} />
      <ActionError error={addCustomer.error ?? addVehicle.error} />
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={!ready || busy} onClick={() => void save()}>
          {busy ? 'Saving' : 'Add customer and continue'}
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel}>Back to search</Button>
      </div>
      {blocking.length > 0 && <p className="text-sm text-muted-foreground">This customer is already on file. Use the existing record above.</p>}
    </Card>
  )
}

function DuplicateWarning({ matches, onPick, rego }: { matches: DuplicateMatch[]; onPick: (picked: Picked) => void; rego: string }) {
  if (!matches.length) return null
  return (
    <div role="alert" className="space-y-2 rounded-xl border-2 border-status-approval bg-status-approval/10 p-3">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-5 shrink-0 text-status-approval" aria-hidden="true" />
        {matches.length === 1 ? 'This looks like a customer we already have' : 'These look like customers we already have'}
      </p>
      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={m.customer.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{m.customer.name}</span>
              <span className="block text-sm text-muted-foreground">
                {m.customer.mobile}{m.customer.email ? `, ${m.customer.email}` : ''}. {m.reasons.join(', ')}.
              </span>
            </span>
            <Button
              variant="outline"
              onClick={() => onPick({ customerId: m.customer.id, vehicleId: m.vehicles.find((v) => v.registration === rego)?.id ?? (m.vehicles.length === 1 ? m.vehicles[0]!.id : undefined) })}
            >
              Use {m.customer.name.split(' ')[0]}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
