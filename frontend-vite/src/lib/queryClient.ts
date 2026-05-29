import { QueryClient } from '@tanstack/react-query'

// Single QueryClient instance for the whole app. The defaults reflect
// our reality: short-lived sessions, polling already configured per
// query, and a 401 should NOT be retried (lets the auth gate redirect).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Most data is "moderately fresh" — 30s avoids hammering the API
      // when the user navigates back to a page they just left.
      staleTime: 30_000,
      // Keep cached data for 5min after the last subscriber leaves so
      // navigating back is instant. The actual refresh still happens
      // when stale.
      gcTime: 5 * 60_000,
      // We rely on staleTime + manual refetchInterval per query for
      // polling. Refetching on every focus event would double-poll.
      refetchOnWindowFocus: false,
      // No retry on 4xx — those are deterministic and shouldn't loop.
      retry: (failureCount, error) => {
        if (error instanceof Error && /\b4\d\d\b/.test(error.message)) return false
        return failureCount < 2
      },
    },
    mutations: {
      // Mutations should fail fast; the UI surfaces the error so the
      // user decides whether to retry.
      retry: false,
    },
  },
})
