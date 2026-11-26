import { useCallback, useMemo, useState } from 'react'
import { PackageSearch } from 'lucide-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCan } from '@/auth/permissions'
import { Card } from '@/components/domain/job-bits'
import { ActionError, DataView, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { createBooking } from '@/data/actions'
import { useAction, useBookingCustomer, useBookingEstimate, useVehicle } from '@/data/hooks'
import { CustomerCard } from '@/features/booking/customer-card'
import { FindCustomer, type Picked } from '@/features/booking/find-customer'
import { FitIn } from '@/features/booking/fit-in'
import { VehicleSection } from '@/features/booking/vehicle-section'
import { BOOKING_TYPE_LABEL, type ChosenTime } from '@/features/booking/booking-bits'
import { WorkSection, type ChosenExtra, type ChosenService } from '@/features/booking/work-section'
import { addMinutes, at, dayKey, formatDate, formatHours, formatMoney, formatTime, workingToday } from '@/lib/format'
import type { AvailabilityRequest, BookingItem, BookingType, Id } from '@/types'

interface NewBookingSearch {
  vehicle?: string
  day?: string
  time?: string
}

export const Route = createFileRoute('/_office/bookings/new')({
  validateSearch: (s: Record<string, unknown>): NewBookingSearch => ({
    vehicle: typeof s.vehicle === 'string' ? s.vehicle : undefined,
    day: typeof s.day === 'string' ? s.day : undefined,
    time: typeof s.time === 'string' ? s.time : undefined,
  }),
  component: NewBookingPage,
})

/** Search first. Once the customer is found, everything else is on one screen. */
function NewBookingPage() {
  const search = Route.useSearch()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [searching, setSearching] = useState(false)
  // Coming from a vehicle page: start with that vehicle's owner.
  const fromVehicle = useVehicle(search.vehicle ?? '')
  const preset = search.vehicle && !searching && fromVehicle.data ? { customerId: fromVehicle.data.data.customer.id, vehicleId: search.vehicle } : null
  const current = picked ?? preset

  if (search.vehicle && !searching && !picked && fromVehicle.isPending) return <Skeleton className="m-6 h-40" />
  if (!current) return <FindCustomer onPick={setPicked} />
  return (
    <BookingDesk
      key={current.customerId}
      initial={current}
      onRestart={() => {
        setPicked(null)
        setSearching(true)
      }}
    />
  )
}

function BookingDesk({ initial, onRestart }: { initial: Picked; onRestart: () => void }) {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const canOverride = useCan('booking.override-conflict')
  const customer = useBookingCustomer(initial.customerId || undefined)

  const [pickedVehicleId, setVehicleId] = useState<Id | undefined>(initial.vehicleId)
  // The reading typed today, kept per vehicle. Until then the one on file shows.
  const [typedOdometer, setTypedOdometer] = useState<{ vehicleId?: Id; km: string }>({ km: '' })
  const [bookingType, setBookingType] = useState<BookingType>('service')
  const [services, setServices] = useState<ChosenService[]>([])
  const [extras, setExtras] = useState<ChosenExtra[]>([])
  const [items, setItems] = useState<BookingItem[]>([])
  const [concern, setConcern] = useState('')
  // A day picked on the calendar comes first.
  const [day, setDay] = useState<string | undefined>(search.day)
  const [chosen, setChosen] = useState<ChosenTime | undefined>()
  const [tentative, setTentative] = useState(false)

  const vehicles = useMemo(() => customer.data?.data.vehicles ?? [], [customer.data])
  // One vehicle means no question to ask.
  const vehicleId = pickedVehicleId ?? (vehicles.length === 1 ? vehicles[0]!.id : undefined)
  const vehicle = vehicles.find((v) => v.id === vehicleId)
  const odometer = typedOdometer.vehicleId === vehicleId ? typedOdometer.km : vehicle?.odometerKm ? String(vehicle.odometerKm) : ''
  const setOdometer = (km: string) => setTypedOdometer({ vehicleId, km })

  const chooseVehicle = (id: Id) => {
    setVehicleId(id)
    setServices([])
    setExtras([])
    setItems([])
    setChosen(undefined)
  }
  const changeType = (t: BookingType) => {
    setBookingType(t)
    // Repair only has no scheduled service, so drop the one suggested by the odometer.
    if (t === 'repair') setServices((list) => list.filter((s) => !/km service/i.test(s.label)))
  }
  const toggleService = (s: ChosenService) =>
    setServices((list) => (list.some((x) => x.templateId === s.templateId) ? list.filter((x) => x.templateId !== s.templateId) : [...list, s]))
  const toggleExtra = (e: ChosenExtra) =>
    setExtras((list) => (list.some((x) => x.sourceId === e.sourceId) ? list.filter((x) => x.sourceId !== e.sourceId) : [...list, e]))

  const odometerKm = Number(odometer) || undefined
  const templateIds = useMemo(() => services.map((s) => s.templateId), [services])
  const extraLines = useMemo(() => extras.map(({ description, labourHours, partsCents }) => ({ description, labourHours, partsCents })), [extras])
  const estimate = useBookingEstimate(vehicleId, templateIds, extraLines, items)
  const e = estimate.data?.data
  const hasWork = templateIds.length + extraLines.length + items.length > 0
  const request = useMemo<AvailabilityRequest | null>(
    () => (hasWork && e ? { labourHours: e.labourHours, skills: e.skills, bayType: e.bayType, fromDay: workingToday(), notBefore: e.partsReadyDay, limit: 5 } : null),
    [hasWork, e],
  )
  const startAt = chosen ? at(chosen.day, chosen.time) : undefined

  const book = useAction(createBooking)
  const chooseTime = useCallback((c: ChosenTime | undefined) => setChosen(c), [])
  const confirm = (override = false) => {
    if (!vehicleId || !startAt || !hasWork) return
    void book
      .run({
        vehicleId, services: services.map((s) => ({ templateId: s.templateId, label: s.label })), extras, items, bookingType,
        customerConcern: concern, startAt, tentative, override, odometerKm,
      })
      .then((result) => navigate({ to: '/calendar', search: { day: dayKey(result.data.startAt) } }))
      .catch(() => undefined)
  }

  return (
    <DataView query={customer} loading={<Skeleton className="m-6 h-60" />}>
      {({ customer: c, lastVisit }) => (
        <div className="mx-auto max-w-7xl px-4 pt-5 pb-10 sm:px-6">
          <h1 className="sr-only">New booking for {c.name}</h1>
          <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-8 @container">
              <VehicleSection
                customerId={c.id} vehicles={vehicles} vehicleId={vehicleId} onVehicle={chooseVehicle}
                odometer={odometer} onOdometer={setOdometer}
              />
              {vehicleId && (
                <WorkSection
                  vehicleId={vehicleId} odometerKm={odometerKm} bookingType={bookingType} onBookingType={changeType}
                  services={services} extras={extras} onService={toggleService} onExtra={toggleExtra} items={items} onItems={setItems}
                  concern={concern} onConcern={setConcern}
                />
              )}
              {vehicleId && (
                <FitIn request={request} preferredTime={search.time} chosen={chosen} onChoose={chooseTime} day={day} onDay={setDay} parts={e} />
              )}
            </div>

            <aside className="space-y-4 @5xl:sticky @5xl:top-4 @5xl:self-start">
              <CustomerCard customer={c} lastVisit={lastVisit} onChange={onRestart} />
              <Card className="p-4">
                <h2 className="mb-3 text-xl">Booking</h2>
                <p className="mb-3 rounded-lg bg-secondary px-3 py-2 font-semibold">{BOOKING_TYPE_LABEL[bookingType]}</p>
                {hasWork && e ? (
                  <>
                    {e.profileNames.length > 0 && (
                      <p className="mb-3 text-sm text-muted-foreground">Times and parts from this vehicle's profile for {e.profileNames.join(', ')}.</p>
                    )}
                    <dl className="tabular space-y-1.5">
                      <Row label={`Labour, ${formatHours(e.labourHours)}`} value={formatMoney(e.labourCents)} />
                      <Row label="Parts" value={formatMoney(e.partsCents)} />
                      <Row label="GST" value={formatMoney(e.gstCents)} />
                      <div className="flex items-baseline justify-between border-t pt-2">
                        <dt className="font-semibold">Total inc GST</dt>
                        <dd className="font-display text-3xl font-medium">{formatMoney(e.totalCents)}</dd>
                      </div>
                    </dl>
                    {startAt && (
                      <dl className="tabular mt-4 space-y-1.5 rounded-lg bg-secondary p-3">
                        <Row label="Drop off" value={`${formatDate(startAt)}, ${formatTime(startAt)}`} />
                        <Row label="Expected ready" value={formatTime(addMinutes(startAt, e.labourHours * 60 + 60))} />
                        <p className="pt-1 text-sm text-muted-foreground">The workshop assigns a mechanic when the vehicle arrives.</p>
                      </dl>
                    )}
                    {e.partsReadyDay && (
                      <p className="mt-3 flex gap-2 text-sm font-semibold">
                        <PackageSearch className="size-4 shrink-0 text-status-parts" aria-hidden="true" />
                        Parts to order. Not before {formatDate(e.partsReadyDay)}.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Labour, parts and GST show here once the work is chosen.</p>
                )}
                <label className="mt-4 flex min-h-touch items-center gap-3">
                  <input type="checkbox" checked={tentative} onChange={(ev) => setTentative(ev.target.checked)} className="size-5 accent-[var(--primary)]" />
                  Hold as tentative until the customer confirms
                </label>
                <div className="mt-3 space-y-2">
                  <ActionError error={book.error} />
                  <Button size="lg" className="w-full" disabled={!vehicleId || !hasWork || !startAt || book.isPending} onClick={() => confirm()}>
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
      )}
    </DataView>
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
