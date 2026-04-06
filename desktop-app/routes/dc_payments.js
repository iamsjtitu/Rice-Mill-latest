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
    const dcId = req.params.id;
    const len = database.data.dc_entries.length;
    database.data.dc_entries = database.data.dc_entries.filter(e => e.id !== dcId);
    if (database.data.dc_entries.length < len) {
      // Cascading: delete all deliveries and their auto-entries
      const delIds = (database.data.dc_deliveries||[]).filter(d => d.dc_id === dcId).map(d => d.id);
      database.data.dc_deliveries = (database.data.dc_deliveries||[]).filter(d => d.dc_id !== dcId);
      for (const did of delIds) {
        const refCash = `delivery:${did.slice(0,8)}`;
        const refDiesel = `delivery_diesel:${did.slice(0,8)}`;
        if (database.data.cash_transactions) {
          database.data.cash_transactions = database.data.cash_transactions.filter(t => t.reference !== refCash && t.reference !== refDiesel);
        }
        if (database.data.gunny_bags) {
          database.data.gunny_bags = database.data.gunny_bags.filter(b => b.reference !== refCash);
        }
      }
      database.save();
      return res.json({ message: 'DC and its deliveries deleted', id: dcId });
    }
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
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let entries = [...database.data.dc_entries];
    let allDels = [...database.data.dc_deliveries];
    if (req.query.kms_year) { entries = entries.filter(e => e.kms_year === req.query.kms_year); allDels = allDels.filter(d => d.kms_year === req.query.kms_year); }
    if (req.query.season) { entries = entries.filter(e => e.season === req.query.season); allDels = allDels.filter(d => d.season === req.query.season); }
    const wb = new ExcelJS.Workbook();
    // Sheet 1: DC Register
    const ws = wb.addWorksheet('DC Register');
    ws.columns = [
      { header: 'DC No', key: 'dc_number', width: 12 }, { header: 'Date', key: 'date', width: 12 },
      { header: 'Rice Type', key: 'rice_type', width: 12 }, { header: 'Allotted(Q)', key: 'quantity_qntl', width: 12 },
      { header: 'Delivered(Q)', key: 'delivered', width: 12 }, { header: 'Pending(Q)', key: 'pending', width: 12 },
      { header: 'Status', key: 'status', width: 12 }, { header: 'Deadline', key: 'deadline', width: 12 },
      { header: 'Godown', key: 'godown_name', width: 15 }
    ];
    entries.forEach(e => {
      const deld = +allDels.filter(d => d.dc_id === e.id).reduce((s,d) => s + (d.quantity_qntl||0), 0).toFixed(2);
      const pend = +(e.quantity_qntl - deld).toFixed(2);
      const status = deld >= e.quantity_qntl ? 'Completed' : (deld > 0 ? 'Partial' : 'Pending');
      ws.addRow({ dc_number: e.dc_number, date: fmtDate(e.date), rice_type: (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1), quantity_qntl: e.quantity_qntl, delivered: deld, pending: pend, status, deadline: fmtDate(e.deadline), godown_name: e.godown_name });
    });
    // Sheet 2: Deliveries detail
    const ws2 = wb.addWorksheet('Deliveries');
    ws2.columns = [
      { header: 'DC No', key: 'dc_no', width: 12 }, { header: 'Date', key: 'date', width: 12 },
      { header: 'Invoice No', key: 'invoice_no', width: 14 }, { header: 'RST No', key: 'rst_no', width: 12 },
      { header: 'E-Way Bill', key: 'eway_bill_no', width: 14 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 },
      { header: 'Vehicle', key: 'vehicle_no', width: 12 }, { header: 'Driver', key: 'driver_name', width: 14 },
      { header: 'Bags', key: 'bags_used', width: 8 }, { header: 'Cash Paid', key: 'cash_paid', width: 12 },
      { header: 'Diesel Paid', key: 'diesel_paid', width: 12 }, { header: 'CGST', key: 'cgst_amount', width: 10 },
      { header: 'SGST', key: 'sgst_amount', width: 10 }, { header: 'Godown', key: 'godown_name', width: 14 },
      { header: 'Notes', key: 'notes', width: 18 }
    ];
    const dcMap = Object.fromEntries(entries.map(e => [e.id, e.dc_number||'']));
    allDels.sort((a,b) => (a.date||'').localeCompare(b.date||'')).forEach(dl => {
      ws2.addRow({ dc_no: dcMap[dl.dc_id]||'', date: fmtDate(dl.date), invoice_no: dl.invoice_no||'', rst_no: dl.rst_no||'', eway_bill_no: dl.eway_bill_no||'', quantity_qntl: dl.quantity_qntl, vehicle_no: dl.vehicle_no, driver_name: dl.driver_name, bags_used: dl.bags_used||0, cash_paid: dl.cash_paid||0, diesel_paid: dl.diesel_paid||0, cgst_amount: dl.cgst_amount||0, sgst_amount: dl.sgst_amount||0, godown_name: dl.godown_name||'', notes: dl.notes||'' });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=dc_register.xlsx`);
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
    const rows = entries.map(e => [fmtDate(e.date)||'', e.dc_number||'', e.quantity_qntl||0, e.rice_type||'', e.godown_name||'', fmtDate(e.deadline)||'', (e.notes||'').substring(0,25)]);
    addPdfTable(doc, headers, rows, [60, 60, 50, 60, 80, 60, 100]); await safePdfPipe(doc, res);
  }));

  // ===== DC DELIVERIES =====
  router.post('/api/dc-deliveries', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.gunny_bags) database.data.gunny_bags = [];
    const d = req.body;
    const now = new Date().toISOString();
    const del = {
      id: uuidv4(), dc_id: d.dc_id||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0),
      vehicle_no: d.vehicle_no||'', driver_name: d.driver_name||'', slip_no: d.slip_no||'',
      godown_name: d.godown_name||'', notes: d.notes||'',
      invoice_no: d.invoice_no||'', rst_no: d.rst_no||'', eway_bill_no: d.eway_bill_no||'',
      bags_used: +(d.bags_used||0), cash_paid: +(d.cash_paid||0), diesel_paid: +(d.diesel_paid||0),
      cgst_amount: +(d.cgst_amount||0), sgst_amount: +(d.sgst_amount||0),
      kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: now
    };
    database.data.dc_deliveries.push(del);

    // Find DC for dc_number
    const dc = (database.data.dc_entries||[]).find(e => e.id === del.dc_id);
    const dcNum = dc ? dc.dc_number : '';
    const vehicle = del.vehicle_no;
    const base = { kms_year: del.kms_year, season: del.season, created_by: del.created_by, created_at: now, updated_at: now };

    // Auto-entry: Cash Paid → Cash Book Nikasi
    if (del.cash_paid > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: del.date, account: 'cash', txn_type: 'nikasi',
        category: vehicle || `Truck-${dcNum}`, party_type: 'Truck',
        description: `DC Delivery Cash - ${dcNum} | ${vehicle}`,
        amount: roundAmount(del.cash_paid), reference: `delivery:${del.id.slice(0,8)}`,
        bank_name: '', ...base
      });
      // Truck Ledger Nikasi for cash deduction
      if (vehicle) {
        database.data.cash_transactions.push({
          id: uuidv4(), date: del.date, account: 'ledger', txn_type: 'nikasi',
          category: vehicle, party_type: 'Truck',
          description: `DC Delivery Cash Deduction - ${dcNum} | ${vehicle}`,
          amount: roundAmount(del.cash_paid), reference: `delivery_tcash:${del.id.slice(0,8)}`,
          ...base
        });
      }
    }
    // Auto-entry: Diesel Paid → Diesel Pump Ledger JAMA + diesel_accounts + Truck Ledger Nikasi
    if (del.diesel_paid > 0) {
      if (!database.data.diesel_accounts) database.data.diesel_accounts = [];
      if (!database.data.diesel_pumps) database.data.diesel_pumps = [];
      const defPump = (database.data.diesel_pumps || []).find(p => p.is_default) || (database.data.diesel_pumps || [])[0];
      const pumpName = defPump?.name || (database.data.diesel_accounts.length > 0 ? database.data.diesel_accounts[database.data.diesel_accounts.length-1].pump_name : 'Diesel Pump');
      const pumpId = defPump?.id || '';
      // Truck Ledger Nikasi for diesel deduction
      if (vehicle) {
        database.data.cash_transactions.push({
          id: uuidv4(), date: del.date, account: 'ledger', txn_type: 'nikasi',
          category: vehicle, party_type: 'Truck',
          description: `DC Delivery Diesel Deduction - ${dcNum} | ${vehicle}`,
          amount: roundAmount(del.diesel_paid), reference: `delivery_tdiesel:${del.id.slice(0,8)}`,
          ...base
        });
      }
      // Diesel account entry
      database.data.diesel_accounts.push({
        id: uuidv4(), date: del.date, pump_id: pumpId, pump_name: pumpName,
        truck_no: vehicle, agent_name: '', amount: roundAmount(del.diesel_paid),
        txn_type: 'debit', description: `DC Delivery Diesel - ${dcNum} | ${vehicle}`,
        reference: `delivery_dfill:${del.id.slice(0,8)}`, ...base
      });
      // Diesel Pump Ledger JAMA
      database.data.cash_transactions.push({
        id: uuidv4(), date: del.date, account: 'ledger', txn_type: 'jama',
        category: pumpName, party_type: 'Diesel',
        description: `Diesel for DC Delivery - ${dcNum} | ${vehicle}`,
        amount: roundAmount(del.diesel_paid), reference: `delivery_jama:${del.id.slice(0,8)}`,
        ...base
      });
    }
    // Auto-entry: Bags Used → Gunny Bags stock out
    if (del.bags_used > 0) {
      database.data.gunny_bags.push({
        id: uuidv4(), date: del.date, bag_type: 'new', txn_type: 'out',
        quantity: del.bags_used, source: `DC Delivery - ${dcNum}`,
        party_name: '', rate: 0, amount: 0, invoice_no: '', truck_no: vehicle,
        rst_no: '', gst_type: 'none', cgst_percent: 0, sgst_percent: 0,
        gst_percent: 0, gst_amount: 0, cgst_amount: 0, sgst_amount: 0,
        subtotal: 0, total: 0, advance: 0, reference: `delivery:${del.id.slice(0,8)}`,
        notes: 'Auto: DC delivery bags used', ...base
      });
    }
    database.save(); res.json(del);
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
    const deliveryId = req.params.id;
    const len = database.data.dc_deliveries.length;
    database.data.dc_deliveries = database.data.dc_deliveries.filter(d => d.id !== deliveryId);
    if (database.data.dc_deliveries.length < len) {
      // Cascading delete: remove auto-created cash, ledger, diesel, and bag entries
      const refPrefix = deliveryId.slice(0,8);
      if (database.data.cash_transactions) {
        database.data.cash_transactions = database.data.cash_transactions.filter(t =>
          ![`delivery:${refPrefix}`, `delivery_diesel:${refPrefix}`, `delivery_tcash:${refPrefix}`,
            `delivery_tdiesel:${refPrefix}`, `delivery_dfill:${refPrefix}`, `delivery_jama:${refPrefix}`
          ].includes(t.reference)
        );
      }
      if (database.data.diesel_accounts) {
        database.data.diesel_accounts = database.data.diesel_accounts.filter(t =>
          t.reference !== `delivery_dfill:${refPrefix}`
        );
      }
      if (database.data.gunny_bags) {
        database.data.gunny_bags = database.data.gunny_bags.filter(b => b.reference !== `delivery:${refPrefix}`);
      }
      database.save();
      return res.json({ message: 'Delivery deleted', id: deliveryId });
    }
    res.status(404).json({ detail: 'Not found' });
  }));

  // Delivery Invoice HTML
  router.get('/api/dc-deliveries/invoice/:id', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) return res.status(404).json({ detail: 'Not found' });
    const delivery = database.data.dc_deliveries.find(d => d.id === req.params.id);
    if (!delivery) return res.status(404).json({ detail: 'Delivery not found' });
    const dc = (database.data.dc_entries||[]).find(e => e.id === delivery.dc_id);
    const settings = database.data.settings || {};
    const millName = settings.mill_name || 'NAVKAR AGRO';
    const millAddr = settings.mill_address || 'JOLKO, KESINGA';
    const dcNum = dc ? dc.dc_number : '';
    const cashPaid = delivery.cash_paid || 0;
    const dieselPaid = delivery.diesel_paid || 0;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Delivery Invoice</title>
    <style>body{font-family:Arial;margin:20px}table{width:100%;border-collapse:collapse}
    td,th{border:1px solid #333;padding:6px 10px;text-align:left}th{background:#1a365d;color:#fff}
    .header{text-align:center;margin-bottom:15px}.header h1{margin:0;font-size:22px}
    .header p{margin:2px 0;color:#555;font-size:12px}.info-grid{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
    .info-item{flex:1;min-width:140px;background:#f7f7f7;padding:6px 10px;border-radius:4px}
    .info-item label{font-size:10px;color:#666;display:block}.info-item span{font-size:13px;font-weight:bold}
    .total-row{background:#f0f0f0;font-weight:bold}
    @media print{body{margin:0}button{display:none}}</style></head><body>
    <div class="header"><h1>${millName}</h1><p>${millAddr} - Delivery Challan</p></div>
    <div class="info-grid">
      <div class="info-item"><label>DC Number</label><span>${dcNum}</span></div>
      <div class="info-item"><label>Date</label><span>${fmtDate(delivery.date)}</span></div>
      <div class="info-item"><label>Invoice No</label><span>${delivery.invoice_no||''}</span></div>
      <div class="info-item"><label>RST No</label><span>${delivery.rst_no||''}</span></div>
      <div class="info-item"><label>E-Way Bill</label><span>${delivery.eway_bill_no||''}</span></div>
      <div class="info-item"><label>Vehicle No</label><span>${delivery.vehicle_no||''}</span></div>
      <div class="info-item"><label>Driver</label><span>${delivery.driver_name||''}</span></div>
      <div class="info-item"><label>Slip No</label><span>${delivery.slip_no||''}</span></div>
      <div class="info-item"><label>Godown</label><span>${delivery.godown_name||''}</span></div>
    </div>
    <table><tr><th>Item</th><th style="text-align:right">Details</th></tr>
      <tr><td>Quantity</td><td style="text-align:right">${delivery.quantity_qntl||0} Quintals</td></tr>
      <tr><td>Bags Used (Govt)</td><td style="text-align:right">${delivery.bags_used||0}</td></tr>
      <tr><td>Cash Paid</td><td style="text-align:right">Rs.${cashPaid.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr><td>Diesel Paid</td><td style="text-align:right">Rs.${dieselPaid.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr><td>CGST</td><td style="text-align:right">Rs.${(delivery.cgst_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr><td>SGST</td><td style="text-align:right">Rs.${(delivery.sgst_amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr class="total-row"><td>Total Payment</td><td style="text-align:right">Rs.${(cashPaid+dieselPaid).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
    </table>
    ${delivery.notes ? `<p style="margin-top:10px;font-size:12px;color:#555">Notes: ${delivery.notes}</p>` : ''}
    <div style="margin-top:30px;display:flex;justify-content:space-between"><div style="border-top:1px solid #333;width:150px;text-align:center;padding-top:5px;font-size:11px">Signature</div></div>
    <button onclick="window.print()" style="margin-top:15px;padding:8px 24px;background:#1a365d;color:white;border:none;border-radius:4px;cursor:pointer">Print</button>
    </body></html>`;
    res.set('Content-Type', 'text/html');
    res.send(html);
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
        amount: roundAmount(pay.amount), reference: `msp:${pay.id.substring(0,8)}`,
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
    ws.columns = [{ header: 'Date', key: 'date', width: 12 }, { header: 'Qty(Q)', key: 'quantity_qntl', width: 10 }, { header: 'Rate/Q', key: 'rate_per_qntl', width: 10 }, { header: 'Amount', key: 'amount', width: 12 }, { header: 'Mode', key: 'payment_mode', width: 10 }, { header: 'Bank', key: 'bank_name', width: 15 }];
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
    const headers = ['Date', 'Qty(Q)', 'Rate(Rs./Q)', 'Amount(Rs.)', 'Mode', 'Bank'];
    const rows = payments.map(p => [fmtDate(p.date)||'', p.quantity_qntl||0, p.rate_per_qntl||0, p.amount||0, p.payment_mode||'', (p.bank_name||'').substring(0,15)]);
    addPdfTable(doc, headers, rows, [60, 50, 60, 70, 50, 80]); await safePdfPipe(doc, res);
  }));

  return router;
};
