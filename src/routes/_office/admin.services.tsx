import { useMemo, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { can, useCan } from '@/auth/permissions'
import { getSession } from '@/auth/session'
import { Card } from '@/components/domain/job-bits'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass, Sheet } from '@/components/ui/sheet'
import { removeServiceProfile, removeServiceTemplate, saveServiceProfile, saveServiceTemplate } from '@/data/actions'
import {
  useAction, useServiceActuals, useServiceProfiles, useServiceTemplates, useVehicleLibrary, useWorkshopSettings,
} from '@/data/hooks'
import { ActiveBadge, ChecklistEditor, NumberInput, PartsEditor, ReadOnlyNote } from '@/features/admin/admin-bits'
import { FUEL_LABEL, SKILL_OPTIONS, VEHICLE_CLASS_LABEL } from '@/features/admin/labels'
import { formatHours, formatMoney, gstOf } from '@/lib/format'
import { describeModel } from '@/lib/service-profiles'
import { cn } from '@/lib/utils'
import type {
  BayType, ChecklistTemplateItem, FuelType, ServiceActual, ServiceCategory, ServiceProfile, ServiceTemplate, Skill,
  TemplatePart, VehicleClass, VehicleModel,
} from '@/types'

export const Route = createFileRoute('/_office/admin/services')({
  beforeLoad: () => {
    if (!can(getSession()?.role, 'admin.catalogue.view')) throw redirect({ to: '/admin' })
  },
  component: ServicesPage,
})

const CATEGORIES: ServiceCategory[] = [
  'Scheduled service', 'Repair', 'Inspection', 'Accessory fitment', 'Suspension', 'Electrical', 'Diagnostic', 'Other',
]
const BAY_TYPES: { value: BayType; label: string }[] = [
  { value: 'hoist', label: 'Hoist' }, { value: 'flat', label: 'Flat floor' }, { value: 'alignment', label: 'Alignment' },
]

const partsCents = (parts: TemplatePart[]) => parts.reduce((s, p) => s + p.qty * p.unitCents, 0)
/** Labour plus parts, excluding GST, then shown including GST. */
const priceIncGst = (hours: number, parts: TemplatePart[], rate: number) => {
  const ex = Math.round(hours * rate) + partsCents(parts)
  return ex + gstOf(ex)
}

/** Where a template applies, in words. */
function scopeOf(t: ServiceTemplate) {
  const bits = [t.vehicleClass && VEHICLE_CLASS_LABEL[t.vehicleClass], t.fuel && FUEL_LABEL[t.fuel]].filter(Boolean)
  return bits.length ? bits.join(', ') : 'Any vehicle'
}

type Tab = 'profiles' | 'templates'

function ServicesPage() {
  const [tab, setTab] = useState<Tab>('profiles')
  const canEdit = useCan('admin.catalogue.edit')
  const [profileSheet, setProfileSheet] = useState<{ profile?: ServiceProfile; templateId?: string } | null>(null)
  const [templateSheet, setTemplateSheet] = useState<ServiceTemplate | 'new' | null>(null)

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader
        title="Services"
        subtitle="What each service needs: hours, parts and checks. A vehicle profile wins over the generic template."
        actions={
          canEdit &&
          (tab === 'profiles' ? (
            <Button onClick={() => setProfileSheet({})}>
              <Plus aria-hidden="true" />
              Add vehicle profile
            </Button>
          ) : (
            <Button onClick={() => setTemplateSheet('new')}>
              <Plus aria-hidden="true" />
              Add generic template
            </Button>
          ))
        }
      />
      <div className="space-y-4 px-4 sm:px-6">
        {!canEdit && <ReadOnlyNote>You can look at services but not change them. Ask an administrator.</ReadOnlyNote>}
        <div role="tablist" aria-label="Service catalogue" className="flex gap-2">
          {(
            [['profiles', 'Vehicle profiles'], ['templates', 'Generic templates']] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'min-h-touch rounded-lg border-2 px-4 font-display tracking-wide',
                tab === value ? 'border-foreground bg-foreground text-background' : 'border-border',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'profiles' ? (
          <ProfilesTab canEdit={canEdit} onOpen={(profile, templateId) => setProfileSheet({ profile, templateId })} />
        ) : (
          <TemplatesTab onOpen={setTemplateSheet} />
        )}
      </div>
      {profileSheet && (
        <ProfileSheet key={profileSheet.profile?.id ?? 'new'} {...profileSheet} canEdit={canEdit} onClose={() => setProfileSheet(null)} />
      )}
      {templateSheet && (
        <TemplateSheet
          key={templateSheet === 'new' ? 'new' : templateSheet.id}
          template={templateSheet === 'new' ? null : templateSheet}
          canEdit={canEdit}
          onClose={() => setTemplateSheet(null)}
        />
      )}
    </div>
  )
}

// ---- Vehicle profiles ---------------------------------------------------------------------------

function ProfilesTab({ canEdit, onOpen }: { canEdit: boolean; onOpen: (profile: ServiceProfile | undefined, templateId: string) => void }) {
  const templates = useServiceTemplates()
  const profiles = useServiceProfiles()
  const library = useVehicleLibrary()
  const actuals = useServiceActuals()
  const settings = useWorkshopSettings()

  return (
    <DataView query={templates}>
      {(allTemplates) => {
        const list = profiles.data?.data ?? []
        const models = library.data?.data ?? []
        const rate = settings.data?.data.labourRateCents ?? 0
        const stats = actuals.data?.data ?? {}
        // Only scheduled services are worth profiling by default, but any template with a profile is shown.
        const shown = allTemplates.filter((t) => t.active !== false && (t.category === 'Scheduled service' || list.some((p) => p.templateId === t.id)))
        if (shown.length === 0) return <EmptyState title="No services yet">Add a generic template first, then profile it for each vehicle.</EmptyState>
        return (
          <div className="space-y-4">
            <ReadOnlyNote>
              Where a vehicle has no profile for a service, bookings use the generic template instead. Add a profile once you know the real hours and parts for that vehicle.
            </ReadOnlyNote>
            {shown.map((t) => {
              const mine = list.filter((p) => p.templateId === t.id)
              const covered = new Set(mine.map((p) => p.modelId))
              const fits = (m: VehicleModel) => m.active && (!t.vehicleClass || t.vehicleClass === m.vehicleClass) && (!t.fuel || t.fuel === m.fuel)
              const generic = models.filter((m) => fits(m) && !covered.has(m.id)).length
              const typical = stats[`template:${t.id}`]
              return (
                <Card key={t.id} className="overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-secondary p-4">
                    <div className="min-w-0">
                      <h2 className="text-xl">{t.name}</h2>
                      <p className="tabular text-sm text-muted-foreground">
                        Generic: {formatHours(t.labourHours)}, {formatMoney(priceIncGst(t.labourHours, t.parts, rate))} inc GST
                        {typical ? `. Past jobs averaged ${formatHours(typical.averageHours)} (${typical.samples})` : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {mine.length} {mine.length === 1 ? 'profile' : 'profiles'}, {generic} {generic === 1 ? 'vehicle uses' : 'vehicles use'} the generic estimate
                      </p>
                    </div>
                    {canEdit && (
                      <Button variant="outline" onClick={() => onOpen(undefined, t.id)}>
                        <Plus aria-hidden="true" />
                        Add profile
                      </Button>
                    )}
                  </div>
                  {mine.length === 0 ? (
                    <p className="p-4 text-muted-foreground">No vehicle has its own profile for this service yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {mine.map((p) => {
                        const model = models.find((m) => m.id === p.modelId)
                        const actual = stats[`profile:${p.id}`]
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => onOpen(p, t.id)}
                              className="flex min-h-16 w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-left hover:bg-secondary/60 sm:flex-nowrap"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-lg font-semibold">{model ? describeModel(model) : 'Vehicle removed'}</span>
                                <span className="block truncate text-sm text-muted-foreground">{p.parts.length} {p.parts.length === 1 ? 'part' : 'parts'}{p.notes ? `, ${p.notes}` : ''}</span>
                              </span>
                              <HoursCompare estimate={p.labourHours} generic={t.labourHours} actual={actual} />
                              <span className="tabular w-24 shrink-0 text-right font-semibold">{formatMoney(priceIncGst(p.labourHours, p.parts, rate))}</span>
                              <ActiveBadge active={p.active} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </Card>
              )
            })}
          </div>
        )
      }}
    </DataView>
  )
}

/** The profile's hours next to the generic and what past jobs really took. */
function HoursCompare({ estimate, generic, actual }: { estimate: number; generic: number; actual?: ServiceActual }) {
  const diff = estimate - generic
  return (
    <span className="tabular w-44 shrink-0 text-sm">
      <span className="block font-semibold">{formatHours(estimate)}</span>
      <span className="block text-muted-foreground">
        {diff === 0 ? 'Same as generic' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} h on generic`}
        {actual ? `, ${formatHours(actual.averageHours)} in practice` : ''}
      </span>
    </span>
  )
}

function ProfileSheet({
  profile, templateId, canEdit, onClose,
}: { profile?: ServiceProfile; templateId?: string; canEdit: boolean; onClose: () => void }) {
  const templates = useServiceTemplates()
  const library = useVehicleLibrary()
  const settings = useWorkshopSettings()
  const actuals = useServiceActuals()
  const save = useAction(saveServiceProfile)
  const remove = useAction(removeServiceProfile)

  const allTemplates = templates.data?.data ?? []
  const models = (library.data?.data ?? []).filter((m) => m.active || m.id === profile?.modelId)
  const rate = settings.data?.data.labourRateCents ?? 0

  const [tplId, setTplId] = useState(profile?.templateId ?? templateId ?? '')
  const [modelId, setModelId] = useState(profile?.modelId ?? '')
  const base = allTemplates.find((t) => t.id === tplId)
  const [hours, setHours] = useState<number | undefined>(profile?.labourHours)
  const [parts, setParts] = useState<TemplatePart[] | undefined>(profile?.parts)
  const [ownChecklist, setOwnChecklist] = useState<ChecklistTemplateItem[] | undefined>(profile?.checklist)
  const [notes, setNotes] = useState(profile?.notes ?? '')
  const [active, setActive] = useState(profile?.active ?? true)

  // Start from the generic template until the profile has its own values.
  const effectiveHours = hours ?? base?.labourHours ?? 0
  const effectiveParts = parts ?? base?.parts ?? []
  const typical = actuals.data?.data[profile ? `profile:${profile.id}` : `template:${tplId}`]

  const submit = () =>
    void save
      .run({ id: profile?.id, templateId: tplId, modelId, labourHours: effectiveHours, parts: effectiveParts, checklist: ownChecklist, notes, active })
      .then(onClose)
      .catch(() => undefined)

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={profile ? 'Vehicle profile' : 'Add vehicle profile'}
      footer={
        <>
          {canEdit && <Button disabled={save.isPending || !tplId || !modelId} onClick={submit}>{profile ? 'Save changes' : 'Add profile'}</Button>}
          <Button variant="outline" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</Button>
          {canEdit && profile && (
            <Button variant="ghost" className="ml-auto" disabled={remove.isPending} onClick={() => void remove.run(profile.id).then(onClose).catch(() => undefined)}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
        </>
      }
    >
      <form className="space-y-4 @container" onSubmit={(e) => { e.preventDefault(); if (canEdit) submit() }}>
        <div className="grid gap-3 @sm:grid-cols-2">
          <Field label="Service">
            <select value={tplId} disabled={Boolean(profile) || !canEdit} onChange={(e) => { setTplId(e.target.value); setHours(undefined); setParts(undefined) }} className={fieldClass}>
              <option value="">Choose a service</option>
              {allTemplates.filter((t) => t.active !== false || t.id === tplId).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Vehicle">
            <select value={modelId} disabled={Boolean(profile) || !canEdit} onChange={(e) => setModelId(e.target.value)} className={fieldClass}>
              <option value="">Choose a vehicle</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{describeModel(m)}</option>
              ))}
            </select>
          </Field>
        </div>

        {base && (
          <>
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
              {profile || hours !== undefined || parts !== undefined ? 'Generic for comparison' : 'Starting from the generic template'}: {formatHours(base.labourHours)}, {base.parts.length} {base.parts.length === 1 ? 'part' : 'parts'}.
              {typical ? ` Past jobs on this ${profile ? 'vehicle' : 'service'} averaged ${formatHours(typical.averageHours)} across ${typical.samples}.` : ''}
            </p>
            <Field label="Labour hours for this vehicle">
              <NumberInput label="Labour hours" value={effectiveHours} disabled={!canEdit} onChange={(v) => setHours(v ?? 0)} />
            </Field>
            <div>
              <span className="mb-1 block font-semibold">Parts for this vehicle</span>
              <PartsEditor parts={effectiveParts} disabled={!canEdit} onChange={setParts} />
            </div>
            <div>
              <span className="mb-1 block font-semibold">Checklist</span>
              {ownChecklist ? (
                <>
                  <ChecklistEditor items={ownChecklist} disabled={!canEdit} onChange={setOwnChecklist} />
                  {canEdit && <Button variant="ghost" className="mt-2" onClick={() => setOwnChecklist(undefined)}>Use the generic checklist again</Button>}
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-muted-foreground">Uses the generic checklist ({base.checklist.length} items).</p>
                  {canEdit && (
                    <Button variant="outline" onClick={() => setOwnChecklist(base.checklist.map((c) => ({ ...c })))}>
                      <Copy aria-hidden="true" />
                      Customise for this vehicle
                    </Button>
                  )}
                </div>
              )}
            </div>
            <Field label="Notes for the technician" hint="Shown with the booking. For example a part that is easy to miss.">
              <textarea value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(fieldClass, 'h-auto py-2')} />
            </Field>
            <label className="flex min-h-touch items-center gap-3">
              <input type="checkbox" checked={active} disabled={!canEdit} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--primary)]" />
              Active. Inactive profiles are ignored and bookings fall back to the generic template.
            </label>
            <p className="tabular font-semibold">Estimate: {formatMoney(priceIncGst(effectiveHours, effectiveParts, rate))} including GST</p>
          </>
        )}
        <ActionError error={save.error ?? remove.error} />
      </form>
    </Sheet>
  )
}

// ---- Generic templates ---------------------------------------------------------------------------

function TemplatesTab({ onOpen }: { onOpen: (t: ServiceTemplate) => void }) {
  const templates = useServiceTemplates()
  const profiles = useServiceProfiles()
  const settings = useWorkshopSettings()
  const rate = settings.data?.data.labourRateCents ?? 0
  const used = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of profiles.data?.data ?? []) counts.set(p.templateId, (counts.get(p.templateId) ?? 0) + 1)
    return counts
  }, [profiles.data])

  return (
    <DataView query={templates} isEmpty={(list) => list.length === 0} empty={<EmptyState title="No generic templates">Add one to give every vehicle a starting point.</EmptyState>}>
      {(list) => (
        <div className="space-y-4">
          <ReadOnlyNote>
            A generic template is the starting point for any vehicle without its own profile, for example a 30,000 km service for a diesel 4WD.
            Scope one to a type of vehicle and a fuel when the work differs.
          </ReadOnlyNote>
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {[...list].sort((a, b) => a.category.localeCompare(b.category) || (a.intervalKm ?? 0) - (b.intervalKm ?? 0) || a.name.localeCompare(b.name)).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(t)}
                    className="flex min-h-16 w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-left hover:bg-secondary/60 sm:flex-nowrap"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold">{t.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {t.category}, {scopeOf(t)}{t.intervalKm ? `, every ${t.intervalKm.toLocaleString('en-AU')} km` : ''}
                      </span>
                    </span>
                    <span className="tabular w-28 shrink-0 text-sm">
                      <span className="block font-semibold">{formatHours(t.labourHours)}</span>
                      <span className="block text-muted-foreground">{t.parts.length} {t.parts.length === 1 ? 'part' : 'parts'}</span>
                    </span>
                    <span className="tabular w-24 shrink-0 text-right font-semibold">{formatMoney(priceIncGst(t.labourHours, t.parts, rate))}</span>
                    <span className="w-24 shrink-0 text-sm text-muted-foreground">{used.get(t.id) ? `${used.get(t.id)} profiles` : 'No profiles'}</span>
                    <ActiveBadge active={t.active !== false} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </DataView>
  )
}

function TemplateSheet({ template, canEdit, onClose }: { template: ServiceTemplate | null; canEdit: boolean; onClose: () => void }) {
  const save = useAction(saveServiceTemplate)
  const remove = useAction(removeServiceTemplate)
  const [name, setName] = useState(template?.name ?? '')
  const [category, setCategory] = useState<ServiceCategory>(template?.category ?? 'Scheduled service')
  const [intervalKm, setIntervalKm] = useState<number | undefined>(template?.intervalKm)
  const [vehicleClass, setVehicleClass] = useState<VehicleClass | ''>(template?.vehicleClass ?? '')
  const [fuel, setFuel] = useState<FuelType | ''>(template?.fuel ?? '')
  const [hours, setHours] = useState<number | undefined>(template?.labourHours ?? 2)
  const [skill, setSkill] = useState<Skill>(template?.skill ?? 'servicing')
  const [bayType, setBayType] = useState<BayType>(template?.bayType ?? 'hoist')
  const [parts, setParts] = useState<TemplatePart[]>(template?.parts ?? [])
  const [checklist, setChecklist] = useState<ChecklistTemplateItem[]>(template?.checklist ?? [])
  const [notes, setNotes] = useState(template?.notes ?? '')
  const [active, setActive] = useState(template?.active !== false)

  const submit = () =>
    void save
      .run({
        id: template?.id, name, category, division: template?.division ?? 'servicing', intervalKm,
        vehicleClass: vehicleClass || undefined, fuel: fuel || undefined, labourHours: hours ?? 0, skill, bayType,
        parts, checklist, notes: notes.trim() || undefined, active,
      })
      .then(onClose)
      .catch(() => undefined)

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={template ? template.name : 'Add generic template'}
      footer={
        <>
          {canEdit && <Button disabled={save.isPending} onClick={submit}>{template ? 'Save changes' : 'Add template'}</Button>}
          <Button variant="outline" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</Button>
          {canEdit && template && (
            <Button variant="ghost" className="ml-auto" disabled={remove.isPending} onClick={() => void remove.run(template.id).then(onClose).catch(() => undefined)}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
        </>
      }
    >
      <form className="space-y-4 @container" onSubmit={(e) => { e.preventDefault(); if (canEdit) submit() }}>
        <Field label="Name" hint="As it appears when booking, for example 30,000 km service, 4WD diesel.">
          <input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </Field>
        <div className="grid gap-3 @sm:grid-cols-2">
          <Field label="Category">
            <select value={category} disabled={!canEdit} onChange={(e) => setCategory(e.target.value as ServiceCategory)} className={fieldClass}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Interval, km" hint="For scheduled services only.">
            <NumberInput label="Interval in kilometres" digits={0} value={intervalKm} disabled={!canEdit} onChange={setIntervalKm} placeholder="30000" />
          </Field>
          <Field label="For this type of vehicle" hint="Leave on Any to apply to every vehicle.">
            <select value={vehicleClass} disabled={!canEdit} onChange={(e) => setVehicleClass(e.target.value as VehicleClass | '')} className={fieldClass}>
              <option value="">Any vehicle</option>
              {(Object.keys(VEHICLE_CLASS_LABEL) as VehicleClass[]).map((c) => <option key={c} value={c}>{VEHICLE_CLASS_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="For this fuel">
            <select value={fuel} disabled={!canEdit} onChange={(e) => setFuel(e.target.value as FuelType | '')} className={fieldClass}>
              <option value="">Any fuel</option>
              {(Object.keys(FUEL_LABEL) as FuelType[]).map((f) => <option key={f} value={f}>{FUEL_LABEL[f]}</option>)}
            </select>
          </Field>
          <Field label="Labour hours">
            <NumberInput label="Labour hours" value={hours} disabled={!canEdit} onChange={setHours} />
          </Field>
          <Field label="Skill needed">
            <select value={skill} disabled={!canEdit} onChange={(e) => setSkill(e.target.value as Skill)} className={fieldClass}>
              {SKILL_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Bay needed">
            <select value={bayType} disabled={!canEdit} onChange={(e) => setBayType(e.target.value as BayType)} className={fieldClass}>
              {BAY_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <span className="mb-1 block font-semibold">Parts</span>
          <PartsEditor parts={parts} disabled={!canEdit} onChange={setParts} />
        </div>
        <div>
          <span className="mb-1 block font-semibold">Checklist</span>
          <ChecklistEditor items={checklist} disabled={!canEdit} onChange={setChecklist} />
        </div>
        <Field label="Notes" hint="Why this template exists or what to watch for.">
          <textarea value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(fieldClass, 'h-auto py-2')} />
        </Field>
        <label className="flex min-h-touch items-center gap-3">
          <input type="checkbox" checked={active} disabled={!canEdit} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--primary)]" />
          Active. Inactive templates are not offered on new bookings.
        </label>
        <ActionError error={save.error ?? remove.error} />
      </form>
    </Sheet>
  )
}
