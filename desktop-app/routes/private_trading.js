const express = require('express');
const { safeSync } = require('./safe_handler');
const { getColumns, getEntryRow, getTotalRow, getExcelHeaders, getExcelWidths, getPdfHeaders, getPdfWidthsMm, colCount } = require('../shared/report_helper');
const { makePartyLabel, fmtDetail } = require('../shared/party-helpers');
const { calcPaddyAuto } = require('../shared/paddy-calc');
const { createCashDieselForPvtPaddy, ensurePartyJamaExists, deleteCashDieselForPvtPaddy, createCashForRiceSale, deleteCashForRiceSale, processPrivatePayment, deletePrivatePayment, computePaymentStatus } = require('../shared/payment-service');
const router = express.Router();

module.exports = function(database) {

  const logAudit = (collection, recordId, action, username, oldData, newData, summary) => {
    if (!database.data.audit_log) database.data.audit_log = [];
    const changes = {};
    const skipKeys = new Set(['_id', '_v', 'updated_at', 'created_at']);
    if (action === 'update' && oldData && newData) {
      for (const key of new Set([...Object.keys(oldData), ...Object.keys(newData)])) {
        if (skipKeys.has(key)) continue;
        if (oldData[key] !== newData[key]) changes[key] = { old: oldData[key], new: newData[key] };
      }
      if (Object.keys(changes).length === 0) return;
    }
    if (action === 'create' && newData) {
      for (const key of ['truck_no', 'party_name', 'amount', 'kg', 'bag', 'category', 'description', 'total_amount', 'quantity_qntl']) {
        if (newData[key]) changes[key] = { new: newData[key] };
      }
    }
    if (action === 'delete' && oldData) {
      for (const key of ['truck_no', 'party_name', 'amount', 'kg', 'bag', 'category', 'description', 'total_amount', 'quantity_qntl']) {
        if (oldData[key]) changes[key] = { old: oldData[key] };
      }
    }
    if (!summary) {
      if (action === 'create') summary = `${username} ne naya record banaya`;
      else if (action === 'delete') summary = `${username} ne record delete kiya`;
      else if (action === 'update') {
        const parts = Object.entries(changes).slice(0, 3).map(([k, v]) => v.old !== undefined && v.new !== undefined ? `${k}: ${v.old} → ${v.new}` : k);
        summary = `${username} ne ${parts.join(', ')} change kiya`;
      } else if (action === 'payment' || action === 'undo_payment') {
        summary = summary || `${username} ne ${action} kiya`;
      }
    }
    database.data.audit_log.push({
      id: require('crypto').randomUUID(), collection, record_id: String(recordId), action,
      changes, username: username || 'system', summary: summary || '',
      timestamp: new Date().toISOString()
    });
    database.save();
  };

  // Local aliases for backward compat (used in mark-paid/undo-paid/history)
  const _makePartyLabel = makePartyLabel;
  const _fmtDetail = fmtDetail;

  // ===== PRIVATE PADDY =====
  router.post('/api/private-paddy', safeSync(async (req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, _v: 1, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { d[f] = parseFloat(d[f]) || 0; });
    d.bag = parseInt(d.bag) || 0; d.plastic_bag = parseInt(d.plastic_bag) || 0;
    calcPaddyAuto(d);
    database.data.private_paddy.push(d);
    try { createCashDieselForPvtPaddy(database, d, req.query.username || ''); } catch(e) { console.error('[PvtPaddy] createCashDieselForPvtPaddy error:', e); }
    ensurePartyJamaExists(database, d, req.query.username || '');
    logAudit('private_paddy', d.id, 'create', req.query.username || '', null, d);
    database.save(); res.json(d);
  }));

  router.get('/api/private-paddy', safeSync(async (req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||''));
    items = computePaymentStatus(items);
    res.json(items);
  }));

  router.put('/api/private-paddy/:id', safeSync(async (req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const current = database.data.private_paddy[idx];
    const oldCopy = { ...current };
    const body = req.body;
    const clientV = body._v; delete body._v;
    if (clientV !== undefined && clientV !== null && current._v !== undefined) {
      if (parseInt(clientV) !== current._v) {
        return res.status(409).json({ detail: 'Ye record kisi aur ne update kar diya hai. Data refresh ho raha hai.' });
      }
    }
    const merged = { ...current, ...body, _v: (current._v || 0) + 1, updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { merged[f] = parseFloat(merged[f]) || 0; });
    merged.bag = parseInt(merged.bag) || 0; merged.plastic_bag = parseInt(merged.plastic_bag) || 0;
    calcPaddyAuto(merged);
    database.data.private_paddy[idx] = merged;
    deleteCashDieselForPvtPaddy(database, req.params.id);
    try { createCashDieselForPvtPaddy(database, merged, req.query.username || ''); } catch(e) { console.error('[PvtPaddy] createCashDieselForPvtPaddy error:', e); }
    ensurePartyJamaExists(database, merged, req.query.username || '');
    logAudit('private_paddy', req.params.id, 'update', req.query.username || '', oldCopy, merged);
    database.save(); res.json(merged);
  }));

  router.delete('/api/private-paddy/:id', safeSync(async (req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const oldItem = { ...database.data.private_paddy[idx] };
    database.data.private_paddy.splice(idx, 1);
    deleteCashDieselForPvtPaddy(database, req.params.id);
    if (database.data.truck_payments) database.data.truck_payments = database.data.truck_payments.filter(t => t.entry_id !== req.params.id);
    logAudit('private_paddy', req.params.id, 'delete', req.query.username || '', oldItem, null);
    database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== RICE SALES =====
  router.post('/api/rice-sales', safeSync(async (req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, _v: 1, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.quantity_qntl = parseFloat(d.quantity_qntl) || 0; d.rate_per_qntl = parseFloat(d.rate_per_qntl) || 0;
    d.bags = parseInt(d.bags) || 0; d.paid_amount = parseFloat(d.paid_amount) || 0;
    d.total_amount = Math.round(d.quantity_qntl * d.rate_per_qntl * 100) / 100;
    d.balance = Math.round(d.total_amount - d.paid_amount, 2);
    database.data.rice_sales.push(d);
    createCashForRiceSale(database, d, req.query.username || '');
    logAudit('rice_sales', d.id, 'create', req.query.username || '', null, d);
    database.save(); res.json(d);
  }));

  router.get('/api/rice-sales', safeSync(async (req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||''));
    items = computePaymentStatus(items);
    res.json(items);
  }));

  router.put('/api/rice-sales/:id', safeSync(async (req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const current = database.data.rice_sales[idx];
    const oldCopy = { ...current };
    const body = req.body;
    const clientV = body._v; delete body._v;
    if (clientV !== undefined && clientV !== null && current._v !== undefined) {
      if (parseInt(clientV) !== current._v) {
        return res.status(409).json({ detail: 'Ye record kisi aur ne update kar diya hai. Data refresh ho raha hai.' });
      }
    }
    const merged = { ...current, ...body, _v: (current._v || 0) + 1, updated_at: new Date().toISOString() };
    merged.quantity_qntl = parseFloat(merged.quantity_qntl) || 0; merged.rate_per_qntl = parseFloat(merged.rate_per_qntl) || 0;
    merged.bags = parseInt(merged.bags) || 0; merged.paid_amount = parseFloat(merged.paid_amount) || 0;
    merged.total_amount = Math.round(merged.quantity_qntl * merged.rate_per_qntl * 100) / 100;
    merged.balance = Math.round(merged.total_amount - merged.paid_amount, 2);
    database.data.rice_sales[idx] = merged;
    deleteCashForRiceSale(database, req.params.id);
    createCashForRiceSale(database, merged, req.query.username || '');
    logAudit('rice_sales', req.params.id, 'update', req.query.username || '', oldCopy, merged);
    database.save(); res.json(merged);
  }));

  router.delete('/api/rice-sales/:id', safeSync(async (req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const oldItem = { ...database.data.rice_sales[idx] };
    database.data.rice_sales.splice(idx, 1);
    deleteCashForRiceSale(database, req.params.id);
    logAudit('rice_sales', req.params.id, 'delete', req.query.username || '', oldItem, null);
    database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== PRIVATE PAYMENTS =====
  router.post('/api/private-payments', safeSync(async (req, res) => {
    const d = processPrivatePayment(database, req.body, req.query.username || '');
    logAudit('private_payments', d.id, 'payment', req.query.username || '', null, d, `${req.query.username || ''} ne Rs.${d.amount || 0} payment kiya`);
    database.save();
    res.json(d);
  }));

  router.get('/api/private-payments', safeSync(async (req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    const { party_name, ref_type, ref_id, kms_year, season } = req.query;
    let items = [...database.data.private_payments];
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    if (ref_type) items = items.filter(i => i.ref_type === ref_type);
    if (ref_id) items = items.filter(i => i.ref_id === ref_id);
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    items.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||''));
    res.json(items);
  }));

  router.delete('/api/private-payments/:id', safeSync(async (req, res) => {
    const oldPay = (database.data.private_payments || []).find(p => p.id === req.params.id);
    const result = deletePrivatePayment(database, req.params.id);
    if (!result.success) return res.status(404).json({ detail: result.error });
    if (oldPay) logAudit('private_payments', req.params.id, 'undo_payment', req.query.username || '', oldPay, null, `${req.query.username || ''} ne Rs.${oldPay.amount || 0} payment undo kiya`);
    database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== PARTY SUMMARY =====
  router.get('/api/private-trading/party-summary', safeSync(async (req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, date_from, date_to, search } = req.query;
    let paddyItems = [...database.data.private_paddy];
    let riceItems = [...database.data.rice_sales];
    if (kms_year) { paddyItems = paddyItems.filter(i => i.kms_year === kms_year); riceItems = riceItems.filter(i => i.kms_year === kms_year); }
    if (season) { paddyItems = paddyItems.filter(i => i.season === season); riceItems = riceItems.filter(i => i.season === season); }
    if (date_from) { paddyItems = paddyItems.filter(i => (i.date||'') >= date_from); riceItems = riceItems.filter(i => (i.date||'') >= date_from); }
    if (date_to) { paddyItems = paddyItems.filter(i => (i.date||'') <= date_to); riceItems = riceItems.filter(i => (i.date||'') <= date_to); }
    const partyMap = {};
    paddyItems.forEach(p => {
      const name = p.party_name || 'Unknown';
      if (!partyMap[name]) partyMap[name] = { party_name: name, mandi_name: p.mandi_name||'', agent_name: p.agent_name||'', purchase_amount: 0, purchase_paid: 0, purchase_balance: 0, sale_amount: 0, sale_received: 0, sale_balance: 0, net_balance: 0 };
      partyMap[name].purchase_amount += p.total_amount || 0;
      partyMap[name].purchase_paid += p.paid_amount || 0;
      if (!partyMap[name].mandi_name && p.mandi_name) partyMap[name].mandi_name = p.mandi_name;
      if (!partyMap[name].agent_name && p.agent_name) partyMap[name].agent_name = p.agent_name;
    });
    riceItems.forEach(r => {
      const name = r.party_name || 'Unknown';
      if (!partyMap[name]) partyMap[name] = { party_name: name, mandi_name: '', agent_name: '', purchase_amount: 0, purchase_paid: 0, purchase_balance: 0, sale_amount: 0, sale_received: 0, sale_balance: 0, net_balance: 0 };
      partyMap[name].sale_amount += r.total_amount || 0;
      partyMap[name].sale_received += r.paid_amount || 0;
    });
    let result = Object.values(partyMap).map(pm => {
      pm.purchase_amount = Math.round(pm.purchase_amount * 100) / 100;
      pm.purchase_paid = Math.round(pm.purchase_paid * 100) / 100;
      pm.purchase_balance = Math.round((pm.purchase_amount - pm.purchase_paid) * 100) / 100;
      pm.sale_amount = Math.round(pm.sale_amount * 100) / 100;
      pm.sale_received = Math.round(pm.sale_received * 100) / 100;
      pm.sale_balance = Math.round((pm.sale_amount - pm.sale_received) * 100) / 100;
      pm.net_balance = Math.round((pm.purchase_balance - pm.sale_balance) * 100) / 100;
      return pm;
    });
    if (search) { const s = search.toLowerCase(); result = result.filter(r => r.party_name.toLowerCase().includes(s) || r.mandi_name.toLowerCase().includes(s) || r.agent_name.toLowerCase().includes(s)); }
    result.sort((a, b) => Math.abs(b.net_balance) - Math.abs(a.net_balance));
    const totals = {
      total_purchase: Math.round(result.reduce((s, r) => s + r.purchase_amount, 0) * 100) / 100,
      total_purchase_paid: Math.round(result.reduce((s, r) => s + r.purchase_paid, 0) * 100) / 100,
      total_purchase_balance: Math.round(result.reduce((s, r) => s + r.purchase_balance, 0) * 100) / 100,
      total_sale: Math.round(result.reduce((s, r) => s + r.sale_amount, 0) * 100) / 100,
      total_sale_received: Math.round(result.reduce((s, r) => s + r.sale_received, 0) * 100) / 100,
      total_sale_balance: Math.round(result.reduce((s, r) => s + r.sale_balance, 0) * 100) / 100,
      total_net_balance: Math.round(result.reduce((s, r) => s + r.net_balance, 0) * 100) / 100,
    };
    res.json({ parties: result, totals });
  }));

  // ===== PARTY SUMMARY EXCEL =====
  router.get('/api/private-trading/party-summary/excel', safeSync(async (req, res) => {
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    if (!database.data.private_paddy) database.data.private_paddy = [];
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, date_from, date_to, search } = req.query;
    let paddyItems = [...database.data.private_paddy];
    let riceItems = [...database.data.rice_sales];
    if (kms_year) { paddyItems = paddyItems.filter(i => i.kms_year === kms_year); riceItems = riceItems.filter(i => i.kms_year === kms_year); }
    if (season) { paddyItems = paddyItems.filter(i => i.season === season); riceItems = riceItems.filter(i => i.season === season); }
    if (date_from) { paddyItems = paddyItems.filter(i => (i.date||'') >= date_from); riceItems = riceItems.filter(i => (i.date||'') >= date_from); }
    if (date_to) { paddyItems = paddyItems.filter(i => (i.date||'') <= date_to); riceItems = riceItems.filter(i => (i.date||'') <= date_to); }
    const partyMap = {};
    paddyItems.forEach(p => { const n = p.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: p.mandi_name||'', agent_name: p.agent_name||'', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].purchase_amount += p.total_amount||0; partyMap[n].purchase_paid += p.paid_amount||0; });
    riceItems.forEach(r => { const n = r.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: '', agent_name: '', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].sale_amount += r.total_amount||0; partyMap[n].sale_received += r.paid_amount||0; });
    let result = Object.values(partyMap).map(pm => ({ ...pm, purchase_balance: Math.round((pm.purchase_amount-pm.purchase_paid)*100)/100, sale_balance: Math.round((pm.sale_amount-pm.sale_received)*100)/100, net_balance: Math.round(((pm.purchase_amount-pm.purchase_paid)-(pm.sale_amount-pm.sale_received))*100)/100 }));
    if (search) { const s = search.toLowerCase(); result = result.filter(r => r.party_name.toLowerCase().includes(s)); }
    result.sort((a,b) => Math.abs(b.net_balance) - Math.abs(a.net_balance));
    const cols = getColumns('party_summary_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Summary');
    let title = 'Party-wise Summary'; if (kms_year) title += ` | KMS: ${kms_year}`;
    addExcelTitle(ws, title, cols.length, database);
    headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { name: 'Inter', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    const totals = { total_purchase: 0, total_purchase_paid: 0, total_purchase_balance: 0, total_sale: 0, total_sale_received: 0, total_sale_balance: 0, total_net_balance: 0 };
    result.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(5+idx, ci+1).value = v);
      totals.total_purchase += item.purchase_amount||0; totals.total_purchase_paid += item.purchase_paid||0;
      totals.total_purchase_balance += item.purchase_balance||0; totals.total_sale += item.sale_amount||0;
      totals.total_sale_received += item.sale_received||0; totals.total_sale_balance += item.sale_balance||0;
      totals.total_net_balance += item.net_balance||0;
    });
    styleExcelData(ws, 5);
    const trow = 5 + result.length;
    ws.getCell(trow,1).value = 'TOTAL'; ws.getCell(trow,1).font = { name: 'Inter', bold: true, size: 11 };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v,i) => { if (v !== null) { ws.getCell(trow,i+1).value = v; ws.getCell(trow,i+1).font = { name: 'Inter', bold: true, size: 11 }; } });
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(trow, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    }
    widths.forEach((w,i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `party_summary.xlsx`}`);
    // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
    try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== PARTY SUMMARY PDF =====
  router.get('/api/private-trading/party-summary/pdf', safeSync(async (req, res) => {
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHeader, addPdfTable, addTotalsRow, fmtAmt: pFmt, safePdfPipe, fmtDate, applyConsolidatedExcelPolish} = require('./pdf_helpers');
    const branding = database.getBranding ? database.getBranding() : {};
    if (!database.data.private_paddy) database.data.private_paddy = [];
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let paddyItems = [...database.data.private_paddy];
    let riceItems = [...database.data.rice_sales];
    if (kms_year) { paddyItems = paddyItems.filter(i => i.kms_year === kms_year); riceItems = riceItems.filter(i => i.kms_year === kms_year); }
    if (season) { paddyItems = paddyItems.filter(i => i.season === season); riceItems = riceItems.filter(i => i.season === season); }
    const partyMap = {};
    paddyItems.forEach(p => { const n = p.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: p.mandi_name||'', agent_name: p.agent_name||'', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].purchase_amount += p.total_amount||0; partyMap[n].purchase_paid += p.paid_amount||0; });
    riceItems.forEach(r => { const n = r.party_name||'?'; if (!partyMap[n]) partyMap[n] = { party_name: n, mandi_name: '', agent_name: '', purchase_amount: 0, purchase_paid: 0, sale_amount: 0, sale_received: 0 }; partyMap[n].sale_amount += r.total_amount||0; partyMap[n].sale_received += r.paid_amount||0; });
    let result = Object.values(partyMap).map(pm => ({ ...pm, purchase_balance: Math.round((pm.purchase_amount-pm.purchase_paid)*100)/100, sale_balance: Math.round((pm.sale_amount-pm.sale_received)*100)/100, net_balance: Math.round(((pm.purchase_amount-pm.purchase_paid)-(pm.sale_amount-pm.sale_received))*100)/100 }));
    if (search) { const s = search.toLowerCase(); result = result.filter(r => r.party_name.toLowerCase().includes(s)); }
    result.sort((a,b) => Math.abs(b.net_balance) - Math.abs(a.net_balance));
    const cols = getColumns('party_summary_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `party_summary.pdf`}`);
    // PDF will be sent via safePdfPipe
    let subtitle = ''; if (kms_year) subtitle = `FY: ${kms_year}`; if (season) subtitle += ` | ${season}`;
    _addPdfHeader(doc, 'Party-wise Summary', branding, subtitle);
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    const rows = result.map(item => getEntryRow(item, cols).map(v => String(v)));
    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    await safePdfPipe(doc, res);
  }));

  router.get('/api/private-paddy/excel', safeSync(async (req, res) => {
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(i => (i.party_name||'').toLowerCase().includes(s) || (i.mandi_name||'').toLowerCase().includes(s) || (i.agent_name||'').toLowerCase().includes(s));
    }
    items.forEach(i => { if (!i.final_qntl && i.quantity_qntl) i.final_qntl = i.quantity_qntl; if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));
    const cols = getColumns('private_paddy_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Pvt Paddy');
    let title = 'Private Paddy Purchase'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    addExcelTitle(ws, title, cols.length, database);
    headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { name: 'Inter', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    const totals = { total_kg: 0, total_final_qntl: 0, total_amount: 0, total_paid: 0, total_balance: 0 };
    items.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(5+idx, ci+1).value = v);
      totals.total_kg += item.kg || 0; totals.total_final_qntl += item.final_qntl || 0;
      totals.total_amount += item.total_amount || 0; totals.total_paid += item.paid_amount || 0; totals.total_balance += item.balance || 0;
    });
    Object.keys(totals).forEach(k => totals[k] = Math.round(totals[k]*100)/100);
    styleExcelData(ws, 5);
    const trow = 5 + items.length;
    ws.getCell(trow, 1).value = 'TOTAL'; ws.getCell(trow, 1).font = { name: 'Inter', bold: true, size: 11 };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i+1).value = v; ws.getCell(trow, i+1).font = { name: 'Inter', bold: true, size: 11 }; } });
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(trow, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    }
    widths.forEach((w, i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `pvt_paddy.xlsx`}`);
    // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
    try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== EXPORT: Private Paddy PDF =====
  router.get('/api/private-paddy/pdf', safeSync(async (req, res) => {
    const PDFDocument = require('pdfkit');
    const branding = database.getBranding ? database.getBranding() : {};
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(i => (i.party_name||'').toLowerCase().includes(s) || (i.mandi_name||'').toLowerCase().includes(s) || (i.agent_name||'').toLowerCase().includes(s));
    }
    items.forEach(i => { if (!i.final_qntl && i.quantity_qntl) i.final_qntl = i.quantity_qntl; if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));
    const cols = getColumns('private_paddy_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `pvt_paddy.pdf`}`);
    // PDF will be sent via safePdfPipe
    let subtitle = ''; if (kms_year) subtitle = `FY: ${kms_year}`; if (season) subtitle += ` | ${season}`;
    _addPdfHeader(doc, 'Private Paddy Purchase', branding, subtitle);
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    const rows = items.map(item => getEntryRow(item, cols).map(v => String(v)));
    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    await safePdfPipe(doc, res);
  }));

  // ===== EXPORT: Rice Sales Excel =====
  router.get('/api/rice-sales/excel', safeSync(async (req, res) => {
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) { const s = search.toLowerCase(); items = items.filter(i => (i.party_name||'').toLowerCase().includes(s)); }
    items.forEach(i => { if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));
    const cols = getColumns('rice_sales_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Rice Sales');
    let title = 'Rice Sales Report'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    addExcelTitle(ws, title, cols.length, database);
    headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { name: 'Inter', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    const totals = { total_qntl: 0, total_amount: 0, total_paid: 0, total_balance: 0 };
    items.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(5+idx, ci+1).value = v);
      totals.total_qntl += item.quantity_qntl || 0; totals.total_amount += item.total_amount || 0;
      totals.total_paid += item.paid_amount || 0; totals.total_balance += item.balance || 0;
    });
    Object.keys(totals).forEach(k => totals[k] = Math.round(totals[k]*100)/100);
    styleExcelData(ws, 5);
    const trow = 5 + items.length;
    ws.getCell(trow, 1).value = 'TOTAL'; ws.getCell(trow, 1).font = { name: 'Inter', bold: true, size: 11 };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i+1).value = v; ws.getCell(trow, i+1).font = { name: 'Inter', bold: true, size: 11 }; } });
    for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(trow, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    }
    widths.forEach((w, i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `rice_sales.xlsx`}`);
    // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
    try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== EXPORT: Rice Sales PDF =====
  router.get('/api/rice-sales/pdf', safeSync(async (req, res) => {
    const PDFDocument = require('pdfkit');
    const branding = database.getBranding ? database.getBranding() : {};
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) { const s = search.toLowerCase(); items = items.filter(i => (i.party_name||'').toLowerCase().includes(s)); }
    items.forEach(i => { if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));
    const cols = getColumns('rice_sales_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `rice_sales.pdf`}`);
    // PDF will be sent via safePdfPipe
    let subtitle = ''; if (kms_year) subtitle = `FY: ${kms_year}`; if (season) subtitle += ` | ${season}`;
    _addPdfHeader(doc, 'Rice Sales Report', branding, subtitle);
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    const rows = items.map(item => getEntryRow(item, cols).map(v => String(v)));
    addPdfTable(doc, headers, rows, colW, { fontSize: 6.5 });
    await safePdfPipe(doc, res);
  }));

  // === Mark Paid / Undo Paid / History for Private Paddy ===
  router.post('/api/private-paddy/:id/mark-paid', safeSync(async (req, res) => {
    if (!database.data.private_paddy) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.private_paddy.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    const total = parseFloat(item.total_amount) || 0;
    const remaining = Math.round((total - (item.paid_amount || 0)) * 100) / 100;
    item.paid_amount = total;
    item.balance = 0;
    item.payment_status = 'paid';
    item.updated_at = new Date().toISOString();
    if (remaining > 0) {
      const party = item.party_name || '';
      const mandi = item.mandi_name || '';
      const partyLabel = _makePartyLabel(party, mandi);
      const markId = `mark_paid:${item.id.slice(0, 8)}`;
      const base = { date: item.date || '', kms_year: item.kms_year || '', season: item.season || '', created_by: req.query.username || '', linked_payment_id: markId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      database.data.cash_transactions.push({ id: require('crypto').randomUUID(), account: 'cash', txn_type: 'nikasi', category: partyLabel, party_type: 'Pvt Paddy Purchase', description: `${partyLabel} (Mark Paid)`, amount: remaining, reference: markId, ...base });
      database.data.cash_transactions.push({ id: require('crypto').randomUUID(), account: 'ledger', txn_type: 'nikasi', category: partyLabel, party_type: 'Pvt Paddy Purchase', description: `${partyLabel} (Mark Paid)`, amount: remaining, reference: `mark_paid_ledger:${item.id.slice(0, 8)}`, ...base });
    }
    database.save();
    res.json({ success: true, message: `Marked paid - Rs.${remaining} cleared` });
  }));

  router.post('/api/private-paddy/:id/undo-paid', safeSync(async (req, res) => {
    if (!database.data.private_paddy) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.private_paddy.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    const total = parseFloat(item.total_amount) || 0;
    const entryId = item.id;
    const entryIdShort = entryId.slice(0, 8);
    // FIRST: Get all payment IDs BEFORE deleting them
    const paymentIds = (database.data.private_payments || [])
      .filter(p => p.ref_id === entryId && p.ref_type === 'paddy_purchase')
      .map(p => p.id);
    // Collect ALL cash txn IDs to delete (for auto_ledger cleanup)
    const txnIdsToDelete = new Set();
    // Find cash entries linked to individual payments
    (database.data.cash_transactions || []).forEach(t => {
      if (paymentIds.includes(t.linked_payment_id)) txnIdsToDelete.add(t.id);
      const lp = t.linked_payment_id || '';
      if (lp.startsWith(`mark_paid:${entryIdShort}`)) txnIdsToDelete.add(t.id);
      const tref = t.reference || '';
      if (tref.includes('pvt_paddy_adv') && t.linked_entry_id === entryId) txnIdsToDelete.add(t.id);
      if (t.cashbook_pvt_linked === entryId) txnIdsToDelete.add(t.id);
    });
    // Also collect auto_ledger entries for all deleted txns
    const autoLedgerRefs = new Set();
    txnIdsToDelete.forEach(tid => autoLedgerRefs.add(`auto_ledger:${tid.slice(0, 8)}`));
    // Delete all matched entries + their auto_ledger pairs
    database.data.cash_transactions = (database.data.cash_transactions || []).filter(t => {
      if (txnIdsToDelete.has(t.id)) return false;
      if (autoLedgerRefs.has(t.reference)) return false;
      return true;
    });
    // Delete all linked payments
    database.data.private_payments = (database.data.private_payments || []).filter(p => !(p.ref_id === entryId && p.ref_type === 'paddy_purchase'));
    // Reset entry
    item.paid_amount = 0;
    item.balance = total;
    item.payment_status = 'pending';
    item.updated_at = new Date().toISOString();
    database.save();
    res.json({ success: true, message: 'Payment undo - sab reset ho gaya' });
  }));

  router.get('/api/private-paddy/:id/history', safeSync(async (req, res) => {
    const entryId = req.params.id;
    const entryIdShort = entryId.slice(0, 8);
    const payments = (database.data.private_payments || []).filter(p => p.ref_id === entryId && p.ref_type === 'paddy_purchase').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    // Advance entries
    const advEntries = (database.data.cash_transactions || []).filter(t => t.linked_entry_id === entryId && (t.reference || '').startsWith('pvt_paddy_adv:') && t.account === 'cash');
    advEntries.forEach(adv => {
      payments.push({ id: adv.id || '', date: adv.date || '', amount: adv.amount || 0, mode: 'advance', reference: adv.reference || '', remark: 'Advance (Entry ke saath bhara tha)', payment_type: 'advance', created_at: adv.created_at || '' });
    });
    // Mark-paid entries
    const markEntries = (database.data.cash_transactions || []).filter(t => (t.reference || '').startsWith(`mark_paid:${entryIdShort}`) && t.account === 'cash');
    markEntries.forEach(mk => {
      payments.push({ id: mk.id || '', date: mk.date || '', amount: mk.amount || 0, mode: 'mark_paid', reference: mk.reference || '', remark: 'Mark Paid se clear hua', payment_type: 'mark_paid', created_at: mk.created_at || '' });
    });
    // Manual cash book entries (cashbook_pvt_linked)
    const existingIds = new Set(payments.map(p => p.id));
    const manualEntries = (database.data.cash_transactions || []).filter(t => t.cashbook_pvt_linked === entryId && (t.account === 'cash' || t.account === 'bank'));
    manualEntries.forEach(me => {
      if (!existingIds.has(me.id)) {
        payments.push({ id: me.id || '', date: me.date || '', amount: me.amount || 0, mode: me.account || 'cash', reference: me.reference || '', remark: `Cash Book se manual payment (${me.account || 'cash'})`, payment_type: 'manual_cashbook', created_at: me.created_at || '' });
      }
    });
    payments.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const entry = (database.data.private_paddy || []).find(e => e.id === entryId);
    const totalPaid = entry ? (entry.paid_amount || 0) : 0;
    res.json({ history: payments, total_paid: totalPaid });
  }));

  // === Mark Paid / Undo Paid / History for Rice Sales ===
  router.post('/api/rice-sales/:id/mark-paid', safeSync(async (req, res) => {
    if (!database.data.rice_sales) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.rice_sales.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    item.is_paid = true;
    item.paid_at = new Date().toISOString();
    item.paid_by = req.query.username || '';
    database.save();
    res.json({ message: 'Marked as paid', id: req.params.id });
  }));

  router.post('/api/rice-sales/:id/undo-paid', safeSync(async (req, res) => {
    if (!database.data.rice_sales) return res.status(404).json({ detail: 'Not found' });
    const item = database.data.rice_sales.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ detail: 'Not found' });
    item.is_paid = false;
    item.paid_at = null;
    item.paid_by = null;
    database.save();
    res.json({ message: 'Payment undone', id: req.params.id });
  }));

  router.get('/api/rice-sales/:id/history', safeSync(async (req, res) => {
    const entryId = req.params.id;
    const payments = (database.data.private_payments || []).filter(p => p.ref_id === entryId && p.ref_type === 'rice_sale').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    // Also include advance entries
    const advEntries = (database.data.cash_transactions || []).filter(t => t.linked_entry_id === entryId && (t.reference || '').startsWith('rice_sale_adv:') && t.account === 'cash');
    advEntries.forEach(adv => {
      payments.push({ id: adv.id || '', date: adv.date || '', amount: adv.amount || 0, mode: 'advance', reference: adv.reference || '', remark: 'Advance (Entry ke saath bhara tha)', payment_type: 'advance', created_at: adv.created_at || '' });
    });
    // Also include mark-paid entries
    const markEntries = (database.data.cash_transactions || []).filter(t => (t.reference || '').startsWith(`mark_paid:${entryId.slice(0,8)}`) && t.account === 'cash');
    markEntries.forEach(mk => {
      payments.push({ id: mk.id || '', date: mk.date || '', amount: mk.amount || 0, mode: 'mark_paid', reference: mk.reference || '', remark: 'Mark Paid se clear hua', payment_type: 'mark_paid', created_at: mk.created_at || '' });
    });
    payments.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const entry = (database.data.rice_sales || []).find(e => e.id === entryId);
    const totalPaid = entry ? (entry.paid_amount || 0) : 0;
    res.json({ history: payments, total_paid: totalPaid });
  }));

  return router;
};
