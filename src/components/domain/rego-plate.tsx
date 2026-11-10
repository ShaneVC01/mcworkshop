import { formatRego } from '@/lib/format'
import { cn } from '@/lib/utils'

export type RegoState = 'QLD' | 'NSW' | 'VIC' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT'

const stateColour: Record<RegoState, string> = {
  QLD: 'var(--plate-qld)',
  NSW: 'var(--plate-nsw)',
  VIC: 'var(--plate-vic)',
  SA: 'var(--plate-other)',
  WA: 'var(--plate-other)',
  TAS: 'var(--plate-other)',
  NT: 'var(--plate-other)',
  ACT: 'var(--plate-vic)',
}

const sizes = {
  sm: { plate: 'px-2 pt-1 pb-0.5 text-lg', state: 'text-[8px]' },
  md: { plate: 'px-3 pt-1.5 pb-1 text-2xl', state: 'text-[9px]' },
  lg: { plate: 'px-4 pt-2 pb-1.5 text-[2.5rem]', state: 'text-[11px]' },
}

/**
 * The registration plate is the primary vehicle identifier across the app.
 * It is drawn like a real plate so a mechanic can match it to the vehicle at a glance.
 */
export function RegoPlate({
  registration,
  state = 'QLD',
  size = 'md',
  className,
}: {
  registration: string
  state?: RegoState
  size?: keyof typeof sizes
  className?: string
}) {
  const s = sizes[size]
  return (
    <span
      role="img"
      aria-label={`Registration ${formatRego(registration)}, ${state}`}
      className={cn(
        'inline-flex flex-col items-center justify-center rounded-md border-2 bg-[var(--plate-bg)] font-display leading-none font-semibold tracking-[0.08em] whitespace-nowrap',
        s.plate,
        className,
      )}
      style={{ color: stateColour[state], borderColor: stateColour[state] }}
    >
      <span aria-hidden="true">{formatRego(registration)}</span>
      <span aria-hidden="true" className={cn('mt-1 font-sans font-semibold tracking-[0.18em]', s.state)}>
        {state}
      </span>
    </span>
  )
}
