/**
 * Party Helpers - Shared logic for party label formatting
 * Used by: private_trading.js, cashbook.js
 * 
 * IMPORTANT: This file must be identical in desktop-app/shared/ and local-server/shared/
 */

/**
 * Format quantity detail string
 * @param {number} qntl - Quintals
 * @param {number} rate - Rate per quintal
 * @returns {string} Formatted string like "10 Qntl @ Rs.2500"
 */
function fmtDetail(qntl, rate) {
  const q = qntl === Math.floor(qntl) ? Math.floor(qntl) : qntl;
  const r = rate === Math.floor(rate) ? Math.floor(rate) : Math.round(rate * 100) / 100;
  return `${q} Qntl @ Rs.${r}`;
}

/**
 * Create standardized party label to avoid duplicate ledger entries
 * @param {string} party - Party name
 * @param {string} mandi - Mandi name
 * @returns {string} Formatted label like "PartyName - MandiName"
 */
function makePartyLabel(party, mandi) {
  party = (party || '').trim();
  mandi = (mandi || '').trim();
  if (!party) return 'Pvt Paddy';
  if (mandi && !party.toLowerCase().includes(mandi.toLowerCase())) return `${party} - ${mandi}`;
  return party;
}

module.exports = { fmtDetail, makePartyLabel };
