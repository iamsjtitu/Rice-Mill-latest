const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, fmtDate } = require('./pdf_helpers');
const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
const { getColumns, getEntryRow, getTotalRow, getExcelHeaders, getExcelWidths, getPdfHeaders, getPdfWidthsMm, colCount } = require('../shared/report_helper');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding);
  }

  router.post('/api/cash-book', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const d = req.body;
    const category = (d.category || '').trim();
    
    // Auto-detect party_type
    let partyType = d.party_type || '';
    if (!partyType && category) {
      const existing = database.data.cash_transactions.find(t => t.category === category && t.party_type);
      if (existing) {
        partyType = existing.party_type;
      } else {
        if ((database.data.private_paddy || []).find(p => p.party_name === category)) partyType = 'Pvt Paddy Purchase';
        else if ((database.data.rice_sales || []).find(p => p.party_name === category)) partyType = 'Rice Sale';
        else if ((database.data.diesel_accounts || []).find(p => p.pump_name === category)) partyType = 'Diesel';
        else if ((database.data.local_party_accounts || []).find(p => p.party_name === category)) partyType = 'Local Party';
        else if ((database.data.truck_payments || []).find(p => p.truck_no === category)) partyType = 'Truck';
        else if ((database.data.mandi_targets || []).find(p => p.mandi_name === category)) partyType = 'Agent';
      }
    }
    
    const txn = { id: uuidv4(), date: d.date, account: d.account || 'cash', txn_type: d.txn_type || 'jama',
      category: category, party_type: partyType, description: d.description || '', amount: +(d.amount || 0),
      reference: d.reference || '', kms_year: d.kms_year || '', season: d.season || '',
      created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.cash_transactions.push(txn);
    
    // Auto-create ledger entry for cash/bank transactions
    if ((txn.account === 'cash' || txn.account === 'bank') && category) {
      const ledgerEntry = { ...txn, id: uuidv4(), account: 'ledger', reference: `auto_ledger:${txn.id.substring(0, 8)}` };
      // Auto-generate description if empty
      if (!ledgerEntry.description) {
        const acct = (txn.account || 'cash').charAt(0).toUpperCase() + (txn.account || 'cash').slice(1);
        ledgerEntry.description = txn.txn_type === 'jama'
          ? `${acct} received from ${category}`
          : `${acct} payment to ${category}`;
      }
      database.data.cash_transactions.push(ledgerEntry);
    }
    
    database.save(); res.json(txn);
  }));

  router.get('/api/cash-book', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = [...database.data.cash_transactions];
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.account) txns = txns.filter(t => t.account === req.query.account);
    if (req.query.txn_type) txns = txns.filter(t => t.txn_type === req.query.txn_type);
    if (req.query.category) txns = txns.filter(t => t.category === req.query.category);
    if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
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

    // Per-bank breakdown for bank account transactions
    const bankTxns = txns.filter(t => t.account === 'bank');
    const bankNames = [...new Set(bankTxns.map(t => t.bank_name).filter(Boolean))];
    const bankDetails = {};
    let linkedBankIn = 0, linkedBankOut = 0;
    for (const bn of bankNames) {
      const bIn = +bankTxns.filter(t => t.bank_name === bn && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0).toFixed(2);
      const bOut = +bankTxns.filter(t => t.bank_name === bn && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0).toFixed(2);
      bankDetails[bn] = { in: bIn, out: bOut, balance: +(bIn - bOut).toFixed(2) };
      linkedBankIn += bIn; linkedBankOut += bOut;
    }
    const unlinkedBIn = +(bankIn - linkedBankIn).toFixed(2);
    const unlinkedBOut = +(bankOut - linkedBankOut).toFixed(2);
    if (unlinkedBIn > 0 || unlinkedBOut > 0) {
      bankDetails['Other'] = { in: unlinkedBIn, out: unlinkedBOut, balance: +(unlinkedBIn - unlinkedBOut).toFixed(2) };
    }

    // Get per-bank opening balances
    let openingBankDetails = {};
    if (kmsYear) {
      const savedOb2 = (database.data.opening_balances||[]).find(ob => ob.kms_year === kmsYear);
      if (savedOb2 && savedOb2.bank_details) {
        openingBankDetails = savedOb2.bank_details;
      }
    }
    // Add opening balances per bank
    for (const bn in bankDetails) {
      const obVal = openingBankDetails[bn] || 0;
      bankDetails[bn].opening = obVal;
      bankDetails[bn].balance = +(obVal + bankDetails[bn].in - bankDetails[bn].out).toFixed(2);
    }

    res.json({
      opening_cash: openingCash, opening_bank: openingBank,
      opening_bank_details: openingBankDetails,
      cash_in: cashIn, cash_out: cashOut, cash_balance: +(openingCash + cashIn - cashOut).toFixed(2),
      bank_in: bankIn, bank_out: bankOut, bank_balance: +(openingBank + bankIn - bankOut).toFixed(2),
      bank_details: bankDetails,
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
    if (saved) return res.json({ cash: saved.cash || 0, bank: saved.bank || 0, bank_details: saved.bank_details || {}, source: 'manual' });
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
        return res.json({ cash: +(obCash + prevCashIn - prevCashOut).toFixed(2), bank: +(obBank + prevBankIn - prevBankOut).toFixed(2), bank_details: {}, source: 'auto' });
      } catch(e) {}
    }
    res.json({ cash: 0, bank: 0, bank_details: {}, source: 'none' });
  }));

  router.put('/api/cash-book/opening-balance', safeSync((req, res) => {
    const { kms_year, cash, bank, bank_details } = req.body;
    if (!kms_year) return res.status(400).json({ detail: 'kms_year is required' });
    if (!database.data.opening_balances) database.data.opening_balances = [];
    const totalBank = bank_details && Object.keys(bank_details).length > 0
      ? Object.values(bank_details).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      : (parseFloat(bank) || 0);
    const idx = database.data.opening_balances.findIndex(ob => ob.kms_year === kms_year);
    const doc = { kms_year, cash: parseFloat(cash) || 0, bank: Math.round(totalBank * 100) / 100, bank_details: bank_details || {}, updated_at: new Date().toISOString() };
    if (idx >= 0) database.data.opening_balances[idx] = doc;
    else database.data.opening_balances.push(doc);
    database.save();
    res.json(doc);
  }));

  // === Party Summary ===
  router.get('/api/cash-book/party-summary', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = database.data.cash_transactions.filter(t => t.account === 'ledger');
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
    const parties = {};
    txns.forEach(t => {
      const name = t.category || 'Unknown';
      if (!parties[name]) parties[name] = { party_name: name, party_type: t.party_type || '', jama: 0, nikasi: 0, txn_count: 0 };
      if (t.txn_type === 'jama') parties[name].jama += t.amount || 0;
      else if (t.txn_type === 'nikasi') parties[name].nikasi += t.amount || 0;
      parties[name].txn_count++;
    });
    // Add opening balances
    const obList = database.data.party_opening_balances || [];
    const ky = req.query.kms_year;
    if (ky) {
      obList.filter(ob => ob.kms_year === ky).forEach(ob => {
        const name = ob.party_name;
        if (!parties[name]) parties[name] = { party_name: name, party_type: ob.party_type || '', jama: 0, nikasi: 0, txn_count: 0 };
        if (ob.balance_type === 'jama') parties[name].jama += parseFloat(ob.amount) || 0;
        else parties[name].nikasi += parseFloat(ob.amount) || 0;
      });
    }
    const result = Object.values(parties).map(p => ({
      ...p, jama: Math.round(p.jama * 100) / 100, nikasi: Math.round(p.nikasi * 100) / 100,
      balance: Math.round((p.jama - p.nikasi) * 100) / 100
    }));
    const statusFilter = req.query.status;
    let filtered = result;
    if (statusFilter === 'jama') filtered = result.filter(p => p.balance > 0);
    else if (statusFilter === 'nikasi') filtered = result.filter(p => p.balance < 0);
    else if (statusFilter === 'settled') filtered = result.filter(p => p.balance === 0);
    filtered.sort((a, b) => a.party_name.localeCompare(b.party_name));
    res.json(filtered);
  }));

  router.get('/api/cash-book/party-summary/excel', safeAsync(async (req, res) => {
    try {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      let txns = database.data.cash_transactions.filter(t => t.account === 'ledger');
      if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
      if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
      if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
      const parties = {};
      txns.forEach(t => {
        const name = t.category || 'Unknown';
        if (!parties[name]) parties[name] = { party_name: name, party_type: t.party_type || '', jama: 0, nikasi: 0 };
        if (t.txn_type === 'jama') parties[name].jama += t.amount || 0;
        else parties[name].nikasi += t.amount || 0;
      });
      const data = Object.values(parties).map(p => ({ ...p, balance: Math.round((p.jama - p.nikasi) * 100) / 100 }));
      data.sort((a, b) => a.party_name.localeCompare(b.party_name));
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Party Summary');
      ws.addRow(['Party', 'Type', 'Jama', 'Nikasi', 'Balance']);
      data.forEach(p => ws.addRow([p.party_name, p.party_type, p.jama, p.nikasi, p.balance]));
      ws.columns.forEach(c => c.width = 18);
      const buf = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=party_summary.xlsx');
      res.send(Buffer.from(buf));
    } catch (e) { res.status(500).json({ detail: e.message }); }
  }));

  router.get('/api/cash-book/party-summary/pdf', safeSync((req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    let txns = database.data.cash_transactions.filter(t => t.account === 'ledger');
    if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
    if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
    if (req.query.party_type) txns = txns.filter(t => t.party_type === req.query.party_type);
    const parties = {};
    txns.forEach(t => {
      const name = t.category || 'Unknown';
      if (!parties[name]) parties[name] = { party_name: name, party_type: t.party_type || '', jama: 0, nikasi: 0 };
      if (t.txn_type === 'jama') parties[name].jama += t.amount || 0;
      else parties[name].nikasi += t.amount || 0;
    });
    const data = Object.values(parties).map(p => ({ ...p, balance: Math.round((p.jama - p.nikasi) * 100) / 100 }));
    data.sort((a, b) => a.party_name.localeCompare(b.party_name));
    const company = (database.data.settings || {}).mill_name || 'NAVKAR AGRO';
    let html = `<!DOCTYPE html><html><head><style>body{font:10px Arial;margin:10px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 5px}th{background:#1e40af;color:#fff}.r{text-align:right}.b{font-weight:bold}</style></head><body>`;
    html += `<h2 style="text-align:center">${company} - Party Summary</h2><table><tr><th>Party</th><th>Type</th><th class="r">Jama</th><th class="r">Nikasi</th><th class="r">Balance</th></tr>`;
    let tJ = 0, tN = 0;
    data.forEach(p => { tJ += p.jama; tN += p.nikasi; html += `<tr><td class="b">${p.party_name}</td><td>${p.party_type}</td><td class="r">${Math.round(p.jama)}</td><td class="r">${Math.round(p.nikasi)}</td><td class="r b">${Math.round(p.balance)}</td></tr>`; });
    html += `<tr style="background:#f0f0f0;font-weight:bold"><td>TOTAL (${data.length})</td><td></td><td class="r">${Math.round(tJ)}</td><td class="r">${Math.round(tN)}</td><td class="r">${Math.round(tJ - tN)}</td></tr></table></body></html>`;
    res.type('html').send(html);
  }));

  // === Opening Balances (party-level) ===
  router.get('/api/opening-balances', safeSync((req, res) => {
    if (!database.data.party_opening_balances) database.data.party_opening_balances = [];
    let obs = [...database.data.party_opening_balances];
    if (req.query.kms_year) obs = obs.filter(o => o.kms_year === req.query.kms_year);
    res.json(obs);
  }));

  router.post('/api/opening-balances', safeSync((req, res) => {
    if (!database.data.party_opening_balances) database.data.party_opening_balances = [];
    const d = { id: uuidv4(), ...req.body, created_by: req.query.username || '', created_at: new Date().toISOString() };
    database.data.party_opening_balances.push(d);
    database.save();
    res.json(d);
  }));

  router.delete('/api/opening-balances/:id', safeSync((req, res) => {
    if (!database.data.party_opening_balances) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.party_opening_balances.length;
    database.data.party_opening_balances = database.data.party_opening_balances.filter(o => o.id !== req.params.id);
    if (database.data.party_opening_balances.length < len) { database.save(); return res.json({ message: 'Deleted' }); }
    res.status(404).json({ detail: 'Not found' });
  }));

  // === GST Settings ===
  router.get('/api/gst-settings', safeSync((req, res) => {
    if (!database.data.gst_settings) database.data.gst_settings = { gstin: '', state: '', default_cgst: 9, default_sgst: 9, default_igst: 0 };
    res.json(database.data.gst_settings);
  }));

  router.put('/api/gst-settings', safeSync((req, res) => {
    database.data.gst_settings = { ...req.body, updated_at: new Date().toISOString() };
    database.save();
    res.json(database.data.gst_settings);
  }));

  return router;
};
