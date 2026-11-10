import { createFileRoute, redirect } from '@tanstack/react-router'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { can } from '@/auth/permissions'
import { getSession } from '@/auth/session'
import { Card } from '@/components/domain/job-bits'
import { SyncBadge } from '@/components/domain/sync-badge'
import { PageHeader } from '@/components/shell/app-shell'
import { DataView, EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { resetDemo, retrySync, setErrorSimulation } from '@/data/actions'
import { NetSuiteTestCard } from '@/features/admin/netsuite-test'
import { useAction, useSyncLog } from '@/data/hooks'
import { formatDateTime } from '@/lib/format'

export const Route = createFileRoute('/_office/admin/integration')({
  beforeLoad: () => {
    if (!can(getSession()?.role, 'integration.view')) throw redirect({ to: '/today' })
  },
  component: IntegrationPage,
})

/** Administrator only. The one screen where NetSuite is named. */
function IntegrationPage() {
  const log = useSyncLog()
  const retry = useAction(retrySync)
  const simulate = useAction(setErrorSimulation)
  const reset = useAction(resetDemo)

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader title="Integration" subtitle="Test the live NetSuite connection, and see what the app would send and whether it got there." />
      <DataView query={log}>
        {({ entries, settings }) => {
          const failed = entries.filter((e) => e.status === 'failed').length
          const pending = entries.filter((e) => e.status === 'pending').length
          return (
            <div className="space-y-6 px-4 sm:px-6">
              <NetSuiteTestCard />
              <Card className="flex items-start gap-3 border-primary p-4">
                <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary-strong" aria-hidden="true" />
                <div>
                  <h2 className="text-xl">Dry run. The app's changes are not sent to NetSuite.</h2>
                  <p className="text-muted-foreground">
                    This prototype is not connected. Every change is recorded in the outbox below so the payloads can be
                    reviewed. Live writes stay off until they are approved one at a time.
                  </p>
                </div>
              </Card>

              <dl className="tabular grid grid-cols-3 gap-3">
                {[
                  { label: 'Queued', value: pending },
                  { label: 'Failed', value: failed },
                  { label: 'Recorded', value: entries.length },
                ].map((s) => (
                  <Card key={s.label} className="p-4">
                    <dt className="text-muted-foreground">{s.label}</dt>
                    <dd className="font-display text-4xl font-medium">{s.value}</dd>
                  </Card>
                ))}
              </dl>

              <Card className="space-y-3 p-4">
                <h2 className="text-xl">Demo controls</h2>
                <label className="flex min-h-touch items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.simulateErrors}
                    onChange={(e) => void simulate.run(e.target.checked)}
                    className="size-5 accent-[var(--primary)]"
                  />
                  Simulate a flaky connection (some loads and saves fail, then retry)
                </label>
                <Button variant="outline" disabled={reset.isPending} onClick={() => void reset.run()}>
                  <RefreshCw aria-hidden="true" />
                  Reset demo data
                </Button>
              </Card>

              <section>
                <h2 className="mb-3 text-xl">Outbox</h2>
                {entries.length === 0 ? (
                  <Card>
                    <EmptyState title="Nothing recorded yet">Make a booking or update a job and the change will be listed here.</EmptyState>
                  </Card>
                ) : (
                  <Card className="overflow-x-auto">
                    <table className="tabular w-full min-w-[42rem] text-left">
                      <thead>
                        <tr className="border-b text-sm text-muted-foreground">
                          <th className="p-3 font-normal">When</th>
                          <th className="p-3 font-normal">Change</th>
                          <th className="p-3 font-normal">Record</th>
                          <th className="p-3 font-normal">Tries</th>
                          <th className="p-3 font-normal">State</th>
                          <th className="p-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id} className="border-b align-top last:border-b-0">
                            <td className="p-3 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                            <td className="p-3">
                              <div className="font-semibold">{e.label}</div>
                              <div className="text-sm text-muted-foreground">{e.action}, {e.mode}</div>
                              {e.error && <div className="text-sm text-destructive">{e.error}</div>}
                            </td>
                            <td className="p-3">{e.entityId}</td>
                            <td className="p-3">{e.attempts}</td>
                            <td className="p-3"><SyncBadge status={e.status} /></td>
                            <td className="p-3">
                              {e.status === 'failed' && (
                                <Button variant="outline" onClick={() => void retry.run(e.id)}>Retry now</Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </section>
            </div>
          )
        }}
      </DataView>
    </div>
  )
}
