const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');

module.exports = function(database) {
  const router = express.Router();
  const ensure = () => { if (!database.data.sale_vouchers) database.data.sale_vouchers = []; };

  // GET /api/sale-book
  router.get('/api/sale-book', safeHandler(async (req, res) => {
    ensure();
    let vouchers = [...database.data.sale_vouchers];
    const { kms_year, season, search } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    if (search) { const s = search.toLowerCase(); vouchers = vouchers.filter(v => (v.party_name || '').toLowerCase().includes(s) || (v.voucher_no || '').toLowerCase().includes(s)); }
    vouchers.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(vouchers);
  }));

  // POST /api/sale-book
  router.post('/api/sale-book', safeHandler(async (req, res) => {
    ensure();
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    const d = { id: uuidv4(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    // Compute GST
    const items = d.items || [];
    d.subtotal = Math.round(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) * 100) / 100;
    const cgstP = parseFloat(d.cgst_percent) || 0, sgstP = parseFloat(d.sgst_percent) || 0, igstP = parseFloat(d.igst_percent) || 0;
    d.cgst_amount = Math.round(d.subtotal * cgstP / 100 * 100) / 100;
    d.sgst_amount = Math.round(d.subtotal * sgstP / 100 * 100) / 100;
    d.igst_amount = Math.round(d.subtotal * igstP / 100 * 100) / 100;
    d.total = Math.round((d.subtotal + d.cgst_amount + d.sgst_amount + d.igst_amount) * 100) / 100;
    d.balance = Math.round((d.total - (parseFloat(d.advance) || 0) - (parseFloat(d.cash_paid) || 0) - (parseFloat(d.diesel_paid) || 0)) * 100) / 100;
    database.data.sale_vouchers.push(d);
    // Auto cash entry for cash_paid
    if (d.cash_paid > 0) database.data.cash_transactions.push({ id: uuidv4(), date: d.date, account: 'cash', txn_type: 'jama', category: d.party_name, party_type: 'Rice Sale', description: `Sale #${d.voucher_no} cash`, amount: d.cash_paid, reference: `sale:${d.id.slice(0,8)}`, bank_name: '', kms_year: d.kms_year || '', season: d.season || '', created_by: d.created_by, created_at: d.created_at, updated_at: d.created_at });
    // Local party account
    if (d.party_name) database.data.local_party_accounts.push({ id: uuidv4(), party_name: d.party_name, party_type: 'Rice Sale', voucher_type: 'sale', voucher_id: d.id, voucher_no: d.voucher_no, date: d.date, amount: d.total, type: 'debit', kms_year: d.kms_year, season: d.season, created_at: d.created_at });
    database.save();
    res.json(d);
  }));

  // PUT /api/sale-book/:id
  router.put('/api/sale-book/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.sale_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const d = { ...database.data.sale_vouchers[idx], ...req.body, updated_at: new Date().toISOString() };
    const items = d.items || [];
    d.subtotal = Math.round(items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) * 100) / 100;
    d.cgst_amount = Math.round(d.subtotal * (parseFloat(d.cgst_percent) || 0) / 100 * 100) / 100;
    d.sgst_amount = Math.round(d.subtotal * (parseFloat(d.sgst_percent) || 0) / 100 * 100) / 100;
    d.igst_amount = Math.round(d.subtotal * (parseFloat(d.igst_percent) || 0) / 100 * 100) / 100;
    d.total = Math.round((d.subtotal + d.cgst_amount + d.sgst_amount + d.igst_amount) * 100) / 100;
    d.balance = Math.round((d.total - (parseFloat(d.advance) || 0) - (parseFloat(d.cash_paid) || 0) - (parseFloat(d.diesel_paid) || 0) - (parseFloat(d.paid_amount) || 0)) * 100) / 100;
    database.data.sale_vouchers[idx] = d;
    database.save();
    res.json(d);
  }));

  // DELETE /api/sale-book/:id
  router.delete('/api/sale-book/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.sale_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.sale_vouchers.splice(idx, 1);
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  // GET /api/sale-book/invoice/:id
  router.get('/api/sale-book/invoice/:id', safeHandler(async (req, res) => {
    ensure();
    const v = database.data.sale_vouchers.find(x => x.id === req.params.id);
    if (!v) return res.status(404).json({ detail: 'Not found' });
    const settings = database.data.settings || {};
    const mill = settings.mill_name || 'NAVKAR AGRO';
    const addr = settings.mill_address || 'JOLKO, KESINGA';
    const items = (v.items || []).map(i => `<tr><td>${i.item_name}</td><td class="r">${i.quantity} Q</td><td class="r">${i.rate}</td><td class="r">${i.amount}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sale Invoice</title>
    <style>body{font-family:Arial;margin:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:6px 10px}th{background:#1a365d;color:#fff}.header{text-align:center}.r{text-align:right}.b{font-weight:bold}.info{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.info div{flex:1;min-width:130px;background:#f7f7f7;padding:5px 8px;border-radius:4px}.info label{font-size:10px;color:#666;display:block}.info span{font-size:13px;font-weight:bold}@media print{button{display:none}}</style></head><body>
    <div class="header"><h2>${mill}</h2><p>${addr} - Sale Invoice</p></div>
    <div class="info"><div><label>Invoice No</label><span>${v.invoice_no || ''}</span></div><div><label>Date</label><span>${v.date || ''}</span></div><div><label>Party</label><span>${v.party_name || ''}</span></div><div><label>Voucher</label><span>#${v.voucher_no || ''}</span></div><div><label>Truck</label><span>${v.truck_no || ''}</span></div><div><label>RST</label><span>${v.rst_no || ''}</span></div><div><label>E-Way Bill</label><span>${v.eway_bill_no || ''}</span></div></div>
    <table><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>${items}
    <tr><td colspan="3" class="b">Subtotal</td><td class="r b">Rs.${(v.subtotal || 0).toLocaleString()}</td></tr>
    <tr><td colspan="3">CGST (${v.cgst_percent || 0}%)</td><td class="r">Rs.${(v.cgst_amount || 0).toLocaleString()}</td></tr>
    <tr><td colspan="3">SGST (${v.sgst_percent || 0}%)</td><td class="r">Rs.${(v.sgst_amount || 0).toLocaleString()}</td></tr>
    <tr><td colspan="3" class="b">Total</td><td class="r b">Rs.${(v.total || 0).toLocaleString()}</td></tr></table>
    <button onclick="window.print()" style="margin-top:15px;padding:8px 24px;background:#1a365d;color:white;border:none;border-radius:4px;cursor:pointer">Print</button></body></html>`;
    res.type('html').send(html);
  }));

  // PDF export
  router.get('/api/sale-book/export/pdf', safeHandler(async (req, res) => {
    ensure();
    let vouchers = [...database.data.sale_vouchers];
    const { kms_year, season } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    vouchers.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const settings = database.data.settings || {};
    const company = settings.mill_name || 'NAVKAR AGRO';
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sale Book</title><style>body{font-family:Arial;margin:10px;font-size:10px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 5px;text-align:left}th{background:#1a365d;color:#fff;font-size:9px}.r{text-align:right}.b{font-weight:bold}.amt{font-family:monospace}.total-row{background:#f0f0f0;font-weight:bold}.c{text-align:center}h2{margin:5px 0}@media print{body{margin:0}}</style></head><body><h2 style="text-align:center">${company} - Sale Book</h2>
    <table><tr><th class="c">No.</th><th>Date</th><th>Inv No.</th><th>Party</th><th>Items</th><th>Truck/RST</th><th>E-Way Bill</th><th class="r">Subtotal</th><th class="r">GST</th><th class="r">Total</th><th class="r">Advance</th><th class="r">Cash</th><th class="r">Diesel</th><th class="r">Balance</th></tr>`;
    const g = { sub: 0, gst: 0, total: 0, adv: 0, cash: 0, diesel: 0, bal: 0 };
    for (const v of vouchers) {
      const itemsStr = (v.items || []).map(i => `${i.item_name}(${i.quantity}Q)`).join(', ');
      const gst = (v.cgst_amount || 0) + (v.sgst_amount || 0) + (v.igst_amount || 0);
      g.sub += v.subtotal || 0; g.gst += gst; g.total += v.total || 0; g.adv += v.advance || 0; g.cash += v.cash_paid || 0; g.diesel += v.diesel_paid || 0; g.bal += v.balance || 0;
      html += `<tr><td class="c">#${v.voucher_no||''}</td><td>${v.date||''}</td><td>${v.invoice_no||''}</td><td class="b">${v.party_name||''}</td><td>${itemsStr}</td><td>${v.truck_no||''}${v.rst_no ? '/'+v.rst_no : ''}</td><td>${v.eway_bill_no||''}</td><td class="r amt">${v.subtotal||0}</td><td class="r amt">${Math.round(gst)}</td><td class="r amt b">${v.total||0}</td><td class="r amt">${v.advance||0}</td><td class="r amt">${v.cash_paid||0}</td><td class="r amt">${v.diesel_paid||0}</td><td class="r amt b">${v.balance||0}</td></tr>`;
    }
    html += `<tr class="total-row"><td colspan="7" class="b">TOTAL (${vouchers.length})</td><td class="r">${Math.round(g.sub)}</td><td class="r">${Math.round(g.gst)}</td><td class="r">${Math.round(g.total)}</td><td class="r">${Math.round(g.adv)}</td><td class="r">${Math.round(g.cash)}</td><td class="r">${Math.round(g.diesel)}</td><td class="r">${Math.round(g.bal)}</td></tr></table></body></html>`;
    res.type('html').send(html);
  }));

  // Excel export
  router.get('/api/sale-book/export/excel', safeHandler(async (req, res) => {
    ensure();
    const ExcelJS = require('exceljs');
    let vouchers = [...database.data.sale_vouchers];
    const { kms_year, season } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Sale Book');
    ws.addRow(['No.', 'Date', 'Inv No.', 'Party', 'Items', 'Truck/RST', 'E-Way Bill', 'Subtotal', 'GST', 'Total', 'Advance', 'Cash', 'Diesel', 'Balance']);
    for (const v of vouchers) {
      const itemsStr = (v.items || []).map(i => `${i.item_name}(${i.quantity}Q)`).join(', ');
      const gst = (v.cgst_amount || 0) + (v.sgst_amount || 0) + (v.igst_amount || 0);
      ws.addRow([v.voucher_no, v.date, v.invoice_no, v.party_name, itemsStr, `${v.truck_no||''}${v.rst_no?'/'+v.rst_no:''}`, v.eway_bill_no || '', v.subtotal||0, Math.round(gst), v.total||0, v.advance||0, v.cash_paid||0, v.diesel_paid||0, v.balance||0]);
    }
    ws.columns.forEach(c => c.width = 15);
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sale_book.xlsx');
    res.send(Buffer.from(buf));
  }));

  // Missing endpoints: stock-items, delete-bulk, individual PDF
  router.get('/api/sale-book/stock-items', safeHandler(async (req, res) => {
    ensure();
    const { kms_year, season } = req.query;
    let vouchers = [...database.data.sale_vouchers];
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    const itemMap = {};
    vouchers.forEach(v => (v.items || []).forEach(i => {
      const name = i.item_name || 'Unknown';
      if (!itemMap[name]) itemMap[name] = { item_name: name, total_qty: 0, total_amount: 0, count: 0 };
      itemMap[name].total_qty += parseFloat(i.quantity) || 0;
      itemMap[name].total_amount += parseFloat(i.amount) || 0;
      itemMap[name].count++;
    }));
    res.json(Object.values(itemMap));
  }));

  router.post('/api/sale-book/delete-bulk', safeHandler(async (req, res) => {
    ensure();
    const ids = req.body.ids || [];
    database.data.sale_vouchers = database.data.sale_vouchers.filter(v => !ids.includes(v.id));
    database.save();
    res.json({ message: `${ids.length} deleted` });
  }));

  router.get('/api/sale-book/:id/pdf', safeHandler(async (req, res) => {
    ensure();
    const v = database.data.sale_vouchers.find(x => x.id === req.params.id);
    if (!v) return res.status(404).json({ detail: 'Not found' });
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sale Invoice</title><style>body{font-family:Arial;margin:20px;font-size:12px}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #ccc;padding:5px}th{background:#1e40af;color:#fff}.r{text-align:right}.b{font-weight:bold}</style></head><body>`;
    html += `<h2 style="text-align:center">${company}</h2><h3 style="text-align:center">Sale Invoice #${v.voucher_no || ''}</h3>`;
    html += `<p><b>Date:</b> ${v.date || ''} | <b>Party:</b> ${v.party_name || ''} | <b>Invoice:</b> ${v.invoice_no || ''} | <b>Truck:</b> ${v.truck_no || ''}</p>`;
    html += `<table><tr><th>Item</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>`;
    (v.items || []).forEach(i => { html += `<tr><td>${i.item_name||''}</td><td>${i.hsn_code||''}</td><td class="r">${i.quantity||0}</td><td class="r">${i.rate||0}</td><td class="r">${i.amount||0}</td></tr>`; });
    html += `</table><p class="b">Subtotal: ${v.subtotal||0} | CGST: ${v.cgst_amount||0} | SGST: ${v.sgst_amount||0} | Total: ${v.total||0}</p>`;
    html += `</body></html>`;
    res.type('html').send(html);
  }));

  // === Stock Summary ===
  router.get('/api/stock-summary', safeHandler(async (req, res) => {
    const { kms_year, season } = req.query;
    // Collect purchases
    let purchases = [...(database.data.purchase_vouchers || [])];
    if (kms_year) purchases = purchases.filter(v => v.kms_year === kms_year);
    if (season) purchases = purchases.filter(v => v.season === season);
    const purchaseItems = {};
    purchases.forEach(v => (v.items || []).forEach(i => {
      const name = i.item_name || 'Unknown';
      if (!purchaseItems[name]) purchaseItems[name] = { qty: 0, amount: 0 };
      purchaseItems[name].qty += parseFloat(i.quantity) || 0;
      purchaseItems[name].amount += parseFloat(i.amount) || 0;
    }));
    // Collect sales
    let sales = [...(database.data.sale_vouchers || [])];
    if (kms_year) sales = sales.filter(v => v.kms_year === kms_year);
    if (season) sales = sales.filter(v => v.season === season);
    const saleItems = {};
    sales.forEach(v => (v.items || []).forEach(i => {
      const name = i.item_name || 'Unknown';
      if (!saleItems[name]) saleItems[name] = { qty: 0, amount: 0 };
      saleItems[name].qty += parseFloat(i.quantity) || 0;
      saleItems[name].amount += parseFloat(i.amount) || 0;
    }));
    const allItems = new Set([...Object.keys(purchaseItems), ...Object.keys(saleItems)]);
    const summary = [...allItems].map(name => ({
      item_name: name,
      purchase_qty: Math.round((purchaseItems[name]?.qty || 0) * 100) / 100,
      purchase_amount: Math.round((purchaseItems[name]?.amount || 0) * 100) / 100,
      sale_qty: Math.round((saleItems[name]?.qty || 0) * 100) / 100,
      sale_amount: Math.round((saleItems[name]?.amount || 0) * 100) / 100,
      stock_qty: Math.round(((purchaseItems[name]?.qty || 0) - (saleItems[name]?.qty || 0)) * 100) / 100,
    }));
    res.json(summary);
  }));

  router.get('/api/stock-summary/export/excel', safeHandler(async (req, res) => {
    const ExcelJS = require('exceljs');
    // Reuse logic from stock-summary
    const { kms_year, season } = req.query;
    let purchases = [...(database.data.purchase_vouchers || [])];
    if (kms_year) purchases = purchases.filter(v => v.kms_year === kms_year);
    if (season) purchases = purchases.filter(v => v.season === season);
    const purchaseItems = {};
    purchases.forEach(v => (v.items || []).forEach(i => { const n = i.item_name || 'Unknown'; if (!purchaseItems[n]) purchaseItems[n] = { qty: 0, amt: 0 }; purchaseItems[n].qty += parseFloat(i.quantity) || 0; purchaseItems[n].amt += parseFloat(i.amount) || 0; }));
    let sales = [...(database.data.sale_vouchers || [])];
    if (kms_year) sales = sales.filter(v => v.kms_year === kms_year);
    if (season) sales = sales.filter(v => v.season === season);
    const saleItems = {};
    sales.forEach(v => (v.items || []).forEach(i => { const n = i.item_name || 'Unknown'; if (!saleItems[n]) saleItems[n] = { qty: 0, amt: 0 }; saleItems[n].qty += parseFloat(i.quantity) || 0; saleItems[n].amt += parseFloat(i.amount) || 0; }));
    const allItems = [...new Set([...Object.keys(purchaseItems), ...Object.keys(saleItems)])];
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Stock Summary');
    ws.addRow(['Item', 'Purchase Qty', 'Purchase Amt', 'Sale Qty', 'Sale Amt', 'Stock Qty']);
    allItems.forEach(n => ws.addRow([n, purchaseItems[n]?.qty||0, purchaseItems[n]?.amt||0, saleItems[n]?.qty||0, saleItems[n]?.amt||0, (purchaseItems[n]?.qty||0)-(saleItems[n]?.qty||0)]));
    ws.columns.forEach(c => c.width = 18);
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock_summary.xlsx');
    res.send(Buffer.from(buf));
  }));

  router.get('/api/stock-summary/export/pdf', safeHandler(async (req, res) => {
    const { kms_year, season } = req.query;
    let purchases = [...(database.data.purchase_vouchers || [])];
    if (kms_year) purchases = purchases.filter(v => v.kms_year === kms_year);
    if (season) purchases = purchases.filter(v => v.season === season);
    const purchaseItems = {};
    purchases.forEach(v => (v.items || []).forEach(i => { const n = i.item_name || 'Unknown'; if (!purchaseItems[n]) purchaseItems[n] = { qty: 0, amt: 0 }; purchaseItems[n].qty += parseFloat(i.quantity) || 0; purchaseItems[n].amt += parseFloat(i.amount) || 0; }));
    let sales = [...(database.data.sale_vouchers || [])];
    if (kms_year) sales = sales.filter(v => v.kms_year === kms_year);
    if (season) sales = sales.filter(v => v.season === season);
    const saleItems = {};
    sales.forEach(v => (v.items || []).forEach(i => { const n = i.item_name || 'Unknown'; if (!saleItems[n]) saleItems[n] = { qty: 0, amt: 0 }; saleItems[n].qty += parseFloat(i.quantity) || 0; saleItems[n].amt += parseFloat(i.amount) || 0; }));
    const allItems = [...new Set([...Object.keys(purchaseItems), ...Object.keys(saleItems)])];
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';
    let html = `<!DOCTYPE html><html><head><style>body{font:10px Arial;margin:10px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 5px}th{background:#1e40af;color:#fff}.r{text-align:right}.b{font-weight:bold}</style></head><body>`;
    html += `<h2 style="text-align:center">${company} - Stock Summary</h2><table><tr><th>Item</th><th class="r">Purchase Qty</th><th class="r">Purchase Amt</th><th class="r">Sale Qty</th><th class="r">Sale Amt</th><th class="r">Stock Qty</th></tr>`;
    allItems.forEach(n => html += `<tr><td class="b">${n}</td><td class="r">${purchaseItems[n]?.qty||0}</td><td class="r">${purchaseItems[n]?.amt||0}</td><td class="r">${saleItems[n]?.qty||0}</td><td class="r">${saleItems[n]?.amt||0}</td><td class="r b">${(purchaseItems[n]?.qty||0)-(saleItems[n]?.qty||0)}</td></tr>`);
    html += `</table></body></html>`;
    res.type('html').send(html);
  }));

  return router;
};
