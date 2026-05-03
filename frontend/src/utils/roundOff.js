// v104.44.68 — Global commercial round-off utility
// User rule: ≥ X.50 → X+1 (round up), < X.50 → X (round down). Same as JS Math.round.
//
// Usage:
//   import { commercialRound } from '../utils/roundOff';
//   commercialRound(49.50)  → 50
//   commercialRound(49.49)  → 49
//   commercialRound("153.7") → 154
//
// Toggle support: by default auto round-off is ON. To disable globally, set
// localStorage.AUTO_ROUNDOFF_DISABLED = "1". Or pass `force=true` to bypass.

export function commercialRound(value, force = false) {
  const n = typeof value === 'number' ? value : parseFloat(String(value || 0));
  if (isNaN(n)) return 0;
  if (!force && typeof window !== 'undefined' && window.localStorage?.getItem('AUTO_ROUNDOFF_DISABLED') === '1') {
    return n;
  }
  return Math.round(n);
}

/** Returns true if value has fractional component (after rounding edge guard) */
export function hasDecimals(value) {
  const n = parseFloat(String(value || 0));
  if (isNaN(n)) return false;
  return Math.abs(n - Math.round(n)) > 1e-6;
}

/** Returns the rounded value AND the diff so UI can show "saved Rs.X" */
export function roundWithDiff(value) {
  const n = parseFloat(String(value || 0));
  if (isNaN(n)) return { rounded: 0, diff: 0 };
  const rounded = commercialRound(n);
  return { rounded, diff: +(n - rounded).toFixed(2) };
}

/** Helper: round only if auto-roundoff is enabled, preserving original precision otherwise */
export function maybeRound(value) {
  if (typeof window !== 'undefined' && window.localStorage?.getItem('AUTO_ROUNDOFF_DISABLED') === '1') {
    return parseFloat(String(value || 0));
  }
  return commercialRound(value);
}
