import { createFileRoute, redirect } from '@tanstack/react-router'
import { can } from '@/auth/permissions'
import { getSession } from '@/auth/session'

/** The Admin button lands on the first area the signed in role may open. */
export const Route = createFileRoute('/_office/admin/')({
  beforeLoad: () => {
    const role = getSession()?.role
    if (can(role, 'admin.users')) throw redirect({ to: '/admin/users' })
    if (can(role, 'admin.workshop')) throw redirect({ to: '/admin/workshop' })
    if (can(role, 'admin.catalogue.view')) throw redirect({ to: '/admin/services' })
    if (can(role, 'integration.view')) throw redirect({ to: '/admin/integration' })
    throw redirect({ to: '/today' })
  },
})
