import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Field, fieldClass } from '@/components/ui/sheet'
import { useVehicleLibrary } from '@/data/hooks'
import { describeModel } from '@/lib/service-profiles'
import { cn } from '@/lib/utils'
import type { RegoState, VehicleModel } from '@/types'
import type { VehicleDraft } from './booking-bits'
import { Select } from '@/components/ui/fields'


const STATES: RegoState[] = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT']
const FUEL: Record<VehicleModel['fuel'], string> = { diesel: 'diesel', petrol: 'petrol', hybrid: 'hybrid', electric: 'electric' }

/** Rego, then make and model picked by searching the vehicle library, then year and odometer. */
export function VehicleFields({ value, onChange }: { value: VehicleDraft; onChange: (v: VehicleDraft) => void }) {
  const set = (key: keyof VehicleDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [key]: e.target.value })
  return (
    <div className="grid gap-3 @lg:grid-cols-2">
      <div className="grid grid-cols-[1fr_6.5rem] gap-2">
        <Field label="Rego">
          <input className={cn(fieldClass, 'font-display tracking-wide uppercase')} value={value.registration} onChange={set('registration')} autoCapitalize="characters" autoComplete="off" />
        </Field>
        <Field label="State">
          <Select className={fieldClass} value={value.state} onChange={set('state')}>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Year"><input className={fieldClass} value={value.year} onChange={set('year')} inputMode="numeric" placeholder="2021" /></Field>
        <Field label="Odometer, km"><input className={fieldClass} value={value.odometerKm} onChange={set('odometerKm')} inputMode="numeric" placeholder="If known" /></Field>
      </div>
      <div className="@lg:col-span-2">
        <ModelPicker value={value} onChange={onChange} />
      </div>
    </div>
  )
}

function ModelPicker({ value, onChange }: { value: VehicleDraft; onChange: (v: VehicleDraft) => void }) {
  const library = useVehicleLibrary()
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState(false)
  const chosen = value.make && value.model ? `${value.make} ${value.model}` : ''

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return (library.data?.data ?? [])
      .filter((m) => m.active && words.every((w) => describeModel(m).toLowerCase().includes(w)))
      .slice(0, 6)
  }, [library.data, query])

  const pick = (m: VehicleModel) => {
    const series = m.series?.match(/\d+/)?.[0]
    onChange({ ...value, make: m.make, model: series ? `${m.model} ${series}` : m.model })
    setQuery('')
  }

  if (manual) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Make"><input className={fieldClass} value={value.make} onChange={(e) => onChange({ ...value, make: e.target.value })} placeholder="Toyota" /></Field>
        <Field label="Model"><input className={fieldClass} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} placeholder="LandCruiser 79" /></Field>
        <button type="button" className="col-span-2 min-h-touch text-left font-semibold text-primary-strong underline" onClick={() => setManual(false)}>
          Search the vehicle list instead
        </button>
      </div>
    )
  }

  return (
    <div>
      <Field label="Make and model">
        <span className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            className={cn(fieldClass, 'pl-10')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={chosen || 'Start typing, for example "hilux" or "79"'}
            autoComplete="off"
          />
        </span>
      </Field>
      {chosen && !query && (
        <p className="mt-2 flex items-center gap-2 font-semibold">
          <Check className="size-5 text-primary-strong" aria-hidden="true" />
          {chosen}
        </p>
      )}
      {query && (
        <ul className="mt-2 space-y-1" aria-label="Matching vehicles">
          {matches.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => pick(m)} className="flex min-h-touch w-full flex-col justify-center rounded-lg border px-3 py-1.5 text-left hover:border-primary">
                <span className="font-semibold">{describeModel(m)}</span>
                <span className="text-sm text-muted-foreground">
                  {m.yearFrom} to {m.yearTo ?? 'now'}, {FUEL[m.fuel]}{m.engine ? `, ${m.engine}` : ''}
                </span>
              </button>
            </li>
          ))}
          {!matches.length && <li className="px-1 text-muted-foreground">Nothing in the vehicle list matches.</li>}
        </ul>
      )}
      <button type="button" className="mt-1 min-h-touch font-semibold text-primary-strong underline" onClick={() => setManual(true)}>
        Not in the list? Type the make and model
      </button>
    </div>
  )
}
