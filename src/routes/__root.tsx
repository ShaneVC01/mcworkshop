import type { QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { EmptyState, ErrorState } from '@/components/states'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <EmptyState title="That page does not exist">
      <Link to="/" className="font-semibold text-primary-strong underline">
        Go to the start
      </Link>
    </EmptyState>
  ),
  errorComponent: ({ error, reset }) => <ErrorState error={error instanceof Error ? error : null} onRetry={reset} />,
})
