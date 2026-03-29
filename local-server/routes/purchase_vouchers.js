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

  // Helper: get default diesel pump name
  function getDefaultPump() {
    const dAccounts = database.data.diesel_accounts || [];
    const last = dAccounts[dAccounts.length - 1];
    return last ? (last.pump_name || 'Diesel Pump') : 'Diesel Pump';
  }

  // Helper: create all accounting entries for a purchase voucher (matching web backend)
  function createPurchaseLedgerEntries(d, docId, vno, items) {
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

    // 1. Party Ledger JAMA: total purchase amount (we owe the party)
    if (party && total > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'jama',
        amount: total, category: party, party_type: 'Purchase Voucher',
        description: `Purchase #${vno} - ${itemsStr}${descSuffix}`,
        reference: `purchase_voucher:${docId}`, ...base
      });
    }

    // 2. Advance paid to party: Ledger NIKASI (reduces what we owe) + Cash NIKASI (cash going out)
    if (advance > 0 && party) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'nikasi',
        amount: advance, category: party, party_type: 'Purchase Voucher',
        description: `Advance paid - Purchase #${vno}${descSuffix}`,
        reference: `purchase_voucher_adv:${docId}`, ...base
      });
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'cash', txn_type: 'nikasi',
        amount: advance, category: party, party_type: 'Purchase Voucher',
        description: `Advance paid - Purchase #${vno}${descSuffix}`,
        reference: `purchase_voucher_adv_cash:${docId}`, ...base
      });
    }

    // 3. Cash paid → Cash NIKASI (cash going out)
    if (cash > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'cash', txn_type: 'nikasi',
        amount: cash, category: truck || party, party_type: truck ? 'Truck' : 'Purchase Voucher',
        description: `Truck cash - Purchase #${vno}${descSuffix}`,
        reference: `purchase_voucher_cash:${docId}`, ...base
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
        description: `Diesel for truck - Purchase #${vno} - ${party}${descSuffix}`,
        reference: `purchase_voucher_diesel:${docId}`, ...base
      });
      database.data.diesel_accounts.push({
        id: uuidv4(), date: d.date || '', pump_id: pumpId, pump_name: pumpName,
        truck_no: truck, agent_name: party, amount: diesel, txn_type: 'debit',
        description: `Diesel for Purchase #${vno} - ${party}${descSuffix}`,
        reference: `purchase_voucher_diesel:${docId}`, ...base
      });
    }

    // 5. Truck cash+diesel → Truck Ledger NIKASI (deductions from future bhada)
    if (cash > 0 && truck) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'nikasi',
        amount: cash, category: truck, party_type: 'Truck',
        description: `Truck cash deduction - Purchase #${vno}${descSuffix}`,
        reference: `purchase_truck_cash:${docId}`, ...base
      });
    }
    if (diesel > 0 && truck) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: d.date || '', account: 'ledger', txn_type: 'nikasi',
        amount: diesel, category: truck, party_type: 'Truck',
        description: `Truck diesel deduction - Purchase #${vno}${descSuffix}`,
        reference: `purchase_truck_diesel:${docId}`, ...base
      });
    }
    const truckTotal = cash + diesel;
    if (truckTotal > 0 && truck) {
      database.data.truck_payments.push({
        entry_id: docId, truck_no: truck, date: d.date || '',
        cash_taken: cash, diesel_taken: diesel,
        gross_amount: 0, deductions: truckTotal, net_amount: 0, paid_amount: 0,
        balance_amount: 0, status: 'pending', source: 'Purchase Voucher',
        description: `Purchase #${vno} - ${party}${descSuffix}`,
        reference: `purchase_voucher_truck:${docId}`, ...base
      });
    }

    // 6. Local party accounts: debit for total purchase (we owe them)
    if (party && total > 0) {
      database.data.local_party_accounts.push({
        id: uuidv4(), date: d.date || '', party_name: party, txn_type: 'debit',
        amount: total, description: `Purchase #${vno} - ${itemsStr}${descSuffix}`,
        source_type: 'purchase_voucher', reference: `purchase_voucher:${docId}`, ...base
      });
    }
    // Advance paid = payment entry in local_party
    if (advance > 0 && party) {
      database.data.local_party_accounts.push({
        id: uuidv4(), date: d.date || '', party_name: party, txn_type: 'payment',
        amount: advance, description: `Advance paid - Purchase #${vno}${descSuffix}`,
        source_type: 'purchase_voucher_advance', reference: `purchase_voucher_adv:${docId}`, ...base
      });
    }
  }

  // Helper: cleanup all accounting entries for a purchase voucher
  function cleanupPurchaseEntries(docId) {
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        !(t.reference && t.reference.match && t.reference.match(new RegExp(`purchase_voucher.*:${docId}|purchase_truck.*:${docId}|purchase:${docId.slice(0,8)}`)))
      );
    }
    if (database.data.local_party_accounts) {
      database.data.local_party_accounts = database.data.local_party_accounts.filter(t =>
        !(t.reference && t.reference.match && t.reference.match(new RegExp(`purchase_voucher.*:${docId}`)))
      );
    }
    if (database.data.diesel_accounts) {
      database.data.diesel_accounts = database.data.diesel_accounts.filter(t =>
        !(t.reference && t.reference === `purchase_voucher_diesel:${docId}`)
      );
    }
    if (database.data.truck_payments) {
      database.data.truck_payments = database.data.truck_payments.filter(t =>
        !(t.reference && t.reference === `purchase_voucher_truck:${docId}`)
      );
    }
  }

  // POST /api/purchase-vouchers
  router.post('/api/purchase-vouchers', safeHandler(async (req, res) => {
    ensure();
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
    // Create all accounting entries
    createPurchaseLedgerEntries(d, d.id, d.voucher_no, items);
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
    // Cleanup old entries and recreate
    cleanupPurchaseEntries(d.id);
    createPurchaseLedgerEntries(d, d.id, d.voucher_no, items);
    database.save();
    res.json(d);
  }));

  // DELETE /api/purchase-vouchers/:id
  router.delete('/api/purchase-vouchers/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.purchase_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    // Cleanup all accounting entries
    cleanupPurchaseEntries(req.params.id);
    database.data.purchase_vouchers.splice(idx, 1);
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  // === Alias routes: Frontend uses /purchase-book, desktop has /purchase-vouchers ===
  router.get('/api/purchase-book', safeHandler(async (req, res) => {
    ensure();
    let vouchers = [...database.data.purchase_vouchers];
    const { kms_year, season, search } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    if (search) { const s = search.toLowerCase(); vouchers = vouchers.filter(v => (v.party_name || '').toLowerCase().includes(s) || (v.voucher_no || '').toLowerCase().includes(s)); }
    vouchers.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(vouchers);
  }));

  router.post('/api/purchase-book', safeHandler(async (req, res) => {
    ensure();
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
    createPurchaseLedgerEntries(d, d.id, d.voucher_no, items);
    database.save();
    res.json(d);
  }));

  router.put('/api/purchase-book/:id', safeHandler(async (req, res) => {
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
    cleanupPurchaseEntries(d.id);
    createPurchaseLedgerEntries(d, d.id, d.voucher_no, items);
    database.save();
    res.json(d);
  }));

  router.delete('/api/purchase-book/:id', safeHandler(async (req, res) => {
    ensure();
    const idx = database.data.purchase_vouchers.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    cleanupPurchaseEntries(req.params.id);
    database.data.purchase_vouchers.splice(idx, 1);
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  router.post('/api/purchase-book/delete-bulk', safeHandler(async (req, res) => {
    ensure();
    const ids = req.body.ids || [];
    ids.forEach(id => cleanupPurchaseEntries(id));
    database.data.purchase_vouchers = database.data.purchase_vouchers.filter(v => !ids.includes(v.id));
    database.save();
    res.json({ message: `${ids.length} deleted` });
  }));

  router.get('/api/purchase-book/item-suggestions', safeHandler(async (req, res) => {
    ensure();
    const items = new Set();
    database.data.purchase_vouchers.forEach(v => (v.items || []).forEach(i => { if (i.item_name) items.add(i.item_name); }));
    res.json([...items].sort());
  }));

  router.get('/api/purchase-book/stock-items', safeHandler(async (req, res) => {
    ensure();
    const { kms_year, season } = req.query;
    let vouchers = [...database.data.purchase_vouchers];
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

  router.get('/api/purchase-book/:id/pdf', safeHandler(async (req, res) => {
    ensure();
    const v = database.data.purchase_vouchers.find(x => x.id === req.params.id);
    if (!v) return res.status(404).json({ detail: 'Not found' });
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHeader, addPdfTable, addSummaryBox, fmtAmt: pFmt , safePdfPipe} = require('./pdf_helpers');
    const branding = database.getBranding ? database.getBranding() : {};
    const doc = new PDFDocument({ size: 'A4', margin: 25 });
 filename=purchase_voucher_${v.voucher_no || ''}.pdf`);
    // PDF will be sent via safePdfPipe
    _addPdfHeader(doc, `Purchase Voucher #${v.voucher_no || ''}`, branding, `Date: ${v.date || ''} | Party: ${v.party_name || ''} | Invoice: ${v.invoice_no || ''} | Truck: ${v.truck_no || ''}`);
    const headers = ['Item', 'HSN', 'Qty', 'Rate', 'Amount'];
    const rows = (v.items || []).map(i => [i.item_name||'', i.hsn_code||'', i.quantity||0, i.rate||0, i.amount||0]);
    addPdfTable(doc, headers, rows, [180, 80, 60, 60, 80]);
    addSummaryBox(doc, ['Subtotal', 'CGST', 'SGST', 'IGST', 'Total'], [pFmt(v.subtotal||0), pFmt(v.cgst_amount||0), pFmt(v.sgst_amount||0), pFmt(v.igst_amount||0), pFmt(v.total||0)], [90, 90, 90, 90, 90]);
    await safePdfPipe(doc, res);
  }));

  // PDF export (legacy path)
  router.get('/api/purchase-book/export/pdf', safeHandler(async (req, res) => {
    ensure();
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHeader, addPdfTable, addTotalsRow, fmtAmt: pFmt , safePdfPipe} = require('./pdf_helpers');
    const branding = database.getBranding ? database.getBranding() : {};
    let vouchers = [...database.data.purchase_vouchers];
    const { kms_year, season } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    vouchers.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
 filename=purchase_book.pdf');
    // PDF will be sent via safePdfPipe
    let subtitle = ''; if (kms_year) subtitle = `FY: ${kms_year}`; if (season) subtitle += ` | Season: ${season}`;
    _addPdfHeader(doc, 'Purchase Book', branding, subtitle);
    const headers = ['No.', 'Date', 'Inv No.', 'Party', 'Items', 'Truck', 'E-Way', 'Total', 'Advance', 'Cash', 'Diesel', 'Balance'];
    const colW = [35, 55, 50, 80, 100, 55, 55, 60, 55, 50, 50, 60];
    const g = { total: 0, adv: 0, cash: 0, diesel: 0, bal: 0 };
    const rows = vouchers.map(v => {
      const itemsStr = (v.items || []).map(i => `${i.item_name}(${i.quantity||0})`).join(', ');
      g.total += v.total || 0; g.adv += v.advance || 0; g.cash += v.cash_paid || 0; g.diesel += v.diesel_paid || 0; g.bal += v.balance || 0;
      return [v.voucher_no||'', v.date||'', v.invoice_no||'', v.party_name||'', itemsStr, v.truck_no||'', v.eway_bill_no||'', pFmt(v.total||0), pFmt(v.advance||0), pFmt(v.cash_paid||0), pFmt(v.diesel_paid||0), pFmt(v.balance||0)];
    });
    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    addTotalsRow(doc, [`TOTAL (${vouchers.length})`, '', '', '', '', '', '', pFmt(Math.round(g.total)), pFmt(Math.round(g.adv)), pFmt(Math.round(g.cash)), pFmt(Math.round(g.diesel)), pFmt(Math.round(g.bal))], colW, { fontSize: 6.5 });
    await safePdfPipe(doc, res);
  }));

  // Excel export
  router.get('/api/purchase-book/export/excel', safeHandler(async (req, res) => {
    ensure();
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    let vouchers = [...database.data.purchase_vouchers];
    const { kms_year, season } = req.query;
    if (kms_year) vouchers = vouchers.filter(v => v.kms_year === kms_year);
    if (season) vouchers = vouchers.filter(v => v.season === season);
    vouchers.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Purchase Book');
    const colCount = 12;
    let title = 'Purchase Book'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    addExcelTitle(ws, title, colCount, database);
    const hdrs = ['No.', 'Date', 'Inv No.', 'Party', 'Items', 'Truck', 'E-Way Bill', 'Total', 'Advance', 'Cash', 'Diesel', 'Balance'];
    hdrs.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    const g = { total: 0, adv: 0, cash: 0, diesel: 0, bal: 0 };
    vouchers.forEach((v, idx) => {
      const itemsStr = (v.items || []).map(i => `${i.item_name}(${i.quantity||0})`).join(', ');
      const vals = [v.voucher_no, v.date, v.invoice_no, v.party_name, itemsStr, v.truck_no, v.eway_bill_no || '', v.total||0, v.advance||0, v.cash_paid||0, v.diesel_paid||0, v.balance||0];
      vals.forEach((val, ci) => { ws.getCell(5 + idx, ci + 1).value = val; });
      g.total += v.total || 0; g.adv += v.advance || 0; g.cash += v.cash_paid || 0; g.diesel += v.diesel_paid || 0; g.bal += v.balance || 0;
    });
    styleExcelData(ws, 5);
    // Total row
    const trow = 5 + vouchers.length;
    ws.getCell(trow, 1).value = `TOTAL (${vouchers.length})`; ws.getCell(trow, 1).font = { bold: true, size: 11 };
    [null, null, null, null, null, null, null, Math.round(g.total), Math.round(g.adv), Math.round(g.cash), Math.round(g.diesel), Math.round(g.bal)].forEach((v, i) => {
      if (v !== null) { ws.getCell(trow, i + 1).value = v; ws.getCell(trow, i + 1).font = { bold: true, size: 11 }; }
    });
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(trow, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    }
    [10, 12, 12, 18, 20, 12, 14, 14, 12, 12, 12, 14].forEach((w, i) => ws.getColumn(i + 1).width = w);
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 filename=purchase_book.xlsx');
    res.send(Buffer.from(buf));
  }));

  return router;
};
