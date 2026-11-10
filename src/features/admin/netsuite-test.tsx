import { useState } from 'react'
import { CircleCheck, PlugZap, Users } from 'lucide-react'
import { Card } from '@/components/domain/job-bits'
import { ActionError, EmptyState, useOnline } from '@/components/states'
import { Button } from '@/components/ui/button'
import { useAction } from '@/data/hooks'
import { edgeConfigured, EdgeError, testNetSuiteCustomers, type CustomersTest } from '@/data/integration'
import { formatTime, nowIso } from '@/lib/format'

/**
 * Admin only: lists customers live from NetSuite through the customers-list Edge Function.
 * Read only. Results stay on screen and are not saved anywhere.
 */
export function NetSuiteTestCard() {
  const test = useAction(testNetSuiteCustomers)
  const online = useOnline()
  const configured = edgeConfigured()
  const [result, setResult] = useState<(CustomersTest & { at: string }) | null>(null)

  const run = async () => {
    try {
      const { data } = await test.run(25)
      setResult({ ...data, at: nowIso() })
    } catch {
      setResult(null)
    }
  }

  const error = test.error
  const correlationId = error instanceof EdgeError ? error.correlationId : undefined

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <PlugZap className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-xl">NetSuite connection test</h2>
            <p className="max-w-[60ch] text-muted-foreground">
              Lists the 25 most recently created active customers, live from NetSuite through the customers-list Edge
              Function. Read only. Nothing is changed in NetSuite or saved here.
            </p>
          </div>
        </div>
        <Button onClick={() => void run()} disabled={!configured || !online || test.isPending}>
          <Users aria-hidden="true" />
          {test.isPending ? 'Asking NetSuite' : 'List 25 customers'}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {!configured && (
          <p className="rounded-lg bg-secondary p-3 font-medium">
            Not set up on this device. Add VITE_SUPABASE_URL and VITE_EDGE_API_KEY to .env.local and restart the dev
            server.
          </p>
        )}
        {configured && !online && <p className="rounded-lg bg-secondary p-3 font-medium">No connection. The test needs the internet.</p>}

        {error && (
          <div className="space-y-1">
            <ActionError error={error} />
            {correlationId && <p className="text-sm text-muted-foreground">Reference for the function logs: {correlationId}</p>}
          </div>
        )}

        {test.isPending && !result && (
          <div className="space-y-2" role="status" aria-label="Loading customers">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary" />
            ))}
          </div>
        )}

        {result && !error && (
          <>
            <p className="tabular flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-primary-strong">
              <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
              Connected. {result.customers.length} customers in {(result.meta.durationMs / 1000).toFixed(1)} s, at{' '}
              {formatTime(result.at)}.
            </p>
            <p className="tabular text-sm text-muted-foreground">
              NetSuite requests: {result.meta.netsuiteRequests}
              {result.meta.hasMore && ', more customers available'}. Reference: {result.meta.correlationId}
            </p>

            {result.customers.length === 0 ? (
              <EmptyState icon={Users} title="No customers returned">
                The connection works but NetSuite returned no active customers.
              </EmptyState>
            ) : (
              <>
                {/* Phone: cards */}
                <ul className="space-y-2 sm:hidden">
                  {result.customers.map((c) => (
                    <li key={c.id} className="rounded-lg border p-3">
                      <div className="font-semibold">{c.name}</div>
                      <div className="tabular text-sm text-muted-foreground">
                        {c.number}, {c.kind === 'person' ? 'person' : 'company'}
                      </div>
                      {c.email && <div className="truncate text-sm">{c.email}</div>}
                      {(c.mobile ?? c.phone) && <div className="tabular text-sm">{c.mobile ?? c.phone}</div>}
                    </li>
                  ))}
                </ul>
                {/* Tablet and desktop: table */}
                <div className="hidden overflow-x-auto rounded-lg border sm:block">
                  <table className="tabular w-full min-w-[40rem] text-left">
                    <thead>
                      <tr className="border-b bg-secondary text-sm text-muted-foreground">
                        <th className="p-2.5 font-normal">Customer</th>
                        <th className="p-2.5 font-normal">Number</th>
                        <th className="p-2.5 font-normal">Email</th>
                        <th className="p-2.5 font-normal">Phone</th>
                        <th className="p-2.5 font-normal">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.customers.map((c) => (
                        <tr key={c.id} className="border-b align-top last:border-b-0">
                          <td className="p-2.5">
                            <div className="font-semibold">{c.name}</div>
                            <div className="text-sm text-muted-foreground">{c.kind === 'person' ? 'Person' : 'Company'}</div>
                          </td>
                          <td className="p-2.5">{c.number}</td>
                          <td className="max-w-56 truncate p-2.5">{c.email ?? '-'}</td>
                          <td className="p-2.5 whitespace-nowrap">{c.mobile ?? c.phone ?? '-'}</td>
                          <td className="p-2.5 whitespace-nowrap">{c.createdAt ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
