const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeSync, roundAmount } = require('./safe_handler');
const { cappedTpForCommission } = require('../utils/commission');
const router = express.Router();

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

  // ===== ENTRIES CRUD =====
  router.get('/api/entries', safeSync(async (req, res) => {
    res.json(database.getEntriesPaginated(req.query));
  }));

  // Real-time duplicate check API (MUST be before /:id route)
  router.get('/api/entries/check-duplicate', safeSync(async (req, res) => {
    const { rst_no = '', tp_no = '', kms_year = '', exclude_id = '' } = req.query;
    const result = { rst_exists: false, tp_exists: false, rst_entry: null, tp_entry: null, tp_rst_no: null };
    if (rst_no.trim()) {
      const found = (database.data.entries || []).find(e => String(e.rst_no) === rst_no.trim() && e.kms_year === kms_year && e.id !== exclude_id);
      if (found) { result.rst_exists = true; result.rst_entry = `RST #${rst_no} - ${found.truck_no || ''}`; }
    }
    if (tp_no.trim()) {
      const found = (database.data.entries || []).find(e => String(e.tp_no || '') === tp_no.trim() && e.kms_year === kms_year && e.id !== exclude_id);
      if (found) { result.tp_exists = true; result.tp_rst_no = found.rst_no || '?'; result.tp_entry = `RST #${found.rst_no || '?'} - ${found.truck_no || ''}`; }
    }
    res.json(result);
  }));

  router.get('/api/entries/:id', safeSync(async (req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.id);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  }));

  router.post('/api/entries', safeSync(async (req, res) => {
    // Duplicate RST check
    const rst = String(req.body.rst_no || '').trim();
    const kms = req.body.kms_year || '';
    if (rst) {
      const existing = (database.data.entries || []).find(e => String(e.rst_no) === rst && e.kms_year === kms);
      if (existing) return res.status(400).json({ detail: `RST #${rst} pehle se entry hai` });
    }
    // Duplicate TP check
    const tp = String(req.body.tp_no || '').trim();
    if (tp) {
      const existingTp = (database.data.entries || []).find(e => String(e.tp_no || '') === tp && e.kms_year === kms);
      if (existingTp) return res.status(400).json({ detail: `TP No. ${tp} pehle se entry hai` });
    }
    // Bags mandatory validation
    const totalBags = (parseInt(req.body.bag) || 0) + (parseInt(req.body.plastic_bag) || 0);
    if (totalBags <= 0) return res.status(400).json({ detail: 'Bags khali nahi ho sakta! Gunny Bags ya Plastic Bags daalna zaroori hai' });
    const entry = database.addEntry({ ...req.body, created_by: req.query.username || 'admin' });
    logAudit('mill_entries', entry.id, 'create', req.query.username || 'admin', null, entry);
    res.json(entry);
  }));

  router.put('/api/entries/:id', safeSync(async (req, res) => {
    const oldEntry = database.data.entries.find(e => e.id === req.params.id);
    if (!oldEntry) return res.status(404).json({ detail: 'Entry not found' });
    const oldCopy = { ...oldEntry };
    // Duplicate RST/TP check (exclude self)
    const kms = req.body.kms_year || oldEntry.kms_year || '';
    const rst = String(req.body.rst_no || oldEntry.rst_no || '').trim();
    if (rst) {
      const dupRst = (database.data.entries || []).find(e => String(e.rst_no) === rst && e.kms_year === kms && e.id !== req.params.id);
      if (dupRst) return res.status(400).json({ detail: `RST #${rst} pehle se entry hai` });
    }
    const tp = String(req.body.tp_no || oldEntry.tp_no || '').trim();
    if (tp) {
      const dupTp = (database.data.entries || []).find(e => String(e.tp_no || '') === tp && e.kms_year === kms && e.id !== req.params.id);
      if (dupTp) return res.status(400).json({ detail: `TP No. ${tp} pehle se entry hai` });
    }
    const entry = database.updateEntry(req.params.id, req.body);
    if (entry && entry._conflict) return res.status(409).json({ detail: entry.message });
    if (entry) {
      logAudit('mill_entries', req.params.id, 'update', req.query.username || req.body.username || '', oldCopy, entry);
      res.json(entry);
    } else res.status(404).json({ detail: 'Entry not found' });
  }));

  router.delete('/api/entries/:id', safeSync(async (req, res) => {
    const oldEntry = database.data.entries.find(e => e.id === req.params.id);
    if (oldEntry) logAudit('mill_entries', req.params.id, 'delete', req.query.username || '', oldEntry, null);
    database.deleteEntry(req.params.id);
    res.json({ success: true });
  }));

  router.post('/api/entries/bulk-delete', safeSync(async (req, res) => {
    database.bulkDeleteEntries(req.body.entry_ids);
    res.json({ success: true, deleted: req.body.entry_ids.length });
  }));

  // ===== TOTALS =====
  router.get('/api/totals', safeSync(async (req, res) => {
    res.json(database.getTotals(req.query));
  }));

  // ===== SUGGESTIONS =====
  router.get('/api/suggestions/trucks', safeSync(async (req, res) => {
    // Combine truck_no from mill entries + vehicle_no from vehicle_weights
    const truckSet = new Set();
    (database.data.entries || []).forEach(e => { if (e.truck_no) truckSet.add(e.truck_no); });
    (database.data.vehicle_weights || []).forEach(e => { if (e.vehicle_no) truckSet.add(e.vehicle_no); });
    let suggestions = Array.from(truckSet).sort();
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/agents', safeSync(async (req, res) => {
    // Combine agent_name from mill entries + party_name from vehicle_weights
    // Supports reverse-filter: if mandi_name given, only return agents linked to that mandi
    const mandi_name = req.query.mandi_name || '';
    const partySet = new Set();
    (database.data.entries || []).forEach(e => {
      if (!e.agent_name) return;
      if (mandi_name && e.mandi_name !== mandi_name) return;
      partySet.add(e.agent_name);
    });
    (database.data.vehicle_weights || []).forEach(e => {
      if (!e.party_name) return;
      if (mandi_name && e.farmer_name !== mandi_name) return;
      partySet.add(e.party_name);
    });
    let suggestions = Array.from(partySet).sort();
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/mandis', safeSync(async (req, res) => {
    // Combine mandi_name from mill entries + farmer_name from vehicle_weights
    const sourceSet = new Set();
    (database.data.entries || []).forEach(e => { if (e.mandi_name) sourceSet.add(e.mandi_name); });
    (database.data.vehicle_weights || []).forEach(e => { if (e.farmer_name) sourceSet.add(e.farmer_name); });
    let suggestions = Array.from(sourceSet).sort();
    const q = req.query.q || '';
    const agent_name = req.query.agent_name || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    if (agent_name) {
      const agentSources = new Set();
      (database.data.entries || []).filter(e => e.agent_name === agent_name).forEach(e => { if (e.mandi_name) agentSources.add(e.mandi_name); });
      (database.data.vehicle_weights || []).filter(e => e.party_name === agent_name).forEach(e => { if (e.farmer_name) agentSources.add(e.farmer_name); });
      suggestions = suggestions.filter(s => agentSources.has(s));
    }
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/kms_years', safeSync(async (req, res) => {
    res.json({ suggestions: database.getSuggestions('kms_year') });
  }));

  // ===== MANDI TARGETS =====
  router.get('/api/mandi-targets', safeSync(async (req, res) => {
    res.json(database.getMandiTargets(req.query));
  }));

  router.post('/api/mandi-targets', safeSync(async (req, res) => {
    const target = database.addMandiTarget({ ...req.body, created_by: req.query.username || 'admin' });
    database.recomputeAgentLedger(target.mandi_name, target.kms_year || '', target.season || '', req.query.username || 'admin');
    database.save();
    res.json(target);
  }));

  router.put('/api/mandi-targets/:id', safeSync(async (req, res) => {
    const old = (database.data.mandi_targets || []).find(t => t.id === req.params.id);
    const target = database.updateMandiTarget(req.params.id, req.body);
    if (target) {
      if (database.data.cash_transactions) {
        const before = database.data.cash_transactions.length;
        database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_target_id !== req.params.id || (t.reference || '').startsWith('agent_mandi:'));
        if (database.data.cash_transactions.length !== before) database.save();
      }
      if (old && (old.mandi_name !== target.mandi_name || (old.kms_year || '') !== (target.kms_year || '') || (old.season || '') !== (target.season || ''))) {
        database.recomputeAgentLedger(old.mandi_name, old.kms_year || '', old.season || '', req.query.username || 'admin');
      }
      database.recomputeAgentLedger(target.mandi_name, target.kms_year || '', target.season || '', req.query.username || 'admin');
      database.save();
      res.json(target);
    } else res.status(404).json({ detail: 'Target not found' });
  }));

  router.delete('/api/mandi-targets/:id', safeSync(async (req, res) => {
    // Delete corresponding ledger jama entry
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_target_id !== req.params.id);
    }
    database.deleteMandiTarget(req.params.id);
    res.json({ success: true });
  }));

  router.get('/api/mandi-targets/summary', safeSync(async (req, res) => {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    const summary = targets.map(target => {
      const mandiEntries = entries.filter(e => (e.mandi_name||'').toLowerCase() === (target.mandi_name||'').toLowerCase());
      const achieved_qntl = mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0);
      const tp_weight_qntl = mandiEntries.reduce((sum, e) => sum + parseFloat(e.tp_weight || 0), 0);
      // Payment based on TP Weight, capped at (target + cutting%) — extra is Pvt Purchase
      const cappedTp = cappedTpForCommission(tp_weight_qntl, target.target_qntl, target.cutting_percent);
      const cutting_qntl = cappedTp * (target.cutting_percent || 0) / 100;
      return {
        ...target,
        achieved_qntl: Math.round(achieved_qntl * 100) / 100,
        pending_qntl: Math.max(0, target.expected_total - achieved_qntl),
        progress_percent: Math.min(100, (achieved_qntl / target.expected_total) * 100),
        cutting_qntl,
        target_amount: cappedTp * (target.base_rate ?? 10),
        cutting_amount: cutting_qntl * (target.cutting_rate ?? 5),
        total_agent_amount: (cappedTp * (target.base_rate ?? 10)) + (cutting_qntl * (target.cutting_rate ?? 5))
      };
    });
    res.json(summary);
  }));

  // Recalculate all entries (batch update for formula changes)
  router.post('/api/entries/recalculate-all', safeSync(async (req, res) => {
    const { username, role } = req.query;
    if (role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { v4: uuidv4 } = require('uuid');
    const entries = database.data.entries || [];
    const txns = database.data.cash_transactions = database.data.cash_transactions || [];

    // === Step 1: Recalculate entry-level fields (mill_w, p_pkt_cut, moisture, cutting, final_w) ===
    let entriesUpdated = 0;
    for (const entry of entries) {
      const oldMillW = entry.mill_w || 0;
      const recalced = database.calculateFields(entry);
      if (Math.abs(oldMillW - recalced.mill_w) > 0.01) {
        Object.assign(entry, recalced);
        entriesUpdated++;
      }
    }

    let ledgersCreated = 0, ledgersUpdated = 0, ledgersRemoved = 0;

    // Helper: sync amount of an EXISTING ledger entry, or remove if expected ≤ 0.
    // (Does NOT auto-create — we only re-sync amounts where the original creation logic put them.)
    const syncRefAmount = (refExact, expectedAmount) => {
      const idx = txns.findIndex(t => (t.reference || '') === refExact);
      if (idx === -1) return;
      const exp = Number(expectedAmount) || 0;
      if (exp > 0) {
        if (Math.abs((txns[idx].amount || 0) - exp) > 0.01) {
          txns[idx].amount = Math.round(exp * 100) / 100;
          txns[idx].updated_at = new Date().toISOString();
          ledgersUpdated++;
        }
      } else {
        txns.splice(idx, 1);
        ledgersRemoved++;
      }
    };

    // === Step 2: Sync truck_entry: ledger (mill entry × truck rate) — full lifecycle ===
    for (const e of entries) {
      const truckNo = e.truck_no || '';
      const finalQntl = Math.round(((e.qntl || 0) - (e.bag || 0) / 100) * 100) / 100;
      const tp = database.data.truck_payments.find(p => p.entry_id === e.id);
      const rate = tp ? (parseFloat(tp.rate_per_qntl) || 0) : 0;
      const cashTaken = parseFloat(e.cash_paid) || 0;
      const dieselTaken = parseFloat(e.diesel_paid) || 0;
      const deductions = cashTaken + dieselTaken;
      const jamaIdx = txns.findIndex(t => t.linked_entry_id === e.id && (t.reference || '').startsWith('truck_entry:'));

      if (finalQntl > 0 && truckNo && rate > 0) {
        const newGross = Math.round(finalQntl * rate * 100) / 100;
        const description = `Truck Entry: ${truckNo} - ${finalQntl}Q @ Rs.${rate}` + (deductions > 0 ? ` (Ded: Rs.${deductions})` : '');
        if (jamaIdx !== -1) {
          const existing = txns[jamaIdx];
          if (Math.abs((existing.amount || 0) - newGross) > 0.01 || existing.description !== description) {
            existing.amount = newGross;
            existing.description = description;
            existing.updated_at = new Date().toISOString();
            ledgersUpdated++;
          }
        } else {
          const now = new Date().toISOString();
          txns.push({
            id: uuidv4(), date: e.date || now.split('T')[0],
            account: 'ledger', txn_type: 'jama', category: truckNo, party_type: 'Truck',
            description, amount: newGross,
            reference: `truck_entry:${e.id.slice(0, 8)}`,
            kms_year: e.kms_year || '', season: e.season || '',
            created_by: username || 'system', linked_entry_id: e.id,
            created_at: now, updated_at: now
          });
          ledgersCreated++;
        }
      } else if (jamaIdx !== -1) {
        txns.splice(jamaIdx, 1);
        ledgersRemoved++;
      }
    }

    // === Step 3: Sync Purchase Voucher (Pvt Purchase) ledgers ===
    for (const d of (database.data.purchase_vouchers || [])) {
      const id = d.id;
      syncRefAmount(`purchase_voucher:${id}`, d.total);
      syncRefAmount(`purchase_voucher_adv:${id}`, d.advance);
      syncRefAmount(`purchase_voucher_adv_cash:${id}`, d.advance);
      syncRefAmount(`purchase_voucher_cash:${id}`, d.cash_paid);
      syncRefAmount(`purchase_voucher_diesel:${id}`, d.diesel_paid);
      syncRefAmount(`purchase_truck_cash:${id}`, d.cash_paid);
      syncRefAmount(`purchase_truck_diesel:${id}`, d.diesel_paid);
    }

    // === Step 4: Sync Sale Voucher (Sale truck) ledgers ===
    for (const d of (database.data.sale_vouchers || [])) {
      const id = d.id;
      syncRefAmount(`sale_voucher:${id}`, d.total);
      syncRefAmount(`sale_voucher_adv:${id}`, d.advance);
      syncRefAmount(`sale_voucher_adv_cash:${id}`, d.advance);
      syncRefAmount(`sale_voucher_cash:${id}`, d.cash_paid);
      syncRefAmount(`sale_voucher_diesel:${id}`, d.diesel_paid);
      syncRefAmount(`sale_truck_cash:${id}`, d.cash_paid);
      syncRefAmount(`sale_truck_diesel:${id}`, d.diesel_paid);
    }

    // === Step 5: Sync BP Sale ledgers ===
    for (const d of (database.data.bp_sale_register || [])) {
      const id = d.id;
      syncRefAmount(`bp_sale:${id}`, d.total);
      syncRefAmount(`bp_sale_adv:${id}`, d.advance);
      syncRefAmount(`bp_sale_adv_cash:${id}`, d.advance);
      syncRefAmount(`bp_sale_cash:${id}`, d.cash_paid);
      syncRefAmount(`bp_sale_diesel:${id}`, d.diesel_paid);
    }

    // === Step 6: Sync DC Delivery ledgers (uses .slice(0,8) ID prefix) ===
    for (const del of (database.data.dc_deliveries || [])) {
      const idShort = (del.id || '').slice(0, 8);
      syncRefAmount(`delivery:${idShort}`, del.cash_paid);
      syncRefAmount(`delivery_tcash:${idShort}`, del.cash_paid);
      syncRefAmount(`delivery_tdiesel:${idShort}`, del.diesel_paid);
      syncRefAmount(`delivery_jama:${idShort}`, del.diesel_paid);
      syncRefAmount(`delivery_depot:${idShort}`, del.depot_expenses);
    }

    if (entriesUpdated > 0 || ledgersCreated > 0 || ledgersUpdated > 0 || ledgersRemoved > 0) database.save();
    res.json({
      success: true,
      total: entries.length,
      updated: entriesUpdated,
      ledgers_created: ledgersCreated,
      ledgers_updated: ledgersUpdated,
      ledgers_removed: ledgersRemoved
    });
  }));

  return router;
};
