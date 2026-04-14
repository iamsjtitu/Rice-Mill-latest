const { v4: uuid } = require('uuid');

const STANDARD_OIL = { Raw: 22, Boiled: 25 };

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function ensure() { if (!database.data.oil_premium) database.data.oil_premium = []; }

  router.get('/api/oil-premium', (req, res) => {
    ensure();
    let items = [...database.data.oil_premium];
    const { kms_year, season, bran_type } = req.query;
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (bran_type) items = items.filter(i => i.bran_type === bran_type);
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(items);
  });

  router.post('/api/oil-premium', (req, res) => {
    ensure();
    const data = { ...req.body };
    data.id = uuid().substring(0, 12);
    data.created_at = new Date().toISOString();
    data.updated_at = data.created_at;
    data.created_by = req.query.username || '';

    const branType = data.bran_type || 'Boiled';
    const standard = STANDARD_OIL[branType] || 25;
    const actual = parseFloat(data.actual_oil_pct || 0);
    const rate = parseFloat(data.rate || 0);
    const qty = parseFloat(data.qty_qtl || 0);

    data.standard_oil_pct = standard;
    data.difference_pct = +(actual - standard).toFixed(4);
    data.premium_amount = standard ? +(rate * (actual - standard) * qty / standard).toFixed(2) : 0;

    database.data.oil_premium.push(data);
    database.save();
    res.json(data);
  });

  router.put('/api/oil-premium/:id', (req, res) => {
    ensure();
    const idx = database.data.oil_premium.findIndex(i => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Not found' });

    const data = { ...req.body };
    data.updated_at = new Date().toISOString();
    data.updated_by = req.query.username || '';

    const branType = data.bran_type || 'Boiled';
    const standard = STANDARD_OIL[branType] || 25;
    const actual = parseFloat(data.actual_oil_pct || 0);
    const rate = parseFloat(data.rate || 0);
    const qty = parseFloat(data.qty_qtl || 0);

    data.standard_oil_pct = standard;
    data.difference_pct = +(actual - standard).toFixed(4);
    data.premium_amount = standard ? +(rate * (actual - standard) * qty / standard).toFixed(2) : 0;

    data.id = req.params.id;
    data.created_at = database.data.oil_premium[idx].created_at;
    data.created_by = database.data.oil_premium[idx].created_by;
    database.data.oil_premium[idx] = data;
    database.save();
    res.json({ success: true });
  });

  router.delete('/api/oil-premium/:id', (req, res) => {
    ensure();
    const len = database.data.oil_premium.length;
    database.data.oil_premium = database.data.oil_premium.filter(i => i.id !== req.params.id);
    if (database.data.oil_premium.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'Not found' });
  });

  router.get('/api/oil-premium/lookup-sale', (req, res) => {
    if (!database.data.bp_sale_register) database.data.bp_sale_register = [];
    const { voucher_no, rst_no, kms_year } = req.query;
    if (!voucher_no && !rst_no) return res.status(400).json({ detail: 'voucher_no or rst_no required' });

    let sale = null;
    const sales = database.data.bp_sale_register.filter(s => s.product === 'Rice Bran');
    if (voucher_no) {
      sale = sales.find(s => s.voucher_no === voucher_no && (!kms_year || s.kms_year === kms_year));
    } else if (rst_no) {
      sale = sales.find(s => s.rst_no === rst_no && (!kms_year || s.kms_year === kms_year));
    }
    if (!sale) return res.status(404).json({ detail: 'Sale not found' });
    res.json(sale);
  });

  return router;
};
