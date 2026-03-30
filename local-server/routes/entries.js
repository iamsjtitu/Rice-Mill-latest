const express = require('express');
const { safeSync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

  // ===== ENTRIES CRUD =====
  router.get('/api/entries', safeSync(async (req, res) => {
    res.json(database.getEntriesPaginated(req.query));
  }));

  router.get('/api/entries/:id', safeSync(async (req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.id);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  }));

  router.post('/api/entries', safeSync(async (req, res) => {
    const entry = database.addEntry({ ...req.body, created_by: req.query.username || 'admin' });
    res.json(entry);
  }));

  router.put('/api/entries/:id', safeSync(async (req, res) => {
    const entry = database.updateEntry(req.params.id, req.body);
    if (entry) res.json(entry);
    else res.status(404).json({ detail: 'Entry not found' });
  }));

  router.delete('/api/entries/:id', safeSync(async (req, res) => {
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
    let suggestions = database.getSuggestions('truck_no');
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/agents', safeSync(async (req, res) => {
    let suggestions = database.getSuggestions('agent_name');
    const q = req.query.q || '';
    if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
    res.json({ suggestions });
  }));

  router.get('/api/suggestions/mandis', safeSync(async (req, res) => {
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

  router.get('/api/suggestions/kms_years', safeSync(async (req, res) => {
    res.json({ suggestions: database.getSuggestions('kms_year') });
  }));

  // ===== MANDI TARGETS =====
  router.get('/api/mandi-targets', safeSync(async (req, res) => {
    res.json(database.getMandiTargets(req.query));
  }));

  router.post('/api/mandi-targets', safeSync(async (req, res) => {
    const target = database.addMandiTarget({ ...req.body, created_by: req.query.username || 'admin' });
    res.json(target);
  }));

  router.put('/api/mandi-targets/:id', safeSync(async (req, res) => {
    const target = database.updateMandiTarget(req.params.id, req.body);
    if (target) res.json(target);
    else res.status(404).json({ detail: 'Target not found' });
  }));

  router.delete('/api/mandi-targets/:id', safeSync(async (req, res) => {
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
