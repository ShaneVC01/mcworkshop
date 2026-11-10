import { useSyncExternalStore, type ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { CircleAlert, Inbox, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Result, SyncState } from '@/types'

/** Loading: grey blocks in the shape of what is coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-secondary', className)} aria-hidden="true" />
}

export function LoadingState({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-4 sm:p-6">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  children,
  action,
}: {
  icon?: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 text-xl">{title}</h3>
      {children && <p className="mt-1 max-w-[45ch] text-muted-foreground">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <CircleAlert className="size-10 text-destructive" aria-hidden="true" />
      <h3 className="mt-3 text-xl">That did not load</h3>
      <p className="mt-1 max-w-[45ch] text-muted-foreground">
        {error?.message ?? 'Something went wrong.'} Nothing has been lost.
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  )
}

/** Inline error for a failed action, shown next to the button that caused it. */
export function ActionError({ error }: { error?: Error | null }) {
  if (!error) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {error.message}
    </p>
  )
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-status-approval px-4 py-2 text-sm font-semibold text-white">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      No connection. You can keep looking, and changes will save when it comes back.
    </div>
  )
}

/**
 * One place for the loading, error and empty states every screen needs.
 * Keeps showing the last data while a refresh is in flight.
 */
export function DataView<T>({
  query,
  children,
  loading,
  isEmpty,
  empty,
}: {
  query: UseQueryResult<Result<T>>
  children: (data: T, sync: SyncState) => ReactNode
  loading?: ReactNode
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
}) {
  if (query.data) {
    if (isEmpty?.(query.data.data) && empty) return <>{empty}</>
    return <>{children(query.data.data, query.data.sync)}</>
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  return <>{loading ?? <LoadingState />}</>
}
