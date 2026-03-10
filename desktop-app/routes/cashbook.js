const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, fmtDate } = require('./pdf_helpers');
const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding);
  }

  router.post('/api/cash-book', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = req.body;
    const txn = { id: uuidv4(), date: d.date, account: d.account || 'cash', txn_type: d.txn_type || 'jama',
      category: d.category || '', description: d.description || '', amount: +(d.amount || 0),
      reference: d.reference || '', kms_year: d.kms_year || '', season: d.season || '',
      created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.cash_transactions.push(txn); database.save(); res.json(txn);
  }));

  router.get('/api/cash-book', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    if (req.query.date_from) txns = txns.filter(t => t.date >= req.query.date_from);
    if (req.query.date_to) txns = txns.filter(t => t.date <= req.query.date_to);
    res.json(txns.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
  }));

  router.delete('/api/cash-book/:id', safeSync((req, res) => {
    if (!database.data.cash_transactions) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.cash_transactions.length;
    database.data.cash_transactions = database.data.cash_transactions.filter(t => t.id !== req.params.id);
    if (database.data.cash_transactions.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.put('/api/cash-book/:id', safeSync((req, res) => {
    if (!database.data.cash_transactions) return res.status(404).json({ detail: 'Not found' });
    const idx = database.data.cash_transactions.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Not found' });
    const body = req.body; delete body._id; delete body.id;
    body.updated_at = new Date().toISOString();
    if (body.amount) body.amount = Math.round(parseFloat(body.amount) * 100) / 100;
    Object.assign(database.data.cash_transactions[idx], body);
    database.save();
    res.json(database.data.cash_transactions[idx]);
  }));

  router.post('/api/cash-book/delete-bulk', safeSync((req, res) => {
    const ids = req.body.ids || [];
    if (!ids.length) return res.status(400).json({ detail: 'No ids provided' });
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const before = database.data.cash_transactions.length;
    database.data.cash_transactions = database.data.cash_transactions.filter(t => !ids.includes(t.id));
    const deleted = before - database.data.cash_transactions.length;
    if (deleted > 0) database.save();
    res.json({ message: `${deleted} transactions deleted`, deleted });
  }));

  router.get('/api/cash-book/categories', safeSync((req, res) => {
    if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
    res.json([...database.data.cash_book_categories]);
  }));

  router.post('/api/cash-book/categories', safeSync((req, res) => {
    if (!database.data.cash_book_categories) database.data.cash_book_categories = [];
    const name = (req.body.name || '').trim();
    const type = req.body.type || '';
    if (!name || !type) return res.status(400).json({ detail: 'Name and type required' });
    if (database.data.cash_book_categories.find(c => c.name === name && c.type === type)) return res.status(400).json({ detail: 'Category already exists' });
    const cat = { id: uuidv4(), name, type, created_at: new Date().toISOString() };
    database.data.cash_book_categories.push(cat); database.save(); res.json(cat);
  }));

  router.delete('/api/cash-book/categories/:id', safeSync((req, res) => {
    if (!database.data.cash_book_categories) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.cash_book_categories.length;
    database.data.cash_book_categories = database.data.cash_book_categories.filter(c => c.id !== req.params.id);
    if (database.data.cash_book_categories.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  router.get('/api/cash-book/summary', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    const kmsYear = req.query.kms_year;
    if (kmsYear) txns = txns.filter(t => t.kms_year === kmsYear);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    const cashIn = +txns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const cashOut = +txns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankIn = +txns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankOut = +txns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);

    // Opening balance from previous FY (Tally-style carry forward)
    let openingCash = 0, openingBank = 0;
    if (kmsYear) {
      const parts = kmsYear.split('-');
      if (parts.length === 2) {
        try {
          const prevFy = `${parseInt(parts[0]) - 1}-${parseInt(parts[1]) - 1}`;
          if (!database.data.opening_balances) database.data.opening_balances = [];
          const savedOb = database.data.opening_balances.find(ob => ob.kms_year === kmsYear);
          if (savedOb) {
            openingCash = savedOb.cash || 0;
            openingBank = savedOb.bank || 0;
          } else {
            const prevTxns = database.data.cash_transactions.filter(t => t.kms_year === prevFy);
            const pCashIn = prevTxns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
            const pCashOut = prevTxns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
            const pBankIn = prevTxns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
            const pBankOut = prevTxns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
            const prevOb = database.data.opening_balances.find(ob => ob.kms_year === prevFy);
            if (prevOb) {
              openingCash = +((prevOb.cash || 0) + pCashIn - pCashOut).toFixed(2);
              openingBank = +((prevOb.bank || 0) + pBankIn - pBankOut).toFixed(2);
            } else {
              openingCash = +(pCashIn - pCashOut).toFixed(2);
              openingBank = +(pBankIn - pBankOut).toFixed(2);
            }
          }
        } catch (e) {}
      }
    }

    res.json({
      opening_cash: openingCash, opening_bank: openingBank,
      cash_in: cashIn, cash_out: cashOut, cash_balance: +(openingCash + cashIn - cashOut).toFixed(2),
      bank_in: bankIn, bank_out: bankOut, bank_balance: +(openingBank + bankIn - bankOut).toFixed(2),
      total_balance: +((openingCash + cashIn - cashOut) + (openingBank + bankIn - bankOut)).toFixed(2),
      total_transactions: txns.length
    });
  }));

  router.get('/api/cash-book/excel', safeAsync(async (req, res) => {
    try {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      let txns = [...database.data.cash_transactions];
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
      txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Cash Book');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Account', key: 'account', width: 10 },
        { header: 'Type', key: 'type', width: 10 }, { header: 'Category', key: 'category', width: 18 },
        { header: 'Description', key: 'description', width: 24 }, { header: 'Jama (Rs.)', key: 'jama', width: 14 },
        { header: 'Nikasi (Rs.)', key: 'nikasi', width: 14 }, { header: 'Reference', key: 'reference', width: 16 }
      ];
      txns.forEach(t => ws.addRow({ date: t.date, account: t.account === 'cash' ? 'Cash' : 'Bank',
        type: t.txn_type === 'jama' ? 'Jama' : 'Nikasi', category: t.category || '', description: t.description || '',
        jama: t.txn_type === 'jama' ? t.amount : '', nikasi: t.txn_type === 'nikasi' ? t.amount : '', reference: t.reference || '' }));
      const totalRow = ws.addRow({ date: 'TOTAL', jama: +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
        nikasi: +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2) });
      totalRow.font = { bold: true };
      addExcelTitle(ws, 'Daily Cash Book', 8, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/cash-book/pdf', safeSync((req, res) => {
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
      doc.pipe(res); addPdfHeader(doc, 'Daily Cash Book');
      const headers = ['Date','Account','Type','Category','Description','Jama(Rs.)','Nikasi(Rs.)','Ref'];
      const rows = txns.map(t => [fmtDate(t.date), t.account==='cash'?'Cash':'Bank', t.txn_type==='jama'?'Jama':'Nikasi',
        (t.category||'').substring(0,25), (t.description||'').substring(0,35),
        t.txn_type==='jama'?t.amount:'-', t.txn_type==='nikasi'?t.amount:'-', (t.reference||'').substring(0,12)]);
      const tj = +txns.filter(t => t.txn_type==='jama').reduce((s,t)=>s+(t.amount||0),0).toFixed(2);
      const tn = +txns.filter(t => t.txn_type==='nikasi').reduce((s,t)=>s+(t.amount||0),0).toFixed(2);
      rows.push(['TOTAL','','','','',tj,tn,'']);
      addPdfTable(doc, headers, rows, [55,45,40,90,150,60,60,55]); doc.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== CASH BOOK OPENING BALANCE =====
  router.get('/api/cash-book/opening-balance', safeSync((req, res) => {
    const kms_year = req.query.kms_year || '';
    if (!database.data.opening_balances) database.data.opening_balances = [];
    const saved = database.data.opening_balances.find(ob => ob.kms_year === kms_year);
    if (saved) return res.json({ cash: saved.cash || 0, bank: saved.bank || 0, source: 'manual' });
    const parts = kms_year.split('-');
    if (parts.length === 2) {
      try {
        const prevFy = `${parseInt(parts[0])-1}-${parseInt(parts[1])-1}`;
        const prevTxns = (database.data.cash_transactions || []).filter(t => t.kms_year === prevFy);
        const prevCashIn = prevTxns.filter(t => t.account==='cash' && t.txn_type==='jama').reduce((s,t) => s+(t.amount||0), 0);
        const prevCashOut = prevTxns.filter(t => t.account==='cash' && t.txn_type==='nikasi').reduce((s,t) => s+(t.amount||0), 0);
        const prevBankIn = prevTxns.filter(t => t.account==='bank' && t.txn_type==='jama').reduce((s,t) => s+(t.amount||0), 0);
        const prevBankOut = prevTxns.filter(t => t.account==='bank' && t.txn_type==='nikasi').reduce((s,t) => s+(t.amount||0), 0);
        const prevOb = database.data.opening_balances.find(ob => ob.kms_year === prevFy);
        const obCash = prevOb ? (prevOb.cash || 0) : 0;
        const obBank = prevOb ? (prevOb.bank || 0) : 0;
        return res.json({ cash: +(obCash + prevCashIn - prevCashOut).toFixed(2), bank: +(obBank + prevBankIn - prevBankOut).toFixed(2), source: 'auto' });
      } catch(e) {}
    }
    res.json({ cash: 0, bank: 0, source: 'none' });
  }));

  router.put('/api/cash-book/opening-balance', safeSync((req, res) => {
    const { kms_year, cash, bank } = req.body;
    if (!kms_year) return res.status(400).json({ detail: 'kms_year is required' });
    if (!database.data.opening_balances) database.data.opening_balances = [];
    const idx = database.data.opening_balances.findIndex(ob => ob.kms_year === kms_year);
    const doc = { kms_year, cash: +(cash || 0), bank: +(bank || 0), updated_at: new Date().toISOString() };
    if (idx >= 0) database.data.opening_balances[idx] = doc;
    else database.data.opening_balances.push(doc);
    database.save();
    res.json(doc);
  }));

  return router;
};
