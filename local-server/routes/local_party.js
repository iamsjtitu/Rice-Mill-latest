const express = require('express');
const { safeAsync, safeSync, roundAmount } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function(database) {

function ensureCollection(name) {
  if (!database.data[name]) database.data[name] = [];
}

// ============ LOCAL PARTY SUMMARY ============
router.get('/api/local-party/summary', safeSync(async (req, res) => {
  ensureCollection('local_party_accounts');
  let txns = [...database.data.local_party_accounts];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  if (req.query.date_from) txns = txns.filter(t => (t.date || '') >= req.query.date_from);
  if (req.query.date_to) txns = txns.filter(t => (t.date || '') <= req.query.date_to);

  // Compute opening balance from previous FY per party
  const openingBalances = {};
  if (req.query.kms_year && !req.query.date_from && !req.query.date_to) {
    const fyParts = req.query.kms_year.split('-');
    if (fyParts.length === 2) {
      const prevFy = `${parseInt(fyParts[0])-1}-${parseInt(fyParts[1])-1}`;
      let prevTxns = [...database.data.local_party_accounts].filter(t => t.kms_year === prevFy);
      if (req.query.season) prevTxns = prevTxns.filter(t => t.season === req.query.season);
      for (const t of prevTxns) {
        const pn = (t.party_name || '').trim();
        if (!pn) continue;
        if (!openingBalances[pn]) openingBalances[pn] = 0;
        if (t.txn_type === 'debit') openingBalances[pn] += t.amount || 0;
        else if (t.txn_type === 'payment') openingBalances[pn] -= t.amount || 0;
      }
    }
  }

  const partyMap = {};
  // Add parties with opening balances from previous FY
  for (const [pn, ob] of Object.entries(openingBalances)) {
    const roundedOb = Math.round(ob * 100) / 100;
    if (roundedOb !== 0) {
      partyMap[pn] = { party_name: pn, opening_balance: roundedOb, total_debit: 0, total_paid: 0, balance: 0, txn_count: 0 };
    }
  }

  for (const t of txns) {
    const pn = (t.party_name || '').trim();
    if (!pn) continue;
    if (!partyMap[pn]) {
      const ob = Math.round((openingBalances[pn] || 0) * 100) / 100;
      partyMap[pn] = { party_name: pn, opening_balance: ob, total_debit: 0, total_paid: 0, balance: 0, txn_count: 0 };
    }
    if (t.txn_type === 'debit') partyMap[pn].total_debit += t.amount || 0;
    else if (t.txn_type === 'payment') partyMap[pn].total_paid += t.amount || 0;
    partyMap[pn].txn_count++;
  }

  // Use ledger as source of truth for total_paid (includes manual Cash Book payments)
  const allCashTxns = database.data.cash_transactions || [];
  const allPartyNames = Object.keys(partyMap);
  for (const pn of allPartyNames) {
    const ledgerPaid = allCashTxns
      .filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === pn
        && (!req.query.kms_year || t.kms_year === req.query.kms_year)
        && (!req.query.season || t.season === req.query.season))
      .reduce((s, t) => s + (t.amount || 0), 0);
    if (ledgerPaid > partyMap[pn].total_paid) {
      partyMap[pn].total_paid = Math.round(ledgerPaid * 100) / 100;
    }
  }

  const parties = Object.values(partyMap).map(p => ({
    ...p,
    total_debit: Math.round(p.total_debit * 100) / 100,
    total_paid: Math.round(p.total_paid * 100) / 100,
    balance: Math.round(((p.opening_balance || 0) + p.total_debit - p.total_paid) * 100) / 100
  })).sort((a, b) => b.balance - a.balance);

  const gOb = parties.reduce((s, p) => s + (p.opening_balance || 0), 0);
  const gd = parties.reduce((s, p) => s + p.total_debit, 0);
  const gp = parties.reduce((s, p) => s + p.total_paid, 0);
  res.json({
    parties,
    grand_opening_balance: Math.round(gOb * 100) / 100,
    grand_total_debit: Math.round(gd * 100) / 100,
    grand_total_paid: Math.round(gp * 100) / 100,
    grand_balance: Math.round((gOb + gd - gp) * 100) / 100
  });
}));

// ============ LOCAL PARTY TRANSACTIONS ============
router.get('/api/local-party/transactions', safeSync(async (req, res) => {
  ensureCollection('local_party_accounts');
  let txns = [...database.data.local_party_accounts];
  if (req.query.party_name) {
    const pn = req.query.party_name.toLowerCase();
    txns = txns.filter(t => (t.party_name || '').toLowerCase() === pn);
  }
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  if (req.query.date_from) txns = txns.filter(t => (t.date || '') >= req.query.date_from);
  if (req.query.date_to) txns = txns.filter(t => (t.date || '') <= req.query.date_to);
  txns.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)));
  res.json(txns);
}));

// ============ PARTY-WISE REPORT (PRINT) ============
router.get('/api/local-party/report/:partyName', safeSync(async (req, res) => {
  ensureCollection('local_party_accounts');
  ensureCollection('cash_transactions');
  const pn = req.params.partyName.toLowerCase();
  let txns = database.data.local_party_accounts.filter(t => (t.party_name || '').toLowerCase() === pn);
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  if (req.query.date_from) txns = txns.filter(t => (t.date || '') >= req.query.date_from);
  if (req.query.date_to) txns = txns.filter(t => (t.date || '') <= req.query.date_to);

  // Include manual cashbook payments (ledger nikasi for this party)
  const existingRefs = new Set(txns.filter(t => t.reference).map(t => t.reference));
  const existingIds = new Set(txns.map(t => t.id));
  let cbPayments = (database.data.cash_transactions || []).filter(t =>
    t.account === 'ledger' && t.txn_type === 'nikasi' &&
    (t.category || '').toLowerCase() === pn
  );
  if (req.query.kms_year) cbPayments = cbPayments.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) cbPayments = cbPayments.filter(t => t.season === req.query.season);
  if (req.query.date_from) cbPayments = cbPayments.filter(t => (t.date || '') >= req.query.date_from);
  if (req.query.date_to) cbPayments = cbPayments.filter(t => (t.date || '') <= req.query.date_to);
  for (const cb of cbPayments) {
    if (cb.linked_local_party_id && existingIds.has(cb.linked_local_party_id)) continue;
    const ref = cb.reference || '';
    if (ref.startsWith('local_party_ledger:') || ref.startsWith('local_party:')) continue;
    if (ref && existingRefs.has(ref)) continue;
    // Check ref_id overlap
    const refIdPart = ref.includes(':') ? ref.split(':')[1] : '';
    if (refIdPart && [...existingRefs].some(er => er.includes(refIdPart))) continue;
    txns.push({
      id: cb.id || '', date: cb.date || '', party_name: req.params.partyName,
      txn_type: 'payment', amount: cb.amount || 0,
      description: cb.description || 'CashBook Payment',
      source_type: 'cashbook', reference: ref,
      kms_year: cb.kms_year || '', season: cb.season || '',
      created_by: cb.created_by || '', created_at: cb.created_at || ''
    });
  }
  txns.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)) || (a.created_at || '').localeCompare(b.created_at || ''));

  let runBal = 0;
  const rows = txns.map(t => {
    runBal += t.txn_type === 'debit' ? (t.amount || 0) : -(t.amount || 0);
    return { ...t, running_balance: Math.round(runBal * 100) / 100 };
  });
  const td = txns.filter(t => t.txn_type === 'debit').reduce((s, t) => s + (t.amount || 0), 0);
  const tp = txns.filter(t => t.txn_type === 'payment').reduce((s, t) => s + (t.amount || 0), 0);
  res.json({ party_name: req.params.partyName, transactions: rows, total_debit: Math.round(td * 100) / 100, total_paid: Math.round(tp * 100) / 100, balance: Math.round((td - tp) * 100) / 100, total_entries: txns.length });
}));

// ============ MANUAL PURCHASE ============
router.post('/api/local-party/manual', safeSync(async (req, res) => {
  ensureCollection('local_party_accounts');
  ensureCollection('cash_transactions');
  const d = req.body;
  const party_name = (d.party_name || '').trim();
  const amount = parseFloat(d.amount) || 0;
  if (!party_name || amount <= 0) return res.status(400).json({ detail: 'Party name aur amount (>0) required hai' });

  const doc = {
    id: uuidv4(), date: d.date || new Date().toISOString().split('T')[0],
    party_name, txn_type: 'debit', amount: roundAmount(amount),
    description: d.description || 'Manual Purchase', source_type: 'manual', reference: '',
    kms_year: d.kms_year || '', season: d.season || '',
    created_by: d.created_by || 'system', created_at: new Date().toISOString()
  };
  database.data.local_party_accounts.push(doc);

  // Auto create Cash Book Ledger Jama entry (purchase from local party)
  database.data.cash_transactions.push({
    id: uuidv4(), date: doc.date, account: 'ledger', txn_type: 'jama',
    category: party_name, party_type: 'Local Party',
    description: `Purchase: ${party_name} - ${d.description || 'Manual Purchase'} Rs.${amount}`,
    amount: roundAmount(amount), reference: `lp_purchase:${doc.id.slice(0,8)}`,
    kms_year: d.kms_year || '', season: d.season || '',
    created_by: d.created_by || 'system', linked_local_party_id: doc.id,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });

  database.save();
  res.json(doc);
}));

// ============ SETTLEMENT / PAY / RECEIVE ============
router.post('/api/local-party/settle', safeSync(async (req, res) => {
  ensureCollection('local_party_accounts');
  ensureCollection('cash_transactions');
  const d = req.body;
  const party_name = (d.party_name || '').trim();
  const amount = parseFloat(d.amount) || 0;
  const type = d.type || 'paid'; // 'paid' or 'received'

  if (!party_name || amount <= 0) return res.status(400).json({ detail: 'Party name aur amount (>0) required hai' });

  const date = d.date || new Date().toISOString().split('T')[0];
  const notes = d.notes || '';
  const kms_year = d.kms_year || '';
  const season = d.season || '';
  const username = d.created_by || 'system';
  const roundOff = parseFloat(d.round_off) || 0;
  const totalSettled = Math.round((amount + roundOff) * 100) / 100;

  // Local Party Account: payment = total (amount + round_off) so balance clears
  const cashTxnType = type === 'received' ? 'jama' : 'nikasi';
  const descPrefix = type === 'received' ? 'Received from' : 'Payment to';

  const payTxn = {
    id: uuidv4(), date, party_name, txn_type: 'payment',
    amount: totalSettled,
    description: `${descPrefix} ${party_name} - Rs.${amount}${roundOff ? ' (Round Off: ' + (roundOff > 0 ? '+' : '') + roundOff + ')' : ''}${notes ? ' - ' + notes : ''}`,
    source_type: 'settlement', reference: '', kms_year, season,
    created_by: username, created_at: new Date().toISOString()
  };
  database.data.local_party_accounts.push(payTxn);

  // Cash Book - only actual cash amount
  const cb = {
    id: uuidv4(), date, account: 'cash', txn_type: cashTxnType, category: party_name,
    party_type: 'Local Party',
    description: `Local Party: ${descPrefix} ${party_name} - Rs.${amount}${notes ? ' (' + notes + ')' : ''}`,
    amount: roundAmount(amount), reference: `local_party:${payTxn.id.slice(0, 8)}`,
    kms_year, season, created_by: username,
    linked_local_party_id: payTxn.id,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  database.data.cash_transactions.push(cb);
  
  // Ledger Entry - total (amount + round_off) so party ledger balances
  database.data.cash_transactions.push({
    id: uuidv4(), date, account: 'ledger', txn_type: cashTxnType, category: party_name,
    party_type: 'Local Party',
    description: `Local Party: ${descPrefix} ${party_name} - Rs.${totalSettled}${roundOff ? ' (Cash: ' + amount + ', Round Off: ' + roundOff + ')' : ''}${notes ? ' (' + notes + ')' : ''}`,
    amount: totalSettled, reference: `local_party_ledger:${payTxn.id.slice(0, 8)}`,
    kms_year, season, created_by: username,
    linked_local_party_id: payTxn.id,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  database.save();

  res.json({ success: true, message: `Rs.${amount} ${type} recorded for ${party_name}`, txn_id: payTxn.id });
}));

// ============ DELETE TRANSACTION ============
router.delete('/api/local-party/:id', safeSync(async (req, res) => {
  ensureCollection('local_party_accounts');
  ensureCollection('cash_transactions');
  const txn = database.data.local_party_accounts.find(t => t.id === req.params.id);
  if (!txn) return res.status(404).json({ detail: 'Transaction not found' });

  // Remove all linked cash_transactions entries (both settlement and purchase jama)
  database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_local_party_id !== txn.id);

  database.data.local_party_accounts = database.data.local_party_accounts.filter(t => t.id !== req.params.id);
  database.save();
  res.json({ message: 'Deleted', id: req.params.id });
}));

// ============ EXCEL EXPORT ============
router.get('/api/local-party/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  ensureCollection('local_party_accounts');
  let txns = [...database.data.local_party_accounts];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  txns.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));

  const partyMap = {};
  for (const t of txns) {
    const pn = (t.party_name || '').trim();
    if (!pn) continue;
    if (!partyMap[pn]) partyMap[pn] = { party_name: pn, total_debit: 0, total_paid: 0, txn_count: 0 };
    if (t.txn_type === 'debit') partyMap[pn].total_debit += t.amount || 0;
    else partyMap[pn].total_paid += t.amount || 0;
    partyMap[pn].txn_count++;
  }
  const parties = Object.values(partyMap).map(p => ({
    ...p, balance: Math.round((p.total_debit - p.total_paid) * 100) / 100,
    total_debit: Math.round(p.total_debit * 100) / 100, total_paid: Math.round(p.total_paid * 100) / 100
  }));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Local Party Account');
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'Local Party Account';
  ws.getCell('A1').font = { name: 'Inter', bold: true, size: 14 };

  ws.addRow([]);
  const hdr = ws.addRow(['Party Name', 'Total Debit', 'Total Paid', 'Balance', 'Entries']);
  hdr.eachCell(c => { c.font = { name: 'Inter', bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065f46' } }; });
  for (const p of parties) ws.addRow([p.party_name, p.total_debit, p.total_paid, p.balance, p.txn_count]);

  ws.addRow([]); ws.addRow([]);
  const tHdr = ws.addRow(['Date', 'Party', 'Type', 'Amount', 'Description', 'Source']);
  tHdr.eachCell(c => { c.font = { name: 'Inter', bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065f46' } }; });
  for (const t of txns) {
    ws.addRow([fmtDate(t.date), t.party_name, t.txn_type === 'payment' ? 'Payment' : 'Purchase', t.amount, t.description, t.source_type]);
  }
  for (let i = 1; i <= 6; i++) ws.getColumn(i).width = 20;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=local_party_account.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}));

// ============ PDF EXPORT ============
router.get('/api/local-party/pdf', safeSync(async (req, res) => {
  const PDFDocument = require('pdfkit');
  const { addPdfHeader, addPdfTable, addTotalsRow, safePdfPipe, fmtDate } = require('./pdf_helpers');
  ensureCollection('local_party_accounts');
  let txns = [...database.data.local_party_accounts];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  if (req.query.party_name) txns = txns.filter(t => t.party_name === req.query.party_name);
  txns.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=local_party_account.pdf`);
  // PDF will be sent via safePdfPipe

  const branding = database.getBranding ? database.getBranding() : {};
  addPdfHeader(doc, 'Local Party Account', branding);

  const headers = ['Date', 'Party', 'Type', 'Amount (Rs)', 'Description', 'Source'];
  const colW = [65, 110, 55, 70, 220, 65];
  const rows = txns.map(t => [fmtDate(t.date), t.party_name, t.txn_type === 'payment' ? 'PAYMENT' : 'PURCHASE',
    `Rs.${(t.amount||0).toLocaleString()}`, (t.description||'').slice(0, 40), t.source_type||'']);
  addPdfTable(doc, headers, rows, colW);

  const totalPurchase = txns.filter(t => t.txn_type !== 'payment').reduce((s, t) => s + (t.amount||0), 0);
  const totalPayment = txns.filter(t => t.txn_type === 'payment').reduce((s, t) => s + (t.amount||0), 0);
  addTotalsRow(doc, ['TOTAL', `${txns.length} entries`, '', `Purchase: Rs.${totalPurchase.toLocaleString()} | Payment: Rs.${totalPayment.toLocaleString()}`, '', `Balance: Rs.${(totalPurchase - totalPayment).toLocaleString()}`], colW);

  await safePdfPipe(doc, res);
}));

  return router;
};
