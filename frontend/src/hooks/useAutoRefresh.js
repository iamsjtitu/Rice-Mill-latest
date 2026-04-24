/**
 * useAutoRefresh — subscribes a component to the global `data-changed` event
 * so it automatically refetches its data when ANY mutation happens anywhere in
 * the app.
 *
 * This complements the existing axios-cache + React Query invalidation layers.
 * Use this for legacy useEffect + useState components so they stay in-sync
 * after cross-component mutations (e.g. Payments list auto-refreshes after
 * HemaliPayment modal saves a new entry).
 *
 * The axios response interceptor in App.js dispatches `data-changed` on every
 * successful POST/PUT/PATCH/DELETE. This hook registers a listener that calls
 * the provided fetch function.
 *
 * Throttling: if multiple mutations fire in quick succession, we debounce 300ms
 * so the fetch is called once at the end of the burst.
 *
 * Usage:
 *   const fetchData = useCallback(async () => { ... }, [deps]);
 *   useEffect(() => { fetchData(); }, [fetchData]);
 *   useAutoRefresh(fetchData);                // ← one line!
 */
import { useEffect, useRef } from 'react';

export function useAutoRefresh(fetchFn, { enabled = true, debounceMs = 300 } = {}) {
  const fnRef = useRef(fetchFn);
  fnRef.current = fetchFn;

  useEffect(() => {
    if (!enabled) return;
    let timer;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { fnRef.current?.(); }
        catch (e) { /* ignore — don't crash the app on a refresh error */ }
      }, debounceMs);
    };
    window.addEventListener('data-changed', handler);
    // Also refresh when user switches back to this browser tab (addresses the
    // "other tab made a change" case).
    const onFocus = () => handler();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('data-changed', handler);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, debounceMs]);
}
