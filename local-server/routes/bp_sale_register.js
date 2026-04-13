const { v4: uuid } = require('uuid');

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function ensure() { if (!database.data.bp_sale_register) database.data.bp_sale_register = []; }

  router.get('/api/bp-sale-register', (req, res) => {
    ensure();
    let sales = [...database.data.bp_sale_register];
    const { product, kms_year, season } = req.query;
    if (product) sales = sales.filter(s => s.product === product);
    if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
    if (season) sales = sales.filter(s => s.season === season);
    sales.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(sales);
  });

  router.post('/api/bp-sale-register', (req, res) => {
    ensure();
    const data = { ...req.body };
    data.id = uuid().substring(0, 12);
    data.created_at = new Date().toISOString();
    data.updated_at = data.created_at;
    data.created_by = req.query.username || '';

    const nw = parseFloat(data.net_weight_kg || 0);
    const rate = parseFloat(data.rate_per_qtl || 0);
    const nwQtl = +(nw / 100).toFixed(4);
    const amount = +(nwQtl * rate).toFixed(2);
    data.net_weight_qtl = nwQtl;
    data.amount = amount;

    let taxAmt = 0;
    if (data.gst_percent) { taxAmt = +(amount * parseFloat(data.gst_percent || 0) / 100).toFixed(2); }
    data.tax_amount = taxAmt;
    data.total = +(amount + taxAmt).toFixed(2);

    const cash = parseFloat(data.cash_paid || 0);
    const diesel = parseFloat(data.diesel_paid || 0);
    const advance = parseFloat(data.advance || 0);
    data.cash_paid = cash;
    data.diesel_paid = diesel;
    data.advance = advance;
    data.balance = +(data.total - cash - diesel - advance).toFixed(2);

    database.data.bp_sale_register.push(data);
    database.save();
    res.json(data);
  });

  router.put('/api/bp-sale-register/:id', (req, res) => {
    ensure();
    const idx = database.data.bp_sale_register.findIndex(s => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Not found' });

    const data = { ...req.body };
    data.updated_at = new Date().toISOString();
    data.updated_by = req.query.username || '';

    const nw = parseFloat(data.net_weight_kg || 0);
    const rate = parseFloat(data.rate_per_qtl || 0);
    const nwQtl = +(nw / 100).toFixed(4);
    const amount = +(nwQtl * rate).toFixed(2);
    data.net_weight_qtl = nwQtl;
    data.amount = amount;

    let taxAmt = 0;
    if (data.gst_percent) { taxAmt = +(amount * parseFloat(data.gst_percent || 0) / 100).toFixed(2); }
    data.tax_amount = taxAmt;
    data.total = +(amount + taxAmt).toFixed(2);

    const cash = parseFloat(data.cash_paid || 0);
    const diesel = parseFloat(data.diesel_paid || 0);
    const advance = parseFloat(data.advance || 0);
    data.cash_paid = cash;
    data.diesel_paid = diesel;
    data.advance = advance;
    data.balance = +(data.total - cash - diesel - advance).toFixed(2);

    data.id = req.params.id;
    data.created_at = database.data.bp_sale_register[idx].created_at;
    data.created_by = database.data.bp_sale_register[idx].created_by;
    database.data.bp_sale_register[idx] = data;
    database.save();
    res.json({ success: true });
  });

  router.delete('/api/bp-sale-register/:id', (req, res) => {
    ensure();
    const len = database.data.bp_sale_register.length;
    database.data.bp_sale_register = database.data.bp_sale_register.filter(s => s.id !== req.params.id);
    if (database.data.bp_sale_register.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'Not found' });
  });

  router.get('/api/bp-sale-register/suggestions/bill-from', (req, res) => {
    ensure();
    const set = new Set(database.data.bp_sale_register.map(s => s.bill_from).filter(Boolean));
    res.json([...set].sort());
  });

  router.get('/api/bp-sale-register/suggestions/party-name', (req, res) => {
    ensure();
    const set = new Set(database.data.bp_sale_register.map(s => s.party_name).filter(Boolean));
    res.json([...set].sort());
  });

  router.get('/api/bp-sale-register/suggestions/destination', (req, res) => {
    ensure();
    const set = new Set(database.data.bp_sale_register.map(s => s.destination).filter(Boolean));
    res.json([...set].sort());
  });

  return router;
};
