import { cn } from '@/lib/utils'
import { statusTones, type StatusTone } from './status-tones'

/** Operational state. Colour is always paired with an icon and a label. */
export function StatusPill({ tone, label, className }: { tone: StatusTone; label?: string; className?: string }) {
  const t = statusTones[tone]
  const Icon = t.icon
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold whitespace-nowrap',
        tone === 'tentative' && 'hatched border border-dashed',
        className,
      )}
      style={{
        color: t.colour,
        backgroundColor: tone === 'tentative' ? undefined : `color-mix(in srgb, ${t.colour} 13%, transparent)`,
        borderColor: t.colour,
      }}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label ?? t.label}
    </span>
  )
}
