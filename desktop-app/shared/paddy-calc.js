/**
 * Paddy Calculation - Auto-compute paddy weights, deductions, and amounts
 * Used by: private_trading.js
 * 
 * IMPORTANT: This file must be identical in desktop-app/shared/ and local-server/shared/
 */

/**
 * Auto-calculate paddy purchase fields from raw inputs
 * Computes: qntl, gbw_cut, mill_w, moisture_cut, cutting, final_w, total_amount, balance
 * 
 * @param {Object} d - Paddy entry object (mutated in place)
 * @returns {Object} Same object with computed fields
 */
function calcPaddyAuto(d) {
  d.qntl = Math.round((d.kg || 0) / 100 * 100) / 100;
  d.gbw_cut = d.g_deposite > 0 ? Math.round(d.g_deposite * 0.5 * 100) / 100 : Math.round((d.bag || 0) * 1 * 100) / 100;
  d.mill_w = Math.round(((d.kg || 0) - d.gbw_cut) * 100) / 100;
  d.p_pkt_cut = Math.round((d.plastic_bag || 0) * 0.5 * 100) / 100;
  const moistPct = (d.moisture || 0) > 17 ? Math.round(((d.moisture || 0) - 17) * 100) / 100 : 0;
  d.moisture_cut_percent = moistPct;
  d.moisture_cut = Math.round(d.mill_w * moistPct / 100 * 100) / 100;
  const afterM = d.mill_w - d.moisture_cut;
  d.cutting = Math.round(afterM * (d.cutting_percent || 0) / 100 * 100) / 100;
  d.final_w = Math.round((afterM - d.cutting - d.p_pkt_cut - (d.disc_dust_poll || 0)) * 100) / 100;
  d.final_qntl = Math.round(d.final_w / 100 * 100) / 100;
  d.total_amount = Math.round(d.final_qntl * (d.rate_per_qntl || 0) * 100) / 100;
  d.balance = Math.round(d.total_amount - (d.paid_amount || 0), 2);
  return d;
}

module.exports = { calcPaddyAuto };
