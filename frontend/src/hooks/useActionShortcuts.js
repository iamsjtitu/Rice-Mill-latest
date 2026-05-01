/**
 * Per-panel action keyboard shortcuts (Alt+Shift+letter — no browser/app conflicts).
 *
 * Standard mappings used across the app:
 *   Alt+Shift+E → Excel Export
 *   Alt+Shift+P → PDF Export
 *   Alt+Shift+W → WhatsApp Send
 *   Alt+Shift+G → Group Send
 *   Alt+Shift+R → Refresh data
 *   Alt+Shift+F → Toggle Filter
 *
 * Usage:
 *   useActionShortcuts({
 *     excel: handleExportExcel,
 *     pdf: handleExportPDF,
 *     whatsapp: handleHeaderWhatsApp,
 *     group: handleHeaderGroup,
 *   }, [dep1, dep2]);
 *
 * Auto-disabled when input/textarea/select is focused (so typing 'e' in search doesn't trigger).
 */
import { useEffect } from "react";

const KEY_MAP = {
  e: 'excel',
  p: 'pdf',
  w: 'whatsapp',
  g: 'group',
  r: 'refresh',
  f: 'filter',
  s: 'search',
  n: 'new',
  d: 'delete',
};

const isInputFocused = () => {
  const a = document.activeElement;
  if (!a) return false;
  const tag = (a.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (a.isContentEditable) return true;
  return false;
};

export function useActionShortcuts(actions, deps = []) {
  useEffect(() => {
    if (!actions) return undefined;
    const handler = (e) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (isInputFocused()) return;

      const key = (e.key || '').toLowerCase();
      const action = KEY_MAP[key];
      if (!action) return;
      const fn = actions[action];
      if (!fn) return;

      e.preventDefault();
      e.stopPropagation();
      try {
        fn();
      } catch (err) {
        console.error(`[shortcut Alt+Shift+${key}] error:`, err);
      }
    };
    window.addEventListener('keydown', handler, true); // capture phase to win before global
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Tooltip helper — appends shortcut hint to label.
 *  withShortcut('Excel Export', 'E') → "Excel Export (Alt+Shift+E)"
 */
export function withShortcut(label, key) {
  if (!key) return label;
  return `${label} (Alt+Shift+${String(key).toUpperCase()})`;
}
