const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');

module.exports = function(database) {
  const router = express.Router();
  const ensure = () => { if (!database.data.purchase_vouchers) database.data.purchase_vouchers = []; };

  // GET /api/purchase-vouchers
  router.get('/api/purchase-vouchers', safeHandler(async (req, res) => {
    ensure();
    let vouchers = [...database.data.purchase_vouchers];
    const { kms_year, season, search } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    if (search) { const s = search.toLowerCase(); vouchers = vouchers.filter(v => (v.party_name || '').toLowerCase().includes(s) || (v.voucher_no || '').toLowerCase().includes(s)); }
    vouchers.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(vouchers);
  }));

  // POST /api/purchase-vouchers
  router.post('/api/purchase-vouchers', safeHandler(async (req, res) => {
    ensure();
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    const d = { id: uuidv4(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    const items = d.items || [];
    d.subtotal = Math.round(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) * 100) / 100;
    const cgstP = parseFloat(d.cgst_percent) || 0, sgstP = parseFloat(d.sgst_percent) || 0, igstP = parseFloat(d.igst_percent) || 0;
    d.cgst_amount = Math.round(d.subtotal * cgstP / 100 * 100) / 100;
    d.sgst_amount = Math.round(d.subtotal * sgstP / 100 * 100) / 100;
    d.igst_amount = Math.round(d.subtotal * igstP / 100 * 100) / 100;
    d.total = Math.round((d.subtotal + d.cgst_amount + d.sgst_amount + d.igst_amount) * 100) / 100;
    d.balance = Math.round((d.total - (parseFloat(d.advance) || 0) - (parseFloat(d.cash_paid) || 0) - (parseFloat(d.diesel_paid) || 0)) * 100) / 100;
    database.data.purchase_vouchers.push(d);
    if (d.cash_paid > 0) database.data.cash_transactions.push({ id: uuidv4(), date: d.date, account: 'cash', txn_type: 'nikasi', category: d.party_name, party_type: 'Pvt Paddy Purchase', description: `Purchase #${d.voucher_no} cash`, amount: d.cash_paid, reference: `purchase:${d.id.slice(0,8)}`, bank_name: '', kms_year: d.kms_year || '', season: d.season || '', created_by: d.created_by, created_at: d.created_at, updated_at: d.created_at });
    if (d.party_name) database.data.local_party_accounts.push({ id: uuidv4(), party_name: d.party_name, party_type: 'Pvt Paddy Purchase', voucher_type: 'purchase', voucher_id: d.id, voucher_no: d.voucher_no, date: d.date, amount: d.total, type: 'credit', kms_year: d.kms_year, season: d.season, created_at: d.created_at });
    database.save();
    res.json(d);
  }));

  // PUT /api/purchase-vouchers/:id
  router.put('/api/purchase-vouchers/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.purchase_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const d = { ...database.data.purchase_vouchers[idx], ...req.body, updated_at: new Date().toISOString() };
    const items = d.items || [];
    d.subtotal = Math.round(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) * 100) / 100;
    d.cgst_amount = Math.round(d.subtotal * (parseFloat(d.cgst_percent) || 0) / 100 * 100) / 100;
    d.sgst_amount = Math.round(d.subtotal * (parseFloat(d.sgst_percent) || 0) / 100 * 100) / 100;
    d.igst_amount = Math.round(d.subtotal * (parseFloat(d.igst_percent) || 0) / 100 * 100) / 100;
    d.total = Math.round((d.subtotal + d.cgst_amount + d.sgst_amount + d.igst_amount) * 100) / 100;
    d.balance = Math.round((d.total - (parseFloat(d.advance) || 0) - (parseFloat(d.cash_paid) || 0) - (parseFloat(d.diesel_paid) || 0) - (parseFloat(d.paid_amount) || 0)) * 100) / 100;
    database.data.purchase_vouchers[idx] = d;
    database.save();
    res.json(d);
  }));

  // DELETE /api/purchase-vouchers/:id
  router.delete('/api/purchase-vouchers/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.purchase_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.purchase_vouchers.splice(idx, 1);
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  // PDF export
  router.get('/api/purchase-book/export/pdf', safeHandler(async (req, res) => {
    ensure();
    let vouchers = [...database.data.purchase_vouchers];
    const { kms_year, season } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    vouchers.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Purchase Book</title><style>body{font-family:Arial;margin:10px;font-size:10px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 5px}th{background:#2E7D32;color:#fff;font-size:9px}.r{text-align:right}.b{font-weight:bold}.c{text-align:center}.total-row{background:#f0f0f0;font-weight:bold}@media print{body{margin:0}}</style></head><body><h2 style="text-align:center">${company} - Purchase Book</h2>
    <table><tr><th class="c">No.</th><th>Date</th><th>Inv No.</th><th>Party</th><th>Items</th><th>Truck</th><th>E-Way Bill</th><th class="r">Total</th><th class="r">Advance</th><th class="r">Cash</th><th class="r">Diesel</th><th class="r">Balance</th></tr>`;
    const g = { total: 0, adv: 0, cash: 0, diesel: 0, bal: 0 };
    for (const v of vouchers) {
      const itemsStr = (v.items || []).map(i => `${i.item_name}(${i.quantity||0})`).join(', ');
      g.total += v.total || 0; g.adv += v.advance || 0; g.cash += v.cash_paid || 0; g.diesel += v.diesel_paid || 0; g.bal += v.balance || 0;
      html += `<tr><td class="c">${v.voucher_no||''}</td><td>${v.date||''}</td><td>${v.invoice_no||''}</td><td class="b">${v.party_name||''}</td><td>${itemsStr}</td><td>${v.truck_no||''}</td><td>${v.eway_bill_no||''}</td><td class="r b">${v.total||0}</td><td class="r">${v.advance||0}</td><td class="r">${v.cash_paid||0}</td><td class="r">${v.diesel_paid||0}</td><td class="r b">${v.balance||0}</td></tr>`;
    }
    html += `<tr class="total-row"><td colspan="7" class="b">TOTAL (${vouchers.length})</td><td class="r">${Math.round(g.total)}</td><td class="r">${Math.round(g.adv)}</td><td class="r">${Math.round(g.cash)}</td><td class="r">${Math.round(g.diesel)}</td><td class="r">${Math.round(g.bal)}</td></tr></table></body></html>`;
    res.type('html').send(html);
  }));

  // Excel export
  router.get('/api/purchase-book/export/excel', safeHandler(async (req, res) => {
    ensure();
    const ExcelJS = require('exceljs');
    let vouchers = [...database.data.purchase_vouchers];
    const { kms_year, season } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Purchase Book');
    ws.addRow(['No.', 'Date', 'Inv No.', 'Party', 'Items', 'Truck', 'E-Way Bill', 'Total', 'Advance', 'Cash', 'Diesel', 'Balance']);
    for (const v of vouchers) {
      const itemsStr = (v.items || []).map(i => `${i.item_name}(${i.quantity||0})`).join(', ');
      ws.addRow([v.voucher_no, v.date, v.invoice_no, v.party_name, itemsStr, v.truck_no, v.eway_bill_no || '', v.total||0, v.advance||0, v.cash_paid||0, v.diesel_paid||0, v.balance||0]);
    }
    ws.columns.forEach(c => c.width = 15);
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=purchase_book.xlsx');
    res.send(Buffer.from(buf));
  }));

  return router;
};
