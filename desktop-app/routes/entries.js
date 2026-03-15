const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeSync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

  // ===== ENTRIES CRUD =====
  router.get('/api/entries', safeSync((req, res) => {
    res.json(database.getEntries(req.query));
  }));

  router.get('/api/entries/:id', safeSync((req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.id);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  }));

  router.post('/api/entries', safeSync((req, res) => {
    const entry = database.addEntry({ ...req.body, created_by: req.query.username || 'admin' });
    res.json(entry);
  }));

  router.put('/api/entries/:id', safeSync((req, res) => {
    const entry = database.updateEntry(req.params.id, req.body);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  }));

  router.delete('/api/entries/:id', safeSync((req, res) => {
    database.deleteEntry(req.params.id);
    res.json({ success: true });
  }));

  router.post('/api/entries/bulk-delete', safeSync((req, res) => {
    database.bulkDeleteEntries(req.body.entry_ids);
    res.json({ success: true, deleted: req.body.entry_ids.length });
  }));

  // ===== TOTALS =====
  router.get('/api/totals', safeSync((req, res) => {
    res.json(database.getTotals(req.query));
  }));

  // ===== SUGGESTIONS =====
  router.get('/api/suggestions/trucks', safeSync((req, res) => {
    let suggestions = database.getSuggestions('truck_no');
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/agents', safeSync((req, res) => {
    let suggestions = database.getSuggestions('agent_name');
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/mandis', safeSync((req, res) => {
    let suggestions = database.getSuggestions('mandi_name');
    const q = req.query.q || '';
    const agent_name = req.query.agent_name || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    if (agent_name) {
      const agentMandis = new Set();
      database.data.entries.filter(e => e.agent_name === agent_name).forEach(e => { if (e.mandi_name) agentMandis.add(e.mandi_name); });
      suggestions = suggestions.filter(s => agentMandis.has(s));
    }
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/kms_years', safeSync((req, res) => {
    res.json({ suggestions: database.getSuggestions('kms_year') });
  }));

  // ===== MANDI TARGETS =====
  router.get('/api/mandi-targets', safeSync((req, res) => {
    res.json(database.getMandiTargets(req.query));
  }));

  router.post('/api/mandi-targets', safeSync((req, res) => {
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

  router.put('/api/mandi-targets/:id', safeSync((req, res) => {
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

  router.delete('/api/mandi-targets/:id', safeSync((req, res) => {
    // Delete corresponding ledger jama entry
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_target_id !== req.params.id);
    }
    database.deleteMandiTarget(req.params.id);
    res.json({ success: true });
  }));

  router.get('/api/mandi-targets/summary', safeSync((req, res) => {
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
