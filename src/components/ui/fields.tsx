import { Children, isValidElement, useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { CalendarDays, Check, ChevronDown, Clock } from 'lucide-react'
import { dayKey, formatDate, formatTime, fromMinutes, toMinutes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MonthDays, PickerButton } from './calendar'
import { Popover } from './popover'
import { fieldClass } from './sheet'

/**
 * Themed controls used everywhere instead of the browser's own date, time and list pickers,
 * so every picker in the app looks and works the same.
 */

const triggerClass = cn(fieldClass, 'flex items-center justify-between gap-2 text-left disabled:opacity-50')

/** A date, picked from the same month calendar as the planner. Value is YYYY-MM-DD or empty. */
export function DateField({
  value, onChange, min, placeholder = 'Pick a date', clearable = true, className, ...rest
}: {
  value: string
  onChange: (day: string) => void
  min?: string
  placeholder?: string
  clearable?: boolean
  className?: string
  'aria-label'?: string
  disabled?: boolean
}) {
  return (
    <Popover
      label={rest['aria-label'] ?? 'Pick a date'}
      className={className}
      trigger={({ open, toggle }) => (
        <button type="button" data-popover-trigger aria-haspopup="dialog" aria-expanded={open} aria-label={rest['aria-label'] ? `${rest['aria-label']}, ${value ? formatDate(value) : 'not set'}` : undefined} disabled={rest.disabled} onClick={toggle} className={triggerClass}>
          <span className={cn('tabular', !value && 'text-muted-foreground')}>{value ? formatDate(value) : placeholder}</span>
          <CalendarDays className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MonthDays value={value || undefined} min={min} onPick={(d) => { onChange(d); close() }} />
          <div className="mt-3 flex gap-2">
            {clearable && value && <PickerButton onClick={() => { onChange(''); close() }}>Clear</PickerButton>}
            {(!min || dayKey() >= min) && <PickerButton primary onClick={() => { onChange(dayKey()); close() }}>Today</PickerButton>}
          </div>
        </>
      )}
    </Popover>
  )
}

/** A time of day in 15 minute steps, HH:mm. */
export function TimeField({
  value, onChange, from = '05:00', to = '20:00', step = 15, className, ...rest
}: {
  value: string
  onChange: (time: string) => void
  from?: string
  to?: string
  step?: number
  className?: string
  'aria-label'?: string
  disabled?: boolean
}) {
  const times: string[] = []
  for (let m = toMinutes(from); m <= toMinutes(to); m += step) times.push(fromMinutes(m))
  if (value && !times.includes(value)) times.push(value)
  times.sort()
  return (
    <Popover
      label={rest['aria-label'] ?? 'Pick a time'}
      className={className}
      trigger={({ open, toggle }) => (
        <button type="button" data-popover-trigger aria-haspopup="listbox" aria-expanded={open} aria-label={rest['aria-label'] ? `${rest['aria-label']}, ${value ? formatTime(value) : 'not set'}` : undefined} disabled={rest.disabled} onClick={toggle} className={triggerClass}>
          <span className={cn('tabular', !value && 'text-muted-foreground')}>{value ? formatTime(value) : 'Pick a time'}</span>
          <Clock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      {(close) => <OptionList options={times.map((t) => ({ value: t, label: formatTime(t) }))} value={value} onPick={(v) => { onChange(v); close() }} label={rest['aria-label'] ?? 'Times'} />}
    </Popover>
  )
}

interface Option { value: string; label: ReactNode; disabled?: boolean }

/** Reads `<option>` children, so a native select can be swapped for this without other changes. */
function optionsOf(children: ReactNode): Option[] {
  return Children.toArray(children)
    .filter((c): c is ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }> => isValidElement(c) && c.type === 'option')
    .map((c) => ({ value: String(c.props.value ?? c.props.children ?? ''), label: c.props.children, disabled: c.props.disabled }))
}

/** A themed dropdown list. Takes `<option>` children and calls `onChange` like a native select. */
export function Select({
  value: rawValue, onChange, children, className, disabled, ...rest
}: {
  value: string | number | undefined
  /** Called like a native select's change. Handlers only read target.value. */
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode
  className?: string
  disabled?: boolean
  'aria-label'?: string
  id?: string
}) {
  const value = String(rawValue ?? '')
  const options = optionsOf(children)
  const current = options.find((o) => o.value === value)
  // Width classes on the control size the whole field; its look always comes from the theme.
  return (
    <Popover
      label={rest['aria-label'] ?? 'Choose'}
      className={cn('w-full', className?.includes('w-auto') && 'w-auto', className?.match(/\bw-\S+/)?.[0], className?.match(/\bmin-w-\S+/)?.[0])}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          id={rest.id}
          data-popover-trigger
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={rest['aria-label'] ? `${rest['aria-label']}, ${typeof current?.label === 'string' ? current.label : value}` : undefined}
          disabled={disabled}
          onClick={toggle}
          className={cn(triggerClass, className?.includes('h-11') && 'h-11')}
        >
          <span className="truncate">{current?.label ?? 'Choose'}</span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    >
      {(close) => <OptionList options={options} value={value} onPick={(v) => { onChange({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>); close() }} label={rest['aria-label'] ?? 'Options'} />}
    </Popover>
  )
}

/** The list inside a select or time picker: arrow keys move, Enter picks, the chosen one is ticked. */
function OptionList({ options, value, onPick, label }: { options: Option[]; value: string; onPick: (value: string) => void; label: string }) {
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? ref.current?.querySelector<HTMLElement>('[role="option"]:not([aria-disabled="true"])')
    el?.focus()
    el?.scrollIntoView({ block: 'center' })
  }, [])
  const move = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? items[i + 1] : e.key === 'ArrowUp' ? items[i - 1] : e.key === 'Home' ? items[0] : e.key === 'End' ? items.at(-1) : undefined
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }
  return (
    <ul ref={ref} role="listbox" aria-label={label} onKeyDown={move} className="-m-1 max-h-72 overflow-y-auto">
      {options.map((o) => (
        <li
          key={o.value}
          role="option"
          tabIndex={-1}
          aria-selected={o.value === value}
          aria-disabled={o.disabled || undefined}
          onClick={() => !o.disabled && onPick(o.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !o.disabled && (e.preventDefault(), onPick(o.value))}
          className={cn(
            'flex min-h-touch cursor-pointer items-center justify-between gap-3 rounded-lg px-3 outline-none hover:bg-secondary focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring',
            o.value === value && 'font-semibold text-primary-strong',
            o.disabled && 'cursor-not-allowed opacity-40',
          )}
        >
          <span>{o.label}</span>
          {o.value === value && <Check className="size-4 shrink-0" aria-hidden="true" />}
        </li>
      ))}
    </ul>
  )
}
