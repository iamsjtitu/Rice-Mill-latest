const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable } = require('./pdf_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding);
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
    const dateFilter = (d) => (!date_from || d >= date_from) && (!date_to || d <= date_to);
    const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season) && dateFilter(e.date || ''));
    const ledger = [];
    if (!party_type || party_type === 'truck') { for (const e of entries) { const t = e.truck_no || ''; if (!t) continue; if (party_name && t.toLowerCase() !== party_name.toLowerCase()) continue; const tp = Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100; if (tp > 0) ledger.push({ date: e.date || '', party_name: t, party_type: 'Truck', description: `Mandi: ${e.mandi_name||''} | Cash: ${e.cash_paid||0} Diesel: ${e.diesel_paid||0}`, debit: 0, credit: tp, ref: (e.id||'').substring(0,8) }); } }
    if (!party_type || party_type === 'cash_party') { const cashTxns = (database.data.cash_transactions||[]).filter(t => (!kms_year||t.kms_year===kms_year) && (!season||t.season===season) && dateFilter(t.date || '')); for (const t of cashTxns) { const cat = (t.category||'').trim(); if (!cat) continue; if (['cash payment','diesel payment','cash paid','diesel','cash paid (entry)','diesel (entry)'].includes(cat.toLowerCase())) continue; if (party_name && cat.toLowerCase() !== party_name.toLowerCase()) continue; const isJama = t.txn_type === 'jama'; ledger.push({ date: t.date||'', party_name: cat, party_type: 'Cash Party', description: t.description || `${isJama?'Jama':'Nikasi'}: Rs.${t.amount||0}`, debit: isJama ? 0 : Math.round((t.amount||0)*100)/100, credit: isJama ? Math.round((t.amount||0)*100)/100 : 0, ref: (t.id||'').substring(0,8) }); } }
    if (!party_type || party_type === 'frk_party') { (database.data.frk_purchases||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(p => { const n = p.party_name||''; if (!n) return; if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: p.date||'', party_name: n, party_type: 'FRK Seller', description: `FRK: ${p.quantity_qntl||0}Q @ Rs.${p.rate_per_qntl||0}/Q`, debit: Math.round((p.total_amount||0)*100)/100, credit: 0, ref: (p.id||'').substring(0,8) }); }); }
    if (!party_type || party_type === 'buyer') { (database.data.byproduct_sales||[]).filter(s => (!kms_year||s.kms_year===kms_year) && (!season||s.season===season)).forEach(s => { const b = s.buyer_name||''; if (!b) return; if (party_name && b.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: s.date||'', party_name: b, party_type: 'Buyer', description: `${(s.product||'')}`, debit: 0, credit: Math.round((s.total_amount||0)*100)/100, ref: (s.id||'').substring(0,8) }); }); }
    if (!party_type || party_type === 'pvt_paddy') { (database.data.private_paddy||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(p => { const n = p.party_name||''; if (!n) return; if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: p.date||'', party_name: n, party_type: 'Pvt Paddy', description: `Paddy Purchase: ${p.final_qntl||0}Q @ Rs.${p.rate_per_qntl||0}/Q = Rs.${p.total_amount||0}`, debit: Math.round((p.total_amount||0)*100)/100, credit: 0, ref: (p.id||'').substring(0,8) }); }); }
    if (!party_type || party_type === 'rice_buyer') { (database.data.rice_sales||[]).filter(s => (!kms_year||s.kms_year===kms_year) && (!season||s.season===season)).forEach(s => { const n = s.party_name||''; if (!n) return; if (party_name && n.toLowerCase()!==party_name.toLowerCase()) return; ledger.push({ date: s.date||'', party_name: n, party_type: 'Rice Buyer', description: `Rice Sale: ${s.quantity_qntl||0}Q (${s.rice_type||''}) @ Rs.${s.rate_per_qntl||0}/Q = Rs.${s.total_amount||0}`, debit: 0, credit: Math.round((s.total_amount||0)*100)/100, ref: (s.id||'').substring(0,8) }); }); }
    if (!party_type || ['pvt_paddy','rice_buyer','pvt_payment'].includes(party_type)) { (database.data.private_payments||[]).filter(p => (!kms_year||p.kms_year===kms_year) && (!season||p.season===season)).forEach(pay => { const pn = pay.party_name||''; if (!pn) return; if (party_name && pn.toLowerCase()!==party_name.toLowerCase()) return; if (pay.ref_type==='paddy_purchase') { if (party_type && !['pvt_paddy','pvt_payment'].includes(party_type)) return; ledger.push({ date: pay.date||'', party_name: pn, party_type: 'Pvt Paddy', description: `Payment: Rs.${pay.amount||0} (${pay.mode||'cash'})`, debit: 0, credit: Math.round((pay.amount||0)*100)/100, ref: (pay.id||'').substring(0,8) }); } else if (pay.ref_type==='rice_sale') { if (party_type && !['rice_buyer','pvt_payment'].includes(party_type)) return; ledger.push({ date: pay.date||'', party_name: pn, party_type: 'Rice Buyer', description: `Payment Received: Rs.${pay.amount||0} (${pay.mode||'cash'})`, debit: Math.round((pay.amount||0)*100)/100, credit: 0, ref: (pay.id||'').substring(0,8) }); } }); }
    ledger.sort((a, b) => (b.date||'').localeCompare(a.date||''));
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
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Outstanding');
      ws.mergeCells('A1:F1'); ws.getCell('A1').value = 'Outstanding Report'; ws.getCell('A1').font = { bold: true, size: 14 };
      let row = 3; ws.getCell(`A${row}`).value = 'DC PENDING DELIVERIES'; ws.getCell(`A${row}`).font = { bold: true }; row++;
      ['DC No','Allotted(Q)','Delivered(Q)','Pending(Q)','Deadline','Type'].forEach((h, i) => { ws.getCell(row, i+1).value = h; ws.getCell(row, i+1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(row, i+1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }; }); row++;
      for (const d of dcOutstanding) { [d.dc_number, d.allotted, d.delivered, d.pending, d.deadline, d.rice_type].forEach((v, i) => { ws.getCell(row, i+1).value = v; }); row++; }
      const buf = await wb.xlsx.writeBuffer();
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=outstanding_${Date.now()}.xlsx` }); res.send(Buffer.from(buf));
    } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
  }));

  router.get('/api/reports/outstanding/pdf', safeSync((req, res) => {
    try {
      const { kms_year, season } = req.query;
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=outstanding_${Date.now()}.pdf`); doc.pipe(res);
      doc.fontSize(18).text('Outstanding Report', { align: 'center' }); doc.moveDown();
      doc.fontSize(12).text('DC Pending Deliveries', { underline: true }); doc.moveDown(0.5);
      const dcEntries = (database.data.dc_entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
      const allDels = (database.data.dc_deliveries || []).filter(d => (!kms_year || d.kms_year === kms_year) && (!season || d.season === season));
      for (const dc of dcEntries) { const delivered = Math.round(allDels.filter(d => d.dc_id === dc.id).reduce((s, d) => s + (d.quantity_qntl||0), 0)*100)/100; const pending = Math.round((dc.quantity_qntl - delivered)*100)/100; if (pending > 0) doc.fontSize(9).text(`${dc.dc_number||'-'} | Allotted: ${dc.quantity_qntl}Q | Delivered: ${delivered}Q | Pending: ${pending}Q`); }
      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ===== PARTY LEDGER EXPORTS =====
  router.get('/api/reports/party-ledger/excel', safeAsync(async (req, res) => {
    try {
      const { party_name, party_type, kms_year, season, date_from, date_to } = req.query;
      const dateFilter = (d) => (!date_from || d >= date_from) && (!date_to || d <= date_to);
      const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season) && dateFilter(e.date || ''));
      const ledger = [];
      if (!party_type || party_type === 'truck') entries.forEach(e => { const t = e.truck_no||''; if (!t||(party_name && t.toLowerCase()!==party_name.toLowerCase())) return; const tp = Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100; if (tp > 0) ledger.push({ date: e.date, party_name: t, party_type: 'Truck', description: `Mandi: ${e.mandi_name||''} | Cash: ${e.cash_paid||0} Diesel: ${e.diesel_paid||0}`, debit: 0, credit: tp, ref: (e.id||'').substring(0,8) }); });
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Ledger');
      ws.mergeCells('A1:G1'); ws.getCell('A1').value = `Party Ledger${party_name?' - '+party_name:''}`; ws.getCell('A1').font = { bold: true, size: 14 };
      ['Date','Party','Type','Description','Debit(Rs.)','Credit(Rs.)','Ref'].forEach((h, i) => { ws.getCell(3, i+1).value = h; ws.getCell(3, i+1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(3, i+1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }; });
      ledger.forEach((l, i) => { [l.date, l.party_name, l.party_type, l.description, l.debit||'', l.credit||'', l.ref].forEach((v, j) => { ws.getCell(i+4, j+1).value = v; }); });
      const buf = await wb.xlsx.writeBuffer();
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename=party_ledger_${Date.now()}.xlsx` }); res.send(Buffer.from(buf));
    } catch (err) { res.status(500).json({ detail: 'Excel export failed: ' + err.message }); }
  }));

  router.get('/api/reports/party-ledger/pdf', safeSync((req, res) => {
    try {
      const { party_name, party_type, kms_year, season, date_from, date_to } = req.query;
      const dateFilter = (d) => (!date_from || d >= date_from) && (!date_to || d <= date_to);
      const entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season) && dateFilter(e.date || ''));
      const ledger = [];
      if (!party_type || party_type === 'truck') entries.forEach(e => { const t = e.truck_no||''; if (!t||(party_name && t.toLowerCase()!==party_name.toLowerCase())) return; const tp = Math.round(((e.cash_paid||0)+(e.diesel_paid||0))*100)/100; if (tp > 0) ledger.push({ date: e.date, party_name: t, party_type: 'Truck', description: `Mandi: ${e.mandi_name||''} | Cash: ${e.cash_paid||0} Diesel: ${e.diesel_paid||0}`, debit: 0, credit: tp }); });
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=party_ledger_${Date.now()}.pdf`); doc.pipe(res);
      doc.fontSize(18).text(`Party Ledger${party_name?' - '+party_name:''}`, { align: 'center' }); doc.moveDown();
      for (const l of ledger) doc.fontSize(8).text(`${l.date} | ${l.party_name} (${l.party_type}) | ${l.description} | Dr:Rs.${l.debit} | Cr:Rs.${l.credit}`);
      doc.end();
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  return router;
};
