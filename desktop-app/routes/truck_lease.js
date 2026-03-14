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

  router.get('/api/truck-leases', safeSync((req, res) => {
    let leases = database.data.truck_leases || [];
    if (req.query.kms_year) leases = leases.filter(l => l.kms_year === req.query.kms_year);
    if (req.query.season) leases = leases.filter(l => l.season === req.query.season);
    if (req.query.status) leases = leases.filter(l => l.status === req.query.status);
    res.json([...leases].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  }));

  router.post('/api/truck-leases', safeSync((req, res) => {
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

  router.put('/api/truck-leases/:id', safeSync((req, res) => {
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

  router.delete('/api/truck-leases/:id', safeSync((req, res) => {
    if (!database.data.truck_leases) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.truck_leases.findIndex(l => l.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    database.data.truck_leases.splice(idx, 1);
    database.data.truck_lease_payments = (database.data.truck_lease_payments || []).filter(p => p.lease_id !== req.params.id);
    database.save();
    res.json({ message: 'Deleted', id: req.params.id });
  }));

  // ========== PAYMENT SUMMARY ==========

  router.get('/api/truck-leases/:id/payments', safeSync((req, res) => {
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

  router.post('/api/truck-leases/:id/pay', safeSync((req, res) => {
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

  router.get('/api/truck-leases/:id/history', safeSync((req, res) => {
    const payments = (database.data.truck_lease_payments || []).filter(p => p.lease_id === req.params.id);
    res.json([...payments].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  }));

  // ========== CHECK LEASED ==========

  router.get('/api/truck-leases/check/:truckNo', safeSync((req, res) => {
    const lease = (database.data.truck_leases || []).find(l => l.truck_no === req.params.truckNo.toUpperCase() && l.status === 'active');
    res.json({ is_leased: !!lease, lease: lease || null });
  }));

  // ========== SUMMARY (for Balance Sheet) ==========

  router.get('/api/truck-leases/summary', safeSync((req, res) => {
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

  router.get('/api/truck-leases/export/pdf', safeSync((req, res) => {
    const PDFDocument = require('pdfkit');
    let leases = database.data.truck_leases || [];
    if (req.query.kms_year) leases = leases.filter(l => l.kms_year === req.query.kms_year);
    if (req.query.season) leases = leases.filter(l => l.season === req.query.season);
    const allPayments = database.data.truck_lease_payments || [];
    const doc = new PDFDocument({ size: 'A4', margin: 30, layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=truck_lease_report.pdf');
    doc.pipe(res);
    doc.fontSize(16).text('Truck Lease Report', { align: 'center' });
    if (req.query.kms_year) doc.fontSize(10).text(`Year: ${req.query.kms_year} | Season: ${req.query.season || 'All'}`, { align: 'center' });
    doc.moveDown();
    const headers = ['Truck No.', 'Owner', 'Rent/Mo', 'Start', 'End', 'Advance', 'Status', 'Total Due', 'Paid', 'Balance'];
    const colW = [70, 90, 65, 65, 65, 60, 50, 70, 65, 70];
    let y = doc.y; let x = 30;
    doc.fontSize(8).fillColor('#1e293b');
    headers.forEach((h, i) => { doc.text(h, x, y, { width: colW[i], align: 'center' }); x += colW[i]; });
    y += 15; doc.moveTo(30, y).lineTo(700, y).stroke();
    doc.fillColor('black');
    let grandTotal = 0, grandPaid = 0;
    for (const lease of leases) {
      const months = getMonthsBetween(lease.start_date, lease.end_date);
      const totalRent = months.length * (lease.monthly_rent || 0);
      const paid = allPayments.filter(p => p.lease_id === lease.id).reduce((s, p) => s + (p.amount || 0), 0);
      const balance = Math.max(0, totalRent - paid);
      grandTotal += totalRent; grandPaid += paid;
      y += 3; x = 30;
      const vals = [lease.truck_no, lease.owner_name||'', `Rs.${(lease.monthly_rent||0).toLocaleString('en-IN')}`, lease.start_date||'', lease.end_date||'Ongoing', `Rs.${(lease.advance_deposit||0).toLocaleString('en-IN')}`, (lease.status||'').toUpperCase(), `Rs.${totalRent.toLocaleString('en-IN')}`, `Rs.${Math.round(paid).toLocaleString('en-IN')}`, `Rs.${Math.round(balance).toLocaleString('en-IN')}`];
      doc.fontSize(7);
      vals.forEach((v, i) => { doc.text(v, x, y, { width: colW[i], align: i >= 2 ? 'right' : 'left' }); x += colW[i]; });
      y += 12;
    }
    y += 3; doc.moveTo(30, y).lineTo(700, y).stroke(); y += 3; x = 30;
    doc.fontSize(8).font('Helvetica-Bold');
    const totals = ['', '', '', '', '', '', 'TOTAL', `Rs.${grandTotal.toLocaleString('en-IN')}`, `Rs.${Math.round(grandPaid).toLocaleString('en-IN')}`, `Rs.${Math.round(Math.max(0, grandTotal - grandPaid)).toLocaleString('en-IN')}`];
    totals.forEach((v, i) => { doc.text(v, x, y, { width: colW[i], align: i >= 2 ? 'right' : 'left' }); x += colW[i]; });
    doc.end();
  }));

  // ========== EXCEL EXPORT ==========

  router.get('/api/truck-leases/export/excel', safeSync((req, res) => {
    const ExcelJS = require('exceljs');
    let leases = database.data.truck_leases || [];
    if (req.query.kms_year) leases = leases.filter(l => l.kms_year === req.query.kms_year);
    if (req.query.season) leases = leases.filter(l => l.season === req.query.season);
    const allPayments = database.data.truck_lease_payments || [];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Truck Leases');
    ws.columns = [
      { header: 'Truck No.', key: 'truck_no', width: 15 },
      { header: 'Owner', key: 'owner_name', width: 18 },
      { header: 'Monthly Rent', key: 'monthly_rent', width: 15 },
      { header: 'Start Date', key: 'start_date', width: 12 },
      { header: 'End Date', key: 'end_date', width: 12 },
      { header: 'Advance', key: 'advance', width: 12 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Total Months', key: 'months', width: 12 },
      { header: 'Total Due', key: 'total_due', width: 15 },
      { header: 'Total Paid', key: 'total_paid', width: 15 },
      { header: 'Balance', key: 'balance', width: 15 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e293b' } };
    for (const lease of leases) {
      const months = getMonthsBetween(lease.start_date, lease.end_date);
      const totalRent = months.length * (lease.monthly_rent || 0);
      const paid = allPayments.filter(p => p.lease_id === lease.id).reduce((s, p) => s + (p.amount || 0), 0);
      ws.addRow({ truck_no: lease.truck_no, owner_name: lease.owner_name||'', monthly_rent: lease.monthly_rent||0, start_date: lease.start_date||'', end_date: lease.end_date||'Ongoing', advance: lease.advance_deposit||0, status: (lease.status||'').toUpperCase(), months: months.length, total_due: totalRent, total_paid: Math.round(paid), balance: Math.max(0, Math.round(totalRent - paid)) });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=truck_lease_report.xlsx');
    wb.xlsx.write(res).then(() => res.end());
  }));

  return router;
};

// Re-export getMonthsBetween for use in fy_summary
module.exports.getMonthsBetween = getMonthsBetween;
