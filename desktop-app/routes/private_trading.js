const express = require('express');
const { safeSync } = require('./safe_handler');
const { getColumns, getEntryRow, getTotalRow, getExcelHeaders, getExcelWidths, getPdfHeaders, getPdfWidthsMm, colCount } = require('../../shared/report_helper');
const router = express.Router();

module.exports = function(database) {

  function calcPaddyAutoDesktop(d) {
    d.qntl = Math.round((d.kg || 0) / 100 * 100) / 100;
    d.gbw_cut = d.g_deposite > 0 ? Math.round(d.g_deposite * 0.5 * 100) / 100 : Math.round((d.bag || 0) * 1 * 100) / 100;
    d.mill_w = Math.round(((d.kg || 0) - d.gbw_cut) * 100) / 100;
    d.p_pkt_cut = Math.round((d.plastic_bag || 0) * 0.5 * 100) / 100;
    const moistPct = (d.moisture || 0) > 17 ? Math.round(((d.moisture || 0) - 17) * 100) / 100 : 0;
    d.moisture_cut_percent = moistPct;
    d.moisture_cut = Math.round(d.mill_w * moistPct / 100 * 100) / 100;
    const afterM = d.mill_w - d.moisture_cut;
    d.cutting = Math.round(afterM * (d.cutting_percent || 0) / 100 * 100) / 100;
    d.final_w = Math.round((afterM - d.cutting - d.p_pkt_cut - (d.disc_dust_poll || 0)) * 100) / 100;
    d.final_qntl = Math.round(d.final_w / 100 * 100) / 100;
    d.total_amount = Math.round(d.final_qntl * (d.rate_per_qntl || 0) * 100) / 100;
    d.balance = Math.round(d.total_amount - (d.paid_amount || 0), 2);
    return d;
  }

  // ===== PRIVATE PADDY =====
  router.post('/api/private-paddy', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { d[f] = parseFloat(d[f]) || 0; });
    d.bag = parseInt(d.bag) || 0; d.plastic_bag = parseInt(d.plastic_bag) || 0;
    calcPaddyAutoDesktop(d);
    database.data.private_paddy.push(d); database.save(); res.json(d);
  }));

  router.get('/api/private-paddy', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.private_paddy];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    res.json(items);
  }));

  router.put('/api/private-paddy/:id', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const merged = { ...database.data.private_paddy[idx], ...req.body, updated_at: new Date().toISOString() };
    ['kg','bag','rate_per_qntl','g_deposite','plastic_bag','moisture','cutting_percent','disc_dust_poll','paid_amount'].forEach(f => { merged[f] = parseFloat(merged[f]) || 0; });
    merged.bag = parseInt(merged.bag) || 0; merged.plastic_bag = parseInt(merged.plastic_bag) || 0;
    calcPaddyAutoDesktop(merged);
    database.data.private_paddy[idx] = merged; database.save(); res.json(merged);
  }));

  router.delete('/api/private-paddy/:id', safeSync((req, res) => {
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const idx = database.data.private_paddy.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.private_paddy.splice(idx, 1); database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== RICE SALES =====
  router.post('/api/rice-sales', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    d.quantity_qntl = parseFloat(d.quantity_qntl) || 0; d.rate_per_qntl = parseFloat(d.rate_per_qntl) || 0;
    d.bags = parseInt(d.bags) || 0; d.paid_amount = parseFloat(d.paid_amount) || 0;
    d.total_amount = Math.round(d.quantity_qntl * d.rate_per_qntl * 100) / 100;
    d.balance = Math.round(d.total_amount - d.paid_amount, 2);
    database.data.rice_sales.push(d); database.save(); res.json(d);
  }));

  router.get('/api/rice-sales', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, party_name } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    res.json(items);
  }));

  router.put('/api/rice-sales/:id', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const merged = { ...database.data.rice_sales[idx], ...req.body, updated_at: new Date().toISOString() };
    merged.quantity_qntl = parseFloat(merged.quantity_qntl) || 0; merged.rate_per_qntl = parseFloat(merged.rate_per_qntl) || 0;
    merged.bags = parseInt(merged.bags) || 0; merged.paid_amount = parseFloat(merged.paid_amount) || 0;
    merged.total_amount = Math.round(merged.quantity_qntl * merged.rate_per_qntl * 100) / 100;
    merged.balance = Math.round(merged.total_amount - merged.paid_amount, 2);
    database.data.rice_sales[idx] = merged; database.save(); res.json(merged);
  }));

  router.delete('/api/rice-sales/:id', safeSync((req, res) => {
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const idx = database.data.rice_sales.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.rice_sales.splice(idx, 1); database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== PRIVATE PAYMENTS =====
  router.post('/api/private-payments', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = { id: require('crypto').randomUUID(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    d.amount = parseFloat(d.amount) || 0;
    database.data.private_payments.push(d);
    if (d.ref_type === 'paddy_purchase' && d.ref_id) {
      const entry = (database.data.private_paddy || []).find(e => e.id === d.ref_id);
      if (entry) { entry.paid_amount = Math.round((entry.paid_amount || 0) + d.amount * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    } else if (d.ref_type === 'rice_sale' && d.ref_id) {
      const entry = (database.data.rice_sales || []).find(e => e.id === d.ref_id);
      if (entry) { entry.paid_amount = Math.round((entry.paid_amount || 0) + d.amount * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    }
    const account = d.mode === 'bank' ? 'bank' : 'cash';
    const cbTxn = {
      id: require('crypto').randomUUID(), date: d.date, account,
      txn_type: d.ref_type === 'paddy_purchase' ? 'nikasi' : 'jama',
      category: d.ref_type === 'paddy_purchase' ? 'Pvt Paddy Payment' : 'Rice Sale Payment',
      description: d.ref_type === 'paddy_purchase' ? `Paddy Payment: ${d.party_name}` : `Rice Payment Received: ${d.party_name}`,
      amount: d.amount, reference: d.reference || d.id.substring(0, 8),
      kms_year: d.kms_year || '', season: d.season || '', created_by: d.created_by,
      linked_payment_id: d.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    database.data.cash_transactions.push(cbTxn);
    database.save(); res.json(d);
  }));

  router.get('/api/private-payments', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    const { party_name, ref_type, ref_id, kms_year, season } = req.query;
    let items = [...database.data.private_payments];
    if (party_name) items = items.filter(i => (i.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    if (ref_type) items = items.filter(i => i.ref_type === ref_type);
    if (ref_id) items = items.filter(i => i.ref_id === ref_id);
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    items.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    res.json(items);
  }));

  router.delete('/api/private-payments/:id', safeSync((req, res) => {
    if (!database.data.private_payments) database.data.private_payments = [];
    const idx = database.data.private_payments.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const pay = database.data.private_payments[idx];
    if (pay.ref_type === 'paddy_purchase' && pay.ref_id) {
      const entry = (database.data.private_paddy || []).find(e => e.id === pay.ref_id);
      if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - pay.amount) * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    } else if (pay.ref_type === 'rice_sale' && pay.ref_id) {
      const entry = (database.data.rice_sales || []).find(e => e.id === pay.ref_id);
      if (entry) { entry.paid_amount = Math.round(Math.max(0, (entry.paid_amount || 0) - pay.amount) * 100) / 100; entry.balance = Math.round(entry.total_amount - entry.paid_amount * 100) / 100; }
    }
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== pay.id);
    }
    database.data.private_payments.splice(idx, 1); database.save(); res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ===== EXPORT: Private Paddy Excel =====
  router.get('/api/private-paddy/excel', safeSync((req, res) => {
    const ExcelJS = require('exceljs');
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
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('private_paddy_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Pvt Paddy');
    let title = 'Private Paddy Purchase'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    ws.mergeCells(1, 1, 1, cols.length); ws.getCell('A1').value = title; ws.getCell('A1').font = { bold: true, size: 14 };
    headers.forEach((h, i) => { const c = ws.getCell(3, i+1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; });
    const totals = { total_kg: 0, total_final_qntl: 0, total_amount: 0, total_paid: 0, total_balance: 0 };
    items.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(4+idx, ci+1).value = v);
      totals.total_kg += item.kg || 0; totals.total_final_qntl += item.final_qntl || 0;
      totals.total_amount += item.total_amount || 0; totals.total_paid += item.paid_amount || 0; totals.total_balance += item.balance || 0;
    });
    Object.keys(totals).forEach(k => totals[k] = Math.round(totals[k]*100)/100);
    const trow = 4 + items.length;
    ws.getCell(trow, 1).value = 'TOTAL'; ws.getCell(trow, 1).font = { bold: true };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i+1).value = v; ws.getCell(trow, i+1).font = { bold: true }; } });
    widths.forEach((w, i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=pvt_paddy.xlsx');
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== EXPORT: Private Paddy PDF =====
  router.get('/api/private-paddy/pdf', safeSync((req, res) => {
    const PDFDocument = require('pdfkit');
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
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('private_paddy_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=pvt_paddy.pdf');
    doc.pipe(res);
    let title = 'Private Paddy Purchase'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    doc.fontSize(14).fillColor('#D97706').text(title, { align: 'center' }); doc.moveDown(0.5);
    doc.fontSize(7).fillColor('#333');
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    let y = doc.y;
    headers.forEach((h, i) => { let x = 20 + colW.slice(0, i).reduce((a,b)=>a+b,0); doc.fillColor('#1E293B').rect(x, y, colW[i], 14).fill(); doc.fillColor('#FFF').text(h, x+2, y+3, { width: colW[i]-4 }); });
    y += 16; doc.fillColor('#333');
    items.forEach(item => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, i) => { let x = 20 + colW.slice(0, i).reduce((a,b)=>a+b,0); doc.text(String(v), x+2, y+2, { width: colW[i]-4 }); });
      y += 14; if (y > 560) { doc.addPage(); y = 20; }
    });
    doc.end();
  }));

  // ===== EXPORT: Rice Sales Excel =====
  router.get('/api/rice-sales/excel', safeSync((req, res) => {
    const ExcelJS = require('exceljs');
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) { const s = search.toLowerCase(); items = items.filter(i => (i.party_name||'').toLowerCase().includes(s)); }
    items.forEach(i => { if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('rice_sales_report');
    const headers = getExcelHeaders(cols);
    const widths = getExcelWidths(cols);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Rice Sales');
    let title = 'Rice Sales Report'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    ws.mergeCells(1, 1, 1, cols.length); ws.getCell('A1').value = title; ws.getCell('A1').font = { bold: true, size: 14 };
    headers.forEach((h, i) => { const c = ws.getCell(3, i+1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }; });
    const totals = { total_qntl: 0, total_amount: 0, total_paid: 0, total_balance: 0 };
    items.forEach((item, idx) => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, ci) => ws.getCell(4+idx, ci+1).value = v);
      totals.total_qntl += item.quantity_qntl || 0; totals.total_amount += item.total_amount || 0;
      totals.total_paid += item.paid_amount || 0; totals.total_balance += item.balance || 0;
    });
    Object.keys(totals).forEach(k => totals[k] = Math.round(totals[k]*100)/100);
    const trow = 4 + items.length;
    ws.getCell(trow, 1).value = 'TOTAL'; ws.getCell(trow, 1).font = { bold: true };
    const totalVals = getTotalRow(totals, cols);
    totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i+1).value = v; ws.getCell(trow, i+1).font = { bold: true }; } });
    widths.forEach((w, i) => ws.getColumn(i+1).width = w);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=rice_sales.xlsx');
    wb.xlsx.write(res).then(() => res.end());
  }));

  // ===== EXPORT: Rice Sales PDF =====
  router.get('/api/rice-sales/pdf', safeSync((req, res) => {
    const PDFDocument = require('pdfkit');
    if (!database.data.rice_sales) database.data.rice_sales = [];
    const { kms_year, season, search } = req.query;
    let items = [...database.data.rice_sales];
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (search) { const s = search.toLowerCase(); items = items.filter(i => (i.party_name||'').toLowerCase().includes(s)); }
    items.forEach(i => { if (!i.balance) i.balance = Math.round(((i.total_amount||0)-(i.paid_amount||0))*100)/100; });
    items.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.created_at||'').localeCompare(a.created_at||''));
    const cols = getColumns('rice_sales_report');
    const headers = getPdfHeaders(cols);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=rice_sales.pdf');
    doc.pipe(res);
    let title = 'Rice Sales Report'; if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    doc.fontSize(14).fillColor('#065F46').text(title, { align: 'center' }); doc.moveDown(0.5);
    doc.fontSize(7).fillColor('#333');
    const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
    let y = doc.y;
    headers.forEach((h, i) => { let x = 20 + colW.slice(0, i).reduce((a,b)=>a+b,0); doc.fillColor('#065F46').rect(x, y, colW[i], 14).fill(); doc.fillColor('#FFF').text(h, x+2, y+3, { width: colW[i]-4 }); });
    y += 16; doc.fillColor('#333');
    items.forEach(item => {
      const vals = getEntryRow(item, cols);
      vals.forEach((v, i) => { let x = 20 + colW.slice(0, i).reduce((a,b)=>a+b,0); doc.text(String(v), x+2, y+2, { width: colW[i]-4 }); });
      y += 14; if (y > 560) { doc.addPage(); y = 20; }
    });
    doc.end();
  }));

  return router;
};
