const express = require('express');
const router = express.Router();

module.exports = function(database) {
  // Helper reference
  const ExcelJS = require('exceljs');
  const PDFDocument = require('pdfkit');
  const { v4: uuidv4 } = require('uuid');
  const { addPdfHeader: _addPdfHeader, addPdfTable } = require('./pdf_helpers');
  const addPdfHeader = (doc, title) => _addPdfHeader(doc, title, database.getBranding());

// ============ DC MANAGEMENT ============
router.post('/api/dc-entries', (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  const d = req.body;
  const entry = { id: uuidv4(), dc_number: d.dc_number||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), rice_type: d.rice_type||'parboiled', godown_name: d.godown_name||'', deadline: d.deadline||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.dc_entries.push(entry); database.save(); res.json(entry);
});
router.get('/api/dc-entries', (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let entries = [...database.data.dc_entries];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  entries.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  entries.forEach(e => {
    const dels = database.data.dc_deliveries.filter(d => d.dc_id === e.id);
    const delivered = +dels.reduce((s,d) => s+(d.quantity_qntl||0), 0).toFixed(2);
    e.delivered_qntl = delivered; e.pending_qntl = +(e.quantity_qntl - delivered).toFixed(2); e.delivery_count = dels.length;
    e.status = delivered >= e.quantity_qntl ? 'completed' : (delivered > 0 ? 'partial' : 'pending');
  });
  res.json(entries);
});
router.delete('/api/dc-entries/:id', (req, res) => {
  if (!database.data.dc_entries) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.dc_entries.length;
  database.data.dc_entries = database.data.dc_entries.filter(e => e.id !== req.params.id);
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.dc_id !== req.params.id);
  if (database.data.dc_entries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
router.post('/api/dc-deliveries', (req, res) => {
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  const d = req.body;
  const del = { id: uuidv4(), dc_id: d.dc_id||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), vehicle_no: d.vehicle_no||'', driver_name: d.driver_name||'', slip_no: d.slip_no||'', godown_name: d.godown_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.dc_deliveries.push(del); database.save(); res.json(del);
});
router.get('/api/dc-deliveries', (req, res) => {
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let dels = [...database.data.dc_deliveries];
  if (req.query.dc_id) dels = dels.filter(d => d.dc_id === req.query.dc_id);
  if (req.query.kms_year) dels = dels.filter(d => d.kms_year === req.query.kms_year);
  if (req.query.season) dels = dels.filter(d => d.season === req.query.season);
  res.json(dels.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
});
router.delete('/api/dc-deliveries/:id', (req, res) => {
  if (!database.data.dc_deliveries) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.dc_deliveries.length;
  database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.id !== req.params.id);
  if (database.data.dc_deliveries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
router.get('/api/dc-summary', (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let dcs = [...database.data.dc_entries]; let dels = [...database.data.dc_deliveries];
  if (req.query.kms_year) { dcs = dcs.filter(e => e.kms_year === req.query.kms_year); dels = dels.filter(d => d.kms_year === req.query.kms_year); }
  if (req.query.season) { dcs = dcs.filter(e => e.season === req.query.season); dels = dels.filter(d => d.season === req.query.season); }
  const ta = +dcs.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
  const td = +dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
  let comp=0,part=0,pend=0;
  dcs.forEach(dc => { const d = dels.filter(x=>x.dc_id===dc.id).reduce((s,x)=>s+(x.quantity_qntl||0),0); if(d>=dc.quantity_qntl)comp++;else if(d>0)part++;else pend++; });
  res.json({ total_dc: dcs.length, total_allotted_qntl: ta, total_delivered_qntl: td, total_pending_qntl: +(ta-td).toFixed(2), completed: comp, partial: part, pending: pend, total_deliveries: dels.length });
});

// ============ MSP PAYMENTS ============
router.post('/api/msp-payments', (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  if (!database.data.cash_transactions) database.data.cash_transactions = [];
  const d = req.body;
  const pay = { id: uuidv4(), date: d.date||'', dc_id: d.dc_id||'', amount: +(d.amount||0), quantity_qntl: +(d.quantity_qntl||0), rate_per_qntl: +(d.rate_per_qntl||0), payment_mode: d.payment_mode||'', reference: d.reference||'', bank_name: d.bank_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.msp_payments.push(pay);
  // Auto Cash Book Jama (MSP payment received from govt)
  if (pay.amount > 0) {
    database.data.cash_transactions.push({
      id: uuidv4(), date: pay.date, account: 'bank', txn_type: 'jama',
      category: 'MSP Payment', description: `MSP Payment: ${pay.quantity_qntl}Q @ Rs.${pay.rate_per_qntl}/Q`,
      amount: Math.round(pay.amount * 100) / 100, reference: `msp:${pay.id.substring(0,8)}`,
      kms_year: pay.kms_year, season: pay.season,
      created_by: req.query.username || 'system', linked_payment_id: `msp:${pay.id}`,
      created_at: new Date().toISOString()
    });
  }
  database.save(); res.json(pay);
});
router.get('/api/msp-payments', (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  if (!database.data.dc_entries) database.data.dc_entries = [];
  let pays = [...database.data.msp_payments];
  if (req.query.kms_year) pays = pays.filter(p => p.kms_year === req.query.kms_year);
  if (req.query.season) pays = pays.filter(p => p.season === req.query.season);
  const dcMap = Object.fromEntries(database.data.dc_entries.map(d => [d.id, d.dc_number||'']));
  pays.forEach(p => { p.dc_number = dcMap[p.dc_id] || ''; });
  res.json(pays.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
});
router.delete('/api/msp-payments/:id', (req, res) => {
  if (!database.data.msp_payments) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.msp_payments.length;
  database.data.msp_payments = database.data.msp_payments.filter(p => p.id !== req.params.id);
  if (database.data.msp_payments.length < len) {
    // Delete linked cash book entry
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `msp:${req.params.id}`);
    }
    database.save(); return res.json({ message: 'Deleted', id: req.params.id });
  }
  res.status(404).json({ detail: 'Not found' });
});
router.get('/api/msp-payments/summary', (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
  let pays = [...database.data.msp_payments]; let dels = [...database.data.dc_deliveries];
  if (req.query.kms_year) { pays = pays.filter(p=>p.kms_year===req.query.kms_year); dels = dels.filter(d=>d.kms_year===req.query.kms_year); }
  if (req.query.season) { pays = pays.filter(p=>p.season===req.query.season); dels = dels.filter(d=>d.season===req.query.season); }
  const tpa = +pays.reduce((s,p)=>s+(p.amount||0),0).toFixed(2);
  const tpq = +pays.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2);
  const tdq = +dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
  res.json({ total_payments: pays.length, total_paid_amount: tpa, total_paid_qty: tpq, avg_rate: tpq>0?+(tpa/tpq).toFixed(2):0, total_delivered_qntl: tdq, pending_payment_qty: +(tdq-tpq).toFixed(2) });
});

// ============ GUNNY BAGS ============
router.post('/api/gunny-bags', (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  const d = req.body;
  const entry = { id: uuidv4(), date: d.date||'', bag_type: d.bag_type||'new', txn_type: d.txn_type||'in', quantity: +(d.quantity||0), source: d.source||'', rate: +(d.rate||0), amount: +((d.quantity||0)*(d.rate||0)).toFixed(2), reference: d.reference||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
  database.data.gunny_bags.push(entry); database.save(); res.json(entry);
});
router.get('/api/gunny-bags', (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  let entries = [...database.data.gunny_bags];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  if (req.query.bag_type) entries = entries.filter(e => e.bag_type === req.query.bag_type);
  res.json(entries.sort((a,b) => (b.date||'').localeCompare(a.date||'')));
});
router.delete('/api/gunny-bags/:id', (req, res) => {
  if (!database.data.gunny_bags) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.gunny_bags.length;
  database.data.gunny_bags = database.data.gunny_bags.filter(e => e.id !== req.params.id);
  if (database.data.gunny_bags.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
router.get('/api/gunny-bags/summary', (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  let entries = [...database.data.gunny_bags];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  const result = {};
  ['new','old'].forEach(bt => {
    const items = entries.filter(e => e.bag_type === bt);
    result[bt] = { total_in: items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.quantity||0),0), total_out: items.filter(e=>e.txn_type==='out').reduce((s,e)=>s+(e.quantity||0),0), balance: 0, total_cost: +items.filter(e=>e.txn_type==='in').reduce((s,e)=>s+(e.amount||0),0).toFixed(2) };
    result[bt].balance = result[bt].total_in - result[bt].total_out;
  });
  // Paddy-received bags from truck entries
  let paddyEntries = [...database.data.entries];
  if (req.query.kms_year) paddyEntries = paddyEntries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) paddyEntries = paddyEntries.filter(e => e.season === req.query.season);
  result.paddy_bags = { total: paddyEntries.reduce((s,e)=>s+(e.bag||0),0), label: 'Paddy Receive Bags' };
  result.ppkt = { total: paddyEntries.reduce((s,e)=>s+(e.plastic_bag||0),0), label: 'P.Pkt (Plastic Bags)' };
  result.grand_total = result.old.balance + result.paddy_bags.total + result.ppkt.total;
  res.json(result);
});

// ============ DC ENTRIES UPDATE ============
router.put('/api/dc-entries/:id', (req, res) => {
  if (!database.data.dc_entries) return res.status(404).json({ detail: 'Not found' });
  const idx = database.data.dc_entries.findIndex(e => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ detail: 'DC entry not found' });
  database.data.dc_entries[idx] = { ...database.data.dc_entries[idx], ...req.body, updated_at: new Date().toISOString() };
  database.save();
  res.json(database.data.dc_entries[idx]);
});

// ============ DC ENTRIES EXPORT ============
router.get('/api/dc-entries/excel', async (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  let entries = [...database.data.dc_entries];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('DC Entries');
  ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'DC No', key: 'dc_number', width: 12 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 }, { header: 'Rice Type', key: 'rice_type', width: 12 }, { header: 'Godown', key: 'godown_name', width: 15 }, { header: 'Deadline', key: 'deadline', width: 12 }, { header: 'Notes', key: 'notes', width: 20 }];
  entries.forEach(e => ws.addRow(e));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=dc_entries.xlsx');
  await wb.xlsx.write(res); res.end();
});

router.get('/api/dc-entries/pdf', (req, res) => {
  if (!database.data.dc_entries) database.data.dc_entries = [];
  let entries = [...database.data.dc_entries];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=dc_entries.pdf');
  doc.pipe(res);
  addPdfHeader(doc, 'DC Entries Report');
  const headers = ['Date', 'DC No', 'Qty(Q)', 'Rice Type', 'Godown', 'Deadline', 'Notes'];
  const rows = entries.map(e => [e.date||'', e.dc_number||'', e.quantity_qntl||0, e.rice_type||'', e.godown_name||'', e.deadline||'', (e.notes||'').substring(0,25)]);
  addPdfTable(doc, headers, rows, [60, 60, 50, 60, 80, 60, 100]);
  doc.end();
});

// ============ GUNNY BAGS EXPORT ============
router.get('/api/gunny-bags/excel', async (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  let entries = [...database.data.gunny_bags];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Gunny Bags');
  ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Bag Type', key: 'bag_type', width: 10 }, { header: 'Txn Type', key: 'txn_type', width: 8 }, { header: 'Quantity', key: 'quantity', width: 10 }, { header: 'Rate', key: 'rate', width: 10 }, { header: 'Amount', key: 'amount', width: 12 }, { header: 'Notes', key: 'notes', width: 20 }];
  entries.forEach(e => ws.addRow(e));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=gunny_bags.xlsx');
  await wb.xlsx.write(res); res.end();
});

router.get('/api/gunny-bags/pdf', (req, res) => {
  if (!database.data.gunny_bags) database.data.gunny_bags = [];
  let entries = [...database.data.gunny_bags];
  if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
  if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=gunny_bags.pdf');
  doc.pipe(res);
  addPdfHeader(doc, 'Gunny Bags Report');
  const headers = ['Date', 'Bag Type', 'In/Out', 'Quantity', 'Rate(Rs.)', 'Amount(Rs.)', 'Notes'];
  const rows = entries.map(e => [e.date||'', e.bag_type||'', e.txn_type||'', e.quantity||0, e.rate||0, e.amount||0, (e.notes||'').substring(0,20)]);
  addPdfTable(doc, headers, rows, [60, 50, 40, 50, 50, 60, 100]);
  doc.end();
});

// ============ MSP PAYMENTS EXPORT ============
router.get('/api/msp-payments/excel', async (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  let payments = [...database.data.msp_payments];
  if (req.query.kms_year) payments = payments.filter(p => p.kms_year === req.query.kms_year);
  if (req.query.season) payments = payments.filter(p => p.season === req.query.season);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('MSP Payments');
  ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 }, { header: 'Rate/Q', key: 'rate_per_qntl', width: 10 }, { header: 'Amount', key: 'amount', width: 12 }, { header: 'Mode', key: 'payment_mode', width: 10 }, { header: 'Reference', key: 'reference', width: 15 }, { header: 'Bank', key: 'bank_name', width: 15 }, { header: 'Notes', key: 'notes', width: 20 }];
  payments.forEach(p => ws.addRow(p));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=msp_payments.xlsx');
  await wb.xlsx.write(res); res.end();
});

router.get('/api/msp-payments/pdf', (req, res) => {
  if (!database.data.msp_payments) database.data.msp_payments = [];
  let payments = [...database.data.msp_payments];
  if (req.query.kms_year) payments = payments.filter(p => p.kms_year === req.query.kms_year);
  if (req.query.season) payments = payments.filter(p => p.season === req.query.season);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=msp_payments.pdf');
  doc.pipe(res);
  addPdfHeader(doc, 'MSP Payments Report');
  const headers = ['Date', 'Qty(Q)', 'Rate(Rs./Q)', 'Amount(Rs.)', 'Mode', 'Reference', 'Bank'];
  const rows = payments.map(p => [p.date||'', p.quantity_qntl||0, p.rate_per_qntl||0, p.amount||0, p.payment_mode||'', (p.reference||'').substring(0,15), (p.bank_name||'').substring(0,15)]);
  addPdfTable(doc, headers, rows, [60, 50, 60, 70, 50, 80, 80]);
  doc.end();
});



  return router;
};
