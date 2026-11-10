import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Camera, Moon, Phone, Play, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RegoPlate } from '@/components/domain/rego-plate'
import { StatusPill } from '@/components/domain/status-pill'
import { statusTones, type StatusTone } from '@/components/domain/status-tones'
import { SyncBadge } from '@/components/domain/sync-badge'

export const Route = createFileRoute('/dev/tokens')({ component: TokensPage })

const swatches: { name: string; token: string; note: string }[] = [
  { name: 'Primary', token: '--primary', note: 'Main actions, active navigation' },
  { name: 'Primary strong', token: '--primary-strong', note: 'Green text and small labels' },
  { name: 'Chrome', token: '--chrome', note: 'Sidebar, rail, tab bar, top bar' },
  { name: 'Logo green', token: '--chrome-accent', note: 'On black only' },
  { name: 'Foreground', token: '--foreground', note: 'Text' },
  { name: 'Muted text', token: '--muted-foreground', note: 'Secondary text' },
  { name: 'Background', token: '--background', note: 'Page' },
  { name: 'Panel', token: '--secondary', note: 'Panels, table stripes' },
  { name: 'Accent', token: '--accent', note: 'Selected rows, free capacity' },
  { name: 'Border', token: '--border', note: 'Lines' },
  { name: 'Destructive', token: '--destructive', note: 'Errors, cancel' },
]

const tones = Object.keys(statusTones) as StatusTone[]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t py-8">
      <h2 className="mb-5 text-2xl">{title}</h2>
      {children}
    </section>
  )
}

function Swatch({ name, token, note }: { name: string; token: string; note: string }) {
  const [hex, setHex] = useState('')
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const read = () => {
      setHex(getComputedStyle(document.documentElement).getPropertyValue(token).trim())
      setDark(document.documentElement.classList.contains('dark'))
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [token])
  return (
    <div className="flex items-center gap-3" data-theme={dark ? 'dark' : 'light'}>
      <div className="size-14 shrink-0 rounded-lg border" style={{ background: `var(${token})` }} />
      <div className="min-w-0">
        <div className="font-semibold">{name}</div>
        <div className="tabular text-sm text-muted-foreground">
          {token} {hex}
        </div>
        <div className="text-sm text-muted-foreground">{note}</div>
      </div>
    </div>
  )
}

function TokensPage() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-10 bg-chrome text-chrome-foreground">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <img src="/logo-mccormacks.png" alt="McCormacks 4WD" className="h-8 w-auto" />
          <nav className="ml-6 hidden items-center gap-1 font-display tracking-wide sm:flex" aria-label="Sample navigation">
            <span className="rounded-md bg-chrome-raised px-3 py-2 text-chrome-foreground-active">
              <span className="border-b-2 border-chrome-accent pb-1">Today</span>
            </span>
            <span className="px-3 py-2">Calendar</span>
            <span className="px-3 py-2">Workshop</span>
          </nav>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className="ml-auto inline-flex min-h-touch items-center gap-2 rounded-lg px-3 font-display tracking-wide text-chrome-foreground-active"
          >
            {dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="py-8">
          <h1 className="text-4xl sm:text-5xl">Brand tokens for approval</h1>
          <p className="mt-3 max-w-[65ch] text-lg text-muted-foreground">
            Taken from mccormacks4wd.com.au: Oswald, black, white and one green. Everything on this page is
            built from the tokens in src/styles/tokens.css, so what you approve here is what the screens will use.
          </p>
        </div>

        <Section title="Colour">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {swatches.map((s) => (
              <Swatch key={s.token} {...s} />
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Oswald, for headings, navigation, buttons and plates</p>
              <p className="font-display text-5xl font-medium">Workshop planner</p>
              <p className="font-display text-3xl font-medium">120,000 km major service</p>
              <p className="font-display text-xl font-medium">Pre-trip inspection</p>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Inter, for body text, forms and figures</p>
              <p className="max-w-[60ch] text-lg">
                Customer reports a knocking from the left front when turning slowly. Check wheel bearing and
                lower control arm bushes.
              </p>
              <p className="max-w-[60ch]">
                Last visit 16/08/2026 at 142,834 km. Next service due at 150,000 km.
              </p>
              <p className="tabular text-2xl font-semibold">
                $1,240.00 <span className="text-base font-normal text-muted-foreground">inc GST of $112.73</span>
              </p>
              <p className="tabular text-muted-foreground">Booked 31.5 h of 42.0 h, 10.5 h free</p>
            </div>
          </div>
        </Section>

        <Section title="Registration plates">
          <p className="mb-5 max-w-[65ch] text-muted-foreground">
            The plate is how staff identify a vehicle, so it leads every card and header. Queensland plates are
            maroon. Interstate plates carry their own state colour.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <RegoPlate registration="923XYZ" size="lg" />
            <RegoPlate registration="117ABC" />
            <RegoPlate registration="762JKL" size="sm" />
            <RegoPlate registration="EKL42B" state="NSW" />
            <RegoPlate registration="1TR9QZ" state="VIC" />
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Confirm booking</Button>
            <Button variant="dark">Find next availability</Button>
            <Button variant="outline">
              <Phone aria-hidden="true" />
              Call customer
            </Button>
            <Button variant="ghost">Reschedule</Button>
            <Button variant="destructive">Cancel booking</Button>
            <Button disabled>Complete job</Button>
          </div>
          <p className="mt-6 mb-3 text-sm text-muted-foreground">Technician size, 56px tall</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">
              <Play aria-hidden="true" />
              Start job
            </Button>
            <Button size="lg" variant="outline">
              <Camera aria-hidden="true" />
              Take photo
            </Button>
          </div>
        </Section>

        <Section title="Job status">
          <p className="mb-5 max-w-[65ch] text-muted-foreground">
            Each status has its own colour, icon and label, so it never relies on colour alone. Confirmed is teal
            so it is not confused with the green action buttons.
          </p>
          <div className="flex flex-wrap gap-2">
            {tones.map((tone) => (
              <StatusPill key={tone} tone={tone} />
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-6">
            <SyncBadge status="synced" />
            <SyncBadge status="pending" />
            <SyncBadge status="failed" />
          </div>
        </Section>

        <Section title="In context">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <article className="rounded-xl bg-card p-5 shadow-card">
              <p className="mb-3 text-sm font-semibold text-muted-foreground">Technician, current job</p>
              <RegoPlate registration="923XYZ" size="lg" />
              <h3 className="mt-4 text-2xl">Toyota LandCruiser 79</h3>
              <p className="text-lg">120,000 km major service</p>
              <p className="tabular mt-1 text-muted-foreground">Estimated 3 h 30 min, due 3:30 pm</p>
              <Button size="lg" className="mt-5 w-full">
                <Play aria-hidden="true" />
                Continue job
              </Button>
            </article>

            <div className="rounded-xl bg-card p-5 shadow-card">
              <p className="mb-3 text-sm font-semibold text-muted-foreground">Planner, one technician row</p>
              <div className="mb-4">
                <div className="tabular mb-1.5 flex justify-between text-sm">
                  <span className="font-semibold">James, 6.0 h of 8.0 h booked</span>
                  <span className="text-primary-strong font-semibold">2.0 h free</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-secondary" role="img" aria-label="75 percent booked">
                  <div className="h-full w-3/4 rounded-full bg-foreground" />
                </div>
              </div>
              <div className="overflow-x-auto">
              <div className="min-w-[38rem]">
              <div className="grid grid-cols-8 gap-1.5 text-sm">
                <PlannerBlock span="col-span-3" tone="in-progress" rego="923XYZ" title="LC79 major service" />
                <div className="col-span-1 flex min-h-20 items-center justify-center rounded-lg border border-dashed border-primary bg-accent text-sm font-semibold text-accent-foreground">
                  Free
                </div>
                <PlannerBlock span="col-span-2" tone="parts" rego="117ABC" title="Hilux brakes" />
                <PlannerBlock span="col-span-2" tone="tentative" rego="818ABC" title="D-MAX diagnostic" />
              </div>
              <div className="tabular mt-1.5 grid grid-cols-8 text-xs text-muted-foreground">
                {['7 am', '8 am', '9 am', '10 am', '11 am', '12 pm', '1 pm', '2 pm'].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              </div>
              </div>
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}

function PlannerBlock({ span, tone, rego, title }: { span: string; tone: StatusTone; rego: string; title: string }) {
  const t = statusTones[tone]
  const Icon = t.icon
  return (
    <div
      className={`${span} min-h-20 min-w-0 rounded-lg border-l-4 p-2 ${tone === 'tentative' ? 'hatched' : ''}`}
      style={{
        borderColor: t.colour,
        backgroundColor: tone === 'tentative' ? undefined : `color-mix(in srgb, ${t.colour} 12%, transparent)`,
      }}
    >
      <RegoPlate registration={rego} size="sm" />
      <div className="mt-1 truncate font-semibold">{title}</div>
      <div className="flex items-center gap-1 truncate text-xs font-semibold" style={{ color: t.colour }}>
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{t.label}</span>
      </div>
    </div>
  )
}
