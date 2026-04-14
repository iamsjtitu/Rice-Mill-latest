const { v4: uuid } = require('uuid');

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function ensure() { if (!database.data.paddy_release) database.data.paddy_release = []; }

  router.get('/api/paddy-release', (req, res) => {
    ensure();
    let items = [...database.data.paddy_release];
    const { kms_year, season } = req.query;
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    res.json(items);
  });

  router.post('/api/paddy-release', (req, res) => {
    ensure();
    const data = { ...req.body };
    data.id = uuid().substring(0, 12);
    data.created_at = new Date().toISOString();
    data.updated_at = data.created_at;
    data.created_by = req.query.username || '';
    data.qty_qtl = parseFloat(data.qty_qtl || 0);
    data.used_qtl = 0;
    database.data.paddy_release.push(data);
    database.save();
    res.json(data);
  });

  router.put('/api/paddy-release/:id', (req, res) => {
    ensure();
    const idx = database.data.paddy_release.findIndex(i => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Not found' });
    const data = { ...req.body };
    data.updated_at = new Date().toISOString();
    data.updated_by = req.query.username || '';
    data.qty_qtl = parseFloat(data.qty_qtl || 0);
    data.id = req.params.id;
    data.created_at = database.data.paddy_release[idx].created_at;
    data.created_by = database.data.paddy_release[idx].created_by;
    database.data.paddy_release[idx] = data;
    database.save();
    res.json({ success: true });
  });

  router.delete('/api/paddy-release/:id', (req, res) => {
    ensure();
    const len = database.data.paddy_release.length;
    database.data.paddy_release = database.data.paddy_release.filter(i => i.id !== req.params.id);
    if (database.data.paddy_release.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'Not found' });
  });

  router.get('/api/paddy-release/stock', (req, res) => {
    ensure();
    const { kms_year, season } = req.query;
    let releases = [...database.data.paddy_release];
    if (kms_year) releases = releases.filter(r => r.kms_year === kms_year);
    if (season) releases = releases.filter(r => r.season === season);
    const totalReleased = releases.reduce((s, r) => s + (r.qty_qtl || 0), 0);

    const millingEntries = database.getMillingEntries(req.query);
    const totalMilled = millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0);

    res.json({
      total_released: +totalReleased.toFixed(2),
      total_milled: +totalMilled.toFixed(2),
      available_for_milling: +(totalReleased - totalMilled).toFixed(2),
      releases,
    });
  });

  return router;
};
