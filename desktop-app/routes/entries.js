const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeSync } = require('./safe_handler');
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
    const result = { rst_exists: false, tp_exists: false, rst_entry: null, tp_entry: null };
    if (rst_no.trim()) {
      const found = (database.data.entries || []).find(e => String(e.rst_no) === rst_no.trim() && e.kms_year === kms_year && e.id !== exclude_id);
      if (found) { result.rst_exists = true; result.rst_entry = `RST #${rst_no} - ${found.truck_no || ''}`; }
    }
    if (tp_no.trim()) {
      const found = (database.data.entries || []).find(e => String(e.tp_no || '') === tp_no.trim() && e.kms_year === kms_year && e.id !== exclude_id);
      if (found) { result.tp_exists = true; result.tp_entry = `RST #${found.rst_no || '?'} - ${found.truck_no || ''}`; }
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
      if (existing) return res.status(400).json({ detail: `RST #${rst} se entry pehle se hai is FY (${kms}) mein. Duplicate RST allowed nahi hai.` });
    }
    // Duplicate TP check
    const tp = String(req.body.tp_no || '').trim();
    if (tp) {
      const existingTp = (database.data.entries || []).find(e => String(e.tp_no || '') === tp && e.kms_year === kms);
      if (existingTp) return res.status(400).json({ detail: `TP No. ${tp} pehle se RST #${existingTp.rst_no || '?'} mein added hai. Duplicate TP allowed nahi hai.` });
    }
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
      if (dupRst) return res.status(400).json({ detail: `RST #${rst} pehle se hai is FY mein. Duplicate RST allowed nahi hai.` });
    }
    const tp = String(req.body.tp_no || oldEntry.tp_no || '').trim();
    if (tp) {
      const dupTp = (database.data.entries || []).find(e => String(e.tp_no || '') === tp && e.kms_year === kms && e.id !== req.params.id);
      if (dupTp) return res.status(400).json({ detail: `TP No. ${tp} pehle se RST #${dupTp.rst_no || '?'} mein hai. Duplicate TP allowed nahi hai.` });
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
    const partySet = new Set();
    (database.data.entries || []).forEach(e => { if (e.agent_name) partySet.add(e.agent_name); });
    (database.data.vehicle_weights || []).forEach(e => { if (e.party_name) partySet.add(e.party_name); });
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
    // Create ledger jama entry for agent (so Party Ledger shows what's owed)
    const cutting_qntl = (target.target_qntl || 0) * (target.cutting_percent || 0) / 100;
    const agentAmount = Math.round(((target.target_qntl || 0) * (target.base_rate || 10) + cutting_qntl * (target.cutting_rate != null ? target.cutting_rate : 5)) * 100) / 100;
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    database.data.cash_transactions.push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0],
      account: 'ledger', txn_type: 'jama', category: target.mandi_name,
      party_type: 'Agent', description: `Agent Target: ${target.mandi_name} - ${target.agent_name || ''} (${target.target_qntl}Q)`,
      amount: agentAmount, reference: `agent_target:${target.id.slice(0, 8)}`,
      kms_year: target.kms_year || '', season: target.season || '',
      linked_target_id: target.id,
      created_at: new Date().toISOString()
    });
    database.save();
    res.json(target);
  }));

  router.put('/api/mandi-targets/:id', safeSync(async (req, res) => {
    const target = database.updateMandiTarget(req.params.id, req.body);
    if (target) {
      // Update corresponding ledger jama entry
      const cutting_qntl = (target.target_qntl || 0) * (target.cutting_percent || 0) / 100;
      const agentAmount = Math.round(((target.target_qntl || 0) * (target.base_rate || 10) + cutting_qntl * (target.cutting_rate != null ? target.cutting_rate : 5)) * 100) / 100;
      if (database.data.cash_transactions) {
        const idx = database.data.cash_transactions.findIndex(t => t.linked_target_id === req.params.id);
        if (idx !== -1) {
          database.data.cash_transactions[idx].amount = agentAmount;
          database.data.cash_transactions[idx].description = `Agent Target: ${target.mandi_name} - ${target.agent_name || ''} (${target.target_qntl}Q)`;
          database.data.cash_transactions[idx].updated_at = new Date().toISOString();
        } else {
          database.data.cash_transactions.push({
            id: uuidv4(), date: new Date().toISOString().split('T')[0],
            account: 'ledger', txn_type: 'jama', category: target.mandi_name,
            party_type: 'Agent', description: `Agent Target: ${target.mandi_name} - ${target.agent_name || ''} (${target.target_qntl}Q)`,
            amount: agentAmount, reference: `agent_target:${target.id.slice(0, 8)}`,
            kms_year: target.kms_year || '', season: target.season || '',
            linked_target_id: target.id, created_at: new Date().toISOString()
          });
        }
        database.save();
      }
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
      const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
      return {
        ...target,
        achieved_qntl: Math.round(achieved_qntl * 100) / 100,
        pending_qntl: Math.max(0, target.expected_total - achieved_qntl),
        progress_percent: Math.min(100, (achieved_qntl / target.expected_total) * 100),
        cutting_qntl,
        target_amount: target.target_qntl * (target.base_rate ?? 10),
        cutting_amount: cutting_qntl * (target.cutting_rate ?? 5),
        total_agent_amount: (target.target_qntl * (target.base_rate ?? 10)) + (cutting_qntl * (target.cutting_rate ?? 5))
      };
    });
    res.json(summary);
  }));

  return router;
};
