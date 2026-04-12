const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const { fmtDate } = require('./pdf_helpers');

module.exports = function(database) {

  // ============ FORM A: Paddy Received from OSCSC ============
  router.get('/api/govt-registers/form-a', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    // entries in JS = mill_entries in Python
    let entries = [...(database.data.entries || [])];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);

    let millingEntries = [...(database.data.milling_entries || [])];
    if (kms_year) millingEntries = millingEntries.filter(e => e.kms_year === kms_year);
    if (season) millingEntries = millingEntries.filter(e => e.season === season);
    if (date_from) millingEntries = millingEntries.filter(e => (e.date || '') >= date_from);
    if (date_to) millingEntries = millingEntries.filter(e => (e.date || '') <= date_to);

    // Group by date
    const dailyReceived = {};
    for (const e of entries) {
      const d = e.date || '';
      if (!d) continue;
      if (!dailyReceived[d]) dailyReceived[d] = { received_qntl: 0, bags: 0, count: 0 };
      let finalW = parseFloat(e.final_w || 0) / 100; // final_w is KG, convert to QNTL
      if (finalW === 0) finalW = parseFloat(e.kg || 0) / 100;
      dailyReceived[d].received_qntl += finalW;
      dailyReceived[d].bags += parseInt(e.bag || 0);
      dailyReceived[d].count += 1;
    }

    const dailyMilled = {};
    for (const m of millingEntries) {
      const d = m.date || '';
      if (!d) continue;
      if (!dailyMilled[d]) dailyMilled[d] = 0;
      dailyMilled[d] += parseFloat(m.paddy_input_qntl || 0);
    }

    const allDates = [...new Set([...Object.keys(dailyReceived), ...Object.keys(dailyMilled)])].sort();
    const rows = [];
    let openingBalance = 0;
    let totalReceived = 0;
    let totalMilled = 0;

    for (const d of allDates) {
      const received = Math.round((dailyReceived[d]?.received_qntl || 0) * 100) / 100;
      const bags = dailyReceived[d]?.bags || 0;
      const count = dailyReceived[d]?.count || 0;
      const milled = Math.round((dailyMilled[d] || 0) * 100) / 100;
      const totalPaddy = Math.round((openingBalance + received) * 100) / 100;
      const closingBalance = Math.round((totalPaddy - milled) * 100) / 100;
      totalReceived += received;
      totalMilled += milled;
      rows.push({ date: d, opening_balance: Math.round(openingBalance * 100) / 100, received_qntl: received, bags, entries_count: count, total_paddy: totalPaddy, milled_qntl: milled, closing_balance: closingBalance });
      openingBalance = closingBalance;
    }

    res.json({
      rows,
      summary: { total_received: Math.round(totalReceived * 100) / 100, total_milled: Math.round(totalMilled * 100) / 100, final_balance: Math.round(openingBalance * 100) / 100, total_days: rows.length }
    });
  }));

  router.get('/api/govt-registers/form-a/excel', safeAsync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    // Re-use the logic from GET
    const dataRes = { json: (d) => d };
    req.query = { kms_year, season, date_from, date_to };

    // Inline the data fetching
    let entries = [...(database.data.entries || [])];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);

    let millingEntries = [...(database.data.milling_entries || [])];
    if (kms_year) millingEntries = millingEntries.filter(e => e.kms_year === kms_year);
    if (season) millingEntries = millingEntries.filter(e => e.season === season);

    const dailyReceived = {};
    for (const e of entries) {
      const d = e.date || '';
      if (!d) continue;
      if (!dailyReceived[d]) dailyReceived[d] = { received_qntl: 0, bags: 0 };
      let finalW = parseFloat(e.final_w || 0) / 100; // KG to QNTL
      if (finalW === 0) finalW = parseFloat(e.kg || 0) / 100;
      dailyReceived[d].received_qntl += finalW;
      dailyReceived[d].bags += parseInt(e.bag || 0);
    }
    const dailyMilled = {};
    for (const m of millingEntries) {
      const d = m.date || '';
      if (!d) continue;
      if (!dailyMilled[d]) dailyMilled[d] = 0;
      dailyMilled[d] += parseFloat(m.paddy_input_qntl || 0);
    }

    const allDates = [...new Set([...Object.keys(dailyReceived), ...Object.keys(dailyMilled)])].sort();
    const rows = [];
    let ob = 0, tr = 0, tm = 0;
    for (const d of allDates) {
      const recv = Math.round((dailyReceived[d]?.received_qntl || 0) * 100) / 100;
      const bags = dailyReceived[d]?.bags || 0;
      const mil = Math.round((dailyMilled[d] || 0) * 100) / 100;
      const tot = Math.round((ob + recv) * 100) / 100;
      const cb = Math.round((tot - mil) * 100) / 100;
      tr += recv; tm += mil;
      rows.push([fmtDate(d), Math.round(ob * 100) / 100, recv, bags, tot, mil, cb]);
      ob = cb;
    }
    rows.push(['TOTAL', '', Math.round(tr * 100) / 100, '', '', Math.round(tm * 100) / 100, Math.round(ob * 100) / 100]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Form A');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = branding.company_name || 'NAVKAR AGRO';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: '1F4E79' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `Form A - Paddy Received from State Procuring Agency | ${kms_year || 'All'} ${season || ''}`;
    ws.getCell('A2').font = { bold: true, size: 12, color: { argb: '4472C4' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    const headers = ['Date', 'Opening Bal (Qtl)', 'Paddy Received (Qtl)', 'Bags', 'Total Paddy (Qtl)', 'Paddy Milled (Qtl)', 'Closing Bal (Qtl)'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; c.alignment = { horizontal: 'center' }; });
    rows.forEach(r => ws.addRow(r));
    [14, 18, 20, 10, 18, 20, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Form_A_Paddy_Register_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ FORM B: CMR Produced and Delivered ============
  router.get('/api/govt-registers/form-b', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;

    let millingEntries = [...(database.data.milling_entries || [])];
    if (kms_year) millingEntries = millingEntries.filter(e => e.kms_year === kms_year);
    if (season) millingEntries = millingEntries.filter(e => e.season === season);
    if (date_from) millingEntries = millingEntries.filter(e => (e.date || '') >= date_from);
    if (date_to) millingEntries = millingEntries.filter(e => (e.date || '') <= date_to);

    let saleEntries = [...(database.data.salebook || [])];
    if (kms_year) saleEntries = saleEntries.filter(e => e.kms_year === kms_year);
    if (season) saleEntries = saleEntries.filter(e => e.season === season);
    if (date_from) saleEntries = saleEntries.filter(e => (e.date || '') >= date_from);
    if (date_to) saleEntries = saleEntries.filter(e => (e.date || '') <= date_to);

    const dailyProduced = {};
    for (const m of millingEntries) {
      const d = m.date || '';
      if (!d) continue;
      if (!dailyProduced[d]) dailyProduced[d] = { cmr_qntl: 0 };
      dailyProduced[d].cmr_qntl += parseFloat(m.cmr_delivery_qntl || m.rice_qntl || 0);
    }

    const dailyDelivered = {};
    for (const s of saleEntries) {
      const d = s.date || '';
      if (!d) continue;
      if (!dailyDelivered[d]) dailyDelivered[d] = { delivered_qntl: 0, parties: [] };
      const totalQty = (s.items || []).reduce((sum, it) => sum + parseFloat(it.quantity || 0), 0);
      dailyDelivered[d].delivered_qntl += totalQty / 100;
      const party = s.party_name || '';
      if (party && !dailyDelivered[d].parties.includes(party)) dailyDelivered[d].parties.push(party);
    }

    const allDates = [...new Set([...Object.keys(dailyProduced), ...Object.keys(dailyDelivered)])].sort();
    const rows = [];
    let ob = 0, tp = 0, td = 0;

    for (const d of allDates) {
      const produced = Math.round((dailyProduced[d]?.cmr_qntl || 0) * 100) / 100;
      const delivered = Math.round((dailyDelivered[d]?.delivered_qntl || 0) * 100) / 100;
      const parties = dailyDelivered[d]?.parties || [];
      const totalRice = Math.round((ob + produced) * 100) / 100;
      const closing = Math.round((totalRice - delivered) * 100) / 100;
      tp += produced; td += delivered;
      rows.push({ date: d, opening_balance: Math.round(ob * 100) / 100, cmr_produced: produced, total_rice: totalRice, cmr_delivered: delivered, closing_balance: closing, delivered_to: parties.length ? parties.join(', ') : '-' });
      ob = closing;
    }

    res.json({ rows, summary: { total_produced: Math.round(tp * 100) / 100, total_delivered: Math.round(td * 100) / 100, final_balance: Math.round(ob * 100) / 100 } });
  }));

  router.get('/api/govt-registers/form-b/excel', safeAsync(async (req, res) => {
    const { kms_year, season } = req.query;
    // Simplified: fetch form-b data inline
    let millingEntries = [...(database.data.milling_entries || [])];
    if (kms_year) millingEntries = millingEntries.filter(e => e.kms_year === kms_year);
    if (season) millingEntries = millingEntries.filter(e => e.season === season);
    let saleEntries = [...(database.data.salebook || [])];
    if (kms_year) saleEntries = saleEntries.filter(e => e.kms_year === kms_year);
    if (season) saleEntries = saleEntries.filter(e => e.season === season);

    const dailyProduced = {};
    for (const m of millingEntries) { const d = m.date || ''; if (!d) continue; if (!dailyProduced[d]) dailyProduced[d] = 0; dailyProduced[d] += parseFloat(m.cmr_delivery_qntl || m.rice_qntl || 0); }
    const dailyDelivered = {};
    for (const s of saleEntries) { const d = s.date || ''; if (!d) continue; if (!dailyDelivered[d]) dailyDelivered[d] = { qty: 0, parties: [] }; dailyDelivered[d].qty += (s.items || []).reduce((sum, it) => sum + parseFloat(it.quantity || 0), 0) / 100; const p = s.party_name || ''; if (p && !dailyDelivered[d].parties.includes(p)) dailyDelivered[d].parties.push(p); }

    const allDates = [...new Set([...Object.keys(dailyProduced), ...Object.keys(dailyDelivered)])].sort();
    const dataRows = [];
    let ob = 0, tp = 0, td = 0;
    for (const d of allDates) {
      const prod = Math.round((dailyProduced[d] || 0) * 100) / 100;
      const del = Math.round((dailyDelivered[d]?.qty || 0) * 100) / 100;
      const tot = Math.round((ob + prod) * 100) / 100;
      const cb = Math.round((tot - del) * 100) / 100;
      tp += prod; td += del;
      dataRows.push([fmtDate(d), Math.round(ob * 100) / 100, prod, tot, del, cb, (dailyDelivered[d]?.parties || []).join(', ') || '-']);
      ob = cb;
    }
    dataRows.push(['TOTAL', '', Math.round(tp * 100) / 100, '', Math.round(td * 100) / 100, Math.round(ob * 100) / 100, '']);

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Form B');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:G1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:G2'); ws.getCell('A2').value = `Form B - CMR Produced & Delivered | ${kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['Date', 'Opening Bal (Qtl)', 'CMR Produced (Qtl)', 'Total Rice (Qtl)', 'CMR Delivered (Qtl)', 'Closing Bal (Qtl)', 'Delivered To']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    dataRows.forEach(r => ws.addRow(r));
    [14, 18, 20, 18, 20, 18, 30].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Form_B_CMR_Register_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ FORM E: Miller's Own Paddy ============
  router.get('/api/govt-registers/form-e', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    let purchases = [...(database.data.private_paddy || [])];
    if (kms_year) purchases = purchases.filter(e => e.kms_year === kms_year);
    if (season) purchases = purchases.filter(e => e.season === season);
    if (date_from) purchases = purchases.filter(e => (e.date || '') >= date_from);
    if (date_to) purchases = purchases.filter(e => (e.date || '') <= date_to);

    const dailyData = {};
    for (const p of purchases) {
      const d = p.date || '';
      if (!d) continue;
      if (!dailyData[d]) dailyData[d] = { purchased_qntl: 0, bags: 0, parties: [], amount: 0 };
      dailyData[d].purchased_qntl += parseFloat(p.kg || 0) / 100;
      dailyData[d].bags += parseInt(p.bag || 0);
      dailyData[d].amount += parseFloat(p.amount || 0);
      const party = p.party_name || '';
      if (party && !dailyData[d].parties.includes(party)) dailyData[d].parties.push(party);
    }

    const allDates = Object.keys(dailyData).sort();
    const rows = [];
    let ob = 0, tp = 0;
    for (const d of allDates) {
      const purchased = Math.round(dailyData[d].purchased_qntl * 100) / 100;
      const total = Math.round((ob + purchased) * 100) / 100;
      tp += purchased;
      rows.push({ date: d, opening_balance: Math.round(ob * 100) / 100, purchased_qntl: purchased, bags: dailyData[d].bags, total, closing_balance: total, parties: dailyData[d].parties.join(', ') || '-', amount: Math.round(dailyData[d].amount * 100) / 100 });
      ob = total;
    }

    res.json({ rows, summary: { total_purchased: Math.round(tp * 100) / 100, final_balance: Math.round(ob * 100) / 100 } });
  }));

  router.get('/api/govt-registers/form-e/excel', safeAsync(async (req, res) => {
    const { kms_year, season } = req.query;
    let purchases = [...(database.data.private_paddy || [])];
    if (kms_year) purchases = purchases.filter(e => e.kms_year === kms_year);
    if (season) purchases = purchases.filter(e => e.season === season);
    const dailyData = {};
    for (const p of purchases) { const d = p.date || ''; if (!d) continue; if (!dailyData[d]) dailyData[d] = { qty: 0, bags: 0, parties: [], amt: 0 }; dailyData[d].qty += parseFloat(p.kg || 0) / 100; dailyData[d].bags += parseInt(p.bag || 0); dailyData[d].amt += parseFloat(p.amount || 0); const party = p.party_name || ''; if (party && !dailyData[d].parties.includes(party)) dailyData[d].parties.push(party); }
    const allDates = Object.keys(dailyData).sort();
    const dataRows = [];
    let ob = 0, tp = 0;
    for (const d of allDates) { const pq = Math.round(dailyData[d].qty * 100) / 100; const tot = Math.round((ob + pq) * 100) / 100; tp += pq; dataRows.push([fmtDate(d), Math.round(ob * 100) / 100, pq, dailyData[d].bags, tot, tot, dailyData[d].parties.join(', ') || '-', Math.round(dailyData[d].amt * 100) / 100]); ob = tot; }
    dataRows.push(['TOTAL', '', Math.round(tp * 100) / 100, '', '', Math.round(ob * 100) / 100, '', '']);

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Form E');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:H1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:H2'); ws.getCell('A2').value = `Form E - Miller's Own Paddy | ${kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['Date', 'Opening Bal (Qtl)', 'Paddy Purchased (Qtl)', 'Bags', 'Total (Qtl)', 'Closing Bal (Qtl)', 'Party Name', 'Amount (Rs)']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    dataRows.forEach(r => ws.addRow(r));
    [14, 18, 22, 10, 15, 18, 28, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Form_E_Miller_Paddy_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ FORM F: Miller's Own Rice Sale ============
  router.get('/api/govt-registers/form-f', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    let sales = [...(database.data.private_rice_sales || [])];
    if (kms_year) sales = sales.filter(e => e.kms_year === kms_year);
    if (season) sales = sales.filter(e => e.season === season);
    if (date_from) sales = sales.filter(e => (e.date || '') >= date_from);
    if (date_to) sales = sales.filter(e => (e.date || '') <= date_to);

    let saleVouchers = [...(database.data.salebook || [])];
    if (kms_year) saleVouchers = saleVouchers.filter(e => e.kms_year === kms_year);
    if (season) saleVouchers = saleVouchers.filter(e => e.season === season);
    if (date_from) saleVouchers = saleVouchers.filter(e => (e.date || '') >= date_from);
    if (date_to) saleVouchers = saleVouchers.filter(e => (e.date || '') <= date_to);

    const dailyData = {};
    for (const s of sales) { const d = s.date || ''; if (!d) continue; if (!dailyData[d]) dailyData[d] = { sold_qntl: 0, parties: [], amount: 0 }; dailyData[d].sold_qntl += parseFloat(s.quantity_qntl || 0); dailyData[d].amount += parseFloat(s.amount || 0); const party = s.party_name || ''; if (party && !dailyData[d].parties.includes(party)) dailyData[d].parties.push(party); }
    for (const sv of saleVouchers) { const d = sv.date || ''; if (!d) continue; if (!dailyData[d]) dailyData[d] = { sold_qntl: 0, parties: [], amount: 0 }; const totalQty = (sv.items || []).reduce((sum, it) => sum + parseFloat(it.quantity || 0), 0); dailyData[d].sold_qntl += totalQty / 100; dailyData[d].amount += parseFloat(sv.total || 0); const party = sv.party_name || ''; if (party && !dailyData[d].parties.includes(party)) dailyData[d].parties.push(party); }

    const rows = [];
    let totalSold = 0;
    for (const d of Object.keys(dailyData).sort()) {
      const sold = Math.round(dailyData[d].sold_qntl * 100) / 100;
      totalSold += sold;
      rows.push({ date: d, sold_qntl: sold, parties: dailyData[d].parties.join(', ') || '-', amount: Math.round(dailyData[d].amount * 100) / 100 });
    }

    res.json({ rows, summary: { total_sold: Math.round(totalSold * 100) / 100 } });
  }));

  router.get('/api/govt-registers/form-f/excel', safeAsync(async (req, res) => {
    const { kms_year, season } = req.query;
    let sales = [...(database.data.private_rice_sales || [])];
    if (kms_year) sales = sales.filter(e => e.kms_year === kms_year);
    if (season) sales = sales.filter(e => e.season === season);
    let saleVouchers = [...(database.data.salebook || [])];
    if (kms_year) saleVouchers = saleVouchers.filter(e => e.kms_year === kms_year);
    if (season) saleVouchers = saleVouchers.filter(e => e.season === season);
    const dailyData = {};
    for (const s of sales) { const d = s.date || ''; if (!d) continue; if (!dailyData[d]) dailyData[d] = { qty: 0, parties: [], amt: 0 }; dailyData[d].qty += parseFloat(s.quantity_qntl || 0); dailyData[d].amt += parseFloat(s.amount || 0); const p = s.party_name || ''; if (p && !dailyData[d].parties.includes(p)) dailyData[d].parties.push(p); }
    for (const sv of saleVouchers) { const d = sv.date || ''; if (!d) continue; if (!dailyData[d]) dailyData[d] = { qty: 0, parties: [], amt: 0 }; dailyData[d].qty += (sv.items || []).reduce((sum, it) => sum + parseFloat(it.quantity || 0), 0) / 100; dailyData[d].amt += parseFloat(sv.total || 0); const p = sv.party_name || ''; if (p && !dailyData[d].parties.includes(p)) dailyData[d].parties.push(p); }
    const dataRows = [];
    let ts = 0;
    for (const d of Object.keys(dailyData).sort()) { const s = Math.round(dailyData[d].qty * 100) / 100; ts += s; dataRows.push([fmtDate(d), s, dailyData[d].parties.join(', ') || '-', Math.round(dailyData[d].amt * 100) / 100]); }
    dataRows.push(['TOTAL', Math.round(ts * 100) / 100, '', '']);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Form F');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:D1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:D2'); ws.getCell('A2').value = `Form F - Miller's Own Rice Sale | ${kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['Date', 'Rice Sold (Qtl)', 'Party Name', 'Amount (Rs)']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    dataRows.forEach(r => ws.addRow(r));
    [14, 20, 30, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Form_F_Miller_Rice_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ FRK BLENDING REGISTER ============
  router.get('/api/govt-registers/frk', safeSync(async (req, res) => {
    if (!database.data.frk_register) database.data.frk_register = [];
    let entries = [...database.data.frk_register];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    if (req.query.date_from) entries = entries.filter(e => (e.date || '') >= req.query.date_from);
    if (req.query.date_to) entries = entries.filter(e => (e.date || '') <= req.query.date_to);
    res.json(entries.sort((a, b) => (a.date || '').localeCompare(b.date || '')));
  }));

  router.post('/api/govt-registers/frk', safeSync(async (req, res) => {
    if (!database.data.frk_register) database.data.frk_register = [];
    const d = req.body;
    const ob = parseFloat(d.opening_balance || 0);
    const recv = parseFloat(d.received_qty || 0);
    const issued = parseFloat(d.issued_for_blending || 0);
    const doc = {
      id: uuidv4(), date: d.date || '', kms_year: d.kms_year || '', season: d.season || '',
      batch_no: d.batch_no || '', supplier: d.supplier || '',
      opening_balance: ob, received_qty: recv, total: Math.round((ob + recv) * 100) / 100,
      issued_for_blending: issued, closing_balance: Math.round((ob + recv - issued) * 100) / 100,
      rice_blended_qty: parseFloat(d.rice_blended_qty || 0), blend_ratio: d.blend_ratio || '1:100',
      remark: d.remark || '', created_by: req.query.username || '', created_at: new Date().toISOString()
    };
    database.data.frk_register.push(doc);
    database.save();
    res.json(doc);
  }));

  router.put('/api/govt-registers/frk/:id', safeSync(async (req, res) => {
    if (!database.data.frk_register) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.frk_register.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'FRK entry not found' });
    const d = req.body;
    const ob = parseFloat(d.opening_balance ?? database.data.frk_register[idx].opening_balance ?? 0);
    const recv = parseFloat(d.received_qty ?? database.data.frk_register[idx].received_qty ?? 0);
    const issued = parseFloat(d.issued_for_blending ?? database.data.frk_register[idx].issued_for_blending ?? 0);
    database.data.frk_register[idx] = { ...database.data.frk_register[idx], date: d.date || database.data.frk_register[idx].date, batch_no: d.batch_no || database.data.frk_register[idx].batch_no, supplier: d.supplier || database.data.frk_register[idx].supplier, opening_balance: ob, received_qty: recv, total: Math.round((ob + recv) * 100) / 100, issued_for_blending: issued, closing_balance: Math.round((ob + recv - issued) * 100) / 100, rice_blended_qty: parseFloat(d.rice_blended_qty ?? database.data.frk_register[idx].rice_blended_qty ?? 0), blend_ratio: d.blend_ratio || database.data.frk_register[idx].blend_ratio, remark: d.remark ?? database.data.frk_register[idx].remark, updated_at: new Date().toISOString() };
    database.save();
    res.json({ success: true });
  }));

  router.delete('/api/govt-registers/frk/:id', safeSync(async (req, res) => {
    if (!database.data.frk_register) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.frk_register.length;
    database.data.frk_register = database.data.frk_register.filter(e => e.id !== req.params.id);
    if (database.data.frk_register.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'FRK entry not found' });
  }));

  router.get('/api/govt-registers/frk/excel', safeAsync(async (req, res) => {
    if (!database.data.frk_register) database.data.frk_register = [];
    let entries = [...database.data.frk_register];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('FRK Register');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:K1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:K2'); ws.getCell('A2').value = `FRK Blending Register | ${req.query.kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['Date', 'Batch No', 'Supplier', 'Opening Bal (Kg)', 'Received (Kg)', 'Total (Kg)', 'Issued for Blending (Kg)', 'Closing Bal (Kg)', 'Rice Blended (Qtl)', 'Ratio', 'Remarks']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    entries.forEach(e => ws.addRow([fmtDate(e.date), e.batch_no || '', e.supplier || '', e.opening_balance || 0, e.received_qty || 0, e.total || 0, e.issued_for_blending || 0, e.closing_balance || 0, e.rice_blended_qty || 0, e.blend_ratio || '', e.remark || '']));
    [14, 16, 22, 18, 15, 15, 22, 18, 18, 10, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=FRK_Register_${req.query.kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ GUNNY BAG REGISTER (Government Format) ============
  router.get('/api/govt-registers/gunny-bags', safeSync(async (req, res) => {
    if (!database.data.govt_gunny_bag_register) database.data.govt_gunny_bag_register = [];
    let entries = [...database.data.govt_gunny_bag_register];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    if (req.query.date_from) entries = entries.filter(e => (e.date || '') >= req.query.date_from);
    if (req.query.date_to) entries = entries.filter(e => (e.date || '') <= req.query.date_to);
    res.json(entries.sort((a, b) => (a.date || '').localeCompare(b.date || '')));
  }));

  router.post('/api/govt-registers/gunny-bags', safeSync(async (req, res) => {
    if (!database.data.govt_gunny_bag_register) database.data.govt_gunny_bag_register = [];
    const d = req.body;
    const ob = parseInt(d.opening_balance || 0);
    const recv = parseInt(d.received || 0);
    const ur = parseInt(d.used_for_rice || 0);
    const up = parseInt(d.used_for_paddy || 0);
    const dmg = parseInt(d.damaged || 0);
    const ret = parseInt(d.returned || 0);
    const doc = {
      id: uuidv4(), date: d.date || '', kms_year: d.kms_year || '', season: d.season || '',
      bag_type: d.bag_type || 'new', source: d.source || '',
      opening_balance: ob, received: recv,
      used_for_rice: ur, used_for_paddy: up, damaged: dmg, returned: ret,
      closing_balance: (ob + recv) - (ur + up + dmg + ret),
      remark: d.remark || '', created_by: req.query.username || '', created_at: new Date().toISOString()
    };
    database.data.govt_gunny_bag_register.push(doc);
    database.save();
    res.json(doc);
  }));

  router.put('/api/govt-registers/gunny-bags/:id', safeSync(async (req, res) => {
    if (!database.data.govt_gunny_bag_register) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.govt_gunny_bag_register.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Gunny bag entry not found' });
    const d = req.body;
    const existing = database.data.govt_gunny_bag_register[idx];
    const ob = parseInt(d.opening_balance ?? existing.opening_balance ?? 0);
    const recv = parseInt(d.received ?? existing.received ?? 0);
    const ur = parseInt(d.used_for_rice ?? existing.used_for_rice ?? 0);
    const up = parseInt(d.used_for_paddy ?? existing.used_for_paddy ?? 0);
    const dmg = parseInt(d.damaged ?? existing.damaged ?? 0);
    const ret = parseInt(d.returned ?? existing.returned ?? 0);
    database.data.govt_gunny_bag_register[idx] = { ...existing, date: d.date || existing.date, bag_type: d.bag_type || existing.bag_type, source: d.source ?? existing.source, opening_balance: ob, received: recv, used_for_rice: ur, used_for_paddy: up, damaged: dmg, returned: ret, closing_balance: (ob + recv) - (ur + up + dmg + ret), remark: d.remark ?? existing.remark, updated_at: new Date().toISOString() };
    database.save();
    res.json({ success: true });
  }));

  router.delete('/api/govt-registers/gunny-bags/:id', safeSync(async (req, res) => {
    if (!database.data.govt_gunny_bag_register) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.govt_gunny_bag_register.length;
    database.data.govt_gunny_bag_register = database.data.govt_gunny_bag_register.filter(e => e.id !== req.params.id);
    if (database.data.govt_gunny_bag_register.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'Gunny bag entry not found' });
  }));

  router.get('/api/govt-registers/gunny-bags/excel', safeAsync(async (req, res) => {
    if (!database.data.govt_gunny_bag_register) database.data.govt_gunny_bag_register = [];
    let entries = [...database.data.govt_gunny_bag_register];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Gunny Bag Register');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:K1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:K2'); ws.getCell('A2').value = `Gunny Bag Stock Register | ${req.query.kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['Date', 'Bag Type', 'Source', 'Opening Bal', 'Received', 'Used (Rice)', 'Used (Paddy)', 'Damaged', 'Returned', 'Closing Bal', 'Remarks']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    entries.forEach(e => ws.addRow([fmtDate(e.date), e.bag_type || '', e.source || '', e.opening_balance || 0, e.received || 0, e.used_for_rice || 0, e.used_for_paddy || 0, e.damaged || 0, e.returned || 0, e.closing_balance || 0, e.remark || '']));
    [14, 14, 18, 14, 12, 14, 14, 12, 12, 14, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Gunny_Bag_Register_${req.query.kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ TRANSIT PASS REGISTER (Auto from entries) ============
  router.get('/api/govt-registers/transit-pass', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    let entries = [...(database.data.entries || [])];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);
    entries = entries.filter(e => e.tp_no && String(e.tp_no).trim());
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const rows = [];
    let totalQty = 0, totalBags = 0;
    for (const e of entries) {
      let finalW = parseFloat(e.final_w || 0) / 100; // KG to QNTL
      if (finalW === 0) finalW = parseFloat(e.kg || 0) / 100;
      const bags = parseInt(e.bag || 0);
      totalQty += finalW; totalBags += bags;
      rows.push({ date: e.date || '', tp_no: String(e.tp_no), rst_no: String(e.rst_no || ''), truck_no: e.truck_no || '', agent_name: e.agent_name || '', mandi_name: e.mandi_name || '', qty_qntl: Math.round(finalW * 100) / 100, tp_weight: Math.round(parseFloat(e.tp_weight || 0) / 100 * 100) / 100, bags, status: 'Accepted', remark: e.remark || '' });
    }
    res.json({ rows, summary: { total_entries: rows.length, total_qty: Math.round(totalQty * 100) / 100, total_bags: totalBags } });
  }));

  router.get('/api/govt-registers/transit-pass/excel', safeAsync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    let entries = [...(database.data.entries || [])];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);
    entries = entries.filter(e => e.tp_no && String(e.tp_no).trim()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Transit Pass');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:K1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:K2'); ws.getCell('A2').value = `Transit Pass Register | ${kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['Date', 'TP No.', 'RST No.', 'Vehicle No.', 'Agent/Society', 'Mandi/PPC', 'Qty (Qtl)', 'TP Weight', 'Bags', 'Status', 'Remarks']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    let tq = 0, tb = 0;
    entries.forEach(e => { let fw = parseFloat(e.final_w || 0) / 100; if (fw === 0) fw = parseFloat(e.kg || 0) / 100; const bags = parseInt(e.bag || 0); tq += fw; tb += bags; ws.addRow([fmtDate(e.date), String(e.tp_no), String(e.rst_no || ''), e.truck_no || '', e.agent_name || '', e.mandi_name || '', Math.round(fw * 100) / 100, Math.round(parseFloat(e.tp_weight || 0) / 100 * 100) / 100, bags, 'Accepted', e.remark || '']); });
    ws.addRow(['TOTAL', `${entries.length} entries`, '', '', '', '', Math.round(tq * 100) / 100, '', tb, '', '']);
    [14, 14, 12, 16, 22, 20, 14, 14, 10, 12, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Transit_Pass_Register_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ CMR DELIVERY TRACKER ============
  router.get('/api/govt-registers/cmr-delivery', safeSync(async (req, res) => {
    if (!database.data.cmr_deliveries) database.data.cmr_deliveries = [];
    const { kms_year, season, date_from, date_to } = req.query;
    let entries = [...database.data.cmr_deliveries];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let paddyEntries = [...(database.data.entries || [])];
    if (kms_year) paddyEntries = paddyEntries.filter(e => e.kms_year === kms_year);
    if (season) paddyEntries = paddyEntries.filter(e => e.season === season);
    const totalPaddy = paddyEntries.reduce((s, e) => s + parseFloat(e.final_w || 0), 0) / 100; // KG to QNTL
    const totalCmr = entries.reduce((s, e) => s + parseFloat(e.cmr_qty || 0), 0);
    const otr = totalPaddy > 0 ? Math.round(totalCmr / totalPaddy * 10000) / 100 : 0;

    res.json({ entries, summary: { total_cmr_delivered: Math.round(totalCmr * 100) / 100, total_paddy_received: Math.round(totalPaddy * 100) / 100, outturn_ratio: otr, total_deliveries: entries.length, total_bags: entries.reduce((s, e) => s + parseInt(e.bags || 0), 0) } });
  }));

  router.post('/api/govt-registers/cmr-delivery', safeSync(async (req, res) => {
    if (!database.data.cmr_deliveries) database.data.cmr_deliveries = [];
    const d = req.body;
    const doc = { id: uuidv4(), date: d.date || '', kms_year: d.kms_year || '', season: d.season || '', delivery_no: d.delivery_no || '', rrc_depot: d.rrc_depot || '', rice_type: d.rice_type || 'Parboiled', cmr_qty: parseFloat(d.cmr_qty || 0), bags: parseInt(d.bags || 0), vehicle_no: d.vehicle_no || '', driver_name: d.driver_name || '', fortified: d.fortified !== false, gate_pass_no: d.gate_pass_no || '', quality_grade: d.quality_grade || 'FAQ', remark: d.remark || '', created_by: req.query.username || '', created_at: new Date().toISOString() };
    database.data.cmr_deliveries.push(doc);
    database.save(); res.json(doc);
  }));

  router.put('/api/govt-registers/cmr-delivery/:id', safeSync(async (req, res) => {
    if (!database.data.cmr_deliveries) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.cmr_deliveries.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'CMR delivery not found' });
    const d = req.body; const ex = database.data.cmr_deliveries[idx];
    database.data.cmr_deliveries[idx] = { ...ex, date: d.date || ex.date, delivery_no: d.delivery_no ?? ex.delivery_no, rrc_depot: d.rrc_depot ?? ex.rrc_depot, rice_type: d.rice_type || ex.rice_type, cmr_qty: parseFloat(d.cmr_qty ?? ex.cmr_qty), bags: parseInt(d.bags ?? ex.bags), vehicle_no: d.vehicle_no ?? ex.vehicle_no, driver_name: d.driver_name ?? ex.driver_name, fortified: d.fortified ?? ex.fortified, gate_pass_no: d.gate_pass_no ?? ex.gate_pass_no, quality_grade: d.quality_grade ?? ex.quality_grade, remark: d.remark ?? ex.remark, updated_at: new Date().toISOString() };
    database.save(); res.json({ success: true });
  }));

  router.delete('/api/govt-registers/cmr-delivery/:id', safeSync(async (req, res) => {
    if (!database.data.cmr_deliveries) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.cmr_deliveries.length;
    database.data.cmr_deliveries = database.data.cmr_deliveries.filter(e => e.id !== req.params.id);
    if (database.data.cmr_deliveries.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'CMR delivery not found' });
  }));

  router.get('/api/govt-registers/cmr-delivery/excel', safeAsync(async (req, res) => {
    if (!database.data.cmr_deliveries) database.data.cmr_deliveries = [];
    const { kms_year, season } = req.query;
    let entries = [...database.data.cmr_deliveries];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('CMR Delivery');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:J1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:J2'); ws.getCell('A2').value = `CMR Delivery Register | ${kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['Date', 'Delivery No.', 'RRC/Depot', 'Rice Type', 'CMR Qty (Qtl)', 'Bags', 'Vehicle No.', 'Fortified', 'Grade', 'Remarks']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    entries.forEach(e => ws.addRow([fmtDate(e.date), e.delivery_no || '', e.rrc_depot || '', e.rice_type || '', e.cmr_qty || 0, e.bags || 0, e.vehicle_no || '', e.fortified ? 'Yes (+F)' : 'No', e.quality_grade || '', e.remark || '']));
    [14, 16, 22, 16, 18, 10, 16, 12, 10, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=CMR_Delivery_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // ============ SECURITY DEPOSIT MANAGEMENT ============
  router.get('/api/govt-registers/security-deposit', safeSync(async (req, res) => {
    if (!database.data.security_deposits) database.data.security_deposits = [];
    const { kms_year } = req.query;
    let entries = [...database.data.security_deposits];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    entries.sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || ''));
    const today = new Date().toISOString().split('T')[0];
    entries.forEach(e => { if (e.status === 'active' && e.expiry_date && e.expiry_date < today) e.status = 'expired'; });
    const totalAmount = entries.filter(e => e.status === 'active').reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    res.json({ entries, summary: { total_deposits: entries.length, active_count: entries.filter(e => e.status === 'active').length, total_active_amount: Math.round(totalAmount * 100) / 100, released_count: entries.filter(e => e.status === 'released').length, expired_count: entries.filter(e => e.status === 'expired').length } });
  }));

  router.post('/api/govt-registers/security-deposit', safeSync(async (req, res) => {
    if (!database.data.security_deposits) database.data.security_deposits = [];
    const d = req.body;
    const doc = { id: uuidv4(), kms_year: d.kms_year || '', bg_number: d.bg_number || '', bank_name: d.bank_name || '', amount: parseFloat(d.amount || 0), sd_ratio: d.sd_ratio || '1:6', milling_capacity_mt: parseFloat(d.milling_capacity_mt || 0), issue_date: d.issue_date || '', expiry_date: d.expiry_date || '', status: d.status || 'active', miller_type: d.miller_type || 'regular', remark: d.remark || '', created_by: req.query.username || '', created_at: new Date().toISOString() };
    database.data.security_deposits.push(doc);
    database.save(); res.json(doc);
  }));

  router.put('/api/govt-registers/security-deposit/:id', safeSync(async (req, res) => {
    if (!database.data.security_deposits) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.security_deposits.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Security deposit not found' });
    const d = req.body; const ex = database.data.security_deposits[idx];
    database.data.security_deposits[idx] = { ...ex, bg_number: d.bg_number ?? ex.bg_number, bank_name: d.bank_name ?? ex.bank_name, amount: parseFloat(d.amount ?? ex.amount), sd_ratio: d.sd_ratio ?? ex.sd_ratio, milling_capacity_mt: parseFloat(d.milling_capacity_mt ?? ex.milling_capacity_mt), issue_date: d.issue_date ?? ex.issue_date, expiry_date: d.expiry_date ?? ex.expiry_date, status: d.status ?? ex.status, miller_type: d.miller_type ?? ex.miller_type, remark: d.remark ?? ex.remark, updated_at: new Date().toISOString() };
    database.save(); res.json({ success: true });
  }));

  router.delete('/api/govt-registers/security-deposit/:id', safeSync(async (req, res) => {
    if (!database.data.security_deposits) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.security_deposits.length;
    database.data.security_deposits = database.data.security_deposits.filter(e => e.id !== req.params.id);
    if (database.data.security_deposits.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'Security deposit not found' });
  }));

  router.get('/api/govt-registers/security-deposit/excel', safeAsync(async (req, res) => {
    if (!database.data.security_deposits) database.data.security_deposits = [];
    const { kms_year } = req.query;
    let entries = [...database.data.security_deposits];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Security Deposit');
    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    ws.mergeCells('A1:J1'); ws.getCell('A1').value = branding.company_name; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:J2'); ws.getCell('A2').value = `Security Deposit Register | ${kms_year || 'All'}`; ws.getCell('A2').font = { bold: true, size: 12 }; ws.getCell('A2').alignment = { horizontal: 'center' };
    const hdr = ws.addRow(['BG Number', 'Bank Name', 'Amount (Rs)', 'SD Ratio', 'Capacity (MT)', 'Issue Date', 'Expiry Date', 'Status', 'Miller Type', 'Remarks']);
    hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } }; });
    entries.forEach(e => ws.addRow([e.bg_number || '', e.bank_name || '', e.amount || 0, e.sd_ratio || '', e.milling_capacity_mt || 0, fmtDate(e.issue_date), fmtDate(e.expiry_date), (e.status || '').toUpperCase(), e.miller_type || '', e.remark || '']));
    [18, 24, 18, 12, 16, 14, 14, 14, 16, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Security_Deposit_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  return router;
};
