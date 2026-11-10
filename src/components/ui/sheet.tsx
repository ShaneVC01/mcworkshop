import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A panel for quick actions without leaving the screen.
 * Slides up from the bottom on phone and sits on the right on larger screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'pb-safe relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-background shadow-card outline-none sm:max-h-none sm:rounded-none sm:border-l',
          wide ? 'sm:max-w-xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <h2 className="min-w-0 text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex size-touch shrink-0 items-center justify-center rounded-lg hover:bg-secondary">
            <X className="size-6" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap gap-2 border-t px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/** Shared field styles so forms look the same everywhere. */
export const fieldClass =
  'h-12 w-full rounded-lg border border-input bg-background px-3 text-base placeholder:text-muted-foreground disabled:opacity-50'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>}
    </label>
  )
}
