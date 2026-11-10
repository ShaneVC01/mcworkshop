import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Planner } from '@/features/planner/planner'
import { workingToday } from '@/lib/format'

export const Route = createFileRoute('/_office/calendar')({
  validateSearch: (search: Record<string, unknown>): { day?: string } => ({
    day: typeof search.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.day) ? search.day : undefined,
  }),
  component: CalendarPage,
})

function CalendarPage() {
  const { day } = Route.useSearch()
  const navigate = useNavigate()
  return <Planner day={day ?? workingToday()} onDayChange={(d) => void navigate({ to: '/calendar', search: { day: d }, replace: true })} />
}
