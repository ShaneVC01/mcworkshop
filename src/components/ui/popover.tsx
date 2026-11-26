import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The one pop up used by every picker (dates, times, lists), so they all look and behave the same:
 * a themed card under the control that closes on Escape or a tap outside, and returns focus to the control.
 */
export function Popover({
  trigger, children, label, align = 'start', className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; close: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  label: string
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const close = () => setOpen(false)

  // Back to the control when the pop up closes, however it closed.
  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.querySelector<HTMLElement>('[data-popover-trigger]')?.focus()
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o), close })}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border bg-card p-3 text-card-foreground shadow-card',
            // Phones: docked above the tab bar, full width, so it never runs off the screen.
            'max-sm:fixed max-sm:inset-x-4 max-sm:top-auto max-sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] max-sm:w-auto max-sm:translate-x-0',
            align === 'start' && 'left-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
            align === 'end' && 'right-0',
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
