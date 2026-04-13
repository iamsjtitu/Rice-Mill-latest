import { useEffect } from "react";

export function useArrowSubTabNav(tabIds, activeId, setActiveId) {
  useEffect(() => {
    const handler = (e) => {
      const dir = e.detail?.direction;
      if (!dir || !tabIds || tabIds.length === 0) return;
      const idx = tabIds.indexOf(activeId);
      if (idx < 0) return;
      let newIdx;
      if (dir === 'next') {
        newIdx = idx + 1 >= tabIds.length ? 0 : idx + 1;
      } else {
        newIdx = idx - 1 < 0 ? tabIds.length - 1 : idx - 1;
      }
      setActiveId(tabIds[newIdx]);
    };
    window.addEventListener('arrow-nav-subtab', handler);
    return () => window.removeEventListener('arrow-nav-subtab', handler);
  }, [tabIds, activeId, setActiveId]);
}
