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

  // Helper: get default diesel pump name
  function getDefaultPump() {
    const dAccounts = database.data.diesel_accounts || [];
    const last = dAccounts[dAccounts.length - 1];
    return last ? (last.pump_name || 'Diesel Pump') : 'Diesel Pump';
  }

  // Helper: create all accounting entries for a sale voucher (matching web backend)
  function createSaleLedgerEntries(d, docId, vno, items) {
    const party = (d.party_name || '').trim();
    const cash = parseFloat(d.cash_paid) || 0;
    const diesel = parseFloat(d.diesel_paid) || 0;
    const advance = parseFloat(d.advance) || 0;
    const total = parseFloat(d.total) || 0;
    const truck = (d.truck_no || '').trim();
    const now = new Date().toISOString();
    const base = { kms_year: d.kms_year || '', season: d.season || '', created_by: d.created_by || '', created_at: now, updated_at: now };
    const inv = d.invoice_no || '';
    const descSuffix = inv ? ` | Inv:${inv}` : '';
    const itemsStr = (items || []).map(i => i.item_name).join(', ');

    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    if (!database.data.diesel_accounts) database.data.diesel_accounts = [];
    if (!database.data.truck_payments) database.data.truck_payments = [];

    // 1. Party Ledger JAMA: total sale amount (party owes us)
    if (party && total > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'jama',
        amount: total, category: party, party_type: 'Sale Book',
        description: `Sale #${vno} - ${itemsStr}${descSuffix}`,
        reference: `sale_voucher:${docId}`, ...base
      });
    }

    // 2. Advance from party: Ledger NIKASI (reduces party debt) + Cash JAMA (cash received)
    if (advance > 0 && party) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'nikasi',
        amount: advance, category: party, party_type: 'Sale Book',
        description: `Advance received - Sale #${vno}${descSuffix}`,
        reference: `sale_voucher_adv:${docId}`, ...base
      });
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'cash', txn_type: 'jama',
        amount: advance, category: party, party_type: 'Sale Book',
        description: `Advance received - Sale #${vno}${descSuffix}`,
        reference: `sale_voucher_adv_cash:${docId}`, ...base
      });
    }

    // 3. Cash paid to truck → Cash NIKASI (cash going out)
    if (cash > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'cash', txn_type: 'nikasi',
        amount: cash, category: truck || party, party_type: truck ? 'Truck' : 'Sale Book',
        description: `Truck cash - Sale #${vno}${descSuffix}`,
        reference: `sale_voucher_cash:${docId}`, ...base
      });
    }

    // 4. Diesel paid → Diesel Pump Ledger JAMA + diesel_accounts entry
    if (diesel > 0) {
      const pumpName = getDefaultPump();
      const pumpDoc = database.data.diesel_accounts.find(da => da.pump_name === pumpName);
      const pumpId = pumpDoc ? (pumpDoc.pump_id || '') : '';
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'jama',
        amount: diesel, category: pumpName, party_type: 'Diesel',
        description: `Diesel for truck - Sale #${vno} - ${party}${descSuffix}`,
        reference: `sale_voucher_diesel:${docId}`, ...base
      });
      database.data.diesel_accounts.push({
        id: uuidv4(), date: d.date || '', pump_id: pumpId, pump_name: pumpName,
        truck_no: truck, agent_name: party, amount: diesel, txn_type: 'debit',
        description: `Diesel for Sale #${vno} - ${party}${descSuffix}`,
        reference: `sale_voucher_diesel:${docId}`, ...base
      });
    }

    // 5. Truck cash+diesel → Truck Ledger NIKASI (deductions from future bhada)
    if (cash > 0 && truck) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'nikasi',
        amount: cash, category: truck, party_type: 'Truck',
        description: `Truck cash deduction - Sale #${vno}${descSuffix}`,
        reference: `sale_truck_cash:${docId}`, ...base
      });
    }
    if (diesel > 0 && truck) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'nikasi',
        amount: diesel, category: truck, party_type: 'Truck',
        description: `Truck diesel deduction - Sale #${vno}${descSuffix}`,
        reference: `sale_truck_diesel:${docId}`, ...base
      });
    }
    // truck_payments entry
    const truckTotal = cash + diesel;
    if (truckTotal > 0 && truck) {
      database.data.truck_payments.push({
        entry_id: docId, truck_no: truck, date: d.date || '',
        cash_taken: cash, diesel_taken: diesel,
        gross_amount: 0, deductions: truckTotal, net_amount: 0, paid_amount: 0,
        balance_amount: 0, status: 'pending', source: 'Sale Book',
        description: `Sale #${vno} - ${party}${descSuffix}`,
        reference: `sale_voucher_truck:${docId}`, ...base
      });
    }

    // 6. Local party accounts: debit for total sale
    if (party && total > 0) {
      database.data.local_party_accounts.push({
        id: uuidv4(), date: d.date || '', party_name: party, txn_type: 'debit',
        amount: total, description: `Sale #${vno} - ${itemsStr}${descSuffix}`,
        source_type: 'sale_voucher', reference: `sale_voucher:${docId}`, ...base
      });
    }
    // Advance received = payment entry in local_party
    if (advance > 0 && party) {
      database.data.local_party_accounts.push({
        id: uuidv4(), date: d.date || '', party_name: party, txn_type: 'payment',
        amount: advance, description: `Advance received - Sale #${vno}${descSuffix}`,
        source_type: 'sale_voucher_advance', reference: `sale_voucher_adv:${docId}`, ...base
      });
    }
  }

  // Helper: cleanup all accounting entries for a sale voucher
  function cleanupSaleEntries(docId) {
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        !(t.reference && t.reference.match && t.reference.match(new RegExp(`sale_voucher.*:${docId}|sale_truck.*:${docId}|sale:${docId.slice(0,8)}`)))
      );
    }
    if (database.data.local_party_accounts) {
      database.data.local_party_accounts = database.data.local_party_accounts.filter(t =>
        !(t.reference && t.reference.match && t.reference.match(new RegExp(`sale_voucher.*:${docId}`)))
      );
    }
    if (database.data.diesel_accounts) {
      database.data.diesel_accounts = database.data.diesel_accounts.filter(t =>
        !(t.reference && t.reference === `sale_voucher_diesel:${docId}`)
      );
    }
    if (database.data.truck_payments) {
      database.data.truck_payments = database.data.truck_payments.filter(t =>
        !(t.reference && t.reference === `sale_voucher_truck:${docId}`)
      );
    }
  }

  // POST /api/sale-book
  router.post('/api/sale-book', safeHandler(async (req, res) => {
    ensure();
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
    // Create all accounting entries
    createSaleLedgerEntries(d, d.id, d.voucher_no, items);
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
    // Cleanup old entries and recreate
    cleanupSaleEntries(d.id);
    createSaleLedgerEntries(d, d.id, d.voucher_no, items);
    database.save();
    res.json(d);
  }));

  // DELETE /api/sale-book/:id
  router.delete('/api/sale-book/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.sale_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    // Cleanup all accounting entries
    cleanupSaleEntries(req.params.id);
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
    ids.forEach(id => cleanupSaleEntries(id));
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

  // === Stock Summary (matching web backend exactly) ===
  router.get('/api/stock-summary', safeHandler(async (req, res) => {
    const { kms_year, season } = req.query;
    const filter = (arr, ky, sn) => {
      let r = arr || [];
      if (ky) r = r.filter(e => e.kms_year === ky);
      if (sn) r = r.filter(e => e.season === sn);
      return r;
    };
    const round2 = v => Math.round((v || 0) * 100) / 100;

    const milling = filter(database.data.milling_entries, kms_year, season);
    const dc = filter(database.data.dc_entries, kms_year, season);
    const pvtSales = filter(database.data.rice_sales, kms_year, season);
    const saleVouchers = filter(database.data.sale_vouchers, kms_year, season);
    const bpSales = filter(database.data.byproduct_sales, kms_year, season);
    const purchaseVouchers = filter(database.data.purchase_vouchers, kms_year, season);
    const millEntries = filter(database.data.entries, kms_year, season);
    const pvtPaddy = filter(database.data.private_paddy, kms_year, season).filter(e => e.source !== 'agent_extra');
    const gunnyEntries = filter(database.data.gunny_bags, kms_year, season);
    const frkPurchases = filter(database.data.frk_purchases, kms_year, season);

    // Paddy stock
    const cmrPaddyIn = round2(millEntries.reduce((s, e) => s + (e.qntl || 0) - (e.bag || 0) / 100 - (e.p_pkt_cut || 0) / 100, 0));
    const pvtPaddyIn = round2(pvtPaddy.reduce((s, e) => s + (e.qntl || 0) - (e.bag || 0) / 100, 0));
    const paddyUsedMilling = round2(milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0));

    // Rice produced from milling
    const usnaProduced = round2(milling.filter(e => ['usna', 'parboiled'].includes((e.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const rawProduced = round2(milling.filter(e => (e.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0));

    // Rice sold
    const govtDelivered = round2(dc.reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldUsna = round2(pvtSales.filter(s => ['usna', 'parboiled'].includes((s.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldRaw = round2(pvtSales.filter(s => (s.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.quantity_qntl || 0), 0));

    // Sale voucher items
    const sbSold = {};
    saleVouchers.forEach(sv => (sv.items || []).forEach(i => { const n = i.item_name || ''; sbSold[n] = (sbSold[n] || 0) + (parseFloat(i.quantity) || 0); }));

    // Purchase voucher items
    const pvBought = {};
    purchaseVouchers.forEach(pv => (pv.items || []).forEach(i => { const n = i.item_name || ''; pvBought[n] = (pvBought[n] || 0) + (parseFloat(i.quantity) || 0); }));

    // By-products from milling
    const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
    const bpProduced = {};
    products.forEach(p => { bpProduced[p] = round2(milling.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0)); });
    const bpSoldMap = {};
    bpSales.forEach(s => { const p = s.product || ''; bpSoldMap[p] = (bpSoldMap[p] || 0) + (s.quantity_qntl || 0); });

    // FRK
    const frkIn = round2((frkPurchases || []).reduce((s, e) => s + (e.quantity_qntl || e.quantity || 0), 0));

    // Build stock items
    const stockItems = [];

    // Paddy
    const pvPaddy = round2(pvBought['Paddy'] || 0);
    const paddyTotalIn = round2(cmrPaddyIn + pvtPaddyIn + pvPaddy);
    stockItems.push({ name: 'Paddy', category: 'Raw Material', in_qty: paddyTotalIn, out_qty: paddyUsedMilling, available: round2(paddyTotalIn - paddyUsedMilling), unit: 'Qntl', details: `CMR: ${cmrPaddyIn}Q + Pvt: ${pvtPaddyIn}Q + Purchase: ${pvPaddy}Q - Milling: ${paddyUsedMilling}Q` });

    // Rice Usna
    const pvUsna = round2(pvBought['Rice (Usna)'] || 0);
    const usnaSoldTotal = round2(govtDelivered + pvtSoldUsna + (sbSold['Rice (Usna)'] || 0));
    stockItems.push({ name: 'Rice (Usna)', category: 'Finished', in_qty: round2(usnaProduced + pvUsna), out_qty: usnaSoldTotal, available: round2(usnaProduced + pvUsna - usnaSoldTotal), unit: 'Qntl', details: `Milling: ${usnaProduced}Q + Purchase: ${pvUsna}Q - DC: ${govtDelivered}Q - Pvt: ${pvtSoldUsna}Q - Sale: ${sbSold['Rice (Usna)'] || 0}Q` });

    // Rice Raw
    const pvRaw = round2(pvBought['Rice (Raw)'] || 0);
    const rawSoldTotal = round2(pvtSoldRaw + (sbSold['Rice (Raw)'] || 0));
    stockItems.push({ name: 'Rice (Raw)', category: 'Finished', in_qty: round2(rawProduced + pvRaw), out_qty: rawSoldTotal, available: round2(rawProduced + pvRaw - rawSoldTotal), unit: 'Qntl', details: `Milling: ${rawProduced}Q + Purchase: ${pvRaw}Q - Pvt: ${pvtSoldRaw}Q - Sale: ${sbSold['Rice (Raw)'] || 0}Q` });

    // By-products
    products.forEach(p => {
      const produced = bpProduced[p] || 0;
      const soldBp = round2(bpSoldMap[p] || 0);
      const soldSb = sbSold[p.charAt(0).toUpperCase() + p.slice(1)] || 0;
      const purchased = pvBought[p.charAt(0).toUpperCase() + p.slice(1)] || 0;
      const totalIn = round2(produced + purchased);
      const totalOut = round2(soldBp + soldSb);
      stockItems.push({ name: p.charAt(0).toUpperCase() + p.slice(1), category: 'By-Product', in_qty: totalIn, out_qty: totalOut, available: round2(totalIn - totalOut), unit: 'Qntl', details: `Milling: ${produced}Q + Purchased: ${purchased}Q - Sold: ${soldBp}Q - Sale Voucher: ${soldSb}Q` });
    });

    // FRK
    const frkPurchasedPv = pvBought['FRK'] || 0;
    const frkTotalIn = round2(frkIn + frkPurchasedPv);
    const frkSoldSb = sbSold['FRK'] || 0;
    stockItems.push({ name: 'FRK', category: 'By-Product', in_qty: frkTotalIn, out_qty: frkSoldSb, available: round2(frkTotalIn - frkSoldSb), unit: 'Qntl', details: `FRK Purchase: ${frkIn}Q + Purchase Voucher: ${frkPurchasedPv}Q - Sale Voucher: ${frkSoldSb}Q` });

    // Custom items from purchase vouchers
    const knownItems = new Set(['Paddy', 'Rice (Usna)', 'Rice (Raw)', 'FRK', ...products.map(p => p.charAt(0).toUpperCase() + p.slice(1))]);
    for (const [itemName, qty] of Object.entries(pvBought)) {
      if (!knownItems.has(itemName)) {
        const sold = sbSold[itemName] || 0;
        stockItems.push({ name: itemName, category: 'Custom', in_qty: round2(qty), out_qty: round2(sold), available: round2(qty - sold), unit: 'Qntl', details: `Purchased: ${qty}Q - Sold: ${sold}Q` });
      }
    }

    // Gunny Bags
    const gunnyIn = gunnyEntries.filter(e => e.txn_type === 'in').reduce((s, e) => s + (e.quantity || 0), 0);
    const gunnyOut = gunnyEntries.filter(e => e.txn_type === 'out').reduce((s, e) => s + (e.quantity || 0), 0);
    if (gunnyIn > 0 || gunnyOut > 0) {
      const newIn = gunnyEntries.filter(e => e.txn_type === 'in' && e.bag_type === 'new').reduce((s, e) => s + (e.quantity || 0), 0);
      const oldIn = gunnyEntries.filter(e => e.txn_type === 'in' && e.bag_type === 'old').reduce((s, e) => s + (e.quantity || 0), 0);
      stockItems.push({ name: 'Gunny Bags', category: 'Raw Material', in_qty: gunnyIn, out_qty: gunnyOut, available: gunnyIn - gunnyOut, unit: 'Bags', details: `Govt(New): ${newIn} + Market(Old): ${oldIn} - Used: ${gunnyOut}` });
    }

    res.json({ items: stockItems });
  }));

  // Helper to get full stock data
  const getStockItems = (req) => {
    const { kms_year, season } = req.query;
    const filter = (arr, ky, sn) => { let r = arr || []; if (ky) r = r.filter(e => e.kms_year === ky); if (sn) r = r.filter(e => e.season === sn); return r; };
    const round2 = v => Math.round((v || 0) * 100) / 100;
    const milling = filter(database.data.milling_entries, kms_year, season);
    const dc = filter(database.data.dc_entries, kms_year, season);
    const pvtSales = filter(database.data.rice_sales, kms_year, season);
    const saleVouchers = filter(database.data.sale_vouchers, kms_year, season);
    const bpSales = filter(database.data.byproduct_sales, kms_year, season);
    const purchaseVouchers = filter(database.data.purchase_vouchers, kms_year, season);
    const millEntries = filter(database.data.entries, kms_year, season);
    const pvtPaddy = filter(database.data.private_paddy, kms_year, season).filter(e => e.source !== 'agent_extra');
    const gunnyEntries = filter(database.data.gunny_bags, kms_year, season);
    const frkPurchases = filter(database.data.frk_purchases, kms_year, season);
    const cmrPaddyIn = round2(millEntries.reduce((s, e) => s + (e.qntl || 0) - (e.bag || 0) / 100 - (e.p_pkt_cut || 0) / 100, 0));
    const pvtPaddyIn = round2(pvtPaddy.reduce((s, e) => s + (e.qntl || 0) - (e.bag || 0) / 100, 0));
    const paddyUsedMilling = round2(milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0));
    const usnaProduced = round2(milling.filter(e => ['usna', 'parboiled'].includes((e.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const rawProduced = round2(milling.filter(e => (e.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const govtDelivered = round2(dc.reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldUsna = round2(pvtSales.filter(s => ['usna', 'parboiled'].includes((s.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldRaw = round2(pvtSales.filter(s => (s.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const sbSold = {}; saleVouchers.forEach(sv => (sv.items || []).forEach(i => { const n = i.item_name || ''; sbSold[n] = (sbSold[n] || 0) + (parseFloat(i.quantity) || 0); }));
    const pvBought = {}; purchaseVouchers.forEach(pv => (pv.items || []).forEach(i => { const n = i.item_name || ''; pvBought[n] = (pvBought[n] || 0) + (parseFloat(i.quantity) || 0); }));
    const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
    const bpProduced = {}; products.forEach(p => { bpProduced[p] = round2(milling.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0)); });
    const bpSoldMap = {}; bpSales.forEach(s => { const p = s.product || ''; bpSoldMap[p] = (bpSoldMap[p] || 0) + (s.quantity_qntl || 0); });
    const frkIn = round2((frkPurchases || []).reduce((s, e) => s + (e.quantity_qntl || e.quantity || 0), 0));
    const stockItems = [];
    const pvPaddy = round2(pvBought['Paddy'] || 0);
    const paddyTotalIn = round2(cmrPaddyIn + pvtPaddyIn + pvPaddy);
    stockItems.push({ name: 'Paddy', category: 'Raw Material', in_qty: paddyTotalIn, out_qty: paddyUsedMilling, available: round2(paddyTotalIn - paddyUsedMilling), unit: 'Qntl', details: `CMR: ${cmrPaddyIn}Q + Pvt: ${pvtPaddyIn}Q + Purchase: ${pvPaddy}Q - Milling: ${paddyUsedMilling}Q` });
    const pvUsna = round2(pvBought['Rice (Usna)'] || 0);
    const usnaSoldTotal = round2(govtDelivered + pvtSoldUsna + (sbSold['Rice (Usna)'] || 0));
    stockItems.push({ name: 'Rice (Usna)', category: 'Finished', in_qty: round2(usnaProduced + pvUsna), out_qty: usnaSoldTotal, available: round2(usnaProduced + pvUsna - usnaSoldTotal), unit: 'Qntl', details: `Milling: ${usnaProduced}Q + Purchase: ${pvUsna}Q - DC: ${govtDelivered}Q - Pvt: ${pvtSoldUsna}Q - Sale: ${sbSold['Rice (Usna)'] || 0}Q` });
    const pvRaw = round2(pvBought['Rice (Raw)'] || 0);
    const rawSoldTotal = round2(pvtSoldRaw + (sbSold['Rice (Raw)'] || 0));
    stockItems.push({ name: 'Rice (Raw)', category: 'Finished', in_qty: round2(rawProduced + pvRaw), out_qty: rawSoldTotal, available: round2(rawProduced + pvRaw - rawSoldTotal), unit: 'Qntl', details: `Milling: ${rawProduced}Q + Purchase: ${pvRaw}Q - Pvt: ${pvtSoldRaw}Q - Sale: ${sbSold['Rice (Raw)'] || 0}Q` });
    products.forEach(p => {
      const produced = bpProduced[p] || 0; const soldBp = round2(bpSoldMap[p] || 0);
      const soldSb = sbSold[p.charAt(0).toUpperCase() + p.slice(1)] || 0;
      const purchased = pvBought[p.charAt(0).toUpperCase() + p.slice(1)] || 0;
      const totalIn = round2(produced + purchased); const totalOut = round2(soldBp + soldSb);
      stockItems.push({ name: p.charAt(0).toUpperCase() + p.slice(1), category: 'By-Product', in_qty: totalIn, out_qty: totalOut, available: round2(totalIn - totalOut), unit: 'Qntl', details: `Milling: ${produced}Q + Purchased: ${purchased}Q - Sold: ${soldBp}Q - Sale Voucher: ${soldSb}Q` });
    });
    const frkPurchasedPv = pvBought['FRK'] || 0;
    const frkTotalIn = round2(frkIn + frkPurchasedPv); const frkSoldSb = sbSold['FRK'] || 0;
    stockItems.push({ name: 'FRK', category: 'By-Product', in_qty: frkTotalIn, out_qty: frkSoldSb, available: round2(frkTotalIn - frkSoldSb), unit: 'Qntl', details: `FRK Purchase: ${frkIn}Q + Purchase Voucher: ${frkPurchasedPv}Q - Sale Voucher: ${frkSoldSb}Q` });
    const knownItems = new Set(['Paddy', 'Rice (Usna)', 'Rice (Raw)', 'FRK', ...products.map(p => p.charAt(0).toUpperCase() + p.slice(1))]);
    for (const [itemName, qty] of Object.entries(pvBought)) {
      if (!knownItems.has(itemName)) { const sold = sbSold[itemName] || 0; stockItems.push({ name: itemName, category: 'Custom', in_qty: round2(qty), out_qty: round2(sold), available: round2(qty - sold), unit: 'Qntl', details: `Purchased: ${qty}Q - Sold: ${sold}Q` }); }
    }
    const gunnyIn = gunnyEntries.filter(e => e.txn_type === 'in').reduce((s, e) => s + (e.quantity || 0), 0);
    const gunnyOut = gunnyEntries.filter(e => e.txn_type === 'out').reduce((s, e) => s + (e.quantity || 0), 0);
    if (gunnyIn > 0 || gunnyOut > 0) {
      const newIn = gunnyEntries.filter(e => e.txn_type === 'in' && e.bag_type === 'new').reduce((s, e) => s + (e.quantity || 0), 0);
      const oldIn = gunnyEntries.filter(e => e.txn_type === 'in' && e.bag_type === 'old').reduce((s, e) => s + (e.quantity || 0), 0);
      stockItems.push({ name: 'Gunny Bags', category: 'Raw Material', in_qty: gunnyIn, out_qty: gunnyOut, available: gunnyIn - gunnyOut, unit: 'Bags', details: `Govt(New): ${newIn} + Market(Old): ${oldIn} - Used: ${gunnyOut}` });
    }
    return stockItems;
  };

  // ===== STOCK SUMMARY EXCEL (COLORFUL) =====
  router.get('/api/stock-summary/export/excel', safeHandler(async (req, res) => {
    const ExcelJS = require('exceljs');
    const items = getStockItems(req);
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock Summary');

    const thinBorder = { style: 'thin', color: { argb: 'FFCBD5E1' } };
    const border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

    // Title
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${company} - Stock Summary`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF1565C0' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Meta
    ws.mergeCells('A2:F2');
    const metaCell = ws.getCell('A2');
    const parts = ['Stock Summary Report'];
    if (req.query.kms_year) parts.push(`FY: ${req.query.kms_year}`);
    if (req.query.season) parts.push(req.query.season);
    parts.push(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    metaCell.value = parts.join(' | ');
    metaCell.font = { size: 8, color: { argb: 'FF666666' } };
    metaCell.alignment = { horizontal: 'center' };

    // Group items
    const grouped = {};
    items.forEach(item => { const c = item.category || 'Other'; if (!grouped[c]) grouped[c] = []; grouped[c].push(item); });

    const catFills = {
      'Raw Material': { argb: 'FFFFF7ED' }, 'Finished': { argb: 'FFF0FDF4' },
      'By-Product': { argb: 'FFEFF6FF' }, 'Custom': { argb: 'FFF5F3FF' },
    };
    const catHeaderFills = {
      'Raw Material': { argb: 'FFFEF3C7' }, 'Finished': { argb: 'FFD1FAE5' },
      'By-Product': { argb: 'FFDBEAFE' }, 'Custom': { argb: 'FFEDE9FE' },
    };
    const catTextColors = {
      'Raw Material': { argb: 'FFD97706' }, 'Finished': { argb: 'FF059669' },
      'By-Product': { argb: 'FF2563EB' }, 'Custom': { argb: 'FF7C3AED' },
    };

    let row = 4;
    for (const [catName, catItems] of Object.entries(grouped)) {
      // Category header row
      ws.mergeCells(`A${row}:F${row}`);
      const catCell = ws.getCell(`A${row}`);
      catCell.value = `${catName} (${catItems.length} items)`;
      catCell.font = { bold: true, size: 11, color: catTextColors[catName] || { argb: 'FF1E293B' } };
      catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: catHeaderFills[catName] || { argb: 'FFF1F5F9' } };
      catCell.border = border;
      ws.getRow(row).height = 24;
      row++;

      // Column headers
      const headers = ['Item', 'In (Qntl)', 'Out (Qntl)', 'Available', 'Unit', 'Details'];
      const hdrRow = ws.getRow(row);
      headers.forEach((h, i) => {
        const cell = hdrRow.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: ['In (Qntl)', 'Out (Qntl)', 'Available'].includes(h) ? 'right' : 'left', vertical: 'middle' };
        cell.border = border;
      });
      ws.getRow(row).height = 20;
      row++;

      // Data rows
      catItems.forEach((item, idx) => {
        const dataRow = ws.getRow(row);
        const vals = [item.name, item.in_qty, item.out_qty, `${item.available} ${item.unit}`, item.unit, item.details];
        const rowFill = idx % 2 === 0 ? { argb: 'FFFFFFFF' } : (catFills[catName] || { argb: 'FFF8FAFC' });
        vals.forEach((val, i) => {
          const cell = dataRow.getCell(i + 1);
          cell.value = val;
          cell.border = border;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: rowFill };
          if (i === 0) {
            cell.font = { bold: true, size: 9, color: { argb: 'FF1E293B' } };
          } else if (i === 1) {
            cell.font = { size: 9, color: { argb: 'FF059669' } };
            cell.alignment = { horizontal: 'right' };
          } else if (i === 2) {
            cell.font = { size: 9, color: { argb: 'FFDC2626' } };
            cell.alignment = { horizontal: 'right' };
          } else if (i === 3) {
            cell.font = { bold: true, size: 10, color: { argb: item.available < 0 ? 'FFDC2626' : 'FF059669' } };
            cell.alignment = { horizontal: 'right' };
          } else if (i === 5) {
            cell.font = { size: 7, color: { argb: 'FF888888' } };
          }
        });
        ws.getRow(row).height = 20;
        row++;
      });
      row++; // gap
    }

    // Column widths
    [22, 14, 14, 18, 8, 50].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Footer
    ws.mergeCells(`A${row}:F${row}`);
    const footCell = ws.getCell(`A${row}`);
    footCell.value = `${company} - Stock Summary | Generated: ${new Date().toLocaleDateString('en-IN')}`;
    footCell.font = { size: 7, color: { argb: 'FF999999' }, italic: true };
    footCell.alignment = { horizontal: 'center' };

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock_summary.xlsx');
    res.send(Buffer.from(buf));
  }));

  // ===== STOCK SUMMARY PDF (COLORFUL with pdfkit) =====
  router.get('/api/stock-summary/export/pdf', safeHandler(async (req, res) => {
    const { addPdfHeader } = require('./pdf_helpers');
    const items = getStockItems(req);
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';

    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=stock_summary.pdf`);
    doc.pipe(res);

    // Header
    addPdfHeader(doc, 'Stock Summary Report');
    const metaParts = [];
    if (req.query.kms_year) metaParts.push(`FY: ${req.query.kms_year}`);
    if (req.query.season) metaParts.push(req.query.season);
    metaParts.push(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    doc.fontSize(8).font('Helvetica').fillColor('#666666').text(metaParts.join(' | '), { align: 'center' });
    doc.moveDown(0.8);

    // Group items
    const grouped = {};
    items.forEach(item => { const c = item.category || 'Other'; if (!grouped[c]) grouped[c] = []; grouped[c].push(item); });

    const catColors = { 'Raw Material': '#D97706', 'Finished': '#059669', 'By-Product': '#2563EB', 'Custom': '#7C3AED' };
    const catBgs = { 'Raw Material': '#FEF3C7', 'Finished': '#D1FAE5', 'By-Product': '#DBEAFE', 'Custom': '#EDE9FE' };

    const pageW = 535; // A4 width - margins
    const cols = [120, 70, 70, 90, 185]; // Item, In, Out, Available, Details

    for (const [catName, catItems] of Object.entries(grouped)) {
      // Check page space
      if (doc.y > 680) doc.addPage();

      // Category header with colored background
      const catColor = catColors[catName] || '#666666';
      const catBg = catBgs[catName] || '#F1F5F9';
      doc.save();
      doc.roundedRect(30, doc.y, pageW, 22, 3).fill(catBg);
      doc.restore();
      doc.fillColor(catColor).fontSize(10).font('Helvetica-Bold')
        .text(`${catName} (${catItems.length} items)`, 40, doc.y + 5, { width: pageW - 20 });
      doc.y += 12;

      // Table header
      const headerY = doc.y;
      doc.save();
      doc.rect(30, headerY, pageW, 18).fill('#1E293B');
      doc.restore();
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      let xPos = 35;
      ['Item', 'In (Qntl)', 'Out (Qntl)', 'Available', 'Details'].forEach((h, i) => {
        const align = [1, 2, 3].includes(i) ? 'right' : 'left';
        doc.text(h, xPos, headerY + 4, { width: cols[i] - 10, align });
        xPos += cols[i];
      });
      doc.y = headerY + 20;

      // Data rows
      catItems.forEach((item, idx) => {
        if (doc.y > 750) { doc.addPage(); doc.y = 40; }
        const rowY = doc.y;
        const rowH = 18;

        // Alternating row bg
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(30, rowY, pageW, rowH).fill('#F8FAFC');
          doc.restore();
        }

        // Grid lines
        doc.save();
        doc.rect(30, rowY, pageW, rowH).stroke('#E2E8F0');
        doc.restore();

        xPos = 35;
        // Item name
        doc.fillColor('#1E293B').fontSize(8).font('Helvetica-Bold')
          .text(item.name, xPos, rowY + 4, { width: cols[0] - 10 });
        xPos += cols[0];

        // In qty (green)
        doc.fillColor('#059669').fontSize(8).font('Helvetica')
          .text(`${item.in_qty} ${item.unit}`, xPos, rowY + 4, { width: cols[1] - 10, align: 'right' });
        xPos += cols[1];

        // Out qty (red)
        doc.fillColor('#DC2626').fontSize(8).font('Helvetica')
          .text(`${item.out_qty} ${item.unit}`, xPos, rowY + 4, { width: cols[2] - 10, align: 'right' });
        xPos += cols[2];

        // Available (bold, colored)
        const availColor = item.available < 0 ? '#DC2626' : '#059669';
        doc.fillColor(availColor).fontSize(9).font('Helvetica-Bold')
          .text(`${item.available} ${item.unit}`, xPos, rowY + 3, { width: cols[3] - 10, align: 'right' });
        xPos += cols[3];

        // Details (grey, small)
        doc.fillColor('#888888').fontSize(6).font('Helvetica')
          .text(item.details || '', xPos, rowY + 5, { width: cols[4] - 10 });

        doc.y = rowY + rowH;
      });
      doc.moveDown(0.5);
    }

    // Footer
    doc.moveDown(1);
    doc.fontSize(7).font('Helvetica').fillColor('#999999')
      .text(`${company} - Stock Summary | Generated: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });

    doc.end();
  }));

  return router;
};
