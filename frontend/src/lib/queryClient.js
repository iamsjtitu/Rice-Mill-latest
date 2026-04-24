/**
 * React Query setup — global QueryClient for hot-path components.
 *
 * Why React Query alongside existing axios cache?
 *   - axios-cache-interceptor is a broad safety net (30s TTL, full clear on any mutation)
 *     that speeds up 52+ components with zero code changes.
 *   - React Query is a targeted speed+freshness upgrade for hot-path components.
 *     It gives fine-grained cache control + GUARANTEED fresh data after mutations
 *     via surgical `invalidateQueries([...])` calls.
 *
 * Freshness guarantees (what the user asked about):
 *   - staleTime = 0 → queries are immediately considered stale after fetch
 *   - refetchOnMount = 'always' → coming back to a tab ALWAYS refetches in background
 *     (shows cached data instantly, then updates when fresh data arrives)
 *   - refetchOnWindowFocus = true → switching back to the browser tab refetches
 *   - gcTime = 5 min → cached data kept for 5 min after last observer
 *
 * Mutations:
 *   Every useMutation() passes its affected key to queryClient.invalidateQueries()
 *   in onSuccess → those queries refetch IMMEDIATELY, not after 30s.
 *   This is STRONGER than the axios-cache full clear (more precise + instant).
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // User explicitly requested: never serve stale data after an entry is saved.
      // staleTime=0 + refetchOnMount='always' means every time a component mounts
      // (or a tab is reactivated) the data IS refetched in the background, while
      // the cached copy is shown immediately. Mutations call invalidateQueries()
      // which forces an instant refetch regardless of staleTime.
      staleTime: 0,
      gcTime: 5 * 60 * 1000,           // keep in cache 5 min after unmount
      refetchOnMount: 'always',        // always revalidate on mount (background)
      refetchOnWindowFocus: true,      // refetch when user switches back to tab
      refetchOnReconnect: true,
      retry: 1,                        // retry failed queries once (handles flaky networks)
      retryDelay: 1000,
    },
    mutations: {
      retry: 0,                        // don't silently retry mutations
    },
  },
});

/**
 * Query key factory — keeps keys consistent across the app so invalidation works.
 * Usage:
 *   useQuery({ queryKey: qk.hemaliPayments.list(), queryFn: ... })
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.hemaliPayments.all })
 */
export const qk = {
  // Hemali (cart/transport) payments
  hemaliPayments: {
    all: ['hemali-payments'],
    list: (filters = {}) => ['hemali-payments', 'list', filters],
    items: () => ['hemali-payments', 'items'],
    advance: () => ['hemali-payments', 'advance'],
  },

  // Jama / Udhar (party-wise receive/pay)
  payments: {
    all: ['payments'],
    list: (filters = {}) => ['payments', 'list', filters],
  },

  // CashBook
  cashbook: {
    all: ['cashbook'],
    list: (filters = {}) => ['cashbook', 'list', filters],
    summary: (filters = {}) => ['cashbook', 'summary', filters],
  },

  // Party ledger / parties master
  parties: {
    all: ['parties'],
    list: () => ['parties', 'list'],
    ledger: (partyId, filters = {}) => ['parties', 'ledger', partyId, filters],
  },

  // Dashboard summary (stats card, quick metrics)
  dashboard: {
    all: ['dashboard'],
    stats: (filters = {}) => ['dashboard', 'stats', filters],
  },
};
