const express = require('express');
const { safeAsync, safeSync, roundAmount } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, fmtDate , safePdfPipe} = require('./pdf_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding);
  }

  router.post('/api/gunny-bags', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    const d = req.body;
    const entry = { id: uuidv4(), date: d.date||'', bag_type: d.bag_type||'new', txn_type: d.txn_type||'in', quantity: +(d.quantity||0), source: d.source||'', rate: +(d.rate||0), amount: +((d.quantity||0)*(d.rate||0)).toFixed(2), reference: d.reference||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.gunny_bags.push(entry);
    if (entry.bag_type === 'old' && entry.txn_type === 'in' && entry.source && entry.amount > 0) {
      if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
      database.data.local_party_accounts.push({
        id: uuidv4(), date: entry.date, party_name: entry.source, txn_type: 'debit',
        amount: entry.amount, description: `Gunny Bags (Old) x${entry.quantity} @ Rs.${entry.rate}`,
        source_type: 'gunny_bag', reference: `gunny:${entry.id.slice(0,8)}`,
        kms_year: entry.kms_year, season: entry.season, created_by: entry.created_by || 'system',
        linked_gunny_id: entry.id, created_at: new Date().toISOString()
      });
    }
    database.save(); res.json(entry);
  }));

  router.get('/api/gunny-bags', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) entries = entries.filter(e=>e.season===req.query.season);
    if (req.query.bag_type) entries = entries.filter(e=>e.bag_type===req.query.bag_type);
    res.json(entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
  }));

  router.delete('/api/gunny-bags/:id', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) return res.status(404).json({ detail: 'Not found' });
    if (database.data.local_party_accounts) {
      database.data.local_party_accounts = database.data.local_party_accounts.filter(t => t.linked_gunny_id !== req.params.id);
    }
    const len = database.data.gunny_bags.length;
    database.data.gunny_bags = database.data.gunny_bags.filter(e=>e.id!==req.params.id);
    if (database.data.gunny_bags.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.put('/api/gunny-bags/:id', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.gunny_bags.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Not found' });
    const d = req.body;
    const qty = parseInt(d.quantity) || 0;
    const rate = parseFloat(d.rate) || 0;
    database.data.gunny_bags[idx] = { ...database.data.gunny_bags[idx], date: d.date || database.data.gunny_bags[idx].date, bag_type: d.bag_type || database.data.gunny_bags[idx].bag_type, txn_type: d.txn_type || database.data.gunny_bags[idx].txn_type, quantity: qty, rate: rate, amount: +(qty * rate).toFixed(2), source: d.source ?? database.data.gunny_bags[idx].source, reference: d.reference ?? database.data.gunny_bags[idx].reference, notes: d.notes ?? database.data.gunny_bags[idx].notes, updated_at: new Date().toISOString() };
    const updated = database.data.gunny_bags[idx];
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    database.data.local_party_accounts = database.data.local_party_accounts.filter(t => t.linked_gunny_id !== req.params.id);
    if (updated.bag_type === 'old' && updated.txn_type === 'in' && updated.source && updated.amount > 0) {
      database.data.local_party_accounts.push({
        id: uuidv4(), date: updated.date, party_name: updated.source, txn_type: 'debit',
        amount: updated.amount, description: `Gunny Bags (Old) x${updated.quantity} @ Rs.${updated.rate}`,
        source_type: 'gunny_bag', reference: `gunny:${req.params.id.slice(0,8)}`,
        kms_year: updated.kms_year || '', season: updated.season || '',
        created_by: req.query.username || 'system', linked_gunny_id: req.params.id,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json(updated);
  }));

  router.get('/api/gunny-bags/summary', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) entries = entries.filter(e=>e.season===req.query.season);

    const manual = entries.filter(e => !e.linked_entry_id);
    const auto = entries.filter(e => !!e.linked_entry_id);

    // New (Govt) - manual only
    const newItems = manual.filter(e => e.bag_type === 'new');
    const newIn = newItems.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0);
    const newOut = newItems.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0);

    // Old (Market) - manual only
    const oldItems = manual.filter(e => e.bag_type === 'old');
    const oldIn = oldItems.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0);
    const oldOut = oldItems.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0);
    const oldCost = +oldItems.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.amount||0),0).toFixed(2);

    // Auto mill entries
    const autoIn = auto.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0);
    const autoOut = auto.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0);

    // All old for grand total
    const allOld = entries.filter(e => e.bag_type === 'old');
    const allOldIn = allOld.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0);
    const allOldOut = allOld.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0);

    let paddyEntries = [...database.data.entries];
    if (req.query.kms_year) paddyEntries = paddyEntries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) paddyEntries = paddyEntries.filter(e=>e.season===req.query.season);

    const result = {
      'new': { total_in: newIn, total_out: newOut, balance: newIn - newOut, total_cost: 0 },
      old: { total_in: oldIn, total_out: oldOut, balance: oldIn - oldOut, total_cost: oldCost },
      auto_mill: { total_in: autoIn, total_out: autoOut, balance: autoIn - autoOut },
      paddy_bags: { total: paddyEntries.reduce((s,e)=>s+(e.bag||0),0), label: 'Paddy Receive Bags' },
      ppkt: { total: paddyEntries.reduce((s,e)=>s+(e.plastic_bag||0),0), label: 'P.Pkt (Plastic Bags)' },
      grand_total: allOldIn - allOldOut,
      g_issued_total: allOldOut,
    };
    res.json(result);
  }));

  function applyGunnyFilters(entries, bagFilter, txnFilter) {
    let result = entries;
    if (bagFilter === 'mill') result = result.filter(e => !!e.linked_entry_id);
    else if (bagFilter === 'market') result = result.filter(e => e.bag_type === 'old' && !e.linked_entry_id);
    else if (bagFilter === 'govt') result = result.filter(e => e.bag_type === 'new');
    if (txnFilter === 'in') result = result.filter(e => e.txn_type === 'in');
    else if (txnFilter === 'out') result = result.filter(e => e.txn_type === 'out');
    return result;
  }

  router.get('/api/gunny-bags/excel', safeAsync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    const filtered = applyGunnyFilters(entries, req.query.bag_filter, req.query.txn_filter);

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Gunny Bags');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Bag Type', key: 'bag_type', width: 15 },
      { header: 'In/Out', key: 'txn_type', width: 8 }, { header: 'Qty', key: 'quantity', width: 10 },
      { header: 'Source/To', key: 'source', width: 35 }, { header: 'Rate', key: 'rate', width: 10 },
      { header: 'Amount (Rs.)', key: 'amount', width: 14 },
      { header: 'Notes', key: 'notes', width: 25 }
    ];
    filtered.forEach(e => ws.addRow({
      date: e.date||'', bag_type: e.bag_type==='new'?'New (Govt)':'Old (Market)',
      txn_type: e.txn_type==='in'?'In':'Out', quantity: e.quantity||0,
      source: (e.source||'') + (e.linked_entry_id ? ' [Auto]' : ''),
      rate: e.rate||0, amount: e.amount||0, notes: e.notes||''
    }));
    const totalIn = filtered.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0);
    const totalOut = filtered.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0);
    ws.addRow({ date: 'TOTAL', txn_type: `In:${totalIn} Out:${totalOut}`, quantity: totalIn - totalOut });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=gunny_bags.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  router.get('/api/gunny-bags/pdf', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    const filtered = applyGunnyFilters(entries, req.query.bag_filter, req.query.txn_filter);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=gunny_bags.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'Gunny Bags Report');
    const headers = ['Date', 'Bag Type', 'In/Out', 'Qty', 'Source/To', 'Rate', 'Amount(Rs.)', 'Notes'];
    const rows = filtered.map(e => [
      e.date||'', e.bag_type==='new'?'New(Govt)':'Old(Mkt)',
      e.txn_type==='in'?'In':'Out', e.quantity||0,
      (e.source||'') + (e.linked_entry_id ? ' [Auto]' : ''),
      e.rate||0, e.amount||0, e.notes||''
    ]);
    const totalIn = filtered.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0);
    const totalOut = filtered.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0);
    rows.push(['TOTAL', '', `In:${totalIn} Out:${totalOut}`, totalIn-totalOut, '', '', '', '']);
    addPdfTable(doc, headers, rows, [48,52,35,35,150,38,52,65]); await safePdfPipe(doc, res);
  }));

  // === Gunny Bags Purchase Report ===
  router.get('/api/gunny-bags/purchase-report', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = database.data.gunny_bags.filter(e => e.type === 'purchase' || e.type === 'in');
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    // Group by supplier
    const suppliers = {};
    entries.forEach(e => {
      const name = e.supplier || e.party_name || 'Unknown';
      if (!suppliers[name]) suppliers[name] = { supplier: name, total_qty: 0, total_amount: 0, entries: [] };
      suppliers[name].total_qty += parseInt(e.quantity) || 0;
      suppliers[name].total_amount += parseFloat(e.amount) || 0;
      suppliers[name].entries.push(e);
    });
    res.json({ suppliers: Object.values(suppliers), total_entries: entries.length });
  }));

  router.get('/api/gunny-bags/purchase-report/excel', safeAsync(async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      if (!database.data.gunny_bags) database.data.gunny_bags = [];
      let entries = database.data.gunny_bags.filter(e => e.type === 'purchase' || e.type === 'in');
      if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
      if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Purchase Report');
      ws.addRow(['Date', 'Supplier', 'Qty', 'Rate', 'Amount', 'Description']);
      entries.forEach(e => ws.addRow([fmtDate(e.date), e.supplier || e.party_name || '', e.quantity || 0, e.rate || 0, e.amount || 0, e.description || '']));
      ws.columns.forEach(c => c.width = 15);
      const buf = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=gunny_purchase_report.xlsx`);
      res.send(Buffer.from(buf));
    } catch (e) { res.status(500).json({ detail: e.message }); }
  }));

  router.get('/api/gunny-bags/purchase-report/pdf', safeSync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = database.data.gunny_bags.filter(e => e.type === 'purchase' || e.type === 'in');
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';
    let html = `<!DOCTYPE html><html><head><style>body{font:10px Arial;margin:10px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 5px}th{background:#1e40af;color:#fff}.r{text-align:right}.b{font-weight:bold}</style></head><body>`;
    html += `<h2 style="text-align:center">${company} - Gunny Bags Purchase Report</h2><table><tr><th>Date</th><th>Supplier</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th><th>Description</th></tr>`;
    entries.forEach(e => html += `<tr><td>${e.date||''}</td><td>${e.supplier||e.party_name||''}</td><td class="r">${e.quantity||0}</td><td class="r">${e.rate||0}</td><td class="r">${e.amount||0}</td><td>${e.description||''}</td></tr>`);
    html += `</table></body></html>`;
    res.type('html').send(html);
  }));

  return router;
};
