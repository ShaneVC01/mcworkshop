import { createFileRoute } from '@tanstack/react-router'
import { CapacityBar, Card } from '@/components/domain/job-bits'
import { PageHeader } from '@/components/shell/app-shell'
import { DataView, Skeleton } from '@/components/states'
import { useUtilisationReport } from '@/data/hooks'
import { formatDayShort, formatDuration, formatHours, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_office/reports')({ component: ReportsPage })

function ReportsPage() {
  const report = useUtilisationReport()
  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader title="Reports" subtitle="Booked hours against available hours, this working week." />
      <DataView query={report} loading={<div className="space-y-4 px-4 sm:px-6"><Skeleton className="h-28" /><Skeleton className="h-72" /></div>}>
        {(r) => {
          const available = r.days.reduce((s, d) => s + d.availableHours, 0)
          const booked = r.days.reduce((s, d) => s + d.confirmedHours, 0)
          const finished = r.completedOnTime + r.completedLate
          const stats = [
            { label: 'Booked this week', value: formatPercent(available ? booked / available : 0), note: `${formatHours(booked)} of ${formatHours(available)}` },
            { label: 'Finished on time', value: finished ? formatPercent(r.completedOnTime / finished) : 'No jobs yet', note: `${r.completedOnTime} of ${finished} jobs` },
            { label: 'Average approval wait', value: formatDuration(r.averageApprovalWaitMinutes), note: 'From quote sent to customer answer' },
          ]
          return (
            <div className="space-y-6 px-4 sm:px-6">
              <dl className="grid gap-3 @2xl:grid-cols-3">
                {stats.map((s) => (
                  <Card key={s.label} className="p-4">
                    <dt className="text-muted-foreground">{s.label}</dt>
                    <dd className="tabular font-display text-4xl font-medium">{s.value}</dd>
                    <dd className="tabular text-sm text-muted-foreground">{s.note}</dd>
                  </Card>
                ))}
              </dl>

              <section>
                <h2 className="mb-3 text-xl">By day</h2>
                <Card className="divide-y">
                  {r.days.map((d) => (
                    <div key={d.day} className="tabular grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 p-3">
                      <span className="font-display text-lg font-medium">{formatDayShort(d.day)}</span>
                      <CapacityBar capacity={d} className="h-4" />
                      <span className={cn('w-28 text-right font-semibold', d.freeHours < 2 ? 'text-status-blocked' : 'text-primary-strong')}>
                        {formatPercent(d.potentialUtilisation)}, {d.freeHours < 0 ? `${formatHours(-d.freeHours)} over` : `${formatHours(d.freeHours)} free`}
                      </span>
                    </div>
                  ))}
                </Card>
              </section>

              <section>
                <h2 className="mb-3 text-xl">By technician</h2>
                <Card className="overflow-x-auto">
                  <table className="tabular w-full min-w-[34rem] text-left">
                    <thead>
                      <tr className="border-b text-sm text-muted-foreground">
                        <th className="p-3 font-normal">Technician</th>
                        <th className="p-3 text-right font-normal">Available</th>
                        <th className="p-3 text-right font-normal">Booked</th>
                        <th className="p-3 text-right font-normal">Clocked</th>
                        <th className="p-3 text-right font-normal">Booked %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.technicians.map((t) => (
                        <tr key={t.technician.id} className="border-b last:border-b-0">
                          <th className="p-3 font-semibold">{t.technician.name}</th>
                          <td className="p-3 text-right">{formatHours(t.availableHours)}</td>
                          <td className="p-3 text-right">{formatHours(t.bookedHours)}</td>
                          <td className="p-3 text-right">{formatHours(t.clockedHours)}</td>
                          <td className={cn('p-3 text-right font-semibold', t.utilisation > 1 && 'text-status-blocked')}>{formatPercent(t.utilisation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </section>
            </div>
          )
        }}
      </DataView>
    </div>
  )
}
