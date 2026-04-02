/**
 * Staff Service - Core business logic for staff salary/advance calculations
 * Handles: advance balance, salary calculation, payment cash entry creation
 * 
 * IMPORTANT: This file must be identical in desktop-app/shared/ and local-server/shared/
 */
const crypto = require('crypto');
const _uuid = () => crypto.randomUUID();

/**
 * Calculate staff advance balance
 * @param {Object} db - Database reference
 * @param {string} staffId - Staff ID
 * @param {string} kmsYear - Financial year
 * @param {string} season - Season filter
 * @returns {Object} { opening_balance, total_advance, total_deducted, balance }
 */
function calculateAdvanceBalance(db, staffId, kmsYear, season) {
  let advances = (db.data.staff_advances || []).filter(a => a.staff_id === staffId);
  if (kmsYear) advances = advances.filter(a => a.kms_year === kmsYear);
  if (season) advances = advances.filter(a => a.season === season);
  const totalAdvance = +(advances.reduce((s, a) => s + (a.amount || 0), 0).toFixed(2));

  let payments = (db.data.staff_payments || []).filter(p => p.staff_id === staffId);
  if (kmsYear) payments = payments.filter(p => p.kms_year === kmsYear);
  if (season) payments = payments.filter(p => p.season === season);
  const totalDeducted = +(payments.reduce((s, p) => s + (p.advance_deducted || 0), 0).toFixed(2));

  let openingBalance = 0;
  if (kmsYear) {
    const fyParts = kmsYear.split('-');
    if (fyParts.length === 2) {
      const prevFy = `${parseInt(fyParts[0])-1}-${parseInt(fyParts[1])-1}`;
      let prevAdv = (db.data.staff_advances || []).filter(a => a.staff_id === staffId && a.kms_year === prevFy);
      if (season) prevAdv = prevAdv.filter(a => a.season === season);
      const prevTotalAdv = prevAdv.reduce((s, a) => s + (a.amount || 0), 0);
      let prevPay = (db.data.staff_payments || []).filter(p => p.staff_id === staffId && p.kms_year === prevFy);
      if (season) prevPay = prevPay.filter(p => p.season === season);
      const prevTotalDed = prevPay.reduce((s, p) => s + (p.advance_deducted || 0), 0);
      openingBalance = Math.round((prevTotalAdv - prevTotalDed) * 100) / 100;
    }
  }

  return { opening_balance: openingBalance, total_advance: totalAdvance, total_deducted: totalDeducted, balance: +(openingBalance + totalAdvance - totalDeducted).toFixed(2) };
}

/**
 * Create cash book entries for staff advance
 */
function createStaffAdvanceCashEntries(db, advance, createdBy) {
  if (!db.data.cash_transactions) db.data.cash_transactions = [];
  const staffName = advance.staff_name || 'Staff';
  const now = new Date().toISOString();
  // Cash Book Nikasi (cash going out)
  db.data.cash_transactions.push({
    id: _uuid(), date: advance.date, account: 'cash', txn_type: 'nikasi',
    category: staffName, party_type: 'Staff',
    description: `Staff Advance: ${staffName} - ${advance.description}`,
    amount: advance.amount, reference: `staff_advance:${advance.id}`,
    kms_year: advance.kms_year, season: advance.season,
    created_by: createdBy || '', linked_payment_id: advance.id,
    created_at: now, updated_at: now
  });
  // Ledger Jama (staff owes us)
  db.data.cash_transactions.push({
    id: _uuid(), date: advance.date, account: 'ledger', txn_type: 'jama',
    category: staffName, party_type: 'Staff',
    description: `Staff Advance: ${staffName} - ${advance.description}`,
    amount: advance.amount, reference: `staff_advance_ledger:${advance.id}`,
    kms_year: advance.kms_year, season: advance.season,
    created_by: createdBy || '', linked_payment_id: advance.id,
    created_at: now, updated_at: now
  });
}

/**
 * Delete staff advance and its linked cash entries
 */
function deleteStaffAdvanceCashEntries(db, advanceId) {
  db.data.cash_transactions = (db.data.cash_transactions || []).filter(t =>
    t.linked_payment_id !== advanceId &&
    t.reference !== `staff_advance:${advanceId}` &&
    t.reference !== `staff_advance_ledger:${advanceId}`
  );
}

/**
 * Create cash book entry for staff salary payment
 */
function createStaffPaymentCashEntry(db, payment, createdBy) {
  if (!db.data.cash_transactions) db.data.cash_transactions = [];
  if (payment.net_payment > 0) {
    db.data.cash_transactions.push({
      id: _uuid(), date: payment.date, account: 'cash', txn_type: 'nikasi',
      category: 'Staff Salary',
      description: `Salary: ${payment.staff_name} (${payment.from_date} to ${payment.to_date})`,
      amount: payment.net_payment, reference: `staff_payment:${payment.id}`,
      kms_year: payment.kms_year, season: payment.season,
      created_by: createdBy || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
  }
}

/**
 * Delete staff payment cash entry
 */
function deleteStaffPaymentCashEntry(db, paymentId) {
  db.data.cash_transactions = (db.data.cash_transactions || []).filter(t => t.reference !== `staff_payment:${paymentId}`);
}

module.exports = { calculateAdvanceBalance, createStaffAdvanceCashEntries, deleteStaffAdvanceCashEntries, createStaffPaymentCashEntry, deleteStaffPaymentCashEntry };
