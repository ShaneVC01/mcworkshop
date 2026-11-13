import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { UserPlus, Wrench } from 'lucide-react'
import { ROLES } from '@/auth/default-permissions'
import { can } from '@/auth/permissions'
import { getSession, ROLE_LABEL } from '@/auth/session'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView, EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, fieldClass, Sheet } from '@/components/ui/sheet'
import { saveStaffMember, type StaffInput } from '@/data/actions'
import { useAction, useStaff, useTechnicians, useWorkshopSettings } from '@/data/hooks'
import { ActiveBadge, Section } from '@/features/admin/admin-bits'
import { SKILL_OPTIONS } from '@/features/admin/labels'
import { formatHours } from '@/lib/format'
import type { Role, Skill, StaffUser, Technician, WorkshopSettings } from '@/types'

export const Route = createFileRoute('/_office/admin/users')({
  beforeLoad: () => {
    if (!can(getSession()?.role, 'admin.users')) throw redirect({ to: '/admin' })
  },
  component: UsersPage,
})

function UsersPage() {
  const staff = useStaff()
  const technicians = useTechnicians()
  const settings = useWorkshopSettings()
  const [editing, setEditing] = useState<StaffUser | 'new' | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader
        title="People"
        subtitle="Everyone who signs in. Set what they do and whether they are booked onto jobs."
        actions={
          <Button onClick={() => setEditing('new')}>
            <UserPlus aria-hidden="true" />
            Add person
          </Button>
        }
      />
      <div className="space-y-6 px-4 sm:px-6">
        <DataView query={staff} isEmpty={(list) => list.length === 0} empty={<EmptyState icon={UserPlus} title="No people yet">Add the first person to get started.</EmptyState>}>
          {(people) => {
            const techs = technicians.data?.data ?? []
            const visible = people.filter((p) => showInactive || p.active !== false)
            const inactive = people.filter((p) => p.active === false).length
            return (
              <Section
                title={`${people.length - inactive} active`}
                actions={
                  inactive > 0 && (
                    <label className="flex min-h-touch items-center gap-2">
                      <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-5 accent-[var(--primary)]" />
                      Show {inactive} inactive
                    </label>
                  )
                }
              >
                <ul className="divide-y">
                  {ROLES.flatMap((role) => visible.filter((p) => p.role === role)).map((p) => {
                    const tech = techs.find((t) => t.id === p.technicianId)
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          className="flex min-h-16 w-full flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left hover:bg-secondary/60 sm:flex-nowrap"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground font-display font-semibold text-background">
                            {p.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-lg font-semibold">{p.name}</span>
                            <span className="block truncate text-sm text-muted-foreground">{p.title || ROLE_LABEL[p.role]}</span>
                          </span>
                          <span className="hidden w-44 shrink-0 @2xl:block">{ROLE_LABEL[p.role]}</span>
                          <span className="hidden w-48 shrink-0 text-sm text-muted-foreground @2xl:block">
                            {tech ? (
                              <span className="inline-flex items-center gap-1">
                                <Wrench className="size-4" aria-hidden="true" />
                                {tech.shiftStart} to {tech.shiftEnd}
                              </span>
                            ) : (
                              'Not booked onto jobs'
                            )}
                          </span>
                          <ActiveBadge active={p.active !== false} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Section>
            )
          }}
        </DataView>
        <p className="text-sm text-muted-foreground">
          Prototype sign in. Later each person signs in with their own account and the role set here decides what they see.
        </p>
      </div>
      {editing && settings.data && (
        <PersonSheet
          key={editing === 'new' ? 'new' : editing.id}
          person={editing === 'new' ? null : editing}
          technician={editing === 'new' ? undefined : technicians.data?.data.find((t) => t.id === editing.technicianId)}
          defaults={settings.data.data}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function PersonSheet({
  person,
  technician,
  defaults,
  onClose,
}: {
  person: StaffUser | null
  technician: Technician | undefined
  defaults: WorkshopSettings
  onClose: () => void
}) {
  const save = useAction(saveStaffMember)
  const [name, setName] = useState(person?.name ?? '')
  const [title, setTitle] = useState(person?.title ?? '')
  const [role, setRole] = useState<Role>(person?.role ?? 'advisor')
  const [active, setActive] = useState(person?.active !== false)
  const [booked, setBooked] = useState(Boolean(technician?.active))
  const [skills, setSkills] = useState<Skill[]>(technician?.skills ?? [])
  const [shiftStart, setShiftStart] = useState(technician?.shiftStart ?? defaults.openTime)
  const [shiftEnd, setShiftEnd] = useState(technician?.shiftEnd ?? defaults.closeTime)
  const [breakMinutes, setBreakMinutes] = useState(String(technician?.breakMinutes ?? defaults.breakMinutes))

  // Technicians are always booked onto jobs.
  const isTechnician = role === 'mechanic' || booked

  const submit = () => {
    const input: StaffInput = {
      id: person?.id, name, title, role, active,
      technician: isTechnician ? { skills, shiftStart, shiftEnd, breakMinutes: Number(breakMinutes) } : null,
    }
    void save.run(input).then(onClose).catch(() => undefined)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={person ? person.name : 'Add person'}
      wide
      footer={
        <>
          <Button disabled={save.isPending} onClick={submit}>{person ? 'Save changes' : 'Add person'}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={fieldClass} />
        </Field>
        <Field label="Job title" hint="As staff know it, for example Service advisor or Fitter.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Role" hint="Decides what they can see and do. Change what each role can do under Roles and access.">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={fieldClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-touch items-center gap-3">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-[var(--primary)]" />
          Active. Inactive people cannot sign in and are not offered for jobs.
        </label>

        <fieldset className="space-y-4 rounded-xl border p-4">
          <legend className="px-1 font-display text-lg">Booked onto jobs</legend>
          <label className="flex min-h-touch items-center gap-3">
            <input
              type="checkbox"
              checked={isTechnician}
              disabled={role === 'mechanic'}
              onChange={(e) => setBooked(e.target.checked)}
              className="size-5 accent-[var(--primary)]"
            />
            {role === 'mechanic' ? 'Technicians are always booked onto jobs' : 'Also works on jobs as a technician'}
          </label>
          {isTechnician && (
            <>
              <div>
                <span className="mb-1 block font-semibold">Skills</span>
                <div className="flex flex-wrap gap-2">
                  {SKILL_OPTIONS.map((s) => {
                    const on = skills.includes(s.value)
                    return (
                      <label
                        key={s.value}
                        className="flex min-h-touch cursor-pointer items-center gap-2 rounded-lg border px-3 has-[:checked]:border-primary has-[:checked]:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setSkills(on ? skills.filter((x) => x !== s.value) : [...skills, s.value])}
                          className="size-5 accent-[var(--primary)]"
                        />
                        {s.label}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Starts">
                  <input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} className={fieldClass} />
                </Field>
                <Field label="Finishes">
                  <input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} className={fieldClass} />
                </Field>
                <Field label="Break, min">
                  <input inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} className={fieldClass} />
                </Field>
              </div>
              <p className="text-sm text-muted-foreground">
                Workshop default is {defaults.openTime} to {defaults.closeTime} with a {defaults.breakMinutes} minute break, about{' '}
                {formatHours((toMin(defaults.closeTime) - toMin(defaults.openTime) - defaults.breakMinutes) / 60)} a day.
              </p>
            </>
          )}
        </fieldset>
        <ActionError error={save.error} />
      </form>
    </Sheet>
  )
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
