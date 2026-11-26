import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, Clock, PackageCheck, PackageSearch, ShoppingCart, Truck } from 'lucide-react'
import { useCan } from '@/auth/permissions'
import { Card } from '@/components/domain/job-bits'
import { RegoPlate } from '@/components/domain/rego-plate'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, EmptyState, Skeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { fieldClass, Sheet } from '@/components/ui/sheet'
import { markPartOrdered, receivePart, setPartEta } from '@/data/actions'
import { useAction, usePartOrders } from '@/data/hooks'
import { dayKey, formatDayShort, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PartOrderRow, PartRisk } from '@/types'
import { DateField } from '@/components/ui/fields'

export const Route = createFileRoute('/_office/parts')({ component: PartsPage })

/** Each risk with an icon and words, so colour is never the only signal. */
const RISK: Record<PartRisk, { label: string; icon: typeof Clock; colour: string }> = {
  overdue: { label: 'Order overdue', icon: CircleAlert, colour: 'var(--status-blocked)' },
  'order-now': { label: 'Order now', icon: ShoppingCart, colour: 'var(--status-approval)' },
  late: { label: 'Arrives after booking', icon: CircleAlert, colour: 'var(--status-blocked)' },
  'no-eta': { label: 'Ordered, no ETA', icon: Clock, colour: 'var(--status-parts)' },
  'on-track': { label: 'On track', icon: Truck, colour: 'var(--status-confirmed)' },
  upcoming: { label: 'Order later', icon: Clock, colour: 'var(--status-unavailable)' },
  received: { label: 'Received', icon: PackageCheck, colour: 'var(--status-complete)' },
}

const GROUPS: { key: string; title: string; hint: string; risks: PartRisk[] }[] = [
  { key: 'act', title: 'Order now', hint: 'Past or close to the order by day. Order these today.', risks: ['overdue', 'order-now'] },
  { key: 'risk', title: 'Bookings at risk', hint: 'The part is due after the booking, or the supplier has not given a date. Tell the customer and move the booking if needed.', risks: ['late', 'no-eta'] },
  { key: 'track', title: 'On the way', hint: 'Ordered and due before the booking.', risks: ['on-track'] },
  { key: 'later', title: 'Order later', hint: 'Not needed yet. Each shows the last day to order.', risks: ['upcoming'] },
  { key: 'done', title: 'Received this week', hint: 'Checked in and ready for the job.', risks: ['received'] },
]

/**
 * Specialist parts ordered in for bookings: what to order and by when, what is on the way and what puts a
 * booking at risk. Normal service parts kept in stock never show here.
 */
function PartsPage() {
  const orders = usePartOrders()
  const canManage = useCan('parts.manage')
  const [ordering, setOrdering] = useState<PartOrderRow | null>(null)
  const [eta, setEta] = useState<PartOrderRow | null>(null)
  const [receiving, setReceiving] = useState<PartOrderRow | null>(null)

  return (
    <div className="pb-8">
      <PageHeader title="Parts" subtitle="Specialist parts ordered in for bookings. Service parts kept in stock are not listed." />
      <div className="space-y-6 px-4 sm:px-6">
        <DataView
          query={orders}
          loading={<Skeleton className="h-96" />}
          isEmpty={(rows) => rows.length === 0}
          empty={<Card><EmptyState title="No parts to order">Bookings with specialist parts show here, with the day to order by.</EmptyState></Card>}
        >
          {(rows) => (
            <>
              <ul className="flex flex-wrap gap-2" aria-label="Summary">
                {GROUPS.slice(0, 3).map((g) => {
                  const n = rows.filter((r) => g.risks.includes(r.risk)).length
                  return (
                    <li key={g.key}>
                      <a href={`#${g.key}`} className={cn('inline-flex min-h-touch items-center gap-2 rounded-full border-2 px-4 font-semibold', n && g.key !== 'track' ? 'border-destructive text-destructive' : 'border-border')}>
                        <span className="tabular font-display text-xl">{n}</span> {g.title}
                      </a>
                    </li>
                  )
                })}
              </ul>
              {GROUPS.map((g) => {
                const list = rows.filter((r) => g.risks.includes(r.risk))
                if (!list.length) return null
                return (
                  <section key={g.key} id={g.key} aria-labelledby={`${g.key}-title`} className="scroll-mt-4 space-y-2">
                    <h2 id={`${g.key}-title`} className="text-2xl">{g.title}</h2>
                    <p className="text-muted-foreground">{g.hint}</p>
                    <ul className="space-y-2">
                      {list.map((r) => (
                        <li key={r.order.id}>
                          <PartCard row={r} canManage={canManage} onOrder={() => setOrdering(r)} onEta={() => setEta(r)} onReceive={() => setReceiving(r)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </>
          )}
        </DataView>
      </div>
      {ordering && <OrderSheet row={ordering} onClose={() => setOrdering(null)} />}
      {eta && <EtaSheet row={eta} onClose={() => setEta(null)} />}
      {receiving && <ReceiveSheet row={receiving} onClose={() => setReceiving(null)} />}
    </div>
  )
}

function PartCard({ row, canManage, onOrder, onEta, onReceive }: { row: PartOrderRow; canManage: boolean; onOrder: () => void; onEta: () => void; onReceive: () => void }) {
  const { order, risk, vehicle, customer, booking } = row
  const tone = RISK[risk]
  const today = dayKey()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3 shadow-card" style={{ borderLeft: `6px solid ${tone.colour}` }}>
      <RegoPlate registration={vehicle.registration} state={vehicle.registrationState} size="sm" />
      <div className="min-w-56 flex-1">
        <p className="font-semibold">{order.qty > 1 ? `${order.qty} x ` : ''}{order.name}</p>
        <p className="tabular text-sm text-muted-foreground">
          {order.code}. {customer.name}, booked {formatDayShort(order.neededBy)} at {formatTime(booking.startAt)}.
        </p>
        <p className="tabular text-sm">
          {order.status === 'to-order' && (
            <>Order by <strong>{order.orderBy === today ? 'today' : formatDayShort(order.orderBy)}</strong> ({order.leadTimeDays} working day lead time).</>
          )}
          {order.status === 'ordered' && (
            <>From {order.supplier}. {order.eta ? <>Due <strong>{formatDayShort(order.eta)}</strong>.</> : 'No ETA yet.'}</>
          )}
          {order.status === 'received' && order.receivedAt && <>Checked in {formatDayShort(dayKey(order.receivedAt))}.</>}
          {order.wrongPartAt && order.status === 'to-order' && <span className="text-destructive"> Wrong part came in. {order.note}</span>}
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: `color-mix(in oklab, ${tone.colour} 14%, transparent)`, color: tone.colour }}>
        <tone.icon className="size-4" aria-hidden="true" />
        {tone.label}
      </span>
      <div className="flex flex-wrap gap-2">
        <Link to="/bookings/$id" params={{ id: booking.id }} className="inline-flex min-h-touch items-center rounded-lg border px-3 font-semibold hover:bg-secondary">
          Booking
        </Link>
        {canManage && order.status === 'to-order' && <Button onClick={onOrder}>Mark ordered</Button>}
        {canManage && order.status === 'ordered' && (
          <>
            <Button variant="outline" onClick={onEta}>{order.eta ? 'Change ETA' : 'Add ETA'}</Button>
            <Button onClick={onReceive}>Check in</Button>
          </>
        )}
      </div>
    </div>
  )
}

function OrderSheet({ row, onClose }: { row: PartOrderRow; onClose: () => void }) {
  const [supplier, setSupplier] = useState(row.order.supplier ?? '')
  const [eta, setEta] = useState('')
  const save = useAction(markPartOrdered)
  const late = eta && eta > row.order.neededBy
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Order ${row.order.code}`}
      footer={
        <Button size="lg" disabled={save.isPending} onClick={() => void save.run(row.order.id, { supplier, eta }).then(onClose).catch(() => undefined)}>
          {save.isPending ? 'Saving' : 'Mark ordered'}
        </Button>
      }
    >
      <div className="space-y-4">
        <p>{row.order.name}, needed for {row.vehicle.registration} on {formatDayShort(row.order.neededBy)}.</p>
        <label className="block space-y-1">
          <span className="font-semibold">Ordered from</span>
          <input className={fieldClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="For example Toyota parts, ARB or Bendix" />
        </label>
        <label className="block space-y-1">
          <span className="font-semibold">Due in (optional)</span>
          <DateField aria-label="Due in" value={eta} min={dayKey()} onChange={setEta} />
        </label>
        {late && <LateWarning neededBy={row.order.neededBy} />}
        <ActionError error={save.error} />
      </div>
    </Sheet>
  )
}

function EtaSheet({ row, onClose }: { row: PartOrderRow; onClose: () => void }) {
  const [eta, setEta] = useState(row.order.eta ?? '')
  const save = useAction(setPartEta)
  return (
    <Sheet
      open
      onClose={onClose}
      title={`ETA for ${row.order.code}`}
      footer={
        <Button size="lg" disabled={save.isPending || !eta} onClick={() => void save.run(row.order.id, eta).then(onClose).catch(() => undefined)}>
          Save ETA
        </Button>
      }
    >
      <div className="space-y-4">
        <p>{row.order.name} from {row.order.supplier}, needed {formatDayShort(row.order.neededBy)}.</p>
        <label className="block space-y-1">
          <span className="font-semibold">Due in</span>
          <DateField aria-label="Due in" value={eta} min={dayKey()} onChange={setEta} />
        </label>
        {eta > row.order.neededBy && <LateWarning neededBy={row.order.neededBy} />}
        <ActionError error={save.error} />
      </div>
    </Sheet>
  )
}

function ReceiveSheet({ row, onClose }: { row: PartOrderRow; onClose: () => void }) {
  const [note, setNote] = useState('')
  const save = useAction(receivePart)
  const run = (correct: boolean) => void save.run(row.order.id, correct, note).then(onClose).catch(() => undefined)
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Check in ${row.order.code}`}
      footer={
        <>
          <Button variant="outline" size="lg" disabled={save.isPending} onClick={() => run(false)}>Wrong part</Button>
          <Button size="lg" disabled={save.isPending} onClick={() => run(true)}>
            <CircleCheck aria-hidden="true" />
            Correct part received
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>Check the part number on the box matches <strong>{row.order.code}</strong> before checking it in.</p>
        <label className="block space-y-1">
          <span className="font-semibold">Note (optional)</span>
          <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, wrong size delivered" />
        </label>
        <ActionError error={save.error} />
      </div>
    </Sheet>
  )
}

function LateWarning({ neededBy }: { neededBy: string }) {
  return (
    <p className="flex gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-3 font-semibold">
      <PackageSearch className="size-5 shrink-0 text-destructive" aria-hidden="true" />
      That is after the booking on {formatDayShort(neededBy)}. Call the customer to move the booking.
    </p>
  )
}
