import { useState } from 'react'
import { Mail, MapPin, Pencil, Phone } from 'lucide-react'
import { Card } from '@/components/domain/job-bits'
import { SyncBadge } from '@/components/domain/sync-badge'
import { ActionError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass } from '@/components/ui/sheet'
import { updateCustomer } from '@/data/actions'
import { useAction } from '@/data/hooks'
import { formatDate } from '@/lib/format'
import type { Customer } from '@/types'

/** Quick view of the customer, with their contact details editable in place. */
export function CustomerCard({ customer, lastVisit, onChange }: { customer: Customer; lastVisit?: string; onChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ mobile: '', email: '', address: '', postcode: '' })
  const save = useAction(updateCustomer)
  const start = () => {
    setForm({ mobile: customer.mobile, email: customer.email ?? '', address: customer.address ?? '', postcode: customer.postcode ?? '' })
    save.reset()
    setEditing(true)
  }
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const submit = () =>
    void save
      .run(customer.id, {
        mobile: form.mobile.trim(), email: form.email.trim() || undefined, address: form.address.trim() || undefined, postcode: form.postcode.trim() || undefined,
      })
      .then(() => setEditing(false))
      .catch(() => undefined)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">Customer</p>
          <h2 className="truncate text-2xl">{customer.name}</h2>
          <SyncBadge status={customer.sync.status} />
        </div>
        {!editing && (
          <Button variant="ghost" onClick={start}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          <Field label="Mobile"><input className={fieldClass} value={form.mobile} onChange={set('mobile')} inputMode="tel" autoComplete="off" /></Field>
          <Field label="Email"><input className={fieldClass} value={form.email} onChange={set('email')} inputMode="email" autoComplete="off" /></Field>
          <Field label="Street address"><input className={fieldClass} value={form.address} onChange={set('address')} autoComplete="off" /></Field>
          <Field label="Postcode"><input className={fieldClass} value={form.postcode} onChange={set('postcode')} inputMode="numeric" autoComplete="off" /></Field>
          <ActionError error={save.error} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={save.isPending} onClick={submit}>{save.isPending ? 'Saving' : 'Save details'}</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <dl className="mt-3 space-y-2">
          <Line icon={Phone} label="Mobile">
            <a href={`tel:${customer.mobile.replace(/\s/g, '')}`} className="tabular font-semibold underline-offset-2 hover:underline">{customer.mobile}</a>
          </Line>
          <Line icon={Mail} label="Email">{customer.email ?? <Missing />}</Line>
          <Line icon={MapPin} label="Address">
            {customer.address || customer.postcode ? [customer.address, customer.postcode].filter(Boolean).join(', ') : <Missing />}
          </Line>
          <p className="pt-1 text-sm text-muted-foreground">{lastVisit ? `Last visit ${formatDate(lastVisit)}` : 'No visits yet'}</p>
        </dl>
      )}
      <button type="button" onClick={onChange} className="mt-2 min-h-touch font-semibold text-primary-strong underline">
        Book for someone else
      </button>
    </Card>
  )
}

function Line({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const Missing = () => <span className="text-muted-foreground">Not on file</span>
