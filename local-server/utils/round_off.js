/**
 * Round Off utility - Creates a separate "Round Off" entry in cash_transactions.
 * Called from any payment handler when round_off amount is provided.
 */
const { v4: uuidv4 } = require('uuid');

/**
 * Create a round-off cash_transaction entry.
 * @param {Object} db - Database reference (with .cash_transactions array)
 * @param {number} roundOffAmount - positive = nikasi (extra paid), negative = jama
 * @param {string} date
 * @param {string} category - e.g. "Hemali - Sardar Name"
 * @param {Object} opts - { account, bank_name, kms_year, season, created_by, reference }
 * @returns {Object|null} The created entry or null if round_off is 0
 */
function createRoundOffEntry(db, roundOffAmount, date, category, opts = {}) {
  if (!roundOffAmount || roundOffAmount === 0) return null;

  const absAmount = Math.round(Math.abs(roundOffAmount) * 100) / 100;
  const txnType = roundOffAmount > 0 ? 'nikasi' : 'jama';
  const sign = roundOffAmount > 0 ? '+' : '';
  const description = opts.description || `Round Off (${sign}${roundOffAmount}) - ${category}`;

  const entry = {
    id: uuidv4(),
    date: date,
    account: opts.account || 'cash',
    txn_type: txnType,
    category: 'Round Off',
    party_type: 'Round Off',
    description: description,
    amount: absAmount,
    reference: opts.reference || `round_off:${(category || '').substring(0, 20)}`,
    bank_name: opts.account === 'bank' ? (opts.bank_name || '') : '',
    kms_year: opts.kms_year || '',
    season: opts.season || '',
    created_by: opts.created_by || 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!db.cash_transactions) db.cash_transactions = [];
  db.cash_transactions.push(entry);
  return entry;
}

module.exports = { createRoundOffEntry };
