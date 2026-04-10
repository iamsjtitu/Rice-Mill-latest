const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeAsync, safeSync, roundAmount } = require('./safe_handler');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, addSectionTitle, fmtAmt, fmtDate, C, registerFonts, F , safePdfPipe} = require('./pdf_helpers');
const rptHelper = require('../shared/report_helper');

module.exports = function(database) {

  function addPdfHeader(doc, title, subtitle) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding, subtitle);
  }

  // Helper to get full ledger data
  function getLedgerData(party_name, party_type, kms_year, season, date_from, date_to) {
    const dateFilter = (d) => (!date_from || d >= date_from) && (!date_to || d <= date_to);
    const entries = (database.data.entries || []).filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season) && dateFilter(e.date || ''));
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
      const cashTxns = (database.data.cash_transactions||[]).filter(t => (!kms_year||t.kms_year===kms_year) && (!season||t.season===season) && dateFilter(t.date || '') && !['Agent','Hemali','Sale Book','Purchase Voucher'].includes(t.party_type));
      for (const t of cashTxns) {
        const cat = (t.category||'').trim();
        if (!cat) continue;
        if (['cash payment','diesel payment','cash paid','diesel','cash paid (entry)','diesel (entry)'].includes(cat.toLowerCase())) continue;
        if (party_name && cat.toLowerCase() !== party_name.toLowerCase()) continue;
        // Skip auto-ledger entries (duplicates with reversed txn_type)
        if ((t.reference||'').includes('_ledger:')) continue;
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

    // Agent payments (from cash_transactions with party_type=Agent)
    if (!party_type || party_type === 'Agent') {
      const agentTxns = (database.data.cash_transactions||[]).filter(t =>
        t.party_type === 'Agent' &&
        (!kms_year||t.kms_year===kms_year) && (!season||t.season===season) && dateFilter(t.date || ''));
      for (const t of agentTxns) {
        const cat = (t.category||'').trim();
        if (!cat) continue;
        if (party_name && cat.toLowerCase() !== party_name.toLowerCase()) continue;
        // Skip auto-ledger entries (duplicates with reversed txn_type)
        if ((t.reference||'').includes('_ledger:')) continue;
        const isJama = t.txn_type === 'jama';
        ledger.push({ date: t.date||'', party_name: cat, party_type: 'Agent',
          description: t.description || `${isJama?'Jama':'Nikasi'}: Rs.${t.amount||0}`,
          debit: isJama ? 0 : Math.round((t.amount||0)*100)/100,
          credit: isJama ? Math.round((t.amount||0)*100)/100 : 0,
          ref: (t.id||'').substring(0,8) });
      }
    }

    // Sale Book parties (from local_party_accounts)
    if (!party_type || party_type === 'sale_book') {
      (database.data.local_party_accounts||[]).filter(t =>
        ['sale_voucher','sale_voucher_payment'].includes(t.source_type) &&
        (!kms_year||t.kms_year===kms_year) && (!season||t.season===season) && dateFilter(t.date||'')
      ).forEach(t => {
        const pn = t.party_name||''; if (!pn) return;
        if (party_name && pn.toLowerCase()!==party_name.toLowerCase()) return;
        const amt = Math.round((t.amount||0)*100)/100;
        if (t.source_type === 'sale_voucher') {
          ledger.push({ date: t.date||'', party_name: pn, party_type: 'Sale Book', description: t.description||`Sale: Rs.${amt}`, debit: amt, credit: 0, ref: (t.id||'').substring(0,8) });
        } else {
          ledger.push({ date: t.date||'', party_name: pn, party_type: 'Sale Book', description: t.description||`Payment: Rs.${amt}`, debit: 0, credit: amt, ref: (t.id||'').substring(0,8) });
        }
      });
    }

    // Purchase Voucher parties (from local_party_accounts)
    if (!party_type || party_type === 'purchase_voucher') {
      (database.data.local_party_accounts||[]).filter(t =>
        ['purchase_voucher','purchase_voucher_payment'].includes(t.source_type) &&
        (!kms_year||t.kms_year===kms_year) && (!season||t.season===season) && dateFilter(t.date||'')
      ).forEach(t => {
        const pn = t.party_name||''; if (!pn) return;
        if (party_name && pn.toLowerCase()!==party_name.toLowerCase()) return;
        const amt = Math.round((t.amount||0)*100)/100;
        if (t.source_type === 'purchase_voucher') {
          ledger.push({ date: t.date||'', party_name: pn, party_type: 'Purchase Voucher', description: t.description||`Purchase: Rs.${amt}`, debit: 0, credit: amt, ref: (t.id||'').substring(0,8) });
        } else {
          ledger.push({ date: t.date||'', party_name: pn, party_type: 'Purchase Voucher', description: t.description||`Payment: Rs.${amt}`, debit: amt, credit: 0, ref: (t.id||'').substring(0,8) });
        }
      });
    }

    ledger.sort((a, b) => (b.date||'').slice(0,10).localeCompare((a.date||'').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||''));
    return ledger;
  }

  // ===== OUTSTANDING REPORT =====
  router.get('/api/reports/outstanding', safeSync(async (req, res) => {
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
  router.get('/api/reports/party-ledger', safeSync(async (req, res) => {
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

  router.get('/api/reports/outstanding/pdf', safeSync(async (req, res) => {
    try {
      const { kms_year, season } = req.query;
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=outstanding_${Date.now()}.pdf`); // PDF will be sent via safePdfPipe

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

      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ===== PARTY LEDGER EXPORTS =====
  router.get('/api/reports/party-ledger/excel', safeAsync(async (req, res) => {
    try {
      const { party_name, party_type, kms_year, season, date_from, date_to } = req.query;
      const ledger = getLedgerData(party_name, party_type, kms_year, season, date_from, date_to);
      ledger.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
      const hdrStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }, alignment: { horizontal: 'center' } };

      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Ledger');
      ws.mergeCells('A1:F1'); ws.getCell('A1').value = `Party Ledger${party_name?' - '+party_name:''}`; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };

      ['Date','Party','Type','Description','Debit(Rs.)','Credit(Rs.)'].forEach((h, i) => { const c = ws.getCell(3, i+1); c.value = h; Object.assign(c, hdrStyle); });
      ledger.forEach((l, i) => { [fmtDate(l.date), l.party_name, l.party_type, l.description, l.debit||'', l.credit||''].forEach((v, j) => { ws.getCell(i+4, j+1).value = v; }); });

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

  router.get('/api/reports/party-ledger/pdf', safeSync(async (req, res) => {
    try {
      const { party_name, party_type, kms_year, season, date_from, date_to } = req.query;
      const ledger = getLedgerData(party_name, party_type, kms_year, season, date_from, date_to);
      ledger.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));

      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=party_ledger_${Date.now()}.pdf`); // PDF will be sent via safePdfPipe

      addPdfHeader(doc, `Party Ledger${party_name ? ' - ' + party_name : ''}`, date_from && date_to ? `${date_from} to ${date_to}` : '');

      if (ledger.length > 0) {
        const headers = ['Date', 'Party', 'Type', 'Description', 'Debit(Rs.)', 'Credit(Rs.)'];
        const rows = ledger.map(l => [fmtDate(l.date), l.party_name, l.party_type, l.description, l.debit ? fmtAmt(l.debit) : '', l.credit ? fmtAmt(l.credit) : '']);
        addPdfTable(doc, headers, rows, [65, 90, 65, 200, 70, 70]);

        // Totals
        const totalDebit = Math.round(ledger.reduce((s, l) => s + l.debit, 0)*100)/100;
        const totalCredit = Math.round(ledger.reduce((s, l) => s + l.credit, 0)*100)/100;
        doc.moveDown(0.3);
        doc.fontSize(9).font(F('bold')).fillColor(C.hdrBg)
          .text(`Total Debit: Rs.${fmtAmt(totalDebit)}  |  Total Credit: Rs.${fmtAmt(totalCredit)}  |  Balance: Rs.${fmtAmt(totalDebit - totalCredit)}`, { align: 'center' });
      } else {
        doc.fontSize(10).text('Koi ledger entry nahi mili', { align: 'center' });
      }

      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ===== AGENT & MANDI WISE REPORT =====
  router.get('/api/reports/agent-mandi-wise', safeSync(async (req, res) => {
    const { kms_year, season, search } = req.query;
    let entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    if (search) {
      const s = search.toLowerCase();
      entries = entries.filter(e => (e.mandi_name||'').toLowerCase().includes(s) || (e.agent_name||'').toLowerCase().includes(s));
    }
    entries.sort((a, b) => (b.date||'').slice(0,10).localeCompare((a.date||'').slice(0,10)));

    const mandiMap = {};
    for (const e of entries) {
      const mn = e.mandi_name || 'Unknown';
      if (!mandiMap[mn]) mandiMap[mn] = { mandi_name: mn, agent_name: e.agent_name || '', entries: [], totals: {
        total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_gbw_cut: 0,
        total_plastic_bag: 0, total_p_pkt_cut: 0, total_mill_w: 0,
        total_moisture_cut: 0, total_final_w: 0, total_tp_weight: 0, total_g_issued: 0,
        total_cash_paid: 0, total_diesel_paid: 0, total_disc_dust_poll: 0, entry_count: 0 }};
      const t = mandiMap[mn].totals;
      t.total_qntl += e.qntl || 0; t.total_bag += e.bag || 0;
      t.total_g_deposite += e.g_deposite || 0; t.total_gbw_cut += e.gbw_cut || 0;
      t.total_plastic_bag += e.plastic_bag || 0; t.total_p_pkt_cut += e.p_pkt_cut || 0;
      t.total_mill_w += e.mill_w || 0; t.total_moisture_cut += e.moisture_cut || 0;
      t.total_final_w += e.final_w || 0; t.total_tp_weight += parseFloat(e.tp_weight || 0) || 0;
      t.total_g_issued += e.g_issued || 0;
      t.total_cash_paid += (e.cash_paid || 0); t.total_diesel_paid += (e.diesel_paid || 0);
      t.total_disc_dust_poll += e.disc_dust_poll || 0; t.entry_count += 1;
      const r = (v) => Math.round((v||0)*100)/100;
      mandiMap[mn].entries.push({ date: e.date||'', truck_no: e.truck_no||'',
        qntl: r(e.qntl), bag: e.bag||0, g_deposite: e.g_deposite||0, gbw_cut: r(e.gbw_cut),
        plastic_bag: e.plastic_bag||0, p_pkt_cut: r(e.p_pkt_cut), mill_w: r(e.mill_w),
        moisture_cut_percent: r(e.moisture_cut_percent), moisture_cut: r(e.moisture_cut),
        cutting_percent: r(e.cutting_percent), disc_dust_poll: r(e.disc_dust_poll),
        final_w: r(e.final_w), tp_weight: parseFloat(e.tp_weight || 0) || 0,
        g_issued: e.g_issued||0, cash_paid: e.cash_paid||0, diesel_paid: e.diesel_paid||0 });
    }

    const result = Object.values(mandiMap).sort((a,b) => a.mandi_name.localeCompare(b.mandi_name));
    for (const m of result) { for (const k in m.totals) m.totals[k] = Math.round(m.totals[k]*100)/100; }

    // Add target and extra QNTL info (based on Final W)
    const targets = database.getMandiTargets({ kms_year, season });
    const targetMap = {}; for (const t of targets) targetMap[t.mandi_name] = t;
    const pvtEntries = (database.data.private_paddy || []).filter(p => p.source === 'agent_extra');
    const pvtMandiSet = new Set(pvtEntries.map(p => p.mandi_name));
    for (const m of result) {
      const target = targetMap[m.mandi_name] || {};
      const targetQntl = Math.round((target.target_qntl || 0) * 100) / 100;
      const cuttingPct = Math.round((target.cutting_percent || 0) * 100) / 100;
      const expectedTotal = Math.round((target.expected_total || (targetQntl + targetQntl * cuttingPct / 100)) * 100) / 100;
      const actualFinalQntl = Math.round((m.totals.total_final_w / 100) * 100) / 100;
      m.target_qntl = targetQntl;
      m.cutting_percent = cuttingPct;
      m.expected_total = expectedTotal;
      m.actual_final_qntl = actualFinalQntl;
      m.extra_qntl = expectedTotal > 0 ? Math.round(Math.max(0, actualFinalQntl - expectedTotal) * 100) / 100 : 0;
      m.pvt_moved = pvtMandiSet.has(m.mandi_name);
      if (m.entries.length > 0) {
        const last = m.entries[m.entries.length - 1];
        m.last_truck = { truck_no: last.truck_no, date: last.date, qntl: last.qntl, bag: last.bag, agent_name: m.agent_name, mandi_name: m.mandi_name };
      }
    }

    const grand = { total_qntl: 0, total_bag: 0, total_g_deposite: 0, total_gbw_cut: 0,
      total_plastic_bag: 0, total_p_pkt_cut: 0, total_mill_w: 0, total_moisture_cut: 0,
      total_final_w: 0, total_tp_weight: 0, total_g_issued: 0, total_cash_paid: 0, total_diesel_paid: 0,
      total_disc_dust_poll: 0, entry_count: 0 };
    for (const m of result) { for (const k in grand) grand[k] += m.totals[k]; }
    for (const k in grand) grand[k] = Math.round(grand[k]*100)/100;
    grand.total_extra_qntl = Math.round(result.reduce((s, m) => s + (m.extra_qntl || 0), 0) * 100) / 100;
    res.json({ mandis: result, grand_totals: grand });
  }));

  // Move extra QNTL to Pvt Purchase
  router.post('/api/reports/agent-mandi-wise/move-to-pvt', safeSync(async (req, res) => {
    const { mandi_name, agent_name, extra_qntl, rate, kms_year, username, last_truck } = req.body;
    const season = req.body.season || 'Kharif';
    if (!mandi_name || !extra_qntl || extra_qntl <= 0 || !rate || rate <= 0)
      return res.status(400).json({ success: false, detail: 'Mandi name, extra QNTL aur rate required hai' });
    if (!database.data.private_paddy) database.data.private_paddy = [];
    const existing = database.data.private_paddy.find(p => p.mandi_name === mandi_name && p.source === 'agent_extra' && p.kms_year === (kms_year||'') && p.season === (season||''));
    if (existing) return res.json({ success: false, detail: `${mandi_name} ka extra QNTL pehle se Pvt Purchase mein move ho chuka hai` });
    const total_amount = Math.round(extra_qntl * rate * 100) / 100;
    const lt = last_truck || {};
    const pvtEntry = {
      id: uuidv4(), date: lt.date || new Date().toISOString().split('T')[0],
      party_name: `${agent_name} (${mandi_name})`, mandi_name, agent_name,
      truck_no: lt.truck_no || '',
      kg: Math.round(extra_qntl * 100 * 100) / 100,
      qntl: Math.round(extra_qntl * 100) / 100,
      final_qntl: Math.round(extra_qntl * 100) / 100,
      quantity_qntl: Math.round(extra_qntl * 100) / 100,
      rate_per_qntl: Math.round(rate * 100) / 100,
      total_amount, balance: total_amount, bag: lt.bag || 0, paid_amount: 0, status: 'pending', source: 'agent_extra',
      note: `Agent extra - Target se ${extra_qntl}Q zyada (${lt.truck_no || ''})`,
      kms_year: kms_year || '', season: season || '', created_by: username || 'admin',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    database.data.private_paddy.push(pvtEntry);
    // Auto-create Party Ledger Jama entry (we owe party for paddy purchase)
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const partyLabel = pvtEntry.party_name;
    database.data.cash_transactions.push({
      id: require('crypto').randomUUID(),
      date: pvtEntry.date,
      account: 'ledger', txn_type: 'jama',
      category: partyLabel, party_type: 'Pvt Paddy Purchase',
      description: `Paddy Purchase: ${partyLabel} - ${extra_qntl}Q @ Rs.${rate}/Q = Rs.${total_amount}`,
      amount: roundAmount(total_amount),
      reference: `pvt_party_jama:${pvtEntry.id.slice(0, 8)}`,
      kms_year: kms_year || '', season: season || '',
      created_by: username || 'admin', linked_entry_id: pvtEntry.id,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    database.save();
    res.json({ success: true, message: `${extra_qntl}Q @ Rs.${rate}/Q = Rs.${total_amount} Pvt Purchase mein move ho gaya (${agent_name} - ${mandi_name})` });
  }));

  router.get('/api/reports/agent-mandi-wise/excel', safeSync(async (req, res) => {
    const { kms_year, season, search, mandis: mandiFilter } = req.query;
    let entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    if (search) { const s = search.toLowerCase(); entries = entries.filter(e => (e.mandi_name||'').toLowerCase().includes(s) || (e.agent_name||'').toLowerCase().includes(s)); }
    if (mandiFilter) { const names = mandiFilter.split(',').map(n => n.trim()).filter(Boolean); if (names.length) entries = entries.filter(e => names.includes(e.mandi_name||'')); }
    entries.sort((a, b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));

    const cols = rptHelper.getColumns('agent_mandi_report');
    const ncols = rptHelper.colCount(cols);
    const totalKeys = rptHelper.getTotalKeys(cols);

    const mandiMap = {};
    for (const e of entries) {
      const mn = e.mandi_name || 'Unknown';
      if (!mandiMap[mn]) {
        const initTotals = { entry_count: 0 };
        totalKeys.forEach(k => initTotals[k] = 0);
        mandiMap[mn] = { mandi_name: mn, agent_name: e.agent_name || '', entries: [], totals: initTotals };
      }
      const t = mandiMap[mn].totals;
      totalKeys.forEach(k => { const field = k.replace('total_', ''); t[k] += (e[field]||0); });
      t.entry_count += 1;
      mandiMap[mn].entries.push(e);
    }
    const mandis = Object.values(mandiMap).sort((a,b) => a.mandi_name.localeCompare(b.mandi_name));

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Agent Mandi Report');
    const headers = rptHelper.getExcelHeaders(cols);
    const widths = rptHelper.getExcelWidths(cols);
    let title = 'Agent & Mandi Wise Report';
    if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    ws.mergeCells(1,1,1,ncols); ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFD97706' } }; ws.getCell('A1').alignment = { horizontal: 'center' };

    let row = 3;
    const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    const hdrFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    const mFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
    const tFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    const gFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };

    for (const md of mandis) {
      ws.mergeCells(row,1,row,ncols);
      const mc = ws.getCell(row,1); mc.value = `${md.mandi_name} - Agent: ${md.agent_name} (${md.totals.entry_count} entries)`;
      mc.fill = mFill; mc.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; row++;
      headers.forEach((h,i) => { const c = ws.getCell(row,i+1); c.value = h; c.fill = hdrFill; c.font = hdrFont; c.alignment = { horizontal: 'center' }; });
      row++;
      for (const e of md.entries) {
        rptHelper.getEntryRow(e, cols).forEach((v,i) => { ws.getCell(row,i+1).value = v; }); row++;
      }
      const t = md.totals;
      const totalVals = rptHelper.getTotalRow(t, cols);
      ws.getCell(row,1).value = 'TOTAL'; ws.getCell(row,1).font = { bold: true }; ws.getCell(row,1).fill = tFill;
      totalVals.forEach((v,i) => { if (v !== null) { const c = ws.getCell(row,i+1); c.value = v; c.fill = tFill; c.font = { bold: true }; }});
      row += 2;
    }

    // Grand total
    const grand = { entry_count: 0 };
    totalKeys.forEach(k => grand[k] = 0);
    for (const m of mandis) { totalKeys.forEach(k => grand[k] += (m.totals[k]||0)); grand.entry_count += m.totals.entry_count; }
    const grandVals = rptHelper.getTotalRow(grand, cols);
    ws.mergeCells(row,1,row,2);
    ws.getCell(row,1).value = `GRAND TOTAL (${grand.entry_count} entries)`; ws.getCell(row,1).fill = gFill; ws.getCell(row,1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    grandVals.forEach((v,i) => { if (v !== null) { const c = ws.getCell(row,i+1); c.value = v; c.fill = gFill; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; }});

    widths.forEach((w,i) => { ws.getColumn(i+1).width = w; });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=agent_mandi_report.xlsx`);
    res.send(Buffer.from(buf));
  }));

  router.get('/api/reports/agent-mandi-wise/pdf', safeSync(async (req, res) => {
    const { kms_year, season, search, mandis: mandiFilter } = req.query;
    let entries = database.data.entries.filter(e => (!kms_year || e.kms_year === kms_year) && (!season || e.season === season));
    if (search) { const s = search.toLowerCase(); entries = entries.filter(e => (e.mandi_name||'').toLowerCase().includes(s) || (e.agent_name||'').toLowerCase().includes(s)); }
    // Filter by expanded mandis
    if (mandiFilter) { const names = mandiFilter.split(',').map(n => n.trim()).filter(Boolean); if (names.length) entries = entries.filter(e => names.includes(e.mandi_name||'')); }
    entries.sort((a, b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));

    const cols = rptHelper.getColumns('agent_mandi_report');
    const ncols = rptHelper.colCount(cols);
    const totalKeys = rptHelper.getTotalKeys(cols);

    const mandiMap = {};
    for (const e of entries) {
      const mn = e.mandi_name || 'Unknown';
      if (!mandiMap[mn]) {
        const initTotals = { entry_count: 0 };
        totalKeys.forEach(k => initTotals[k] = 0);
        mandiMap[mn] = { mandi_name: mn, agent_name: e.agent_name || '', entries: [], totals: initTotals };
      }
      const t = mandiMap[mn].totals;
      totalKeys.forEach(k => { const field = k.replace('total_', ''); t[k] += (e[field]||0); });
      t.entry_count += 1;
      mandiMap[mn].entries.push(e);
    }
    const mandis = Object.values(mandiMap).sort((a,b) => a.mandi_name.localeCompare(b.mandi_name));

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 20, right: 20 } });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=agent_mandi_report.pdf`);
    // PDF will be sent via safePdfPipe

    let title = 'Agent & Mandi Wise Report';
    if (kms_year) title += ` | KMS: ${kms_year}`; if (season) title += ` | ${season}`;
    addPdfHeader(doc, title, '');

    const headers = rptHelper.getPdfHeaders(cols);
    const colW = rptHelper.getPdfWidthsMm(cols).map(w => w * 2.83); // mm to points approx
    const startX = 20;

    for (const md of mandis) {
      if (doc.y > 450) doc.addPage();
      doc.rect(startX, doc.y, colW.reduce((a,b)=>a+b,0), 18).fill('#D97706');
      doc.fillColor('white').fontSize(9).text(`${md.mandi_name} - Agent: ${md.agent_name} (${md.totals.entry_count} entries)`, startX + 5, doc.y - 14, { width: 500 });
      doc.moveDown(0.3);

      let y = doc.y;
      let x = startX;
      doc.rect(x, y, colW.reduce((a,b)=>a+b,0), 14).fill('#1E293B');
      headers.forEach((h,i) => { doc.fillColor('white').fontSize(6).text(h, x+2, y+3, { width: colW[i]-4, align: 'center' }); x += colW[i]; });
      y += 14;

      // Find first right-aligned column
      const firstRight = cols.findIndex(c => c.align === 'right');

      for (const e of md.entries) {
        if (y > 540) { doc.addPage(); y = 30; }
        x = startX;
        const vals = rptHelper.getEntryRow(e, cols);
        vals.forEach((v,i) => { doc.fillColor('#334155').fontSize(6).text(String(v), x+2, y+2, { width: colW[i]-4, align: i >= firstRight ? 'right' : 'left' }); x += colW[i]; });
        y += 12;
      }

      if (y > 540) { doc.addPage(); y = 30; }
      x = startX;
      doc.rect(x, y, colW.reduce((a,b)=>a+b,0), 14).fill('#FEF3C7');
      doc.fillColor('#92400E').fontSize(6).text('TOTAL', x+2, y+3, { width: colW[0]-4 });
      const tv = rptHelper.getTotalRow(md.totals, cols);
      tv.forEach((v,i) => { if (v !== null) doc.fillColor('#92400E').fontSize(6).text(String(v), x + colW.slice(0,i).reduce((a,b)=>a+b,0) + 2, y+3, { width: colW[i]-4, align: 'right' }); });
      doc.y = y + 20;
    }

    // Grand total
    const grand = { entry_count: 0 };
    totalKeys.forEach(k => grand[k] = 0);
    for (const m of mandis) { totalKeys.forEach(k => grand[k] += (m.totals[k]||0)); grand.entry_count += m.totals.entry_count; }
    if (doc.y > 520) doc.addPage();
    let y = doc.y; let x = startX;
    doc.rect(x, y, colW.reduce((a,b)=>a+b,0), 16).fill('#065F46');
    doc.fillColor('white').fontSize(7).text(`GRAND TOTAL (${grand.entry_count} entries)`, x+2, y+4, { width: 170 });
    const gv = rptHelper.getTotalRow(grand, cols);
    gv.forEach((v,i) => { if (v !== null) doc.fillColor('white').fontSize(7).text(String(v), x + colW.slice(0,i).reduce((a,b)=>a+b,0) + 2, y+4, { width: colW[i]-4, align: 'right' }); });

    await safePdfPipe(doc, res);
  }));

  // ===== WEIGHT DISCREPANCY REPORT =====
  router.get('/api/reports/weight-discrepancy', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to, agent, mandi } = req.query;
    let entries = database.getEntries({ kms_year, season });
    if (date_from) entries = entries.filter(e => e.date >= date_from);
    if (date_to) entries = entries.filter(e => e.date <= date_to);
    if (agent) entries = entries.filter(e => e.agent_name === agent);
    if (mandi) entries = entries.filter(e => e.mandi_name === mandi);

    const discrepancies = [];
    let totalDiff = 0;
    let entriesWithTp = 0;
    entries.forEach(e => {
      const tpWt = parseFloat(e.tp_weight || 0) || 0;
      const qntl = parseFloat(e.qntl || 0) || 0;
      if (tpWt > 0) entriesWithTp++;
      if (tpWt > 0 && qntl > 0) {
        const diff = +(tpWt - qntl).toFixed(2);
        if (Math.abs(diff) > 0) {
          discrepancies.push({
            date: e.date || '', truck_no: e.truck_no || '', rst_no: e.rst_no || '',
            tp_no: e.tp_no || '', agent_name: e.agent_name || '', mandi_name: e.mandi_name || '',
            tp_weight: tpWt, qntl, diff_qntl: diff, diff_kg: Math.round(diff * 100)
          });
          totalDiff += diff;
        }
      }
    });
    res.json({
      discrepancies, total_count: discrepancies.length,
      total_entries_with_tp: entriesWithTp,
      total_diff_qntl: +totalDiff.toFixed(2), total_diff_kg: Math.round(totalDiff * 100)
    });
  }));

  router.get('/api/reports/weight-discrepancy/excel', safeAsync(async (req, res) => {
    const dataRes = await new Promise((resolve) => {
      const mockReq = { query: req.query };
      const mockRes = { json: (d) => resolve(d) };
      router.handle({ ...req, method: 'GET', url: '/api/reports/weight-discrepancy', query: req.query }, mockRes, () => {});
    }).catch(() => null);
    // Fallback: recompute
    const { kms_year, season, date_from, date_to, agent, mandi } = req.query;
    let entries = database.getEntries({ kms_year, season });
    if (date_from) entries = entries.filter(e => e.date >= date_from);
    if (date_to) entries = entries.filter(e => e.date <= date_to);
    if (agent) entries = entries.filter(e => e.agent_name === agent);
    if (mandi) entries = entries.filter(e => e.mandi_name === mandi);
    const discrepancies = []; let totalDiff = 0; let entriesWithTp = 0;
    entries.forEach(e => {
      const tpWt = parseFloat(e.tp_weight || 0) || 0;
      const qntl = parseFloat(e.qntl || 0) || 0;
      if (tpWt > 0) entriesWithTp++;
      if (tpWt > 0 && qntl > 0) {
        const diff = +(tpWt - qntl).toFixed(2);
        if (Math.abs(diff) > 0) {
          discrepancies.push({ date: e.date, truck_no: e.truck_no, rst_no: e.rst_no, tp_no: e.tp_no, agent_name: e.agent_name, mandi_name: e.mandi_name, tp_weight: tpWt, qntl, diff_qntl: diff, diff_kg: Math.round(diff * 100) });
          totalDiff += diff;
        }
      }
    });
    const data = { discrepancies, total_count: discrepancies.length, total_entries_with_tp: entriesWithTp, total_diff_qntl: +totalDiff.toFixed(2), total_diff_kg: Math.round(totalDiff * 100) };

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Weight Discrepancy');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Truck No', key: 'truck_no', width: 14 },
      { header: 'RST', key: 'rst_no', width: 8 }, { header: 'TP No', key: 'tp_no', width: 8 },
      { header: 'Agent', key: 'agent_name', width: 16 }, { header: 'Mandi', key: 'mandi_name', width: 22 },
      { header: 'TP Wt (Q)', key: 'tp_weight', width: 10 }, { header: 'Entry QNTL', key: 'qntl', width: 10 },
      { header: 'Diff (Q)', key: 'diff_qntl', width: 10 }, { header: 'Diff (KG)', key: 'diff_kg', width: 10 }
    ];
    data.discrepancies.forEach(d => ws.addRow(d));
    ws.addRow({ date: 'TOTAL', diff_qntl: data.total_diff_qntl, diff_kg: data.total_diff_kg });
    addExcelTitle(ws, 'Weight Discrepancy Report', 10, database);
    styleExcelHeader(ws); styleExcelData(ws, 5);

    res.setHeader('Content-Disposition', 'attachment; filename=weight_discrepancy.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const buf = await wb.xlsx.writeBuffer(); res.send(Buffer.from(buf));
  }));

  router.get('/api/reports/weight-discrepancy/pdf', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to, agent, mandi } = req.query;
    let entries = database.getEntries({ kms_year, season });
    if (date_from) entries = entries.filter(e => e.date >= date_from);
    if (date_to) entries = entries.filter(e => e.date <= date_to);
    if (agent) entries = entries.filter(e => e.agent_name === agent);
    if (mandi) entries = entries.filter(e => e.mandi_name === mandi);
    const discrepancies = []; let totalDiff = 0;
    entries.forEach(e => {
      const tpWt = parseFloat(e.tp_weight || 0) || 0;
      const qntl = parseFloat(e.qntl || 0) || 0;
      if (tpWt > 0 && qntl > 0) {
        const diff = +(tpWt - qntl).toFixed(2);
        if (Math.abs(diff) > 0) {
          discrepancies.push({ date: e.date, truck_no: e.truck_no, rst_no: e.rst_no, tp_no: e.tp_no, agent_name: e.agent_name, mandi_name: e.mandi_name, tp_weight: tpWt, qntl, diff_qntl: diff, diff_kg: Math.round(diff * 100) });
          totalDiff += diff;
        }
      }
    });
    const data = { discrepancies, total_count: discrepancies.length, total_diff_qntl: +totalDiff.toFixed(2), total_diff_kg: Math.round(totalDiff * 100) };

    const doc = createPdfDoc('landscape');
    res.setHeader('Content-Disposition', 'attachment; filename=weight_discrepancy.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    addPdfTitle(doc, 'Weight Discrepancy Report / वजन फर्क', `Discrepancies: ${data.total_count} | Total Diff: ${data.total_diff_qntl} Q (${data.total_diff_kg} KG)`, database);
    const h = ['Date','Truck','RST','TP','Agent','Mandi','TP Wt(Q)','QNTL','Diff(Q)','Diff(KG)'];
    const w = [38,40,24,24,40,60,30,30,30,30];
    const rows = data.discrepancies.map(d => [d.date, d.truck_no, d.rst_no, d.tp_no, d.agent_name, d.mandi_name, d.tp_weight.toFixed(2), d.qntl.toFixed(2), d.diff_qntl.toFixed(2), d.diff_kg]);
    drawPdfTable(doc, h, rows, w);
    addTotalsRow(doc, ['TOTAL','','','','',`${data.total_count} entries`,'','',data.total_diff_qntl.toFixed(2), data.total_diff_kg], w);
    doc.end();
  }));

  return router;
};
