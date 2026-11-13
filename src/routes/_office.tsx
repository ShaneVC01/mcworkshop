import { createFileRoute, redirect } from '@tanstack/react-router'
import { CalendarDays, Car, ChartColumn, ClipboardList, Columns3, NotebookPen, Settings } from 'lucide-react'
import { useCanAdmin } from '@/auth/permissions'
import { getSession } from '@/auth/session'
import { AppShell, type NavItem } from '@/components/shell/app-shell'

export const Route = createFileRoute('/_office')({
  beforeLoad: () => {
    const user = getSession()
    if (!user) throw redirect({ to: '/login' })
    if (user.role === 'mechanic') throw redirect({ to: '/mechanic' })
  },
  component: OfficeLayout,
})

const nav: NavItem[] = [
  { to: '/today', label: 'Today', icon: ClipboardList },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/bookings', label: 'Bookings', icon: NotebookPen },
  { to: '/vehicles', label: 'Vehicles', icon: Car },
  { to: '/workshop', label: 'Workshop', icon: Columns3 },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
]

function OfficeLayout() {
  const showAdmin = useCanAdmin()
  const items: NavItem[] = showAdmin ? [...nav, { to: '/admin', label: 'Admin', icon: Settings }] : nav
  return <AppShell nav={items} />
}
