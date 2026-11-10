import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, Search, UserPlus } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { Card } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from '@/components/ui/sheet'
import { createBooking, createCustomer, createVehicle, LABOUR_RATE_CENTS } from '@/data/actions'
import { useAction, useAvailability, useSearch, useServiceTemplates, useTechnicians, useVehicle } from '@/data/hooks'
import {
  addMinutes, at, dayKey, formatDate, formatDayRelative, formatHours, formatKm, formatMoney, formatTime, gstOf,
  normaliseRego, workingToday,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AvailabilitySlot, RegoState, ServiceTemplate } from '@/types'

interface NewBookingSearch {
  vehicle?: string
  tech?: string
  day?: string
  time?: string
}

export const Route = createFileRoute('/_office/bookings/new')({
  validateSearch: (s: Record<string, unknown>): NewBookingSearch => ({
    vehicle: typeof s.vehicle === 'string' ? s.vehicle : undefined,
    tech: typeof s.tech === 'string' ? s.tech : undefined,
    day: typeof s.day === 'string' ? s.day : undefined,
    time: typeof s.time === 'string' ? s.time : undefined,
  }),
  component: NewBookingPage,
})

const states: RegoState[] = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT']
const slotKey = (s: AvailabilitySlot) => `${s.technicianId}-${s.startAt}`

/** The whole booking fits on one screen: vehicle, work, time, price, confirm. */
function NewBookingPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const canOverride = useCan('booking.override-conflict')

  const [vehicleId, setVehicleId] = useState(search.vehicle ?? '')
  const [templateId, setTemplateId] = useState('')
  const [concern, setConcern] = useState('')
  const [chosen, setChosen] = useState('')
  const [tentative, setTentative] = useState(false)

  const templates = useServiceTemplates()
  const technicians = useTechnicians()
  const template = templates.data?.data.find((t) => t.id === templateId)
  const fromDay = search.day ?? workingToday()
  const request = useMemo(
    () => (template ? { labourHours: template.labourHours, skill: template.skill, bayType: template.bayType, fromDay } : null),
    [template, fromDay],
  )
  const availability = useAvailability(request)
  const book = useAction(createBooking)

  // A slot picked on the calendar comes first in the list.
  const picked = useMemo<AvailabilitySlot | null>(() => {
    if (!search.tech || !search.day || !search.time || !template) return null
    const tech = technicians.data?.data.find((t) => t.id === search.tech)
    if (!tech) return null
    const startAt = at(search.day, search.time)
    return { technicianId: tech.id, technicianName: tech.name, startAt, endAt: addMinutes(startAt, template.labourHours * 60) }
  }, [search.tech, search.day, search.time, template, technicians.data])

  const slots = useMemo(() => {
    const found = availability.data?.data ?? []
    return picked ? [picked, ...found.filter((s) => slotKey(s) !== slotKey(picked))] : found
  }, [availability.data, picked])
  const slot = slots.find((s) => slotKey(s) === chosen) ?? slots[0]

  const confirm = (override = false) => {
    if (!template || !slot || !vehicleId) return
    void book
      .run({
        vehicleId, serviceTemplateId: template.id, customerConcern: concern, startAt: slot.startAt,
        technicianId: slot.technicianId, bayId: slot.bayId, tentative, override,
      })
      .then((result) => navigate({ to: '/calendar', search: { day: dayKey(result.data.startAt) } }))
      .catch(() => undefined)
  }

  const labourCents = template ? Math.round(template.labourHours * LABOUR_RATE_CENTS) : 0
  const partsCents = template ? template.parts.reduce((s, p) => s + p.qty * p.unitCents, 0) : 0
  const subtotal = labourCents + partsCents

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader title="New booking" />
      <div className="grid gap-6 px-4 sm:px-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Step title="Vehicle" done={Boolean(vehicleId)}>
            {vehicleId ? <ChosenVehicle id={vehicleId} onChange={() => setVehicleId('')} /> : <VehiclePicker onPick={setVehicleId} />}
          </Step>

          <Step title="What does it need?" done={Boolean(template)}>
            <DataView query={templates} loading={<Skeleton className="h-40" />}>
              {(list) => (
                <div className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
                  {list.map((t) => (
                    <TemplateButton key={t.id} template={t} selected={t.id === templateId} onSelect={() => { setTemplateId(t.id); setChosen('') }} />
                  ))}
                </div>
              )}
            </DataView>
            <div className="mt-4">
              <Field label="In the customer's words" hint="Write it as they say it. The technician's diagnosis is recorded separately.">
                <textarea
                  value={concern}
                  onChange={(e) => setConcern(e.target.value)}
                  rows={2}
                  placeholder="Knocking from left front when turning slowly"
                  className={cn(fieldClass, 'h-auto py-2')}
                />
              </Field>
            </div>
          </Step>

          <Step title="When can we fit it in?" done={Boolean(slot)}>
            {!template ? (
              <p className="text-muted-foreground">Choose the work first and the next openings will show here.</p>
            ) : (
              <DataView query={availability} loading={<Skeleton className="h-32" />}>
                {() =>
                  slots.length === 0 ? (
                    <p className="font-semibold">No opening in the next three weeks for a technician with this skill. Place it by hand on the calendar.</p>
                  ) : (
                    <ul className="space-y-2" role="radiogroup" aria-label="Available times">
                      {slots.map((s) => {
                        const active = slot && slotKey(s) === slotKey(slot)
                        return (
                          <li key={slotKey(s)}>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={Boolean(active)}
                              onClick={() => setChosen(slotKey(s))}
                              className={cn(
                                'tabular flex min-h-14 w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-2 px-4 py-2 text-left',
                                active ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
                              )}
                            >
                              <span className="w-28 font-display text-lg font-medium">{formatDayRelative(dayKey(s.startAt))}</span>
                              <span className="w-20 font-semibold">{formatTime(s.startAt)}</span>
                              <span className="flex-1">{s.technicianName}</span>
                              {picked && slotKey(s) === slotKey(picked) && <span className="text-sm text-muted-foreground">Picked on the calendar</span>}
                              {active && <Check className="size-5 text-primary-strong" aria-hidden="true" />}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )
                }
              </DataView>
            )}
          </Step>
        </div>

        <aside className="@4xl:sticky @4xl:top-4 @4xl:self-start">
          <Card className="p-4">
            <h2 className="mb-3 text-xl">Estimate</h2>
            {template ? (
              <>
                <dl className="tabular space-y-1.5">
                  <Row label={`Labour, ${formatHours(template.labourHours)}`} value={formatMoney(labourCents)} />
                  <Row label="Parts" value={formatMoney(partsCents)} />
                  <Row label="GST" value={formatMoney(gstOf(subtotal))} />
                  <div className="flex items-baseline justify-between border-t pt-2">
                    <dt className="font-semibold">Total inc GST</dt>
                    <dd className="font-display text-3xl font-medium">{formatMoney(subtotal + gstOf(subtotal))}</dd>
                  </div>
                </dl>
                {slot && (
                  <dl className="tabular mt-4 space-y-1.5 rounded-lg bg-secondary p-3">
                    <Row label="Drop off" value={`${formatDate(slot.startAt)}, ${formatTime(slot.startAt)}`} />
                    <Row label="Expected ready" value={formatTime(addMinutes(slot.endAt, 60))} />
                    <Row label="Technician" value={slot.technicianName.split(' ')[0]!} />
                  </dl>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Labour, parts and GST show here once the work is chosen.</p>
            )}
            <label className="mt-4 flex min-h-touch items-center gap-3">
              <input type="checkbox" checked={tentative} onChange={(e) => setTentative(e.target.checked)} className="size-5 accent-[var(--primary)]" />
              Hold as tentative until the customer confirms
            </label>
            <div className="mt-3 space-y-2">
              <ActionError error={book.error} />
              <Button size="lg" className="w-full" disabled={!vehicleId || !template || !slot || book.isPending} onClick={() => confirm()}>
                {book.isPending ? 'Saving' : 'Confirm booking'}
              </Button>
              {book.error && canOverride && (
                <Button variant="destructive" className="w-full" disabled={book.isPending} onClick={() => confirm(true)}>
                  Book anyway
                </Button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}

function Step({ title, done, children }: { title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-2xl">
        {title}
        {done && <Check className="size-6 text-primary-strong" aria-label="Done" />}
      </h2>
      {children}
    </section>
  )
}

function TemplateButton({ template, selected, onSelect }: { template: ServiceTemplate; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-16 w-full flex-col justify-center rounded-xl border-2 px-4 py-2 text-left',
        selected ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
      )}
    >
      <span className="font-semibold">{template.name}</span>
      <span className="tabular text-sm text-muted-foreground">
        {template.category}, {formatHours(template.labourHours)}
      </span>
    </button>
  )
}

function ChosenVehicle({ id, onChange }: { id: string; onChange: () => void }) {
  const detail = useVehicle(id)
  return (
    <DataView query={detail} loading={<Skeleton className="h-24" />}>
      {({ vehicle, customer, lastVisit }) => (
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl font-medium">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </div>
            <div>{customer.name}, {customer.mobile}</div>
            <div className="tabular text-sm text-muted-foreground">
              {formatKm(vehicle.odometerKm)}
              {lastVisit ? `, last visit ${formatDate(lastVisit)}` : ', first visit'}
            </div>
          </div>
          <Button variant="outline" onClick={onChange}>
            Change vehicle
          </Button>
        </Card>
      )}
    </DataView>
  )
}

function VehiclePicker({ onPick }: { onPick: (vehicleId: string) => void }) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const results = useSearch(query)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const hits = (results.data?.data ?? []).filter((h) => h.kind === 'vehicle')

  if (adding) return <NewVehicleForm rego={query} onDone={onPick} onCancel={() => setAdding(false)} />

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search by rego, customer name or mobile</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) onPick(hits[0].id)
          }}
          placeholder="Rego, customer name or mobile"
          autoComplete="off"
          autoCapitalize="characters"
          className="h-16 w-full rounded-xl border-2 border-foreground bg-background pr-4 pl-13 font-display text-2xl tracking-wide uppercase placeholder:font-sans placeholder:text-lg placeholder:tracking-normal placeholder:normal-case"
        />
      </label>
      {query.trim().length >= 2 && (
        <div className="mt-2">
          {results.isError ? (
            <ActionError error={results.error} />
          ) : results.isPending ? (
            <Skeleton className="h-16" />
          ) : (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => onPick(h.id)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left shadow-card hover:border-primary">
                    {h.vehicle && <RegoPlate registration={h.vehicle.registration} state={h.vehicle.registrationState} />}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{h.title}</span>
                      <span className="block truncate text-muted-foreground">{h.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <UserPlus aria-hidden="true" />
                  {hits.length ? 'Add a different vehicle' : `Add ${normaliseRego(query)} as a new vehicle`}
                </Button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function NewVehicleForm({ rego, onDone, onCancel }: { rego: string; onDone: (vehicleId: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: '', mobile: '', registration: /\d/.test(rego) ? normaliseRego(rego) : '', state: 'QLD' as RegoState,
    make: '', model: '', year: '', odometerKm: '',
  })
  const addCustomer = useAction(createCustomer)
  const addVehicle = useAction(createVehicle)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const ready = form.name && form.mobile && form.registration && form.make && form.model
  const busy = addCustomer.isPending || addVehicle.isPending

  const save = async () => {
    try {
      const customer = await addCustomer.run({ name: form.name.trim(), mobile: form.mobile.trim() })
      const vehicle = await addVehicle.run({
        registration: form.registration, registrationState: form.state, make: form.make.trim(), model: form.model.trim(),
        year: Number(form.year) || undefined, odometerKm: Number(form.odometerKm) || undefined, customerId: customer.data.id,
      })
      onDone(vehicle.data.id)
    } catch {
      // The error is shown below.
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-xl">New customer and vehicle</h3>
      <div className="grid gap-3 @lg:grid-cols-2">
        <Field label="Customer name"><input className={fieldClass} value={form.name} onChange={set('name')} autoComplete="off" /></Field>
        <Field label="Mobile"><input className={fieldClass} value={form.mobile} onChange={set('mobile')} inputMode="tel" autoComplete="off" /></Field>
        <Field label="Rego"><input className={cn(fieldClass, 'uppercase')} value={form.registration} onChange={set('registration')} autoCapitalize="characters" /></Field>
        <Field label="State">
          <select className={fieldClass} value={form.state} onChange={set('state')}>
            {states.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Make"><input className={fieldClass} value={form.make} onChange={set('make')} placeholder="Toyota" /></Field>
        <Field label="Model"><input className={fieldClass} value={form.model} onChange={set('model')} placeholder="LandCruiser 79" /></Field>
        <Field label="Year"><input className={fieldClass} value={form.year} onChange={set('year')} inputMode="numeric" /></Field>
        <Field label="Odometer, km"><input className={fieldClass} value={form.odometerKm} onChange={set('odometerKm')} inputMode="numeric" /></Field>
      </div>
      <ActionError error={addCustomer.error ?? addVehicle.error} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!ready || busy} onClick={() => void save()}>{busy ? 'Saving' : 'Save and continue'}</Button>
        <Button variant="ghost" onClick={onCancel}>Back to search</Button>
      </div>
    </Card>
  )
}
