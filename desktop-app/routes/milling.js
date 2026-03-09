const express = require('express');
const { safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function(database) {

  // ===== MILLING ENTRIES =====
  router.get('/api/milling-entries', safeSync((req, res) => {
    res.json(database.getMillingEntries(req.query));
  }));
  router.get('/api/milling-summary', safeSync((req, res) => {
    res.json(database.getMillingSummary(req.query));
  }));
  router.post('/api/milling-entries', safeSync((req, res) => {
    res.json(database.createMillingEntry({ ...req.body, created_by: req.query.username || '' }));
  }));
  router.get('/api/milling-entries/:id', safeSync((req, res) => {
    const entries = database.getMillingEntries({});
    const entry = entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json(entry);
  }));
  router.put('/api/milling-entries/:id', safeSync((req, res) => {
    const updated = database.updateMillingEntry(req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json(updated);
  }));
  router.delete('/api/milling-entries/:id', safeSync((req, res) => {
    if (!database.deleteMillingEntry(req.params.id)) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json({ message: 'Milling entry deleted', id: req.params.id });
  }));

  // ===== PADDY STOCK =====
  router.get('/api/paddy-stock', safeSync((req, res) => {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    const totalIn = +(entries.reduce((s, e) => s + ((e.qntl || 0) - (e.bag || 0) / 100), 0)).toFixed(2);
    const millingEntries = database.getMillingEntries(filters);
    const totalUsed = +millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2);
    res.json({ total_paddy_in_qntl: totalIn, total_paddy_used_qntl: totalUsed, available_paddy_qntl: +(totalIn - totalUsed).toFixed(2) });
  }));

  // ===== BYPRODUCT STOCK & SALES =====
  router.get('/api/byproduct-stock', safeSync((req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    const millingEntries = database.getMillingEntries(req.query);
    let sales = [...database.data.byproduct_sales];
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
    const stock = {};
    products.forEach(p => {
      const produced = +millingEntries.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s, e) => s + (e.quantity_qntl || 0), 0).toFixed(2);
      const revenue = +pSales.reduce((s, e) => s + (e.total_amount || 0), 0).toFixed(2);
      stock[p] = { produced_qntl: produced, sold_qntl: sold, available_qntl: +(produced - sold).toFixed(2), total_revenue: revenue };
    });
    res.json(stock);
  }));

  router.post('/api/byproduct-sales', safeSync((req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    const sale = { id: uuidv4(), ...req.body, total_amount: +((req.body.quantity_qntl || 0) * (req.body.rate_per_qntl || 0)).toFixed(2), created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.byproduct_sales.push(sale);
    database.save();
    res.json(sale);
  }));

  router.get('/api/byproduct-sales', safeSync((req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    let sales = [...database.data.byproduct_sales];
    if (req.query.product) sales = sales.filter(s => s.product === req.query.product);
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    res.json(sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }));

  router.delete('/api/byproduct-sales/:id', safeSync((req, res) => {
    if (!database.data.byproduct_sales) return res.status(404).json({ detail: 'Sale not found' });
    const len = database.data.byproduct_sales.length;
    database.data.byproduct_sales = database.data.byproduct_sales.filter(s => s.id !== req.params.id);
    if (database.data.byproduct_sales.length < len) { database.save(); return res.json({ message: 'Sale deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Sale not found' });
  }));

  // ===== FRK PURCHASES =====
  router.post('/api/frk-purchases', safeSync((req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    const d = req.body;
    const p = { id: uuidv4(), date: d.date, party_name: d.party_name || '', quantity_qntl: d.quantity_qntl || 0, rate_per_qntl: d.rate_per_qntl || 0, total_amount: +((d.quantity_qntl || 0) * (d.rate_per_qntl || 0)).toFixed(2), note: d.note || '', kms_year: d.kms_year || '', season: d.season || '', created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.frk_purchases.push(p); database.save(); res.json(p);
  }));
  router.get('/api/frk-purchases', safeSync((req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let p = [...database.data.frk_purchases];
    if (req.query.kms_year) p = p.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) p = p.filter(x => x.season === req.query.season);
    res.json(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }));
  router.delete('/api/frk-purchases/:id', safeSync((req, res) => {
    if (!database.data.frk_purchases) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.frk_purchases.length;
    database.data.frk_purchases = database.data.frk_purchases.filter(x => x.id !== req.params.id);
    if (database.data.frk_purchases.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  router.get('/api/frk-stock', safeSync((req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let purchases = [...database.data.frk_purchases];
    if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
    const totalPurchased = +purchases.reduce((s, p) => s + (p.quantity_qntl || 0), 0).toFixed(2);
    const totalCost = +purchases.reduce((s, p) => s + (p.total_amount || 0), 0).toFixed(2);
    const millingEntries = database.getMillingEntries(req.query);
    const totalUsed = +millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2);
    res.json({ total_purchased_qntl: totalPurchased, total_used_qntl: totalUsed, available_qntl: +(totalPurchased - totalUsed).toFixed(2), total_cost: totalCost });
  }));

  // ===== PADDY CUSTODY REGISTER =====
  router.get('/api/paddy-custody-register', safeSync((req, res) => {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    const millingEntries = database.getMillingEntries(filters);
    const rows = [];
    entries.forEach(e => rows.push({ date: e.date || '', type: 'received', description: `Truck: ${e.truck_no || ''} | Agent: ${e.agent_name || ''} | Mandi: ${e.mandi_name || ''}`, received_qntl: +((e.qntl || 0) - (e.bag || 0) / 100).toFixed(2), issued_qntl: 0, source_id: e.id || '' }));
    millingEntries.forEach(e => rows.push({ date: e.date || '', type: 'issued', description: `Milling (${(e.rice_type || 'parboiled').charAt(0).toUpperCase() + (e.rice_type || '').slice(1)}) | Rice: ${e.rice_qntl || 0}Q`, received_qntl: 0, issued_qntl: e.paddy_input_qntl || 0, source_id: e.id || '' }));
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    rows.forEach(r => { balance += r.received_qntl - r.issued_qntl; r.balance_qntl = +balance.toFixed(2); });
    res.json({ rows, total_received: +rows.reduce((s, r) => s + r.received_qntl, 0).toFixed(2), total_issued: +rows.reduce((s, r) => s + r.issued_qntl, 0).toFixed(2), final_balance: +balance.toFixed(2) });
  }));

  return router;
};
