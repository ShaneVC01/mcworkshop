import { useState, type ReactNode } from 'react'
import { CircleCheck, CircleMinus, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/domain/job-bits'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { ChecklistTemplateItem, TemplatePart } from '@/types'

/** A titled block on an admin screen. */
export function Section({
  title,
  hint,
  actions,
  children,
  className,
  headerClassName,
}: {
  title: string
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** For a card whose own padding is removed so the content can run edge to edge. */
  headerClassName?: string
}) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', headerClassName)}>
        <div className="min-w-0">
          <h2 className="text-xl">{title}</h2>
          {hint && <p className="mt-1 max-w-[65ch] text-muted-foreground">{hint}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  )
}

/** Active or inactive. Icon and word, never colour alone. */
export function ActiveBadge({ active }: { active: boolean }) {
  const Icon = active ? CircleCheck : CircleMinus
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', active ? 'text-primary-strong' : 'text-muted-foreground')}>
      <Icon className="size-4" aria-hidden="true" />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export function ReadOnlyNote({ children }: { children: ReactNode }) {
  return <p className="mb-4 rounded-lg bg-secondary px-3 py-2 text-sm">{children}</p>
}

const toText = (value: number | undefined, digits: number) => (value === undefined || Number.isNaN(value) ? '' : value.toFixed(digits))

/** Dollars on screen, integer cents in the data. Keeps what is being typed until the field is left. */
export function MoneyInput({
  cents,
  onChange,
  label,
  disabled,
  className,
}: {
  cents: number
  onChange: (cents: number) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? toText(cents / 100, 2)}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value.replace(/[$,\s]/g, ''))
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100))
      }}
      onBlur={() => setDraft(null)}
      className={cn(fieldClass, 'tabular text-right', className)}
    />
  )
}

/** A plain number field that keeps what is being typed until the field is left. */
export function NumberInput({
  value,
  onChange,
  label,
  digits = 2,
  disabled,
  className,
  placeholder,
}: {
  value: number | undefined
  onChange: (value: number | undefined) => void
  label: string
  digits?: number
  disabled?: boolean
  className?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? toText(value, value !== undefined && Number.isInteger(value) ? 0 : digits)}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.target.value.trim() === '') return onChange(undefined)
        const n = Number(e.target.value)
        if (Number.isFinite(n)) onChange(n)
      }}
      onBlur={() => setDraft(null)}
      className={cn(fieldClass, 'tabular', className)}
    />
  )
}

export function PartsEditor({
  parts,
  onChange,
  disabled,
}: {
  parts: TemplatePart[]
  onChange: (parts: TemplatePart[]) => void
  disabled?: boolean
}) {
  const update = (i: number, patch: Partial<TemplatePart>) => onChange(parts.map((p, n) => (n === i ? { ...p, ...patch } : p)))
  return (
    <div className="space-y-2">
      {parts.length === 0 && <p className="text-muted-foreground">No parts. Labour only.</p>}
      {parts.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-b-0 sm:flex-nowrap sm:border-b-0 sm:pb-0">
          <input
            aria-label={`Part ${i + 1} name`}
            value={p.name}
            disabled={disabled}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Engine oil 5W-30, 9 L"
            className={cn(fieldClass, 'basis-full sm:min-w-0 sm:flex-1 sm:basis-0')}
          />
          <NumberInput label={`Part ${i + 1} quantity`} className="w-20 shrink-0" value={p.qty} digits={0} disabled={disabled} onChange={(qty) => update(i, { qty: qty ?? 0 })} />
          <MoneyInput label={`Part ${i + 1} price each, excluding GST`} className="min-w-0 flex-1 sm:w-28 sm:flex-none" cents={p.unitCents} disabled={disabled} onChange={(unitCents) => update(i, { unitCents })} />
          <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Remove part ${i + 1}`} onClick={() => onChange(parts.filter((_, n) => n !== i))}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      {parts.length > 0 && <p className="text-sm text-muted-foreground">Quantity, then price each excluding GST.</p>}
      {!disabled && (
        <Button variant="outline" onClick={() => onChange([...parts, { name: '', qty: 1, unitCents: 0 }])}>
          <Plus aria-hidden="true" />
          Add part
        </Button>
      )}
    </div>
  )
}

export function ChecklistEditor({
  items,
  onChange,
  disabled,
}: {
  items: ChecklistTemplateItem[]
  onChange: (items: ChecklistTemplateItem[]) => void
  disabled?: boolean
}) {
  const update = (i: number, patch: Partial<ChecklistTemplateItem>) => onChange(items.map((c, n) => (n === i ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-muted-foreground">No checklist items.</p>}
      {items.map((c, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-center gap-2 @lg:grid-cols-[minmax(0,1fr)_6.5rem_5rem_auto_auto]">
          <input
            aria-label={`Checklist item ${i + 1}`}
            value={c.label}
            disabled={disabled}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Front brake pads"
            className={cn(fieldClass, 'col-span-3 @lg:col-span-1')}
          />
          <select
            aria-label={`Checklist item ${i + 1} type`}
            value={c.kind}
            disabled={disabled}
            onChange={(e) => update(i, { kind: e.target.value as ChecklistTemplateItem['kind'], unit: e.target.value === 'reading' ? (c.unit ?? 'psi') : undefined })}
            className={fieldClass}
          >
            <option value="check">Tick</option>
            <option value="reading">Reading</option>
          </select>
          {c.kind === 'reading' ? (
            <input aria-label={`Checklist item ${i + 1} unit`} value={c.unit ?? ''} disabled={disabled} onChange={(e) => update(i, { unit: e.target.value })} placeholder="psi" className={fieldClass} />
          ) : (
            <span className="hidden @lg:block" />
          )}
          <label className="flex min-h-touch items-center gap-2 whitespace-nowrap">
            <input type="checkbox" checked={c.required} disabled={disabled} onChange={(e) => update(i, { required: e.target.checked })} className="size-5 accent-[var(--primary)]" />
            Required
          </label>
          <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Remove checklist item ${i + 1}`} onClick={() => onChange(items.filter((_, n) => n !== i))}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      {!disabled && (
        <Button variant="outline" onClick={() => onChange([...items, { label: '', kind: 'check', required: true }])}>
          <Plus aria-hidden="true" />
          Add checklist item
        </Button>
      )}
    </div>
  )
}
