const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { fmtDate, addPdfHeader, addPdfTable, addTotalsRow, safePdfPipe } = require('./pdf_helpers');

module.exports = function(database) {

  // ============ FORM A: Paddy Received from OSCSC ============
  router.get('/api/govt-registers/form-a', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to, group_by } = req.query;
    const groupBy = group_by || 'daily';
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

    // Weekly grouping
    let finalRows = rows;
    if (groupBy === 'weekly' && rows.length > 0) {
      const weeklyRows = [];
      let wd = null;
      for (const r of rows) {
        let wk;
        try { const dt = new Date(r.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); const ws = new Date(dt.setDate(diff)); wk = ws.toISOString().split('T')[0]; } catch { wk = r.date; }
        if (!wd || wd._wk !== wk) {
          if (wd) weeklyRows.push(wd);
          const ws = new Date(wk); const we = new Date(ws); we.setDate(we.getDate() + 6);
          const fD = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
          wd = { _wk: wk, date: `${fD(ws)} to ${fD(we)}`, opening_balance: r.opening_balance, received_qntl: 0, bags: 0, entries_count: 0, total_paddy: 0, milled_qntl: 0, closing_balance: 0 };
        }
        wd.received_qntl = Math.round((wd.received_qntl + r.received_qntl) * 100) / 100;
        wd.bags += r.bags;
        wd.entries_count += r.entries_count;
        wd.milled_qntl = Math.round((wd.milled_qntl + r.milled_qntl) * 100) / 100;
        wd.total_paddy = Math.round((wd.opening_balance + wd.received_qntl) * 100) / 100;
        wd.closing_balance = Math.round((wd.total_paddy - wd.milled_qntl) * 100) / 100;
      }
      if (wd) weeklyRows.push(wd);
      weeklyRows.forEach(wr => delete wr._wk);
      finalRows = weeklyRows;
    }

    res.json({
      rows: finalRows,
      summary: { total_received: Math.round(totalReceived * 100) / 100, total_milled: Math.round(totalMilled * 100) / 100, final_balance: Math.round(openingBalance * 100) / 100, total_days: finalRows.length }
    });
  }));

  router.get('/api/govt-registers/form-a/excel', safeAsync(async (req, res) => {
    const { kms_year, season, date_from, date_to, group_by } = req.query;
    const groupBy = group_by || 'daily';

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
    const dailyRows = [];
    let ob = 0, tr = 0, tm = 0;
    for (const d of allDates) {
      const recv = Math.round((dailyReceived[d]?.received_qntl || 0) * 100) / 100;
      const bags = dailyReceived[d]?.bags || 0;
      const mil = Math.round((dailyMilled[d] || 0) * 100) / 100;
      const tot = Math.round((ob + recv) * 100) / 100;
      const cb = Math.round((tot - mil) * 100) / 100;
      tr += recv; tm += mil;
      dailyRows.push({ date: d, ob: Math.round(ob * 100) / 100, recv, bags, tot, mil, cb });
      ob = cb;
    }

    let excelRows;
    if (groupBy === 'weekly' && dailyRows.length > 0) {
      const weeklyRows = [];
      let wd = null;
      for (const r of dailyRows) {
        let wk;
        try { const dt = new Date(r.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); const ws = new Date(dt.setDate(diff)); wk = ws.toISOString().split('T')[0]; } catch { wk = r.date; }
        if (!wd || wd._wk !== wk) {
          if (wd) weeklyRows.push(wd);
          const ws = new Date(wk); const we = new Date(ws); we.setDate(we.getDate() + 6);
          const fD = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
          wd = { _wk: wk, date: `${fD(ws)} to ${fD(we)}`, ob: r.ob, recv: 0, bags: 0, tot: 0, mil: 0, cb: 0 };
        }
        wd.recv = Math.round((wd.recv + r.recv) * 100) / 100;
        wd.bags += r.bags;
        wd.mil = Math.round((wd.mil + r.mil) * 100) / 100;
        wd.tot = Math.round((wd.ob + wd.recv) * 100) / 100;
        wd.cb = Math.round((wd.tot - wd.mil) * 100) / 100;
      }
      if (wd) weeklyRows.push(wd);
      excelRows = weeklyRows.map(r => [r.date, r.ob, r.recv, r.bags, r.tot, r.mil, r.cb]);
    } else {
      excelRows = dailyRows.map(r => [fmtDate(r.date), r.ob, r.recv, r.bags, r.tot, r.mil, r.cb]);
    }
    excelRows.push(['TOTAL', '', Math.round(tr * 100) / 100, '', '', Math.round(tm * 100) / 100, Math.round(ob * 100) / 100]);

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
    excelRows.forEach(r => ws.addRow(r));
    [groupBy === 'weekly' ? 28 : 14, 18, 20, 10, 18, 20, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Form_A_Paddy_Register_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // Form A PDF Export
  router.get('/api/govt-registers/form-a/pdf', safeAsync(async (req, res) => {
    const { kms_year, season, date_from, date_to, group_by } = req.query;
    const groupBy = group_by || 'daily';

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
      const d = e.date || ''; if (!d) continue;
      if (!dailyReceived[d]) dailyReceived[d] = { received_qntl: 0, bags: 0 };
      let fw = parseFloat(e.final_w || 0) / 100; if (fw === 0) fw = parseFloat(e.kg || 0) / 100;
      dailyReceived[d].received_qntl += fw; dailyReceived[d].bags += parseInt(e.bag || 0);
    }
    const dailyMilled = {};
    for (const m of millingEntries) {
      const d = m.date || ''; if (!d) continue;
      if (!dailyMilled[d]) dailyMilled[d] = 0; dailyMilled[d] += parseFloat(m.paddy_input_qntl || 0);
    }

    const allDates = [...new Set([...Object.keys(dailyReceived), ...Object.keys(dailyMilled)])].sort();
    const dailyRows = [];
    let ob = 0, tr = 0, tm = 0;
    for (const d of allDates) {
      const recv = Math.round((dailyReceived[d]?.received_qntl || 0) * 100) / 100;
      const bags = dailyReceived[d]?.bags || 0;
      const mil = Math.round((dailyMilled[d] || 0) * 100) / 100;
      const tot = Math.round((ob + recv) * 100) / 100;
      const cb = Math.round((tot - mil) * 100) / 100;
      tr += recv; tm += mil;
      dailyRows.push({ date: d, ob: Math.round(ob * 100) / 100, recv, bags, tot, mil, cb });
      ob = cb;
    }

    // Weekly grouping
    let pdfRows;
    if (groupBy === 'weekly' && dailyRows.length > 0) {
      const weeklyRows = [];
      let wd = null;
      for (const r of dailyRows) {
        let wk;
        try { const dt = new Date(r.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); const ws = new Date(dt.setDate(diff)); wk = ws.toISOString().split('T')[0]; } catch (e) { wk = r.date; }
        if (!wd || wd._wk !== wk) {
          if (wd) weeklyRows.push(wd);
          const ws = new Date(wk); const we = new Date(ws); we.setDate(we.getDate() + 6);
          const fD = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
          wd = { _wk: wk, date: `${fD(ws)} to ${fD(we)}`, ob: r.ob, recv: 0, bags: 0, tot: 0, mil: 0, cb: 0 };
        }
        wd.recv = Math.round((wd.recv + r.recv) * 100) / 100;
        wd.bags += r.bags;
        wd.mil = Math.round((wd.mil + r.mil) * 100) / 100;
        wd.tot = Math.round((wd.ob + wd.recv) * 100) / 100;
        wd.cb = Math.round((wd.tot - wd.mil) * 100) / 100;
      }
      if (wd) weeklyRows.push(wd);
      pdfRows = weeklyRows.map(r => [r.date, r.ob.toFixed(2), r.recv.toFixed(2), String(r.bags), r.tot.toFixed(2), r.mil.toFixed(2), r.cb.toFixed(2)]);
    } else {
      pdfRows = dailyRows.map(r => [fmtDate(r.date), r.ob.toFixed(2), r.recv.toFixed(2), String(r.bags), r.tot.toFixed(2), r.mil.toFixed(2), r.cb.toFixed(2)]);
    }

    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Form_A_Paddy_Register_${kms_year || 'all'}.pdf`);
    doc.pipe(res);

    addPdfHeader(doc, `Form A - Paddy Received from State Procuring Agency | ${kms_year || 'All'}${season ? ' | ' + season : ''}`, branding);

    const headers = ['Date / Period', 'Opening Bal (Q)', 'Paddy Recd (Q)', 'Bags', 'Total Paddy (Q)', 'Paddy Milled (Q)', 'Closing Bal (Q)'];
    const colW = [groupBy === 'weekly' ? 110 : 60, 75, 80, 45, 80, 80, 75];
    addPdfTable(doc, headers, pdfRows, colW, { fontSize: 8 });
    addTotalsRow(doc, ['TOTAL', '', (Math.round(tr * 100) / 100).toFixed(2), '', '', (Math.round(tm * 100) / 100).toFixed(2), (Math.round(ob * 100) / 100).toFixed(2)], colW);

    doc.end();
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
    const { kms_year, season, date_from, date_to, mandi_name, agent_name } = req.query;
    let entries = [...(database.data.entries || [])];
    const totalBefore = entries.length;
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);
    if (mandi_name) entries = entries.filter(e => (e.mandi_name || '').toLowerCase() === mandi_name.toLowerCase());
    if (agent_name) entries = entries.filter(e => (e.agent_name || '').toLowerCase() === agent_name.toLowerCase());
    const beforeTpFilter = entries.length;
    // Check tp_no field - log for debugging
    const tpEntries = entries.filter(e => {
      const tp = e.tp_no;
      return tp !== undefined && tp !== null && tp !== '' && tp !== 0 && String(tp).trim() !== '';
    });
    console.log(`[Transit-Pass] Total: ${totalBefore}, After KMS/Season: ${beforeTpFilter}, With TP: ${tpEntries.length}, KMS: ${kms_year}, Season: ${season}`);
    if (beforeTpFilter > 0 && tpEntries.length === 0) {
      // Debug: show first 3 entries' tp_no values
      entries.slice(0, 3).forEach((e, i) => {
        console.log(`[Transit-Pass DEBUG] Entry ${i}: tp_no="${e.tp_no}" (type: ${typeof e.tp_no}), rst_no=${e.rst_no}`);
      });
    }
    entries = tpEntries;
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const rows = [];
    let totalQty = 0, totalBags = 0, totalTpWeight = 0;
    const mandis = new Set(), agents = new Set();
    for (const e of entries) {
      let finalW = parseFloat(e.final_w || 0) / 100; // KG to QNTL
      if (finalW === 0) finalW = parseFloat(e.kg || 0) / 100;
      const bags = parseInt(e.bag || 0);
      const tpWt = Math.round(parseFloat(e.tp_weight || 0) * 100) / 100;
      totalQty += finalW; totalBags += bags; totalTpWeight += tpWt;
      const mName = e.mandi_name || '';
      const aName = e.agent_name || '';
      if (mName) mandis.add(mName);
      if (aName) agents.add(aName);
      rows.push({ date: e.date || '', tp_no: String(e.tp_no), rst_no: String(e.rst_no || ''), truck_no: e.truck_no || '', agent_name: aName, mandi_name: mName, qty_qntl: Math.round(finalW * 100) / 100, tp_weight: tpWt, bags, status: 'Accepted', remark: e.remark || '' });
    }

    // For filter_options, get ALL TP entries (unfiltered by mandi/agent) to populate dropdowns
    let allTpEntries = [...(database.data.entries || [])];
    if (kms_year) allTpEntries = allTpEntries.filter(e => e.kms_year === kms_year);
    if (season) allTpEntries = allTpEntries.filter(e => e.season === season);
    allTpEntries = allTpEntries.filter(e => e.tp_no && String(e.tp_no).trim());
    const allMandis = new Set(), allAgents = new Set();
    for (const e of allTpEntries) {
      if (e.mandi_name) allMandis.add(e.mandi_name);
      if (e.agent_name) allAgents.add(e.agent_name);
    }

    res.json({ rows, summary: { total_entries: rows.length, total_qty: Math.round(totalQty * 100) / 100, total_tp_weight: Math.round(totalTpWeight * 100) / 100, total_bags: totalBags }, filter_options: { mandis: [...allMandis].sort(), agents: [...allAgents].sort() } });
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
    entries.forEach(e => { let fw = parseFloat(e.final_w || 0) / 100; if (fw === 0) fw = parseFloat(e.kg || 0) / 100; const bags = parseInt(e.bag || 0); tq += fw; tb += bags; ws.addRow([fmtDate(e.date), String(e.tp_no), String(e.rst_no || ''), e.truck_no || '', e.agent_name || '', e.mandi_name || '', Math.round(fw * 100) / 100, Math.round(parseFloat(e.tp_weight || 0) * 100) / 100, bags, 'Accepted', e.remark || '']); });
    ws.addRow(['TOTAL', `${entries.length} entries`, '', '', '', '', Math.round(tq * 100) / 100, '', tb, '', '']);
    [14, 14, 12, 16, 22, 20, 14, 14, 10, 12, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Transit_Pass_Register_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // Transit Pass PDF
  router.get('/api/govt-registers/transit-pass/pdf', safeAsync(async (req, res) => {
    const { kms_year, season, date_from, date_to, mandi_name, agent_name } = req.query;
    let entries = [...(database.data.entries || [])];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);
    if (mandi_name) entries = entries.filter(e => (e.mandi_name || '').toLowerCase() === mandi_name.toLowerCase());
    if (agent_name) entries = entries.filter(e => (e.agent_name || '').toLowerCase() === agent_name.toLowerCase());
    entries = entries.filter(e => e.tp_no && String(e.tp_no).trim()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const branding = database.getBranding ? database.getBranding() : { company_name: 'NAVKAR AGRO' };
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Transit_Pass_Register_${kms_year || 'all'}.pdf`);
    doc.pipe(res);

    addPdfHeader(doc, `Transit Pass Register | ${kms_year || 'All'}${season ? ' | ' + season : ''}`, branding);

    const headers = ['#', 'Date', 'TP No.', 'RST No.', 'Vehicle', 'Agent', 'Mandi', 'Qty (Q)', 'TP Wt', 'Bags'];
    const colW = [25, 55, 55, 55, 65, 80, 80, 55, 55, 40];
    const rows = [];
    let tq = 0, tw = 0, tb = 0;

    entries.forEach((e, i) => {
      let fw = parseFloat(e.final_w || 0) / 100;
      if (fw === 0) fw = parseFloat(e.kg || 0) / 100;
      const bags = parseInt(e.bag || 0);
      const tpWt = Math.round(parseFloat(e.tp_weight || 0) * 100) / 100;
      tq += fw; tw += tpWt; tb += bags;
      rows.push([String(i + 1), fmtDate(e.date), String(e.tp_no), String(e.rst_no || ''), e.truck_no || '', e.agent_name || '', e.mandi_name || '', (Math.round(fw * 100) / 100).toFixed(2), tpWt.toFixed(2), String(bags)]);
    });

    addPdfTable(doc, headers, rows, colW, { fontSize: 7.5 });
    addTotalsRow(doc, ['', `Total: ${entries.length}`, '', '', '', '', '', (Math.round(tq * 100) / 100).toFixed(2), (Math.round(tw * 100) / 100).toFixed(2), String(tb)], colW);

    doc.end();
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

  // ============ TP WEIGHT STOCK ============

  router.get('/api/govt-registers/tp-weight-stock', safeSync(async (req, res) => {
    const { kms_year, season } = req.query;
    const weights = (database.data.vehicle_weights || []).filter(e => {
      if (!e.tp_weight || Number(e.tp_weight) <= 0) return false;
      if (kms_year && e.kms_year !== kms_year) return false;
      if (season && e.season !== season) return false;
      return true;
    });
    const total = Math.round(weights.reduce((s, e) => s + (Number(e.tp_weight) || 0), 0) * 100) / 100;
    res.json({ total_tp_weight: total, count: weights.length });
  }));

  // ============ MILLING REGISTER ============

  function _fmtDateShort(d) {
    if (!d) return '';
    try { const p = String(d).split('T')[0].split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; } catch(e) { return String(d); }
  }

  function _buildMillingRegister(kms_year, season) {
    const query = {};
    if (kms_year) query.kms_year = kms_year;
    if (season) query.season = season;

    const matchFn = (item) => {
      if (kms_year && item.kms_year !== kms_year) return false;
      if (season && item.season !== season) return false;
      return true;
    };

    let ob_paddy = 0, ob_rice = 0;

    // 1. Paddy released daily
    const paddy_releases = (database.data.paddy_release || []).filter(matchFn);
    const daily_paddy_rcvd = {};
    paddy_releases.forEach(e => {
      const d = e.date || ''; if (!d) return;
      daily_paddy_rcvd[d] = (daily_paddy_rcvd[d] || 0) + (Number(e.qty_qtl) || 0);
    });

    // 2. Milling entries
    const milling = (database.data.milling_entries || []).filter(matchFn);
    const daily_milled = {}, daily_rice_produced = {};
    milling.forEach(m => {
      const d = m.date || ''; if (!d) return;
      daily_milled[d] = (daily_milled[d] || 0) + (Number(m.paddy_input_qntl) || 0);
      const rice = Number(m.cmr_delivery_qntl) || Number(m.rice_qntl) || 0;
      daily_rice_produced[d] = (daily_rice_produced[d] || 0) + rice;
    });

    // 3. DC deliveries
    const deliveries = (database.data.dc_deliveries || []).filter(matchFn);
    const daily_delivery_rrc = {}, daily_delivery_fci = {};
    deliveries.forEach(dlv => {
      const d = dlv.date || ''; if (!d) return;
      const qty = Number(dlv.quantity_qntl) || 0;
      const godown = (dlv.godown_name || '').toLowerCase();
      if (godown.includes('fci')) daily_delivery_fci[d] = (daily_delivery_fci[d] || 0) + qty;
      else daily_delivery_rrc[d] = (daily_delivery_rrc[d] || 0) + qty;
    });

    const allDates = [...new Set([...Object.keys(daily_paddy_rcvd), ...Object.keys(daily_milled), ...Object.keys(daily_rice_produced), ...Object.keys(daily_delivery_rrc), ...Object.keys(daily_delivery_fci)])].sort();

    const rows = [];
    let prog_paddy_rcvd = 0, prog_paddy_milled = 0, prog_rice_milled = 0, prog_rice_delivered = 0;
    let cb_paddy = ob_paddy, cb_rice = ob_rice;
    const initial_ob_paddy = ob_paddy, initial_ob_rice = ob_rice;

    const months = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];

    for (const date of allDates) {
      const rcvd = Math.round((daily_paddy_rcvd[date] || 0) * 100) / 100;
      const milled = Math.round((daily_milled[date] || 0) * 100) / 100;
      const rice_prod = Math.round((daily_rice_produced[date] || 0) * 100) / 100;
      const del_rrc = Math.round((daily_delivery_rrc[date] || 0) * 100) / 100;
      const del_fci = Math.round((daily_delivery_fci[date] || 0) * 100) / 100;

      ob_paddy = cb_paddy;
      const total_paddy = Math.round((ob_paddy + rcvd) * 100) / 100;
      cb_paddy = Math.round((total_paddy - milled) * 100) / 100;
      prog_paddy_rcvd = Math.round((prog_paddy_rcvd + rcvd) * 100) / 100;
      prog_paddy_milled = Math.round((prog_paddy_milled + milled) * 100) / 100;

      ob_rice = cb_rice;
      const total_rice = Math.round((ob_rice + rice_prod) * 100) / 100;
      const total_del = Math.round((del_rrc + del_fci) * 100) / 100;
      cb_rice = Math.round((total_rice - total_del) * 100) / 100;
      prog_rice_milled = Math.round((prog_rice_milled + rice_prod) * 100) / 100;
      prog_rice_delivered = Math.round((prog_rice_delivered + total_del) * 100) / 100;

      let month = '';
      try { const m = parseInt(date.split('-')[1]); month = months[m] || ''; } catch(e) {}

      rows.push({
        date, month,
        ob_paddy, rcvd_from_cm: rcvd, total_paddy,
        issue_for_milling: milled,
        prog_rcpt_paddy: prog_paddy_rcvd, prog_milling_paddy: prog_paddy_milled,
        cb_paddy,
        ob_rice, rice_from_milling: rice_prod, total_rice,
        delivery_rrc: del_rrc, delivery_fci: del_fci,
        prog_rice_milling: prog_rice_milled, prog_rice_delivered: prog_rice_delivered,
        cb_rice,
      });
    }

    return {
      rows,
      opening_stock: { paddy: initial_ob_paddy, rice: initial_ob_rice },
      summary: {
        total_paddy_received: prog_paddy_rcvd, total_paddy_milled: prog_paddy_milled, cb_paddy,
        total_rice_produced: prog_rice_milled, total_rice_delivered: prog_rice_delivered, cb_rice,
        ob_paddy: initial_ob_paddy, ob_rice: initial_ob_rice,
      }
    };
  }

  // GET /api/govt-registers/milling-register
  router.get('/api/govt-registers/milling-register', safeSync(async (req, res) => {
    const { kms_year, season } = req.query;
    res.json(_buildMillingRegister(kms_year, season));
  }));

  // GET /api/govt-registers/milling-register/excel
  router.get('/api/govt-registers/milling-register/excel', safeAsync(async (req, res) => {
    const { kms_year, season } = req.query;
    const regData = _buildMillingRegister(kms_year, season);
    const rows = regData.rows;
    const branding = database.data.branding || {};
    const company = branding.company_name || 'Rice Mill';
    const tagline = branding.tagline || '';
    const customFields = branding.custom_fields || [];

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Milling Register');
    ws.mergeCells('A1:Q1'); ws.getCell('A1').value = company.toUpperCase(); ws.getCell('A1').font = { bold: true, size: 14, color: { argb: '1F4E79' } }; ws.getCell('A1').alignment = { horizontal: 'center' };

    const infoParts = tagline ? [tagline] : [];
    customFields.forEach(f => infoParts.push(`${f.label || ''}: ${f.value || ''}`));
    if (infoParts.length) {
      ws.mergeCells('A2:Q2'); ws.getCell('A2').value = infoParts.join('  |  '); ws.getCell('A2').font = { size: 9, color: { argb: '666666' } }; ws.getCell('A2').alignment = { horizontal: 'center' };
    }

    let title = 'MILLING REGISTER';
    if (kms_year) title += ` - KMS ${kms_year}`;
    if (season) title += ` (${season})`;
    ws.mergeCells('A3:Q3'); ws.getCell('A3').value = title;
    ws.getCell('A3').font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
    ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    const headers = ['Date', 'Month', 'OB Paddy', 'Rcvd from CM A/c', 'Total Paddy', 'Issue For Milling', 'Prog Rcpt Paddy', 'Prog Mill Paddy', 'CB Paddy', 'OB Rice', 'Rice Rcpt Milling', 'Total Rice', 'Delivery RRC', 'Delivery FCI', 'Prog Rice Milling', 'Prog Rice Delivered', 'CB Rice'];
    const hdr = ws.addRow([]); // row 4 blank
    const headerRow = ws.addRow(headers);
    headerRow.eachCell(c => { c.font = { bold: true, size: 8, color: { argb: 'FFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E75B6' } }; c.alignment = { horizontal: 'center', wrapText: true }; c.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }; });

    const _v = (val) => (val === 0 || val === null || val === undefined || val === '') ? '-' : val;
    rows.forEach((r, idx) => {
      const row = ws.addRow([_fmtDateShort(r.date), r.month || '-', _v(r.ob_paddy), _v(r.rcvd_from_cm), _v(r.total_paddy), _v(r.issue_for_milling), _v(r.prog_rcpt_paddy), _v(r.prog_milling_paddy), _v(r.cb_paddy), _v(r.ob_rice), _v(r.rice_from_milling), _v(r.total_rice), _v(r.delivery_rrc), _v(r.delivery_fci), _v(r.prog_rice_milling), _v(r.prog_rice_delivered), _v(r.cb_rice)]);
      row.eachCell((c, ci) => {
        c.font = { size: 9 }; c.border = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        if (ci >= 3) c.alignment = { horizontal: 'right' };
        if (ci === 9 || ci === 17) c.font = { size: 9, bold: true };
        if (idx % 2 === 0) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D6E4F0' } };
      });
    });

    [11, 10, 10, 14, 10, 12, 14, 14, 10, 8, 14, 10, 12, 12, 12, 12, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.pageSetup = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=milling_register_${kms_year || 'all'}.xlsx`);
    await wb.xlsx.write(res); res.end();
  }));

  // GET /api/govt-registers/milling-register/pdf
  router.get('/api/govt-registers/milling-register/pdf', safeAsync(async (req, res) => {
    const { kms_year, season } = req.query;
    const regData = _buildMillingRegister(kms_year, season);
    const rows = regData.rows;
    const summary = regData.summary;
    const branding = { ...(database.data.branding || {}) };
    const wmSetting = (database.data.app_settings || []).find(s => s.setting_id === 'watermark');
    if (wmSetting) branding._watermark = wmSetting;
    const company = branding.company_name || 'Rice Mill';

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 10 });
    const { promise, stream } = safePdfPipe(doc, res, `milling_register_${kms_year || 'all'}.pdf`);

    const headerH = addPdfHeader(doc, branding, 10);
    let y = headerH + 14;

    // Title
    let title = 'MILLING REGISTER';
    if (kms_year) title += ` - KMS ${kms_year}`;
    if (season) title += ` (${season})`;
    doc.rect(10, y, doc.page.width - 20, 16).fill('#2E75B6');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff').text(title, 10, y + 3, { width: doc.page.width - 20, align: 'center' });
    y += 20;

    const headers = ['Date', 'Month', 'OB\nPaddy', 'Rcvd from\nCM A/c', 'Total\nPaddy', 'Issue For\nMilling', 'Prog Rcpt\nPaddy', 'Prog Mill\nPaddy', 'CB\nPaddy', 'OB\nRice', 'Rice Rcpt\nMilling', 'Total\nRice', 'Del\nRRC', 'Del\nFCI', 'Prog Rice\nMill', 'Prog Rice\nDel', 'CB\nRice'];
    let colW = [42, 28, 36, 48, 38, 42, 45, 45, 38, 32, 45, 38, 40, 40, 45, 45, 38];
    const usable = doc.page.width - 20;
    const totalW = colW.reduce((a, b) => a + b, 0);
    if (totalW > usable) { const scale = usable / totalW; colW = colW.map(w => Math.round(w * scale)); }

    const _pv = (val) => (val === 0 || val === null || val === undefined) ? '-' : val;
    const tableData = rows.map(r => [_fmtDateShort(r.date), r.month || '-', _pv(r.ob_paddy), _pv(r.rcvd_from_cm), _pv(r.total_paddy), _pv(r.issue_for_milling), _pv(r.prog_rcpt_paddy), _pv(r.prog_milling_paddy), _pv(r.cb_paddy), _pv(r.ob_rice), _pv(r.rice_from_milling), _pv(r.total_rice), _pv(r.delivery_rrc), _pv(r.delivery_fci), _pv(r.prog_rice_milling), _pv(r.prog_rice_delivered), _pv(r.cb_rice)]);

    doc.y = y;
    addPdfTable(doc, headers, tableData, colW, {
      headerBg: '#2E75B6', headerTextColor: '#fff', fontSize: 5.5, margin: 10,
    });

    // Summary
    doc.moveDown(0.5);
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#1F4E79')
      .text(`Summary: Paddy Received: ${summary.total_paddy_received} Q | Milled: ${summary.total_paddy_milled} Q | CB Paddy: ${summary.cb_paddy} Q || Rice Produced: ${summary.total_rice_produced} Q | Delivered: ${summary.total_rice_delivered} Q | CB Rice: ${summary.cb_rice} Q`, 10, doc.y, { width: usable });

    doc.end();
    await promise;
  }));

  return router;
};
