import { useState } from 'react'
import { Car, History, Lightbulb, Plus } from 'lucide-react'
import { Card } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { SyncBadge } from '@/components/domain/sync-badge'
import { ActionError, DataView, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/sheet'
import { createVehicle } from '@/data/actions'
import { useAction, useBookingHistory, useDuplicateCustomers } from '@/data/hooks'
import { formatDate, formatKm, normaliseRego } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Id, UpsellItem, Vehicle } from '@/types'
import { UPSELL_LABEL, emptyVehicle, vehicleReady, type VehicleDraft } from './booking-bits'
import { VehicleFields } from './vehicle-fields'

/** The customer's vehicles, the one being booked, its odometer today and its history. */
export function VehicleSection({
  customerId, vehicles, vehicleId, onVehicle, odometer, onOdometer,
}: {
  customerId: Id
  vehicles: Vehicle[]
  vehicleId?: Id
  onVehicle: (id: Id) => void
  odometer: string
  onOdometer: (km: string) => void
}) {
  const [adding, setAdding] = useState(vehicles.length === 0)
  const vehicle = vehicles.find((v) => v.id === vehicleId)

  return (
    <section aria-labelledby="vehicle-heading" className="space-y-3">
      <h2 id="vehicle-heading" className="text-2xl">Vehicle</h2>
      {(vehicles.length > 1 || !vehicle) && !adding && (
        <div className="grid gap-2 @lg:grid-cols-2" role="radiogroup" aria-label="Which vehicle">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === vehicleId}
              onClick={() => onVehicle(v.id)}
              className={cn(
                'flex min-h-16 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left',
                v.id === vehicleId ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
              )}
            >
              <RegoPlate registration={v.registration} state={v.registrationState} size="sm" />
              <span className="min-w-0 truncate">{v.year} {v.make} {v.model}</span>
            </button>
          ))}
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-16 items-center gap-2 rounded-xl border-2 border-dashed px-3 font-semibold hover:border-foreground/40">
            <Plus className="size-5" aria-hidden="true" />
            Add a vehicle
          </button>
        </div>
      )}
      {adding ? (
        <AddVehicle customerId={customerId} onDone={(id) => { setAdding(false); onVehicle(id) }} onCancel={vehicles.length ? () => setAdding(false) : undefined} />
      ) : (
        vehicle && (
          <>
            <Card className="flex flex-wrap items-center gap-4 p-4">
              <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-2xl font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</div>
                <div className="text-sm text-muted-foreground">
                  {vehicle.vin ? `VIN ${vehicle.vin}. ` : ''}On file: {formatKm(vehicle.odometerKm)}
                </div>
                <SyncBadge status={vehicle.sync.status} />
              </div>
              <label className="w-full @md:w-44">
                <span className="mb-1 block font-semibold">Odometer today, km</span>
                <input
                  className={cn(fieldClass, 'tabular font-display text-xl')}
                  value={odometer}
                  onChange={(e) => onOdometer(e.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  placeholder={vehicle.odometerKm ? String(vehicle.odometerKm) : 'Ask the customer'}
                />
              </label>
              {vehicles.length === 1 && (
                <Button variant="ghost" onClick={() => setAdding(true)}>
                  <Plus aria-hidden="true" />
                  Add a vehicle
                </Button>
              )}
            </Card>
            <ServiceHistory vehicleId={vehicle.id} />
          </>
        )
      )}
    </section>
  )
}

function ServiceHistory({ vehicleId }: { vehicleId: Id }) {
  const history = useBookingHistory(vehicleId)
  return (
    <DataView query={history} loading={<Skeleton className="h-32" />}>
      {({ visits, upsell }) =>
        visits.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3">
            <Car className="size-5 shrink-0" aria-hidden="true" />
            First visit for this vehicle. No service history yet.
          </p>
        ) : (
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-2 text-xl">
              <History className="size-5" aria-hidden="true" />
              Service history
            </h3>
            <ol className="divide-y">
              {visits.map((v) => {
                const missed = upsell.filter((u) => u.jobId === v.job.id)
                return (
                  <li key={v.job.id} className="py-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="tabular w-24 shrink-0 font-semibold">{formatDate(v.day)}</span>
                      <span className="min-w-0 flex-1">{v.serviceName}</span>
                      {v.job.odometerKmOut && <span className="tabular text-sm text-muted-foreground">{formatKm(v.job.odometerKmOut)}</span>}
                    </div>
                    {v.job.mechanicSummary && <p className="mt-0.5 text-sm text-muted-foreground @md:pl-27">{v.job.mechanicSummary}</p>}
                    {missed.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5 @md:pl-27">
                        {missed.map((m) => <UpsellTag key={m.id} item={m} />)}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ol>
          </Card>
        )
      }
    </DataView>
  )
}

/** Amber marker for work the customer did not go ahead with. Icon and words, never colour alone. */
export function UpsellTag({ item }: { item: UpsellItem }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-status-approval bg-status-approval/10 px-2.5 py-0.5 text-sm">
      <Lightbulb className="size-4 text-status-approval" aria-hidden="true" />
      <span className="font-semibold">{UPSELL_LABEL[item.kind]}:</span>
      {item.description}
    </li>
  )
}

function AddVehicle({ customerId, onDone, onCancel }: { customerId: Id; onDone: (id: Id) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<VehicleDraft>(emptyVehicle)
  const add = useAction(createVehicle)
  const owner = useDuplicateCustomers({ registration: draft.registration })
  const rego = normaliseRego(draft.registration)
  const taken = (owner.data?.data ?? []).find((m) => m.vehicles.some((v) => v.registration === rego))
  const save = () =>
    void add
      .run({
        registration: draft.registration, registrationState: draft.state, make: draft.make.trim(), model: draft.model.trim(),
        year: Number(draft.year) || undefined, odometerKm: Number(draft.odometerKm) || undefined, customerId,
      })
      .then((r) => onDone(r.data.id))
      .catch(() => undefined)

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-xl">Add a vehicle</h3>
      <VehicleFields value={draft} onChange={setDraft} />
      {taken && (
        <p role="alert" className="rounded-lg border-2 border-status-approval bg-status-approval/10 px-3 py-2">
          {rego} is already on file for {taken.customer.name}{taken.customer.id === customerId ? '. Pick it from the list above.' : '. Check with the customer before going on.'}
        </p>
      )}
      <ActionError error={add.error} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!vehicleReady(draft) || Boolean(taken) || add.isPending} onClick={save}>
          {add.isPending ? 'Saving' : 'Add vehicle'}
        </Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </Card>
  )
}

