const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, fmtDate } = require('./pdf_helpers');
const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
const { getColumns, getEntryRow, getTotalRow, getExcelHeaders, getExcelWidths, getPdfHeaders, getPdfWidthsMm, colCount } = require('../../shared/report_helper');

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
    res.json(txns.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||'')));
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
    // Exclude Round Off entries from cash/bank balance - round off is discount, not actual cash
    const realTxns = txns.filter(t => t.party_type !== 'Round Off');
    const cashIn = +realTxns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const cashOut = +realTxns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankIn = +realTxns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
    const bankOut = +realTxns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);

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
            const prevReal = prevTxns.filter(t => t.party_type !== 'Round Off');
            const pCashIn = prevReal.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
            const pCashOut = prevReal.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
            const pBankIn = prevReal.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0);
            const pBankOut = prevReal.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0);
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
      if (req.query.txn_type) txns = txns.filter(t => t.txn_type === req.query.txn_type);
      if (req.query.category) txns = txns.filter(t => t.category === req.query.category);
      if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
      if (req.query.date_from) txns = txns.filter(t => (t.date || '') >= req.query.date_from);
      if (req.query.date_to) txns = txns.filter(t => (t.date || '') <= req.query.date_to);
      txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      
      const cols = getColumns('cashbook_report');
      const headers = getExcelHeaders(cols);
      const widths = getExcelWidths(cols);
      
      // Pre-process rows with derived fields
      let runBal = 0;
      const rows = txns.map(t => {
        const jama = t.txn_type === 'jama' ? t.amount : 0;
        const nikasi = t.txn_type === 'nikasi' ? t.amount : 0;
        runBal += jama - nikasi;
        return {
          date: t.date, account_label: t.account === 'ledger' ? 'Ledger' : (t.account === 'cash' ? 'Cash' : 'Bank'),
          type_label: t.txn_type === 'jama' ? 'Jama' : 'Nikasi', category: t.category || '', party_type: t.party_type || '',
          description: t.description || '', jama: t.txn_type === 'jama' ? t.amount : '', nikasi: t.txn_type === 'nikasi' ? t.amount : '',
          balance: +runBal.toFixed(2), reference: t.reference || ''
        };
      });
      
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Cash Book');
      // Title
      ws.mergeCells(1, 1, 1, cols.length);
      ws.getCell('A1').value = 'Daily Cash Book'; ws.getCell('A1').font = { bold: true, size: 14 };
      // Headers row 3
      headers.forEach((h, i) => {
        const c = ws.getCell(3, i + 1); c.value = h;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
      });
      // Data rows
      rows.forEach((r, idx) => {
        const vals = getEntryRow(r, cols);
        vals.forEach((v, ci) => ws.getCell(4 + idx, ci + 1).value = v);
      });
      // Total row
      const trow = 4 + rows.length;
      const totals = {
        total_jama: +txns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
        total_nikasi: +txns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
        closing_balance: +runBal.toFixed(2)
      };
      ws.getCell(trow, 1).value = 'TOTAL'; ws.getCell(trow, 1).font = { bold: true };
      const totalVals = getTotalRow(totals, cols);
      totalVals.forEach((v, i) => { if (v !== null) { ws.getCell(trow, i + 1).value = v; ws.getCell(trow, i + 1).font = { bold: true }; } });
      widths.forEach((w, i) => ws.getColumn(i + 1).width = w);
      
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
      if (req.query.txn_type) txns = txns.filter(t => t.txn_type === req.query.txn_type);
      if (req.query.category) txns = txns.filter(t => t.category === req.query.category);
      if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
      if (req.query.date_from) txns = txns.filter(t => (t.date || '') >= req.query.date_from);
      if (req.query.date_to) txns = txns.filter(t => (t.date || '') <= req.query.date_to);
      txns.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      
      const cols = getColumns('cashbook_report');
      const headers = getPdfHeaders(cols);
      const colW = getPdfWidthsMm(cols).map(w => w * 2.2);
      
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=cash_book_${Date.now()}.pdf`);
      doc.pipe(res); addPdfHeader(doc, 'Daily Cash Book');
      
      // Pre-process rows
      let runBal = 0;
      const rows = txns.map(t => {
        const jama = t.txn_type === 'jama' ? t.amount : 0;
        const nikasi = t.txn_type === 'nikasi' ? t.amount : 0;
        runBal += jama - nikasi;
        return {
          date: t.date, account_label: t.account === 'ledger' ? 'Ledger' : (t.account === 'cash' ? 'Cash' : 'Bank'),
          type_label: t.txn_type === 'jama' ? 'Jama' : 'Nikasi', category: t.category || '', party_type: t.party_type || '',
          description: t.description || '', jama: t.txn_type === 'jama' ? t.amount : '-', nikasi: t.txn_type === 'nikasi' ? t.amount : '-',
          balance: +runBal.toFixed(2), reference: t.reference || ''
        };
      });
      
      let y = doc.y;
      // Headers
      doc.fontSize(7);
      headers.forEach((h, i) => {
        let x = 30 + colW.slice(0, i).reduce((a, b) => a + b, 0);
        doc.fillColor('#1a365d').rect(x, y, colW[i], 14).fill();
        doc.fillColor('#FFF').text(h, x + 2, y + 3, { width: colW[i] - 4 });
      });
      y += 16; doc.fillColor('#333');
      // Data rows
      rows.forEach(r => {
        const vals = getEntryRow(r, cols);
        vals.forEach((v, i) => {
          let x = 30 + colW.slice(0, i).reduce((a, b) => a + b, 0);
          doc.text(String(v), x + 2, y + 2, { width: colW[i] - 4 });
        });
        y += 14; if (y > 560) { doc.addPage(); y = 20; }
      });
      doc.end();
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
