import { useMemo, useState } from 'react'
import { Bell, BellOff, Check, Gauge, Lightbulb, Package, Plus, Search, Wrench, X } from 'lucide-react'
import { DataView, Skeleton } from '@/components/states'
import { fieldClass } from '@/components/ui/sheet'
import { useBookingHistory, useServiceSuggestions, useServiceTemplates } from '@/data/hooks'
import { formatDate, formatHours, formatMoney, incGst } from '@/lib/format'
import { isScheduled } from '@/lib/service-suggestions'
import { cn } from '@/lib/utils'
import type { BookingExtra, BookingItem, BookingType, Id, ServiceTemplate, UpsellItem } from '@/types'
import { BOOKING_TYPE_LABEL, UPSELL_LABEL } from './booking-bits'
import { ItemLines, ItemsPicker } from './items-picker'

export interface ChosenService {
  templateId: Id
  label: string
  labourHours: number
}

export type ChosenExtra = BookingExtra & { sourceId: Id }

/**
 * Everything that decides how long the job takes: the service due, earlier quotes, common jobs, a search
 * of services, and one off parts, labour and charges from the items list.
 */
export function WorkSection({
  vehicleId, odometerKm, services, extras, onService, onExtra, items, onItems, concern, onConcern, bookingType, onBookingType,
}: {
  items: BookingItem[]
  onItems: (items: BookingItem[]) => void
  bookingType: BookingType
  onBookingType: (t: BookingType) => void
  vehicleId: Id
  odometerKm?: number
  services: ChosenService[]
  extras: ChosenExtra[]
  onService: (s: ChosenService) => void
  onExtra: (e: ChosenExtra) => void
  concern: string
  onConcern: (text: string) => void
}) {
  const suggestions = useServiceSuggestions(vehicleId, odometerKm)
  const history = useBookingHistory(vehicleId)
  const templates = useServiceTemplates()
  const [query, setQuery] = useState('')
  const chosen = (id: Id) => services.some((s) => s.templateId === id)
  const added = (id: Id) => extras.some((e) => e.sourceId === id)
  const suggestedIds = new Set(suggestions.data?.data.map((s) => s.templateId))

  const active = useMemo(() => (templates.data?.data ?? []).filter((t) => t.active !== false), [templates.data])
  const common = active.filter((t) => !isScheduled(t))
  const found = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return active.filter((t) => words.every((w) => `${t.name} ${t.category}`.toLowerCase().includes(w))).slice(0, 8)
  }, [active, query])
  const fromTemplate = (t: ServiceTemplate): ChosenService => ({ templateId: t.id, label: t.name, labourHours: t.labourHours })

  return (
    <section aria-labelledby="work-heading" className="space-y-5">
      <h2 id="work-heading" className="text-2xl">What does it need?</h2>

      <BookingTypePicker value={bookingType} onChange={onBookingType} />

      {bookingType !== 'repair' && <Group title="Due at this reading" icon={Gauge}>
        <DataView query={suggestions} loading={<Skeleton className="h-20" />}>
          {(list) =>
            list.length === 0 ? (
              <p className="text-muted-foreground">No scheduled service fits this vehicle. Search for the work below.</p>
            ) : (
              <div className="grid gap-2 @lg:grid-cols-2">
                {list.map((s) => (
                  <Toggle
                    key={s.templateId}
                    selected={chosen(s.templateId)}
                    onClick={() => onService({ templateId: s.templateId, label: s.label, labourHours: s.labourHours })}
                    title={s.label}
                    detail={s.reason}
                    meta={formatHours(s.labourHours)}
                    large
                  />
                ))}
              </div>
            )
          }
        </DataView>
      </Group>}

      {(history.data?.data.upsell.length ?? 0) > 0 && (
        <Group title="Offered before, not done" icon={Lightbulb} tone="upsell">
          <ul className="space-y-2">
            {history.data!.data.upsell.map((u) => (
              <UpsellRow key={u.id} item={u} added={added(u.id)} onClick={() =>
                onExtra({ sourceId: u.id, description: u.description, labourHours: u.labourHours, partsCents: u.partsCents })}
              />
            ))}
          </ul>
        </Group>
      )}

      <Group title="Common jobs">
        <div className="flex flex-wrap gap-2">
          {common.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={chosen(t.id)}
              onClick={() => onService(fromTemplate(t))}
              className={cn(
                'inline-flex min-h-touch items-center gap-2 rounded-full border-2 px-4 font-medium',
                chosen(t.id) ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
              )}
            >
              {chosen(t.id) ? <Check className="size-4 text-primary-strong" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              {t.name}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Search for other services">
        <label className="relative block">
          <span className="sr-only">Search services and repairs</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input className={cn(fieldClass, 'pl-10')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example brakes, 40,000 or inspection" autoComplete="off" />
        </label>
        {query && (
          <div className="mt-2 grid gap-2 @lg:grid-cols-2">
            {found.map((t) => (
              <Toggle
                key={t.id}
                selected={chosen(t.id)}
                onClick={() => onService(fromTemplate(t))}
                title={t.name}
                detail={isScheduled(t) && !suggestedIds.has(t.id) ? `${t.category}. Not the one due at this reading.` : t.category}
                meta={formatHours(t.labourHours)}
              />
            ))}
            {!found.length && <p className="text-muted-foreground">Nothing matches "{query}".</p>}
          </div>
        )}
      </Group>

      <Group title="Parts, labour and one off items" icon={Package}>
        <p className="mb-2 text-sm text-muted-foreground">
          For repairs and anything not in a service. A part brings its usual fitting labour, which you can change.
        </p>
        <ItemsPicker lines={items} onChange={onItems} />
      </Group>

      {(services.length > 0 || extras.length > 0 || items.length > 0) && (
        <div className="rounded-xl bg-secondary p-3">
          <h3 className="mb-1 font-semibold">On this booking</h3>
          <ul className="space-y-1">
            {services.map((s) => (
              <Chosen key={s.templateId} label={s.label} hours={s.labourHours} onRemove={() => onService(s)} />
            ))}
            {extras.map((e) => (
              <Chosen key={e.sourceId} label={e.description} hours={e.labourHours} upsell onRemove={() => onExtra(e)} />
            ))}
            <ItemLines lines={items} onChange={onItems} />
          </ul>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block font-semibold">In the customer's words</span>
        <textarea
          value={concern}
          onChange={(e) => onConcern(e.target.value)}
          rows={2}
          placeholder="Knocking from left front when turning slowly"
          className={cn(fieldClass, 'h-auto py-2')}
        />
        <span className="mt-1 block text-sm text-muted-foreground">Write it as they say it. The mechanic's diagnosis is recorded separately.</span>
      </label>
    </section>
  )
}

/** Service is the default. Staff tick for repairs on top, or switch to repair only, which sends no service reminders. */
function BookingTypePicker({ value, onChange }: { value: BookingType; onChange: (t: BookingType) => void }) {
  const repairOnly = value === 'repair'
  return (
    <div className="rounded-xl border-2 border-foreground/15 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={!repairOnly}
          onClick={() => onChange(value === 'repair' ? 'service' : value)}
          className={cn(
            'inline-flex min-h-touch-lg items-center gap-2 rounded-lg border-2 px-4 font-display text-lg font-medium tracking-wide uppercase',
            !repairOnly ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
          )}
        >
          {!repairOnly && <Check className="size-5 text-primary-strong" aria-hidden="true" />}
          Service
        </button>
        <label className={cn('inline-flex min-h-touch-lg items-center gap-3 rounded-lg px-3', repairOnly && 'opacity-50')}>
          <input
            type="checkbox"
            className="size-6 accent-[var(--primary)]"
            checked={value === 'service-repair'}
            disabled={repairOnly}
            onChange={(e) => onChange(e.target.checked ? 'service-repair' : 'service')}
          />
          <span className="font-semibold">Also needs repairs</span>
        </label>
        <button
          type="button"
          aria-pressed={repairOnly}
          onClick={() => onChange(repairOnly ? 'service' : 'repair')}
          className={cn(
            'inline-flex min-h-touch-lg items-center gap-2 rounded-lg border-2 px-4 font-display text-lg font-medium tracking-wide uppercase sm:ml-auto',
            repairOnly ? 'border-primary bg-accent' : 'border-border hover:border-foreground/40',
          )}
        >
          {repairOnly ? <Check className="size-5 text-primary-strong" aria-hidden="true" /> : <Wrench className="size-5" aria-hidden="true" />}
          Repair only
        </button>
      </div>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        {repairOnly ? <BellOff className="size-4 shrink-0" aria-hidden="true" /> : <Bell className="size-4 shrink-0" aria-hidden="true" />}
        {repairOnly
          ? 'Repair only. The customer will not get service reminders from this visit.'
          : `${BOOKING_TYPE_LABEL[value]}. The customer will get service reminders from this visit.`}
      </p>
    </div>
  )
}

function Group({ title, icon: Icon, tone, children }: { title: string; icon?: typeof Gauge; tone?: 'upsell'; children: React.ReactNode }) {
  return (
    <div className={cn(tone === 'upsell' && 'rounded-xl border-2 border-status-approval bg-status-approval/5 p-3')}>
      <h3 className="mb-2 flex items-center gap-2 text-lg">
        {Icon && <Icon className={cn('size-5', tone === 'upsell' && 'text-status-approval')} aria-hidden="true" />}
        {title}
      </h3>
      {children}
    </div>
  )
}

function Toggle({ selected, onClick, title, detail, meta, large }: {
  selected: boolean; onClick: () => void; title: string; detail: string; meta: string; large?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border-2 px-4 py-2.5 text-left',
        large ? 'min-h-20' : 'min-h-16',
        selected ? 'border-primary bg-accent' : 'border-border bg-card hover:border-foreground/40',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block font-semibold', large && 'font-display text-xl font-medium')}>{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      <span className="tabular shrink-0 text-sm font-semibold">{meta}</span>
      {selected ? <Check className="size-5 shrink-0 text-primary-strong" aria-label="Added" /> : <Plus className="size-5 shrink-0" aria-hidden="true" />}
    </button>
  )
}

function UpsellRow({ item, added, onClick }: { item: UpsellItem; added: boolean; onClick: () => void }) {
  const price = incGst(item.labourCents + item.partsCents)
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-card px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{item.description}</span>
        <span className="block text-sm text-muted-foreground">
          {UPSELL_LABEL[item.kind]} on {formatDate(item.day)}. {formatHours(item.labourHours)}
          {item.labourCents + item.partsCents > 0 ? `, about ${formatMoney(price)} inc GST` : ''}.
        </span>
      </span>
      <button
        type="button"
        aria-pressed={added}
        onClick={onClick}
        className={cn(
          'inline-flex min-h-touch items-center gap-2 rounded-lg border-2 px-3 font-display text-sm font-medium tracking-wide uppercase',
          added ? 'border-primary bg-accent' : 'border-status-approval hover:bg-status-approval/10',
        )}
      >
        {added ? <Check className="size-4 text-primary-strong" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        {added ? 'Added' : 'Add to booking'}
      </button>
    </li>
  )
}

function Chosen({ label, hours, upsell, onRemove }: { label: string; hours: number; upsell?: boolean; onRemove: () => void }) {
  return (
    <li className="flex min-h-touch items-center gap-3">
      {upsell ? <Lightbulb className="size-4 shrink-0 text-status-approval" aria-label="From an earlier quote" /> : <Check className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />}
      <span className="min-w-0 flex-1">{label}</span>
      <span className="tabular text-sm">{formatHours(hours)}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="flex size-touch items-center justify-center rounded-lg hover:bg-background">
        <X className="size-5" aria-hidden="true" />
      </button>
    </li>
  )
}
