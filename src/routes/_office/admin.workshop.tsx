import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { CalendarOff, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { can, useCan } from '@/auth/permissions'
import { getSession } from '@/auth/session'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass, Sheet } from '@/components/ui/sheet'
import {
  addClosedDay, applyHoursToTechnicians, removeBay, removeClosedDay, saveBay, saveWorkshopSettings,
} from '@/data/actions'
import { useAction, useBays, useTechnicians, useWorkshopSettings } from '@/data/hooks'
import { MoneyInput, NumberInput, ReadOnlyNote, Section } from '@/features/admin/admin-bits'
import { dayKey, formatDate, formatDayLong, formatHours, formatMoney, gstOf } from '@/lib/format'
import type { Bay, BayType, WorkshopSettings } from '@/types'

export const Route = createFileRoute('/_office/admin/workshop')({
  beforeLoad: () => {
    if (!can(getSession()?.role, 'admin.workshop')) throw redirect({ to: '/admin' })
  },
  component: WorkshopSettingsPage,
})

const BAY_TYPE_LABEL: Record<BayType, string> = { hoist: 'Hoist', flat: 'Flat floor', alignment: 'Alignment' }

function WorkshopSettingsPage() {
  const settings = useWorkshopSettings()
  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader title="Workshop" subtitle="Default hours, the daily target, the labour rate, bays and closed days." />
      <div className="space-y-6 px-4 sm:px-6">
        <DataView query={settings}>
          {(s) => (
            <>
              <HoursAndTargets settings={s} />
              <BaySection />
              <ClosedDays settings={s} />
            </>
          )}
        </DataView>
      </div>
    </div>
  )
}

function HoursAndTargets({ settings }: { settings: WorkshopSettings }) {
  const save = useAction(saveWorkshopSettings)
  const apply = useAction(applyHoursToTechnicians)
  const [form, setForm] = useState({ ...settings })
  const [applied, setApplied] = useState<number | null>(null)
  const dirty = JSON.stringify({ ...form, closedDays: 0 }) !== JSON.stringify({ ...settings, closedDays: 0 })
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  const shiftHours = Math.max(0, (toMin(form.closeTime) - toMin(form.openTime) - form.breakMinutes) / 60)
  const technicians = useTechnicians()
  const working = technicians.data?.data.filter((t) => t.active).length ?? 0

  return (
    <Section
      title="Hours and targets"
      hint="New technicians start with these hours. The daily target is the billable time each technician should book. The workshop target on Today adds them up."
    >
      <form
        className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          const { openTime, closeTime, breakMinutes, dailyTargetHours, labourRateCents } = form
          void save.run({ openTime, closeTime, breakMinutes, dailyTargetHours, labourRateCents }).catch(() => undefined)
        }}
      >
        <Field label="Opens">
          <input type="time" value={form.openTime} onChange={(e) => setForm({ ...form, openTime: e.target.value })} className={fieldClass} />
        </Field>
        <Field label="Closes">
          <input type="time" value={form.closeTime} onChange={(e) => setForm({ ...form, closeTime: e.target.value })} className={fieldClass} />
        </Field>
        <Field label="Break, minutes" hint={`${formatHours(shiftHours)} of working time a day.`}>
          <NumberInput label="Break in minutes" digits={0} value={form.breakMinutes} onChange={(v) => setForm({ ...form, breakMinutes: v ?? 0 })} />
        </Field>
        <Field label="Daily target, hours per technician" hint={`About ${formatHours(form.dailyTargetHours * working)} a day across ${working} technicians.`}>
          <NumberInput label="Daily target in hours" value={form.dailyTargetHours} onChange={(v) => setForm({ ...form, dailyTargetHours: v ?? 0 })} />
        </Field>
        <Field label="Labour rate per hour, excluding GST" hint={`${formatMoney(form.labourRateCents + gstOf(form.labourRateCents))} including GST. Used for new bookings and quotes. Jobs already booked keep their rate.`}>
          <MoneyInput label="Labour rate per hour excluding GST" cents={form.labourRateCents} onChange={(labourRateCents) => setForm({ ...form, labourRateCents })} />
        </Field>
        <div className="flex flex-wrap items-end gap-2 @lg:col-span-2 @3xl:col-span-1">
          <Button type="submit" disabled={!dirty || save.isPending}>Save</Button>
          <Button type="button" variant="outline" disabled={save.isPending || apply.isPending} onClick={() => void apply.run().then((r) => setApplied(r.data)).catch(() => undefined)}>
            <Users aria-hidden="true" />
            Use for all technicians
          </Button>
        </div>
        <div className="space-y-2 @lg:col-span-2 @3xl:col-span-3 empty:hidden">
          <ActionError error={save.error ?? apply.error} />
          {applied !== null && !apply.error && (
            <p role="status" className="text-sm font-semibold text-primary-strong">
              Hours copied to {applied} active technicians. Leave and training are unchanged.
            </p>
          )}
        </div>
      </form>
    </Section>
  )
}

function BaySection() {
  const bays = useBays()
  const canEdit = useCan('admin.workshop')
  const [editing, setEditing] = useState<Bay | 'new' | null>(null)
  const remove = useAction(removeBay)

  return (
    <Section
      title="Bays"
      hint="The hoists and floor spaces jobs are booked into. A job needs a bay of the right type."
      actions={
        canEdit && (
          <Button variant="outline" onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" />
            Add bay
          </Button>
        )
      }
    >
      <ActionError error={remove.error} />
      <DataView query={bays}>
        {(list) => (
          <ul className="divide-y">
            {list.map((b) => (
              <li key={b.id} className="flex min-h-16 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold">{b.name}</div>
                  <div className="text-sm text-muted-foreground">{BAY_TYPE_LABEL[b.type]}</div>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit ${b.name}`} onClick={() => setEditing(b)}>
                  <Pencil aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remove ${b.name}`} disabled={remove.isPending} onClick={() => void remove.run(b.id).catch(() => undefined)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DataView>
      {editing && <BaySheet key={editing === 'new' ? 'new' : editing.id} bay={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Section>
  )
}

function BaySheet({ bay, onClose }: { bay: Bay | null; onClose: () => void }) {
  const save = useAction(saveBay)
  const [name, setName] = useState(bay?.name ?? '')
  const [type, setType] = useState<BayType>(bay?.type ?? 'hoist')
  const submit = () => void save.run({ id: bay?.id, name, type }).then(onClose).catch(() => undefined)
  return (
    <Sheet
      open
      onClose={onClose}
      title={bay ? `Edit ${bay.name}` : 'Add bay'}
      footer={
        <>
          <Button disabled={save.isPending} onClick={submit}>{bay ? 'Save changes' : 'Add bay'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bay 5" className={fieldClass} />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as BayType)} className={fieldClass}>
            {(Object.keys(BAY_TYPE_LABEL) as BayType[]).map((t) => (
              <option key={t} value={t}>{BAY_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </Field>
        <ActionError error={save.error} />
      </form>
    </Sheet>
  )
}

function ClosedDays({ settings }: { settings: WorkshopSettings }) {
  const add = useAction(addClosedDay)
  const remove = useAction(removeClosedDay)
  const [day, setDay] = useState('')
  const [reason, setReason] = useState('')
  const [warning, setWarning] = useState('')
  const upcoming = settings.closedDays.filter((d) => d.day >= dayKey())
  const past = settings.closedDays.length - upcoming.length

  return (
    <Section
      title="Closed days"
      hint="Public holidays and shutdowns. Weekends are always closed. Technicians show no capacity on a closed day and bookings skip it."
    >
      <form
        className="mb-4 grid gap-3 @lg:grid-cols-[12rem_minmax(0,1fr)_auto] @lg:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          void add
            .run(day, reason)
            .then((r) => {
              setDay('')
              setReason('')
              setWarning(r.data.bookingsOnDay ? `${r.data.bookingsOnDay} booking${r.data.bookingsOnDay === 1 ? ' is' : 's are'} already on ${formatDate(r.data.closed.day)}. Move them from the calendar.` : '')
            })
            .catch(() => undefined)
        }}
      >
        <Field label="Date">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Christmas Day" className={fieldClass} />
        </Field>
        <Button type="submit" disabled={!day || add.isPending}>
          <CalendarOff aria-hidden="true" />
          Close the workshop
        </Button>
      </form>
      <ActionError error={add.error ?? remove.error} />
      {warning && <ReadOnlyNote>{warning}</ReadOnlyNote>}
      {upcoming.length === 0 ? (
        <p className="text-muted-foreground">No closed days coming up.{past > 0 ? ` ${past} earlier ${past === 1 ? 'day is' : 'days are'} kept.` : ''}</p>
      ) : (
        <ul className="divide-y">
          {upcoming.map((d) => (
            <li key={d.day} className="flex min-h-14 items-center gap-3 py-1">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{formatDayLong(d.day)}</div>
                <div className="text-sm text-muted-foreground">{d.reason}</div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Open the workshop again on ${formatDate(d.day)}`} disabled={remove.isPending} onClick={() => void remove.run(d.day).catch(() => undefined)}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
