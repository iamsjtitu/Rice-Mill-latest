const { roundAmount } = require("./safe_handler");
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { safePdfPipe, addPdfHeader, registerFonts, fmtDate } = require('./pdf_helpers');
const { filterByFy, getAdvanceBalance, calcHemaliTotals, markHemaliPaidSideEffects, undoHemaliPaidSideEffects, deleteHemaliPaymentSideEffects } = require('../shared/hemali-service');

module.exports = (database) => {
  const router = express.Router();
  const col = (name) => { if (!database.data[name]) database.data[name] = []; return database.data[name]; };

  function _getAdvanceBalance(sardarName, kmsYear, season) {
    const payments = filterByFy(col('hemali_payments'), kmsYear, season);
    return getAdvanceBalance(payments, sardarName);
  }

  // ============ HEMALI ITEMS (Rate Config) ============
  router.get('/api/hemali/items', safeHandler(async (req, res) => {
    res.json(col('hemali_items').filter(i => i.is_active !== false));
  }));

  router.post('/api/hemali/items', safeHandler(async (req, res) => {
    const d = req.body;
    if (!d.name || !d.rate) return res.status(400).json({ detail: 'Name aur rate required' });
    const item = { id: uuidv4(), name: d.name.trim(), rate: parseFloat(d.rate) || 0, unit: d.unit || 'bag', is_active: true, created_at: new Date().toISOString() };
    col('hemali_items').push(item);
    database.save();
    res.json(item);
  }));

  router.put('/api/hemali/items/:id', safeHandler(async (req, res) => {
    const items = col('hemali_items');
    const idx = items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    Object.assign(items[idx], req.body, { updated_at: new Date().toISOString() });
    if (req.body.rate) items[idx].rate = parseFloat(req.body.rate);
    database.save();
    res.json(items[idx]);
  }));

  router.delete('/api/hemali/items/:id', safeHandler(async (req, res) => {
    const items = col('hemali_items');
    const idx = items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    items[idx].is_active = false;
    database.save();
    res.json({ message: 'Item deactivated' });
  }));

  // ============ HEMALI ADVANCE BALANCE (uses shared service) ============
  router.get('/api/hemali/advance', safeHandler(async (req, res) => {
    const { sardar_name, kms_year, season } = req.query;
    if (!sardar_name) return res.json({ advance: 0 });
    const advance = _getAdvanceBalance(sardar_name, kms_year, season);
    res.json({ advance, sardar_name });
  }));

  // ============ HEMALI PAYMENTS ============
  router.get('/api/hemali/payments', safeHandler(async (req, res) => {
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
    if (from_date) payments = payments.filter(p => p.date >= from_date);
    if (to_date) payments = payments.filter(p => p.date <= to_date);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    res.json(payments.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10))));
  }));

  router.post('/api/hemali/payments', safeHandler(async (req, res) => {
    const d = req.body;
    const sardarName = (d.sardar_name || '').trim();
    if (!sardarName) return res.status(400).json({ detail: 'Sardar name required' });
    const items = d.items || [];
    if (!items.length) return res.status(400).json({ detail: 'Items select karein' });

    const { total, prevAdvance, advanceDeducted, amountPayable } = calcHemaliTotals(items, sardarName, d.kms_year, d.season, col('hemali_payments'));
    const amountPaid = parseFloat(d.amount_paid) || amountPayable;
    const newAdvance = Math.round(Math.max(0, amountPaid - amountPayable) * 100) / 100;

    const now = new Date().toISOString();
    const paymentId = uuidv4();
    const payment = {
      id: paymentId, sardar_name: sardarName, date: d.date || now.split('T')[0],
      items: items.map(i => ({ item_name: i.item_name, rate: parseFloat(i.rate) || 0, quantity: parseFloat(i.quantity) || 0, amount: roundAmount((parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0)) })),
      total, advance_before: prevAdvance, advance_deducted: advanceDeducted,
      amount_payable: amountPayable, amount_paid: amountPaid, new_advance: newAdvance,
      status: 'unpaid', kms_year: d.kms_year || '', season: d.season || '',
      created_by: d.created_by || req.query.username || '', created_at: now, updated_at: now
    };
    col('hemali_payments').push(payment);
    // Create local_party_accounts debit entry on creation (so party is visible)
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    const itemsDesc = items.map(i => `${i.item_name} x${parseFloat(i.quantity) || 0}`).join(', ');
    database.data.local_party_accounts.push({
      id: uuidv4(), date: payment.date, party_name: 'Hemali Payment',
      txn_type: 'debit', amount: total,
      description: `${sardarName} - ${itemsDesc} | Total: Rs.${Math.round(total)}`,
      reference: `hemali_debit:${paymentId}`, source_type: 'hemali',
      kms_year: d.kms_year || '', season: d.season || '',
      created_by: d.created_by || '', created_at: now
    });
    database.save();
    res.json(payment);
  }));

  // EDIT PAYMENT (unpaid only)
  router.put('/api/hemali/payments/:id', safeHandler(async (req, res) => {
    const payments = col('hemali_payments');
    const p = payments.find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ detail: 'Payment not found' });
    if (p.status === 'paid') return res.status(400).json({ detail: 'Paid payment edit nahi ho sakti. Pehle undo karein.' });

    const d = req.body;
    const sardarName = (d.sardar_name || p.sardar_name || '').trim();
    const items = d.items || p.items || [];
    const dateVal = d.date || p.date || '';
    const kmsYear = d.kms_year || p.kms_year || '';
    const season = d.season || p.season || '';

    const { total, prevAdvance, advanceDeducted, amountPayable } = calcHemaliTotals(items, sardarName, kmsYear, season, col('hemali_payments'));
    const amountPaid = parseFloat(d.amount_paid) || amountPayable;
    const newAdvance = Math.round(Math.max(0, amountPaid - amountPayable) * 100) / 100;

    Object.assign(p, {
      sardar_name: sardarName, date: dateVal,
      items: items.map(i => ({ item_name: i.item_name, rate: parseFloat(i.rate) || 0, quantity: parseFloat(i.quantity) || 0, amount: roundAmount((parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0)) })),
      total, advance_before: prevAdvance, advance_deducted: advanceDeducted,
      amount_payable: amountPayable, amount_paid: amountPaid, new_advance: newAdvance,
      updated_at: new Date().toISOString()
    });
    database.save();
    res.json(p);
  }));

  // MARK PAID
  router.put('/api/hemali/payments/:id/mark-paid', safeHandler(async (req, res) => {
    const payments = col('hemali_payments');
    const p = payments.find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ detail: 'Payment not found' });
    if (p.status === 'paid') return res.status(400).json({ detail: 'Payment already paid' });
    const amountPaid = parseFloat(req.body.amount_paid) || p.amount_paid || p.amount_payable || 0;
    const roundOff = parseFloat(req.body.round_off) || 0;
    const newAdvance = Math.round(Math.max(0, amountPaid - (p.amount_payable || 0)) * 100) / 100;
    p.status = 'paid';
    p.amount_paid = amountPaid;
    p.new_advance = newAdvance;
    p.updated_at = new Date().toISOString();
    markHemaliPaidSideEffects(database, p, amountPaid, roundOff);
    database.save();
    res.json({ message: 'Payment marked as paid', id: p.id, amount_paid: amountPaid, new_advance: newAdvance });
  }));

  // UNDO PAYMENT
  router.put('/api/hemali/payments/:id/undo', safeHandler(async (req, res) => {
    const payments = col('hemali_payments');
    const p = payments.find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ detail: 'Payment not found' });
    if (p.status !== 'paid') return res.status(400).json({ detail: 'Payment already undone' });
    p.status = 'unpaid';
    p.updated_at = new Date().toISOString();
    undoHemaliPaidSideEffects(database, p.id);
    database.save();
    res.json({ message: 'Payment undone', id: p.id });
  }));

  // DELETE PAYMENT
  router.delete('/api/hemali/payments/:id', safeHandler(async (req, res) => {
    const payments = col('hemali_payments');
    const idx = payments.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Payment not found' });
    deleteHemaliPaymentSideEffects(database, payments[idx].id);
    payments.splice(idx, 1);
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ============ SARDAR LIST ============
  router.get('/api/hemali/sardars', safeHandler(async (req, res) => {
    const names = [...new Set(col('hemali_payments').map(p => p.sardar_name).filter(Boolean))];
    res.json(names.sort());
  }));

  // ============ MONTHLY SUMMARY ============
  router.get('/api/hemali/monthly-summary', safeHandler(async (req, res) => {
    const { kms_year, season, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);

    const sardars = {};
    for (const p of payments) {
      const sn = p.sardar_name || 'Unknown';
      const monthKey = (p.date || '').substring(0, 7) || 'Unknown';
      if (!sardars[sn]) sardars[sn] = { sardar_name: sn, months: {}, grand_total_work: 0, grand_total_paid: 0, grand_total_advance_given: 0, grand_total_advance_deducted: 0 };
      if (!sardars[sn].months[monthKey]) sardars[sn].months[monthKey] = { month: monthKey, total_payments: 0, paid_payments: 0, unpaid_payments: 0, total_work: 0, total_paid: 0, advance_given: 0, advance_deducted: 0, items_breakdown: {} };
      const m = sardars[sn].months[monthKey];
      m.total_payments++;
      if (p.status === 'paid') {
        m.paid_payments++;
        m.total_work += p.total || 0; m.total_paid += p.amount_paid || 0;
        m.advance_given += p.new_advance || 0; m.advance_deducted += p.advance_deducted || 0;
        sardars[sn].grand_total_work += p.total || 0; sardars[sn].grand_total_paid += p.amount_paid || 0;
        sardars[sn].grand_total_advance_given += p.new_advance || 0; sardars[sn].grand_total_advance_deducted += p.advance_deducted || 0;
      } else { m.unpaid_payments++; }
      for (const item of (p.items || [])) {
        const iname = item.item_name || '';
        if (!m.items_breakdown[iname]) m.items_breakdown[iname] = { quantity: 0, amount: 0 };
        m.items_breakdown[iname].quantity += item.quantity || 0;
        m.items_breakdown[iname].amount += item.amount || 0;
      }
    }
    const result = Object.values(sardars).sort((a, b) => a.sardar_name.localeCompare(b.sardar_name)).map(s => {
      const currentAdvance = payments.filter(p => p.sardar_name === s.sardar_name && p.status === 'paid')
        .reduce((acc, p) => acc + (p.new_advance || 0) - (p.advance_deducted || 0), 0);
      return { ...s, months: Object.values(s.months).sort((a, b) => b.month.localeCompare(a.month)),
        grand_total_work: Math.round(s.grand_total_work * 100) / 100, grand_total_paid: Math.round(s.grand_total_paid * 100) / 100,
        current_advance_balance: Math.round(currentAdvance * 100) / 100 };
    });
    res.json(result);
  }));

  // Helper: DD-MM-YYYY
  const fmtD = (d) => { if (!d) return ''; const p = String(d).split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };

  // ============ PRINT RECEIPT ============
  router.get('/api/hemali/payments/:id/print', safeHandler(async (req, res) => {
    const p = col('hemali_payments').find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ detail: 'Payment not found' });

    const doc = new PDFDocument({ size: 'A5', margin: 25 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_receipt_${p.id.substring(0,8)}.pdf`);
    // PDF will be sent via safePdfPipe

    // Header
    doc.fontSize(18).fillColor('#d97706').text('NAVKAR AGRO', { align: 'center' });
    doc.fontSize(8).fillColor('#6b7280').text('JOLKO, KESINGA - Mill Entry System', { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(25, doc.y).lineTo(395, doc.y).strokeColor('#d97706').lineWidth(1.5).stroke();
    doc.moveDown(0.5);

    doc.fontSize(13).fillColor('#1a365d').text('HEMALI PAYMENT RECEIPT', { align: 'center' });
    doc.moveDown(0.5);

    // Info
    doc.fontSize(7).fillColor('#6b7280').text('RECEIPT DATE');
    doc.fontSize(10).fillColor('#1a365d').font(F('bold')).text(fmtD(p.date));
    doc.moveDown(0.2);
    doc.fontSize(7).fillColor('#6b7280').font(F('normal')).text('SARDAR NAME');
    doc.fontSize(10).fillColor('#1a365d').font(F('bold')).text(p.sardar_name || '');
    doc.font(F('normal')).moveDown(0.5);

    // Items table
    let y = doc.y;
    const tw = 350, colW = [140, 55, 65, 90];
    doc.rect(25, y, tw, 16).fill('#f1f5f9');
    ['Item', 'Qty', 'Rate', 'Amount'].forEach((h, i) => {
      let x = 25; for (let j = 0; j < i; j++) x += colW[j];
      doc.fontSize(8).fillColor('#1a365d').font(F('bold')).text(h, x + 3, y + 4, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
    });
    y += 16;
    (p.items || []).forEach(item => {
      ['', item.item_name, String(Math.round(item.quantity)), `Rs. ${item.rate}`, `Rs. ${Math.round(item.amount)}`].slice(1).forEach((v, i) => {
        let x = 25; for (let j = 0; j < i; j++) x += colW[j];
        doc.fontSize(9).fillColor('#334155').font(F('normal')).text(v, x + 3, y + 3, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
      });
      y += 16;
    });
    doc.y = y + 8;

    // Calculation
    doc.fontSize(9).fillColor('#1a365d').text(`Gross Amount`, 25).text(`Rs. ${Math.round(p.total || 0)}`, 25, doc.y - 12, { align: 'right', width: tw });
    if ((p.advance_deducted || 0) > 0) {
      doc.fillColor('#dc2626').text('Advance Deducted', 25).text(`- Rs. ${Math.round(p.advance_deducted)}`, 25, doc.y - 12, { align: 'right', width: tw });
    }
    doc.moveDown(0.3);
    doc.moveTo(25, doc.y).lineTo(375, doc.y).strokeColor('#d97706').lineWidth(1).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#1a365d').font(F('bold')).text('Net Amount', 25).text(`Rs. ${Math.round(p.amount_payable || 0)}`, 25, doc.y - 14, { align: 'right', width: tw });
    doc.fontSize(9).fillColor('#16a34a').font(F('normal')).text('Amount Paid', 25).text(`Rs. ${Math.round(p.amount_paid || 0)}`, 25, doc.y - 12, { align: 'right', width: tw });
    if ((p.new_advance || 0) > 0) {
      doc.fillColor('#1a365d').text('New Advance', 25).text(`Rs. ${Math.round(p.new_advance)}`, 25, doc.y - 12, { align: 'right', width: tw });
    }
    doc.moveDown(1);

    // Status
    const status = p.status === 'paid' ? 'PAID' : 'UNPAID';
    doc.fontSize(10).fillColor(p.status === 'paid' ? '#16a34a' : '#dc2626').font(F('bold')).text(status, { align: 'center' });
    doc.font(F('normal')).moveDown(2);

    // Signature
    doc.moveTo(25, doc.y).lineTo(180, doc.y).strokeColor('#6b7280').lineWidth(0.5).stroke();
    doc.moveTo(240, doc.y).lineTo(375, doc.y).stroke();
    doc.moveDown(0.2);
    doc.fontSize(7).fillColor('#6b7280').text('Sardar Signature', 25, doc.y, { width: 155 });
    doc.text('Authorized Signature', 240, doc.y - 9, { width: 135, align: 'right' });
    doc.moveDown(1);
    doc.fontSize(6).fillColor('#6b7280').text('This is a computer generated receipt', { align: 'center' });

    await safePdfPipe(doc, res);
  }));

  // ============ MONTHLY SUMMARY PDF ============
  router.get('/api/hemali/monthly-summary/pdf', safeHandler(async (req, res) => {
    const { kms_year, season, sardar_name, month } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    if (month) payments = payments.filter(p => (p.date || '').startsWith(month));

    // Build summary (same logic as monthly-summary endpoint)
    const sardars = {};
    for (const p of payments) {
      const sn = p.sardar_name || 'Unknown';
      const mk = (p.date || '').substring(0, 7) || 'Unknown';
      if (!sardars[sn]) sardars[sn] = { sardar_name: sn, months: {}, gt_work: 0, gt_paid: 0 };
      if (!sardars[sn].months[mk]) sardars[sn].months[mk] = { month: mk, paid: 0, total: 0, work: 0, paid_amt: 0, adv_given: 0, adv_ded: 0 };
      const m = sardars[sn].months[mk];
      m.total++;
      if (p.status === 'paid') {
        m.paid++; m.work += p.total || 0; m.paid_amt += p.amount_paid || 0;
        m.adv_given += p.new_advance || 0; m.adv_ded += p.advance_deducted || 0;
        sardars[sn].gt_work += p.total || 0; sardars[sn].gt_paid += p.amount_paid || 0;
      }
    }

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_monthly_summary.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'Hemali Monthly Summary', { ...(database.getBranding ? database.getBranding() : {}), _watermark: ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark') });

    for (const sn of Object.keys(sardars).sort()) {
      const s = sardars[sn];
      const adv = payments.filter(p => p.sardar_name === sn && p.status === 'paid').reduce((a, p) => a + (p.new_advance || 0) - (p.advance_deducted || 0), 0);
      doc.fontSize(10).fillColor('#d97706').font(F('bold')).text(`Sardar: ${sn}  |  Current Advance: Rs.${adv.toFixed(2)}`);
      doc.font(F('normal')).moveDown(0.3);

      let y = doc.y;
      const colW = [80, 60, 90, 90, 90, 90];
      doc.rect(25, y, colW.reduce((a, b) => a + b, 0), 16).fill('#1e293b');
      ['Month', 'Payments', 'Total Work', 'Total Paid', 'Adv Given', 'Adv Deducted'].forEach((h, i) => {
        let x = 25; for (let j = 0; j < i; j++) x += colW[j];
        doc.fontSize(8).fillColor('#fff').font(F('bold')).text(h, x + 3, y + 4, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
      });
      y += 16;
      Object.values(s.months).sort((a, b) => b.month.localeCompare(a.month)).forEach(m => {
        const vals = [m.month, `${m.paid}/${m.total}`, `Rs.${m.work.toFixed(2)}`, `Rs.${m.paid_amt.toFixed(2)}`, `Rs.${m.adv_given.toFixed(2)}`, `Rs.${m.adv_ded.toFixed(2)}`];
        vals.forEach((v, i) => {
          let x = 25; for (let j = 0; j < i; j++) x += colW[j];
          doc.fontSize(8).fillColor('#334155').font(F('normal')).text(v, x + 3, y + 3, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
        });
        y += 16;
      });
      doc.y = y + 10;
    }
    await safePdfPipe(doc, res);
  }));

  // ============ MONTHLY SUMMARY EXCEL ============
  router.get('/api/hemali/monthly-summary/excel', safeHandler(async (req, res) => {
    const { kms_year, season, sardar_name, month } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    if (month) payments = payments.filter(p => (p.date || '').startsWith(month));

    const sardars = {};
    for (const p of payments) {
      const sn = p.sardar_name || 'Unknown';
      const mk = (p.date || '').substring(0, 7) || 'Unknown';
      if (!sardars[sn]) sardars[sn] = { sardar_name: sn, months: {} };
      if (!sardars[sn].months[mk]) sardars[sn].months[mk] = { month: mk, paid: 0, total: 0, work: 0, paid_amt: 0, adv_given: 0, adv_ded: 0 };
      const m = sardars[sn].months[mk];
      m.total++;
      if (p.status === 'paid') { m.paid++; m.work += p.total || 0; m.paid_amt += p.amount_paid || 0; m.adv_given += p.new_advance || 0; m.adv_ded += p.advance_deducted || 0; }
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Monthly Summary');
    ws.mergeCells('A1:F1'); ws.getCell('A1').value = 'Hemali Monthly Summary'; ws.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
    let r = 3;
    for (const sn of Object.keys(sardars).sort()) {
      const s = sardars[sn];
      const adv = payments.filter(p => p.sardar_name === sn && p.status === 'paid').reduce((a, p) => a + (p.new_advance || 0) - (p.advance_deducted || 0), 0);
      ws.getCell(`A${r}`).value = `Sardar: ${sn}`; ws.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: 'FFD97706' } };
      ws.getCell(`E${r}`).value = `Advance: Rs.${adv.toFixed(2)}`; ws.getCell(`E${r}`).font = { bold: true };
      r++;
      const hRow = ws.addRow(['Month', 'Payments', 'Total Work', 'Total Paid', 'Adv Given', 'Adv Deducted']);
      r++;
      hRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; });
      Object.values(s.months).sort((a, b) => b.month.localeCompare(a.month)).forEach(m => {
        ws.addRow([m.month, `${m.paid}/${m.total}`, m.work, m.paid_amt, m.adv_given, m.adv_ded]);
        r++;
      });
      r += 2;
    }
    [12, 10, 14, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_monthly_summary.xlsx`);
    res.send(Buffer.from(buf));
  }));

  // ============ PDF EXPORT ============
  router.get('/api/hemali/export/pdf', safeHandler(async (req, res) => {
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season).filter(p => p.status === 'paid');
    if (from_date) payments = payments.filter(p => p.date >= from_date);
    if (to_date) payments = payments.filter(p => p.date <= to_date);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    payments.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_payments.pdf`);
    // PDF will be sent via safePdfPipe

    addPdfHeader(doc, 'Hemali Payment Report', { ...(database.getBranding ? database.getBranding() : {}), _watermark: ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark') });
    const meta = [];
    if (kms_year) meta.push(`FY: ${kms_year}`);
    if (from_date || to_date) meta.push(`${from_date || ''} to ${to_date || ''}`);
    if (sardar_name) meta.push(`Sardar: ${sardar_name}`);
    if (meta.length) { doc.fontSize(8).fillColor('#666').text(meta.join(' | '), { align: 'center' }); doc.moveDown(0.5); }

    // Table
    const headers = ['#', 'Date', 'Sardar', 'Items', 'Total', 'Adv. Deducted', 'Payable', 'Paid', 'New Advance'];
    const colWidths = [25, 60, 70, 230, 55, 65, 55, 55, 60];
    let y = doc.y;
    const startX = 25;

    // Header row
    doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 18).fill('#1e293b');
    let x = startX;
    headers.forEach((h, i) => { doc.fontSize(7).fillColor('#fff').text(h, x + 2, y + 4, { width: colWidths[i] - 4, align: i >= 4 ? 'right' : 'left' }); x += colWidths[i]; });
    y += 18;

    let grandTotal = 0, grandPaid = 0;
    payments.forEach((p, idx) => {
      if (y > 540) { doc.addPage(); y = 30; }
      const bgColor = idx % 2 === 0 ? '#f8fafc' : '#fff';
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 16).fill(bgColor);
      const itemsStr = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
      const vals = [idx + 1, fmtD(p.date) || '', p.sardar_name || '', itemsStr, p.total, p.advance_deducted, p.amount_payable, p.amount_paid, p.new_advance];
      x = startX;
      vals.forEach((v, i) => {
        const color = i === 7 ? '#dc2626' : i === 8 && v > 0 ? '#d97706' : '#334155';
        doc.fontSize(7).fillColor(color).text(typeof v === 'number' ? v.toFixed(2) : String(v), x + 2, y + 3, { width: colWidths[i] - 4, align: i >= 4 ? 'right' : 'left' });
        x += colWidths[i];
      });
      grandTotal += p.total || 0; grandPaid += p.amount_paid || 0;
      y += 16;
    });

    // Summary
    y += 10;
    doc.rect(startX, y, 300, 30).fill('#f1f5f9').stroke('#cbd5e1');
    doc.fontSize(9).fillColor('#1e293b').text(`Total Payments: ${payments.length}`, startX + 8, y + 4);
    doc.text(`Grand Total: Rs.${grandTotal.toFixed(2)}  |  Total Paid: Rs.${grandPaid.toFixed(2)}`, startX + 8, y + 16);

    await safePdfPipe(doc, res);
  }));

  // ============ EXCEL EXPORT ============
  router.get('/api/hemali/export/excel', safeHandler(async (req, res) => {
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season).filter(p => p.status === 'paid');
    if (from_date) payments = payments.filter(p => p.date >= from_date);
    if (to_date) payments = payments.filter(p => p.date <= to_date);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    payments.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hemali Payments');
    const headers = ['#', 'Date', 'Sardar', 'Items', 'Total', 'Adv Deducted', 'Payable', 'Paid', 'New Advance', 'Status'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; cell.alignment = { horizontal: 'center' }; });

    payments.forEach((p, idx) => {
      const itemsStr = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
      const row = ws.addRow([idx + 1, fmtD(p.date), p.sardar_name, itemsStr, p.total, p.advance_deducted, p.amount_payable, p.amount_paid, p.new_advance, p.status]);
      if (idx % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; });
    });

    [5, 12, 16, 35, 12, 14, 12, 12, 14, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_payments.xlsx`);
    res.send(Buffer.from(buf));
  }));

  return router;
};
