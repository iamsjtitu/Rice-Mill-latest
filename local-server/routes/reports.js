const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, addSectionTitle, fmtAmt, fmtDate, C } = require('./pdf_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title, subtitle) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding, subtitle);
  }

  // Helper to get full ledger data
  function getLedgerData(party_name, party_type, kms_year, season, date_from, date_to) {
    const dateFilter = (d) => (!date_from || d >= date_from) && (!date_to || d <= date_to);
    const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season) && dateFilter(e.date || ''));
    const ledger = [];

    if (!party_type || party_type === 'truck') {
      for (const e of entries) {
        const t = e.truck_no || '';
        if (!t) continue;
        if (party_name && t.toLowerCase() !== party_name.toLowerCase()) continue;
        const tp = Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100;
        if (tp > 0) ledger.push({ date: e.date || '', party_name: t, party_type: 'Truck', description: `Mandi: ${e.mandi_name||''} | Cash: ${e.cash_paid||0} Diesel: ${e.diesel_paid||0}`, debit: 0, credit: tp, ref: (e.id||'').substring(0,8) });
      }
    }

    if (!party_type || party_type === 'cash_party') {
      const cashTxns = (database.data.cash_transactions||[]).filter(t => (!kms_year||t.kms_year===kms_year) && (!season||t.season===season) && dateFilter(t.date || ''));
      for (const t of cashTxns) {
        const cat = (t.category||'').trim();
        if (!cat) continue;
        if (['cash payment','diesel payment','cash paid','diesel','cash paid (entry)','diesel (entry)'].includes(cat.toLowerCase())) continue;
        if (party_name && cat.toLowerCase() !== party_name.toLowerCase()) continue;
        const isJama = t.txn_type === 'jama';
        ledger.push({ date: t.date||'', party_name: cat, party_type: 'Cash Party', description: t.description || `${isJama?'Jama':'Nikasi'}: Rs.${t.amount||0}`, debit: isJama ? 0 : Math.round((t.amount||0)*100)/100, credit: isJama ? Math.round((t.amount||0)*100)/100 : 0, ref: (t.id||'').substring(0,8) });
      }
    }

    if (!party_type || party_type === 'frk_party') {
      (database.data.frk_purchases||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(p => {
        const n = p.party_name||''; if (!n) return;
        if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return;
        ledger.push({ date: p.date||'', party_name: n, party_type: 'FRK Seller', description: `FRK: ${p.quantity_qntl||0}Q @ Rs.${p.rate_per_qntl||0}/Q`, debit: Math.round((p.total_amount||0)*100)/100, credit: 0, ref: (p.id||'').substring(0,8) });
      });
    }

    if (!party_type || party_type === 'buyer') {
      (database.data.byproduct_sales||[]).filter(s => (!kms_year||s.kms_year===kms_year) && (!season||s.season===season)).forEach(s => {
        const b = s.buyer_name||''; if (!b) return;
        if (party_name && b.toLowerCase()!==party_name.toLowerCase()) return;
        ledger.push({ date: s.date||'', party_name: b, party_type: 'Buyer', description: `${(s.product||'')}`, debit: 0, credit: Math.round((s.total_amount||0)*100)/100, ref: (s.id||'').substring(0,8) });
      });
    }

    if (!party_type || party_type === 'pvt_paddy') {
      (database.data.private_paddy||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(p => {
        const n = p.party_name||''; if (!n) return;
        if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return;
        ledger.push({ date: p.date||'', party_name: n, party_type: 'Pvt Paddy', description: `Paddy: ${p.final_qntl||0}Q @ Rs.${p.rate_per_qntl||0}/Q`, debit: Math.round((p.total_amount||0)*100)/100, credit: 0, ref: (p.id||'').substring(0,8) });
      });
    }

    if (!party_type || party_type === 'rice_buyer') {
      (database.data.rice_sales||[]).filter(s => (!kms_year||s.kms_year===kms_year) && (!season||s.season===season)).forEach(s => {
        const n = s.party_name||''; if (!n) return;
        if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return;
        ledger.push({ date: s.date||'', party_name: n, party_type: 'Rice Buyer', description: `Rice: ${s.quantity_qntl||0}Q (${s.rice_type||''}) @ Rs.${s.rate_per_qntl||0}/Q`, debit: 0, credit: Math.round((s.total_amount||0)*100)/100, ref: (s.id||'').substring(0,8) });
      });
    }

    if (!party_type || ['pvt_paddy','rice_buyer','pvt_payment'].includes(party_type)) {
      (database.data.private_payments||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(pay => {
        const pn = pay.party_name||''; if (!pn) return;
        if (party_name && pn.toLowerCase()!==party_name.toLowerCase()) return;
        if (pay.ref_type==='paddy_purchase') {
          if (party_type && !['pvt_paddy','pvt_payment'].includes(party_type)) return;
          ledger.push({ date: pay.date||'', party_name: pn, party_type: 'Pvt Paddy', description: `Payment: Rs.${pay.amount||0} (${pay.mode||'cash'})`, debit: 0, credit: Math.round((pay.amount||0)*100)/100, ref: (pay.id||'').substring(0,8) });
        } else if (pay.ref_type==='rice_sale') {
          if (party_type && !['rice_buyer','pvt_payment'].includes(party_type)) return;
          ledger.push({ date: pay.date||'', party_name: pn, party_type: 'Rice Buyer', description: `Payment Received: Rs.${pay.amount||0} (${pay.mode||'cash'})`, debit: Math.round((pay.amount||0)*100)/100, credit: 0, ref: (pay.id||'').substring(0,8) });
        }
      });
    }

    ledger.sort((a, b) => (b.date||'').localeCompare(a.date||''));
    return ledger;
  }

  // ===== OUTSTANDING REPORT =====
  router.get('/api/reports/outstanding', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
    const dcOutstanding = [];
    for (const dc of dcEntries) {
      const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
      const pending = Math.round((dc.quantity_qntl - delivered) * 100) / 100;
      if (pending > 0) dcOutstanding.push({ dc_number: dc.dc_number || '', allotted: dc.quantity_qntl, delivered, pending, deadline: dc.deadline || '', rice_type: dc.rice_type || '' });
    }
    const dcPendingTotal = Math.round(dcOutstanding.reduce((s, d) => s + d.pending, 0) * 100) / 100;
    const mspPayments = (database.data.msp_payments || []).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season));
    const totalDeliveredQntl = Math.round(allDels.reduce((s, d) => s + (d.quantity_qntl || 0), 0) * 100) / 100;
    const totalMspPaidQty = Math.round(mspPayments.reduce((s, p) => s + (p.quantity_qntl || 0), 0) * 100) / 100;
    const totalMspPaidAmt = Math.round(mspPayments.reduce((s, p) => s + (p.amount || 0), 0) * 100) / 100;
    const mspPendingQty = Math.round((totalDeliveredQntl - totalMspPaidQty) * 100) / 100;
    const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    const truckMap = {};
    for (const e of entries) { const t = e.truck_no || 'Unknown'; if (!truckMap[t]) truckMap[t] = { truck_no: t, total_trips: 0, total_qty_qntl: 0, total_cash_paid: 0, total_diesel_paid: 0 }; truckMap[t].total_trips++; truckMap[t].total_qty_qntl = Math.round((truckMap[t].total_qty_qntl + (e.final_w || 0) / 100) * 100) / 100; truckMap[t].total_cash_paid = Math.round((truckMap[t].total_cash_paid + (e.cash_paid || 0)) * 100) / 100; truckMap[t].total_diesel_paid = Math.round((truckMap[t].total_diesel_paid + (e.diesel_paid || 0)) * 100) / 100; }
    const agentMap = {};
    for (const e of entries) { const a = e.agent_name || 'Unknown'; if (!agentMap[a]) agentMap[a] = { agent_name: a, total_entries: 0, total_qty_qntl: 0 }; agentMap[a].total_entries++; agentMap[a].total_qty_qntl = Math.round((agentMap[a].total_qty_qntl + (e.final_w || 0) / 100) * 100) / 100; }
    const frkPurchases = (database.data.frk_purchases || []).filter(p => (!kms_year || p.kms_year === kms_year) && (!season || p.season === season));
    const frkPartyMap = {};
    for (const p of frkPurchases) { const n = p.party_name || 'Unknown'; if (!frkPartyMap[n]) frkPartyMap[n] = { party_name: n, total_qty: 0, total_amount: 0 }; frkPartyMap[n].total_qty = Math.round((frkPartyMap[n].total_qty + (p.quantity_qntl || 0)) * 100) / 100; frkPartyMap[n].total_amount = Math.round((frkPartyMap[n].total_amount + (p.total_amount || 0)) * 100) / 100; }
    res.json({ dc_outstanding: { items: dcOutstanding, total_pending_qntl: dcPendingTotal, count: dcOutstanding.length }, msp_outstanding: { total_delivered_qntl: totalDeliveredQntl, total_paid_qty: totalMspPaidQty, total_paid_amount: totalMspPaidAmt, pending_qty: mspPendingQty }, trucks: Object.values(truckMap), agents: Object.values(agentMap), frk_parties: Object.values(frkPartyMap) });
  }));

  // ===== PARTY LEDGER =====
  router.get('/api/reports/party-ledger', safeSync((req, res) => {
    const { party_name, party_type, kms_year, season, date_from, date_to } = req.query;
    const ledger = getLedgerData(party_name, party_type, kms_year, season, date_from, date_to);
    const partySet = new Set(); for (const item of ledger) partySet.add(JSON.stringify({ name: item.party_name, type: item.party_type }));
    const partyList = [...partySet].map(s => JSON.parse(s)).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ ledger, party_list: partyList, total_debit: Math.round(ledger.reduce((s, l) => s + l.debit, 0) * 100) / 100, total_credit: Math.round(ledger.reduce((s, l) => s + l.credit, 0) * 100) / 100 });
  }));

  // ===== OUTSTANDING EXPORTS =====
  router.get('/api/reports/outstanding/excel', safeAsync(async (req, res) => {
    try {
      const { kms_year, season } = req.query;
      const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
      const dcOutstanding = [];
      for (const dc of dcEntries) { const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl||0), 0)*100)/100; const pending = Math.round((dc.quantity_qntl - delivered)*100)/100; if (pending > 0) dcOutstanding.push({ dc_number: dc.dc_number||'', allotted: dc.quantity_qntl, delivered, pending, deadline: dc.deadline||'', rice_type: dc.rice_type||'' }); }
      const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const truckMap = {}; const agentMap = {};
      for (const e of entries) { const t = e.truck_no || 'Unknown'; if (!truckMap[t]) truckMap[t] = { truck_no: t, trips: 0, qty: 0, cash: 0, diesel: 0 }; truckMap[t].trips++; truckMap[t].qty += (e.final_w||0)/100; truckMap[t].cash += (e.cash_paid||0); truckMap[t].diesel += (e.diesel_paid||0); const a = e.agent_name || 'Unknown'; if (!agentMap[a]) agentMap[a] = { agent: a, entries: 0, qty: 0 }; agentMap[a].entries++; agentMap[a].qty += (e.final_w||0)/100; }

      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Outstanding');
      const hdrStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }, alignment: { horizontal: 'center' } };

      ws.mergeCells('A1:F1'); ws.getCell('A1').value = 'Outstanding Report'; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
      let row = 3;
      ws.getCell(`A${row}`).value = 'DC PENDING DELIVERIES'; ws.getCell(`A${row}`).font = { bold: true, size: 11 }; row++;
      ['DC No','Allotted(Q)','Delivered(Q)','Pending(Q)','Deadline','Type'].forEach((h, i) => { const c = ws.getCell(row, i+1); c.value = h; Object.assign(c, hdrStyle); }); row++;
      for (const d of dcOutstanding) { [d.dc_number, d.allotted, d.delivered, d.pending, d.deadline, d.rice_type].forEach((v, i) => { ws.getCell(row, i+1).value = v; }); row++; }

      row += 2; ws.getCell(`A${row}`).value = 'TRUCK SUMMARY'; ws.getCell(`A${row}`).font = { bold: true, size: 11 }; row++;
      ['Truck No','Trips','Qty(Q)','Cash Paid','Diesel Paid','Total'].forEach((h, i) => { const c = ws.getCell(row, i+1); c.value = h; Object.assign(c, hdrStyle); }); row++;
      for (const t of Object.values(truckMap)) { [t.truck_no, t.trips, Math.round(t.qty*100)/100, Math.round(t.cash), Math.round(t.diesel), Math.round(t.cash+t.diesel)].forEach((v, i) => { ws.getCell(row, i+1).value = v; }); row++; }

      row += 2; ws.getCell(`A${row}`).value = 'AGENT SUMMARY'; ws.getCell(`A${row}`).font = { bold: true, size: 11 }; row++;
      ['Agent','Entries','Qty(Q)'].forEach((h, i) => { const c = ws.getCell(row, i+1); c.value = h; Object.assign(c, hdrStyle); }); row++;
      for (const a of Object.values(agentMap)) { [a.agent, a.entries, Math.round(a.qty*100)/100].forEach((v, i) => { ws.getCell(row, i+1).value = v; }); row++; }

      ws.columns.forEach(c => { c.width = 16; });
      const buf = await wb.xlsx.writeBuffer();
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=outstanding_${Date.now()}.xlsx` }); res.send(Buffer.from(buf));
    } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
  }));

  router.get('/api/reports/outstanding/pdf', safeSync((req, res) => {
    try {
      const { kms_year, season } = req.query;
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=outstanding_${Date.now()}.pdf`); doc.pipe(res);

      addPdfHeader(doc, 'Outstanding Report', kms_year ? `${kms_year} | ${season || ''}` : '');

      const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
      const dcOutstanding = [];
      for (const dc of dcEntries) { const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl||0), 0)*100)/100; const pending = Math.round((dc.quantity_qntl - delivered)*100)/100; if (pending > 0) dcOutstanding.push(dc); }

      // DC Pending
      addSectionTitle(doc, 'DC Pending Deliveries');
      if (dcOutstanding.length > 0) {
        const dcHeaders = ['DC No', 'Allotted(Q)', 'Delivered(Q)', 'Pending(Q)', 'Deadline', 'Rice Type'];
        const dcRows = dcOutstanding.map(dc => {
          const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl||0), 0)*100)/100;
          const pending = Math.round((dc.quantity_qntl - delivered)*100)/100;
          return [dc.dc_number||'', fmtAmt(dc.quantity_qntl), fmtAmt(delivered), fmtAmt(pending), dc.deadline||'', dc.rice_type||''];
        });
        addPdfTable(doc, dcHeaders, dcRows, [80, 80, 80, 80, 80, 100]);
      } else { doc.fontSize(8).text('Koi pending DC nahi hai', { align: 'center' }); doc.moveDown(); }

      // Truck Summary
      const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const truckMap = {};
      for (const e of entries) { const t = e.truck_no || 'Unknown'; if (!truckMap[t]) truckMap[t] = { truck_no: t, trips: 0, qty: 0, cash: 0, diesel: 0 }; truckMap[t].trips++; truckMap[t].qty += (e.final_w||0)/100; truckMap[t].cash += (e.cash_paid||0); truckMap[t].diesel += (e.diesel_paid||0); }
      const trucks = Object.values(truckMap);
      if (trucks.length > 0) {
        addSectionTitle(doc, 'Truck Summary');
        addPdfTable(doc, ['Truck No','Trips','Qty(Q)','Cash Paid','Diesel','Total'], trucks.map(t => [t.truck_no, t.trips, fmtAmt(Math.round(t.qty*100)/100), `Rs.${fmtAmt(Math.round(t.cash))}`, `Rs.${fmtAmt(Math.round(t.diesel))}`, `Rs.${fmtAmt(Math.round(t.cash+t.diesel))}`]), [100, 50, 70, 80, 80, 80]);
      }

      // Agent Summary
      const agentMap = {};
      for (const e of entries) { const a = e.agent_name || 'Unknown'; if (!agentMap[a]) agentMap[a] = { agent: a, entries: 0, qty: 0 }; agentMap[a].entries++; agentMap[a].qty += (e.final_w||0)/100; }
      const agents = Object.values(agentMap);
      if (agents.length > 0) {
        addSectionTitle(doc, 'Agent Summary');
        addPdfTable(doc, ['Agent','Entries','Qty(Q)'], agents.map(a => [a.agent, a.entries, fmtAmt(Math.round(a.qty*100)/100)]), [150, 80, 100]);
      }

      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ===== PARTY LEDGER EXPORTS =====
  router.get('/api/reports/party-ledger/excel', safeAsync(async (req, res) => {
    try {
      const { party_name, party_type, kms_year, season, date_from, date_to } = req.query;
      const ledger = getLedgerData(party_name, party_type, kms_year, season, date_from, date_to);
      const hdrStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }, alignment: { horizontal: 'center' } };

      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Ledger');
      ws.mergeCells('A1:G1'); ws.getCell('A1').value = `Party Ledger${party_name?' - '+party_name:''}`; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };

      ['Date','Party','Type','Description','Debit(Rs.)','Credit(Rs.)','Ref'].forEach((h, i) => { const c = ws.getCell(3, i+1); c.value = h; Object.assign(c, hdrStyle); });
      ledger.forEach((l, i) => { [l.date, l.party_name, l.party_type, l.description, l.debit||'', l.credit||'', l.ref].forEach((v, j) => { ws.getCell(i+4, j+1).value = v; }); });

      // Totals row
      const totalRow = ledger.length + 4;
      ws.getCell(totalRow, 1).value = 'TOTAL'; ws.getCell(totalRow, 1).font = { bold: true };
      ws.getCell(totalRow, 5).value = Math.round(ledger.reduce((s, l) => s + l.debit, 0)*100)/100; ws.getCell(totalRow, 5).font = { bold: true };
      ws.getCell(totalRow, 6).value = Math.round(ledger.reduce((s, l) => s + l.credit, 0)*100)/100; ws.getCell(totalRow, 6).font = { bold: true };

      ws.columns.forEach(c => { c.width = 18; }); ws.getColumn(4).width = 40;
      const buf = await wb.xlsx.writeBuffer();
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=party_ledger_${Date.now()}.xlsx` }); res.send(Buffer.from(buf));
    } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
  }));

  router.get('/api/reports/party-ledger/pdf', safeSync((req, res) => {
    try {
      const { party_name, party_type, kms_year, season, date_from, date_to } = req.query;
      const ledger = getLedgerData(party_name, party_type, kms_year, season, date_from, date_to);

      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=party_ledger_${Date.now()}.pdf`); doc.pipe(res);

      addPdfHeader(doc, `Party Ledger${party_name ? ' - ' + party_name : ''}`, date_from && date_to ? `${date_from} to ${date_to}` : '');

      if (ledger.length > 0) {
        const headers = ['Date', 'Party', 'Type', 'Description', 'Debit(Rs.)', 'Credit(Rs.)'];
        const rows = ledger.map(l => [fmtDate(l.date), l.party_name, l.party_type, l.description, l.debit ? fmtAmt(l.debit) : '', l.credit ? fmtAmt(l.credit) : '']);
        addPdfTable(doc, headers, rows, [65, 90, 65, 200, 70, 70]);

        // Totals
        const totalDebit = Math.round(ledger.reduce((s, l) => s + l.debit, 0)*100)/100;
        const totalCredit = Math.round(ledger.reduce((s, l) => s + l.credit, 0)*100)/100;
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica-Bold').fillColor(C.hdrBg)
          .text(`Total Debit: Rs.${fmtAmt(totalDebit)}  |  Total Credit: Rs.${fmtAmt(totalCredit)}  |  Balance: Rs.${fmtAmt(totalDebit - totalCredit)}`, { align: 'center' });
      } else {
        doc.fontSize(10).text('Koi ledger entry nahi mili', { align: 'center' });
      }

      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ===== AGENT & MANDI WISE REPORT =====
  router.get('/api/reports/agent-mandi-wise', safeSync((req, res) => {
    const { kms_year, season, search } = req.query;
    let entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    if (search) {
      const s = search.toLowerCase();
      entries = entries.filter(e => (e.mandi_name||'').toLowerCase().includes(s) || (e.agent_name||'').toLowerCase().includes(s));
    }
    entries.sort((a, b) => (b.date||'').localeCompare(a.date||''));

    const mandiMap = {};
    for (const e of entries) {
      const mn = e.mandi_name || 'Unknown';
      if (!mandiMap[mn]) mandiMap[mn] = { mandi_name: mn, agent_name: e.agent_name || '', entries: [], totals: { total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_g_issued: 0, total_mill_w: 0, total_final_w: 0, total_cutting: 0, total_cash_paid: 0, total_diesel_paid: 0, entry_count: 0 }};
      const t = mandiMap[mn].totals;
      t.total_kg += e.kg || 0; t.total_qntl += e.qntl || 0; t.total_bag += e.bag || 0;
      t.total_g_deposite += e.g_deposite || 0; t.total_g_issued += e.g_issued || 0;
      t.total_mill_w += e.mill_w || 0; t.total_final_w += e.final_w || 0;
      t.total_cutting += e.cutting || 0; t.total_cash_paid += (e.cash_paid || 0);
      t.total_diesel_paid += (e.diesel_paid || 0); t.entry_count += 1;
      mandiMap[mn].entries.push({ date: e.date||'', truck_no: e.truck_no||'', rst_no: e.rst_no||'', tp_no: e.tp_no||'',
        kg: e.kg||0, qntl: Math.round((e.qntl||0)*100)/100, bag: e.bag||0, g_deposite: e.g_deposite||0,
        g_issued: e.g_issued||0, mill_w: Math.round((e.mill_w||0)*100)/100, final_w: Math.round((e.final_w||0)*100)/100,
        cutting: Math.round((e.cutting||0)*100)/100, cutting_percent: e.cutting_percent||0,
        cash_paid: e.cash_paid||0, diesel_paid: e.diesel_paid||0 });
    }

    const result = Object.values(mandiMap).sort((a,b) => a.mandi_name.localeCompare(b.mandi_name));
    for (const m of result) { for (const k in m.totals) m.totals[k] = Math.round(m.totals[k]*100)/100; }
    const grand = { total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_g_issued: 0, total_mill_w: 0, total_final_w: 0, total_cutting: 0, total_cash_paid: 0, total_diesel_paid: 0, entry_count: 0 };
    for (const m of result) { for (const k in grand) grand[k] += m.totals[k]; }
    for (const k in grand) grand[k] = Math.round(grand[k]*100)/100;
    res.json({ mandis: result, grand_totals: grand });
  }));

  router.get('/api/reports/agent-mandi-wise/excel', safeSync(async (req, res) => {
    const { kms_year, season, search } = req.query;
    let entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    if (search) { const s = search.toLowerCase(); entries = entries.filter(e => (e.mandi_name||'').toLowerCase().includes(s) || (e.agent_name||'').toLowerCase().includes(s)); }
    entries.sort((a, b) => (b.date||'').localeCompare(a.date||''));

    const mandiMap = {};
    for (const e of entries) {
      const mn = e.mandi_name || 'Unknown';
      if (!mandiMap[mn]) mandiMap[mn] = { mandi_name: mn, agent_name: e.agent_name || '', entries: [], totals: { total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_g_issued: 0, total_mill_w: 0, total_final_w: 0, total_cutting: 0, total_cash_paid: 0, total_diesel_paid: 0, entry_count: 0 }};
      const t = mandiMap[mn].totals;
      t.total_kg += e.kg||0; t.total_qntl += e.qntl||0; t.total_bag += e.bag||0;
      t.total_g_deposite += e.g_deposite||0; t.total_g_issued += e.g_issued||0; t.total_mill_w += e.mill_w||0;
      t.total_final_w += e.final_w||0; t.total_cutting += e.cutting||0; t.total_cash_paid += e.cash_paid||0;
      t.total_diesel_paid += e.diesel_paid||0; t.entry_count += 1;
      mandiMap[mn].entries.push(e);
    }
    const mandis = Object.values(mandiMap).sort((a,b) => a.mandi_name.localeCompare(b.mandi_name));

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Agent Mandi Report');
    const headers = ['Date','Truck No','RST','TP','Weight(Kg)','QNTL','Bags','Gunny Deposit','Gunny Issued','Mill Wt','Final Wt','Cutting','Cash Paid','Diesel Paid'];
    let title = 'Agent & Mandi Wise Report';
    if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    ws.mergeCells('A1:N1'); ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFD97706' } }; ws.getCell('A1').alignment = { horizontal: 'center' };

    let row = 3;
    const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    const hdrFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    const mFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
    const tFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    const gFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };

    for (const md of mandis) {
      ws.mergeCells(row,1,row,14);
      const mc = ws.getCell(row,1); mc.value = `${md.mandi_name} - Agent: ${md.agent_name} (${md.totals.entry_count} entries)`;
      mc.fill = mFill; mc.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; row++;
      headers.forEach((h,i) => { const c = ws.getCell(row,i+1); c.value = h; c.fill = hdrFill; c.font = hdrFont; c.alignment = { horizontal: 'center' }; });
      row++;
      for (const e of md.entries) {
        [e.date||'', e.truck_no||'', e.rst_no||'', e.tp_no||'', e.kg||0, Math.round((e.qntl||0)*100)/100, e.bag||0,
         e.g_deposite||0, e.g_issued||0, Math.round((e.mill_w||0)*100)/100, Math.round((e.final_w||0)*100)/100,
         Math.round((e.cutting||0)*100)/100, e.cash_paid||0, e.diesel_paid||0
        ].forEach((v,i) => { ws.getCell(row,i+1).value = v; }); row++;
      }
      const t = md.totals;
      ws.getCell(row,1).value = 'TOTAL'; ws.getCell(row,1).font = { bold: true }; ws.getCell(row,1).fill = tFill;
      [null,null,null,null, t.total_kg, Math.round(t.total_qntl*100)/100, t.total_bag, Math.round(t.total_g_deposite*100)/100,
       Math.round(t.total_g_issued*100)/100, Math.round(t.total_mill_w*100)/100, Math.round(t.total_final_w*100)/100,
       Math.round(t.total_cutting*100)/100, Math.round(t.total_cash_paid*100)/100, Math.round(t.total_diesel_paid*100)/100
      ].forEach((v,i) => { if (v !== null) { const c = ws.getCell(row,i+1); c.value = v; c.fill = tFill; c.font = { bold: true }; }});
      row += 2;
    }

    const grand = { total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_g_issued: 0, total_mill_w: 0, total_final_w: 0, total_cutting: 0, total_cash_paid: 0, total_diesel_paid: 0, entry_count: 0 };
    for (const m of mandis) { for (const k in grand) grand[k] += m.totals[k]; }
    ws.mergeCells(row,1,row,4);
    ws.getCell(row,1).value = `GRAND TOTAL (${Math.round(grand.entry_count)} entries)`; ws.getCell(row,1).fill = gFill; ws.getCell(row,1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    [null,null,null,null, grand.total_kg, Math.round(grand.total_qntl*100)/100, grand.total_bag,
     Math.round(grand.total_g_deposite*100)/100, Math.round(grand.total_g_issued*100)/100,
     Math.round(grand.total_mill_w*100)/100, Math.round(grand.total_final_w*100)/100,
     Math.round(grand.total_cutting*100)/100, Math.round(grand.total_cash_paid*100)/100, Math.round(grand.total_diesel_paid*100)/100
    ].forEach((v,i) => { if (v !== null) { const c = ws.getCell(row,i+1); c.value = v; c.fill = gFill; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; }});

    [12,14,10,10,12,10,8,13,12,12,12,10,12,12].forEach((w,i) => { ws.getColumn(i+1).width = w; });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=agent_mandi_report.xlsx`);
    res.send(Buffer.from(buf));
  }));

  router.get('/api/reports/agent-mandi-wise/pdf', safeSync((req, res) => {
    const { kms_year, season, search } = req.query;
    let entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    if (search) { const s = search.toLowerCase(); entries = entries.filter(e => (e.mandi_name||'').toLowerCase().includes(s) || (e.agent_name||'').toLowerCase().includes(s)); }
    entries.sort((a, b) => (b.date||'').localeCompare(a.date||''));

    const mandiMap = {};
    for (const e of entries) {
      const mn = e.mandi_name || 'Unknown';
      if (!mandiMap[mn]) mandiMap[mn] = { mandi_name: mn, agent_name: e.agent_name || '', entries: [], totals: { total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_g_issued: 0, total_mill_w: 0, total_final_w: 0, total_cutting: 0, total_cash_paid: 0, total_diesel_paid: 0, entry_count: 0 }};
      const t = mandiMap[mn].totals;
      t.total_kg += e.kg||0; t.total_qntl += e.qntl||0; t.total_bag += e.bag||0;
      t.total_g_deposite += e.g_deposite||0; t.total_g_issued += e.g_issued||0; t.total_mill_w += e.mill_w||0;
      t.total_final_w += e.final_w||0; t.total_cutting += e.cutting||0; t.total_cash_paid += e.cash_paid||0;
      t.total_diesel_paid += e.diesel_paid||0; t.entry_count += 1;
      mandiMap[mn].entries.push(e);
    }
    const mandis = Object.values(mandiMap).sort((a,b) => a.mandi_name.localeCompare(b.mandi_name));

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=agent_mandi_report.pdf');
    doc.pipe(res);

    let title = 'Agent & Mandi Wise Report';
    if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    addPdfHeader(doc, title, '');

    const headers = ['Date','Truck','RST','TP','Kg','QNTL','Bags','G.Dep','G.Iss','Mill Wt','Final Wt','Cut','Cash','Diesel'];
    const colW = [50,55,35,35,40,35,30,35,30,45,45,35,40,40];
    const startX = 20;

    for (const md of mandis) {
      if (doc.y > 450) doc.addPage();
      doc.rect(startX, doc.y, colW.reduce((a,b)=>a+b,0), 18).fill('#D97706');
      doc.fillColor('white').fontSize(9).text(`${md.mandi_name} - Agent: ${md.agent_name} (${md.totals.entry_count} entries)`, startX + 5, doc.y - 14, { width: 500 });
      doc.moveDown(0.3);

      let y = doc.y; let x = startX;
      doc.rect(x, y, colW.reduce((a,b)=>a+b,0), 14).fill('#1E293B');
      headers.forEach((h,i) => { doc.fillColor('white').fontSize(6).text(h, x+2, y+3, { width: colW[i]-4, align: 'center' }); x += colW[i]; });
      y += 14;

      for (const e of md.entries) {
        if (y > 540) { doc.addPage(); y = 30; }
        x = startX;
        const vals = [e.date||'', e.truck_no||'', e.rst_no||'', e.tp_no||'', e.kg||0, Math.round((e.qntl||0)*100)/100, e.bag||0, e.g_deposite||0, e.g_issued||0, Math.round((e.mill_w||0)*100)/100, Math.round((e.final_w||0)*100)/100, Math.round((e.cutting||0)*100)/100, e.cash_paid||0, e.diesel_paid||0];
        vals.forEach((v,i) => { doc.fillColor('#334155').fontSize(6).text(String(v), x+2, y+2, { width: colW[i]-4, align: i >= 4 ? 'right' : 'left' }); x += colW[i]; });
        y += 12;
      }

      if (y > 540) { doc.addPage(); y = 30; }
      x = startX;
      doc.rect(x, y, colW.reduce((a,b)=>a+b,0), 14).fill('#FEF3C7');
      doc.fillColor('#92400E').fontSize(6).text('TOTAL', x+2, y+3, { width: colW[0]-4 });
      const tv = [null,null,null,null, md.totals.total_kg, Math.round(md.totals.total_qntl*100)/100, md.totals.total_bag, Math.round(md.totals.total_g_deposite*100)/100, Math.round(md.totals.total_g_issued*100)/100, Math.round(md.totals.total_mill_w*100)/100, Math.round(md.totals.total_final_w*100)/100, Math.round(md.totals.total_cutting*100)/100, Math.round(md.totals.total_cash_paid*100)/100, Math.round(md.totals.total_diesel_paid*100)/100];
      tv.forEach((v,i) => { if (v !== null) doc.fillColor('#92400E').fontSize(6).text(String(v), x + colW.slice(0,i).reduce((a,b)=>a+b,0) + 2, y+3, { width: colW[i]-4, align: 'right' }); });
      doc.y = y + 20;
    }

    const grand = { total_kg: 0, total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_g_issued: 0, total_mill_w: 0, total_final_w: 0, total_cutting: 0, total_cash_paid: 0, total_diesel_paid: 0, entry_count: 0 };
    for (const m of mandis) { for (const k in grand) grand[k] += m.totals[k]; }
    if (doc.y > 520) doc.addPage();
    let y = doc.y; let x = startX;
    doc.rect(x, y, colW.reduce((a,b)=>a+b,0), 16).fill('#065F46');
    doc.fillColor('white').fontSize(7).text(`GRAND TOTAL (${Math.round(grand.entry_count)} entries)`, x+2, y+4, { width: 170 });
    const gv = [null,null,null,null, grand.total_kg, Math.round(grand.total_qntl*100)/100, grand.total_bag, Math.round(grand.total_g_deposite*100)/100, Math.round(grand.total_g_issued*100)/100, Math.round(grand.total_mill_w*100)/100, Math.round(grand.total_final_w*100)/100, Math.round(grand.total_cutting*100)/100, Math.round(grand.total_cash_paid*100)/100, Math.round(grand.total_diesel_paid*100)/100];
    gv.forEach((v,i) => { if (v !== null) doc.fillColor('white').fontSize(7).text(String(v), x + colW.slice(0,i).reduce((a,b)=>a+b,0) + 2, y+4, { width: colW[i]-4, align: 'right' }); });

    doc.end();
  }));

  return router;
};
