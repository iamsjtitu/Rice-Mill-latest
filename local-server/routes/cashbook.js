const express = require('express');
const router = express.Router();

module.exports = function(database) {
  // Helper reference
  const ExcelJS = require('exceljs');
  const PDFDocument = require('pdfkit');
  const { addPdfHeader: _addPdfHeader, addPdfTable } = require('./pdf_helpers');
  const addPdfHeader = (doc, title) => _addPdfHeader(doc, title, database.getBranding());

// ============ CASH BOOK ============
router.post('/api/cash-book', (req, res) => {
  if (!database.data.cash_transactions) database.data.cash_transactions = [];
  const d = req.body;
  const txn = {
    id: uuidv4(), date: d.date, account: d.account || 'cash', txn_type: d.txn_type || 'jama',
    category: d.category || '', description: d.description || '', amount: +(d.amount || 0),
    reference: d.reference || '', kms_year: d.kms_year || '', season: d.season || '',
    created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  database.data.cash_transactions.push(txn); database.save(); res.json(txn);
});

router.get('/api/cash-book', (req, res) => {
  if (!database.data.cash_transactions) database.data.cash_transactions = [];
  let txns = [...database.data.cash_transactions];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
  if (req.query.date_from) txns = txns.filter(t => t.date >= req.query.date_from);
  if (req.query.date_to) txns = txns.filter(t => t.date <= req.query.date_to);
  res.json(txns.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
});

router.delete('/api/cash-book/:id', (req, res) => {
  if (!database.data.cash_transactions) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.cash_transactions.length;
  database.data.cash_transactions = database.data.cash_transactions.filter(t => t.id !== req.params.id);
  if (database.data.cash_transactions.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});

router.get('/api/cash-book/categories', (req, res) => {
  if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
  res.json([...database.data.cash_book_categories]);
});
router.post('/api/cash-book/categories', (req, res) => {
  if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
  const name = (req.body.name || '').trim();
  const type = req.body.type || '';
  if (!name || !type) return res.status(400).json({ detail: 'Name and type required' });
  if (database.data.cash_book_categories.find(c => c.name === name && c.type === type)) return res.status(400).json({ detail: 'Category already exists' });
  const cat = { id: uuidv4(), name, type, created_at: new Date().toISOString() };
  database.data.cash_book_categories.push(cat); database.save(); res.json(cat);
});
router.delete('/api/cash-book/categories/:id', (req, res) => {
  if (!database.data.cash_book_categories) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.cash_book_categories.length;
  database.data.cash_book_categories = database.data.cash_book_categories.filter(c => c.id !== req.params.id);
  if (database.data.cash_book_categories.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});

router.get('/api/cash-book/summary', (req, res) => {
  let txns = [...database.data.cash_transactions];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  const cashIn = +txns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const cashOut = +txns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const bankIn = +txns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const bankOut = +txns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  res.json({
    cash_in: cashIn, cash_out: cashOut, cash_balance: +(cashIn - cashOut).toFixed(2),
    bank_in: bankIn, bank_out: bankOut, bank_balance: +(bankIn - bankOut).toFixed(2),
    total_balance: +((cashIn - cashOut) + (bankIn - bankOut)).toFixed(2), total_transactions: txns.length
  });
});

router.get('/api/cash-book/excel', async (req, res) => {
  try {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cash Book');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Account', key: 'account', width: 10 },
      { header: 'Type', key: 'type', width: 10 }, { header: 'Category', key: 'category', width: 18 },
      { header: 'Description', key: 'description', width: 24 }, { header: 'Jama (₹)', key: 'jama', width: 14 },
      { header: 'Nikasi (₹)', key: 'nikasi', width: 14 }, { header: 'Reference', key: 'reference', width: 16 }
    ];
    txns.forEach(t => ws.addRow({
      date: t.date, account: t.account === 'cash' ? 'Cash' : 'Bank',
      type: t.txn_type === 'jama' ? 'Jama' : 'Nikasi', category: t.category || '',
      description: t.description || '',
      jama: t.txn_type === 'jama' ? t.amount : '', nikasi: t.txn_type === 'nikasi' ? t.amount : '',
      reference: t.reference || ''
    }));
    const totalRow = ws.addRow({
      date: 'TOTAL', account: '', type: '', category: '', description: '',
      jama: +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
      nikasi: +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
      reference: ''
    });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'Daily Cash Book', 8);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

router.get('/api/cash-book/pdf', (req, res) => {
  try {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.pdf`);
    doc.pipe(res);
    addPdfHeader(doc, 'Daily Cash Book');
    const headers = ['Date', 'Account', 'Type', 'Category', 'Description', 'Jama(Rs.)', 'Nikasi(Rs.)', 'Ref'];
    const rows = txns.map(t => [t.date || '', t.account === 'cash' ? 'Cash' : 'Bank',
      t.txn_type === 'jama' ? 'Jama' : 'Nikasi', (t.category || '').substring(0, 25),
      (t.description || '').substring(0, 35),
      t.txn_type === 'jama' ? t.amount : '-', t.txn_type === 'nikasi' ? t.amount : '-',
      (t.reference || '').substring(0, 12)]);
    const tj = +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const tn = +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    rows.push(['TOTAL', '', '', '', '', tj, tn, '']);
    addPdfTable(doc, headers, rows, [55, 45, 40, 90, 150, 60, 60, 55]);
    doc.end();
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});



  return router;
};
