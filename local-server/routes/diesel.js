const express = require('express');
const { safeAsync, safeSync, roundAmount } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, fmtDate , safePdfPipe, drawSummaryBanner, addExcelSummaryBanner, STAT_COLORS, fmtInr, applyConsolidatedExcelPolish} = require('./pdf_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    branding._watermark = ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark');
    _addPdfHeader(doc, title, branding);
  }

  // ===== DIESEL PUMPS =====
  router.get('/api/diesel-pumps', safeSync(async (req, res) => {
    res.json(database.data.diesel_pumps || []);
  }));
  router.post('/api/diesel-pumps', safeSync(async (req, res) => {
    if (!database.data.diesel_pumps) database.data.diesel_pumps = [];
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ detail: 'Name required' });
    if (database.data.diesel_pumps.find(p => p.name === name)) return res.status(400).json({ detail: 'Pump exists' });
    if (req.body.is_default) database.data.diesel_pumps.forEach(p => p.is_default = false);
    const pump = { id: uuidv4(), name, is_default: !!req.body.is_default || database.data.diesel_pumps.length === 0, created_at: new Date().toISOString() };
    database.data.diesel_pumps.push(pump); database.save(); res.json(pump);
  }));
  router.put('/api/diesel-pumps/:id/set-default', safeSync(async (req, res) => {
    if (!database.data.diesel_pumps) return res.status(404).json({ detail: 'Not found' });
    database.data.diesel_pumps.forEach(p => p.is_default = (p.id === req.params.id));
    database.save(); res.json({ message: 'Default set' });
  }));
  router.delete('/api/diesel-pumps/:id', safeSync(async (req, res) => {
    if (!database.data.diesel_pumps) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.diesel_pumps.length;
    database.data.diesel_pumps = database.data.diesel_pumps.filter(p => p.id !== req.params.id);
    if (database.data.diesel_pumps.length < len) { database.save(); return res.json({ message: 'Deleted' }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  // ===== DIESEL ACCOUNTS =====
  router.get('/api/diesel-accounts', safeSync(async (req, res) => {
    let txns = database.data.diesel_accounts || [];
    if (req.query.pump_id) txns = txns.filter(t => t.pump_id === req.query.pump_id);
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.txn_type) txns = txns.filter(t => t.txn_type === req.query.txn_type);
    if (req.query.truck_no) txns = txns.filter(t => (t.truck_no||'').toLowerCase().includes(req.query.truck_no.toLowerCase()));
    if (req.query.date_from) txns = txns.filter(t => (t.date||'') >= req.query.date_from);
    if (req.query.date_to) txns = txns.filter(t => (t.date||'') <= req.query.date_to);
    res.json(txns.sort((a,b) => (b.date||'').slice(0,10).localeCompare((a.date||'').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||'')));
  }));

  router.get('/api/diesel-accounts/summary', safeSync(async (req, res) => {
    let txns = database.data.diesel_accounts || [];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);

    // Compute opening balance from previous FY per pump
    const openingBalances = {};
    if (req.query.kms_year) {
      const fyParts = req.query.kms_year.split('-');
      if (fyParts.length === 2) {
        const prevFy = `${parseInt(fyParts[0])-1}-${parseInt(fyParts[1])-1}`;
        let prevTxns = (database.data.diesel_accounts || []).filter(t => t.kms_year === prevFy);
        if (req.query.season) prevTxns = prevTxns.filter(t => t.season === req.query.season);
        for (const t of prevTxns) {
          const pid = t.pump_id || '';
          if (!openingBalances[pid]) openingBalances[pid] = 0;
          if (t.txn_type === 'debit') openingBalances[pid] += t.amount || 0;
          else if (t.txn_type === 'payment') openingBalances[pid] -= t.amount || 0;
        }
      }
    }

    const allCashTxns = database.data.cash_transactions || [];
    const pumps = (database.data.diesel_pumps || []).map(p => {
      const pt = txns.filter(t => t.pump_id === p.id);
      const td = pt.filter(t=>t.txn_type==='debit').reduce((s,t)=>s+t.amount,0);
      const ob = Math.round((openingBalances[p.id] || 0) * 100) / 100;
      // Use ledger as source of truth for total_paid (includes manual Cash Book payments)
      let ledgerPaid = allCashTxns.filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === p.name
        && (!req.query.kms_year || t.kms_year === req.query.kms_year)
        && (!req.query.season || t.season === req.query.season)
      ).reduce((s,t) => s + (t.amount||0), 0);
      const tp = Math.round(ledgerPaid * 100) / 100;
      return { pump_id:p.id, pump_name:p.name, is_default:p.is_default||false, opening_balance:ob, total_diesel:+td.toFixed(2), total_paid:tp, balance:+(ob+td-tp).toFixed(2), txn_count:pt.filter(t=>t.txn_type==='debit').length };
    });
    const grandOb = +pumps.reduce((s,p)=>s+p.opening_balance,0).toFixed(2);
    res.json({ pumps, grand_opening_balance:grandOb, grand_total_diesel:+pumps.reduce((s,p)=>s+p.total_diesel,0).toFixed(2), grand_total_paid:+pumps.reduce((s,p)=>s+p.total_paid,0).toFixed(2), grand_balance:+pumps.reduce((s,p)=>s+p.balance,0).toFixed(2) });
  }));

  router.post('/api/diesel-accounts/pay', safeSync(async (req, res) => {
    const { pump_id, amount, date, kms_year, season, notes } = req.body;
    const amt = parseFloat(amount) || 0;
    if (!pump_id || amt <= 0) return res.status(400).json({ detail: 'pump_id and amount required' });
    const pump = (database.data.diesel_pumps||[]).find(p=>p.id===pump_id);
    if (!pump) return res.status(404).json({ detail: 'Pump not found' });
    if (!database.data.diesel_accounts) database.data.diesel_accounts = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const roundOff = parseFloat(req.body.round_off) || 0;
    const totalSettled = Math.round((amt + roundOff) * 100) / 100;
    const txn = { id:uuidv4(), date:date||new Date().toISOString().split('T')[0], pump_id, pump_name:pump.name, truck_no:'', agent_name:'', amount:totalSettled, txn_type:'payment', description:`Payment to ${pump.name} - Rs.${amt}${roundOff?' (Round Off: '+(roundOff>0?'+':'')+roundOff+')':''}${notes?' - '+notes:''}`, kms_year:kms_year||'', season:season||'', created_by:req.query.username||'system', created_at:new Date().toISOString() };
    database.data.diesel_accounts.push(txn);
    // Cash nikasi - actual cash
    database.data.cash_transactions.push({ id:uuidv4(), date:txn.date, account:'cash', txn_type:'nikasi', category:pump.name, party_type:'Diesel', description:`Diesel Payment: ${pump.name} - Rs.${amt}${notes?' ('+notes+')':''}`, amount:+amt.toFixed(2), reference:`diesel_pay:${txn.id.slice(0,8)}`, kms_year:kms_year||'', season:season||'', created_by:req.query.username||'system', linked_diesel_payment_id:txn.id, created_at:new Date().toISOString(), updated_at:new Date().toISOString() });
    // Ledger nikasi - total including round off
    database.data.cash_transactions.push({ id:uuidv4(), date:txn.date, account:'ledger', txn_type:'nikasi', category:pump.name, party_type:'Diesel', description:`Diesel Payment: ${pump.name} - Rs.${totalSettled}${roundOff?' (Cash: '+amt+', RoundOff: '+roundOff+')':''}${notes?' ('+notes+')':''}`, amount:totalSettled, reference:`diesel_pay_ledger:${txn.id.slice(0,8)}`, kms_year:kms_year||'', season:season||'', created_by:req.query.username||'system', linked_diesel_payment_id:txn.id, created_at:new Date().toISOString(), updated_at:new Date().toISOString() });
    database.save();
    res.json({ success:true, message:`Rs.${amt} payment to ${pump.name} recorded`, txn_id:txn.id });
  }));

  router.delete('/api/diesel-accounts/:id', safeSync(async (req, res) => {
    if (!database.data.diesel_accounts) return res.status(404).json({ detail: 'Not found' });
    const txn = database.data.diesel_accounts.find(t=>t.id===req.params.id);
    if (!txn) return res.status(404).json({ detail: 'Not found' });
    if (txn.txn_type === 'payment' && database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t=>t.linked_diesel_payment_id!==txn.id);
    }
    database.data.diesel_accounts = database.data.diesel_accounts.filter(t=>t.id!==req.params.id);
    database.save(); res.json({ message:'Deleted', id:req.params.id });
  }));

  router.post('/api/diesel-accounts/delete-bulk', safeSync(async (req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return res.status(400).json({ detail: 'No ids provided' });
    if (!database.data.diesel_accounts) database.data.diesel_accounts = [];
    const paymentTxns = database.data.diesel_accounts.filter(t => ids.includes(t.id) && t.txn_type === 'payment');
    if (paymentTxns.length > 0 && database.data.cash_transactions) {
      const payIds = paymentTxns.map(t => t.id);
      database.data.cash_transactions = database.data.cash_transactions.filter(t => !payIds.includes(t.linked_diesel_payment_id));
    }
    const before = database.data.diesel_accounts.length;
    database.data.diesel_accounts = database.data.diesel_accounts.filter(t => !ids.includes(t.id));
    const deleted = before - database.data.diesel_accounts.length;
    if (deleted > 0) database.save();
    res.json({ message: `${deleted} transactions deleted`, deleted });
  }));

  // ===== DIESEL EXPORTS =====
  router.get('/api/diesel-accounts/excel', safeAsync(async (req, res) => {
    let txns = database.data.diesel_accounts || [];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    const pumps = database.data.diesel_pumps || [];
    const pumpSummaries = pumps.map(p => {
      const pt = txns.filter(t => t.pump_id === p.id);
      const td = pt.filter(t=>t.txn_type==='debit').reduce((s,t)=>s+t.amount,0);
      // Use ledger nikasi as source of truth for paid (consistent with summary endpoint)
      const allCashTxns = database.data.cash_transactions || [];
      const tp = allCashTxns.filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === p.name
        && (!req.query.kms_year || t.kms_year === req.query.kms_year)
        && (!req.query.season || t.season === req.query.season)
      ).reduce((s,t) => s + (t.amount||0), 0);
      return { name: p.name, is_default: p.is_default, td, tp, bal: td-tp, cnt: pt.filter(t=>t.txn_type==='debit').length };
    });
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Diesel Account');
    ws.mergeCells('A1:G1'); ws.getCell('A1').value = 'Diesel Account'; ws.getCell('A1').font = { name: 'Inter', bold: true, size: 14 };
    ws.getCell('A3').value = 'Pump Summary'; ws.getCell('A3').font = { name: 'Inter', bold: true, size: 11 };
    ['Pump Name','Total Diesel (Rs.)','Total Paid (Rs.)','Balance (Rs.)','Entries'].forEach((h,i) => {
      const c = ws.getCell(4, i+1); c.value = h; c.font = { name: 'Inter', bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7c2d12' } };
    });
    let row = 5;
    pumpSummaries.forEach(p => {
      ws.getCell(row, 1).value = p.name + (p.is_default ? ' (Default)' : '');
      ws.getCell(row, 2).value = p.td; ws.getCell(row, 3).value = p.tp; ws.getCell(row, 4).value = p.bal; ws.getCell(row, 5).value = p.cnt;
      row++;
    });
    ws.getCell(row, 1).value = 'GRAND TOTAL'; ws.getCell(row, 1).font = { name: 'Inter', bold: true };
    ws.getCell(row, 2).value = pumpSummaries.reduce((s,p)=>s+p.td,0);
    ws.getCell(row, 3).value = pumpSummaries.reduce((s,p)=>s+p.tp,0);
    ws.getCell(row, 4).value = pumpSummaries.reduce((s,p)=>s+p.bal,0); ws.getCell(row, 4).font = { name: 'Inter', bold: true, color: { argb: 'FF0000' } };
    row += 2;
    ws.getCell(row, 1).value = 'Transactions'; ws.getCell(row, 1).font = { name: 'Inter', bold: true, size: 11 }; row++;
    ['Date','Pump','Type','Truck No','Agent','Amount (Rs.)','Description'].forEach((h,i) => {
      const c = ws.getCell(row, i+1); c.value = h; c.font = { name: 'Inter', bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7c2d12' } };
    });
    row++;
    txns.sort((a,b)=>(a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10))).forEach(t => {
      ws.getCell(row,1).value = fmtDate(t.date); ws.getCell(row,2).value = t.pump_name||'';
      ws.getCell(row,3).value = t.txn_type==='payment'?'Payment':'Diesel';
      ws.getCell(row,4).value = t.truck_no||''; ws.getCell(row,5).value = t.agent_name||'';
      ws.getCell(row,6).value = t.amount||0; ws.getCell(row,7).value = t.description||'';
      row++;
    });
    ['A','B','C','D','E','F','G'].forEach(l => ws.getColumn(l).width = 18);

    // Light-themed summary banner
    if (txns.length > 0) {
      const { addExcelSummaryBanner, fmtInr } = require('./pdf_helpers');
      const totalD = pumpSummaries.reduce((s, p) => s + p.td, 0);
      const totalP = pumpSummaries.reduce((s, p) => s + p.tp, 0);
      addExcelSummaryBanner(ws, row + 1, 7, [
        { lbl: 'Total Txns', val: String(txns.length) },
        { lbl: 'Pumps', val: String(pumps.length) },
        { lbl: 'Total Diesel', val: fmtInr(totalD) },
        { lbl: 'Total Paid', val: fmtInr(totalP) },
        { lbl: 'Balance', val: fmtInr(totalD - totalP) },
      ]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `diesel_account.xlsx`}`);
    // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
    try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
    await wb.xlsx.write(res); res.end();
  }));

  router.get('/api/diesel-accounts/pdf', safeSync(async (req, res) => {
    let txns = database.data.diesel_accounts || [];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    const pumps = database.data.diesel_pumps || [];
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `diesel_account.pdf`}`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'Diesel Account / Diesel Khata');
    const allCashTxns = database.data.cash_transactions || [];
    const sumHeaders = ['Pump Name', 'Total Diesel', 'Total Paid', 'Balance', 'Entries'];
    const sumRows = pumps.map(p => {
      const pt = txns.filter(t => t.pump_id === p.id);
      const td = pt.filter(t=>t.txn_type==='debit').reduce((s,t)=>s+t.amount,0);
      const tp = allCashTxns.filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === p.name
        && (!req.query.kms_year || t.kms_year === req.query.kms_year)
        && (!req.query.season || t.season === req.query.season)
      ).reduce((s,t) => s + (t.amount||0), 0);
      return [p.name+(p.is_default?' *':''), 'Rs.'+td, 'Rs.'+tp, 'Rs.'+(td-tp), pt.filter(t=>t.txn_type==='debit').length.toString()];
    });
    addPdfTable(doc, sumHeaders, sumRows, [150, 80, 80, 80, 50]);
    doc.moveDown();
    doc.fontSize(12).text('Transactions', { underline: true }); doc.moveDown(0.5);
    const tHeaders = ['Date', 'Pump', 'Type', 'Truck', 'Agent', 'Amount', 'Description'];
    const tRows = txns.sort((a,b)=>(a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10))).map(t => [
      fmtDate(t.date), (t.pump_name||'').substring(0,15), t.txn_type==='payment'?'Payment':'Diesel',
      t.truck_no||'', (t.agent_name||'').substring(0,12), 'Rs.'+(t.amount||0), (t.description||'').substring(0,25)
    ]);
    addPdfTable(doc, tHeaders, tRows, [60, 90, 50, 70, 70, 60, 150]);

    // Light-themed summary banner
    if (txns.length > 0) {
      const { drawSummaryBanner, STAT_COLORS, fmtInr } = require('./pdf_helpers');
      const totalDiesel = pumps.reduce((sum, p) => {
        return sum + txns.filter(t => t.pump_id === p.id && t.txn_type === 'debit').reduce((s, t) => s + t.amount, 0);
      }, 0);
      const totalPaid = pumps.reduce((sum, p) => {
        return sum + allCashTxns.filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === p.name).reduce((s, t) => s + (t.amount || 0), 0);
      }, 0);
      const tableW = 480;
      if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      drawSummaryBanner(doc, [
        { lbl: 'TOTAL TXNS', val: String(txns.length), color: STAT_COLORS.primary },
        { lbl: 'PUMPS', val: String(pumps.length), color: STAT_COLORS.blue },
        { lbl: 'TOTAL DIESEL', val: fmtInr(totalDiesel), color: STAT_COLORS.orange },
        { lbl: 'TOTAL PAID', val: fmtInr(totalPaid), color: STAT_COLORS.green },
        { lbl: 'BALANCE', val: fmtInr(totalDiesel - totalPaid), color: STAT_COLORS.red },
      ], doc.page.margins.left, doc.y + 6, tableW);
    }

    await safePdfPipe(doc, res);
  }));

  return router;
};
