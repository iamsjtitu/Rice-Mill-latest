/**
 * Payment Service - Shared payment processing logic for Private Paddy & Rice Sales
 * Handles cash book entries, diesel entries, party jama/nikasi, and cleanup
 * 
 * IMPORTANT: This file must be identical in desktop-app/shared/ and local-server/shared/
 */

const crypto = require('crypto');
const { makePartyLabel, fmtDetail } = require('./party-helpers');

const _uuid = () => crypto.randomUUID();

/**
 * Create cash book + diesel entries when a private paddy purchase is recorded
 * Creates: party jama (ledger), cash paid, diesel, advance entries
 */
function createCashDieselForPvtPaddy(db, doc, username) {
  if (!db.data.cash_transactions) db.data.cash_transactions = [];
  if (!db.data.diesel_accounts) db.data.diesel_accounts = [];
  const entryId = doc.id;
  const party = doc.party_name || '';
  const mandi = doc.mandi_name || '';
  const partyLabel = makePartyLabel(party, mandi);
  const truckNo = doc.truck_no || '';
  const date = doc.date || new Date().toISOString().slice(0, 10);
  const qntl = doc.final_qntl || doc.qntl || 0;
  const rate = doc.rate_per_qntl || doc.rate || ((qntl && doc.total_amount) ? Math.round(doc.total_amount / qntl * 100) / 100 : 0);
  const detail = (qntl && rate) ? fmtDetail(qntl, rate) : '';
  const base = { kms_year: doc.kms_year || '', season: doc.season || '', created_by: username || 'system', linked_entry_id: entryId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  // --- Party Jama (Ledger) --- what we owe the party for paddy purchase
  const totalAmount = parseFloat(doc.total_amount) || 0;
  if (totalAmount > 0) {
    const partyJamaDesc = detail ? `Paddy Purchase: ${partyLabel} - ${detail}` : `Paddy Purchase: ${partyLabel} - Rs.${totalAmount}`;
    db.data.cash_transactions.push({
      id: _uuid(), date, account: 'ledger', txn_type: 'jama',
      category: partyLabel, party_type: 'Pvt Paddy Purchase',
      description: partyJamaDesc,
      amount: Math.round(totalAmount * 100) / 100,
      reference: `pvt_party_jama:${entryId.slice(0,8)}`,
      ...base
    });
  }

  const cashPaid = parseFloat(doc.cash_paid) || 0;
  if (cashPaid > 0 && truckNo) {
    const cashDesc = detail ? `${partyLabel} - ${detail}` : `${partyLabel} - Rs.${cashPaid}`;
    db.data.cash_transactions.push({ id: _uuid(), date, account: 'cash', txn_type: 'nikasi', category: truckNo, party_type: 'Truck', description: cashDesc, amount: Math.round(cashPaid * 100) / 100, reference: `pvt_paddy_cash:${entryId.slice(0,8)}`, ...base });
    db.data.cash_transactions.push({ id: _uuid(), date, account: 'ledger', txn_type: 'nikasi', category: truckNo, party_type: 'Truck', description: cashDesc, amount: Math.round(cashPaid * 100) / 100, reference: `pvt_paddy_tcash:${entryId.slice(0,8)}`, ...base });
  }
  const dieselPaid = parseFloat(doc.diesel_paid) || 0;
  if (dieselPaid > 0) {
    const dieselDesc = detail ? `${partyLabel} - ${detail}` : `${partyLabel} - Rs.${dieselPaid}`;
    const pumps = db.data.diesel_pumps || [];
    const defPump = pumps.find(p => p.is_default) || { id: 'default', name: 'Default Pump' };
    db.data.diesel_accounts.push({ id: _uuid(), date, pump_id: defPump.id, pump_name: defPump.name, truck_no: truckNo, agent_name: doc.agent_name || '', mandi_name: mandi, amount: Math.round(dieselPaid * 100) / 100, txn_type: 'debit', description: dieselDesc, ...base });
    if (truckNo) {
      db.data.cash_transactions.push({ id: _uuid(), date, account: 'ledger', txn_type: 'nikasi', category: truckNo, party_type: 'Truck', description: dieselDesc, amount: Math.round(dieselPaid * 100) / 100, reference: `pvt_paddy_tdiesel:${entryId.slice(0,8)}`, ...base });
    }
  }
  const advancePaid = parseFloat(doc.paid_amount) || 0;
  if (advancePaid > 0) {
    const advDesc = detail ? `Advance - ${detail}` : `Advance - ${partyLabel} - Rs.${advancePaid}`;
    db.data.cash_transactions.push({ id: _uuid(), date, account: 'cash', txn_type: 'nikasi', category: partyLabel, party_type: 'Pvt Paddy Purchase', description: advDesc, amount: Math.round(advancePaid * 100) / 100, reference: `pvt_paddy_adv:${entryId.slice(0,8)}`, ...base });
  }
}

/**
 * Safety net: ensure party jama entry exists for a pvt paddy entry
 * Creates missing jama entry if somehow the main function failed
 */
function ensurePartyJamaExists(db, doc, username) {
  if (!db.data.cash_transactions) db.data.cash_transactions = [];
  const totalAmt = parseFloat(doc.total_amount) || 0;
  if (totalAmt <= 0 || !doc.id) return;
  const ref = `pvt_party_jama:${doc.id.slice(0, 8)}`;
  const exists = db.data.cash_transactions.find(t => t.reference === ref);
  if (exists) return;
  const party = doc.party_name || 'Pvt Paddy';
  const qntl = doc.final_qntl || doc.qntl || (doc.kg ? doc.kg / 100 : 0);
  const rate = doc.rate_per_qntl || doc.rate || 0;
  const desc = (qntl && rate) ? `Paddy Purchase: ${party} - ${qntl}Q @ Rs.${rate}/Q = Rs.${totalAmt}` : `Paddy Purchase: ${party} - Rs.${totalAmt}`;
  db.data.cash_transactions.push({
    id: _uuid(),
    date: doc.date || new Date().toISOString().slice(0, 10),
    account: 'cash', txn_type: 'jama',
    category: party, party_type: 'Pvt Paddy Purchase',
    description: desc,
    amount: Math.round(totalAmt * 100) / 100, bank_name: '',
    reference: ref,
    kms_year: doc.kms_year || '', season: doc.season || '',
    created_by: username || 'system', linked_entry_id: doc.id,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
}

/**
 * Delete all linked cash book + diesel entries for a pvt paddy record
 */
function deleteCashDieselForPvtPaddy(db, entryId) {
  if (db.data.cash_transactions) db.data.cash_transactions = db.data.cash_transactions.filter(t => {
    if (t.linked_entry_id !== entryId) return true;
    const ref = (t.reference || '');
    if (ref.startsWith('pvt_paddy') || ref.startsWith('pvt_party_jama') || ref.startsWith('pvt_truck_jama:')) return false;
    return true;
  });
  if (db.data.diesel_accounts) db.data.diesel_accounts = db.data.diesel_accounts.filter(t => t.linked_entry_id !== entryId);
}

/**
 * Create cash book entries for rice sales (auto-receipt)
 */
function createCashForRiceSale(db, doc, username) {
  if (!db.data.cash_transactions) db.data.cash_transactions = [];
  const entryId = doc.id;
  const party = doc.party_name || '';
  const date = doc.date || new Date().toISOString().slice(0, 10);
  const amount = parseFloat(doc.paid_amount) || 0;
  const base = { kms_year: doc.kms_year || '', season: doc.season || '', created_by: username || 'system', linked_entry_id: entryId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  if (amount > 0) {
    const desc = `Rice Sale - ${party} - Rs.${amount}`;
    db.data.cash_transactions.push({
      id: _uuid(), date, account: 'cash', txn_type: 'jama',
      category: party, party_type: 'Rice Sale', description: desc,
      amount: Math.round(amount * 100) / 100,
      reference: `rice_sale_cash:${entryId.slice(0,8)}`,
      ...base
    });
    db.data.cash_transactions.push({
      id: _uuid(), date, account: 'ledger', txn_type: 'jama',
      category: party, party_type: 'Rice Sale', description: desc,
      amount: Math.round(amount * 100) / 100,
      reference: `rice_sale_lcash:${entryId.slice(0,8)}`,
      ...base
    });
  }
}

/**
 * Delete linked cash entries for rice sales
 */
function deleteCashForRiceSale(db, entryId) {
  if (db.data.cash_transactions) {
    db.data.cash_transactions = db.data.cash_transactions.filter(t => 
      !(t.linked_entry_id === entryId && (t.reference || '').startsWith('rice_sale_'))
    );
  }
}

/**
 * Process private payment - update entry balance + create cash book entries
 * @param {Object} db - Database reference
 * @param {Object} payData - Payment data from request
 * @param {string} username - Current user
 * @returns {Object} Created payment record
 */
function processPrivatePayment(db, payData, username) {
  if (!db.data.private_payments) db.data.private_payments = [];
  if (!db.data.cash_transactions) db.data.cash_transactions = [];

  const d = { id: _uuid(), ...payData, created_by: username || '', created_at: new Date().toISOString() };
  d.amount = parseFloat(d.amount) || 0;
  const roundOff = parseFloat(payData.round_off) || 0;
  const totalSettled = Math.round((d.amount + roundOff) * 100) / 100;
  db.data.private_payments.push(d);

  // Update the parent entry's paid_amount
  if (d.ref_type === 'paddy_purchase' && d.ref_id) {
    const entry = (db.data.private_paddy || []).find(e => e.id === d.ref_id);
    if (entry) { entry.paid_amount = Math.round(((entry.paid_amount || 0) + totalSettled) * 100) / 100; entry.balance = Math.round((entry.total_amount - entry.paid_amount) * 100) / 100; }
  } else if (d.ref_type === 'rice_sale' && d.ref_id) {
    const entry = (db.data.rice_sales || []).find(e => e.id === d.ref_id);
    if (entry) { entry.paid_amount = Math.round(((entry.paid_amount || 0) + totalSettled) * 100) / 100; entry.balance = Math.round((entry.total_amount - entry.paid_amount) * 100) / 100; }
  }

  // Create cash book + ledger entries
  const account = d.mode === 'bank' ? 'bank' : 'cash';
  const isPaddy = d.ref_type === 'paddy_purchase';
  let mandi = '', qntl = 0, rate = 0;
  if (isPaddy && d.ref_id) {
    const refEntry = (db.data.private_paddy || []).find(e => e.id === d.ref_id);
    if (refEntry) { mandi = refEntry.mandi_name || ''; qntl = refEntry.qntl || 0; rate = refEntry.rate || ((qntl && refEntry.total_amount) ? Math.round(refEntry.total_amount / qntl * 100) / 100 : 0); }
  }
  const partyLabel = makePartyLabel(d.party_name, mandi);
  const partyType = isPaddy ? 'Pvt Paddy Purchase' : 'Rice Sale';
  const txnType = isPaddy ? 'nikasi' : 'jama';
  const detail = (qntl && rate) ? fmtDetail(qntl, rate) : `Rs.${d.amount}`;
  const desc = `${partyLabel} - ${detail}`;
  const baseCb = { date: d.date, kms_year: d.kms_year || '', season: d.season || '', created_by: d.created_by, linked_payment_id: d.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  db.data.cash_transactions.push({
    id: _uuid(), account, txn_type: txnType,
    category: partyLabel, party_type: partyType, description: desc,
    amount: d.amount, reference: d.reference || `pvt_pay:${d.id.substring(0, 8)}`, ...baseCb
  });
  db.data.cash_transactions.push({
    id: _uuid(), account: 'ledger', txn_type: txnType,
    category: partyLabel, party_type: partyType,
    description: desc + (roundOff ? ` (Cash: ${d.amount}, RoundOff: ${roundOff})` : ''),
    amount: totalSettled, reference: d.reference || `pvt_pay_ledger:${d.id.substring(0, 8)}`, ...baseCb
  });

  return d;
}

/**
 * Undo/Delete a private payment - reverses the balance + removes cash entries
 */
function deletePrivatePayment(db, payId) {
  if (!db.data.private_payments) db.data.private_payments = [];
  const idx = db.data.private_payments.findIndex(i => i.id === payId);
  if (idx === -1) return { success: false, error: 'Not found' };
  const pay = db.data.private_payments[idx];
  const reversalAmount = Math.round(((pay.amount || 0) + (parseFloat(pay.round_off) || 0)) * 100) / 100;

  if (pay.ref_type === 'paddy_purchase' && pay.ref_id) {
    const entry = (db.data.private_paddy || []).find(e => e.id === pay.ref_id);
    if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - reversalAmount) * 100) / 100; entry.balance = Math.round((entry.total_amount - entry.paid_amount) * 100) / 100; }
  } else if (pay.ref_type === 'rice_sale' && pay.ref_id) {
    const entry = (db.data.rice_sales || []).find(e => e.id === pay.ref_id);
    if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - reversalAmount) * 100) / 100; entry.balance = Math.round((entry.total_amount - entry.paid_amount) * 100) / 100; }
  }
  if (db.data.cash_transactions) {
    db.data.cash_transactions = db.data.cash_transactions.filter(t => t.linked_payment_id !== pay.id);
  }
  db.data.private_payments.splice(idx, 1);
  return { success: true, id: payId };
}

/**
 * Compute payment_status for a list of items (paddy or rice sales)
 */
function computePaymentStatus(items) {
  items.forEach(item => {
    const total = parseFloat(item.total_amount) || 0;
    const paid = parseFloat(item.paid_amount) || 0;
    if (total > 0 && paid >= total) {
      item.payment_status = 'paid';
    } else if (!item.payment_status) {
      item.payment_status = 'pending';
    }
  });
  return items;
}

module.exports = {
  createCashDieselForPvtPaddy,
  ensurePartyJamaExists,
  deleteCashDieselForPvtPaddy,
  createCashForRiceSale,
  deleteCashForRiceSale,
  processPrivatePayment,
  deletePrivatePayment,
  computePaymentStatus,
};
