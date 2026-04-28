/**
 * Cashbook Service - Core business logic for cash transactions
 * Handles: party type detection, side effects (auto-ledger, diesel, pvt paddy linking)
 * 
 * IMPORTANT: This file must be identical in desktop-app/shared/ and local-server/shared/
 */
const crypto = require('crypto');
const _uuid = () => crypto.randomUUID();

/** Case-insensitive helpers */
function ciMatch(a, b) { return a && b && a.trim().toLowerCase() === b.trim().toLowerCase(); }
function ciContains(haystack, needle) { return haystack && needle && haystack.toLowerCase().includes(needle.toLowerCase()); }

/**
 * Auto-detect party_type from category name by checking all collections
 * @param {Object} db - Database reference
 * @param {string} category - Party/category name
 * @returns {string} Detected party type
 */
function autoDetectPartyType(db, category) {
  if (!category) return '';
  // 1. Exact match in existing cash_transactions
  const existing = (db.data.cash_transactions || []).find(t => ciMatch(t.category, category) && t.party_type);
  if (existing) return existing.party_type;
  // 2. Cross-collection exact match
  if ((db.data.private_paddy || []).find(p => ciMatch(p.party_name, category))) return 'Pvt Paddy Purchase';
  if ((db.data.rice_sales || []).find(p => ciMatch(p.party_name, category))) return 'Rice Sale';
  if ((db.data.diesel_accounts || []).find(p => ciMatch(p.pump_name, category))) return 'Diesel';
  if ((db.data.local_party_accounts || []).find(p => ciMatch(p.party_name, category))) return 'Local Party';
  if ((db.data.truck_payments || []).find(p => ciMatch(p.truck_no, category))) return 'Truck';
  if ((db.data.mandi_targets || []).find(p => ciMatch(p.mandi_name, category))) return 'Agent';
  if ((db.data.staff || []).find(s => ciMatch(s.name, category) && s.active)) return 'Staff';
  // 3. Fuzzy contains match
  if ((db.data.private_paddy || []).find(p => ciContains(p.party_name, category))) return 'Pvt Paddy Purchase';
  if ((db.data.rice_sales || []).find(p => ciContains(p.party_name, category))) return 'Rice Sale';
  if ((db.data.diesel_accounts || []).find(p => ciContains(p.pump_name, category))) return 'Diesel';
  if ((db.data.local_party_accounts || []).find(p => ciContains(p.party_name, category))) return 'Local Party';
  if ((db.data.mandi_targets || []).find(p => ciContains(p.mandi_name, category))) return 'Agent';
  if ((db.data.staff || []).find(s => ciContains(s.name, category) && s.active)) return 'Staff';
  // 4. Private payments check
  if ((db.data.private_payments || []).find(p => ciMatch(p.party_name, category))) return 'Pvt Paddy Purchase';
  return 'Cash Party';
}

/**
 * Retroactively fix old entries with empty party_type for a category
 */
function retroFixPartyType(db, category, partyType) {
  if (!partyType || !category) return;
  (db.data.cash_transactions || []).forEach(t => {
    if (ciMatch(t.category, category) && (!t.party_type || t.party_type === '')) {
      t.party_type = partyType;
    }
  });
}

/**
 * Create side effects when a cash transaction is created
 * - Auto-create ledger entry for cash/bank transactions
 * - Auto-create diesel_accounts payment for Diesel party
 * - Auto-update private_paddy paid_amount for Pvt Paddy Purchase
 * @returns {Object} The created main transaction (with side effects applied)
 */
function createCashTxnSideEffects(db, txn, roundOff, username) {
  // Auto-create ledger entry for cash/bank/owner transactions
  if ((txn.account === 'cash' || txn.account === 'bank' || txn.account === 'owner') && txn.category) {
    const ledgerAmount = roundOff ? Math.round((txn.amount + roundOff) * 100) / 100 : txn.amount;
    const ledgerEntry = { ...txn, id: _uuid(), account: 'ledger', amount: ledgerAmount, reference: `auto_ledger:${txn.id.substring(0, 8)}` };
    if (!ledgerEntry.description) {
      if (txn.account === 'owner') {
        const owner = txn.owner_name || 'Owner';
        ledgerEntry.description = txn.txn_type === 'jama'
          ? `${owner} received from ${txn.category}`
          : `${owner} paid to ${txn.category}`;
      } else {
        const acct = txn.account.charAt(0).toUpperCase() + txn.account.slice(1);
        ledgerEntry.description = txn.txn_type === 'jama'
          ? `${acct} received from ${txn.category}`
          : `${acct} payment to ${txn.category}`;
      }
    }
    if (roundOff) {
      ledgerEntry.description += ` (${txn.account === 'owner' ? 'Owner' : 'Cash'}: ${txn.amount}, Round Off: ${roundOff > 0 ? '+' : ''}${roundOff})`;
    }
    db.data.cash_transactions.push(ledgerEntry);
  }

  // Auto-create diesel_accounts payment when Cash Book payment is for a Diesel pump
  if (txn.party_type === 'Diesel' && txn.category && (txn.account === 'cash' || txn.account === 'bank')) {
    const pumps = db.data.diesel_pumps || [];
    const pump = pumps.find(p => p.name && p.name.toLowerCase() === txn.category.toLowerCase())
      || pumps.find(p => p.name && txn.category.toLowerCase().includes(p.name.toLowerCase()));
    if (pump) {
      if (!db.data.diesel_accounts) db.data.diesel_accounts = [];
      const totalSettled = roundOff ? Math.round((txn.amount + roundOff) * 100) / 100 : Math.round(txn.amount * 100) / 100;
      db.data.diesel_accounts.push({
        id: _uuid(), date: txn.date || new Date().toISOString().split('T')[0],
        pump_id: pump.id, pump_name: pump.name, truck_no: '', agent_name: '',
        amount: totalSettled, txn_type: 'payment',
        description: `Payment: Rs.${txn.amount}${roundOff ? ' (Round Off: '+(roundOff>0?'+':'')+roundOff+')' : ''}${txn.description ? ' - '+txn.description : ''}`,
        kms_year: txn.kms_year || '', season: txn.season || '',
        created_by: username || 'system', source: 'cashbook', linked_cashbook_id: txn.id,
        created_at: new Date().toISOString()
      });
    }
  }

  // Auto-update private_paddy paid_amount
  if (txn.party_type === 'Pvt Paddy Purchase' && txn.category && (txn.account === 'cash' || txn.account === 'bank')) {
    const pvtEntries = db.data.private_paddy || [];
    let pvtEntry = null;
    const parts = txn.category.split(' - ');
    if (parts.length === 2) {
      pvtEntry = pvtEntries.find(p => p.party_name && p.party_name.toLowerCase() === parts[0].trim().toLowerCase() && p.mandi_name && p.mandi_name.toLowerCase() === parts[1].trim().toLowerCase() && (p.balance || 0) > 0);
    }
    if (!pvtEntry) pvtEntry = pvtEntries.find(p => p.party_name && p.party_name.toLowerCase() === txn.category.toLowerCase() && (p.balance || 0) > 0);
    if (!pvtEntry) pvtEntry = pvtEntries.find(p => p.party_name && txn.category.toLowerCase().includes(p.party_name.toLowerCase()) && (p.balance || 0) > 0);
    if (pvtEntry) {
      const payAmount = Math.round(((txn.amount || 0) + (roundOff || 0)) * 100) / 100;
      const newPaid = Math.round(((pvtEntry.paid_amount || 0) + payAmount) * 100) / 100;
      const newBalance = Math.round((pvtEntry.total_amount || 0) - newPaid);
      pvtEntry.paid_amount = newPaid;
      pvtEntry.balance = newBalance;
      pvtEntry.status = newBalance <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');
      txn.cashbook_pvt_linked = pvtEntry.id;
    }
  }
}

/**
 * Handle cascading side effects when a cash transaction is deleted
 * Reverses pvt paddy, rice sale, truck, agent, hemali, truck lease payments
 */
function deleteCashTxnSideEffects(db, txn) {
  const ref = txn.reference || '';
  const linkedPayId = txn.linked_payment_id || '';
  const partyType = txn.party_type || '';
  const linkedEntryId = txn.linked_entry_id || '';

  // === Pvt Paddy Purchase ===
  if (partyType === 'Pvt Paddy Purchase') {
    let revAmount = Math.round((txn.amount || 0) * 100) / 100;
    let pvtEntry = null;
    const pvtEntries = db.data.private_paddy || [];

    if (linkedPayId && !linkedPayId.startsWith('mark_paid:')) {
      const payDoc = (db.data.private_payments || []).find(p => p.id === linkedPayId);
      if (payDoc) {
        pvtEntry = pvtEntries.find(p => p.id === payDoc.ref_id);
        revAmount = Math.round(((payDoc.amount || 0) + (payDoc.round_off || 0)) * 100) / 100;
        db.data.private_payments = db.data.private_payments.filter(p => p.id !== linkedPayId);
      }
      db.data.cash_transactions = db.data.cash_transactions.filter(t => !(t.linked_payment_id === linkedPayId && t.account === 'ledger'));
    } else if (linkedPayId && linkedPayId.startsWith('mark_paid:')) {
      const entryIdPrefix = linkedPayId.replace('mark_paid:', '');
      pvtEntry = pvtEntries.find(p => p.id.startsWith(entryIdPrefix));
      db.data.cash_transactions = db.data.cash_transactions.filter(t => !(t.linked_payment_id === linkedPayId && t.account === 'ledger'));
      if (pvtEntry) pvtEntry.payment_status = 'pending';
    } else if (ref.startsWith('pvt_paddy_adv:')) {
      if (linkedEntryId) pvtEntry = pvtEntries.find(p => p.id === linkedEntryId);
      const ledgerRef = ref.replace('pvt_paddy_adv:', 'pvt_paddy_advl:');
      db.data.cash_transactions = db.data.cash_transactions.filter(t => t.reference !== ledgerRef);
    } else if (!linkedPayId && (txn.account === 'cash' || txn.account === 'bank')) {
      const cat = txn.category || '';
      if (txn.cashbook_pvt_linked) pvtEntry = pvtEntries.find(p => p.id === txn.cashbook_pvt_linked);
      if (!pvtEntry && cat) {
        const parts = cat.split(' - ');
        if (parts.length === 2) pvtEntry = pvtEntries.find(p => p.party_name && p.party_name.toLowerCase() === parts[0].trim().toLowerCase() && p.mandi_name && p.mandi_name.toLowerCase() === parts[1].trim().toLowerCase());
        if (!pvtEntry) pvtEntry = pvtEntries.find(p => p.party_name && p.party_name.toLowerCase() === cat.toLowerCase());
      }
    }
    if (pvtEntry && revAmount > 0) {
      const newPaid = Math.round(Math.max(0, (pvtEntry.paid_amount || 0) - revAmount) * 100) / 100;
      pvtEntry.paid_amount = newPaid;
      pvtEntry.balance = Math.round(((pvtEntry.total_amount || 0) - newPaid) * 100) / 100;
      pvtEntry.payment_status = newPaid < (pvtEntry.total_amount || 0) ? 'pending' : 'paid';
    }
  }

  // === Rice Sale ===
  if (partyType === 'Rice Sale') {
    let revAmount = Math.round((txn.amount || 0) * 100) / 100;
    let riceEntry = null;
    const riceEntries = db.data.rice_sales || [];
    if (linkedPayId && !linkedPayId.startsWith('mark_paid')) {
      const payDoc = (db.data.private_payments || []).find(p => p.id === linkedPayId);
      if (payDoc) {
        riceEntry = riceEntries.find(p => p.id === payDoc.ref_id);
        revAmount = Math.round(((payDoc.amount || 0) + (payDoc.round_off || 0)) * 100) / 100;
        db.data.private_payments = db.data.private_payments.filter(p => p.id !== linkedPayId);
      }
      db.data.cash_transactions = db.data.cash_transactions.filter(t => !(t.linked_payment_id === linkedPayId && t.account === 'ledger'));
    } else if (linkedPayId && linkedPayId.startsWith('mark_paid_rice:')) {
      const entryIdPrefix = linkedPayId.replace('mark_paid_rice:', '');
      riceEntry = riceEntries.find(p => p.id.startsWith(entryIdPrefix));
      db.data.cash_transactions = db.data.cash_transactions.filter(t => !(t.linked_payment_id === linkedPayId && t.account === 'ledger'));
      if (riceEntry) riceEntry.payment_status = 'pending';
    }
    if (riceEntry && revAmount > 0) {
      const newPaid = Math.round(Math.max(0, (riceEntry.paid_amount || 0) - revAmount) * 100) / 100;
      riceEntry.paid_amount = newPaid;
      riceEntry.balance = Math.round(((riceEntry.total_amount || 0) - newPaid) * 100) / 100;
      riceEntry.payment_status = newPaid < (riceEntry.total_amount || 0) ? 'pending' : 'paid';
    }
  }

  // === Truck Payments ===
  if (linkedPayId.startsWith('truck:')) {
    const entryId = linkedPayId.replace('truck:', '');
    const tpDoc = (db.data.truck_payments || []).find(p => p.entry_id === entryId);
    if (tpDoc) {
      const revAmount = Math.round((txn.amount || 0) * 100) / 100;
      tpDoc.paid_amount = Math.round(Math.max(0, (tpDoc.paid_amount || 0) - revAmount) * 100) / 100;
      const history = tpDoc.payments_history || [];
      for (let i = history.length - 1; i >= 0; i--) {
        if (Math.round((history[i].amount || 0) * 100) === Math.round(revAmount * 100)) { history.splice(i, 1); break; }
      }
      tpDoc.updated_at = new Date().toISOString();
    }
    const refPrefix = (txn.reference || '').replace('truck_pay:', 'truck_pay_ledger:');
    if (refPrefix) db.data.cash_transactions = db.data.cash_transactions.filter(t => t.reference !== refPrefix);
  }

  // === Agent Payments ===
  if (linkedPayId.startsWith('agent:')) {
    const parts = linkedPayId.split(':');
    if (parts.length >= 4) {
      const mandiName = parts[1], kmsYear = parts[2], season = parts[3];
      const apDoc = (db.data.agent_payments || []).find(p =>
        p.mandi_name === mandiName && p.kms_year === kmsYear && p.season === season);
      if (apDoc) {
        const revAmount = Math.round((txn.amount || 0) * 100) / 100;
        apDoc.paid_amount = Math.round(Math.max(0, (apDoc.paid_amount || 0) - revAmount) * 100) / 100;
        const history = apDoc.payments_history || [];
        for (let i = history.length - 1; i >= 0; i--) {
          if (Math.round((history[i].amount || 0) * 100) === Math.round(revAmount * 100)) { history.splice(i, 1); break; }
        }
        apDoc.updated_at = new Date().toISOString();
      }
      const refPrefix = (txn.reference || '').replace('agent_pay:', 'agent_pay_ledger:');
      if (refPrefix) db.data.cash_transactions = db.data.cash_transactions.filter(t => t.reference !== refPrefix);
    }
  }

  // === Truck Lease ===
  if (linkedPayId.startsWith('truck_lease:')) {
    const parts = linkedPayId.split(':');
    if (parts.length >= 4) {
      const paymentId = parts[3] || '';
      if (paymentId) {
        db.data.truck_lease_payments = (db.data.truck_lease_payments || []).filter(p => p.id !== paymentId);
      }
    }
  }

  // === Hemali ===
  if (ref.startsWith('hemali_payment:')) {
    const hemaliPid = ref.replace('hemali_payment:', '');
    const hp = (db.data.hemali_payments || []).find(p => p.id === hemaliPid);
    if (hp) { hp.status = 'unpaid'; hp.updated_at = new Date().toISOString(); }
    db.data.cash_transactions = (db.data.cash_transactions || []).filter(t =>
      t.reference !== `hemali_work:${hemaliPid}` && t.reference !== `hemali_paid:${hemaliPid}`
    );
    db.data.local_party_accounts = (db.data.local_party_accounts || []).filter(t =>
      t.reference !== `hemali_paid:${hemaliPid}`
    );
  }
}

module.exports = { autoDetectPartyType, retroFixPartyType, createCashTxnSideEffects, deleteCashTxnSideEffects, ciMatch, ciContains };
