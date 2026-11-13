import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { canAdmin, useCan } from '@/auth/permissions'
import { getSession } from '@/auth/session'
import type { LinkProps } from '@tanstack/react-router'
import type { Action } from '@/types'

export const Route = createFileRoute('/_office/admin')({
  beforeLoad: () => {
    if (!canAdmin(getSession()?.role)) throw redirect({ to: '/today' })
  },
  component: AdminLayout,
})

const tabs: { to: LinkProps['to']; label: string; needs: Action }[] = [
  { to: '/admin/users', label: 'People', needs: 'admin.users' },
  { to: '/admin/roles', label: 'Roles and access', needs: 'admin.users' },
  { to: '/admin/workshop', label: 'Workshop', needs: 'admin.workshop' },
  { to: '/admin/vehicles', label: 'Vehicle library', needs: 'admin.catalogue.view' },
  { to: '/admin/services', label: 'Services', needs: 'admin.catalogue.view' },
  { to: '/admin/integration', label: 'Integration', needs: 'integration.view' },
]

/** One tab per admin area. A role only sees the tabs it is allowed to open. */
function AdminLayout() {
  return (
    <div>
      <nav aria-label="Admin" className="sticky top-0 z-10 border-b bg-background">
        <ul className="flex gap-1 overflow-x-auto px-3 sm:px-5">
          {tabs.map((t) => (
            <AdminTab key={t.to} {...t} />
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}

function AdminTab({ to, label, needs }: (typeof tabs)[number]) {
  const allowed = useCan(needs)
  if (!allowed) return null
  return (
    <li className="shrink-0">
      <Link
        to={to}
        className="flex min-h-touch items-center border-b-4 border-transparent px-3 font-display text-lg tracking-wide text-muted-foreground hover:text-foreground"
        activeProps={{ className: 'border-primary text-foreground', 'aria-current': 'page' }}
      >
        {label}
      </Link>
    </li>
  )
}
