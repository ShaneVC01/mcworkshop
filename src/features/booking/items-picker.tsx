import { useMemo, useState } from 'react'
import { Check, Minus, Package, Plus, Receipt, Search, Wrench, X } from 'lucide-react'
import { fieldClass } from '@/components/ui/sheet'
import { useItems, useItemSearch } from '@/data/hooks'
import { formatHours, formatMoney, incGst } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BookingItem, CatalogueItem, ItemKind } from '@/types'
import { addFittingLine, addItemLine, itemLineKey, qtyStep, removeItemLine, setItemQty } from './booking-bits'

const KIND: Record<ItemKind, { label: string; icon: typeof Package }> = {
  part: { label: 'Part', icon: Package },
  labour: { label: 'Labour', icon: Wrench },
  charge: { label: 'Charge', icon: Receipt },
}

/** The general labour item offered when a part has no usual fitting labour. */
const GENERAL_LABOUR = 'LAB4WD'

const priceText = (item: CatalogueItem) => {
  const each = formatMoney(incGst(item.unitCents))
  if (item.kind === 'labour') return item.standardHours ? `${formatHours(item.standardHours)}, ${formatMoney(incGst(Math.round(item.unitCents * item.standardHours)))}` : `${each} an hour`
  return item.unit === 'litre' ? `${each} a litre` : `${each} each`
}

/**
 * One off parts, labour and charges from the items list. Search by part number, name or class.
 * A part brings its usual fitting labour, which can be changed or removed.
 */
export function ItemsPicker({ lines, onChange }: { lines: BookingItem[]; onChange: (lines: BookingItem[]) => void }) {
  const [query, setQuery] = useState('')
  const all = useItems()
  const found = useItemSearch(query)
  const catalogue = all.data?.data ?? []
  // Quick access: labour by the hour and consumables, the lines added most often.
  const quick = catalogue.filter((i) => i.active && ((i.kind === 'labour' && !i.standardHours) || i.code === 'WC'))
  const count = (item: CatalogueItem) => lines.filter((l) => l.itemId === item.id && !l.forItemId).reduce((s, l) => s + l.qty, 0)
  const add = (item: CatalogueItem) => onChange(addItemLine(lines, item))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="Quick add">
        {quick.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => add(item)}
            className="inline-flex min-h-touch items-center gap-2 rounded-full border-2 border-border px-4 font-medium hover:border-foreground/40"
          >
            <Plus className="size-4" aria-hidden="true" />
            {item.name}
            <span className="tabular text-sm text-muted-foreground">{item.kind === 'labour' ? '1 h' : formatMoney(incGst(item.unitCents))}</span>
          </button>
        ))}
      </div>
      <label className="relative block">
        <span className="sr-only">Search parts, labour and charges</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          className={cn(fieldClass, 'pl-10')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Part number, part or labour, for example DB1482 or brake pads"
          autoComplete="off"
        />
      </label>
      {query.trim() && (
        <ul className="space-y-2" aria-label="Matching items">
          {(found.data?.data ?? []).map((item) => (
            <ResultRow key={item.id} item={item} count={count(item)} catalogue={catalogue} onAdd={() => add(item)} />
          ))}
          {found.data && found.data.data.length === 0 && <li className="text-muted-foreground">Nothing in the items list matches "{query}".</li>}
        </ul>
      )}
    </div>
  )
}

function ResultRow({ item, count, catalogue, onAdd }: { item: CatalogueItem; count: number; catalogue: CatalogueItem[]; onAdd: () => void }) {
  const Kind = KIND[item.kind]
  const fitting = item.fitting && catalogue.find((i) => i.id === item.fitting!.itemId)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-2 border-border bg-card px-3 py-2">
      <Kind.icon className="size-5 shrink-0 text-muted-foreground" aria-label={Kind.label} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{item.name}</span>
        <span className="tabular block text-sm text-muted-foreground">
          {item.code}, {item.category}. {priceText(item)} inc GST.
          {fitting && ` Fitting ${formatHours(item.fitting!.hours)} added with it.`}
        </span>
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add ${item.name}`}
        className={cn(
          'inline-flex min-h-touch items-center gap-2 rounded-lg border-2 px-3 font-display text-sm font-medium tracking-wide uppercase',
          count ? 'border-primary bg-accent' : 'border-foreground hover:bg-secondary',
        )}
      >
        {count ? <Check className="size-4 text-primary-strong" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        {count ? `Added${item.kind === 'labour' ? `, ${formatHours(count)}` : count > 1 ? `, ${count}` : ''}` : 'Add'}
      </button>
    </li>
  )
}

/** The chosen item lines, for "On this booking": quantity or hours, price and remove. Fitting labour sits under its part. */
export function ItemLines({ lines, onChange }: { lines: BookingItem[]; onChange: (lines: BookingItem[]) => void }) {
  const all = useItems()
  const catalogue = useMemo(() => all.data?.data ?? [], [all.data])
  const general = catalogue.find((i) => i.code === GENERAL_LABOUR)
  const top = lines.filter((l) => !l.forItemId || !lines.some((p) => p.itemId === l.forItemId && !p.forItemId))
  const find = (l: BookingItem) => catalogue.find((i) => i.id === l.itemId)

  return (
    <>
      {top.map((line) => {
        const item = find(line)
        if (!item) return null
        const fittings = item.kind === 'part' ? lines.filter((l) => l.forItemId === item.id) : []
        return (
          <li key={itemLineKey(line)} className="space-y-1">
            <LineRow item={item} line={line} lines={lines} onChange={onChange} />
            {fittings.map((f) => {
              const labour = find(f)
              return labour && <LineRow key={itemLineKey(f)} item={labour} line={f} lines={lines} onChange={onChange} fittingFor={item} />
            })}
            {item.kind === 'part' && fittings.length === 0 && general && (
              <button
                type="button"
                onClick={() => onChange(addFittingLine(lines, item.id, general.id))}
                className="ml-8 inline-flex min-h-touch items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary-strong underline"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add fitting labour
              </button>
            )}
          </li>
        )
      })}
    </>
  )
}

function LineRow({ item, line, lines, onChange, fittingFor }: {
  item: CatalogueItem; line: BookingItem; lines: BookingItem[]; onChange: (lines: BookingItem[]) => void; fittingFor?: CatalogueItem
}) {
  const Kind = KIND[item.kind]
  const step = qtyStep(item, line.qty)
  const amount = item.kind === 'labour' ? formatHours(line.qty) : item.unit === 'litre' ? `${line.qty} L` : `${line.qty}`
  // Fixed time labour has its own name ("Front brake pads, fit"). Hourly labour is named for the part it fits.
  const label = fittingFor ? (item.standardHours ? item.name : `Fit ${fittingFor.name}`) : item.name
  return (
    <div className={cn('flex min-h-touch flex-wrap items-center gap-x-3 gap-y-1', fittingFor && 'ml-8')}>
      <Kind.icon className="size-4 shrink-0 text-muted-foreground" aria-label={Kind.label} />
      <span className="min-w-48 flex-1">
        <span className="block">{label}</span>
        <span className="tabular block text-sm text-muted-foreground">{item.code}, {formatMoney(incGst(Math.round(line.qty * item.unitCents)))} inc GST</span>
      </span>
      <span className="ml-auto flex items-center rounded-lg border bg-background">
        <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(setItemQty(lines, line, line.qty - step))} className="flex size-touch items-center justify-center">
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span className="tabular min-w-12 text-center text-sm font-semibold" aria-live="polite">{amount}</span>
        <button type="button" aria-label={`More ${label}`} onClick={() => onChange(setItemQty(lines, line, line.qty + step))} className="flex size-touch items-center justify-center">
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </span>
      <button type="button" onClick={() => onChange(removeItemLine(lines, line))} aria-label={`Remove ${label}`} className="flex size-touch items-center justify-center rounded-lg hover:bg-background">
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}
