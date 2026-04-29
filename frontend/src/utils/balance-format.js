/**
 * Format an accounting balance with DR/CR suffix (Indian / Tally convention).
 *
 * In a Party Ledger (Account = Ledger type), running balance = sum(jama) - sum(nikasi):
 *   • NIKASI > JAMA → balance is negative → party owes us → **DR** (receivable)
 *   • JAMA > NIKASI → balance is positive → we owe party / advance received → **CR**
 *
 * Examples:
 *   formatBalanceDrCr(-107804.55) → "₹1,07,804.55 DR"  (we have to receive)
 *   formatBalanceDrCr(50000)      → "₹50,000.00 CR"   (we have to pay)
 *   formatBalanceDrCr(0)          → "₹0.00"           (settled)
 */
export function formatBalanceDrCr(amount, opts = {}) {
  const { currency = "₹", maxFractionDigits = 2, showZeroAsBalanced = false } = opts;
  const num = Number(amount) || 0;
  if (num === 0) return showZeroAsBalanced ? "Settled" : `${currency}0.00`;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString("en-IN", {
    minimumFractionDigits: maxFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  });
  // Negative balance = party owes us = DR (receivable)
  // Positive balance = we owe party = CR (payable)
  return `${currency}${formatted} ${num < 0 ? "DR" : "CR"}`;
}

/**
 * Tailwind color classes for a DR/CR balance.
 *   DR (negative — party owes us, lena hai pending) → red (caution — outstanding receivable)
 *   CR (positive — we owe party / settled) → emerald (OK — paid up or advance)
 *   0 → slate (settled)
 */
export function balanceColorClass(amount) {
  const num = Number(amount) || 0;
  if (num === 0) return "text-slate-600";
  return num < 0 ? "text-red-600" : "text-emerald-700";
}
