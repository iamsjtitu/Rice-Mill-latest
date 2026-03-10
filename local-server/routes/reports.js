const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, addSectionTitle, fmtAmt, C } = require('./pdf_helpers');

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
        const rows = ledger.map(l => [l.date, l.party_name, l.party_type, l.description, l.debit ? fmtAmt(l.debit) : '', l.credit ? fmtAmt(l.credit) : '']);
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

  return router;
};
