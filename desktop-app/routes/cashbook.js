const express = require('express');
const { safeAsync, safeSync, roundAmount } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, addTotalsRow, fmtDate, fmtAmt: pFmt, safePdfPipe} = require('./pdf_helpers');
const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
const { getColumns, getEntryRow, getTotalRow, getExcelHeaders, getExcelWidths, getPdfHeaders, getPdfWidthsMm, colCount } = require('../shared/report_helper');
const { autoDetectPartyType, retroFixPartyType, createCashTxnSideEffects, deleteCashTxnSideEffects } = require('../shared/cashbook-service');

module.exports = function(database) {

  const logAudit = (collection, recordId, action, username, oldData, newData, summary) => {
    if (!database.data.audit_log) database.data.audit_log = [];
    const changes = {};
    const skipKeys = new Set(['_id', '_v', 'updated_at', 'created_at']);
    if (action === 'update' && oldData && newData) {
      for (const key of new Set([...Object.keys(oldData), ...Object.keys(newData)])) {
        if (skipKeys.has(key)) continue;
        if (oldData[key] !== newData[key]) changes[key] = { old: oldData[key], new: newData[key] };
      }
      if (Object.keys(changes).length === 0) return;
    }
    if (action === 'create' && newData) {
      for (const key of ['truck_no', 'party_name', 'amount', 'kg', 'bag', 'category', 'description']) {
        if (newData[key]) changes[key] = { new: newData[key] };
      }
    }
    if (action === 'delete' && oldData) {
      for (const key of ['truck_no', 'party_name', 'amount', 'kg', 'bag', 'category', 'description']) {
        if (oldData[key]) changes[key] = { old: oldData[key] };
      }
    }
    if (!summary) {
      if (action === 'create') summary = `${username} ne naya record banaya`;
      else if (action === 'delete') summary = `${username} ne record delete kiya`;
      else if (action === 'update') {
        const parts = Object.entries(changes).slice(0, 3).map(([k, v]) => v.old !== undefined && v.new !== undefined ? `${k}: ${v.old} → ${v.new}` : k);
        summary = `${username} ne ${parts.join(', ')} change kiya`;
      }
    }
    database.data.audit_log.push({
      id: require('crypto').randomUUID(), collection, record_id: String(recordId), action,
      changes, username: username || 'system', summary: summary || '',
      timestamp: new Date().toISOString()
    });
    database.save();
  };

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding);
  }

  router.post('/api/cash-book', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = req.body;
    const category = (d.category || '').trim();
    
    // Auto-detect party_type using shared service
    let partyType = d.party_type || '';
    if (!partyType && category) {
      partyType = autoDetectPartyType(database, category);
      retroFixPartyType(database, category, partyType);
    }
    
    const txn = { id: uuidv4(), date: d.date, account: d.account || 'cash', txn_type: d.txn_type || 'jama',
      category: category, party_type: partyType, description: d.description || '', amount: +(d.amount || 0),
      reference: d.reference || '', bank_name: d.bank_name || '', kms_year: d.kms_year || '', season: d.season || '',
      _v: 1, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.cash_transactions.push(txn);
    
    const roundOff = parseFloat(req.query.round_off) || 0;
    createCashTxnSideEffects(database, txn, roundOff, req.query.username);
    
    logAudit('cash_transactions', txn.id, 'create', req.query.username || '', null, txn);
    database.save(); res.json(txn);
  }));

  router.get('/api/cash-book', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    if (req.query.txn_type) txns = txns.filter(t => t.txn_type === req.query.txn_type);
    if (req.query.category) txns = txns.filter(t => t.category === req.query.category);
    if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
    if (req.query.exclude_round_off === 'true' && !req.query.party_type) txns = txns.filter(t => t.party_type !== 'Round Off');
    if (req.query.date_from) txns = txns.filter(t => t.date >= req.query.date_from);
    if (req.query.date_to) txns = txns.filter(t => t.date <= req.query.date_to);
    txns.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    const total = txns.length;
    const pageSize = parseInt(req.query.page_size) || 200;
    const page = parseInt(req.query.page) || 1;
    if (pageSize > 0) {
      const skip = (page - 1) * pageSize;
      txns = txns.slice(skip, skip + pageSize);
    }
    res.json({ transactions: txns, total, page, page_size: pageSize, total_pages: pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1 });
  }));

  router.delete('/api/cash-book/:id', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) return res.status(404).json({ detail: 'Not found' });
    const txn = database.data.cash_transactions.find(t => t.id === req.params.id);
    if (!txn) return res.status(404).json({ detail: 'Not found' });

    logAudit('cash_transactions', req.params.id, 'delete', req.query.username || '', txn, null);

    // Handle all cascading side effects using shared service
    deleteCashTxnSideEffects(database, txn);

    // Delete the transaction itself + its auto-created ledger entry
    const txnIdShort = req.params.id.slice(0, 8);
    database.data.cash_transactions = database.data.cash_transactions.filter(t =>
      t.id !== req.params.id && t.reference !== `auto_ledger:${txnIdShort}`
    );
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  // Opening Balance PUT - MUST be before /:id route to avoid Express route conflict
  router.put('/api/cash-book/opening-balance', safeSync(async (req, res) => {
    const { kms_year, cash, bank, bank_details } = req.body;
    if (!kms_year) return res.status(400).json({ detail: 'kms_year is required' });
    if (!database.data.opening_balances) database.data.opening_balances = [];
    const totalBank = bank_details && Object.keys(bank_details).length > 0
      ? Object.values(bank_details).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      : (parseFloat(bank) || 0);
    const idx = database.data.opening_balances.findIndex(ob => ob.kms_year === kms_year);
    const doc = { kms_year, cash: parseFloat(cash) || 0, bank: roundAmount(totalBank), bank_details: bank_details || {}, updated_at: new Date().toISOString() };
    if (idx >= 0) database.data.opening_balances[idx] = doc;
    else database.data.opening_balances.push(doc);
    database.save();
    res.json(doc);
  }));

  router.put('/api/cash-book/:id', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.cash_transactions.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const current = database.data.cash_transactions[idx];
    const oldCopy = { ...current };
    const body = req.body;
    // Optimistic locking check
    const clientV = body._v;
    delete body._v; delete body._id; delete body.id;
    if (clientV !== undefined && clientV !== null && current._v !== undefined) {
      if (parseInt(clientV) !== current._v) {
        return res.status(409).json({ detail: 'Ye record kisi aur ne update kar diya hai. Data refresh ho raha hai.' });
      }
    }
    body.updated_at = new Date().toISOString();
    body._v = (current._v || 0) + 1;
    if (body.amount) body.amount = roundAmount(parseFloat(body.amount));
    Object.assign(database.data.cash_transactions[idx], body);
    logAudit('cash_transactions', req.params.id, 'update', req.query.username || body.updated_by || '', oldCopy, database.data.cash_transactions[idx]);
    // Update auto-created ledger entry too (keep same txn_type, no reversal)
    const txnIdShort = req.params.id.slice(0, 8);
    const ledgerBody = { ...body };
    delete ledgerBody.account; delete ledgerBody.reference;
    database.data.cash_transactions.forEach((t, i) => {
      if (t.reference === `auto_ledger:${txnIdShort}`) Object.assign(database.data.cash_transactions[i], ledgerBody);
    });
    database.save();
    res.json(database.data.cash_transactions[idx]);
  }));

  router.post('/api/cash-book/delete-bulk', safeSync(async (req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return res.status(400).json({ detail: 'No ids provided' });
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    // Revert hemali payments for any hemali cashbook entries being deleted
    database.data.cash_transactions.filter(t => ids.includes(t.id) && (t.reference || '').startsWith('hemali_payment:')).forEach(txn => {
      const hemaliPid = txn.reference.replace('hemali_payment:', '');
      const hp = (database.data.hemali_payments || []).find(p => p.id === hemaliPid);
      if (hp) { hp.status = 'unpaid'; hp.updated_at = new Date().toISOString(); }
      // Also add hemali ledger refs to be cleaned up
      ids.push(...database.data.cash_transactions.filter(t =>
        t.reference === `hemali_work:${hemaliPid}` || t.reference === `hemali_paid:${hemaliPid}`
      ).map(t => t.id));
      // Remove local party payment entry (keep debit)
      database.data.local_party_accounts = (database.data.local_party_accounts || []).filter(t =>
        t.reference !== `hemali_paid:${hemaliPid}`
      );
    });
    const before = database.data.cash_transactions.length;
    // Collect auto_ledger references for the deleted transactions
    const autoLedgerRefs = ids.map(id => `auto_ledger:${id.slice(0, 8)}`);
    database.data.cash_transactions = database.data.cash_transactions.filter(t =>
      !ids.includes(t.id) && !autoLedgerRefs.includes(t.reference)
    );
    const deleted = before - database.data.cash_transactions.length;
    if (deleted > 0) database.save();
    res.json({ message: `${deleted} transactions deleted`, deleted });
  }));

  // Fix auto_ledger entries that had reversed txn_type
  router.post('/api/cash-book/fix-auto-ledger-direction', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) return res.json({ success: true, fixed_count: 0 });
    let fixed = 0;
    const txns = database.data.cash_transactions;
    const autoLedgers = txns.filter(t => (t.reference || '').startsWith('auto_ledger:'));
    for (const entry of autoLedgers) {
      const origIdPrefix = entry.reference.replace('auto_ledger:', '');
      const original = txns.find(t => t.id.startsWith(origIdPrefix) && (t.account === 'cash' || t.account === 'bank'));
      if (original && original.txn_type !== entry.txn_type) {
        entry.txn_type = original.txn_type;
        fixed++;
      }
    }
    if (fixed > 0) database.save();
    res.json({ success: true, fixed_count: fixed, total_auto_ledger: autoLedgers.length });
  }));


  router.get('/api/cash-book/categories', safeSync(async (req, res) => {
    if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
    res.json([...database.data.cash_book_categories]);
  }));


  // Cleanup round_off entries
  router.post('/api/cash-book/cleanup-round-off-entries', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) return res.json({ success: true, deleted_count: 0 });
    const before = database.data.cash_transactions.length;
    database.data.cash_transactions = database.data.cash_transactions.filter(t => {
      return t.party_type !== 'Round Off' && t.category !== 'Round Off' && !(t.reference || '').startsWith('round_off:');
    });
    const deleted = before - database.data.cash_transactions.length;
    if (deleted > 0) database.save();
    res.json({ success: true, deleted_count: deleted });
  }));

  // Master auto-fix: runs on every app startup to fix ALL data inconsistencies
  router.post('/api/cash-book/auto-fix', safeSync(async (req, res) => {
    const txns = database.data.cash_transactions || [];
    const pvtEntries = database.data.private_paddy || [];
    const fixes = { auto_ledger_direction: 0, round_off_cleaned: 0, pvt_jama_created: 0, duplicate_removed: 0 };

    // 1. Fix auto_ledger direction
    const autoLedgers = txns.filter(t => (t.reference || '').startsWith('auto_ledger:'));
    for (const entry of autoLedgers) {
      const prefix = (entry.reference || '').replace('auto_ledger:', '');
      if (!prefix) continue;
      const original = txns.find(t => t.id && t.id.startsWith(prefix) && (t.account === 'cash' || t.account === 'bank'));
      if (original && original.txn_type !== entry.txn_type) {
        entry.txn_type = original.txn_type;
        fixes.auto_ledger_direction++;
      }
    }

    // 2. Clean up round_off entries
    const before = txns.length;
    database.data.cash_transactions = txns.filter(t =>
      t.party_type !== 'Round Off' && t.category !== 'Round Off' && !(t.reference || '').startsWith('round_off:')
    );
    fixes.round_off_cleaned = before - database.data.cash_transactions.length;

    // 3. Create missing pvt_party_jama entries (including agent_extra)
    for (const pvt of pvtEntries) {
      const totalAmt = parseFloat(pvt.total_amount) || 0;
      if (totalAmt <= 0 || !pvt.id) continue;
      // Fix missing season for agent_extra entries
      if (!pvt.season) {
        pvt.season = 'Kharif';
        fixes.season_fixed = (fixes.season_fixed || 0) + 1;
      }
      // Fix missing qntl/final_qntl fields for agent_extra entries
      if (pvt.source === 'agent_extra' && !pvt.final_qntl && pvt.quantity_qntl) {
        pvt.final_qntl = pvt.quantity_qntl;
        pvt.qntl = pvt.quantity_qntl;
        if (!pvt.kg) pvt.kg = Math.round(pvt.quantity_qntl * 100 * 100) / 100;
        if (!pvt.balance) pvt.balance = roundAmount(totalAmt - (pvt.paid_amount || 0));
        fixes.agent_extra_fields_fixed = (fixes.agent_extra_fields_fixed || 0) + 1;
      }
      const ref = `pvt_party_jama:${pvt.id.slice(0, 8)}`;
      const exists = database.data.cash_transactions.find(t => t.reference === ref);
      if (!exists) {
        const party = pvt.party_name || 'Pvt Paddy';
        const qntl = pvt.qntl || (pvt.kg ? pvt.kg / 100 : 0);
        const rate = pvt.rate_per_qntl || pvt.rate || 0;
        const desc = (qntl && rate) ? `Paddy Purchase: ${party} - ${qntl}Q @ Rs.${rate}/Q = Rs.${totalAmt}` : `Paddy Purchase: ${party} - Rs.${totalAmt}`;
        database.data.cash_transactions.push({
          id: require('crypto').randomUUID(), date: pvt.date || '',
          account: 'ledger', txn_type: 'jama',
          category: party, party_type: 'Pvt Paddy Purchase',
          description: desc, amount: roundAmount(totalAmt), bank_name: '',
          reference: ref,
          kms_year: pvt.kms_year || '', season: pvt.season || 'Kharif',
          created_by: 'auto-fix', linked_entry_id: pvt.id,
          created_at: pvt.created_at || '', updated_at: new Date().toISOString(),
        });
        fixes.pvt_jama_created++;
      }
    }

    // 3b. Fix existing pvt_party_jama entries: ensure they are 'ledger' (NOT 'cash')
    for (const t of database.data.cash_transactions) {
      if ((t.reference || '').startsWith('pvt_party_jama') && t.account === 'cash') {
        t.account = 'ledger';
        fixes.pvt_jama_account_fixed = (fixes.pvt_jama_account_fixed || 0) + 1;
      }
    }

    // 3c. Remove old pvt_party_jama_ledger entries (no longer needed - single ledger entry only)
    const oldLedgerRefs = database.data.cash_transactions.filter(t => (t.reference || '').startsWith('pvt_party_jama_ledger:'));
    if (oldLedgerRefs.length > 0) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => !(t.reference || '').startsWith('pvt_party_jama_ledger:'));
      fixes.old_ledger_removed = oldLedgerRefs.length;
    }

    // 4. Remove duplicate ledger entries
    const seen = new Set();
    const toRemove = [];
    for (const t of database.data.cash_transactions) {
      if (t.account !== 'ledger' || !t.reference) continue;
      const key = `${t.reference}|${t.amount}|${t.date}|${t.category}`;
      if (seen.has(key)) { toRemove.push(t.id); fixes.duplicate_removed++; }
      else seen.add(key);
    }
    if (toRemove.length > 0) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => !toRemove.includes(t.id));
    }

    // 5. Clean orphaned pvt_party_jama entries (paddy entry deleted)
    const pvtIds = new Set(pvtEntries.map(p => p.id));
    const jamaRefs = database.data.cash_transactions.filter(t => (t.reference || '').startsWith('pvt_party_jama:'));
    for (const j of jamaRefs) {
      if (j.linked_entry_id && !pvtIds.has(j.linked_entry_id)) {
        database.data.cash_transactions = database.data.cash_transactions.filter(t => t.id !== j.id);
        fixes.orphan_jama_cleaned = (fixes.orphan_jama_cleaned || 0) + 1;
      }
    }

    // 6. Fix duplicate party names (e.g. "Kridha (Kesinga) - Kesinga" → "Kridha (Kesinga)")
    const allCats = [...new Set(database.data.cash_transactions.map(t => t.category).filter(Boolean))];
    for (const cat of allCats) {
      if (!cat.includes(' - ')) continue;
      const parts = cat.split(' - ');
      const base = parts.slice(0, -1).join(' - ').trim();
      const suffix = parts[parts.length - 1].trim();
      if (suffix && base.toLowerCase().includes(suffix.toLowerCase()) && allCats.includes(base)) {
        database.data.cash_transactions.forEach(t => { if (t.category === cat) t.category = base; });
        fixes.duplicate_party_merged = (fixes.duplicate_party_merged || 0) + 1;
      }
    }

    // 7. Clean orphaned auto_ledger entries (original cash entry was deleted)
    const autoLedgers2 = database.data.cash_transactions.filter(t => (t.reference || '').startsWith('auto_ledger:'));
    const orphanAutoIds = [];
    for (const al of autoLedgers2) {
      const pfx = (al.reference || '').replace('auto_ledger:', '');
      if (!pfx) continue;
      const orig = database.data.cash_transactions.find(t => t.id && t.id.startsWith(pfx) && (t.account === 'cash' || t.account === 'bank'));
      if (!orig) orphanAutoIds.push(al.id);
    }
    if (orphanAutoIds.length > 0) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => !orphanAutoIds.includes(t.id));
      fixes.orphan_auto_ledger_cleaned = orphanAutoIds.length;
    }

    // 8. Recalculate paid_amount/balance/payment_status for all private_paddy
    for (const pvt of pvtEntries) {
      const eid = pvt.id;
      const totalAmt2 = parseFloat(pvt.total_amount) || 0;
      if (!eid || totalAmt2 <= 0) continue;
      let paySum = 0;
      // a. private_payments
      (database.data.private_payments || []).filter(p => p.ref_id === eid && p.ref_type === 'paddy_purchase').forEach(p => { paySum += (parseFloat(p.amount) || 0) + (parseFloat(p.round_off) || 0); });
      // b. advance entries
      database.data.cash_transactions.filter(t => t.linked_entry_id === eid && (t.reference || '').startsWith('pvt_paddy_adv:') && t.account === 'cash').forEach(t => { paySum += parseFloat(t.amount) || 0; });
      // c. mark-paid entries
      database.data.cash_transactions.filter(t => (t.reference || '').startsWith(`mark_paid:${eid.slice(0,8)}`) && t.account === 'cash').forEach(t => { paySum += parseFloat(t.amount) || 0; });
      // d. manual cashbook entries
      database.data.cash_transactions.filter(t => t.cashbook_pvt_linked === eid && (t.account === 'cash' || t.account === 'bank')).forEach(t => { paySum += parseFloat(t.amount) || 0; });
      paySum = roundAmount(paySum);
      const storedPaid = roundAmount(parseFloat(pvt.paid_amount) || 0);
      if (Math.abs(paySum - storedPaid) > 0.5) {
        pvt.paid_amount = paySum;
        pvt.balance = roundAmount(totalAmt2 - paySum);
        pvt.payment_status = paySum >= totalAmt2 ? 'paid' : 'pending';
        fixes.paid_amount_recalculated = (fixes.paid_amount_recalculated || 0) + 1;
      }
    }

    // 9. Clean orphaned private_payments
    const allPvtIds = new Set(pvtEntries.map(p => p.id));
    const riceIds = new Set((database.data.rice_sales || []).map(r => r.id));
    const beforePay = (database.data.private_payments || []).length;
    database.data.private_payments = (database.data.private_payments || []).filter(p => {
      if (!p.ref_id) return true;
      return allPvtIds.has(p.ref_id) || riceIds.has(p.ref_id);
    });
    const orphanPay = beforePay - (database.data.private_payments || []).length;
    if (orphanPay > 0) fixes.orphan_payments_cleaned = orphanPay;

    const total = Object.values(fixes).reduce((s, v) => s + v, 0);
    if (total > 0) database.save();
    res.json({ success: true, total_fixes: total, details: fixes });
  }));


  router.get('/api/cash-book/agent-names', safeSync(async (req, res) => {
    const { kms_year, season } = req.query;
    // Get mandi names from targets
    const targets = (database.data.mandi_targets || []).filter(t => (!kms_year || t.kms_year === kms_year) && (!season || t.season === season));
    const mandiNames = [...new Set(targets.map(t => t.mandi_name).filter(Boolean))].sort();
    // Get unique truck_no and agent_name from entries
    const entries = (database.data.entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const truckNumbers = [...new Set(entries.map(e => e.truck_no).filter(Boolean))].sort();
    const agentNames = [...new Set(entries.map(e => e.agent_name).filter(Boolean))].sort();
    res.json({ mandi_names: mandiNames, truck_numbers: truckNumbers, agent_names: agentNames });
  }));

  router.post('/api/cash-book/categories', safeSync(async (req, res) => {
    if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
    const name = (req.body.name || '').trim();
    const type = req.body.type || '';
    if (!name || !type) return res.status(400).json({ detail: 'Name and type required' });
    if (database.data.cash_book_categories.find(c => c.name === name && c.type === type)) return res.status(400).json({ detail: 'Category already exists' });
    const cat = { id: uuidv4(), name, type, created_at: new Date().toISOString() };
    database.data.cash_book_categories.push(cat); database.save(); res.json(cat);
  }));

  router.delete('/api/cash-book/categories/:id', safeSync(async (req, res) => {
    if (!database.data.cash_book_categories) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.cash_book_categories.length;
    database.data.cash_book_categories = database.data.cash_book_categories.filter(c => c.id !== req.params.id);
    if (database.data.cash_book_categories.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.get('/api/cash-book/summary', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    const kmsYear = req.query.kms_year;
    if (kmsYear) txns = txns.filter(t => t.kms_year === kmsYear);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    // Exclude Round Off entries from cash/bank balance - round off is discount, not actual cash
    const realTxns = txns.filter(t => t.party_type !== 'Round Off');
    const cashIn = +realTxns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const cashOut = +realTxns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankIn = +realTxns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankOut = +realTxns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);

    // Opening balance from previous FY (Tally-style carry forward)
    let openingCash = 0, openingBank = 0;
    if (kmsYear) {
      const parts = kmsYear.split('-');
      if (parts.length === 2) {
        try {
          const prevFy = `${parseInt(parts[0]) - 1}-${parseInt(parts[1]) - 1}`;
          if (!database.data.opening_balances) database.data.opening_balances = [];
          const savedOb = database.data.opening_balances.find(ob => ob.kms_year === kmsYear);
          if (savedOb) {
            openingCash = savedOb.cash || 0;
            openingBank = savedOb.bank || 0;
          } else {
            const prevTxns = database.data.cash_transactions.filter(t => t.kms_year === prevFy);
            const prevReal = prevTxns.filter(t => t.party_type !== 'Round Off');
            const pCashIn = prevReal.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
            const pCashOut = prevReal.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
            const pBankIn = prevReal.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
            const pBankOut = prevReal.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
            const prevOb = database.data.opening_balances.find(ob => ob.kms_year === prevFy);
            if (prevOb) {
              openingCash = +((prevOb.cash || 0) + pCashIn - pCashOut).toFixed(2);
              openingBank = +((prevOb.bank || 0) + pBankIn - pBankOut).toFixed(2);
            } else {
              openingCash = +(pCashIn - pCashOut).toFixed(2);
              openingBank = +(pBankIn - pBankOut).toFixed(2);
            }
          }
        } catch (e) {}
      }
    }

    // Per-bank breakdown for bank account transactions (exclude Round Off)
    const bankTxns = realTxns.filter(t => t.account === 'bank');
    const bankNames = [...new Set(bankTxns.map(t => t.bank_name).filter(Boolean))];
    const bankDetails = {};
    let linkedBankIn = 0, linkedBankOut = 0;
    for (const bn of bankNames) {
      const bIn = +bankTxns.filter(t => t.bank_name === bn && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0).toFixed(2);
      const bOut = +bankTxns.filter(t => t.bank_name === bn && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0).toFixed(2);
      bankDetails[bn] = { in: bIn, out: bOut, balance: +(bIn - bOut).toFixed(2) };
      linkedBankIn += bIn; linkedBankOut += bOut;
    }
    const unlinkedBIn = +(bankIn - linkedBankIn).toFixed(2);
    const unlinkedBOut = +(bankOut - linkedBankOut).toFixed(2);
    if (unlinkedBIn > 0 || unlinkedBOut > 0) {
      bankDetails['Other'] = { in: unlinkedBIn, out: unlinkedBOut, balance: +(unlinkedBIn - unlinkedBOut).toFixed(2) };
    }

    // Get per-bank opening balances
    let openingBankDetails = {};
    if (kmsYear) {
      const savedOb2 = (database.data.opening_balances||[]).find(ob => ob.kms_year === kmsYear);
      if (savedOb2 && savedOb2.bank_details) {
        openingBankDetails = savedOb2.bank_details;
      }
    }
    // Add opening balances per bank
    for (const bn in bankDetails) {
      const obVal = openingBankDetails[bn] || 0;
      bankDetails[bn].opening = obVal;
      bankDetails[bn].balance = +(obVal + bankDetails[bn].in - bankDetails[bn].out).toFixed(2);
    }
    // Add banks that have opening balance but no transactions yet
    for (const bn in openingBankDetails) {
      if (!bankDetails[bn] && (openingBankDetails[bn] || 0) > 0) {
        bankDetails[bn] = { in: 0, out: 0, opening: openingBankDetails[bn], balance: openingBankDetails[bn] };
      }
    }

    res.json({
      opening_cash: openingCash, opening_bank: openingBank,
      opening_bank_details: openingBankDetails,
      cash_in: cashIn, cash_out: cashOut, cash_balance: +(openingCash + cashIn - cashOut).toFixed(2),
      bank_in: bankIn, bank_out: bankOut, bank_balance: +(openingBank + bankIn - bankOut).toFixed(2),
      bank_details: bankDetails,
      total_balance: +((openingCash + cashIn - cashOut) + (openingBank + bankIn - bankOut)).toFixed(2),
      total_transactions: txns.length
    });
  }));

  router.get('/api/cash-book/excel', safeAsync(async (req, res) => {
    try {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      let txns = [...database.data.cash_transactions];
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
      if (req.query.txn_type) txns = txns.filter(t => t.txn_type === req.query.txn_type);
      if (req.query.category) txns = txns.filter(t => t.category === req.query.category);
      if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
      if (req.query.date_from) txns = txns.filter(t => (t.date || '') >= req.query.date_from);
      if (req.query.date_to) txns = txns.filter(t => (t.date || '') <= req.query.date_to);
      txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      
      const cols = getColumns('cashbook_report');
      const headers = getExcelHeaders(cols);
      const widths = getExcelWidths(cols);
      
      // Title with filter info
      const titleParts = ['Daily Cash Book'];
      if (req.query.category) titleParts.push(`- ${req.query.category}`);
      if (req.query.account) titleParts.push(`(${req.query.account})`);
      const exportTitle = titleParts.join(' ');
      
      // Pre-process rows with derived fields
      let runBal = 0;
      const rows = txns.map(t => {
        const jama = t.txn_type === 'jama' ? t.amount : 0;
        const nikasi = t.txn_type === 'nikasi' ? t.amount : 0;
        runBal += jama - nikasi;
        return {
          date: fmtDate(t.date), account_label: t.account === 'ledger' ? 'Ledger' : (t.account === 'cash' ? 'Cash' : 'Bank'),
          type_label: t.txn_type === 'jama' ? 'Jama' : 'Nikasi', category: t.category || '', party_type: t.party_type || '',
          description: t.description || '', jama: t.txn_type === 'jama' ? t.amount : '', nikasi: t.txn_type === 'nikasi' ? t.amount : '',
          balance: +runBal.toFixed(2), reference: t.reference || ''
        };
      });
      
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Cash Book');
      
      // Title with date range
      const { addExcelTitle, styleExcelHeader, styleExcelData } = require('./excel_helpers');
      const dateParts = [];
      if (req.query.date_from) dateParts.push(`From: ${req.query.date_from}`);
      if (req.query.date_to) dateParts.push(`To: ${req.query.date_to}`);
      const dateStr = dateParts.length ? ` | ${dateParts.join(' | ')}` : '';
      
      addExcelTitle(ws, `${exportTitle}${dateStr}`, cols.length, database);
      
      // Headers row 4 (after 3 title rows)
      headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
      styleExcelHeader(ws);
      // Fix header row to row 4
      const hRow = ws.getRow(4);
      hRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
      hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      hRow.height = 30;
      
      // Data rows
      rows.forEach((r, idx) => {
        const vals = getEntryRow(r, cols);
        vals.forEach((v, ci) => ws.getCell(5 + idx, ci + 1).value = v);
      });
      styleExcelData(ws, 5);
      
      // Total row
      const trow = 5 + rows.length;
      const totals = {
        total_jama: +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
        total_nikasi: +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
        closing_balance: +runBal.toFixed(2)
      };
      ws.getCell(trow, 1).value = 'TOTAL / कुल'; ws.getCell(trow, 1).font = { bold: true, size: 11 };
      const totalVals = getTotalRow(totals, cols);
      totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i + 1).value = v; ws.getCell(trow, i + 1).font = { bold: true, size: 11 }; } });
      // Style total row amber
      for (let c = 1; c <= cols.length; c++) {
        const cell = ws.getCell(trow, c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
      }
      widths.forEach((w, i) => ws.getColumn(i + 1).width = w);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/cash-book/pdf', safeSync(async (req, res) => {
    try {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      let txns = [...database.data.cash_transactions];
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
      if (req.query.txn_type) txns = txns.filter(t => t.txn_type === req.query.txn_type);
      if (req.query.category) txns = txns.filter(t => t.category === req.query.category);
      if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
      if (req.query.date_from) txns = txns.filter(t => (t.date || '') >= req.query.date_from);
      if (req.query.date_to) txns = txns.filter(t => (t.date || '') <= req.query.date_to);
      txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const titleParts = ['Daily Cash Book'];
      if (req.query.category) titleParts.push(`- ${req.query.category}`);
      if (req.query.account) titleParts.push(`(${req.query.account})`);
      const exportTitle = titleParts.join(' ');
      
      // Build subtitle with date range
      const subtitleParts = [];
      if (req.query.kms_year) subtitleParts.push(`FY: ${req.query.kms_year}`);
      if (req.query.season) subtitleParts.push(`Season: ${req.query.season}`);
      if (req.query.date_from) subtitleParts.push(`From: ${req.query.date_from}`);
      if (req.query.date_to) subtitleParts.push(`To: ${req.query.date_to}`);
      const subtitle = subtitleParts.join(' | ');
      
      
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe
      
      const brandingData = database.getBranding ? database.getBranding() : {};
      addPdfHeader(doc, exportTitle);
      
      const headers = ['Date', 'Account', 'Type', 'Category', 'Party Type', 'Description', 'Jama (Cr)', 'Nikasi (Dr)', 'Balance'];
      const colW = [55, 50, 40, 60, 55, 120, 60, 60, 60];
      
      // Build data rows with running balance
      let runBal = 0; let totalJama = 0; let totalNikasi = 0;
      const rows = txns.map(t => {
        const jama = t.txn_type === 'jama' ? (t.amount || 0) : 0;
        const nikasi = t.txn_type === 'nikasi' ? (t.amount || 0) : 0;
        runBal += jama - nikasi;
        totalJama += jama; totalNikasi += nikasi;
        return [
          fmtDate(t.date || ''), t.account === 'ledger' ? 'Ledger' : (t.account === 'cash' ? 'Cash' : 'Bank'),
          t.txn_type === 'jama' ? 'Jama' : 'Nikasi', t.category || '', t.party_type || '',
          t.description || '', jama ? pFmt(jama) : '-', nikasi ? pFmt(nikasi) : '-',
          pFmt(+runBal.toFixed(2))
        ];
      });
      
      addPdfTable(doc, headers, rows, colW, { fontSize: 7 });
      addTotalsRow(doc, ['', '', '', '', '', 'TOTAL', pFmt(totalJama), pFmt(totalNikasi), pFmt(+(totalJama - totalNikasi).toFixed(2))], colW, { fontSize: 7 });
      
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== CASH BOOK OPENING BALANCE =====
  router.get('/api/cash-book/opening-balance', safeSync(async (req, res) => {
    const kms_year = req.query.kms_year || '';
    if (!database.data.opening_balances) database.data.opening_balances = [];
    const saved = database.data.opening_balances.find(ob => ob.kms_year === kms_year);
    if (saved) return res.json({ cash: saved.cash || 0, bank: saved.bank || 0, bank_details: saved.bank_details || {}, source: 'manual' });
    const parts = kms_year.split('-');
    if (parts.length === 2) {
      try {
        const prevFy = `${parseInt(parts[0])-1}-${parseInt(parts[1])-1}`;
        const prevTxns = (database.data.cash_transactions || []).filter(t => t.kms_year === prevFy);
        const prevCashIn = prevTxns.filter(t => t.account==='cash' && t.txn_type==='jama').reduce((s,t) => s+(t.amount||0), 0);
        const prevCashOut = prevTxns.filter(t => t.account==='cash' && t.txn_type==='nikasi').reduce((s,t) => s+(t.amount||0), 0);
        const prevBankIn = prevTxns.filter(t => t.account==='bank' && t.txn_type==='jama').reduce((s,t) => s+(t.amount||0), 0);
        const prevBankOut = prevTxns.filter(t => t.account==='bank' && t.txn_type==='nikasi').reduce((s,t) => s+(t.amount||0), 0);
        const prevOb = database.data.opening_balances.find(ob => ob.kms_year === prevFy);
        const obCash = prevOb ? (prevOb.cash || 0) : 0;
        const obBank = prevOb ? (prevOb.bank || 0) : 0;
        return res.json({ cash: +(obCash + prevCashIn - prevCashOut).toFixed(2), bank: +(obBank + prevBankIn - prevBankOut).toFixed(2), bank_details: {}, source: 'auto' });
      } catch(e) {}
    }
    res.json({ cash: 0, bank: 0, bank_details: {}, source: 'none' });
  }));

  // === Party Summary ===
  router.get('/api/cash-book/party-summary', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = database.data.cash_transactions.filter(t => !(t.reference||'').includes('_ledger:'));
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
    const parties = {};
    txns.forEach(t => {
      const name = t.category || 'Unknown';
      if (!parties[name]) parties[name] = { party_name: name, party_type: t.party_type || '', jama: 0, nikasi: 0, txn_count: 0 };
      if (t.txn_type === 'jama') parties[name].jama += t.amount || 0;
      else if (t.txn_type === 'nikasi') parties[name].nikasi += t.amount || 0;
      parties[name].txn_count++;
    });
    // Add opening balances
    const obList = database.data.party_opening_balances || [];
    const ky = req.query.kms_year;
    if (ky) {
      obList.filter(ob => ob.kms_year === ky).forEach(ob => {
        const name = ob.party_name;
        if (!parties[name]) parties[name] = { party_name: name, party_type: ob.party_type || '', jama: 0, nikasi: 0, txn_count: 0 };
        if (ob.balance_type === 'jama') parties[name].jama += parseFloat(ob.amount) || 0;
        else parties[name].nikasi += parseFloat(ob.amount) || 0;
      });
    }
    const result = Object.values(parties).map(p => ({
      ...p, jama: roundAmount(p.jama), nikasi: roundAmount(p.nikasi),
      balance: roundAmount(p.jama - p.nikasi)
    }));
    const statusFilter = req.query.status;
    let filtered = result;
    if (statusFilter === 'jama') filtered = result.filter(p => p.balance > 0);
    else if (statusFilter === 'nikasi') filtered = result.filter(p => p.balance < 0);
    else if (statusFilter === 'settled') filtered = result.filter(p => p.balance === 0);
    filtered.sort((a, b) => a.party_name.localeCompare(b.party_name));
    const settled_count = filtered.filter(p => p.balance === 0).length;
    const pending_count = filtered.filter(p => p.balance !== 0).length;
    const total_outstanding = Math.round(filtered.filter(p => p.balance !== 0).reduce((s, p) => s + p.balance, 0) * 100) / 100;
    res.json({
      parties: filtered,
      summary: {
        total_parties: filtered.length,
        settled_count,
        pending_count,
        total_jama: Math.round(filtered.reduce((s, p) => s + p.jama, 0) * 100) / 100,
        total_nikasi: Math.round(filtered.reduce((s, p) => s + p.nikasi, 0) * 100) / 100,
        total_outstanding
      }
    });
  }));

  router.get('/api/cash-book/party-summary/excel', safeAsync(async (req, res) => {
    try {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      let txns = database.data.cash_transactions.filter(t => !(t.reference||'').includes('_ledger:'));
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
      const parties = {};
      txns.forEach(t => {
        const name = t.category || 'Unknown';
        if (!parties[name]) parties[name] = { party_name: name, party_type: t.party_type || '', jama: 0, nikasi: 0 };
        if (t.txn_type === 'jama') parties[name].jama += t.amount || 0;
        else parties[name].nikasi += t.amount || 0;
      });
      const data = Object.values(parties).map(p => ({ ...p, balance: Math.round((p.jama - p.nikasi) * 100) / 100 }));
      data.sort((a, b) => a.party_name.localeCompare(b.party_name));
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Summary');
      ws.addRow(['Party', 'Type', 'Jama', 'Nikasi', 'Balance']);
      data.forEach(p => ws.addRow([p.party_name, p.party_type, p.jama, p.nikasi, p.balance]));
      ws.columns.forEach(c => c.width = 18);
      const buf = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=party_summary.xlsx`);
      res.send(Buffer.from(buf));
    } catch (e) { res.status(500).json({ detail: e.message }); }
  }));

  router.get('/api/cash-book/party-summary/pdf', safeSync(async (req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = database.data.cash_transactions.filter(t => !(t.reference||'').includes('_ledger:'));
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
    const parties = {};
    txns.forEach(t => {
      const name = t.category || 'Unknown';
      if (!parties[name]) parties[name] = { party_name: name, party_type: t.party_type || '', jama: 0, nikasi: 0 };
      if (t.txn_type === 'jama') parties[name].jama += t.amount || 0;
      else parties[name].nikasi += t.amount || 0;
    });
    const data = Object.values(parties).map(p => ({ ...p, balance: Math.round((p.jama - p.nikasi) * 100) / 100 }));
    data.sort((a, b) => a.party_name.localeCompare(b.party_name));
    const doc = new PDFDocument({ size: 'A4', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=party_summary.pdf`);
    // PDF will be sent via safePdfPipe
    const brandingData = database.getBranding ? database.getBranding() : {};
    let subtitle = '';
    if (req.query.kms_year) subtitle = `FY: ${req.query.kms_year}`;
    if (req.query.season) subtitle += ` | Season: ${req.query.season}`;
    addPdfHeader(doc, 'Party Summary');
    const headers = ['Party Name', 'Type', 'Jama (Cr)', 'Nikasi (Dr)', 'Balance'];
    const colW = [180, 80, 90, 90, 90];
    let tJ = 0, tN = 0;
    const rows = data.map(p => { tJ += p.jama; tN += p.nikasi; return [p.party_name, p.party_type, pFmt(Math.round(p.jama)), pFmt(Math.round(p.nikasi)), pFmt(Math.round(p.balance))]; });
    addPdfTable(doc, headers, rows, colW);
    addTotalsRow(doc, [`TOTAL (${data.length})`, '', pFmt(Math.round(tJ)), pFmt(Math.round(tN)), pFmt(Math.round(tJ - tN))], colW);
    await safePdfPipe(doc, res);
  }));

  // === Opening Balances (party-level) ===
  router.get('/api/opening-balances', safeSync(async (req, res) => {
    if (!database.data.party_opening_balances) database.data.party_opening_balances = [];
    let obs = [...database.data.party_opening_balances];
    if (req.query.kms_year) obs = obs.filter(o => o.kms_year === req.query.kms_year);
    res.json(obs);
  }));

  router.post('/api/opening-balances', safeSync(async (req, res) => {
    if (!database.data.party_opening_balances) database.data.party_opening_balances = [];
    const d = { id: uuidv4(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    database.data.party_opening_balances.push(d);
    database.save();
    res.json(d);
  }));

  router.delete('/api/opening-balances/:id', safeSync(async (req, res) => {
    if (!database.data.party_opening_balances) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.party_opening_balances.length;
    database.data.party_opening_balances = database.data.party_opening_balances.filter(o => o.id !== req.params.id);
    if (database.data.party_opening_balances.length < len) { database.save(); return res.json({ message: 'Deleted' }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  // === GST Settings ===
  router.get('/api/gst-settings', safeSync(async (req, res) => {
    if (!database.data.gst_settings) database.data.gst_settings = { gstin: '', state: '', default_cgst: 9, default_sgst: 9, default_igst: 0 };
    res.json(database.data.gst_settings);
  }));

  router.put('/api/gst-settings', safeSync(async (req, res) => {
    database.data.gst_settings = { ...req.body, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.gst_settings);
  }));

  // === GST Company Settings (used by frontend Settings page) ===
  router.get('/api/gst-company-settings', safeSync(async (req, res) => {
    if (!database.data.gst_company_settings) database.data.gst_company_settings = { company_name: '', gstin: '', address: '', state_code: '21', state_name: 'Odisha', phone: '', bank_name: '', bank_account: '', bank_ifsc: '' };
    res.json(database.data.gst_company_settings);
  }));

  router.put('/api/gst-company-settings', safeSync(async (req, res) => {
    database.data.gst_company_settings = { ...req.body, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.gst_company_settings);
  }));

  return router;
};
