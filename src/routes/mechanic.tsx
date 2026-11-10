import { createFileRoute, redirect } from '@tanstack/react-router'
import { CheckCheck, Sun, Wrench } from 'lucide-react'
import { getSession } from '@/auth/session'
import { AppShell, type NavItem } from '@/components/shell/app-shell'

const nav: NavItem[] = [
  { to: '/mechanic', label: 'My day', icon: Sun, exact: true },
  { to: '/mechanic/current', label: 'Current job', icon: Wrench },
  { to: '/mechanic/completed', label: 'Completed', icon: CheckCheck },
]

export const Route = createFileRoute('/mechanic')({
  beforeLoad: () => {
    const user = getSession()
    if (!user) throw redirect({ to: '/login' })
    if (!user.technicianId) throw redirect({ to: '/today' })
  },
  component: () => <AppShell nav={nav} showSearch={false} />,
})
