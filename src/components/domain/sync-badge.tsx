import { CloudAlert, CloudCheck, CloudUpload } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SyncStatus = 'synced' | 'pending' | 'failed'

const map = {
  synced: { label: 'Saved', icon: CloudCheck, colour: 'var(--sync-synced)' },
  pending: { label: 'Saving', icon: CloudUpload, colour: 'var(--sync-pending)' },
  failed: { label: 'Not saved, retrying', icon: CloudAlert, colour: 'var(--sync-failed)' },
} as const

/** Shows whether a record has reached the back office system. Never names NetSuite to staff. */
export function SyncBadge({ status, className }: { status: SyncStatus; className?: string }) {
  const s = map[status]
  const Icon = s.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', className)} style={{ color: s.colour }}>
      <Icon className={cn('size-4', status === 'pending' && 'animate-pulse')} aria-hidden="true" />
      {s.label}
    </span>
  )
}
