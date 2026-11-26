import { useState } from 'react'
import { useCan } from '@/auth/permissions'
import { markInvoiced, markPaid } from '@/data/actions'
import { useAction } from '@/data/hooks'
import type { CloseOutStep } from '@/lib/job-state'
import type { ScheduledJob } from '@/types'
import { VerifySheet } from './verify-sheet'

/**
 * The three close out steps, wherever they are offered (workshop board, Today, Bookings, the booking page):
 * the workshop controller checks the job, reception marks it invoiced when the invoice is raised and paid when
 * the customer pays at collection.
 */
export function useCloseOut() {
  const canVerify = useCan('job.verify')
  const canPay = useCan('job.payment')
  const invoiced = useAction(markInvoiced)
  const paid = useAction(markPaid)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [checking, setChecking] = useState<ScheduledJob | null>(null)

  const allowed = (step: CloseOutStep) => (step === 'verify' ? canVerify : canPay)
  const run = (step: CloseOutStep, s: ScheduledJob) => {
    if (step === 'verify') return setChecking(s)
    const action = step === 'invoiced' ? invoiced : paid
    invoiced.reset()
    paid.reset()
    setBusyId(s.job.id)
    void action.run(s.job.id).catch(() => undefined).finally(() => setBusyId(null))
  }
  const error = invoiced.error ?? paid.error
  const sheet = checking ? <VerifySheet s={checking} onClose={() => setChecking(null)} /> : null
  return { allowed, run, busyId, error, sheet }
}
