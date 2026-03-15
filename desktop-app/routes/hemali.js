const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

module.exports = (database) => {
  const router = express.Router();
  const col = (name) => { if (!database.data[name]) database.data[name] = []; return database.data[name]; };

  function filterByFy(arr, ky, season) {
    return arr.filter(t => (!ky || t.kms_year === ky) && (!season || !t.season || t.season === season));
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

  // ============ HEMALI ADVANCE BALANCE ============
  function getAdvanceBalance(sardarName, kmsYear, season) {
    const payments = filterByFy(col('hemali_payments'), kmsYear, season);
    let advance = 0;
    payments.filter(p => p.sardar_name === sardarName && p.status === 'paid').forEach(p => {
      advance += (p.new_advance || 0) - (p.advance_deducted || 0);
    });
    return Math.round(advance * 100) / 100;
  }

  router.get('/api/hemali/advance', safeHandler(async (req, res) => {
    const { sardar_name, kms_year, season } = req.query;
    if (!sardar_name) return res.json({ advance: 0 });
    const advance = getAdvanceBalance(sardar_name, kms_year, season);
    res.json({ advance, sardar_name });
  }));

  // ============ HEMALI PAYMENTS ============
  router.get('/api/hemali/payments', safeHandler(async (req, res) => {
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season);
    if (from_date) payments = payments.filter(p => p.date >= from_date);
    if (to_date) payments = payments.filter(p => p.date <= to_date);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    res.json(payments.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
  }));

  router.post('/api/hemali/payments', safeHandler(async (req, res) => {
    const d = req.body;
    const sardarName = (d.sardar_name || '').trim();
    if (!sardarName) return res.status(400).json({ detail: 'Sardar name required' });
    const items = d.items || [];
    if (!items.length) return res.status(400).json({ detail: 'Items select karein' });

    const total = Math.round(items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0)), 0) * 100) / 100;
    const prevAdvance = getAdvanceBalance(sardarName, d.kms_year, d.season);
    const advanceDeducted = Math.min(prevAdvance, total);
    const amountPayable = Math.round((total - advanceDeducted) * 100) / 100;
    const amountPaid = parseFloat(d.amount_paid) || amountPayable;
    const newAdvance = Math.round(Math.max(0, amountPaid - amountPayable) * 100) / 100;

    const now = new Date().toISOString();
    const paymentId = uuidv4();
    const payment = {
      id: paymentId, sardar_name: sardarName, date: d.date || now.split('T')[0],
      items: items.map(i => ({ item_name: i.item_name, rate: parseFloat(i.rate) || 0, quantity: parseFloat(i.quantity) || 0, amount: Math.round((parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0) * 100) / 100 })),
      total, advance_before: prevAdvance, advance_deducted: advanceDeducted,
      amount_payable: amountPayable, amount_paid: amountPaid, new_advance: newAdvance,
      status: 'unpaid', kms_year: d.kms_year || '', season: d.season || '',
      created_by: d.created_by || req.query.username || '', created_at: now, updated_at: now
    };
    col('hemali_payments').push(payment);
    database.save();
    res.json(payment);
  }));

  // MARK PAID
  router.put('/api/hemali/payments/:id/mark-paid', safeHandler(async (req, res) => {
    const payments = col('hemali_payments');
    const p = payments.find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ detail: 'Payment not found' });
    if (p.status === 'paid') return res.status(400).json({ detail: 'Payment already paid' });
    const amountPaid = parseFloat(req.body.amount_paid) || p.amount_paid || p.amount_payable || 0;
    const newAdvance = Math.round(Math.max(0, amountPaid - (p.amount_payable || 0)) * 100) / 100;
    p.status = 'paid';
    p.amount_paid = amountPaid;
    p.new_advance = newAdvance;
    p.updated_at = new Date().toISOString();
    // Create cash entries
    const itemsDesc = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
    const base = { kms_year: p.kms_year || '', season: p.season || '', created_by: p.created_by || '', created_at: p.updated_at, updated_at: p.updated_at };
    col('cash_transactions').push({
      id: uuidv4(), date: p.date, account: 'cash', txn_type: 'nikasi',
      amount: amountPaid, category: 'Hemali Payment', party_type: 'Hemali',
      description: `Hemali: ${p.sardar_name} - ${itemsDesc}`,
      reference: `hemali_payment:${p.id}`, ...base
    });
    if (newAdvance > 0) {
      col('cash_transactions').push({
        id: uuidv4(), date: p.date, account: 'ledger', txn_type: 'jama',
        amount: newAdvance, category: p.sardar_name, party_type: 'Hemali',
        description: `Hemali Advance: ${p.sardar_name} (extra paid Rs.${newAdvance})`,
        reference: `hemali_advance:${p.id}`, ...base
      });
    }
    if ((p.advance_deducted || 0) > 0) {
      col('cash_transactions').push({
        id: uuidv4(), date: p.date, account: 'ledger', txn_type: 'nikasi',
        amount: p.advance_deducted, category: p.sardar_name, party_type: 'Hemali',
        description: `Hemali Advance Deducted: ${p.sardar_name} (Rs.${p.advance_deducted} adjusted)`,
        reference: `hemali_adv_deduct:${p.id}`, ...base
      });
    }
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
    // Remove linked cash_transactions
    database.data.cash_transactions = col('cash_transactions').filter(t =>
      t.reference !== `hemali_payment:${p.id}` && t.reference !== `hemali_advance:${p.id}` && t.reference !== `hemali_adv_deduct:${p.id}`
    );
    database.save();
    res.json({ message: 'Payment undone', id: p.id });
  }));

  // DELETE PAYMENT
  router.delete('/api/hemali/payments/:id', safeHandler(async (req, res) => {
    const payments = col('hemali_payments');
    const idx = payments.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Payment not found' });
    const p = payments[idx];
    database.data.cash_transactions = col('cash_transactions').filter(t =>
      t.reference !== `hemali_payment:${p.id}` && t.reference !== `hemali_advance:${p.id}` && t.reference !== `hemali_adv_deduct:${p.id}`
    );
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

  // ============ PDF EXPORT ============
  router.get('/api/hemali/export/pdf', safeHandler(async (req, res) => {
    const { addPdfHeader } = require('./pdf_helpers');
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season).filter(p => p.status === 'paid');
    if (from_date) payments = payments.filter(p => p.date >= from_date);
    if (to_date) payments = payments.filter(p => p.date <= to_date);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    payments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=hemali_payments.pdf');
    doc.pipe(res);

    addPdfHeader(doc, 'Hemali Payment Report');
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
      const vals = [idx + 1, p.date || '', p.sardar_name || '', itemsStr, p.total, p.advance_deducted, p.amount_payable, p.amount_paid, p.new_advance];
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

    doc.end();
  }));

  // ============ EXCEL EXPORT ============
  router.get('/api/hemali/export/excel', safeHandler(async (req, res) => {
    const { kms_year, season, from_date, to_date, sardar_name } = req.query;
    let payments = filterByFy(col('hemali_payments'), kms_year, season).filter(p => p.status === 'paid');
    if (from_date) payments = payments.filter(p => p.date >= from_date);
    if (to_date) payments = payments.filter(p => p.date <= to_date);
    if (sardar_name) payments = payments.filter(p => p.sardar_name === sardar_name);
    payments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hemali Payments');
    const headers = ['#', 'Date', 'Sardar', 'Items', 'Total', 'Adv Deducted', 'Payable', 'Paid', 'New Advance', 'Status'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; cell.alignment = { horizontal: 'center' }; });

    payments.forEach((p, idx) => {
      const itemsStr = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
      const row = ws.addRow([idx + 1, p.date, p.sardar_name, itemsStr, p.total, p.advance_deducted, p.amount_payable, p.amount_paid, p.new_advance, p.status]);
      if (idx % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; });
    });

    [5, 12, 16, 35, 12, 14, 12, 12, 14, 10].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=hemali_payments.xlsx');
    res.send(Buffer.from(buf));
  }));

  return router;
};
