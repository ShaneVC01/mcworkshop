import { cn } from '@/lib/utils'

export const APP_NAME = 'Connect'

/**
 * McCormacks logo with the Connect product name beneath it. Sits on black chrome only.
 * `full` uses the McCormacks 4WD logo, `compact` uses the 4WD mark for the tablet rail.
 */
export function BrandMark({ variant = 'full', className }: { variant?: 'full' | 'compact'; className?: string }) {
  const compact = variant === 'compact'
  return (
    <div
      role="img"
      aria-label={`McCormacks 4WD ${APP_NAME}`}
      className={cn('flex flex-col gap-1 leading-none', compact ? 'items-center' : 'items-start', className)}
    >
      <img
        src={compact ? '/logo-4wd.png' : '/logo-mccormacks.png'}
        alt=""
        className={compact ? 'h-auto w-16' : 'h-[1.6em] w-auto'}
      />
      <span
        aria-hidden="true"
        className={cn(
          'font-display font-medium text-chrome-foreground-active uppercase',
          compact ? 'pl-[0.2em] text-[11px] tracking-[0.2em]' : 'text-[0.7em] tracking-[0.35em]',
        )}
      >
        {APP_NAME}
      </span>
    </div>
  )
}
