const express = require('express');
const router = express.Router();

module.exports = function(database) {
  // Helper reference
  const ExcelJS = require('exceljs');
  const PDFDocument = require('pdfkit');

// ============ ENTRIES CRUD ============
router.get('/api/', (req, res) => res.json({ message: 'Mill Entry API - Local Server' }));

router.get('/api/entries', (req, res) => res.json(database.getEntries(req.query)));

router.get('/api/entries/:id', (req, res) => {
  const entry = database.data.entries.find(e => e.id === req.params.id);
  if (entry) return res.json(entry);
  res.status(404).json({ detail: 'Entry not found' });
});

router.post('/api/entries', (req, res) => {
  const entry = database.addEntry({ ...req.body, created_by: req.query.username || 'admin' });
  res.json(entry);
});

router.put('/api/entries/:id', (req, res) => {
  // Permission check
  const existing = database.data.entries.find(e => e.id === req.params.id);
  if (!existing) return res.status(404).json({ detail: 'Entry not found' });
  
  const role = req.query.role || '';
  const username = req.query.username || '';
  if (role !== 'admin') {
    if (existing.created_by !== username) {
      return res.status(403).json({ detail: 'Aap sirf apni entry edit kar sakte hain' });
    }
    const created = new Date(existing.created_at);
    if ((Date.now() - created.getTime()) > 5 * 60 * 1000) {
      return res.status(403).json({ detail: '5 minute se zyada ho gaye, ab edit nahi ho sakta' });
    }
  }
  
  const entry = database.updateEntry(req.params.id, req.body);
  if (entry) return res.json(entry);
  res.status(404).json({ detail: 'Entry not found' });
});

router.delete('/api/entries/:id', (req, res) => {
  const existing = database.data.entries.find(e => e.id === req.params.id);
  if (!existing) return res.status(404).json({ detail: 'Entry not found' });
  
  const role = req.query.role || '';
  const username = req.query.username || '';
  if (role !== 'admin') {
    if (existing.created_by !== username) {
      return res.status(403).json({ detail: 'Aap sirf apni entry delete kar sakte hain' });
    }
    const created = new Date(existing.created_at);
    if ((Date.now() - created.getTime()) > 5 * 60 * 1000) {
      return res.status(403).json({ detail: '5 minute se zyada ho gaye, ab delete nahi ho sakta' });
    }
  }
  
  database.deleteEntry(req.params.id);
  res.json({ message: 'Entry deleted successfully' });
});

router.post('/api/entries/bulk-delete', (req, res) => {
  const ids = req.body.entry_ids || req.body;
  database.bulkDeleteEntries(Array.isArray(ids) ? ids : []);
  res.json({ message: 'Entries deleted', deleted_count: Array.isArray(ids) ? ids.length : 0 });
});

// ============ TOTALS ============
router.get('/api/totals', (req, res) => res.json(database.getTotals(req.query)));

// ============ SUGGESTIONS ============
router.get('/api/suggestions/trucks', (req, res) => {
  let suggestions = database.getSuggestions('truck_no');
  const q = req.query.q || '';
  if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
  res.json({ suggestions });
});

router.get('/api/suggestions/agents', (req, res) => {
  let suggestions = database.getSuggestions('agent_name');
  const q = req.query.q || '';
  if (q) suggestions = suggestions.filter(s => s.toLowerCase().includes(q.toLowerCase()));
  res.json({ suggestions });
});

router.get('/api/suggestions/mandis', (req, res) => {
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
});

router.get('/api/suggestions/kms_years', (req, res) => {
  res.json({ suggestions: database.getSuggestions('kms_year') });
});

// ============ MANDI TARGETS ============
router.get('/api/mandi-targets', (req, res) => res.json(database.getMandiTargets(req.query)));

router.post('/api/mandi-targets', (req, res) => {
  const result = database.addMandiTarget({ ...req.body, created_by: req.query.username || 'admin' });
  if (result.error) return res.status(400).json({ detail: result.error });
  res.json(result);
});

router.put('/api/mandi-targets/:id', (req, res) => {
  const target = database.updateMandiTarget(req.params.id, req.body);
  if (target) return res.json(target);
  res.status(404).json({ detail: 'Target not found' });
});

router.delete('/api/mandi-targets/:id', (req, res) => {
  database.deleteMandiTarget(req.params.id);
  res.json({ message: 'Target deleted successfully' });
});

router.get('/api/mandi-targets/summary', (req, res) => {
  const targets = database.getMandiTargets(req.query);
  const entries = database.getEntries(req.query);
  
  const summary = targets.map(target => {
    const mandiEntries = entries.filter(e => e.mandi_name === target.mandi_name);
    const achieved_qntl = Math.round(mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0) * 100) / 100;
    const cutting_qntl = Math.round(target.target_qntl * target.cutting_percent / 100 * 100) / 100;
    const base_rate = target.base_rate ?? 10;
    const cutting_rate = target.cutting_rate ?? 5;
    const target_amount = Math.round(target.target_qntl * base_rate * 100) / 100;
    const cutting_amount = Math.round(cutting_qntl * cutting_rate * 100) / 100;
    
    return {
      ...target,
      achieved_qntl,
      pending_qntl: Math.round(Math.max(0, target.expected_total - achieved_qntl) * 100) / 100,
      progress_percent: Math.round(Math.min(100, (achieved_qntl / (target.expected_total || 1)) * 100) * 10) / 10,
      cutting_qntl,
      base_rate,
      cutting_rate,
      target_amount,
      cutting_amount,
      total_agent_amount: Math.round((target_amount + cutting_amount) * 100) / 100
    };
  });
  
  res.json(summary);
});



  return router;
};
