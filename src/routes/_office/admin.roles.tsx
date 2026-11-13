import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Lock, RotateCcw } from 'lucide-react'
import { ACTIONS, ROLES, type ActionInfo } from '@/auth/default-permissions'
import { can } from '@/auth/permissions'
import { getSession, ROLE_LABEL } from '@/auth/session'
import { PageHeader } from '@/components/shell/app-shell'
import { ActionError, DataView } from '@/components/states'
import { Button } from '@/components/ui/button'
import { resetRolePermissions, saveRolePermissions } from '@/data/actions'
import { useAction, useRolePermissions } from '@/data/hooks'
import { Section } from '@/features/admin/admin-bits'
import { cn } from '@/lib/utils'
import type { Action, Role, RolePermissions } from '@/types'

export const Route = createFileRoute('/_office/admin/roles')({
  beforeLoad: () => {
    if (!can(getSession()?.role, 'admin.users')) throw redirect({ to: '/admin' })
  },
  component: RolesPage,
})

const GROUPS: ActionInfo['group'][] = ['Planning', 'Jobs and quotes', 'Reports', 'Admin']

/** What each role is allowed to do. Administrators always keep everything, so nobody can lock themselves out. */
function RolesPage() {
  const permissions = useRolePermissions()
  const save = useAction(saveRolePermissions)
  const reset = useAction(resetRolePermissions)
  const [role, setRole] = useState<Role>('advisor')

  const toggle = (current: RolePermissions, who: Role, action: Action) => {
    const has = current[who].includes(action)
    void save.run(who, has ? current[who].filter((a) => a !== action) : [...current[who], action]).catch(() => undefined)
  }

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader title="Roles and access" subtitle="Choose what each role can do. Changes apply the next time someone opens a screen." />
      <div className="space-y-6 px-4 sm:px-6">
        <ActionError error={save.error ?? reset.error} />
        <DataView query={permissions}>
          {(current) => (
            <>
              {/* Wide screens: every role side by side. */}
              <Section title="All roles" className="hidden @3xl:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left">
                    <thead>
                      <tr className="border-b text-sm text-muted-foreground">
                        <th className="p-2 font-normal">Can</th>
                        {ROLES.map((r) => (
                          <th key={r} className="w-28 p-2 text-center font-normal">{ROLE_LABEL[r]}</th>
                        ))}
                      </tr>
                    </thead>
                    {GROUPS.map((group) => (
                      <tbody key={group}>
                        <tr>
                          <th colSpan={ROLES.length + 1} className="pt-4 pb-1 text-left font-display text-lg">{group}</th>
                        </tr>
                        {ACTIONS.filter((a) => a.group === group).map((a) => (
                          <tr key={a.action} className="border-b last:border-b-0">
                            <td className="p-2">
                              <div className="font-semibold">{a.label}</div>
                              <div className="text-sm text-muted-foreground">{a.hint}</div>
                            </td>
                            {ROLES.map((r) => (
                              <td key={r} className="p-2 text-center">
                                <Switch
                                  info={a}
                                  role={r}
                                  checked={r === 'admin' || (!a.adminOnly && current[r].includes(a.action))}
                                  onChange={() => toggle(current, r, a.action)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
              </Section>

              {/* Phone and tablet: one role at a time. */}
              <div className="space-y-4 @3xl:hidden">
                <div role="tablist" aria-label="Role" className="flex gap-2 overflow-x-auto pb-1">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={role === r}
                      onClick={() => setRole(r)}
                      className={cn(
                        'min-h-touch shrink-0 rounded-lg border-2 px-4 font-display tracking-wide',
                        role === r ? 'border-foreground bg-foreground text-background' : 'border-border',
                      )}
                    >
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
                <Section title={ROLE_LABEL[role]}>
                  {GROUPS.map((group) => (
                    <div key={group} className="mb-4 last:mb-0">
                      <h3 className="mb-1 text-lg">{group}</h3>
                      <ul className="divide-y">
                        {ACTIONS.filter((a) => a.group === group).map((a) => (
                          <li key={a.action} className="flex items-center gap-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{a.label}</div>
                              <div className="text-sm text-muted-foreground">{a.hint}</div>
                            </div>
                            <Switch
                              info={a}
                              role={role}
                              checked={role === 'admin' || (!a.adminOnly && current[role].includes(a.action))}
                              onChange={() => toggle(current, role, a.action)}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Section>
              </div>

              <Section
                title="Start again"
                hint="Put a role back to the permissions it started with. Administrators cannot be changed."
              >
                <div className="flex flex-wrap gap-2">
                  {ROLES.filter((r) => r !== 'admin').map((r) => (
                    <Button key={r} variant="outline" disabled={reset.isPending} onClick={() => void reset.run(r).catch(() => undefined)}>
                      <RotateCcw aria-hidden="true" />
                      Reset {ROLE_LABEL[r].toLowerCase()}
                    </Button>
                  ))}
                </div>
              </Section>
            </>
          )}
        </DataView>
      </div>
    </div>
  )
}

/** A switch that is always on and locked where the permission cannot be changed. */
function Switch({ info, role, checked, onChange }: { info: ActionInfo; role: Role; checked: boolean; onChange: () => void }) {
  const locked = role === 'admin' || info.adminOnly
  return (
    <label className="inline-flex min-h-touch min-w-touch items-center justify-center" title={locked ? 'Always on for administrators. Not available to other roles.' : undefined}>
      <span className="sr-only">
        {info.label} for {ROLE_LABEL[role]}
      </span>
      {locked ? (
        checked ? (
          <Lock className="size-5 text-primary-strong" aria-label="Always on" />
        ) : (
          <span aria-label="Not available" className="text-muted-foreground">None</span>
        )
      ) : (
        <input type="checkbox" checked={checked} onChange={onChange} className="size-6 accent-[var(--primary)]" />
      )}
    </label>
  )
}
