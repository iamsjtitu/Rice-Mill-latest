const express = require('express');
const { safeSync } = require('./safe_handler');
const { getColumns, getEntryRow, getTotalRow, getExcelHeaders, getExcelWidths, getPdfHeaders, getPdfWidthsMm, colCount } = require('../shared/report_helper');
const router = express.Router();

module.exports = function(database) {

  function _fmtDetail(qntl, rate) {
    const q = qntl === Math.floor(qntl) ? Math.floor(qntl) : qntl;
    const r = rate === Math.floor(rate) ? Math.floor(rate) : Math.round(rate * 100) / 100;
    return `${q} Qntl @ Rs.${r}`;
  }

  // Helper: Create truck payment + advance entries for pvt paddy
  function _createCashDieselForPvtPaddy(db, doc, username) {
    if (!db.data.cash_transactions) db.data.cash_transactions = [];
    if (!db.data.diesel_accounts) db.data.diesel_accounts = [];
    const entryId = doc.id;
    const party = doc.party_name || '';
    const mandi = doc.mandi_name || '';
    const partyLabel = party || 'Pvt Paddy';
    const truckNo = doc.truck_no || '';
    const date = doc.date || new Date().toISOString().slice(0, 10);
    const qntl = doc.final_qntl || doc.qntl || 0;
    const rate = doc.rate_per_qntl || doc.rate || ((qntl && doc.total_amount) ? Math.round(doc.total_amount / qntl * 100) / 100 : 0);
    const detail = (qntl && rate) ? _fmtDetail(qntl, rate) : '';
    const base = { kms_year: doc.kms_year || '', season: doc.season || '', created_by: username || 'system', linked_entry_id: entryId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

    // --- Party Jama --- what we owe the party for paddy purchase (shows in Cash Transactions)
    const totalAmount = parseFloat(doc.total_amount) || 0;
    const isAgentExtra = doc.source === 'agent_extra';
    if (totalAmount > 0 && !isAgentExtra) {
      const partyJamaDesc = detail ? `Paddy Purchase: ${partyLabel} - ${detail}` : `Paddy Purchase: ${partyLabel} - Rs.${totalAmount}`;
      db.data.cash_transactions.push({
        id: require('crypto').randomUUID(), date, account: 'cash', txn_type: 'jama',
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
      db.data.cash_transactions.push({ id: require('crypto').randomUUID(), date, account: 'cash', txn_type: 'nikasi', category: truckNo, party_type: 'Truck', description: cashDesc, amount: Math.round(cashPaid * 100) / 100, reference: `pvt_paddy_cash:${entryId.slice(0,8)}`, ...base });
      db.data.cash_transactions.push({ id: require('crypto').randomUUID(), date, account: 'ledger', txn_type: 'nikasi', category: truckNo, party_type: 'Truck', description: cashDesc, amount: Math.round(cashPaid * 100) / 100, reference: `pvt_paddy_tcash:${entryId.slice(0,8)}`, ...base });
    }
    const dieselPaid = parseFloat(doc.diesel_paid) || 0;
    if (dieselPaid > 0) {
      const dieselDesc = detail ? `${partyLabel} - ${detail}` : `${partyLabel} - Rs.${dieselPaid}`;
      const pumps = db.data.diesel_pumps || [];
      const defPump = pumps.find(p => p.is_default) || { id: 'default', name: 'Default Pump' };
      db.data.diesel_accounts.push({ id: require('crypto').randomUUID(), date, pump_id: defPump.id, pump_name: defPump.name, truck_no: truckNo, agent_name: doc.agent_name || '', mandi_name: mandi, amount: Math.round(dieselPaid * 100) / 100, txn_type: 'debit', description: dieselDesc, ...base });
      if (truckNo) {
        db.data.cash_transactions.push({ id: require('crypto').randomUUID(), date, account: 'ledger', txn_type: 'nikasi', category: truckNo, party_type: 'Truck', description: dieselDesc, amount: Math.round(dieselPaid * 100) / 100, reference: `pvt_paddy_tdiesel:${entryId.slice(0,8)}`, ...base });
      }
    }
    const advancePaid = parseFloat(doc.paid_amount) || 0;
    if (advancePaid > 0) {
      const advDesc = detail ? `Advance - ${detail}` : `Advance - ${partyLabel} - Rs.${advancePaid}`;
      db.data.cash_transactions.push({ id: require('crypto').randomUUID(), date, account: 'cash', txn_type: 'nikasi', category: partyLabel, party_type: 'Pvt Paddy Purchase', description: advDesc, amount: Math.round(advancePaid * 100) / 100, reference: `pvt_paddy_adv:${entryId.slice(0,8)}`, ...base });
    }
  }

  // Helper: Ensure party jama entry exists for a pvt paddy entry
  function _ensurePartyJamaExists(db, doc, username) {
    if (!db.data.cash_transactions) db.data.cash_transactions = [];
    const totalAmt = parseFloat(doc.total_amount) || 0;
    if (totalAmt <= 0 || doc.source === 'agent_extra' || !doc.id) return;
    const ref = `pvt_party_jama:${doc.id.slice(0, 8)}`;
    const exists = db.data.cash_transactions.find(t => t.reference === ref);
    if (exists) return; // Already exists
    const party = doc.party_name || 'Pvt Paddy';
    const qntl = doc.final_qntl || doc.qntl || (doc.kg ? doc.kg / 100 : 0);
    const rate = doc.rate_per_qntl || doc.rate || 0;
    const desc = (qntl && rate) ? `Paddy Purchase: ${party} - ${qntl}Q @ Rs.${rate}/Q = Rs.${totalAmt}` : `Paddy Purchase: ${party} - Rs.${totalAmt}`;
    db.data.cash_transactions.push({
      id: require('crypto').randomUUID(),
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

  // Helper: Delete linked cash book + diesel entries for pvt paddy
  function _deleteCashDieselForPvtPaddy(db, entryId) {
    if (db.data.cash_transactions) db.data.cash_transactions = db.data.cash_transactions.filter(t => {
      if (t.linked_entry_id !== entryId) return true;
      const ref = (t.reference || '');
      // Delete both pvt_paddy_* and pvt_party_jama:* entries
      if (ref.startsWith('pvt_paddy') || ref.startsWith('pvt_party_jama:')) return false;
      return true;
    });
    if (db.data.diesel_accounts) db.data.diesel_accounts = db.data.diesel_accounts.filter(t => t.linked_entry_id !== entryId);
  }

  // Helper: Create cash entries for rice sales (Auto-receipt)
  function _createCashForRiceSale(db, doc, username) {
    if (!db.data.cash_transactions) db.data.cash_transactions = [];
    const entryId = doc.id;
    const party = doc.party_name || '';
    const date = doc.date || new Date().toISOString().slice(0, 10);
    const amount = parseFloat(doc.paid_amount) || 0;
    const base = { kms_year: doc.kms_year || '', season: doc.season || '', created_by: username || 'system', linked_entry_id: entryId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

    if (amount > 0) {
      const desc = `Rice Sale - ${party} - Rs.${amount}`;
      // Cash Book (Jama = Money In)
      db.data.cash_transactions.push({
        id: require('crypto').randomUUID(), date, account: 'cash', txn_type: 'jama',
        category: party, party_type: 'Rice Sale', description: desc,
        amount: Math.round(amount * 100) / 100,
        reference: `rice_sale_cash:${entryId.slice(0,8)}`,
        ...base
      });
      // Ledger (Jama = Payment Received from Party)
      db.data.cash_transactions.push({
        id: require('crypto').randomUUID(), date, account: 'ledger', txn_type: 'jama',
        category: party, party_type: 'Rice Sale', description: desc,
        amount: Math.round(amount * 100) / 100,
        reference: `rice_sale_lcash:${entryId.slice(0,8)}`,
        ...base
      });
    }
  }

  // Helper: Delete linked cash entries for rice sales
  function _deleteCashForRiceSale(db, entryId) {
    if (db.data.cash_transactions) {
      db.data.cash_transactions = db.data.cash_transactions.filter(t => 
        !(t.linked_entry_id === entryId && (t.reference || '').startsWith('rice_sale_'))
      );
    }
  }


  function calcPaddyAutoDesktop(d) {
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

  // ===== PRIVATE PADDY =====
  router.post('/api/private-paddy', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { d[f] = parseFloat(d[f]) || 0; });
    d.bag = parseInt(d.bag) || 0; d.plastic_bag = parseInt(d.plastic_bag) || 0;
    calcPaddyAutoDesktop(d);
    database.data.private_paddy.push(d);
    // Auto cash book + diesel entries
    try { _createCashDieselForPvtPaddy(database, d, req.query.username || ''); } catch(e) { console.error('[PvtPaddy] _createCashDieselForPvtPaddy error:', e); }
    // SAFETY NET: Always ensure party jama entry exists even if above function failed
    _ensurePartyJamaExists(database, d, req.query.username || '');
    database.save(); res.json(d);
  }));

  router.get('/api/private-paddy', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    res.json(items);
  }));

  router.put('/api/private-paddy/:id', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const merged = { ...database.data.private_paddy[idx], ...req.body, updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { merged[f] = parseFloat(merged[f]) || 0; });
    merged.bag = parseInt(merged.bag) || 0; merged.plastic_bag = parseInt(merged.plastic_bag) || 0;
    calcPaddyAutoDesktop(merged);
    database.data.private_paddy[idx] = merged;
    // Re-create cash book + diesel entries
    _deleteCashDieselForPvtPaddy(database, req.params.id);
    try { _createCashDieselForPvtPaddy(database, merged, req.query.username || ''); } catch(e) { console.error('[PvtPaddy] _createCashDieselForPvtPaddy error:', e); }
    // SAFETY NET: Always ensure party jama entry exists
    _ensurePartyJamaExists(database, merged, req.query.username || '');
    database.save(); res.json(merged);
  }));

  router.delete('/api/private-paddy/:id', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.private_paddy.splice(idx, 1);
    // Delete linked cash book + diesel + truck_payments entries
    _deleteCashDieselForPvtPaddy(database, req.params.id);
    if (database.data.truck_payments) database.data.truck_payments = database.data.truck_payments.filter(t => t.entry_id !== req.params.id);
    database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== RICE SALES =====
  router.post('/api/rice-sales', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.quantity_qntl = parseFloat(d.quantity_qntl) || 0; d.rate_per_qntl = parseFloat(d.rate_per_qntl) || 0;
    d.bags = parseInt(d.bags) || 0; d.paid_amount = parseFloat(d.paid_amount) || 0;
    d.total_amount = Math.round(d.quantity_qntl * d.rate_per_qntl * 100) / 100;
    d.balance = Math.round(d.total_amount - d.paid_amount, 2);
    database.data.rice_sales.push(d);
    _createCashForRiceSale(database, d, req.query.username || '');
    database.save(); res.json(d);
  }));

  router.get('/api/rice-sales', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    res.json(items);
  }));

  router.put('/api/rice-sales/:id', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const merged = { ...database.data.rice_sales[idx], ...req.body, updated_at: new Date().toISOString() };
    merged.quantity_qntl = parseFloat(merged.quantity_qntl) || 0; merged.rate_per_qntl = parseFloat(merged.rate_per_qntl) || 0;
    merged.bags = parseInt(merged.bags) || 0; merged.paid_amount = parseFloat(merged.paid_amount) || 0;
    merged.total_amount = Math.round(merged.quantity_qntl * merged.rate_per_qntl * 100) / 100;
    merged.balance = Math.round(merged.total_amount - merged.paid_amount, 2);
    database.data.rice_sales[idx] = merged;
    _deleteCashForRiceSale(database, req.params.id);
    _createCashForRiceSale(database, merged, req.query.username || '');
    database.save(); res.json(merged);
  }));

  router.delete('/api/rice-sales/:id', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.rice_sales.splice(idx, 1);
    _deleteCashForRiceSale(database, req.params.id);
    database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== PRIVATE PAYMENTS =====
  router.post('/api/private-payments', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    d.amount = parseFloat(d.amount) || 0;
    database.data.private_payments.push(d);
    if (d.ref_type === 'paddy_purchase' && d.ref_id) {
      const entry = (database.data.private_paddy || []).find(e => e.id === d.ref_id);
      if (entry) { entry.paid_amount = Math.round(((entry.paid_amount || 0) + d.amount) * 100) / 100; entry.balance = Math.round((entry.total_amount - entry.paid_amount) * 100) / 100; }
    } else if (d.ref_type === 'rice_sale' && d.ref_id) {
      const entry = (database.data.rice_sales || []).find(e => e.id === d.ref_id);
      if (entry) { entry.paid_amount = Math.round(((entry.paid_amount || 0) + d.amount) * 100) / 100; entry.balance = Math.round((entry.total_amount - entry.paid_amount) * 100) / 100; }
    }
    const account = d.mode === 'bank' ? 'bank' : 'cash';
    const isPaddy = d.ref_type === 'paddy_purchase';
    // Get mandi + qntl/rate from ref entry for party label + description
    let mandi = '', qntl = 0, rate = 0;
    if (isPaddy && d.ref_id) {
      const refEntry = (database.data.private_paddy || []).find(e => e.id === d.ref_id);
      if (refEntry) { mandi = refEntry.mandi_name || ''; qntl = refEntry.qntl || 0; rate = refEntry.rate || ((qntl && refEntry.total_amount) ? Math.round(refEntry.total_amount / qntl * 100) / 100 : 0); }
    }
    const partyLabel = (d.party_name && mandi) ? `${d.party_name} - ${mandi}` : (d.party_name || '');
    const partyType = isPaddy ? 'Pvt Paddy Purchase' : 'Rice Sale';
    const txnType = isPaddy ? 'nikasi' : 'jama';
    const detail = (qntl && rate) ? _fmtDetail(qntl, rate) : `Rs.${d.amount}`;
    const desc = `${partyLabel} - ${detail}`;
    const baseCb = { date: d.date, kms_year: d.kms_year || '', season: d.season || '', created_by: d.created_by, linked_payment_id: d.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const roundOff = parseFloat(req.body.round_off) || 0;
    const totalSettled = Math.round((d.amount + roundOff) * 100) / 100;
    // Cash Book entry - actual cash
    database.data.cash_transactions.push({
      id: require('crypto').randomUUID(), account, txn_type: txnType,
      category: partyLabel, party_type: partyType, description: desc,
      amount: d.amount, reference: d.reference || `pvt_pay:${d.id.substring(0, 8)}`, ...baseCb
    });
    // Party Ledger entry - total including round off
    database.data.cash_transactions.push({
      id: require('crypto').randomUUID(), account: 'ledger', txn_type: txnType,
      category: partyLabel, party_type: partyType,
      description: desc + (roundOff ? ` (Cash: ${d.amount}, RoundOff: ${roundOff})` : ''),
      amount: totalSettled, reference: d.reference || `pvt_pay_ledger:${d.id.substring(0, 8)}`, ...baseCb
    });
    database.save();
    res.json(d);
  }));

  router.get('/api/private-payments', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    const { party_name, ref_type, ref_id, kms_year, season } = req.query;
    let items = [...database.data.private_payments];
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    if (ref_type) items = items.filter(i => i.ref_type === ref_type);
    if (ref_id) items = items.filter(i => i.ref_id === ref_id);
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    res.json(items);
  }));

  router.delete('/api/private-payments/:id', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    const idx = database.data.private_payments.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const pay = database.data.private_payments[idx];
    if (pay.ref_type === 'paddy_purchase' && pay.ref_id) {
      const entry = (database.data.private_paddy || []).find(e => e.id === pay.ref_id);
      if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - pay.amount) * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    } else if (pay.ref_type === 'rice_sale' && pay.ref_id) {
      const entry = (database.data.rice_sales || []).find(e => e.id === pay.ref_id);
      if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - pay.amount) * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    }
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== pay.id);
    }
    database.data.private_payments.splice(idx, 1); database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== PARTY SUMMARY =====
  router.get('/api/private-trading/party-summary', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, date_from, date_to, search } = req.query;
    let paddyItems = [...database.data.private_paddy];
    let riceItems = [...database.data.rice_sales];
    if (kms_year) { paddyItems = paddyItems.filter(i => i.kms_year === kms_year); riceItems = riceItems.filter(i => i.kms_year === kms_year); }
    if (season) { paddyItems = paddyItems.filter(i => i.season === season); riceItems = riceItems.filter(i => i.season === season); }
    if (date_from) { paddyItems = paddyItems.filter(i => (i.date||'') >= date_from); riceItems = riceItems.filter(i => (i.date||'') >= date_from); }
    if (date_to) { paddyItems = paddyItems.filter(i => (i.date||'') <= date_to); riceItems = riceItems.filter(i => (i.date||'') <= date_to); }
    const partyMap = {};
    paddyItems.forEach(p => {
      const name = p.party_name || 'Unknown';
      if (!partyMap[name]) partyMap[name] = { party_name: name, mandi_name: p.mandi_name||'', agent_name: p.agent_name||'', purchase_amount: 0, purchase_paid: 0, purchase_balance: 0, sale_amount: 0, sale_received: 0, sale_balance: 0, net_balance: 0 };
      partyMap[name].purchase_amount += p.total_amount || 0;
      partyMap[name].purchase_paid += p.paid_amount || 0;
      if (!partyMap[name].mandi_name && p.mandi_name) partyMap[name].mandi_name = p.mandi_name;
      if (!partyMap[name].agent_name && p.agent_name) partyMap[name].agent_name = p.agent_name;
    });
    riceItems.forEach(r => {
      const name = r.party_name || 'Unknown';
      if (!partyMap[name]) partyMap[name] = { party_name: name, mandi_name: '', agent_name: '', purchase_amount: 0, purchase_paid: 0, purchase_balance: 0, sale_amount: 0, sale_received: 0, sale_balance: 0, net_balance: 0 };
      partyMap[name].sale_amount += r.total_amount || 0;
      partyMap[name].sale_received += r.paid_amount || 0;
    });
    let result = Object.values(partyMap).map(pm => {
      pm.purchase_amount = Math.round(pm.purchase_amount * 100) / 100;
      pm.purchase_paid = Math.round(pm.purchase_paid * 100) / 100;
      pm.purchase_balance = Math.round((pm.purchase_amount - pm.purchase_paid) * 100) / 100;
      pm.sale_amount = Math.round(pm.sale_amount * 100) / 100;
      pm.sale_received = Math.round(pm.sale_received * 100) / 100;
      pm.sale_balance = Math.round((pm.sale_amount - pm.sale_received) * 100) / 100;
      pm.net_balance = Math.round((pm.purchase_balance - pm.sale_balance) * 100) / 100;
      return pm;
    });
    if (search) { const s = search.toLowerCase(); result = result.filter(r => r.party_name.toLowerCase().includes(s) || r.mandi_name.toLowerCase().includes(s) || r.agent_name.toLowerCase().includes(s)); }
    result.sort((a, b) => Math.abs(b.net_balance) - Math.abs(a.net_balance));
    const totals = {
      total_purchase: Math.round(result.reduce((s, r) => s + r.purchase_amount, 0) * 100) / 100,
      total_purchase_paid: Math.round(result.reduce((s, r) => s + r.purchase_paid, 0) * 100) / 100,
      total_purchase_balance: Math.round(result.reduce((s, r) => s + r.purchase_balance, 0) * 100) / 100,
      total_sale: Math.round(result.reduce((s, r) => s + r.sale_amount, 0) * 100) / 100,
      total_sale_received: Math.round(result.reduce((s, r) => s + r.sale_received, 0) * 100) / 100,
      total_sale_balance: Math.round(result.reduce((s, r) => s + r.sale_balance, 0) * 100) / 100,
      total_net_balance: Math.round(result.reduce((s, r) => s + r.net_balance, 0) * 100) / 100,
    };
    res.json({ parties: result, totals });
  }));

  // ===== PARTY SUMMARY EXCEL =====
  router.get('/api/private-trading/party-summary/excel', safeSync((req, res) => {
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    if (!database.data.private_paddy) database.data.private_paddy = [];
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, date_from, date_to, search } = req.query;
    let paddyItems = [...database.data.private_paddy];
    let riceItems = [...database.data.rice_sales];
    if (kms_year) { paddyItems = paddyItems.filter(i => i.kms_year === kms_year); riceItems = riceItems.filter(i => i.kms_year === kms_year); }
    if (season) { paddyItems = paddyItems.filter(i => i.season === season); riceItems = riceItems.filter(i => i.season === season); }
    if (date_from) { paddyItems = paddyItems.filter(i => (i.date||'') >= date_from); riceItems = riceItems.filter(i => (i.date||'') >= date_from); }
    if (date_to) { paddyItems = paddyItems.filter(i => (i.date||'') <= date_to); riceItems = riceItems.filter(i => (i.date||'') <= date_to); }
    const partyMap = {};
    paddyItems.forEach(p => { const n = p.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: p.mandi_name||'', agent_name: p.agent_name||'', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].purchase_amount += p.total_amount||0; partyMap[n].purchase_paid += p.paid_amount||0; });
    riceItems.forEach(r => { const n = r.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: '', agent_name: '', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].sale_amount += r.total_amount||0; partyMap[n].sale_received += r.paid_amount||0; });
    let result = Object.values(partyMap).map(pm => ({ ...pm, purchase_balance: Math.round((pm.purchase_amount-pm.purchase_paid)*100)/100, sale_balance: Math.round((pm.sale_amount-pm.sale_received)*100)/100, net_balance: Math.round(((pm.purchase_amount-pm.purchase_paid)-(pm.sale_amount-pm.sale_received))*100)/100 }));
    if (search) { const s = search.toLowerCase(); result = result.filter(r => r.party_name.toLowerCase().includes(s)); }
    result.sort((a,b) => Math.abs(b.net_balance) - Math.abs(a.net_balance));
    const cols = getColumns('party_summary_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Summary');
    let title = 'Party-wise Summary'; if (kms_year) title += ` | KMS: ${kms_year}`;
    addExcelTitle(ws, title, cols.length, database);
    headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    const totals = { total_purchase: 0, total_purchase_paid: 0, total_purchase_balance: 0, total_sale: 0, total_sale_received: 0, total_sale_balance: 0, total_net_balance: 0 };
    result.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(5+idx, ci+1).value = v);
      totals.total_purchase += item.purchase_amount||0; totals.total_purchase_paid += item.purchase_paid||0;
      totals.total_purchase_balance += item.purchase_balance||0; totals.total_sale += item.sale_amount||0;
      totals.total_sale_received += item.sale_received||0; totals.total_sale_balance += item.sale_balance||0;
      totals.total_net_balance += item.net_balance||0;
    });
    styleExcelData(ws, 5);
    const trow = 5 + result.length;
    ws.getCell(trow,1).value = 'TOTAL'; ws.getCell(trow,1).font = { bold: true, size: 11 };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v,i) => { if (v !== null) { ws.getCell(trow,i+1).value = v; ws.getCell(trow,i+1).font = { bold: true, size: 11 }; } });
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(trow, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    }
    widths.forEach((w,i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=party_summary.xlsx');
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== PARTY SUMMARY PDF =====
  router.get('/api/private-trading/party-summary/pdf', safeSync((req, res) => {
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHeader, addPdfTable, addTotalsRow, fmtAmt: pFmt } = require('./pdf_helpers');
    const branding = database.getBranding ? database.getBranding() : {};
    if (!database.data.private_paddy) database.data.private_paddy = [];
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let paddyItems = [...database.data.private_paddy];
    let riceItems = [...database.data.rice_sales];
    if (kms_year) { paddyItems = paddyItems.filter(i => i.kms_year === kms_year); riceItems = riceItems.filter(i => i.kms_year === kms_year); }
    if (season) { paddyItems = paddyItems.filter(i => i.season === season); riceItems = riceItems.filter(i => i.season === season); }
    const partyMap = {};
    paddyItems.forEach(p => { const n = p.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: p.mandi_name||'', agent_name: p.agent_name||'', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].purchase_amount += p.total_amount||0; partyMap[n].purchase_paid += p.paid_amount||0; });
    riceItems.forEach(r => { const n = r.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: '', agent_name: '', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].sale_amount += r.total_amount||0; partyMap[n].sale_received += r.paid_amount||0; });
    let result = Object.values(partyMap).map(pm => ({ ...pm, purchase_balance: Math.round((pm.purchase_amount-pm.purchase_paid)*100)/100, sale_balance: Math.round((pm.sale_amount-pm.sale_received)*100)/100, net_balance: Math.round(((pm.purchase_amount-pm.purchase_paid)-(pm.sale_amount-pm.sale_received))*100)/100 }));
    if (search) { const s = search.toLowerCase(); result = result.filter(r => r.party_name.toLowerCase().includes(s)); }
    result.sort((a,b) => Math.abs(b.net_balance) - Math.abs(a.net_balance));
    const cols = getColumns('party_summary_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=party_summary.pdf');
    doc.pipe(res);
    let subtitle = ''; if (kms_year) subtitle = `KMS: ${kms_year}`; if (season) subtitle += ` | ${season}`;
    _addPdfHeader(doc, 'Party-wise Summary', branding, subtitle);
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    const rows = result.map(item => getEntryRow(item, cols).map(v => String(v)));
    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    doc.end();
  }));

  router.get('/api/private-paddy/excel', safeSync((req, res) => {
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(i => (i.party_name||'').toLowerCase().includes(s) || (i.mandi_name||'').toLowerCase().includes(s) || (i.agent_name||'').toLowerCase().includes(s));
    }
    items.forEach(i => { if (!i.final_qntl && i.quantity_qntl) i.final_qntl = i.quantity_qntl; if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('private_paddy_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Pvt Paddy');
    let title = 'Private Paddy Purchase'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    addExcelTitle(ws, title, cols.length, database);
    headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    const totals = { total_kg: 0, total_final_qntl: 0, total_amount: 0, total_paid: 0, total_balance: 0 };
    items.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(5+idx, ci+1).value = v);
      totals.total_kg += item.kg || 0; totals.total_final_qntl += item.final_qntl || 0;
      totals.total_amount += item.total_amount || 0; totals.total_paid += item.paid_amount || 0; totals.total_balance += item.balance || 0;
    });
    Object.keys(totals).forEach(k => totals[k] = Math.round(totals[k]*100)/100);
    styleExcelData(ws, 5);
    const trow = 5 + items.length;
    ws.getCell(trow, 1).value = 'TOTAL'; ws.getCell(trow, 1).font = { bold: true, size: 11 };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i+1).value = v; ws.getCell(trow, i+1).font = { bold: true, size: 11 }; } });
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(trow, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    }
    widths.forEach((w, i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=pvt_paddy.xlsx');
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== EXPORT: Private Paddy PDF =====
  router.get('/api/private-paddy/pdf', safeSync((req, res) => {
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHeader, addPdfTable } = require('./pdf_helpers');
    const branding = database.getBranding ? database.getBranding() : {};
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(i => (i.party_name||'').toLowerCase().includes(s) || (i.mandi_name||'').toLowerCase().includes(s) || (i.agent_name||'').toLowerCase().includes(s));
    }
    items.forEach(i => { if (!i.final_qntl && i.quantity_qntl) i.final_qntl = i.quantity_qntl; if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('private_paddy_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=pvt_paddy.pdf');
    doc.pipe(res);
    let subtitle = ''; if (kms_year) subtitle = `KMS: ${kms_year}`; if (season) subtitle += ` | ${season}`;
    _addPdfHeader(doc, 'Private Paddy Purchase', branding, subtitle);
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    const rows = items.map(item => getEntryRow(item, cols).map(v => String(v)));
    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    doc.end();
  }));

  // ===== EXPORT: Rice Sales Excel =====
  router.get('/api/rice-sales/excel', safeSync((req, res) => {
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) { const s = search.toLowerCase(); items = items.filter(i => (i.party_name||'').toLowerCase().includes(s)); }
    items.forEach(i => { if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('rice_sales_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Rice Sales');
    let title = 'Rice Sales Report'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    addExcelTitle(ws, title, cols.length, database);
    headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    const totals = { total_qntl: 0, total_amount: 0, total_paid: 0, total_balance: 0 };
    items.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(5+idx, ci+1).value = v);
      totals.total_qntl += item.quantity_qntl || 0; totals.total_amount += item.total_amount || 0;
      totals.total_paid += item.paid_amount || 0; totals.total_balance += item.balance || 0;
    });
    Object.keys(totals).forEach(k => totals[k] = Math.round(totals[k]*100)/100);
    styleExcelData(ws, 5);
    const trow = 5 + items.length;
    ws.getCell(trow, 1).value = 'TOTAL'; ws.getCell(trow, 1).font = { bold: true, size: 11 };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i+1).value = v; ws.getCell(trow, i+1).font = { bold: true, size: 11 }; } });
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(trow, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    }
    widths.forEach((w, i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=rice_sales.xlsx');
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== EXPORT: Rice Sales PDF =====
  router.get('/api/rice-sales/pdf', safeSync((req, res) => {
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHeader, addPdfTable } = require('./pdf_helpers');
    const branding = database.getBranding ? database.getBranding() : {};
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) { const s = search.toLowerCase(); items = items.filter(i => (i.party_name||'').toLowerCase().includes(s)); }
    items.forEach(i => { if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('rice_sales_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=rice_sales.pdf');
    doc.pipe(res);
    let subtitle = ''; if (kms_year) subtitle = `KMS: ${kms_year}`; if (season) subtitle += ` | ${season}`;
    _addPdfHeader(doc, 'Rice Sales Report', branding, subtitle);
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    const rows = items.map(item => getEntryRow(item, cols).map(v => String(v)));
    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    doc.end();
  }));

  // === Mark Paid / Undo Paid / History for Private Paddy ===
  router.post('/api/private-paddy/:id/mark-paid', safeSync((req, res) => {
    if (!database.data.private_paddy) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.private_paddy.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    item.is_paid = true;
    item.paid_at = new Date().toISOString();
    item.paid_by = req.query.username || '';
    database.save();
    res.json({ message: 'Marked as paid', id: req.params.id });
  }));

  router.post('/api/private-paddy/:id/undo-paid', safeSync((req, res) => {
    if (!database.data.private_paddy) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.private_paddy.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    item.is_paid = false;
    item.paid_at = null;
    item.paid_by = null;
    database.save();
    res.json({ message: 'Payment undone', id: req.params.id });
  }));

  router.get('/api/private-paddy/:id/history', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const payments = database.data.cash_transactions.filter(t =>
      (t.reference || '').includes(req.params.id.slice(0, 8)) || (t.reference || '').includes(`pvt_paddy`)
    );
    res.json(payments);
  }));

  // === Mark Paid / Undo Paid / History for Rice Sales ===
  router.post('/api/rice-sales/:id/mark-paid', safeSync((req, res) => {
    if (!database.data.rice_sales) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.rice_sales.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    item.is_paid = true;
    item.paid_at = new Date().toISOString();
    item.paid_by = req.query.username || '';
    database.save();
    res.json({ message: 'Marked as paid', id: req.params.id });
  }));

  router.post('/api/rice-sales/:id/undo-paid', safeSync((req, res) => {
    if (!database.data.rice_sales) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.rice_sales.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    item.is_paid = false;
    item.paid_at = null;
    item.paid_by = null;
    database.save();
    res.json({ message: 'Payment undone', id: req.params.id });
  }));

  router.get('/api/rice-sales/:id/history', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const payments = database.data.cash_transactions.filter(t =>
      (t.reference || '').includes(req.params.id.slice(0, 8)) || (t.reference || '').includes(`rice_sale`)
    );
    res.json(payments);
  }));

  return router;
};
