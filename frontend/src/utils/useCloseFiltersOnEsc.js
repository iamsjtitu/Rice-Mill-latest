import { useEffect } from "react";

export function useCloseFiltersOnEsc(setShowFilters) {
  useEffect(() => {
    const handler = () => setShowFilters(false);
    window.addEventListener('close-filters', handler);
    return () => window.removeEventListener('close-filters', handler);
  }, [setShowFilters]);
}
