import { useEffect, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Car, ChevronLeft, ChevronRight, CircleAlert, RefreshCw, Search, X } from 'lucide-react'
import { can, useCan } from '@/auth/permissions'
import { getSession } from '@/auth/session'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass, Sheet } from '@/components/ui/sheet'
import { edgeConfigured } from '@/data/live-library'
import { useLibraryPage, useSyncLibrary } from '@/data/hooks'
import { ActiveBadge, ReadOnlyNote, Section } from '@/features/admin/admin-bits'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LibraryFilters, LibraryPage, LibraryVehicle } from '@/types'

export const Route = createFileRoute('/_office/admin/vehicles')({
  beforeLoad: () => {
    if (!can(getSession()?.role, 'admin.catalogue.view')) throw redirect({ to: '/admin' })
  },
  component: VehicleLibraryPage,
})

const PAGE_SIZE = 50
const START: LibraryFilters = { search: '', makeId: '', modelId: '', sort: 'name', vehicleClass: '', fuel: '', status: 'active', source: '', page: 1, pageSize: PAGE_SIZE }

const years = (v: LibraryVehicle) => (v.yearFrom ? `${v.yearFrom} to ${v.yearTo ?? 'now'}` : 'Years not set')

function VehicleLibraryPage() {
  const canSync = useCan('admin.catalogue.edit')
  const [filters, setFilters] = useState<LibraryFilters>(START)
  const [searchText, setSearchText] = useState('')
  const [selected, setSelected] = useState<LibraryVehicle | null>(null)
  const library = useLibraryPage(filters)
  const sync = useSyncLibrary()
  const [syncedMessage, setSyncedMessage] = useState<string | null>(null)

  // Wait for a pause in typing before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((f) => (f.search === searchText.trim() ? f : { ...f, search: searchText.trim(), page: 1 })), 300)
    return () => window.clearTimeout(timer)
  }, [searchText])

  const change = (patch: Partial<LibraryFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }))
  const filtered = filters.search || filters.makeId || filters.modelId || filters.vehicleClass || filters.fuel || filters.source || filters.status !== 'active'
  const clear = () => {
    setSearchText('')
    setFilters(START)
  }

  const runSync = () => {
    setSyncedMessage(null)
    void sync
      .run(false)
      .then((r) =>
        setSyncedMessage(
          `Library updated. ${r.models.inserted} new, ${r.models.updated} checked, ${r.models.deactivated} no longer active` +
            (r.models.skipped ? `, ${r.models.skipped} skipped because they have no make` : '') +
            `. Type worked out for ${r.history.classSet} models and fuel for ${r.history.fuelSet}, from past vehicles and jobs.`,
        ),
      )
      .catch(() => undefined)
  }

  if (!edgeConfigured()) {
    return (
      <div className="mx-auto max-w-6xl pb-10">
        <PageHeader title="Vehicle library" subtitle="The makes and models the workshop services." />
        <div className="px-4 sm:px-6">
          <EmptyState icon={CircleAlert} title="The library is not connected on this device">
            Add VITE_SUPABASE_URL and VITE_EDGE_API_KEY to .env.local, then restart the app.
          </EmptyState>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader
        title="Vehicle library"
        subtitle="The makes and models the workshop services, kept in step with the back office system."
        actions={
          canSync && (
            <Button variant="outline" onClick={runSync} disabled={sync.isPending}>
              <RefreshCw className={cn(sync.isPending && 'animate-spin')} aria-hidden="true" />
              {sync.isPending ? 'Updating' : 'Update from back office'}
            </Button>
          )
        }
      />
      <div className="space-y-4 px-4 sm:px-6">
        <ActionError error={sync.error} />
        {syncedMessage && <ReadOnlyNote>{syncedMessage}</ReadOnlyNote>}

        <DataView
          query={library}
          isEmpty={(page) => page.summary.activeModels === 0 && page.total === 0 && !filtered}
          empty={
            <EmptyState icon={Car} title="The library is empty">
              {canSync ? 'Choose Update from back office to bring in the makes and models.' : 'Ask an administrator to update the library.'}
            </EmptyState>
          }
        >
          {(page) => (
            <>
              <Summary page={page} />
              <Filters filters={filters} page={page} searchText={searchText} setSearchText={setSearchText} change={change} />
              <Section title={`${page.total.toLocaleString('en-AU')} ${page.total === 1 ? 'vehicle' : 'vehicles'}`} className="p-0 sm:p-0" headerClassName="px-4 pt-4 sm:px-5 sm:pt-5" actions={filtered && <Button variant="ghost" className="-mr-3 sm:-mr-4" onClick={clear}><X aria-hidden="true" />Clear filters</Button>}>
                {page.items.length === 0 ? (
                  <EmptyState icon={Search} title="Nothing matches">Check the spelling or clear the filters.</EmptyState>
                ) : (
                  <ul className="divide-y px-4 sm:px-5" aria-busy={library.isFetching}>
                    {page.items.map((v) => (
                      <li key={v.id}>
                        <button type="button" onClick={() => setSelected(v)} className="flex min-h-16 w-full items-center gap-4 py-2 text-left hover:bg-secondary/60">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-lg font-semibold">{v.makeName} {v.name}</span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {[v.series, years(v), v.engine].filter(Boolean).join(', ')}
                            </span>
                          </span>
                          <span className="tabular hidden w-32 shrink-0 whitespace-nowrap text-right text-sm text-muted-foreground @2xl:block">
                            {v.vehicleCount > 0 ? `${v.vehicleCount.toLocaleString('en-AU')} ${v.vehicleCount === 1 ? 'vehicle' : 'vehicles'}` : 'None yet'}
                          </span>
                          <span className="hidden w-36 shrink-0 @2xl:block">{v.classLabel ?? <span className="text-muted-foreground">Type not set</span>}</span>
                          <span className="hidden w-24 shrink-0 @2xl:block">{v.fuelLabel ?? <span className="text-muted-foreground">Fuel not set</span>}</span>
                          <ActiveBadge active={v.active} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Pager total={page.total} filters={filters} onPage={(n) => setFilters((f) => ({ ...f, page: n }))} busy={library.isFetching} />
              </Section>
            </>
          )}
        </DataView>
      </div>
      {selected && <VehicleSheet vehicle={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Summary({ page }: { page: LibraryPage }) {
  const sync = page.summary.lastSync
  const figures = [
    { label: 'Active models', value: page.summary.activeModels.toLocaleString('en-AU') },
    { label: 'Makes', value: page.summary.activeMakes.toLocaleString('en-AU') },
    { label: 'Need a type', value: page.summary.needingReview.toLocaleString('en-AU') },
    { label: 'Last updated', value: sync ? formatDateTime(sync.at) : 'Never' },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label} className="rounded-xl border bg-card p-3">
          <dt className="text-sm text-muted-foreground">{f.label}</dt>
          <dd className="tabular font-display text-2xl">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

const selectClass = cn(fieldClass, 'h-11')

function Filters({
  filters, page, searchText, setSearchText, change,
}: {
  filters: LibraryFilters
  page: LibraryPage
  searchText: string
  setSearchText: (v: string) => void
  change: (patch: Partial<LibraryFilters>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-12">
      <label className="relative col-span-2 block @3xl:col-span-4">
        <span className="sr-only">Search by make, model or family</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search make or model"
          className={cn(selectClass, 'pl-10')}
        />
      </label>
      <select aria-label="Make" value={filters.makeId} onChange={(e) => change({ makeId: e.target.value, modelId: '' })} className={cn(selectClass, '@3xl:col-span-4')}>
        <option value="">All makes</option>
        {page.facets.makes.filter((m) => m.activeModels > 0 || m.id === filters.makeId).map((m) => (
          <option key={m.id} value={m.id}>{m.name} ({m.activeModels})</option>
        ))}
      </select>
      <select
        aria-label="Model"
        value={filters.modelId}
        disabled={!filters.makeId}
        onChange={(e) => change({ modelId: e.target.value })}
        className={cn(selectClass, '@3xl:col-span-4')}
      >
        <option value="">{filters.makeId ? 'All models' : 'Choose a make first'}</option>
        {page.facets.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <select aria-label="Type of vehicle" value={filters.vehicleClass} onChange={(e) => change({ vehicleClass: e.target.value })} className={cn(selectClass, '@3xl:col-span-3')}>
        <option value="">All types</option>
        {page.facets.classes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        <option value="none">Type not set</option>
      </select>
      <select aria-label="Fuel" value={filters.fuel} onChange={(e) => change({ fuel: e.target.value })} className={cn(selectClass, '@3xl:col-span-3')}>
        <option value="">Any fuel</option>
        {page.facets.fuels.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
        <option value="none">Fuel not set</option>
      </select>
      <select aria-label="Status" value={filters.status} onChange={(e) => change({ status: e.target.value as LibraryFilters['status'] })} className={cn(selectClass, '@3xl:col-span-3')}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">Active and inactive</option>
      </select>
      <select aria-label="Sort by" value={filters.sort} onChange={(e) => change({ sort: e.target.value as LibraryFilters['sort'] })} className={cn(selectClass, '@3xl:col-span-3')}>
        <option value="name">Sort A to Z</option>
        <option value="popular">Most vehicles first</option>
      </select>
    </div>
  )
}

function Pager({ total, filters, onPage, busy }: { total: number; filters: LibraryFilters; onPage: (n: number) => void; busy: boolean }) {
  const pages = Math.max(1, Math.ceil(total / filters.pageSize))
  if (total <= filters.pageSize) return null
  const first = (filters.page - 1) * filters.pageSize + 1
  const last = Math.min(total, filters.page * filters.pageSize)
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="tabular text-sm text-muted-foreground" aria-live="polite">
        {first.toLocaleString('en-AU')} to {last.toLocaleString('en-AU')} of {total.toLocaleString('en-AU')}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled={filters.page <= 1 || busy} onClick={() => onPage(filters.page - 1)}>
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="tabular px-1 text-sm">Page {filters.page} of {pages}</span>
        <Button variant="outline" disabled={filters.page >= pages || busy} onClick={() => onPage(filters.page + 1)}>
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}

function VehicleSheet({ vehicle: v, onClose }: { vehicle: LibraryVehicle; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Make', v.makeName],
    ['Model', v.name],
    ['Plain model', v.baseModel && v.baseModel.toLowerCase() !== v.name.toLowerCase() ? v.baseModel : 'Same as the model'],
    ['Family', v.family ?? 'Not set'],
    ['Series', v.series ?? 'Not set'],
    ['Years', years(v)],
    ['Type', v.classLabel ?? 'Not set'],
    ['Fuel', v.fuelLabel ?? 'Not set'],
    ['Vehicles on record', v.vehicleCount.toLocaleString('en-AU')],
    ['Engine', v.engine ?? 'Not set'],
    ['Kept in step with', v.source === 'netsuite' ? 'The back office system' : 'Typed in here'],
    ['Last updated', v.lastSyncedAt ? formatDateTime(v.lastSyncedAt) : 'Not applicable'],
  ]
  return (
    <Sheet open onClose={onClose} title={`${v.makeName} ${v.name}`} footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <ActiveBadge active={v.active} />
        <dl className="divide-y rounded-xl border">
          {rows.map(([k, value]) => (
            <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={cn('text-right font-semibold', value === 'Not set' && 'font-normal text-muted-foreground')}>{value}</dd>
            </div>
          ))}
        </dl>
        {v.attributesSource === 'research' && (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
            Checked against public sources. Confirm anything that matters before relying on it.
          </p>
        )}
        {v.notes && (
          <div>
            <h3 className="mb-1 font-display text-lg">Notes and sources</h3>
            <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {v.notes.split(/(https?:\/\/\S+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-primary-strong underline">
                    {part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}
                  </a>
                ) : (
                  part
                ),
              )}
            </p>
          </div>
        )}
        {v.attributesSource === 'history' && (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
            Type, fuel and years were worked out from the workshop's past vehicles and jobs
            {v.evidenceVehicles ? ` (${v.evidenceVehicles.toLocaleString('en-AU')} records agree)` : ''}. Check them before relying on them.
          </p>
        )}
        {v.needsReview && (
          <Field label="Needs a type">
            <p className="text-muted-foreground">
              The back office system does not say whether this is a 4WD, passenger car or light commercial, or what fuel it uses. Editing these fields arrives with the next release.
            </p>
          </Field>
        )}
      </div>
    </Sheet>
  )
}
