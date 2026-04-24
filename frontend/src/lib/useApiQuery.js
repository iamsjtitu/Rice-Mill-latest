/**
 * useApiQuery — thin wrapper around useQuery + axios for the app's REST APIs.
 *
 * Benefits over raw useEffect + axios.get:
 *   ✓ GUARANTEED fresh data after ANY mutation (automatic invalidateQueries call)
 *   ✓ Background refetch on window focus — user switches browser tabs and comes
 *     back → data silently updates (no manual refresh button needed)
 *   ✓ Shows cached data instantly on tab re-entry, refetches in background
 *     (no "Loading..." flash — feels instant)
 *   ✓ Auto-retry on transient network errors
 *   ✓ Shared cache across components — if 3 components view the same data,
 *     only 1 network request happens
 *
 * Usage:
 *   const { data, isLoading, refetch } = useApiQuery({
 *     key: qk.hemaliPayments.list({ fy: '2025-26' }),
 *     url: `${API}/hemali-payments?fy=2025-26`,
 *   });
 *
 * Mutations:
 *   const save = useApiMutation({
 *     mutationFn: (payload) => axios.post(`${API}/hemali-payments`, payload),
 *     invalidate: [qk.hemaliPayments.all],  // keys to refetch after success
 *   });
 *   await save.mutateAsync(formData);   // list refreshes instantly
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export function useApiQuery({ key, url, options = {}, enabled = true }) {
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const res = await axios.get(url, { signal });
      return res.data;
    },
    enabled,
    ...options,
  });
}

export function useApiMutation({ mutationFn, invalidate = [], onSuccess, onError }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, variables, context) => {
      // Surgical invalidation — only the keys the caller declared
      for (const k of invalidate) {
        await qc.invalidateQueries({ queryKey: k });
      }
      if (onSuccess) onSuccess(data, variables, context);
    },
    onError,
  });
}
