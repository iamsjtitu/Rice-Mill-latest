const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');
const PDFDocument = require('pdfkit');

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
    if (search) { const s = search.toLowerCase(); vouchers = vouchers.filter(v => (v.party_name || '').toLowerCase().includes(s) || (v.voucher_no || '').toLowerCase().includes(s) || (v.invoice_no || '').toLowerCase().includes(s) || (v.destination || '').toLowerCase().includes(s) || (v.bill_book || '').toLowerCase().includes(s)); }
    vouchers.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)));
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

  // Helper: compute per-item GST and voucher totals
  function computeSaleGst(d) {
    const items = d.items || [];
    const gstType = d.gst_type || 'none';
    let subtotal = 0, totalGst = 0;
    items.forEach(i => {
      const qty = parseFloat(i.quantity) || 0;
      const rate = parseFloat(i.rate) || 0;
      i.amount = Math.round(qty * rate * 100) / 100;
      const gstPct = parseFloat(i.gst_percent) || 0;
      i.gst_amount = gstType !== 'none' ? Math.round(i.amount * gstPct / 100 * 100) / 100 : 0;
      subtotal += i.amount;
      totalGst += i.gst_amount;
    });
    d.items = items;
    d.subtotal = Math.round(subtotal * 100) / 100;
    if (gstType === 'cgst_sgst') {
      d.cgst_amount = Math.round(totalGst / 2 * 100) / 100;
      d.sgst_amount = Math.round(totalGst / 2 * 100) / 100;
      d.igst_amount = 0;
    } else if (gstType === 'igst') {
      d.cgst_amount = 0; d.sgst_amount = 0;
      d.igst_amount = Math.round(totalGst * 100) / 100;
    } else {
      d.cgst_amount = 0; d.sgst_amount = 0; d.igst_amount = 0;
    }
    d.total = Math.round((d.subtotal + (d.cgst_amount || 0) + (d.sgst_amount || 0) + (d.igst_amount || 0)) * 100) / 100;
    const advance = parseFloat(d.advance) || 0;
    d.paid_amount = Math.round(advance * 100) / 100;
    d.balance = Math.round((d.total - advance) * 100) / 100;
  }

  // POST /api/sale-book
  router.post('/api/sale-book', safeHandler(async (req, res) => {
    ensure();
    const d = { id: uuidv4(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    computeSaleGst(d);
    database.data.sale_vouchers.push(d);
    createSaleLedgerEntries(d, d.id, d.voucher_no, d.items || []);
    database.save();
    res.json(d);
  }));

  // PUT /api/sale-book/:id
  router.put('/api/sale-book/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.sale_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const d = { ...database.data.sale_vouchers[idx], ...req.body, updated_at: new Date().toISOString() };
    computeSaleGst(d);
    database.data.sale_vouchers[idx] = d;
    cleanupSaleEntries(d.id);
    createSaleLedgerEntries(d, d.id, d.voucher_no, d.items || []);
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
    <div class="info"><div><label>Bill No</label><span>${v.invoice_no || ''}</span></div><div><label>Date</label><span>${fmtDate(v.date) || ''}</span></div><div><label>Party</label><span>${v.party_name || ''}</span></div><div><label>Destination</label><span>${v.destination || ''}</span></div><div><label>Voucher</label><span>#${v.voucher_no || ''}</span></div><div><label>Truck</label><span>${v.truck_no || ''}</span></div><div><label>RST</label><span>${v.rst_no || ''}</span></div><div><label>E-Way Bill</label><span>${v.eway_bill_no || ''}</span></div><div><label>Bill Book</label><span>${v.bill_book || ''}</span></div></div>
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
    const { addPdfHeader, addPdfTable, addTotalsRow, fmtAmt, safePdfPipe, fmtDate } = require('./pdf_helpers');
    let vouchers = [...database.data.sale_vouchers];
    const { kms_year, season } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    vouchers.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));

    const branding = database.getBranding ? database.getBranding() : {};
    const subtitleParts = ['Sale Book'];
    if (kms_year) subtitleParts.push(`FY: ${kms_year}`);
    if (season) subtitleParts.push(season);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });

    addPdfHeader(doc, subtitleParts.join(' | '), branding);

    const headers = ['#', 'Date', 'Inv', 'Party', 'Items', 'Truck/RST', 'Total', 'Adv', 'Cash', 'Diesel', 'Balance', 'Status'];
    const colW = [30, 52, 40, 70, 150, 60, 55, 45, 45, 45, 55, 45];

    const g = { total: 0, adv: 0, cash: 0, diesel: 0, bal: 0 };
    const rows = vouchers.map(v => {
      const itemsStr = (v.items || []).map(i => `${i.item_name}(${i.quantity}Q)`).join(', ');
      const total = v.total || 0;
      const adv = v.advance || 0;
      const cash = v.cash_paid || 0;
      const diesel = v.diesel_paid || 0;
      const balance = v.balance || 0;
      g.total += total; g.adv += adv; g.cash += cash; g.diesel += diesel; g.bal += balance;
      const status = balance <= 0 && total > 0 ? 'Paid' : 'Pending';
      const dp = String(v.date || '').split('-');
      const fd = dp.length === 3 ? `${dp[2]}/${dp[1]}/${dp[0]}` : (v.date || '');
      const truck = v.truck_no ? `${v.truck_no}${v.rst_no ? '/' + v.rst_no : ''}` : '';
      return [
        `#${v.voucher_no || ''}`, fd, v.invoice_no || '', v.party_name || '',
        itemsStr, truck, fmtAmt(total), fmtAmt(adv), fmtAmt(cash),
        fmtAmt(diesel), fmtAmt(balance), status
      ];
    });

    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    addTotalsRow(doc, [
      `TOTAL (${vouchers.length})`, '', '', '', '', '',
      fmtAmt(Math.round(g.total)), fmtAmt(Math.round(g.adv)), fmtAmt(Math.round(g.cash)),
      fmtAmt(Math.round(g.diesel)), fmtAmt(Math.round(g.bal)), ''
    ], colW, { fontSize: 6.5 });

    await safePdfPipe(doc, res, `sale_book_${Date.now()}.pdf`);
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
      ws.addRow([v.voucher_no, fmtDate(v.date), v.invoice_no, v.party_name, itemsStr, `${v.truck_no||''}${v.rst_no?'/'+v.rst_no:''}`, v.eway_bill_no || '', v.subtotal||0, Math.round(gst), v.total||0, v.advance||0, v.cash_paid||0, v.diesel_paid||0, v.balance||0]);
    }
    ws.columns.forEach(c => c.width = 15);
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sale_book.xlsx`);
    res.send(Buffer.from(buf));
  }));

  // Missing endpoints: stock-items, delete-bulk, individual PDF
  router.get('/api/sale-book/stock-items', safeHandler(async (req, res) => {
    ensure();
    const { kms_year, season } = req.query;
    const filter = (arr) => {
      let r = arr || [];
      if (kms_year) r = r.filter(e => e.kms_year === kms_year);
      if (season) r = r.filter(e => e.season === season);
      return r;
    };
    const round2 = v => Math.round((v || 0) * 100) / 100;

    // Opening stock
    const ob = {};
    if (kms_year && database.data.opening_stock) {
      const obDoc = database.data.opening_stock.find(s => s.kms_year === kms_year);
      if (obDoc && obDoc.stocks) Object.assign(ob, obDoc.stocks);
    }
    const obUsna = parseFloat(ob.rice_usna || ob.rice || 0);
    const obRaw = parseFloat(ob.rice_raw || 0);
    const obBran = parseFloat(ob.bran || 0);
    const obKunda = parseFloat(ob.kunda || 0);
    const obBroken = parseFloat(ob.broken || 0);
    const obKanki = parseFloat(ob.kanki || 0);
    const obHusk = parseFloat(ob.husk || 0);
    const obFrk = parseFloat(ob.frk || 0);

    const milling = filter(database.data.milling_entries);
    const dc = filter(database.data.dc_entries);
    const pvtSales = filter(database.data.rice_sales);
    const saleVouchers = filter(database.data.sale_vouchers);
    const purchaseVouchers = filter(database.data.purchase_vouchers);
    const bpSales = filter(database.data.byproduct_sales);
    const frkPurchases = filter(database.data.frk_purchases);

    const usnaProduced = round2(milling.filter(e => ['usna', 'parboiled'].includes((e.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const rawProduced = round2(milling.filter(e => (e.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const govtDelivered = round2(dc.reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldUsna = round2(pvtSales.filter(s => ['usna', 'parboiled'].includes((s.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldRaw = round2(pvtSales.filter(s => (s.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.quantity_qntl || 0), 0));

    const sbSold = {};
    saleVouchers.forEach(sv => (sv.items || []).forEach(i => { sbSold[i.item_name || ''] = (sbSold[i.item_name || ''] || 0) + (parseFloat(i.quantity) || 0); }));
    const pvBought = {};
    purchaseVouchers.forEach(pv => (pv.items || []).forEach(i => { pvBought[i.item_name || ''] = (pvBought[i.item_name || ''] || 0) + (parseFloat(i.quantity) || 0); }));

    // Dynamic by-product categories
    const bpCats = database.data.byproduct_categories && database.data.byproduct_categories.length > 0
      ? [...database.data.byproduct_categories].sort((a,b) => (a.order||0)-(b.order||0))
      : [{id:'bran',name:'Bran'},{id:'kunda',name:'Kunda'},{id:'broken',name:'Broken'},{id:'kanki',name:'Kanki'},{id:'husk',name:'Husk'}];
    const products = bpCats.map(c => c.id);
    const bpProduced = {};
    products.forEach(p => { bpProduced[p] = round2(milling.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0)); });
    const bpSoldMap = {};
    (bpSales || []).forEach(s => { bpSoldMap[s.product || ''] = (bpSoldMap[s.product || ''] || 0) + (s.quantity_qntl || 0); });

    const items = [];
    items.push({ name: 'Rice (Usna)', available_qntl: round2(obUsna + usnaProduced + (pvBought['Rice (Usna)'] || 0) - govtDelivered - pvtSoldUsna - (sbSold['Rice (Usna)'] || 0)), unit: 'Qntl' });
    items.push({ name: 'Rice (Raw)', available_qntl: round2(obRaw + rawProduced + (pvBought['Rice (Raw)'] || 0) - pvtSoldRaw - (sbSold['Rice (Raw)'] || 0)), unit: 'Qntl' });
    bpCats.forEach(cat => {
      const p = cat.id;
      const displayName = cat.name || (p.charAt(0).toUpperCase() + p.slice(1));
      const produced = bpProduced[p] || 0;
      const purchased = (pvBought[displayName] || 0) + (pvBought[p.charAt(0).toUpperCase() + p.slice(1)] || 0) + (pvBought[p] || 0);
      const soldBp = round2(bpSoldMap[p] || 0);
      const soldSb = (sbSold[displayName] || 0) + (sbSold[p.charAt(0).toUpperCase() + p.slice(1)] || 0) + (sbSold[p] || 0);
      const itemOb = parseFloat(ob[p] || 0);
      items.push({ name: displayName, available_qntl: round2(itemOb + produced + purchased - soldBp - soldSb), unit: 'Qntl' });
    });
    const frkIn = round2((frkPurchases || []).reduce((s, e) => s + (e.quantity_qntl || e.quantity || 0), 0));
    items.push({ name: 'FRK', available_qntl: round2(obFrk + frkIn + (pvBought['FRK'] || 0) - (sbSold['FRK'] || 0)), unit: 'Qntl' });

    const knownItems = new Set(['Rice (Usna)', 'Rice (Raw)', 'FRK', ...bpCats.map(c => c.name || (c.id.charAt(0).toUpperCase() + c.id.slice(1)))]);
    for (const [name, qty] of Object.entries(pvBought)) {
      if (!knownItems.has(name) && name) {
        items.push({ name, available_qntl: round2(qty - (sbSold[name] || 0)), unit: 'Qntl' });
      }
    }
    res.json(items);
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
    html += `<p><b>Date:</b> ${fmtDate(v.date) || ''} | <b>Party:</b> ${v.party_name || ''} | <b>Invoice:</b> ${v.invoice_no || ''} | <b>Truck:</b> ${v.truck_no || ''}</p>`;
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

    // ===== FETCH OPENING STOCK =====
    const ob = {};
    if (kms_year && database.data.opening_stock) {
      const obDoc = database.data.opening_stock.find(s => s.kms_year === kms_year);
      if (obDoc && obDoc.stocks) Object.assign(ob, obDoc.stocks);
    }
    const obPaddy = parseFloat(ob.paddy || 0);
    const obUsna = parseFloat(ob.rice_usna || ob.rice || 0);
    const obRaw = parseFloat(ob.rice_raw || 0);
    const obFrk = parseFloat(ob.frk || 0);

    // Dynamic by-product categories
    const bpCats = database.data.byproduct_categories && database.data.byproduct_categories.length > 0
      ? [...database.data.byproduct_categories].sort((a,b) => (a.order||0)-(b.order||0))
      : [{id:'bran',name:'Bran'},{id:'kunda',name:'Kunda'},{id:'broken',name:'Broken'},{id:'kanki',name:'Kanki'},{id:'husk',name:'Husk'}];
    const products = bpCats.map(c => c.id);
    const bpObMap = {};
    products.forEach(p => { bpObMap[p] = parseFloat(ob[p] || 0); });

    const milling = filter(database.data.milling_entries, kms_year, season);
    const dc = filter(database.data.dc_entries, kms_year, season);
    const pvtSales = filter(database.data.rice_sales, kms_year, season);
    const saleVouchers = filter(database.data.sale_vouchers, kms_year, season);
    const bpSales = filter(database.data.byproduct_sales, kms_year, season);
    const purchaseVouchers = filter(database.data.purchase_vouchers, kms_year, season);
    const millEntries = filter(database.data.entries, kms_year, season);
    const pvtPaddy = filter(database.data.private_paddy, kms_year, season).filter(e => e.source !== 'agent_extra');
    const frkPurchases = filter(database.data.frk_purchases, kms_year, season);

    const cmrPaddyIn = round2(millEntries.reduce((s, e) => s + (e.qntl || 0) - (e.bag || 0) / 100 - (e.p_pkt_cut || 0) / 100, 0));
    const pvtPaddyIn = round2(pvtPaddy.reduce((s, e) => s + ((e.final_qntl || 0) || ((e.qntl || 0) - (e.bag || 0) / 100)), 0));
    const paddyUsedMilling = round2(milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0));
    const usnaProduced = round2(milling.filter(e => ['usna', 'parboiled'].includes((e.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const rawProduced = round2(milling.filter(e => (e.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0));
    const govtDelivered = round2(dc.reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldUsna = round2(pvtSales.filter(s => ['usna', 'parboiled'].includes((s.rice_type || '').toLowerCase())).reduce((s, e) => s + (e.quantity_qntl || 0), 0));
    const pvtSoldRaw = round2(pvtSales.filter(s => (s.rice_type || '').toLowerCase() === 'raw').reduce((s, e) => s + (e.quantity_qntl || 0), 0));

    const sbSold = {};
    saleVouchers.forEach(sv => (sv.items || []).forEach(i => { const n = i.item_name || ''; sbSold[n] = (sbSold[n] || 0) + (parseFloat(i.quantity) || 0); }));
    const pvBought = {};
    purchaseVouchers.forEach(pv => (pv.items || []).forEach(i => { const n = i.item_name || ''; pvBought[n] = (pvBought[n] || 0) + (parseFloat(i.quantity) || 0); }));

    // Dynamic by-product categories
    const bpCatsMain = database.data.byproduct_categories && database.data.byproduct_categories.length > 0
      ? [...database.data.byproduct_categories].sort((a,b) => (a.order||0)-(b.order||0))
      : [{id:'bran',name:'Bran'},{id:'kunda',name:'Kunda'},{id:'broken',name:'Broken'},{id:'kanki',name:'Kanki'},{id:'husk',name:'Husk'}];
    const products = bpCatsMain.map(c => c.id);
    const bpProduced = {};
    products.forEach(p => { bpProduced[p] = round2(milling.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0)); });
    const bpSoldMap = {};
    bpSales.forEach(s => { const p = s.product || ''; bpSoldMap[p] = (bpSoldMap[p] || 0) + (s.quantity_qntl || 0); });

    const frkIn = round2((frkPurchases || []).reduce((s, e) => s + (e.quantity_qntl || e.quantity || 0), 0));

    const stockItems = [];

    // Paddy (with opening)
    const pvPaddy = round2(pvBought['Paddy'] || 0);
    const paddyTotalIn = round2(cmrPaddyIn + pvtPaddyIn + pvPaddy);
    stockItems.push({ name: 'Paddy', category: 'Raw Material', opening: obPaddy, in_qty: paddyTotalIn, out_qty: paddyUsedMilling, available: round2(obPaddy + paddyTotalIn - paddyUsedMilling), unit: 'Qntl', details: `OB: ${obPaddy}Q + CMR: ${cmrPaddyIn}Q + Pvt: ${pvtPaddyIn}Q + Purchase: ${pvPaddy}Q - Milling: ${paddyUsedMilling}Q` });

    // Rice Usna (with opening)
    const pvUsna = round2(pvBought['Rice (Usna)'] || 0);
    const usnaSoldTotal = round2(govtDelivered + pvtSoldUsna + (sbSold['Rice (Usna)'] || 0));
    stockItems.push({ name: 'Rice (Usna)', category: 'Finished', opening: obUsna, in_qty: round2(usnaProduced + pvUsna), out_qty: usnaSoldTotal, available: round2(obUsna + usnaProduced + pvUsna - usnaSoldTotal), unit: 'Qntl', details: `OB: ${obUsna}Q + Milling: ${usnaProduced}Q + Purchase: ${pvUsna}Q - DC: ${govtDelivered}Q - Pvt: ${pvtSoldUsna}Q - Sale: ${sbSold['Rice (Usna)'] || 0}Q` });

    // Rice Raw (with opening)
    const pvRaw = round2(pvBought['Rice (Raw)'] || 0);
    const rawSoldTotal = round2(pvtSoldRaw + (sbSold['Rice (Raw)'] || 0));
    stockItems.push({ name: 'Rice (Raw)', category: 'Finished', opening: obRaw, in_qty: round2(rawProduced + pvRaw), out_qty: rawSoldTotal, available: round2(obRaw + rawProduced + pvRaw - rawSoldTotal), unit: 'Qntl', details: `OB: ${obRaw}Q + Milling: ${rawProduced}Q + Purchase: ${pvRaw}Q - Pvt: ${pvtSoldRaw}Q - Sale: ${sbSold['Rice (Raw)'] || 0}Q` });

    // By-products (with opening) - dynamic categories
    products.forEach(p => {
      const cat = bpCats.find(c => c.id === p);
      const displayName = cat ? cat.name : p.charAt(0).toUpperCase() + p.slice(1);
      const produced = bpProduced[p] || 0;
      const soldBp = round2(bpSoldMap[p] || 0);
      const soldSb = (sbSold[displayName] || 0) + (sbSold[p.charAt(0).toUpperCase() + p.slice(1)] || 0) + (sbSold[p] || 0);
      const purchased = (pvBought[displayName] || 0) + (pvBought[p.charAt(0).toUpperCase() + p.slice(1)] || 0) + (pvBought[p] || 0);
      const itemOb = bpObMap[p] || 0;
      const totalIn = round2(produced + purchased);
      const totalOut = round2(soldBp + soldSb);
      stockItems.push({ name: displayName, category: 'By-Product', opening: itemOb, in_qty: totalIn, out_qty: totalOut, available: round2(itemOb + totalIn - totalOut), unit: 'Qntl', details: `OB: ${itemOb}Q + Milling: ${produced}Q + Purchased: ${purchased}Q - Sold: ${soldBp}Q - Sale Voucher: ${soldSb}Q` });
    });

    // FRK (with opening)
    const frkPurchasedPv = pvBought['FRK'] || 0;
    const frkTotalIn = round2(frkIn + frkPurchasedPv);
    const frkSoldSb = sbSold['FRK'] || 0;
    stockItems.push({ name: 'FRK', category: 'By-Product', opening: obFrk, in_qty: frkTotalIn, out_qty: frkSoldSb, available: round2(obFrk + frkTotalIn - frkSoldSb), unit: 'Qntl', details: `OB: ${obFrk}Q + FRK Purchase: ${frkIn}Q + Purchase Voucher: ${frkPurchasedPv}Q - Sale Voucher: ${frkSoldSb}Q` });

    // Custom items - exclude known dynamic categories
    const knownItemNames = new Set(['Paddy', 'Rice (Usna)', 'Rice (Raw)', 'FRK']);
    bpCats.forEach(c => { knownItemNames.add(c.name); knownItemNames.add(c.id.charAt(0).toUpperCase() + c.id.slice(1)); knownItemNames.add(c.id); });
    for (const [itemName, qty] of Object.entries(pvBought)) {
      if (!knownItemNames.has(itemName)) {
        const sold = sbSold[itemName] || 0;
        stockItems.push({ name: itemName, category: 'Custom', opening: 0, in_qty: round2(qty), out_qty: round2(sold), available: round2(qty - sold), unit: 'Qntl', details: `Purchased: ${qty}Q - Sold: ${sold}Q` });
      }
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
    // Dynamic by-product categories
    const bpCatsH = database.data.byproduct_categories && database.data.byproduct_categories.length > 0
      ? [...database.data.byproduct_categories].sort((a,b) => (a.order||0)-(b.order||0))
      : [{id:'bran',name:'Bran'},{id:'kunda',name:'Kunda'},{id:'broken',name:'Broken'},{id:'kanki',name:'Kanki'},{id:'husk',name:'Husk'}];
    const products = bpCatsH.map(c => c.id);
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
      const cat = bpCatsH.find(c => c.id === p);
      const displayName = cat ? cat.name : p.charAt(0).toUpperCase() + p.slice(1);
      const produced = bpProduced[p] || 0; const soldBp = round2(bpSoldMap[p] || 0);
      const soldSb = (sbSold[displayName] || 0) + (sbSold[p.charAt(0).toUpperCase() + p.slice(1)] || 0) + (sbSold[p] || 0);
      const purchased = (pvBought[displayName] || 0) + (pvBought[p.charAt(0).toUpperCase() + p.slice(1)] || 0) + (pvBought[p] || 0);
      const totalIn = round2(produced + purchased); const totalOut = round2(soldBp + soldSb);
      stockItems.push({ name: displayName, category: 'By-Product', in_qty: totalIn, out_qty: totalOut, available: round2(totalIn - totalOut), unit: 'Qntl', details: `Milling: ${produced}Q + Purchased: ${purchased}Q - Sold: ${soldBp}Q - Sale Voucher: ${soldSb}Q` });
    });
    const frkPurchasedPv = pvBought['FRK'] || 0;
    const frkTotalIn = round2(frkIn + frkPurchasedPv); const frkSoldSb = sbSold['FRK'] || 0;
    stockItems.push({ name: 'FRK', category: 'By-Product', in_qty: frkTotalIn, out_qty: frkSoldSb, available: round2(frkTotalIn - frkSoldSb), unit: 'Qntl', details: `FRK Purchase: ${frkIn}Q + Purchase Voucher: ${frkPurchasedPv}Q - Sale Voucher: ${frkSoldSb}Q` });
    const knownItemsH = new Set(['Paddy', 'Rice (Usna)', 'Rice (Raw)', 'FRK']);
    bpCatsH.forEach(c => { knownItemsH.add(c.name); knownItemsH.add(c.id.charAt(0).toUpperCase() + c.id.slice(1)); knownItemsH.add(c.id); });
    for (const [itemName, qty] of Object.entries(pvBought)) {
      if (!knownItemsH.has(itemName)) { const sold = sbSold[itemName] || 0; stockItems.push({ name: itemName, category: 'Custom', in_qty: round2(qty), out_qty: round2(sold), available: round2(qty - sold), unit: 'Qntl', details: `Purchased: ${qty}Q - Sold: ${sold}Q` }); }
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
    res.setHeader('Content-Disposition', `attachment; filename=stock_summary.xlsx`);
    res.send(Buffer.from(buf));
  }));

  // ===== STOCK SUMMARY PDF (COLORFUL with pdfkit) =====
  router.get('/api/stock-summary/export/pdf', safeHandler(async (req, res) => {
    const { addPdfHeader, registerFonts, F, safePdfPipe, fmtDate: _fd } = require('./pdf_helpers');
    const items = getStockItems(req);
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';

    const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=stock_summary.pdf`);
    // PDF will be sent via safePdfPipe

    // Header
    addPdfHeader(doc, 'Stock Summary Report');
    const metaParts = [];
    if (req.query.kms_year) metaParts.push(`FY: ${req.query.kms_year}`);
    if (req.query.season) metaParts.push(req.query.season);
    metaParts.push(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    doc.fontSize(8).font(F('normal')).fillColor('#666666').text(metaParts.join(' | '), { align: 'center' });
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
      doc.fillColor(catColor).fontSize(10).font(F('bold'))
        .text(`${catName} (${catItems.length} items)`, 40, doc.y + 5, { width: pageW - 20 });
      doc.y += 12;

      // Table header
      const headerY = doc.y;
      doc.save();
      doc.rect(30, headerY, pageW, 18).fill('#1E293B');
      doc.restore();
      doc.fillColor('#FFFFFF').fontSize(8).font(F('bold'));
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
        doc.fillColor('#1E293B').fontSize(8).font(F('bold'))
          .text(item.name, xPos, rowY + 4, { width: cols[0] - 10 });
        xPos += cols[0];

        // In qty (green)
        doc.fillColor('#059669').fontSize(8).font(F('normal'))
          .text(`${item.in_qty} ${item.unit}`, xPos, rowY + 4, { width: cols[1] - 10, align: 'right' });
        xPos += cols[1];

        // Out qty (red)
        doc.fillColor('#DC2626').fontSize(8).font(F('normal'))
          .text(`${item.out_qty} ${item.unit}`, xPos, rowY + 4, { width: cols[2] - 10, align: 'right' });
        xPos += cols[2];

        // Available (bold, colored)
        const availColor = item.available < 0 ? '#DC2626' : '#059669';
        doc.fillColor(availColor).fontSize(9).font(F('bold'))
          .text(`${item.available} ${item.unit}`, xPos, rowY + 3, { width: cols[3] - 10, align: 'right' });
        xPos += cols[3];

        // Details (grey, small)
        doc.fillColor('#888888').fontSize(6).font(F('normal'))
          .text(item.details || '', xPos, rowY + 5, { width: cols[4] - 10 });

        doc.y = rowY + rowH;
      });
      doc.moveDown(0.5);
    }

    // Footer
    doc.moveDown(1);
    doc.fontSize(7).font(F('normal')).fillColor('#999999')
      .text(`${company} - Stock Summary | Generated: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });

    await safePdfPipe(doc, res);
  }));

  return router;
};
