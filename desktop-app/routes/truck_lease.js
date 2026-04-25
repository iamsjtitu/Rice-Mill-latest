const express = require('express');
const { safeSync } = require('./safe_handler');
const { v4: uuidv4 } = require('uuid');

function getMonthsBetween(startStr, endStr) {
  if (!startStr) return [];
  const start = new Date(startStr.slice(0, 7) + '-01');
  const end = endStr ? new Date(endStr.slice(0, 7) + '-01') : new Date();
  const months = [];
  const cur = new Date(start);
  while (cur <= end) {
    months.push(cur.toISOString().slice(0, 7));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

module.exports = function(database) {
  const router = express.Router();

  // ========== CRUD ==========

  router.get('/api/truck-leases', safeSync(async (req, res) => {
    let leases = database.data.truck_leases || [];
    if (req.query.kms_year) leases = leases.filter(l => l.kms_year === req.query.kms_year);
    if (req.query.season) leases = leases.filter(l => l.season === req.query.season);
    if (req.query.status) leases = leases.filter(l => l.status === req.query.status);
    res.json([...leases].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  }));

  router.post('/api/truck-leases', safeSync(async (req, res) => {
    if (!database.data.truck_leases) database.data.truck_leases = [];
    const d = req.body;
    const truckNo = (d.truck_no || '').trim().toUpperCase();
    if (!truckNo) return res.status(400).json({ detail: 'Truck number is required' });
    const rent = +(d.monthly_rent || 0);
    if (rent <= 0) return res.status(400).json({ detail: 'Monthly rent must be > 0' });
    const existing = database.data.truck_leases.find(l => l.truck_no === truckNo && l.status === 'active');
    if (existing) return res.status(400).json({ detail: `Truck ${truckNo} already has an active lease` });
    const lease = {
      id: uuidv4(), truck_no: truckNo, owner_name: (d.owner_name || '').trim(),
      monthly_rent: rent, start_date: d.start_date || '', end_date: d.end_date || '',
      advance_deposit: +(d.advance_deposit || 0), status: 'active',
      kms_year: d.kms_year || '', season: d.season || '',
      created_by: d.created_by || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    database.data.truck_leases.push(lease);
    database.save();
    res.json(lease);
  }));

  router.put('/api/truck-leases/:id', safeSync(async (req, res) => {
    const lease = (database.data.truck_leases || []).find(l => l.id === req.params.id);
    if (!lease) return res.status(404).json({ detail: 'Lease not found' });
    const d = req.body;
    if (d.truck_no !== undefined) lease.truck_no = (d.truck_no || '').trim().toUpperCase();
    if (d.owner_name !== undefined) lease.owner_name = (d.owner_name || '').trim();
    if (d.monthly_rent !== undefined) lease.monthly_rent = +(d.monthly_rent || 0);
    if (d.start_date !== undefined) lease.start_date = d.start_date;
    if (d.end_date !== undefined) lease.end_date = d.end_date;
    if (d.advance_deposit !== undefined) lease.advance_deposit = +(d.advance_deposit || 0);
    if (d.status !== undefined) lease.status = d.status;
    lease.updated_at = new Date().toISOString();
    database.save();
    res.json(lease);
  }));

  router.delete('/api/truck-leases/:id', safeSync(async (req, res) => {
    if (!database.data.truck_leases) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.truck_leases.findIndex(l => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.truck_leases.splice(idx, 1);
    database.data.truck_lease_payments = (database.data.truck_lease_payments || []).filter(p => p.lease_id !== req.params.id);
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ========== PAYMENT SUMMARY ==========

  router.get('/api/truck-leases/:id/payments', safeSync(async (req, res) => {
    const lease = (database.data.truck_leases || []).find(l => l.id === req.params.id);
    if (!lease) return res.status(404).json({ detail: 'Not found' });
    const months = getMonthsBetween(lease.start_date, lease.end_date);
    const payments = (database.data.truck_lease_payments || []).filter(p => p.lease_id === lease.id);
    const monthPaid = {};
    payments.forEach(p => { monthPaid[p.month] = (monthPaid[p.month] || 0) + (p.amount || 0); });
    let totalRent = 0, totalPaid = 0;
    const records = months.map(m => {
      const rent = lease.monthly_rent || 0;
      const paid = Math.round((monthPaid[m] || 0) * 100) / 100;
      const balance = Math.round((rent - paid) * 100) / 100;
      totalRent += rent; totalPaid += paid;
      return { month: m, rent, paid, balance: Math.max(0, balance), status: balance <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending') };
    });
    res.json({ lease, monthly_records: records, total_rent: Math.round(totalRent * 100) / 100, total_paid: Math.round(totalPaid * 100) / 100, total_balance: Math.round(Math.max(0, totalRent - totalPaid) * 100) / 100, advance_deposit: lease.advance_deposit || 0 });
  }));

  // ========== MAKE PAYMENT ==========

  router.post('/api/truck-leases/:id/pay', safeSync(async (req, res) => {
    const lease = (database.data.truck_leases || []).find(l => l.id === req.params.id);
    if (!lease) return res.status(404).json({ detail: 'Not found' });
    if (!database.data.truck_lease_payments) database.data.truck_lease_payments = [];
    const d = req.body;
    const amount = +(d.amount || 0);
    if (amount <= 0) return res.status(400).json({ detail: 'Amount must be > 0' });
    const month = d.month || new Date().toISOString().slice(0, 7);
    const account = d.account || 'cash';
    const paymentId = uuidv4();
    const payment = {
      id: paymentId, lease_id: lease.id, truck_no: lease.truck_no, owner_name: lease.owner_name || '',
      month, amount, account, bank_name: d.bank_name || '',
      payment_date: d.payment_date || new Date().toISOString().slice(0, 10),
      notes: d.notes || '', kms_year: lease.kms_year || '', season: lease.season || '',
      created_at: new Date().toISOString()
    };
    database.data.truck_lease_payments.push(payment);
    // Cash Book nikasi
    const txnId = uuidv4();
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    database.data.cash_transactions.push({
      id: txnId, date: payment.payment_date, account, txn_type: 'nikasi',
      category: `Truck Lease - ${lease.truck_no}`, party_type: 'Truck Lease',
      description: `Lease payment ${month} - ${lease.owner_name || ''}`,
      amount, reference: `lease_pay:${lease.id.slice(0, 8)}`,
      linked_payment_id: `truck_lease:${lease.id}:${month}:${paymentId}`,
      bank_name: d.bank_name || '', kms_year: lease.kms_year || '', season: lease.season || '',
      created_by: d.created_by || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    // Auto-ledger nikasi
    database.data.cash_transactions.push({
      id: uuidv4(), date: payment.payment_date, account: 'ledger', txn_type: 'nikasi',
      category: `Truck Lease - ${lease.truck_no}`, party_type: 'Truck Lease',
      description: `Lease payment ${month} - ${lease.owner_name || ''}`,
      amount, reference: `auto_ledger:${txnId.slice(0, 8)}`,
      kms_year: lease.kms_year || '', season: lease.season || '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    database.save();
    res.json({ payment, cash_txn_id: txnId, message: `Payment of Rs.${amount} recorded for ${month}` });
  }));

  // ========== HISTORY ==========

  router.get('/api/truck-leases/:id/history', safeSync(async (req, res) => {
    const payments = (database.data.truck_lease_payments || []).filter(p => p.lease_id === req.params.id);
    res.json([...payments].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  }));

  // ========== CHECK LEASED ==========

  router.get('/api/truck-leases/check/:truckNo', safeSync(async (req, res) => {
    const lease = (database.data.truck_leases || []).find(l => l.truck_no === req.params.truckNo.toUpperCase() && l.status === 'active');
    res.json({ is_leased: !!lease, lease: lease || null });
  }));

  // ========== SUMMARY (for Balance Sheet) ==========

  router.get('/api/truck-leases/summary', safeSync(async (req, res) => {
    let leases = (database.data.truck_leases || []).filter(l => l.status === 'active');
    if (req.query.kms_year) leases = leases.filter(l => l.kms_year === req.query.kms_year);
    if (req.query.season) leases = leases.filter(l => l.season === req.query.season);
    const allPayments = database.data.truck_lease_payments || [];
    let totalRent = 0, totalPaid = 0;
    const summary = leases.map(lease => {
      const months = getMonthsBetween(lease.start_date, lease.end_date);
      const rent = months.length * (lease.monthly_rent || 0);
      const paid = allPayments.filter(p => p.lease_id === lease.id).reduce((s, p) => s + (p.amount || 0), 0);
      totalRent += rent; totalPaid += paid;
      return { truck_no: lease.truck_no, owner_name: lease.owner_name || '', total_months: months.length, monthly_rent: lease.monthly_rent || 0, total_rent: Math.round(rent * 100) / 100, total_paid: Math.round(paid * 100) / 100, balance: Math.max(0, Math.round((rent - paid) * 100) / 100), advance_deposit: lease.advance_deposit || 0 };
    });
    res.json({ leases: summary, total_rent: Math.round(totalRent * 100) / 100, total_paid: Math.round(totalPaid * 100) / 100, total_balance: Math.round(Math.max(0, totalRent - totalPaid) * 100) / 100 });
  }));

  // ========== PDF EXPORT ==========

  router.get('/api/truck-leases/export/pdf', safeSync(async (req, res) => {
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHeader, addPdfTable, addTotalsRow, fmtAmt: pFmt , safePdfPipe, fmtDate} = require('./pdf_helpers');
    const branding = database.getBranding ? database.getBranding() : {};
    let leases = database.data.truck_leases || [];
    if (req.query.kms_year) leases = leases.filter(l => l.kms_year === req.query.kms_year);
    if (req.query.season) leases = leases.filter(l => l.season === req.query.season);
    const allPayments = database.data.truck_lease_payments || [];
    const doc = new PDFDocument({ size: 'A4', margin: 25, layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=truck_lease_report.pdf`);
    // PDF will be sent via safePdfPipe
    let subtitle = '';
    if (req.query.kms_year) subtitle = `Year: ${req.query.kms_year} | Season: ${req.query.season || 'All'}`;
    _addPdfHeader(doc, 'Truck Lease Report', branding, subtitle);
    const headers = ['Truck No.', 'Owner', 'Rent/Mo', 'Start', 'End', 'Advance', 'Status', 'Total Due', 'Paid', 'Balance'];
    const colW = [70, 90, 65, 65, 65, 60, 50, 70, 65, 70];
    let grandTotal = 0, grandPaid = 0;
    const rows = [];
    for (const lease of leases) {
      const months = getMonthsBetween(lease.start_date, lease.end_date);
      const totalRent = months.length * (lease.monthly_rent || 0);
      const paid = allPayments.filter(p => p.lease_id === lease.id).reduce((s, p) => s + (p.amount || 0), 0);
      const balance = Math.max(0, totalRent - paid);
      grandTotal += totalRent; grandPaid += paid;
      rows.push([lease.truck_no, lease.owner_name||'', pFmt(lease.monthly_rent||0), fmtDate(lease.start_date)||'', lease.end_date ? fmtDate(lease.end_date) : 'Ongoing', pFmt(lease.advance_deposit||0), (lease.status||'').toUpperCase(), pFmt(totalRent), pFmt(Math.round(paid)), pFmt(Math.round(balance))]);
    }
    addPdfTable(doc, headers, rows, colW);
    addTotalsRow(doc, ['', '', '', '', '', '', 'TOTAL', pFmt(grandTotal), pFmt(Math.round(grandPaid)), pFmt(Math.round(Math.max(0, grandTotal - grandPaid)))], colW);

    // Light-themed summary banner
    if (leases.length > 0) {
      const { drawSummaryBanner, STAT_COLORS, fmtInr } = require('./pdf_helpers');
      const tableW = colW.reduce((a, b) => a + b, 0);
      const active = leases.filter(l => (l.status || '').toLowerCase() === 'active').length;
      const closed = leases.length - active;
      const balance = Math.max(0, grandTotal - grandPaid);
      if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      drawSummaryBanner(doc, [
        { lbl: 'TOTAL LEASES', val: String(leases.length), color: STAT_COLORS.primary },
        { lbl: 'ACTIVE', val: String(active), color: STAT_COLORS.emerald },
        { lbl: 'CLOSED', val: String(closed), color: STAT_COLORS.orange },
        { lbl: 'TOTAL DUE', val: fmtInr(grandTotal), color: STAT_COLORS.gold },
        { lbl: 'PAID', val: fmtInr(grandPaid), color: STAT_COLORS.green },
        { lbl: 'BALANCE', val: fmtInr(balance), color: STAT_COLORS.red },
      ], doc.page.margins.left, doc.y + 6, tableW);
    }

    await safePdfPipe(doc, res);
  }));

  // ========== EXCEL EXPORT ==========

  router.get('/api/truck-leases/export/excel', safeSync(async (req, res) => {
    const ExcelJS = require('exceljs');
    const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
    const { fmtDate } = require('./pdf_helpers');
    let leases = database.data.truck_leases || [];
    if (req.query.kms_year) leases = leases.filter(l => l.kms_year === req.query.kms_year);
    if (req.query.season) leases = leases.filter(l => l.season === req.query.season);
    const allPayments = database.data.truck_lease_payments || [];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Truck Leases');
    const colCount = 11;
    let title = 'Truck Lease Report';
    if (req.query.kms_year) title += ` | KMS: ${req.query.kms_year}`;
    if (req.query.season) title += ` | ${req.query.season}`;
    addExcelTitle(ws, title, colCount, database);
    // Headers at row 4
    const hdrs = ['Truck No.', 'Owner', 'Monthly Rent', 'Start Date', 'End Date', 'Advance', 'Status', 'Total Months', 'Total Due', 'Total Paid', 'Balance'];
    hdrs.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    const hRow = ws.getRow(4);
    hRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hRow.height = 30;
    let r = 5;
    for (const lease of leases) {
      const months = getMonthsBetween(lease.start_date, lease.end_date);
      const totalRent = months.length * (lease.monthly_rent || 0);
      const paid = allPayments.filter(p => p.lease_id === lease.id).reduce((s, p) => s + (p.amount || 0), 0);
      const vals = [lease.truck_no, lease.owner_name||'', lease.monthly_rent||0, fmtDate(lease.start_date)||'', lease.end_date ? fmtDate(lease.end_date) : 'Ongoing', lease.advance_deposit||0, (lease.status||'').toUpperCase(), months.length, totalRent, Math.round(paid), Math.max(0, Math.round(totalRent - paid))];
      vals.forEach((v, i) => { ws.getCell(r, i + 1).value = v; });
      r++;
    }
    styleExcelData(ws, 5);
    [15, 18, 15, 12, 12, 12, 10, 12, 15, 15, 15].forEach((w, i) => ws.getColumn(i + 1).width = w);

    // Light-themed summary banner
    if (leases.length > 0) {
      const { addExcelSummaryBanner, fmtInr } = require('./pdf_helpers');
      let gT = 0, gP = 0;
      for (const lease of leases) {
        const months = getMonthsBetween(lease.start_date, lease.end_date);
        gT += months.length * (lease.monthly_rent || 0);
        gP += allPayments.filter(p => p.lease_id === lease.id).reduce((s, p) => s + (p.amount || 0), 0);
      }
      const active = leases.filter(l => (l.status || '').toLowerCase() === 'active').length;
      addExcelSummaryBanner(ws, r + 1, colCount, [
        { lbl: 'Total Leases', val: String(leases.length) },
        { lbl: 'Active', val: String(active) },
        { lbl: 'Closed', val: String(leases.length - active) },
        { lbl: 'Total Due', val: fmtInr(gT) },
        { lbl: 'Paid', val: fmtInr(gP) },
        { lbl: 'Balance', val: fmtInr(Math.max(0, gT - gP)) },
      ]);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_lease_report.xlsx`);
    wb.xlsx.write(res).then(() => res.end());
  }));

  return router;
};

// Re-export getMonthsBetween for use in fy_summary
module.exports.getMonthsBetween = getMonthsBetween;
