const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable } = require('./pdf_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding);
  }

  router.post('/api/gunny-bags', safeSync((req, res) => {
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

  router.get('/api/gunny-bags', safeSync((req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) entries = entries.filter(e=>e.season===req.query.season);
    if (req.query.bag_type) entries = entries.filter(e=>e.bag_type===req.query.bag_type);
    res.json(entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')));
  }));

  router.delete('/api/gunny-bags/:id', safeSync((req, res) => {
    if (!database.data.gunny_bags) return res.status(404).json({ detail: 'Not found' });
    if (database.data.local_party_accounts) {
      database.data.local_party_accounts = database.data.local_party_accounts.filter(t => t.linked_gunny_id !== req.params.id);
    }
    const len = database.data.gunny_bags.length;
    database.data.gunny_bags = database.data.gunny_bags.filter(e=>e.id!==req.params.id);
    if (database.data.gunny_bags.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.put('/api/gunny-bags/:id', safeSync((req, res) => {
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

  router.get('/api/gunny-bags/summary', safeSync((req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) entries = entries.filter(e=>e.season===req.query.season);
    const result = {};
    ['new','old'].forEach(bt=>{const items=entries.filter(e=>e.bag_type===bt);result[bt]={total_in:items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0),total_out:items.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0),balance:0,total_cost:+items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.amount||0),0).toFixed(2)};result[bt].balance=result[bt].total_in-result[bt].total_out;});
    let paddyEntries = [...database.data.entries];
    if (req.query.kms_year) paddyEntries = paddyEntries.filter(e=>e.kms_year===req.query.kms_year);
    if (req.query.season) paddyEntries = paddyEntries.filter(e=>e.season===req.query.season);
    result.paddy_bags = { total: paddyEntries.reduce((s,e)=>s+(e.bag||0),0), label: 'Paddy Receive Bags' };
    result.ppkt = { total: paddyEntries.reduce((s,e)=>s+(e.plastic_bag||0),0), label: 'P.Pkt (Plastic Bags)' };
    const gIssuedTotal = paddyEntries.reduce((s,e)=>s+(parseInt(e.g_issued)||0),0);
    result.g_issued = { total: gIssuedTotal, label: 'G.Issued (Entries)' };
    result.grand_total = result.paddy_bags.total + result.ppkt.total + result.old.balance - gIssuedTotal;
    res.json(result);
  }));

  router.get('/api/gunny-bags/excel', safeAsync(async (req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Gunny Bags');
    ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Bag Type', key: 'bag_type', width: 10 }, { header: 'In/Out', key: 'txn_type', width: 8 }, { header: 'Quantity', key: 'quantity', width: 10 }, { header: 'Rate', key: 'rate', width: 10 }, { header: 'Amount', key: 'amount', width: 12 }];
    entries.forEach(e => ws.addRow(e));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=gunny_bags.xlsx');
    await wb.xlsx.write(res); res.end();
  }));

  router.get('/api/gunny-bags/pdf', safeSync((req, res) => {
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    let entries = [...database.data.gunny_bags];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename=gunny_bags.pdf');
    doc.pipe(res); addPdfHeader(doc, 'Gunny Bags Report');
    const headers = ['Date', 'Bag Type', 'In/Out', 'Quantity', 'Rate(Rs.)', 'Amount(Rs.)', 'Notes'];
    const rows = entries.map(e => [e.date||'', e.bag_type||'', e.txn_type||'', e.quantity||0, e.rate||0, e.amount||0, (e.notes||'').substring(0,20)]);
    addPdfTable(doc, headers, rows, [60, 50, 40, 50, 50, 60, 100]); doc.end();
  }));

  return router;
};
