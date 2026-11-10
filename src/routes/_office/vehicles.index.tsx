import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Car, Search } from 'lucide-react'
import { JobStatusPill } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { PageHeader } from '@/components/shell/app-shell'
import { DataView, EmptyState } from '@/components/states'
import { useVehicles } from '@/data/hooks'
import { dayKey, formatDate, formatDayRelative, formatKm } from '@/lib/format'

export const Route = createFileRoute('/_office/vehicles/')({ component: VehiclesPage })

function VehiclesPage() {
  const [query, setQuery] = useState('')
  const vehicles = useVehicles(query)

  return (
    <div className="mx-auto max-w-7xl pb-8">
      <PageHeader title="Vehicles" subtitle="Every vehicle on file, by rego." />
      <div className="px-4 sm:px-6">
        <label className="relative mb-4 block max-w-md">
          <span className="sr-only">Filter vehicles by rego, model or customer</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by rego, model or customer"
            className="h-11 w-full rounded-lg border border-input bg-background pr-3 pl-10"
          />
        </label>
        <DataView
          query={vehicles}
          isEmpty={(list) => list.length === 0}
          empty={
            <EmptyState icon={Car} title={`No vehicle matches "${query}"`}>
              Check the rego, or start a booking to add a new vehicle.
            </EmptyState>
          }
        >
          {(list) => (
            <ul className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {list.map(({ vehicle, customer, lastVisit, nextBooking, currentJob }) => (
                <li key={vehicle.id}>
                  <Link
                    to="/vehicles/$id"
                    params={{ id: vehicle.id }}
                    className="flex h-full gap-3 rounded-xl border bg-card p-3 shadow-card hover:border-foreground/40"
                  >
                    <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} className="shrink-0 self-start" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-lg font-medium">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </div>
                      <div className="truncate">{customer.name}</div>
                      <div className="tabular text-sm text-muted-foreground">
                        {formatKm(vehicle.odometerKm)}
                        {lastVisit && `, last here ${formatDate(lastVisit)}`}
                      </div>
                      {currentJob ? (
                        <JobStatusPill job={currentJob} className="mt-1.5" />
                      ) : nextBooking ? (
                        <div className="mt-1 text-sm font-semibold text-primary-strong">
                          Booked {formatDayRelative(dayKey(nextBooking.startAt)).toLowerCase()}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DataView>
      </div>
    </div>
  )
}
