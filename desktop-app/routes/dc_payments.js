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
    branding._watermark = ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark');
    _addPdfHeader(doc, title, branding);
  }

  // ===== DC ENTRIES =====
  router.post('/api/dc-entries', safeSync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    const d = req.body;
    const entry = { id: uuidv4(), dc_number: d.dc_number||'', date: d.date||'', quantity_qntl: +(d.quantity_qntl||0), rice_type: d.rice_type||'parboiled', godown_name: d.godown_name||'', depot_name: d.depot_name||'', depot_code: d.depot_code||'', delivery_to: d.delivery_to||'FCI', no_of_lots: d.no_of_lots||'', deadline: d.deadline||'', notes: d.notes||'', kms_year: d.kms_year||'', season: d.season||'', created_by: req.query.username||'', created_at: new Date().toISOString() };
    database.data.dc_entries.push(entry); database.save(); res.json(entry);
  }));

  router.get('/api/dc-entries', safeSync(async (req, res) => {
    if (!database.data.dc_entries) database.data.dc_entries = [];
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let entries = [...database.data.dc_entries];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    entries.sort((a,b) => (b.date||'').slice(0,10).localeCompare((a.date||'').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||''));
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
    entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
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
    allDels.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10))).forEach(dl => {
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
    entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
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
      contract_no: d.contract_no||'',
      fci_lot_no: d.fci_lot_no||'',
      party_name: d.party_name||'',
      bags_used: +(d.bags_used||0), cash_paid: +(d.cash_paid||0), diesel_paid: +(d.diesel_paid||0),
      depot_expenses: +(d.depot_expenses||0),
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
    // Auto-entry: Depot Expenses → Cash Book Nikasi
    if (del.depot_expenses > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: del.date, account: 'cash', txn_type: 'nikasi',
        category: 'Depot', party_type: 'Depot',
        description: `DC Delivery Depot Expenses - ${dcNum}${vehicle ? ` | ${vehicle}` : ''}`,
        amount: roundAmount(del.depot_expenses), reference: `delivery_depot:${del.id.slice(0,8)}`,
        bank_name: '', ...base
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
    // Auto-entry: Add Lot to matching DC Stack (if found) — LENIENT matching
    const stacks = database.data.dc_stacks || [];
    const norm = v => (v || '').toString().trim().toUpperCase();
    const dcDepotN = norm(dc.depot_name), dcDepotC = norm(dc.depot_code);
    const dcKms = norm(dc.kms_year || del.kms_year), dcSeason = norm(dc.season || del.season);
    const dcRice = norm(dc.rice_type || 'parboiled');
    // Score each stack: higher is better
    const scored = stacks.map(s => {
      let score = 0;
      const sDepotN = norm(s.depot_name), sDepotC = norm(s.depot_code);
      // Depot must match (name OR code) — mandatory
      const depotMatch = (sDepotN && sDepotN === dcDepotN) || (sDepotC && sDepotC === dcDepotC);
      if (!depotMatch) return { s, score: -1 };
      if (sDepotN === dcDepotN) score += 2;
      if (sDepotC === dcDepotC) score += 2;
      if (norm(s.kms_year) === dcKms) score += 2;
      if (norm(s.season) === dcSeason) score += 2;
      if (norm(s.rice_type) === dcRice) score += 1;
      return { s, score };
    }).filter(x => x.score >= 0).sort((a,b) => b.score - a.score);

    if (scored.length) {
      if (!database.data.dc_stack_lots) database.data.dc_stack_lots = [];
      // Prefer top-scored with room
      let targetStack = null;
      for (const {s} of scored) {
        const total = parseInt(s.total_lots) || 0;
        const cnt = database.data.dc_stack_lots.filter(l => l.stack_id === s.id).length;
        if (total === 0 || cnt < total) { targetStack = s; break; }
      }
      if (!targetStack) targetStack = scored[0].s;
      const existing = database.data.dc_stack_lots.filter(l => l.stack_id === targetStack.id).length;
      const nTrucks = ((del.vehicle_no||'').split('/').map(x=>x.trim()).filter(Boolean).length) || 1;
      database.data.dc_stack_lots.push({
        id: uuidv4(),
        stack_id: targetStack.id,
        lot_number: existing + 1,
        date: del.date || '',
        agency: del.party_name || '',
        lot_ack_no: del.fci_lot_no || '',
        no_of_trucks: nTrucks,
        bags: +(del.bags_used || 0),
        nett_weight_qtl: +(del.quantity_qntl || 0),
        status: 'delivered',
        linked_delivery_id: del.id,
        created_at: now
      });
      console.log(`[auto-lot] Linked delivery ${del.id.slice(0,8)} → stack ${targetStack.depot_name} (${targetStack.depot_code}) stack_no=${targetStack.stack_no} lot#${existing+1}`);
    } else {
      console.log(`[auto-lot] No matching stack for delivery ${del.id.slice(0,8)} | DC depot="${dc.depot_name}"/"${dc.depot_code}" kms=${dcKms} season=${dcSeason}`);
    }
    database.save(); res.json(del);
  }));

  router.post('/api/dc-deliveries/:id/link-stack', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) return res.status(404).json({ detail: 'No deliveries' });
    const d = database.data.dc_deliveries.find(x => x.id === req.params.id);
    if (!d) return res.status(404).json({ detail: 'Delivery not found' });
    const dc = (database.data.dc_entries || []).find(e => e.id === d.dc_id);
    if (!dc) return res.status(404).json({ detail: 'Parent DC not found' });
    if (!database.data.dc_stack_lots) database.data.dc_stack_lots = [];
    const existingLot = database.data.dc_stack_lots.find(l => l.linked_delivery_id === req.params.id);
    if (existingLot) return res.json({ linked: false, reason: 'Already linked to a stack lot' });
    const norm = v => (v || '').toString().trim().toUpperCase();
    const dcDepotN = norm(dc.depot_name), dcDepotC = norm(dc.depot_code);
    const dcKms = norm(dc.kms_year || d.kms_year), dcSeason = norm(dc.season || d.season);
    const dcRice = norm(dc.rice_type || 'parboiled');
    const stacks = database.data.dc_stacks || [];
    const scored = stacks.map(s => {
      const sDepotN = norm(s.depot_name), sDepotC = norm(s.depot_code);
      const depotMatch = (sDepotN && sDepotN === dcDepotN) || (sDepotC && sDepotC === dcDepotC);
      if (!depotMatch) return { s, score: -1 };
      let score = 0;
      if (sDepotN === dcDepotN) score += 2;
      if (sDepotC === dcDepotC) score += 2;
      if (norm(s.kms_year) === dcKms) score += 2;
      if (norm(s.season) === dcSeason) score += 2;
      if (norm(s.rice_type) === dcRice) score += 1;
      return { s, score };
    }).filter(x => x.score >= 0).sort((a,b) => b.score - a.score);
    if (!scored.length) {
      return res.json({ linked: false, reason: `Koi matching stack nahi mila. DC depot="${dc.depot_name||''}" code="${dc.depot_code||''}" ke saath koi stack match nahi ho raha.` });
    }
    let targetStack = null;
    for (const {s} of scored) {
      const total = parseInt(s.total_lots) || 0;
      const cnt = database.data.dc_stack_lots.filter(l => l.stack_id === s.id).length;
      if (total === 0 || cnt < total) { targetStack = s; break; }
    }
    if (!targetStack) targetStack = scored[0].s;
    const existing = database.data.dc_stack_lots.filter(l => l.stack_id === targetStack.id).length;
    const nTrucks = ((d.vehicle_no||'').split('/').map(x=>x.trim()).filter(Boolean).length) || 1;
    const lot = {
      id: uuidv4(), stack_id: targetStack.id, lot_number: existing + 1,
      date: d.date || '', agency: d.party_name || '', lot_ack_no: d.fci_lot_no || '',
      no_of_trucks: nTrucks, bags: +(d.bags_used||0), nett_weight_qtl: +(d.quantity_qntl||0),
      status: 'delivered', linked_delivery_id: req.params.id, created_at: new Date().toISOString()
    };
    database.data.dc_stack_lots.push(lot);
    database.save();
    res.json({ linked: true, stack_info: `${targetStack.depot_name||''} (${targetStack.depot_code||''}) stack#${targetStack.stack_no||'-'} | Lot #${existing+1}`, lot_id: lot.id });
  }));

  router.get('/api/dc-deliveries', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) database.data.dc_deliveries = [];
    let dels = [...database.data.dc_deliveries];
    if (req.query.dc_id) dels = dels.filter(d => d.dc_id === req.query.dc_id);
    if (req.query.kms_year) dels = dels.filter(d => d.kms_year === req.query.kms_year);
    if (req.query.season) dels = dels.filter(d => d.season === req.query.season);
    res.json(dels.sort((a,b) => (b.date||'').slice(0,10).localeCompare((a.date||'').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||'')));
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
            `delivery_tdiesel:${refPrefix}`, `delivery_dfill:${refPrefix}`, `delivery_jama:${refPrefix}`,
            `delivery_depot:${refPrefix}`
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
      // Clean up auto-created stack lot
      if (database.data.dc_stack_lots) {
        database.data.dc_stack_lots = database.data.dc_stack_lots.filter(l => l.linked_delivery_id !== deliveryId);
      }
      database.save();
      return res.json({ message: 'Delivery deleted', id: deliveryId });
    }
    res.status(404).json({ detail: 'Not found' });
  }));

  // Delivery Invoice HTML (FCI-style Challan)
  router.get('/api/dc-deliveries/invoice/:id', safeSync(async (req, res) => {
    if (!database.data.dc_deliveries) return res.status(404).json({ detail: 'Not found' });
    const delivery = database.data.dc_deliveries.find(d => d.id === req.params.id);
    if (!delivery) return res.status(404).json({ detail: 'Delivery not found' });
    const dc = (database.data.dc_entries||[]).find(e => e.id === delivery.dc_id) || {};
    const branding = database.data.branding || {};
    const millName = branding.company_name || 'NAVKAR AGRO';
    const millCode = branding.mill_code || '';
    const millTagline = branding.tagline || '';
    const millerLabel = millCode ? `${millName} (${millCode})` : millName;
    const dcNum = dc.dc_number || '';
    const riceType = dc.rice_type || 'parboiled';
    const variety = riceType === 'parboiled' ? 'Boiled Normal' : 'Raw Normal';
    const packingMaterial = 'New Jute Bag';
    const noOfLot = dc.no_of_lots || '-';
    const totalBags = +(delivery.bags_used || 0);
    const kmsYear = delivery.kms_year || dc.kms_year || '';
    const gunnySeason = (delivery.season || dc.season || '').toUpperCase();
    const fciLotNo = delivery.fci_lot_no || '-';
    const contractNo = delivery.contract_no || '-';
    const depotCode = dc.depot_code || '-';
    const depotName = dc.depot_name || '-';
    const partyName = delivery.party_name || '';
    const fmtDMY = s => { try { const d = new Date((s||'').split('T')[0]); if (isNaN(d)) return s; return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); } catch { return s; } };
    const fmtDMonY = s => { try { const d = new Date((s||'').split('T')[0]); if (isNaN(d)) return s; const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return String(d.getDate()).padStart(2,'0')+' '+months[d.getMonth()]+' '+d.getFullYear(); } catch { return s; } };
    const splitJ = s => (s||'').split('/').map(x=>x.trim()).filter(Boolean);
    const vehicles = splitJ(delivery.vehicle_no);
    const drivers = splitJ(delivery.driver_name);
    const nTrucks = Math.max(vehicles.length, 1);
    const bagsPerTruck = +(totalBags / nTrucks).toFixed(2);
    const weightPerTruck = +((+(delivery.quantity_qntl||0)) / nTrucks).toFixed(2);
    let truckRows = '';
    for (let i=0;i<nTrucks;i++) {
      const vh = vehicles[i] || '';
      const dr = drivers[i] || '';
      truckRows += `<tr><td>${i+1}</td><td><b>${vh}</b></td><td>${dr || '-'}</td><td class="num">${bagsPerTruck.toFixed(2)}</td><td class="num">${weightPerTruck.toFixed(2)}</td></tr>`;
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Delivery Challan - ${dcNum}</title>
    <style>
      @page { size: A4; margin: 14mm 14mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; color: #0f172a; font-size: 12px; background: #fff; }
      .letterhead { background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%); color: #fff; padding: 18px 24px; border-radius: 10px; margin-bottom: 20px; text-align: center; box-shadow: 0 4px 14px rgba(30,58,138,.25); }
      .letterhead h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 1px; }
      .letterhead .tagline { margin: 4px 0 0; opacity: .85; font-size: 12px; font-weight: 400; letter-spacing: 0.3px; }
      .doc-badge { display: inline-block; margin-top: 10px; padding: 4px 16px; background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.4); border-radius: 20px; font-size: 11px; letter-spacing: 3px; font-weight: 600; }
      .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(4, auto); grid-auto-flow: column; gap: 10px 28px; }
      .info-card .row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px dashed #cbd5e1; padding: 4px 0; }
      .info-card .row.no-border { border-bottom: none; }
      .info-card .l { color: #64748b; font-size: 11px; font-weight: 500; }
      .info-card .v { color: #0f172a; font-weight: 600; text-align: right; }
      .info-card .v.accent { color: #1e3a8a; font-weight: 700; }
      .section-title { color: #1e3a8a; font-size: 11px; font-weight: 700; letter-spacing: 2px; margin: 18px 0 8px; text-transform: uppercase; border-left: 3px solid #3730a3; padding-left: 8px; }
      table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      th, td { padding: 9px 11px; text-align: left; font-size: 11.5px; border-bottom: 1px solid #e2e8f0; }
      th { background: #1e3a8a; color: #fff; font-weight: 600; font-size: 11px; letter-spacing: 0.3px; border-bottom: none; }
      tbody tr:nth-child(even) { background: #f8fafc; }
      tbody tr:hover { background: #eff6ff; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
      .sign { margin-top: 38px; display: flex; justify-content: space-between; gap: 40px; }
      .sign div { flex: 1; border-top: 1.5px solid #1e3a8a; padding-top: 6px; text-align: center; font-size: 11px; color: #475569; font-weight: 500; }
      .noprint { text-align: center; margin-top: 28px; }
      .noprint button { padding: 10px 32px; background: linear-gradient(135deg, #1e3a8a, #3730a3); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 4px 10px rgba(30,58,138,.3); }
      .noprint button:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(30,58,138,.4); }
      @media print { .noprint { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>

    <div class="letterhead">
      <h1>${millerLabel}</h1>
      ${millTagline ? `<p class="tagline">${millTagline}</p>` : ''}
      <div class="doc-badge">DELIVERY CHALLAN</div>
    </div>

    <div class="info-card">
      <div class="row"><span class="l">Contract No</span><span class="v accent">${contractNo}</span></div>
      <div class="row"><span class="l">Party Name</span><span class="v">${partyName || '-'}</span></div>
      <div class="row"><span class="l">Depot</span><span class="v">${depotName}</span></div>
      <div class="row no-border"><span class="l">Depot Code</span><span class="v">${depotCode}</span></div>
      <div class="row"><span class="l">Date</span><span class="v">${fmtDMY(delivery.date)}</span></div>
      <div class="row"><span class="l">KMS</span><span class="v">${kmsYear || '-'}</span></div>
      <div class="row"><span class="l">Season</span><span class="v">${gunnySeason || '-'}</span></div>
      <div class="row no-border"></div>
    </div>

    <div class="section-title">DC Details</div>
    <table>
      <thead><tr>
        <th style="width:40px">Sl#</th><th>DC No.</th><th>DC Date</th><th>Packing Material</th>
        <th class="num">Total Bags</th><th>FCI Lot No</th>
      </tr></thead>
      <tbody><tr>
        <td>1</td><td><b>${dcNum || '-'}</b></td><td>${fmtDMonY(dc.date)}</td><td>${packingMaterial}</td>
        <td class="num">${totalBags.toFixed(2)}</td><td><b>${fciLotNo}</b></td>
      </tr></tbody>
    </table>

    <div class="section-title">Truck-wise Breakdown</div>
    <table>
      <thead><tr>
        <th style="width:40px">Sl#</th><th>Vehicle Number</th><th>Driver Name</th>
        <th class="num">Bags</th><th class="num">Weight (Qtl)</th>
      </tr></thead>
      <tbody>${truckRows}</tbody>
    </table>

    ${delivery.notes ? `<div class="section-title">Notes</div><p style="font-size:12px;color:#334155;margin-top:0;padding:8px 12px;background:#f1f5f9;border-radius:6px">${delivery.notes}</p>` : ''}

    <div class="sign"><div>Miller Signature</div><div>Receiver Signature</div></div>
    <div class="noprint"><button onclick="window.print()">Download as PDF</button></div>
    ${req.query.download ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 300));</script>' : ''}
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
    res.json(pays.sort((a,b)=>(b.date||'').slice(0,10).localeCompare((a.date||'').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||'')));
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
    payments.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
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
    payments.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=msp_payments.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'MSP Payments Report');
    const headers = ['Date', 'Qty(Q)', 'Rate(Rs./Q)', 'Amount(Rs.)', 'Mode', 'Bank'];
    const rows = payments.map(p => [fmtDate(p.date)||'', p.quantity_qntl||0, p.rate_per_qntl||0, p.amount||0, p.payment_mode||'', (p.bank_name||'').substring(0,15)]);
    addPdfTable(doc, headers, rows, [60, 50, 60, 70, 50, 80]); await safePdfPipe(doc, res);
  }));

  // ===== DC STACKS =====
  router.get('/api/dc-stacks', safeSync(async (req, res) => {
    if (!database.data.dc_stacks) database.data.dc_stacks = [];
    let stacks = [...database.data.dc_stacks];
    const { kms_year, season } = req.query;
    if (kms_year) stacks = stacks.filter(s => s.kms_year === kms_year);
    if (season) stacks = stacks.filter(s => s.season === season);
    // Attach lots count and delivered count
    const lots = database.data.dc_stack_lots || [];
    stacks = stacks.map(s => {
      const sLots = lots.filter(l => l.stack_id === s.id);
      const deliveredLots = sLots.filter(l => l.status === 'delivered').length;
      const lastDelivered = sLots.filter(l => l.status === 'delivered').sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      return { ...s, lots_delivered: deliveredLots, lots_total: sLots.length, lots: sLots, last_delivered_date: lastDelivered?.date || null };
    });
    stacks.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(stacks);
  }));

  router.post('/api/dc-stacks', safeSync(async (req, res) => {
    if (!database.data.dc_stacks) database.data.dc_stacks = [];
    const d = req.body;
    const stack = { id: uuidv4(), ...d, created_at: new Date().toISOString() };
    database.data.dc_stacks.push(stack);
    database.save();
    res.json(stack);
  }));

  router.put('/api/dc-stacks/:id', safeSync(async (req, res) => {
    if (!database.data.dc_stacks) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.dc_stacks.findIndex(s => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Stack not found' });
    database.data.dc_stacks[idx] = { ...database.data.dc_stacks[idx], ...req.body, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.dc_stacks[idx]);
  }));

  router.delete('/api/dc-stacks/:id', safeSync(async (req, res) => {
    if (!database.data.dc_stacks) return res.status(404).json({ detail: 'Not found' });
    database.data.dc_stacks = database.data.dc_stacks.filter(s => s.id !== req.params.id);
    // Also delete associated lots
    if (database.data.dc_stack_lots) {
      database.data.dc_stack_lots = database.data.dc_stack_lots.filter(l => l.stack_id !== req.params.id);
    }
    database.save();
    res.json({ success: true });
  }));

  // ===== DC STACK LOTS =====
  router.get('/api/dc-stacks/:stackId/lots', safeSync(async (req, res) => {
    const lots = (database.data.dc_stack_lots || []).filter(l => l.stack_id === req.params.stackId);
    lots.sort((a, b) => a.lot_number - b.lot_number);
    res.json(lots);
  }));

  router.post('/api/dc-stacks/:stackId/lots', safeSync(async (req, res) => {
    if (!database.data.dc_stack_lots) database.data.dc_stack_lots = [];
    const d = req.body;
    const existingLots = database.data.dc_stack_lots.filter(l => l.stack_id === req.params.stackId);
    const lotNumber = existingLots.length + 1;
    const lot = { id: uuidv4(), stack_id: req.params.stackId, lot_number: lotNumber, ...d, status: d.status || 'pending', created_at: new Date().toISOString() };
    database.data.dc_stack_lots.push(lot);
    database.save();
    res.json(lot);
  }));

  router.put('/api/dc-stacks/:stackId/lots/:lotId', safeSync(async (req, res) => {
    if (!database.data.dc_stack_lots) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.dc_stack_lots.findIndex(l => l.id === req.params.lotId);
    if (idx < 0) return res.status(404).json({ detail: 'Lot not found' });
    database.data.dc_stack_lots[idx] = { ...database.data.dc_stack_lots[idx], ...req.body, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.dc_stack_lots[idx]);
  }));

  router.delete('/api/dc-stacks/:stackId/lots/:lotId', safeSync(async (req, res) => {
    if (!database.data.dc_stack_lots) return res.status(404).json({ detail: 'Not found' });
    database.data.dc_stack_lots = database.data.dc_stack_lots.filter(l => l.id !== req.params.lotId);
    database.save();
    res.json({ success: true });
  }));

  return router;
};
