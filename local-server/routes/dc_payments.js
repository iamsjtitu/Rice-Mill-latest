const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
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

  // ===== DC ENTRIES =====
  router.post('/api/dc-entries', safeSync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    const d = req.body;
    const entry = { id: uuidv4(), dc_number: d.dc_number||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), rice_type: d.rice_type||'parboiled', godown_name: d.godown_name||'', deadline: d.deadline||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.dc_entries.push(entry); database.save(); res.json(entry);
  }));

  router.get('/api/dc-entries', safeSync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let entries = [...database.data.dc_entries];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    entries.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    entries.forEach(e => { const dels = database.data.dc_deliveries.filter(d => d.dc_id === e.id); const delivered = +dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2); e.delivered_qntl = delivered; e.pending_qntl = +(e.quantity_qntl-delivered).toFixed(2); e.delivery_count = dels.length; e.status = delivered >= e.quantity_qntl ? 'completed' : (delivered > 0 ? 'partial' : 'pending'); });
    res.json(entries);
  }));

  router.delete('/api/dc-entries/:id', safeSync(async (req, res) => {
    if (!database.data.dc_entries) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.dc_entries.length;
    database.data.dc_entries = database.data.dc_entries.filter(e => e.id !== req.params.id);
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.dc_id !== req.params.id);
    if (database.data.dc_entries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.put('/api/dc-entries/:id', safeSync(async (req, res) => {
    if (!database.data.dc_entries) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.dc_entries.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'DC entry not found' });
    database.data.dc_entries[idx] = { ...database.data.dc_entries[idx], ...req.body, updated_at: new Date().toISOString() };
    database.save(); res.json(database.data.dc_entries[idx]);
  }));

  router.get('/api/dc-entries/excel', safeAsync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    let entries = [...database.data.dc_entries];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('DC Entries');
    ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'DC No', key: 'dc_number', width: 12 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 }, { header: 'Rice Type', key: 'rice_type', width: 12 }, { header: 'Godown', key: 'godown_name', width: 15 }, { header: 'Deadline', key: 'deadline', width: 12 }];
    entries.forEach(e => ws.addRow(e));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=dc_entries.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  router.get('/api/dc-entries/pdf', safeSync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    let entries = [...database.data.dc_entries];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=dc_entries.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'DC Entries Report');
    const headers = ['Date', 'DC No', 'Qty(Q)', 'Rice Type', 'Godown', 'Deadline', 'Notes'];
    const rows = entries.map(e => [e.date||'', e.dc_number||'', e.quantity_qntl||0, e.rice_type||'', e.godown_name||'', e.deadline||'', (e.notes||'').substring(0,25)]);
    addPdfTable(doc, headers, rows, [60, 60, 50, 60, 80, 60, 100]); await safePdfPipe(doc, res);
  }));

  // ===== DC DELIVERIES =====
  router.post('/api/dc-deliveries', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    const d = req.body;
    const del = { id: uuidv4(), dc_id: d.dc_id||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), vehicle_no: d.vehicle_no||'', driver_name: d.driver_name||'', slip_no: d.slip_no||'', godown_name: d.godown_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.dc_deliveries.push(del); database.save(); res.json(del);
  }));

  router.get('/api/dc-deliveries', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let dels = [...database.data.dc_deliveries];
    if (req.query.dc_id) dels = dels.filter(d => d.dc_id === req.query.dc_id);
    if (req.query.kms_year) dels = dels.filter(d => d.kms_year === req.query.kms_year);
    if (req.query.season) dels = dels.filter(d => d.season === req.query.season);
    res.json(dels.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||'')));
  }));

  router.delete('/api/dc-deliveries/:id', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.dc_deliveries.length;
    database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.id !== req.params.id);
    if (database.data.dc_deliveries.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.get('/api/dc-summary', safeSync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let dcs = [...database.data.dc_entries]; let dels = [...database.data.dc_deliveries];
    if (req.query.kms_year) { dcs = dcs.filter(e=>e.kms_year===req.query.kms_year); dels = dels.filter(d=>d.kms_year===req.query.kms_year); }
    if (req.query.season) { dcs = dcs.filter(e=>e.season===req.query.season); dels = dels.filter(d=>d.season===req.query.season); }
    const ta=+dcs.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2); const td=+dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
    let comp=0,part=0,pend=0;
    dcs.forEach(dc=>{const d=dels.filter(x=>x.dc_id===dc.id).reduce((s,x)=>s+(x.quantity_qntl||0),0);if(d>=dc.quantity_qntl)comp++;else if(d>0)part++;else pend++;});
    res.json({total_dc:dcs.length,total_allotted_qntl:ta,total_delivered_qntl:td,total_pending_qntl:+(ta-td).toFixed(2),completed:comp,partial:part,pending:pend,total_deliveries:dels.length});
  }));

  // ===== MSP PAYMENTS =====
  router.post('/api/msp-payments', safeSync(async (req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = req.body;
    const pay = { id: uuidv4(), date: d.date||'', dc_id: d.dc_id||'', amount: +(d.amount||0), quantity_qntl: +(d.quantity_qntl||0), rate_per_qntl: +(d.rate_per_qntl||0), payment_mode: d.payment_mode||'', reference: d.reference||'', bank_name: d.bank_name||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.msp_payments.push(pay);
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
  }));

  router.get('/api/msp-payments', safeSync(async (req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    if (!database.data.dc_entries) database.data.dc_entries = [];
    let pays = [...database.data.msp_payments];
    if (req.query.kms_year) pays = pays.filter(p=>p.kms_year===req.query.kms_year);
    if (req.query.season) pays = pays.filter(p=>p.season===req.query.season);
    const dcMap = Object.fromEntries(database.data.dc_entries.map(d=>[d.id,d.dc_number||'']));
    pays.forEach(p=>{p.dc_number=dcMap[p.dc_id]||'';});
    res.json(pays.sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||'')));
  }));

  router.delete('/api/msp-payments/:id', safeSync(async (req, res) => {
    if (!database.data.msp_payments) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.msp_payments.length;
    database.data.msp_payments = database.data.msp_payments.filter(p=>p.id!==req.params.id);
    if (database.data.msp_payments.length < len) {
      if (database.data.cash_transactions) {
        database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `msp:${req.params.id}`);
      }
      database.save(); return res.json({ message: 'Deleted', id: req.params.id });
    }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.get('/api/msp-payments/summary', safeSync(async (req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let pays=[...database.data.msp_payments]; let dels=[...database.data.dc_deliveries];
    if (req.query.kms_year) { pays=pays.filter(p=>p.kms_year===req.query.kms_year); dels=dels.filter(d=>d.kms_year===req.query.kms_year); }
    if (req.query.season) { pays=pays.filter(p=>p.season===req.query.season); dels=dels.filter(d=>d.season===req.query.season); }
    const tpa=+pays.reduce((s,p)=>s+(p.amount||0),0).toFixed(2); const tpq=+pays.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2); const tdq=+dels.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2);
    res.json({total_payments:pays.length,total_paid_amount:tpa,total_paid_qty:tpq,avg_rate:tpq>0?+(tpa/tpq).toFixed(2):0,total_delivered_qntl:tdq,pending_payment_qty:+(tdq-tpq).toFixed(2)});
  }));

  router.get('/api/msp-payments/excel', safeAsync(async (req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    let payments = [...database.data.msp_payments];
    if (req.query.kms_year) payments = payments.filter(p => p.kms_year === req.query.kms_year);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('MSP Payments');
    ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 }, { header: 'Rate/Q', key: 'rate_per_qntl', width: 10 }, { header: 'Amount', key: 'amount', width: 12 }, { header: 'Mode', key: 'payment_mode', width: 10 }, { header: 'Reference', key: 'reference', width: 15 }, { header: 'Bank', key: 'bank_name', width: 15 }];
    payments.forEach(p => ws.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=msp_payments.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  router.get('/api/msp-payments/pdf', safeSync(async (req, res) => {
    if (!database.data.msp_payments) database.data.msp_payments = [];
    let payments = [...database.data.msp_payments];
    if (req.query.kms_year) payments = payments.filter(p => p.kms_year === req.query.kms_year);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=msp_payments.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'MSP Payments Report');
    const headers = ['Date', 'Qty(Q)', 'Rate(Rs./Q)', 'Amount(Rs.)', 'Mode', 'Reference', 'Bank'];
    const rows = payments.map(p => [p.date||'', p.quantity_qntl||0, p.rate_per_qntl||0, p.amount||0, p.payment_mode||'', (p.reference||'').substring(0,15), (p.bank_name||'').substring(0,15)]);
    addPdfTable(doc, headers, rows, [60, 50, 60, 70, 50, 80, 80]); await safePdfPipe(doc, res);
  }));

  return router;
};
