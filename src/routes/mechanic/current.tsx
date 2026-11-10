import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
import { useSession } from '@/auth/session'
import { DataView, EmptyState } from '@/components/states'
import { useMyDay } from '@/data/hooks'
import { workingToday } from '@/lib/format'

export const Route = createFileRoute('/mechanic/current')({ component: CurrentJobPage })

/** Jumps straight to the job the technician has on the go. */
function CurrentJobPage() {
  const user = useSession()
  const myDay = useMyDay(user?.technicianId, workingToday())
  return (
    <DataView query={myDay}>
      {(jobs) => {
        const current = jobs.find((s) => s.job.status === 'IN_PROGRESS')
        if (current) return <Navigate to="/mechanic/jobs/$id" params={{ id: current.job.id }} replace />
        return (
          <EmptyState
            icon={Wrench}
            title="No job on the go"
            action={
              <Link to="/mechanic" className="inline-flex min-h-touch-lg items-center rounded-lg bg-primary px-7 font-display text-lg font-semibold tracking-[0.06em] text-primary-foreground uppercase">
                Go to my day
              </Link>
            }
          >
            Start a job from your day and it will open here.
          </EmptyState>
        )
      }}
    </DataView>
  )
}
