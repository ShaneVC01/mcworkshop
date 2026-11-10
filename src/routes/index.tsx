import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSession, homeFor } from '@/auth/session'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const user = getSession()
    throw redirect({ to: user ? homeFor(user.role) : '/login' })
  },
})
