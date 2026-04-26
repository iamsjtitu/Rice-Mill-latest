/**
 * Agent Commission Cap Helper
 * ===========================
 * Business rule (v104.28.38+): Agent commission is paid on the contracted scope
 * only — `target_qntl + (target_qntl × cutting%)`. Anything ABOVE this cap is
 * treated as Private Paddy Purchase (move-to-pvt). Agent gets NEITHER base_rate
 * nor cutting_rate on the excess.
 */

function cappedTpForCommission(tpWeight, targetQntl, cuttingPct) {
  const tp = Number(tpWeight) || 0;
  const tg = Number(targetQntl) || 0;
  const cp = Number(cuttingPct) || 0;
  if (tg <= 0) return tp;
  const cap = tg * (1 + cp / 100);
  return Math.min(tp, cap);
}

module.exports = { cappedTpForCommission };
