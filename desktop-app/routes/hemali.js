const { roundAmount } = require("./safe_handler");
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { safePdfPipe, addPdfHeader, addPdfTable, registerFonts, fmtDate, fmtAmt, drawSummaryBanner, addExcelSummaryBanner, STAT_COLORS, F } = require('./pdf_helpers');
const { filterByFy, getAdvanceBalance, calcHemaliTotals, createHemaliPaymentSideEffects, markHemaliPaidSideEffects, undoHemaliPaidSideEffects, deleteHemaliPaymentSideEffects } = require('../shared/hemali-service');

module.exports = (database) => {
  const router = express.Router();
  const col = (name) => { if (!database.data[name]) database.data[name] = []; return database.data[name]; };

  function _getAdvanceBalance(sardarName, kmsYear, season) {
    const payments = filterByFy(col('hemali_payments'), kmsYear, season);
    return getAdvanceBalance(payments, sardarName);
  }

  // Generate next Receipt No. in format HEM-YYYY-NNNN (sequence per calendar year)
  function _nextReceiptNo(dateStr) {
    const year = String(dateStr || new Date().toISOString().split('T')[0]).slice(0, 4);
    const prefix = `HEM-${year}-`;
    const existing = col('hemali_payments')
      .map(p => String(p.receipt_no || ''))
      .filter(r => r.startsWith(prefix))
      .map(r => parseInt(r.slice(prefix.length), 10) || 0);
    const next = (existing.length ? Math.max(...existing) : 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
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
    database.saveImmediate();  // immediate flush — prevent cloud-sync race overwrite
    res.json(item);
  }));

  router.put('/api/hemali/items/:id', safeHandler(async (req, res) => {
    const items = col('hemali_items');
    const idx = items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    Object.assign(items[idx], req.body, { updated_at: new Date().toISOString() });
    if (req.body.rate) items[idx].rate = parseFloat(req.body.rate);
    database.saveImmediate();
    res.json(items[idx]);
  }));

  router.delete('/api/hemali/items/:id', safeHandler(async (req, res) => {
    const items = col('hemali_items');
    const idx = items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    items[idx].is_active = false;
    database.saveImmediate();
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
    const receiptNo = _nextReceiptNo(d.date);
    const payment = {
      id: paymentId, receipt_no: receiptNo, sardar_name: sardarName, date: d.date || now.split('T')[0],
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
    // Immediately create Ledger "jama" entry so unpaid Hemali liability shows in Cash Book
    createHemaliPaymentSideEffects(database, payment);
    database.saveImmediate ? database.saveImmediate() : database.save();
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
    // Sync the Ledger "jama" entry with new total (idempotent)
    createHemaliPaymentSideEffects(database, p);
    database.saveImmediate ? database.saveImmediate() : database.save();
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
      // Work is done regardless of payment status — count it always
      m.total_work += p.total || 0;
      sardars[sn].grand_total_work += p.total || 0;
      if (p.status === 'paid') {
        m.paid_payments++;
        m.total_paid += p.amount_paid || 0;
        m.advance_given += p.new_advance || 0; m.advance_deducted += p.advance_deducted || 0;
        sardars[sn].grand_total_paid += p.amount_paid || 0;
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

    // Defensive defaults — all numeric fields may be null/undefined on older records
    const total = Number(p.total) || 0;
    const advance = Number(p.advance_deducted) || 0;
    const payable = Number(p.amount_payable) || 0;
    const isPaid = p.status === 'paid';
    // For UNPAID payments, amount_paid is just a placeholder (= amount_payable). Display 0 until truly paid.
    const paid = isPaid ? (Number(p.amount_paid) || 0) : 0;
    const newAdv = isPaid ? (Number(p.new_advance) || 0) : 0;
    const items = Array.isArray(p.items) ? p.items : [];
    const balance = payable - paid;

    const doc = new PDFDocument({ size: 'A5', margin: 25 });
    registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_receipt_${String(p.id).substring(0,8)}.pdf`);

    // Branded header via addPdfHeader helper (consistent with rest of app)
    addPdfHeader(doc, '', {
      ...(database.getBranding ? database.getBranding() : {}),
      _watermark: ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark'),
    });

    // ═══════════ TITLE BANNER (dark navy) ═══════════
    const pageLeft = 25;
    const pageWidth = 350; // A5 width - 2*margin
    let y = doc.y + 2;
    doc.rect(pageLeft, y, pageWidth, 22).fill('#1a365d');
    doc.fontSize(12).fillColor('#ffffff').font(F('bold'))
       .text('HEMALI PAYMENT RECEIPT', pageLeft, y + 6, { width: pageWidth, align: 'center' });
    y += 22;

    // ═══════════ RECEIPT NO. + STATUS BANNER ═══════════
    const rcptBoxW = 200, statusBoxW = pageWidth - rcptBoxW;
    const statusBg = isPaid ? '#16a34a' : '#dc2626';
    const statusText = isPaid ? 'PAID' : 'UNPAID';

    doc.rect(pageLeft, y, rcptBoxW, 32).fill('#fef3c7');
    doc.rect(pageLeft + rcptBoxW, y, statusBoxW, 32).fill(statusBg);
    doc.fontSize(7).fillColor('#6b7280').font(F('bold'))
       .text('RECEIPT NO.', pageLeft + 10, y + 6);
    doc.fontSize(13).fillColor('#d97706').font(F('bold'))
       .text(String(p.receipt_no || '—'), pageLeft + 10, y + 15);
    doc.fontSize(15).fillColor('#ffffff').font(F('bold'))
       .text(statusText, pageLeft + rcptBoxW, y + 9, { width: statusBoxW, align: 'center' });
    y += 32 + 10;
    doc.font(F('normal'));

    // ═══════════ INFO GRID (2x2) ═══════════
    const itemsCount = items.length;
    const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const cellW = pageWidth / 2;
    const labelRowH = 14, valueRowH = 18;

    const drawCell = (x0, y0, w, h, bg) => doc.rect(x0, y0, w, h).fill(bg);
    const labelBg = '#f8fafc', valueBg = '#ffffff';

    // Row 1: labels
    drawCell(pageLeft, y, cellW, labelRowH, labelBg);
    drawCell(pageLeft + cellW, y, cellW, labelRowH, labelBg);
    doc.fontSize(7).fillColor('#6b7280').font(F('bold'))
       .text('RECEIPT DATE', pageLeft + 8, y + 4)
       .text('SARDAR NAME', pageLeft + cellW + 8, y + 4);
    y += labelRowH;
    // Row 1: values
    drawCell(pageLeft, y, cellW, valueRowH, valueBg);
    drawCell(pageLeft + cellW, y, cellW, valueRowH, valueBg);
    doc.fontSize(10).fillColor('#1a365d').font(F('bold'))
       .text(p.date ? fmtD(p.date) : '—', pageLeft + 8, y + 5)
       .text(String(p.sardar_name || '—'), pageLeft + cellW + 8, y + 5, { width: cellW - 16 });
    y += valueRowH;
    // Row 2: labels
    drawCell(pageLeft, y, cellW, labelRowH, labelBg);
    drawCell(pageLeft + cellW, y, cellW, labelRowH, labelBg);
    doc.fontSize(7).fillColor('#6b7280').font(F('bold'))
       .text('ITEMS COUNT', pageLeft + 8, y + 4)
       .text('TOTAL QUANTITY', pageLeft + cellW + 8, y + 4);
    y += labelRowH;
    // Row 2: values
    drawCell(pageLeft, y, cellW, valueRowH, valueBg);
    drawCell(pageLeft + cellW, y, cellW, valueRowH, valueBg);
    doc.fontSize(10).fillColor('#1a365d').font(F('bold'))
       .text(String(itemsCount), pageLeft + 8, y + 5)
       .text(String(Math.round(totalQty)), pageLeft + cellW + 8, y + 5);
    y += valueRowH;
    // Outer border
    doc.lineWidth(0.5).strokeColor('#cbd5e1').rect(pageLeft, y - (labelRowH + valueRowH) * 2, pageWidth, (labelRowH + valueRowH) * 2).stroke();
    doc.font(F('normal'));
    y += 12;

    // ═══════════ ITEMS TABLE ═══════════
    const colW = [140, 55, 70, 85];
    // Header (dark navy)
    doc.rect(pageLeft, y, pageWidth, 18).fill('#1a365d');
    ['ITEM', 'QTY', 'RATE', 'AMOUNT'].forEach((h, i) => {
      let x = pageLeft; for (let j = 0; j < i; j++) x += colW[j];
      doc.fontSize(8).fillColor('#ffffff').font(F('bold'))
         .text(h, x + 6, y + 5, { width: colW[i] - 12, align: i > 0 ? 'right' : 'left' });
    });
    y += 18;
    items.forEach((item, idx) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const amount = Number(item.amount) || 0;
      const row = [String(item.item_name || '-'), qty.toLocaleString(), `Rs. ${rate.toFixed(2)}`, `Rs. ${Math.round(amount).toLocaleString()}`];
      doc.rect(pageLeft, y, pageWidth, 16).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc');
      row.forEach((v, i) => {
        let x = pageLeft; for (let j = 0; j < i; j++) x += colW[j];
        doc.fontSize(9).fillColor('#334155').font(F('normal'))
           .text(v, x + 6, y + 4, { width: colW[i] - 12, align: i > 0 ? 'right' : 'left' });
      });
      y += 16;
    });
    // Outer border
    doc.lineWidth(0.3).strokeColor('#e2e8f0').rect(pageLeft, y - 18 - items.length * 16, pageWidth, 18 + items.length * 16).stroke();
    y += 14;

    // ═══════════ SUMMARY TILES (2 rows × 3 cols) ═══════════
    const tileW = pageWidth / 3, tileH = 36;

    const drawTile = (x0, y0, label, value, bgColor, valueColor, valueSize) => {
      doc.rect(x0, y0, tileW, tileH).fill(bgColor);
      doc.fontSize(6).fillColor('#6b7280').font(F('bold'))
         .text(label, x0, y0 + 4, { width: tileW, align: 'center' });
      doc.fontSize(valueSize || 11).fillColor(valueColor).font(F('bold'))
         .text(value, x0, y0 + 14, { width: tileW, align: 'center' });
    };

    // Row 1: Gross | Adv Deducted | Net Payable
    drawTile(pageLeft + 0 * tileW, y, 'GROSS AMOUNT', `Rs. ${Math.round(total).toLocaleString()}`, '#eff6ff', '#1a365d');
    drawTile(pageLeft + 1 * tileW, y, 'ADV. DEDUCTED', advance > 0 ? `- Rs. ${Math.round(advance).toLocaleString()}` : '—', '#fef2f2', advance > 0 ? '#dc2626' : '#94a3b8');
    drawTile(pageLeft + 2 * tileW, y, 'NET PAYABLE', `Rs. ${Math.round(payable).toLocaleString()}`, '#fef3c7', '#d97706', 12);
    y += tileH + 3;

    // Row 2: Paid | New Advance | Balance (only meaningful for PAID receipts)
    drawTile(pageLeft + 0 * tileW, y, 'AMOUNT PAID', `Rs. ${Math.round(paid).toLocaleString()}`, '#f0fdf4', isPaid ? '#16a34a' : '#94a3b8', 12);
    drawTile(pageLeft + 1 * tileW, y, 'NEW ADVANCE', newAdv > 0 ? `Rs. ${Math.round(newAdv).toLocaleString()}` : '—', '#fefce8', newAdv > 0 ? '#d97706' : '#94a3b8');
    const balLabel = (isPaid && balance <= 0) ? 'SETTLED' : `Rs. ${Math.round(balance).toLocaleString()}`;
    drawTile(pageLeft + 2 * tileW, y, 'BALANCE', balLabel, '#f8fafc', (isPaid && balance <= 0) ? '#16a34a' : '#dc2626');
    y += tileH;
    // Outer border for summary tiles
    doc.lineWidth(0.5).strokeColor('#cbd5e1').rect(pageLeft, y - (tileH * 2 + 3), pageWidth, tileH * 2 + 3).stroke();
    y += 24;

    // ═══════════ SIGNATURES ═══════════
    const sigW = pageWidth / 2 - 10;
    doc.moveTo(pageLeft + 10, y).lineTo(pageLeft + 10 + sigW, y).strokeColor('#6b7280').lineWidth(0.5).stroke();
    doc.moveTo(pageLeft + pageWidth / 2 + 10, y).lineTo(pageLeft + pageWidth / 2 + 10 + sigW, y).stroke();
    doc.fontSize(7).fillColor('#6b7280').font(F('normal'))
       .text('Sardar Signature', pageLeft + 10, y + 4, { width: sigW, align: 'center' })
       .text('Authorized Signature', pageLeft + pageWidth / 2 + 10, y + 4, { width: sigW, align: 'center' });
    y += 22;
    doc.fontSize(6).fillColor('#94a3b8')
       .text('This is a computer generated receipt', pageLeft, y, { width: pageWidth, align: 'center' });

    await safePdfPipe(doc, res);
  }));

  // ============ MONTHLY SUMMARY PDF ============
  router.get('/api/hemali/monthly-summary/pdf', safeHandler(async (req, res) => {
    const { kms_year, season, sardar_name, month } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    if (month) payments = payments.filter(p => (p.date || '').startsWith(month));

    // Compute per-sardar / per-month aggregates (matches Python backend exactly)
    // CRITICAL: work counted ALWAYS regardless of payment status (matches Python)
    const sardars = {};
    for (const p of payments) {
      const sn = p.sardar_name || 'Unknown';
      const mk = (p.date || '').substring(0, 7) || 'Unknown';
      if (!sardars[sn]) sardars[sn] = { sardar_name: sn, months: {}, gt_work: 0, gt_paid: 0, gt_adv_given: 0, gt_adv_ded: 0 };
      if (!sardars[sn].months[mk]) sardars[sn].months[mk] = { month: mk, paid: 0, total: 0, work: 0, paid_amt: 0, adv_given: 0, adv_ded: 0 };
      const m = sardars[sn].months[mk];
      m.total++;
      m.work += p.total || 0;
      sardars[sn].gt_work += p.total || 0;
      if (p.status === 'paid') {
        m.paid++;
        m.paid_amt += p.amount_paid || 0;
        m.adv_given += p.new_advance || 0;
        m.adv_ded += p.advance_deducted || 0;
        sardars[sn].gt_paid += p.amount_paid || 0;
        sardars[sn].gt_adv_given += p.new_advance || 0;
        sardars[sn].gt_adv_ded += p.advance_deducted || 0;
      }
    }
    const sortedSardarNames = Object.keys(sardars).sort();

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
    registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_monthly_summary.pdf`);

    // Branded header with subtitle
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    branding._watermark = ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark');
    const subtitleParts = [];
    if (kms_year) subtitleParts.push(`KMS Year: ${kms_year}`);
    if (season) subtitleParts.push(`Season: ${season.charAt(0).toUpperCase() + season.slice(1)}`);
    if (sardar_name) subtitleParts.push(`Sardar: ${sardar_name}`);
    addPdfHeader(doc, 'Hemali Monthly Summary', branding, subtitleParts.length ? subtitleParts.join('  |  ') : 'All Sardars');

    if (sortedSardarNames.length === 0) {
      doc.fontSize(11).fillColor('#94a3b8').font(F('normal'))
        .text('Koi data nahi mila is filter ke liye', { align: 'center' });
      await safePdfPipe(doc, res);
      return;
    }

    // Page width: A4 landscape (842pt) - 50pt margins = 792pt usable
    const margin = 25;
    const PAGE_W = doc.page.width - margin * 2;

    // Grand totals across all sardars
    let grandWork = 0, grandPaid = 0, grandAdvGiven = 0, grandAdvDed = 0;
    let grandPaymentsTotal = 0, grandPaymentsPaid = 0;

    for (const sn of sortedSardarNames) {
      const s = sardars[sn];
      const adv = payments
        .filter(p => p.sardar_name === sn && p.status === 'paid')
        .reduce((a, p) => a + (p.new_advance || 0) - (p.advance_deducted || 0), 0);

      // SARDAR PILL BAND (full-page-width orange band, name on left + advance on right)
      // Auto page-break if not enough space for band + at least 2 rows of table
      if (doc.y + 22 + 32 + 16 > doc.page.height - margin) doc.addPage();
      const bandY = doc.y;
      const bandH = 22;
      doc.rect(margin, bandY, PAGE_W, bandH).fill('#d97706');
      doc.fontSize(10).fillColor('#ffffff').font(F('bold'))
        .text(`SARDAR: ${sn}`, margin + 12, bandY + 6, { width: PAGE_W * 0.5, lineBreak: false });
      doc.fontSize(9).fillColor('#ffffff').font(F('bold'))
        .text(`Current Advance Balance: Rs.${adv.toFixed(2)}`, margin + PAGE_W * 0.5, bandY + 7,
          { width: PAGE_W * 0.5 - 12, align: 'right', lineBreak: false });
      doc.y = bandY + bandH + 2;

      // DATA TABLE (full PAGE_W width) — Month, Payments, Work, Paid, Adv Given, Adv Ded
      const tHeaders = ['Month', 'Payments\n(Paid/Total)', 'Total Work', 'Total Paid', 'Adv. Given', 'Adv. Deducted'];
      const tRows = [];
      const sortedMonths = Object.values(s.months).sort((a, b) => b.month.localeCompare(a.month));
      for (const m of sortedMonths) {
        tRows.push([
          m.month,
          `${m.paid}/${m.total}`,
          `Rs.${m.work.toFixed(2)}`,
          `Rs.${m.paid_amt.toFixed(2)}`,
          `Rs.${m.adv_given.toFixed(2)}`,
          `Rs.${m.adv_ded.toFixed(2)}`,
        ]);
        grandPaymentsTotal += m.total;
        grandPaymentsPaid += m.paid;
      }
      // TOTAL row (will be visually highlighted by addPdfTable's "total" detection)
      tRows.push([
        'TOTAL', '',
        `Rs.${s.gt_work.toFixed(2)}`,
        `Rs.${s.gt_paid.toFixed(2)}`,
        `Rs.${s.gt_adv_given.toFixed(2)}`,
        `Rs.${s.gt_adv_ded.toFixed(2)}`,
      ]);
      // Distribute PAGE_W proportionally: 12% / 14% / 18.5% × 4
      const cw = [0.12, 0.14, 0.185, 0.185, 0.185, 0.185].map(w => Math.floor(PAGE_W * w));
      addPdfTable(doc, tHeaders, tRows, cw, { fontSize: 7.5 });
      doc.moveDown(0.5);

      grandWork += s.gt_work;
      grandPaid += s.gt_paid;
      grandAdvGiven += s.gt_adv_given;
      grandAdvDed += s.gt_adv_ded;
    }

    // GRAND SUMMARY KPI BANNER (bottom of report) — same 7 stats as Python backend
    if (doc.y + 40 > doc.page.height - margin) doc.addPage();
    const outstanding = grandWork - grandPaid - grandAdvDed;
    const kpis = [
      { lbl: 'TOTAL SARDARS', val: String(sortedSardarNames.length), color: STAT_COLORS.primary },
      { lbl: 'PAYMENTS', val: `${grandPaymentsPaid}/${grandPaymentsTotal}`, color: STAT_COLORS.blue },
      { lbl: 'GROSS WORK', val: `Rs.${fmtAmt(grandWork)}`, color: STAT_COLORS.gold },
      { lbl: 'TOTAL PAID', val: `Rs.${fmtAmt(grandPaid)}`, color: STAT_COLORS.emerald },
      { lbl: 'ADV. GIVEN', val: `Rs.${fmtAmt(grandAdvGiven)}`, color: STAT_COLORS.orange },
      { lbl: 'ADV. DEDUCTED', val: `Rs.${fmtAmt(grandAdvDed)}`, color: STAT_COLORS.purple },
      { lbl: 'OUTSTANDING', val: `Rs.${fmtAmt(outstanding)}`, color: STAT_COLORS.red },
    ];
    drawSummaryBanner(doc, kpis, margin, doc.y + 4, PAGE_W);

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
      if (!sardars[sn]) sardars[sn] = { sardar_name: sn, months: {}, gt_work: 0, gt_paid: 0, gt_adv_given: 0, gt_adv_ded: 0 };
      if (!sardars[sn].months[mk]) sardars[sn].months[mk] = { month: mk, paid: 0, total: 0, work: 0, paid_amt: 0, adv_given: 0, adv_ded: 0 };
      const m = sardars[sn].months[mk];
      m.total++;
      m.work += p.total || 0;
      sardars[sn].gt_work += p.total || 0;
      if (p.status === 'paid') {
        m.paid++;
        m.paid_amt += p.amount_paid || 0;
        m.adv_given += p.new_advance || 0;
        m.adv_ded += p.advance_deducted || 0;
        sardars[sn].gt_paid += p.amount_paid || 0;
        sardars[sn].gt_adv_given += p.new_advance || 0;
        sardars[sn].gt_adv_ded += p.advance_deducted || 0;
      }
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Monthly Summary');
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = 'Hemali Monthly Summary';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 22;

    let r = 3;
    let grandWork = 0, grandPaid = 0, grandAdvGiven = 0, grandAdvDed = 0;
    let grandPaymentsTotal = 0, grandPaymentsPaid = 0;
    const sortedSardarNames = Object.keys(sardars).sort();

    for (const sn of sortedSardarNames) {
      const s = sardars[sn];
      const adv = payments
        .filter(p => p.sardar_name === sn && p.status === 'paid')
        .reduce((a, p) => a + (p.new_advance || 0) - (p.advance_deducted || 0), 0);

      // SARDAR pill row (full width orange band)
      ws.mergeCells(r, 1, r, 6);
      const sardarCell = ws.getCell(r, 1);
      sardarCell.value = `SARDAR: ${sn}     |     Current Advance Balance: Rs.${adv.toFixed(2)}`;
      sardarCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      sardarCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
      sardarCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws.getRow(r).height = 22;
      r++;

      // Header row (navy bg)
      const hRow = ws.addRow(['Month', 'Payments (Paid/Total)', 'Total Work', 'Total Paid', 'Adv. Given', 'Adv. Deducted']);
      hRow.eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      hRow.height = 20;
      r++;

      // Data rows
      const sortedMonths = Object.values(s.months).sort((a, b) => b.month.localeCompare(a.month));
      for (const m of sortedMonths) {
        const dr = ws.addRow([m.month, `${m.paid}/${m.total}`, m.work, m.paid_amt, m.adv_given, m.adv_ded]);
        dr.eachCell((c, ci) => {
          if (ci > 1) c.numFmt = ci === 2 ? '@' : '"Rs."#,##0.00';
          c.alignment = { horizontal: ci === 1 ? 'left' : 'right' };
        });
        grandPaymentsTotal += m.total;
        grandPaymentsPaid += m.paid;
        r++;
      }
      // TOTAL row (amber bg)
      const tRow = ws.addRow(['TOTAL', '', s.gt_work, s.gt_paid, s.gt_adv_given, s.gt_adv_ded]);
      tRow.eachCell((c, ci) => {
        c.font = { bold: true, color: { argb: 'FF92400E' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        if (ci > 1) c.numFmt = ci === 2 ? '@' : '"Rs."#,##0.00';
        c.alignment = { horizontal: ci === 1 ? 'left' : 'right' };
      });
      r++; r++; // blank row spacer

      grandWork += s.gt_work;
      grandPaid += s.gt_paid;
      grandAdvGiven += s.gt_adv_given;
      grandAdvDed += s.gt_adv_ded;
    }

    // GRAND SUMMARY BANNER (light cream + gold accent + 7 stats — matches Python + PDF)
    if (sortedSardarNames.length > 0) {
      const outstanding = grandWork - grandPaid - grandAdvDed;
      addExcelSummaryBanner(ws, r + 1, 6, [
        { lbl: 'TOTAL SARDARS', val: String(sortedSardarNames.length) },
        { lbl: 'PAYMENTS', val: `${grandPaymentsPaid}/${grandPaymentsTotal}` },
        { lbl: 'GROSS WORK', val: `Rs.${grandWork.toFixed(2)}` },
        { lbl: 'TOTAL PAID', val: `Rs.${grandPaid.toFixed(2)}` },
        { lbl: 'ADV. GIVEN', val: `Rs.${grandAdvGiven.toFixed(2)}` },
        { lbl: 'ADV. DEDUCTED', val: `Rs.${grandAdvDed.toFixed(2)}` },
        { lbl: 'OUTSTANDING', val: `Rs.${outstanding.toFixed(2)}` },
      ]);
    }

    [12, 22, 16, 16, 16, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_monthly_summary.xlsx`);
    res.send(Buffer.from(buf));
  }));

  // ============ PDF EXPORT ============
  router.get('/api/hemali/export/pdf', safeHandler(async (req, res) => {
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
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
    const headers = ['#', 'Receipt No.', 'Date', 'Sardar', 'Items', 'Total', 'Adv. Deducted', 'Payable', 'Paid', 'New Advance', 'Status'];
    const colWidths = [22, 70, 55, 65, 180, 55, 60, 55, 55, 55, 45];
    let y = doc.y;
    const startX = 25;

    // Header row
    doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 18).fill('#1e293b');
    let x = startX;
    headers.forEach((h, i) => { doc.fontSize(7).fillColor('#fff').text(h, x + 2, y + 4, { width: colWidths[i] - 4, align: i >= 5 ? 'right' : 'left' }); x += colWidths[i]; });
    y += 18;

    let grandTotal = 0, grandPaid = 0, grandPayable = 0, grandAdvDed = 0, grandNewAdv = 0;
    let paidCount = 0, unpaidCount = 0;
    payments.forEach((p, idx) => {
      if (y > 540) { doc.addPage(); y = 30; }
      const bgColor = idx % 2 === 0 ? '#f8fafc' : '#fff';
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 16).fill(bgColor);
      const itemsStr = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
      const statusTxt = p.status === 'paid' ? 'PAID' : 'UNPAID';
      const vals = [idx + 1, p.receipt_no || '-', fmtD(p.date) || '', p.sardar_name || '', itemsStr, p.total, p.advance_deducted, p.amount_payable, p.amount_paid, p.new_advance, statusTxt];
      x = startX;
      vals.forEach((v, i) => {
        let color = '#334155';
        if (i === 10) color = p.status === 'paid' ? '#16a34a' : '#dc2626';
        else if (i === 8) color = '#16a34a';
        else if (i === 10 && v > 0) color = '#d97706';
        doc.fontSize(7).fillColor(color).text(typeof v === 'number' ? v.toFixed(2) : String(v), x + 2, y + 3, { width: colWidths[i] - 4, align: i >= 5 ? 'right' : 'left' });
        x += colWidths[i];
      });
      grandTotal += p.total || 0;
      grandPayable += p.amount_payable || 0;
      grandAdvDed += p.advance_deducted || 0;
      grandNewAdv += p.new_advance || 0;
      if (p.status === 'paid') { grandPaid += p.amount_paid || 0; paidCount++; } else { unpaidCount++; }
      y += 16;
    });

    // ===== Beautiful single-line summary footer (LIGHT theme) =====
    y += 10;
    if (y > 540) { doc.addPage(); y = 30; }
    const tableW = colWidths.reduce((a, b) => a + b, 0);
    const summaryH = 30;
    // Light cream background
    doc.rect(startX, y, tableW, summaryH).fill('#FFFBEB');
    // Gold accent stripe at top + lighter gold below
    doc.rect(startX, y, tableW, 2).fill('#F59E0B');
    doc.rect(startX, y + 2, tableW, 1).fill('#FCD34D');

    const fmtRs = (n) => `Rs.${(n || 0).toFixed(2)}`;
    // LIGHT-theme color palette (darker shades visible on cream bg)
    const stats = [
      { lbl: 'TOTAL ENTRIES', val: String(payments.length), color: '#1E293B' },
      { lbl: 'PAID', val: String(paidCount), color: '#047857' },
      { lbl: 'UNPAID', val: String(unpaidCount), color: '#B91C1C' },
      { lbl: 'GROSS WORK', val: fmtRs(grandTotal), color: '#B45309' },
      { lbl: 'ADV. DEDUCTED', val: fmtRs(grandAdvDed), color: '#C2410C' },
      { lbl: 'PAYABLE', val: fmtRs(grandPayable), color: '#1D4ED8' },
      { lbl: 'TOTAL PAID', val: fmtRs(grandPaid), color: '#15803D' },
      { lbl: 'NEW ADV.', val: fmtRs(grandNewAdv), color: '#7E22CE' },
    ];

    const cellW = tableW / stats.length;
    stats.forEach((s, i) => {
      const cx = startX + i * cellW;
      // Hairline divider
      if (i > 0) doc.moveTo(cx, y + 8).lineTo(cx, y + summaryH - 4).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      // Label (slate-500 muted)
      doc.fontSize(6).fillColor('#64748B').text(s.lbl, cx + 4, y + 7, { width: cellW - 8, align: 'center', characterSpacing: 0.4 });
      // Value (vibrant darker shade)
      doc.fontSize(9).fillColor(s.color).text(s.val, cx + 4, y + 16, { width: cellW - 8, align: 'center' });
    });
    y += summaryH;

    await safePdfPipe(doc, res);
  }));

  // ============ EXCEL EXPORT ============
  router.get('/api/hemali/export/excel', safeHandler(async (req, res) => {
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
    if (from_date) payments = payments.filter(p => p.date >= from_date);
    if (to_date) payments = payments.filter(p => p.date <= to_date);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    payments.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));

    const branding = (database.getBranding && database.getBranding()) || {};
    const companyName = branding.company_name || 'NAVKAR AGRO';
    const companyAddr = branding.company_address || branding.address || '';

    const wb = new ExcelJS.Workbook();
    wb.creator = companyName;
    wb.created = new Date();
    const ws = wb.addWorksheet('Hemali Payments', { views: [{ state: 'frozen', ySplit: 6 }] });

    // ===== ROW 1: Company name banner =====
    ws.mergeCells('A1:K1');
    const c1 = ws.getCell('A1');
    c1.value = companyName;
    c1.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // ===== ROW 2: Address / location =====
    ws.mergeCells('A2:K2');
    const c2 = ws.getCell('A2');
    c2.value = companyAddr || 'Hemali Payment Report';
    c2.font = { italic: true, size: 10, color: { argb: 'FFCBD5E1' } };
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c2.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 16;

    // ===== ROW 3: Title bar =====
    ws.mergeCells('A3:K3');
    const c3 = ws.getCell('A3');
    c3.value = 'HEMALI PAYMENT REPORT';
    c3.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
    c3.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 22;

    // ===== ROW 4: Filter info =====
    ws.mergeCells('A4:K4');
    const filters = [];
    if (kms_year) filters.push(`FY: ${kms_year}`);
    if (season) filters.push(`Season: ${season}`);
    if (from_date || to_date) filters.push(`Date: ${from_date || 'start'} to ${to_date || 'today'}`);
    if (sardar_name) filters.push(`Sardar: ${sardar_name}`);
    const c4 = ws.getCell('A4');
    c4.value = filters.length ? filters.join('   |   ') : 'All payments';
    c4.font = { size: 9, color: { argb: 'FF475569' } };
    c4.alignment = { horizontal: 'center' };
    c4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    // ===== ROW 5: Generated info (right-aligned in last cells) =====
    ws.mergeCells('A5:K5');
    const c5 = ws.getCell('A5');
    c5.value = `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}    |    Total Records: ${payments.length}`;
    c5.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
    c5.alignment = { horizontal: 'center' };
    c5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    // ===== ROW 6: Table headers =====
    const headers = ['#', 'Receipt No.', 'Date', 'Sardar', 'Items', 'Total', 'Adv Deducted', 'Payable', 'Paid', 'New Advance', 'Status'];
    const headerRow = ws.addRow(headers); // becomes row 6
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FF334155' } }, bottom: { style: 'medium', color: { argb: 'FFF59E0B' } } };
    });

    // ===== Data rows =====
    let grandTotal = 0, grandPaid = 0, grandPayable = 0, grandAdvDed = 0, grandNewAdv = 0;
    let paidCount = 0, unpaidCount = 0;
    payments.forEach((p, idx) => {
      const itemsStr = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
      const isPaid = p.status === 'paid';
      const statusTxt = isPaid ? 'PAID' : 'UNPAID';
      const row = ws.addRow([idx + 1, p.receipt_no || '-', fmtD(p.date), p.sardar_name, itemsStr, p.total || 0, p.advance_deducted || 0, p.amount_payable || 0, p.amount_paid || 0, p.new_advance || 0, statusTxt]);
      row.height = 18;
      const stripeBg = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
      row.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stripeBg } };
        cell.font = { size: 10, color: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle', wrapText: false };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        if (colNum >= 6 && colNum <= 10) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
        if (colNum === 1 || colNum === 3 || colNum === 11) cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (colNum === 9) cell.font = { size: 10, color: { argb: 'FF16A34A' }, bold: true };
        if (colNum === 11) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPaid ? 'FF16A34A' : 'FFDC2626' } };
        }
      });
      grandTotal += p.total || 0;
      grandPayable += p.amount_payable || 0;
      grandAdvDed += p.advance_deducted || 0;
      grandNewAdv += p.new_advance || 0;
      if (isPaid) { grandPaid += p.amount_paid || 0; paidCount++; } else { unpaidCount++; }
    });

    // ===== Totals row =====
    const totalRow = ws.addRow(['', '', '', '', 'TOTAL', grandTotal, grandAdvDed, grandPayable, grandPaid, grandNewAdv, `${paidCount} Paid / ${unpaidCount} Unpaid`]);
    totalRow.height = 24;
    totalRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: colNum >= 6 && colNum <= 10 ? 'right' : 'center' };
      cell.border = { top: { style: 'medium', color: { argb: 'FFF59E0B' } } };
      if (colNum >= 6 && colNum <= 10) cell.numFmt = '#,##0.00';
      if (colNum === 11) cell.font = { bold: true, color: { argb: 'FFF59E0B' }, size: 10 };
    });

    // ===== Beautiful single-line summary banner (LIGHT theme - below totals) =====
    const sumRowIdx = totalRow.number + 2;
    ws.mergeCells(sumRowIdx, 1, sumRowIdx, 11);
    const sumCell = ws.getCell(sumRowIdx, 1);
    sumCell.value = `📊  Total Entries: ${payments.length}   •   Paid: ${paidCount}   •   Unpaid: ${unpaidCount}   •   Gross Work: Rs.${grandTotal.toFixed(2)}   •   Total Paid: Rs.${grandPaid.toFixed(2)}   •   Outstanding: Rs.${(grandPayable - grandPaid).toFixed(2)}`;
    sumCell.font = { bold: true, size: 11, color: { argb: 'FF1E293B' } };
    sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    sumCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sumCell.border = {
      top: { style: 'medium', color: { argb: 'FFF59E0B' } },
      bottom: { style: 'thin', color: { argb: 'FFFCD34D' } },
      left: { style: 'thin', color: { argb: 'FFFDE68A' } },
      right: { style: 'thin', color: { argb: 'FFFDE68A' } },
    };
    ws.getRow(sumRowIdx).height = 28;

    // Column widths
    [5, 14, 12, 16, 38, 13, 14, 13, 13, 13, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_payments.xlsx`);
    res.send(Buffer.from(buf));
  }));

  return router;
};
