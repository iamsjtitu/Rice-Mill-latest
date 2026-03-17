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

    const total = Math.round(items.reduce((s, i) => s + ((parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0)), 0) * 100) / 100;
    const prevAdvance = getAdvanceBalance(sardarName, kmsYear, season);
    const advanceDeducted = Math.min(prevAdvance, total);
    const amountPayable = Math.round((total - advanceDeducted) * 100) / 100;
    const amountPaid = parseFloat(d.amount_paid) || amountPayable;
    const newAdvance = Math.round(Math.max(0, amountPaid - amountPayable) * 100) / 100;

    Object.assign(p, {
      sardar_name: sardarName, date: dateVal,
      items: items.map(i => ({ item_name: i.item_name, rate: parseFloat(i.rate) || 0, quantity: parseFloat(i.quantity) || 0, amount: Math.round((parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0) * 100) / 100 })),
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
    const newAdvance = Math.round(Math.max(0, amountPaid - (p.amount_payable || 0)) * 100) / 100;
    p.status = 'paid';
    p.amount_paid = amountPaid;
    p.new_advance = newAdvance;
    p.updated_at = new Date().toISOString();
    // Create cash entry (cashbook nikasi)
    const itemsDesc = (p.items || []).map(i => `${i.item_name} x${i.quantity}`).join(', ');
    const base = { kms_year: p.kms_year || '', season: p.season || '', created_by: p.created_by || '', created_at: p.updated_at, updated_at: p.updated_at };
    col('cash_transactions').push({
      id: uuidv4(), date: p.date, account: 'cash', txn_type: 'nikasi',
      amount: amountPaid, category: 'Hemali Payment', party_type: 'Hemali',
      description: `Hemali: ${p.sardar_name} - ${itemsDesc}`,
      reference: `hemali_payment:${p.id}`, ...base
    });
    // Ledger: Jama (work done)
    col('cash_transactions').push({
      id: uuidv4(), date: p.date, account: 'ledger', txn_type: 'jama',
      amount: p.total || 0, category: 'Hemali Payment', party_type: 'Hemali',
      description: `${p.sardar_name} - ${itemsDesc} | Total: Rs.${Math.round(p.total || 0)}`,
      reference: `hemali_work:${p.id}`, ...base
    });
    // Ledger: Nikasi (payment)
    let advInfo = '';
    if ((p.advance_deducted || 0) > 0) advInfo += ` | Adv Deducted: Rs.${Math.round(p.advance_deducted)}`;
    if (newAdvance > 0) advInfo += ` | New Advance: Rs.${Math.round(newAdvance)}`;
    col('cash_transactions').push({
      id: uuidv4(), date: p.date, account: 'ledger', txn_type: 'nikasi',
      amount: amountPaid, category: 'Hemali Payment', party_type: 'Hemali',
      description: `${p.sardar_name} - Paid Rs.${Math.round(amountPaid)}${advInfo}`,
      reference: `hemali_paid:${p.id}`, ...base
    });
    // Local Party: Update debit + add payment entry
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    const debitEntry = database.data.local_party_accounts.find(t => t.reference === `hemali_debit:${p.id}`);
    if (debitEntry) {
      debitEntry.amount = p.total || 0;
      debitEntry.description = `${p.sardar_name} - ${itemsDesc} | Total: Rs.${Math.round(p.total || 0)}`;
    }
    database.data.local_party_accounts.push({
      id: uuidv4(), date: p.date, party_name: 'Hemali Payment',
      txn_type: 'payment', amount: amountPaid,
      description: `${p.sardar_name} - Paid Rs.${Math.round(amountPaid)}${advInfo}`,
      reference: `hemali_paid:${p.id}`, source_type: 'hemali', ...base
    });
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
    // Remove linked cash_transactions (cash + ledger entries)
    database.data.cash_transactions = col('cash_transactions').filter(t =>
      t.reference !== `hemali_payment:${p.id}` && t.reference !== `hemali_work:${p.id}` && t.reference !== `hemali_paid:${p.id}`
    );
    // Remove local party payment entry only (keep debit)
    database.data.local_party_accounts = (database.data.local_party_accounts || []).filter(t =>
      t.reference !== `hemali_paid:${p.id}`
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
    // Remove cash + ledger entries
    database.data.cash_transactions = col('cash_transactions').filter(t =>
      t.reference !== `hemali_payment:${p.id}` && t.reference !== `hemali_work:${p.id}` && t.reference !== `hemali_paid:${p.id}`
    );
    // Remove ALL local party entries (debit + payment) on delete
    database.data.local_party_accounts = (database.data.local_party_accounts || []).filter(t =>
      t.reference !== `hemali_debit:${p.id}` && t.reference !== `hemali_paid:${p.id}`
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

  // Helper: DD-MM-YYYY
  const fmtD = (d) => { if (!d) return ''; const p = String(d).split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };

  // ============ PRINT RECEIPT ============
  router.get('/api/hemali/payments/:id/print', safeHandler(async (req, res) => {
    const p = col('hemali_payments').find(p => p.id === req.params.id);
    if (!p) return res.status(404).json({ detail: 'Payment not found' });

    const doc = new PDFDocument({ size: 'A5', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hemali_receipt_${p.id.substring(0,8)}.pdf`);
    doc.pipe(res);

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
    doc.fontSize(10).fillColor('#1a365d').font('Helvetica-Bold').text(fmtD(p.date));
    doc.moveDown(0.2);
    doc.fontSize(7).fillColor('#6b7280').font('Helvetica').text('SARDAR NAME');
    doc.fontSize(10).fillColor('#1a365d').font('Helvetica-Bold').text(p.sardar_name || '');
    doc.font('Helvetica').moveDown(0.5);

    // Items table
    let y = doc.y;
    const tw = 350, colW = [140, 55, 65, 90];
    doc.rect(25, y, tw, 16).fill('#f1f5f9');
    ['Item', 'Qty', 'Rate', 'Amount'].forEach((h, i) => {
      let x = 25; for (let j = 0; j < i; j++) x += colW[j];
      doc.fontSize(8).fillColor('#1a365d').font('Helvetica-Bold').text(h, x + 3, y + 4, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
    });
    y += 16;
    (p.items || []).forEach(item => {
      ['', item.item_name, String(Math.round(item.quantity)), `Rs. ${item.rate}`, `Rs. ${Math.round(item.amount)}`].slice(1).forEach((v, i) => {
        let x = 25; for (let j = 0; j < i; j++) x += colW[j];
        doc.fontSize(9).fillColor('#334155').font('Helvetica').text(v, x + 3, y + 3, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
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
    doc.fontSize(11).fillColor('#1a365d').font('Helvetica-Bold').text('Net Amount', 25).text(`Rs. ${Math.round(p.amount_payable || 0)}`, 25, doc.y - 14, { align: 'right', width: tw });
    doc.fontSize(9).fillColor('#16a34a').font('Helvetica').text('Amount Paid', 25).text(`Rs. ${Math.round(p.amount_paid || 0)}`, 25, doc.y - 12, { align: 'right', width: tw });
    if ((p.new_advance || 0) > 0) {
      doc.fillColor('#1a365d').text('New Advance', 25).text(`Rs. ${Math.round(p.new_advance)}`, 25, doc.y - 12, { align: 'right', width: tw });
    }
    doc.moveDown(1);

    // Status
    const status = p.status === 'paid' ? 'PAID' : 'UNPAID';
    doc.fontSize(10).fillColor(p.status === 'paid' ? '#16a34a' : '#dc2626').font('Helvetica-Bold').text(status, { align: 'center' });
    doc.font('Helvetica').moveDown(2);

    // Signature
    doc.moveTo(25, doc.y).lineTo(180, doc.y).strokeColor('#6b7280').lineWidth(0.5).stroke();
    doc.moveTo(240, doc.y).lineTo(375, doc.y).stroke();
    doc.moveDown(0.2);
    doc.fontSize(7).fillColor('#6b7280').text('Sardar Signature', 25, doc.y, { width: 155 });
    doc.text('Authorized Signature', 240, doc.y - 9, { width: 135, align: 'right' });
    doc.moveDown(1);
    doc.fontSize(6).fillColor('#6b7280').text('This is a computer generated receipt', { align: 'center' });

    doc.end();
  }));

  // ============ MONTHLY SUMMARY PDF ============
  router.get('/api/hemali/monthly-summary/pdf', safeHandler(async (req, res) => {
    const { addPdfHeader } = require('./pdf_helpers');
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=hemali_monthly_summary.pdf');
    doc.pipe(res);
    addPdfHeader(doc, 'Hemali Monthly Summary');

    for (const sn of Object.keys(sardars).sort()) {
      const s = sardars[sn];
      const adv = payments.filter(p => p.sardar_name === sn && p.status === 'paid').reduce((a, p) => a + (p.new_advance || 0) - (p.advance_deducted || 0), 0);
      doc.fontSize(10).fillColor('#d97706').font('Helvetica-Bold').text(`Sardar: ${sn}  |  Current Advance: Rs.${adv.toFixed(2)}`);
      doc.font('Helvetica').moveDown(0.3);

      let y = doc.y;
      const colW = [80, 60, 90, 90, 90, 90];
      doc.rect(25, y, colW.reduce((a, b) => a + b, 0), 16).fill('#1e293b');
      ['Month', 'Payments', 'Total Work', 'Total Paid', 'Adv Given', 'Adv Deducted'].forEach((h, i) => {
        let x = 25; for (let j = 0; j < i; j++) x += colW[j];
        doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold').text(h, x + 3, y + 4, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
      });
      y += 16;
      Object.values(s.months).sort((a, b) => b.month.localeCompare(a.month)).forEach(m => {
        const vals = [m.month, `${m.paid}/${m.total}`, `Rs.${m.work.toFixed(2)}`, `Rs.${m.paid_amt.toFixed(2)}`, `Rs.${m.adv_given.toFixed(2)}`, `Rs.${m.adv_ded.toFixed(2)}`];
        vals.forEach((v, i) => {
          let x = 25; for (let j = 0; j < i; j++) x += colW[j];
          doc.fontSize(8).fillColor('#334155').font('Helvetica').text(v, x + 3, y + 3, { width: colW[i] - 6, align: i > 0 ? 'right' : 'left' });
        });
        y += 16;
      });
      doc.y = y + 10;
    }
    doc.end();
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
    res.setHeader('Content-Disposition', 'attachment; filename=hemali_monthly_summary.xlsx');
    res.send(Buffer.from(buf));
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
      const row = ws.addRow([idx + 1, fmtD(p.date), p.sardar_name, itemsStr, p.total, p.advance_deducted, p.amount_payable, p.amount_paid, p.new_advance, p.status]);
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
