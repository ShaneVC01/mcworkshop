import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { homeFor, ROLE_LABEL, setSession } from '@/auth/session'
import { DataView } from '@/components/states'
import { useStaff } from '@/data/hooks'
import type { Role, StaffUser } from '@/types'

export const Route = createFileRoute('/login')({ component: LoginPage })

const order: Role[] = ['advisor', 'controller', 'mechanic', 'manager', 'admin']

/** Mock sign in: choose who you are. Replaced by Supabase Auth in a later phase. */
function LoginPage() {
  const staff = useStaff()
  const navigate = useNavigate()
  const signIn = (user: StaffUser) => {
    setSession(user)
    void navigate({ to: homeFor(user.role) })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-chrome">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 text-center">
        <img src="/logo-mccormacks.png" alt="McCormacks 4WD" className="mx-auto h-10 w-auto" />
        <h1 className="mt-6 text-3xl text-white">Who is working today?</h1>
        <p className="mt-1 text-chrome-foreground">Choose your name to open the workshop.</p>
      </header>
      <main className="flex-1 rounded-t-3xl bg-background px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl">
          <DataView query={staff}>
            {(people) => (
              <div className="space-y-6">
                {order.map((role) => {
                  const group = people.filter((p) => p.role === role && p.active !== false)
                  if (!group.length) return null
                  return (
                    <section key={role}>
                      <h2 className="mb-2 text-lg text-muted-foreground">{ROLE_LABEL[role]}</h2>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {group.map((person) => (
                          <li key={person.id}>
                            <button
                              type="button"
                              onClick={() => signIn(person)}
                              className="flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left shadow-card hover:border-primary active:border-primary"
                            >
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground font-display font-semibold text-background">
                                {person.name
                                  .split(' ')
                                  .map((p) => p[0])
                                  .join('')
                                  .slice(0, 2)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-lg font-semibold">{person.name}</span>
                              <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
                <p className="text-sm text-muted-foreground">
                  Prototype sign in with demo staff. No passwords and no real customer data.
                </p>
              </div>
            )}
          </DataView>
        </div>
      </main>
    </div>
  )
}
