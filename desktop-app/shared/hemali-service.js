/**
 * Hemali Service - Core business logic for Hemali payments
 * Handles: advance balance, payment processing, mark paid/undo side effects
 * 
 * IMPORTANT: This file must be identical in desktop-app/shared/ and local-server/shared/
 */
const crypto = require('crypto');
const _uuid = () => crypto.randomUUID();

/** Filter by Financial Year */
function filterByFy(arr, ky, season) {
  return arr.filter(t => (!ky || t.kms_year === ky) && (!season || !t.season || t.season === season));
}

/**
 * Calculate advance balance for a sardar
 * @param {Array} payments - All hemali payments (pre-filtered by FY)
 * @param {string} sardarName - Sardar name
 * @returns {number} Advance balance
 */
function getAdvanceBalance(payments, sardarName) {
  let advance = 0;
  payments.filter(p => p.sardar_name === sardarName && p.status === 'paid').forEach(p => {
    advance += (p.new_advance || 0) - (p.advance_deducted || 0);
  });
  return Math.round(advance * 100) / 100;
}

/**
 * Calculate hemali payment totals
 */
function calcHemaliTotals(items, sardarName, kmsYear, season, allPayments) {
  const total = Math.round(items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0)), 0) * 100) / 100;
  const fyPayments = filterByFy(allPayments, kmsYear, season);
  const prevAdvance = getAdvanceBalance(fyPayments, sardarName);
  const advanceDeducted = Math.min(prevAdvance, total);
  const amountPayable = Math.round((total - advanceDeducted) * 100) / 100;
  return { total, prevAdvance, advanceDeducted, amountPayable };
}

/**
 * Create side effects when marking hemali payment as paid
 * Creates: cash nikasi, ledger jama (work), ledger nikasi (payment), local party payment
 */
function markHemaliPaidSideEffects(db, payment, amountPaid, roundOff) {
  if (!db.data.cash_transactions) db.data.cash_transactions = [];
  const totalSettled = Math.round((amountPaid + roundOff) * 100) / 100;
  const itemsDesc = (payment.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
  const base = { kms_year: payment.kms_year || '', season: payment.season || '', created_by: payment.created_by || '', created_at: payment.updated_at, updated_at: payment.updated_at };
  const newAdvance = Math.round(Math.max(0, amountPaid - (payment.amount_payable || 0)) * 100) / 100;
  let advInfo = '';
  if ((payment.advance_deducted || 0) > 0) advInfo += ` | Adv Deducted: Rs.${Math.round(payment.advance_deducted)}`;
  if (newAdvance > 0) advInfo += ` | New Advance: Rs.${Math.round(newAdvance)}`;

  // Cash nikasi
  db.data.cash_transactions.push({
    id: _uuid(), date: payment.date, account: 'cash', txn_type: 'nikasi',
    amount: amountPaid, category: 'Hemali Payment', party_type: 'Hemali',
    description: `Hemali: ${payment.sardar_name} - ${itemsDesc}`,
    reference: `hemali_payment:${payment.id}`, ...base
  });
  // Ledger jama (work done)
  db.data.cash_transactions.push({
    id: _uuid(), date: payment.date, account: 'ledger', txn_type: 'jama',
    amount: payment.total || 0, category: 'Hemali Payment', party_type: 'Hemali',
    description: `${payment.sardar_name} - ${itemsDesc} | Total: Rs.${Math.round(payment.total || 0)}`,
    reference: `hemali_work:${payment.id}`, ...base
  });
  // Ledger nikasi (payment with round off)
  db.data.cash_transactions.push({
    id: _uuid(), date: payment.date, account: 'ledger', txn_type: 'nikasi',
    amount: totalSettled, category: 'Hemali Payment', party_type: 'Hemali',
    description: `${payment.sardar_name} - Paid Rs.${Math.round(totalSettled)}${advInfo}${roundOff ? ' (Cash: '+amountPaid+', RoundOff: '+roundOff+')' : ''}`,
    reference: `hemali_paid:${payment.id}`, ...base
  });
  // Local Party payment
  if (!db.data.local_party_accounts) db.data.local_party_accounts = [];
  const debitEntry = db.data.local_party_accounts.find(t => t.reference === `hemali_debit:${payment.id}`);
  if (debitEntry) {
    debitEntry.amount = payment.total || 0;
    debitEntry.description = `${payment.sardar_name} - ${itemsDesc} | Total: Rs.${Math.round(payment.total || 0)}`;
  }
  db.data.local_party_accounts.push({
    id: _uuid(), date: payment.date, party_name: 'Hemali Payment',
    txn_type: 'payment', amount: totalSettled,
    description: `${payment.sardar_name} - Paid Rs.${Math.round(totalSettled)}${advInfo}`,
    reference: `hemali_paid:${payment.id}`, source_type: 'hemali', ...base
  });

  return { newAdvance, totalSettled };
}

/**
 * Undo hemali paid - remove all linked cash + local party entries
 */
function undoHemaliPaidSideEffects(db, paymentId) {
  db.data.cash_transactions = (db.data.cash_transactions || []).filter(t =>
    t.reference !== `hemali_payment:${paymentId}` && t.reference !== `hemali_work:${paymentId}` && t.reference !== `hemali_paid:${paymentId}`
  );
  db.data.local_party_accounts = (db.data.local_party_accounts || []).filter(t =>
    t.reference !== `hemali_paid:${paymentId}`
  );
}

/**
 * Delete hemali payment - remove all linked entries (debit + payment + cash)
 */
function deleteHemaliPaymentSideEffects(db, paymentId) {
  db.data.cash_transactions = (db.data.cash_transactions || []).filter(t =>
    t.reference !== `hemali_payment:${paymentId}` && t.reference !== `hemali_work:${paymentId}` && t.reference !== `hemali_paid:${paymentId}`
  );
  db.data.local_party_accounts = (db.data.local_party_accounts || []).filter(t =>
    t.reference !== `hemali_debit:${paymentId}` && t.reference !== `hemali_paid:${paymentId}`
  );
}

module.exports = { filterByFy, getAdvanceBalance, calcHemaliTotals, markHemaliPaidSideEffects, undoHemaliPaidSideEffects, deleteHemaliPaymentSideEffects };
