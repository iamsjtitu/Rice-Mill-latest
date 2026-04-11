const express = require('express');
const { safeAsync, safeSync, roundAmount } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { safePdfPipe, addPdfTable, registerFonts, fmtDate, createPdfDoc } = require('./pdf_helpers');

module.exports = function(database) {

// ============ STORE ROOMS ============
router.get('/api/store-rooms', safeSync(async (req, res) => {
  if (!database.data.store_rooms) database.data.store_rooms = [];
  res.json([...database.data.store_rooms].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
}));

router.post('/api/store-rooms', safeSync(async (req, res) => {
  if (!database.data.store_rooms) database.data.store_rooms = [];
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ detail: 'Store Room name is required' });
  const existing = database.data.store_rooms.find(r => r.name.toLowerCase() === name.toLowerCase());
  if (existing) return res.status(400).json({ detail: 'Store Room already exists' });
  const doc = { id: uuidv4(), name, created_at: new Date().toISOString() };
  database.data.store_rooms.push(doc); database.save(); res.json(doc);
}));

router.put('/api/store-rooms/:id', safeSync(async (req, res) => {
  if (!database.data.store_rooms) return res.status(404).json({ detail: 'Not found' });
  const room = database.data.store_rooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).json({ detail: 'Not found' });
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ detail: 'Store Room name is required' });
  room.name = name;
  // Update references
  (database.data.mill_parts || []).forEach(p => { if (p.store_room === req.params.id) p.store_room_name = name; });
  (database.data.mill_parts_stock || []).forEach(t => { if (t.store_room === req.params.id) t.store_room_name = name; });
  database.save(); res.json({ message: 'Updated', id: req.params.id });
}));

router.delete('/api/store-rooms/:id', safeSync(async (req, res) => {
  if (!database.data.store_rooms) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.store_rooms.length;
  database.data.store_rooms = database.data.store_rooms.filter(r => r.id !== req.params.id);
  if (database.data.store_rooms.length < len) {
    // Unassign parts
    (database.data.mill_parts || []).forEach(p => { if (p.store_room === req.params.id) { p.store_room = ''; p.store_room_name = ''; } });
    (database.data.mill_parts_stock || []).forEach(t => { if (t.store_room === req.params.id) { t.store_room = ''; t.store_room_name = ''; } });
    database.save(); return res.json({ message: 'Deleted', id: req.params.id });
  }
  res.status(404).json({ detail: 'Not found' });
}));

// ============ MILL PARTS MASTER ============
router.post('/api/mill-parts', safeSync(async (req, res) => {
  if (!database.data.mill_parts) database.data.mill_parts = [];
  const d = req.body;
  const name = (d.name || '').trim();
  if (!name) return res.status(400).json({ detail: 'Part name is required' });
  const existing = database.data.mill_parts.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return res.status(400).json({ detail: 'Part already exists' });
  const doc = {
    id: uuidv4(), name, category: d.category || 'General', unit: d.unit || 'Pcs',
    min_stock: parseFloat(d.min_stock) || 0, store_room: d.store_room || '', store_room_name: d.store_room_name || '',
    created_at: new Date().toISOString()
  };
  database.data.mill_parts.push(doc); database.save(); res.json(doc);
}));

router.get('/api/mill-parts', safeSync(async (req, res) => {
  if (!database.data.mill_parts) database.data.mill_parts = [];
  const items = [...database.data.mill_parts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.json(items);
}));

router.delete('/api/mill-parts/:id', safeSync(async (req, res) => {
  if (!database.data.mill_parts) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.mill_parts.length;
  database.data.mill_parts = database.data.mill_parts.filter(p => p.id !== req.params.id);
  if (database.data.mill_parts.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
}));

// PUT /api/mill-parts/:id
router.put('/api/mill-parts/:id', safeSync(async (req, res) => {
  if (!database.data.mill_parts) return res.status(404).json({ detail: 'Not found' });
  const part = database.data.mill_parts.find(p => p.id === req.params.id);
  if (!part) return res.status(404).json({ detail: 'Not found' });
  const d = req.body;
  if (d.name !== undefined) part.name = (d.name || '').trim();
  if (d.category !== undefined) part.category = d.category;
  if (d.unit !== undefined) part.unit = d.unit;
  if (d.min_stock !== undefined) part.min_stock = parseFloat(d.min_stock) || 0;
  if (d.store_room !== undefined) part.store_room = d.store_room;
  if (d.store_room_name !== undefined) part.store_room_name = d.store_room_name;
  database.save(); res.json(part);
}));

// ============ MILL PARTS STOCK TRANSACTIONS ============
router.post('/api/mill-parts-stock', safeSync(async (req, res) => {
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  const d = req.body;
  const qty = parseFloat(d.quantity) || 0;
  const rate = parseFloat(d.rate) || 0;
  if (!(d.part_name || '').trim() || qty <= 0) return res.status(400).json({ detail: 'Part name and quantity required' });
  const doc = {
    id: uuidv4(), date: d.date || '', part_name: d.part_name || '', txn_type: d.txn_type || 'in',
    quantity: qty, rate, total_amount: roundAmount(qty * rate),
    party_name: d.party_name || '', bill_no: d.bill_no || '', remark: d.remark || '',
    store_room: d.store_room || '', store_room_name: d.store_room_name || '',
    kms_year: d.kms_year || '', season: d.season || '',
    created_by: d.created_by || '', created_at: new Date().toISOString()
  };
  database.data.mill_parts_stock.push(doc);

  // Update part's store_room in master when stock-in has a store_room selected
  if (doc.store_room && doc.part_name && database.data.mill_parts) {
    database.data.mill_parts.forEach(p => {
      if (p.name === doc.part_name) {
        p.store_room = doc.store_room;
        p.store_room_name = doc.store_room_name;
      }
    });
  }

  // Auto-create local party entry for purchases with party
  if (doc.txn_type === 'in' && doc.party_name && doc.total_amount > 0) {
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    const lpId = uuidv4();
    database.data.local_party_accounts.push({
      id: lpId, date: doc.date, party_name: doc.party_name, txn_type: 'debit',
      amount: doc.total_amount, description: `${doc.part_name} x${doc.quantity} @ Rs.${doc.rate}`,
      source_type: 'mill_part', reference: `mill_part:${doc.id.slice(0,8)}`,
      kms_year: doc.kms_year, season: doc.season, created_by: doc.created_by || 'system',
      linked_stock_id: doc.id, created_at: new Date().toISOString()
    });

    // Auto create Cash Book Ledger Jama entry (purchase from local party via mill part)
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    database.data.cash_transactions.push({
      id: uuidv4(), date: doc.date, account: 'ledger', txn_type: 'jama',
      category: doc.party_name, party_type: 'Local Party',
      description: `Mill Part: ${doc.part_name} x${doc.quantity} @ Rs.${doc.rate} - ${doc.party_name}`,
      amount: doc.total_amount, reference: `lp_mill_part:${doc.id.slice(0,8)}`,
      kms_year: doc.kms_year || '', season: doc.season || '',
      created_by: doc.created_by || 'system', linked_local_party_id: lpId,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
  }

  database.save(); res.json(doc);
}));

router.get('/api/mill-parts-stock', safeSync(async (req, res) => {
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  let items = [...database.data.mill_parts_stock];
  if (req.query.part_name) items = items.filter(t => t.part_name === req.query.part_name);
  if (req.query.txn_type) items = items.filter(t => t.txn_type === req.query.txn_type);
  if (req.query.kms_year) items = items.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) items = items.filter(t => t.season === req.query.season);
  if (req.query.party_name) items = items.filter(t => (t.party_name || '').toLowerCase().includes(req.query.party_name.toLowerCase()));
  if (req.query.date_from) items = items.filter(t => (t.date || '') >= req.query.date_from);
  if (req.query.date_to) items = items.filter(t => (t.date || '') <= req.query.date_to);
  res.json(items.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)) || (b.created_at||'').localeCompare(a.created_at||'')));
}));

router.delete('/api/mill-parts-stock/:id', safeSync(async (req, res) => {
  if (!database.data.mill_parts_stock) return res.status(404).json({ detail: 'Not found' });
  // Remove linked local party entry
  if (database.data.local_party_accounts) {
    // Get linked local party IDs before deleting (for cash_transactions cleanup)
    const linkedLpIds = database.data.local_party_accounts
      .filter(t => t.linked_stock_id === req.params.id)
      .map(t => t.id);
    database.data.local_party_accounts = database.data.local_party_accounts.filter(t => t.linked_stock_id !== req.params.id);
    // Remove linked cash_transactions ledger jama entries
    if (database.data.cash_transactions && linkedLpIds.length > 0) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        !linkedLpIds.includes(t.linked_local_party_id) || t.reference?.startsWith('lp_mill_part:') === false
      );
      // Also cleanup by reference
      const refPrefix = `lp_mill_part:${req.params.id.slice(0,8)}`;
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.reference !== refPrefix);
    }
  }
  const len = database.data.mill_parts_stock.length;
  database.data.mill_parts_stock = database.data.mill_parts_stock.filter(t => t.id !== req.params.id);
  if (database.data.mill_parts_stock.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
}));

// PUT - Edit stock entry
router.put('/api/mill-parts-stock/:id', safeSync(async (req, res) => {
  if (!database.data.mill_parts_stock) return res.status(404).json({ detail: 'Not found' });
  const idx = database.data.mill_parts_stock.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: 'Not found' });
  const existing = database.data.mill_parts_stock[idx];
  const d = req.body;
  const qty = parseFloat(d.quantity) || existing.quantity || 0;
  const rate = parseFloat(d.rate) || existing.rate || 0;
  const update = {
    ...existing,
    date: d.date || existing.date, part_name: d.part_name || existing.part_name,
    txn_type: d.txn_type || existing.txn_type, quantity: qty, rate,
    total_amount: roundAmount(qty * rate),
    party_name: d.party_name !== undefined ? d.party_name : existing.party_name,
    bill_no: d.bill_no !== undefined ? d.bill_no : existing.bill_no,
    remark: d.remark !== undefined ? d.remark : existing.remark,
    store_room: d.store_room !== undefined ? d.store_room : (existing.store_room || ''),
    store_room_name: d.store_room_name !== undefined ? d.store_room_name : (existing.store_room_name || ''),
    updated_at: new Date().toISOString()
  };
  database.data.mill_parts_stock[idx] = update;

  // Update linked local party entry
  if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
  // Get old linked LP IDs for cleanup
  const oldLpIds = database.data.local_party_accounts
    .filter(t => t.linked_stock_id === req.params.id)
    .map(t => t.id);
  database.data.local_party_accounts = database.data.local_party_accounts.filter(t => t.linked_stock_id !== req.params.id);
  // Remove old linked cash_transactions ledger jama entries
  if (database.data.cash_transactions) {
    const refPrefix = `lp_mill_part:${req.params.id.slice(0,8)}`;
    database.data.cash_transactions = database.data.cash_transactions.filter(t => t.reference !== refPrefix);
    if (oldLpIds.length > 0) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        !(oldLpIds.includes(t.linked_local_party_id) && t.account === 'ledger' && t.txn_type === 'jama')
      );
    }
  }
  if (update.txn_type === 'in' && update.party_name && update.total_amount > 0) {
    const lpId = uuidv4();
    database.data.local_party_accounts.push({
      id: lpId, date: update.date, party_name: update.party_name, txn_type: 'debit',
      amount: update.total_amount, description: `${update.part_name} x${update.quantity} @ Rs.${update.rate}`,
      source_type: 'mill_part', reference: `mill_part:${req.params.id.slice(0,8)}`,
      kms_year: d.kms_year || existing.kms_year || '', season: d.season || existing.season || '',
      created_by: d.created_by || 'system', linked_stock_id: req.params.id,
      created_at: new Date().toISOString()
    });

    // Auto create Cash Book Ledger Jama entry
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    database.data.cash_transactions.push({
      id: uuidv4(), date: update.date, account: 'ledger', txn_type: 'jama',
      category: update.party_name, party_type: 'Local Party',
      description: `Mill Part: ${update.part_name} x${update.quantity} @ Rs.${update.rate} - ${update.party_name}`,
      amount: update.total_amount, reference: `lp_mill_part:${req.params.id.slice(0,8)}`,
      kms_year: d.kms_year || existing.kms_year || '', season: d.season || existing.season || '',
      created_by: d.created_by || 'system', linked_local_party_id: lpId,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
  }

  database.save();
  res.json(update);
}));

// ============ STOCK SUMMARY ============
function getStockSummary(query) {
  if (!database.data.mill_parts) database.data.mill_parts = [];
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  let txns = [...database.data.mill_parts_stock];
  if (query.kms_year) txns = txns.filter(t => t.kms_year === query.kms_year);
  if (query.season) txns = txns.filter(t => t.season === query.season);
  const parts = [...database.data.mill_parts];

  // Compute opening stock from previous FY
  const openingStock = {};
  if (query.kms_year) {
    const fyParts = query.kms_year.split('-');
    if (fyParts.length === 2) {
      const prevFy = `${parseInt(fyParts[0])-1}-${parseInt(fyParts[1])-1}`;
      let prevTxns = [...database.data.mill_parts_stock].filter(t => t.kms_year === prevFy);
      if (query.season) prevTxns = prevTxns.filter(t => t.season === query.season);
      for (const t of prevTxns) {
        const pn = t.part_name || '';
        if (!openingStock[pn]) openingStock[pn] = 0;
        if (t.txn_type === 'in') openingStock[pn] += t.quantity || 0;
        else openingStock[pn] -= t.quantity || 0;
      }
    }
  }

  const summary = {};
  for (const p of parts) {
    const ob = Math.round((openingStock[p.name] || 0) * 100) / 100;
    summary[p.name] = { part_name: p.name, category: p.category || '', unit: p.unit || 'Pcs',
      min_stock: p.min_stock || 0, store_room: p.store_room || '', store_room_name: p.store_room_name || '',
      opening_stock: ob, stock_in: 0, stock_used: 0, current_stock: 0,
      total_purchase_amount: 0, parties: {} };
  }
  for (const t of txns) {
    const pn = t.part_name || '';
    if (!summary[pn]) {
      const ob = Math.round((openingStock[pn] || 0) * 100) / 100;
      summary[pn] = { part_name: pn, category: '', unit: 'Pcs', min_stock: 0,
        opening_stock: ob, stock_in: 0, stock_used: 0, current_stock: 0, total_purchase_amount: 0, parties: {} };
    }
    if (t.txn_type === 'in') {
      summary[pn].stock_in += t.quantity || 0;
      summary[pn].total_purchase_amount += t.total_amount || 0;
      const party = t.party_name || '';
      if (party) {
        if (!summary[pn].parties[party]) summary[pn].parties[party] = { qty: 0, amount: 0 };
        summary[pn].parties[party].qty += t.quantity || 0;
        summary[pn].parties[party].amount += t.total_amount || 0;
      }
    } else {
      summary[pn].stock_used += t.quantity || 0;
    }
  }
  const result = [];
  for (const [pn, s] of Object.entries(summary)) {
    s.stock_in = Math.round(s.stock_in * 100) / 100;
    s.stock_used = Math.round(s.stock_used * 100) / 100;
    s.current_stock = Math.round((s.opening_stock + s.stock_in - s.stock_used) * 100) / 100;
    s.total_purchase_amount = Math.round(s.total_purchase_amount * 100) / 100;
    s.parties = Object.entries(s.parties).map(([name, v]) => ({ name, ...v }));
    result.push(s);
  }
  result.sort((a, b) => a.part_name.localeCompare(b.part_name));
  return result;
}

router.get('/api/mill-parts/summary', safeSync(async (req, res) => {
  res.json(getStockSummary(req.query));
}));

// ============ STORE ROOM WISE REPORT ============
router.get('/api/mill-parts/store-room-report', safeSync(async (req, res) => {
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  if (!database.data.mill_parts) database.data.mill_parts = [];
  if (!database.data.store_rooms) database.data.store_rooms = [];

  let txns = [...database.data.mill_parts_stock];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  const parts = [...database.data.mill_parts];

  const partStore = {};
  for (const p of parts) {
    partStore[p.name] = { store_room: p.store_room || '', store_room_name: p.store_room_name || '', category: p.category || '', unit: p.unit || 'Pcs' };
  }

  const stock = {};
  for (const t of txns) {
    const pn = t.part_name || '';
    if (!stock[pn]) {
      const info = partStore[pn] || {};
      stock[pn] = { part_name: pn, store_room: info.store_room || t.store_room || '', store_room_name: info.store_room_name || t.store_room_name || '', category: info.category || '', unit: info.unit || 'Pcs', stock_in: 0, stock_used: 0, current_stock: 0 };
    }
    if (t.txn_type === 'in') stock[pn].stock_in += t.quantity || 0;
    else stock[pn].stock_used += t.quantity || 0;
  }

  for (const p of parts) {
    if (!stock[p.name]) {
      stock[p.name] = { part_name: p.name, store_room: p.store_room || '', store_room_name: p.store_room_name || '', category: p.category || '', unit: p.unit || 'Pcs', stock_in: 0, stock_used: 0, current_stock: 0 };
    }
  }

  const roomGroups = {};
  for (const [pn, s] of Object.entries(stock)) {
    s.stock_in = Math.round(s.stock_in * 100) / 100;
    s.stock_used = Math.round(s.stock_used * 100) / 100;
    s.current_stock = Math.round((s.stock_in - s.stock_used) * 100) / 100;
    const rid = s.store_room || '__unassigned__';
    const rname = s.store_room_name || 'Unassigned';
    if (!roomGroups[rid]) roomGroups[rid] = { store_room_id: rid, store_room_name: rname, parts: [] };
    roomGroups[rid].parts.push(s);
  }

  for (const g of Object.values(roomGroups)) {
    g.parts.sort((a, b) => a.part_name.localeCompare(b.part_name));
  }

  const result = Object.values(roomGroups).sort((a, b) => a.store_room_name.localeCompare(b.store_room_name));
  res.json(result);
}));

// ============ STORE ROOM REPORT EXPORT (Excel) ============
router.get('/api/mill-parts/store-room-report/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  // Re-fetch report data
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  if (!database.data.mill_parts) database.data.mill_parts = [];
  let txns = [...database.data.mill_parts_stock];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  const parts = [...database.data.mill_parts];
  const partStore = {};
  for (const p of parts) { partStore[p.name] = { store_room: p.store_room || '', store_room_name: p.store_room_name || '', category: p.category || '', unit: p.unit || 'Pcs' }; }
  const stock = {};
  for (const t of txns) {
    const pn = t.part_name || '';
    if (!stock[pn]) { const info = partStore[pn] || {}; stock[pn] = { part_name: pn, store_room: info.store_room || '', store_room_name: info.store_room_name || '', category: info.category || '', unit: info.unit || 'Pcs', stock_in: 0, stock_used: 0 }; }
    if (t.txn_type === 'in') stock[pn].stock_in += t.quantity || 0; else stock[pn].stock_used += t.quantity || 0;
  }
  for (const p of parts) { if (!stock[p.name]) { stock[p.name] = { part_name: p.name, store_room: p.store_room || '', store_room_name: p.store_room_name || '', category: p.category || '', unit: p.unit || 'Pcs', stock_in: 0, stock_used: 0 }; } }
  const roomGroups = {};
  for (const s of Object.values(stock)) {
    s.current_stock = Math.round((s.stock_in - s.stock_used) * 100) / 100;
    s.stock_in = Math.round(s.stock_in * 100) / 100;
    s.stock_used = Math.round(s.stock_used * 100) / 100;
    const rid = s.store_room || '__unassigned__'; const rname = s.store_room_name || 'Unassigned';
    if (!roomGroups[rid]) roomGroups[rid] = { store_room_name: rname, parts: [] };
    roomGroups[rid].parts.push(s);
  }
  for (const g of Object.values(roomGroups)) g.parts.sort((a, b) => a.part_name.localeCompare(b.part_name));
  const report = Object.values(roomGroups).sort((a, b) => a.store_room_name.localeCompare(b.store_room_name));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Store Room Report');
  const title = `Store Room-wise Inventory Report${req.query.kms_year ? ' - ' + req.query.kms_year : ''}${req.query.season ? ' (' + req.query.season + ')' : ''}`;
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1a365d' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
  const hdrFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const roomFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0e7490' } };
  const roomFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

  let row = 3;
  for (const group of report) {
    ws.mergeCells(row, 1, row, 6);
    const rc = ws.getCell(row, 1);
    rc.value = `  ${group.store_room_name} (${group.parts.length} parts)`;
    rc.fill = roomFill; rc.font = roomFont;
    row++;

    const headers = ['Part Name', 'Category', 'Unit', 'Stock In', 'Used', 'Current Stock'];
    headers.forEach((h, i) => { const c = ws.getCell(row, i + 1); c.value = h; c.fill = hdrFill; c.font = hdrFont; c.alignment = { horizontal: 'center' }; });
    row++;

    let roomIn = 0, roomUsed = 0;
    for (const p of group.parts) {
      const vals = [p.part_name, p.category, p.unit, p.stock_in, p.stock_used, p.current_stock];
      vals.forEach((v, i) => { ws.getCell(row, i + 1).value = v; ws.getCell(row, i + 1).font = { size: 9 }; });
      if (p.current_stock <= 0) { for (let i = 1; i <= 6; i++) ws.getCell(row, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfee2e2' } }; }
      roomIn += p.stock_in; roomUsed += p.stock_used; row++;
    }
    ws.getCell(row, 1).value = '  Subtotal'; ws.getCell(row, 1).font = { bold: true, size: 9 };
    ws.getCell(row, 4).value = Math.round(roomIn * 100) / 100; ws.getCell(row, 5).value = Math.round(roomUsed * 100) / 100;
    ws.getCell(row, 6).value = Math.round((roomIn - roomUsed) * 100) / 100;
    row += 2;
  }

  ws.columns = [{ width: 22 }, { width: 14 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 14 }];
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=store_room_report.xlsx`);
  res.send(Buffer.from(buf));
}));

// ============ STORE ROOM REPORT EXPORT (PDF) ============
router.get('/api/mill-parts/store-room-report/pdf', safeAsync(async (req, res) => {
  const PDFDocument = require('pdfkit');
  // Re-fetch report data (same logic as excel)
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  if (!database.data.mill_parts) database.data.mill_parts = [];
  let txns = [...database.data.mill_parts_stock];
  if (req.query.kms_year) txns = txns.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) txns = txns.filter(t => t.season === req.query.season);
  const parts = [...database.data.mill_parts];
  const partStore = {};
  for (const p of parts) { partStore[p.name] = { store_room: p.store_room || '', store_room_name: p.store_room_name || '', category: p.category || '', unit: p.unit || 'Pcs' }; }
  const stock = {};
  for (const t of txns) {
    const pn = t.part_name || '';
    if (!stock[pn]) { const info = partStore[pn] || {}; stock[pn] = { part_name: pn, store_room: info.store_room || '', store_room_name: info.store_room_name || '', category: info.category || '', unit: info.unit || 'Pcs', stock_in: 0, stock_used: 0 }; }
    if (t.txn_type === 'in') stock[pn].stock_in += t.quantity || 0; else stock[pn].stock_used += t.quantity || 0;
  }
  for (const p of parts) { if (!stock[p.name]) { stock[p.name] = { part_name: p.name, store_room: p.store_room || '', store_room_name: p.store_room_name || '', category: p.category || '', unit: p.unit || 'Pcs', stock_in: 0, stock_used: 0 }; } }
  const roomGroups = {};
  for (const s of Object.values(stock)) {
    s.current_stock = Math.round((s.stock_in - s.stock_used) * 100) / 100;
    s.stock_in = Math.round(s.stock_in * 100) / 100;
    s.stock_used = Math.round(s.stock_used * 100) / 100;
    const rid = s.store_room || '__unassigned__'; const rname = s.store_room_name || 'Unassigned';
    if (!roomGroups[rid]) roomGroups[rid] = { store_room_name: rname, parts: [] };
    roomGroups[rid].parts.push(s);
  }
  for (const g of Object.values(roomGroups)) g.parts.sort((a, b) => a.part_name.localeCompare(b.part_name));
  const report = Object.values(roomGroups).sort((a, b) => a.store_room_name.localeCompare(b.store_room_name));

  const doc = createPdfDoc({ size: 'A4', layout: 'landscape', margin: 30 }, database);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=store_room_report.pdf`);
  // PDF will be sent via safePdfPipe

  const title = `Store Room-wise Inventory Report${req.query.kms_year ? ' - ' + req.query.kms_year : ''}${req.query.season ? ' (' + req.query.season + ')' : ''}`;
  doc.fontSize(16).fillColor('#1a365d').text(title, { align: 'center' });
  doc.moveDown(0.5);

  const colX = [30, 170, 260, 310, 380, 440];
  const colW = [140, 90, 50, 70, 60, 100];
  const headers = ['Part Name', 'Category', 'Unit', 'Stock In', 'Used', 'Current Stock'];

  for (const group of report) {
    if (doc.y > 450) doc.addPage();
    doc.fontSize(12).fillColor('#0e7490').text(`${group.store_room_name} (${group.parts.length} parts)`, 30);
    doc.moveDown(0.3);

    // Header row
    const hy = doc.y;
    doc.rect(30, hy, 510, 16).fill('#1a365d');
    headers.forEach((h, i) => { doc.fontSize(8).fillColor('white').text(h, colX[i], hy + 3, { width: colW[i], align: i >= 3 ? 'right' : 'left' }); });
    doc.y = hy + 18;

    for (const p of group.parts) {
      if (doc.y > 520) { doc.addPage(); }
      const y = doc.y;
      if (p.current_stock <= 0) doc.rect(30, y - 1, 510, 14).fill('#fee2e2');
      const vals = [p.part_name, p.category, p.unit, String(p.stock_in), String(p.stock_used), String(p.current_stock)];
      vals.forEach((v, i) => { doc.fontSize(7).fillColor('#333').text(v, colX[i], y + 2, { width: colW[i], align: i >= 3 ? 'right' : 'left' }); });
      doc.y = y + 14;
    }
    doc.moveDown(0.5);
  }

  await safePdfPipe(doc, res);
}));

// ============ STOCK EXPORT (Excel) ============
router.get('/api/mill-parts/summary/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  const summary = getStockSummary(req.query);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mill Parts Stock');
  ws.mergeCells('A1:I1');
  const title = `Mill Parts Stock Summary${req.query.kms_year ? ' - ' + req.query.kms_year : ''}${req.query.season ? ' (' + req.query.season + ')' : ''}`;
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1a365d' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  const headers = ['Part Name', 'Category', 'Store Room', 'Unit', 'Stock In', 'Stock Used', 'Current Stock', 'Purchase Amount (Rs)', 'Parties'];
  const hdrRow = ws.addRow([]); const hr = ws.addRow(headers);
  hr.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
    c.border = { top: {style:'thin',color:{argb:'FFcbd5e1'}}, bottom: {style:'thin',color:{argb:'FFcbd5e1'}}, left: {style:'thin',color:{argb:'FFcbd5e1'}}, right: {style:'thin',color:{argb:'FFcbd5e1'}} };
    c.alignment = { horizontal: 'center' };
  });

  const thinB = { top: {style:'thin',color:{argb:'FFcbd5e1'}}, bottom: {style:'thin',color:{argb:'FFcbd5e1'}}, left: {style:'thin',color:{argb:'FFcbd5e1'}}, right: {style:'thin',color:{argb:'FFcbd5e1'}} };
  const altFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf8fafc' } };
  let totalPurchase = 0;
  summary.forEach((s, idx) => {
    totalPurchase += s.total_purchase_amount;
    const r = ws.addRow([s.part_name, s.category, s.store_room_name || '', s.unit, s.stock_in, s.stock_used, s.current_stock, s.total_purchase_amount, (s.parties||[]).map(p => p.name).join(', ')]);
    r.eachCell(c => { c.border = thinB; c.font = { size: 9 }; if (idx % 2 === 1) c.fill = altFill; });
  });
  const tr = ws.addRow(['TOTAL','','','','','','',totalPurchase,'']);
  tr.eachCell(c => { c.border = thinB; c.font = { bold: true, size: 10, color: { argb: 'FF1a365d' } }; });

  [20, 14, 14, 8, 12, 12, 14, 18, 25].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=mill_parts_stock.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

// ============ STOCK EXPORT (PDF) ============
router.get('/api/mill-parts/summary/pdf', safeSync(async (req, res) => {
  const summary = getStockSummary(req.query);
  const doc = createPdfDoc({ size: 'A4', layout: 'landscape', margin: 25 }, database);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mill_parts_stock.pdf`);
  // PDF will be sent via safePdfPipe

  const C = { hdr: '#1a365d', border: '#cbd5e1', alt: '#f8fafc', blue: '#e0f2fe' };
  const title = `Mill Parts Stock Summary${req.query.kms_year ? ' - ' + req.query.kms_year : ''}`;
  doc.fontSize(16).font(F('bold')).fillColor(C.hdr).text(title, { align: 'center' });
  doc.moveDown(0.5);

  const headers = ['Part', 'Category', 'Store Room', 'Unit', 'In', 'Used', 'Stock', 'Amount (Rs)', 'Parties'];
  const colW = [80, 55, 60, 35, 45, 45, 50, 75, 100];
  const startX = 25; let y = doc.y; const rowH = 16;
  const totalW = colW.reduce((a,b)=>a+b,0);

  // Header
  let x = startX;
  doc.rect(x, y, totalW, rowH).fill(C.hdr);
  headers.forEach((h, i) => {
    doc.rect(x, y, colW[i], rowH).stroke(C.border);
    doc.fillColor('white').font(F('bold')).fontSize(7).text(h, x+3, y+3, {width:colW[i]-6,height:rowH,lineBreak:false});
    x += colW[i];
  });
  y += rowH;

  let totalPurchase = 0;
  summary.forEach((s, ri) => {
    if (y + rowH > doc.page.height - 25) { doc.addPage(); y = 25; }
    totalPurchase += s.total_purchase_amount;
    x = startX;
    doc.rect(x, y, totalW, rowH).fill(ri%2===0?'#ffffff':C.alt);
    const vals = [s.part_name, s.category, s.store_room_name || '', s.unit, s.stock_in, s.stock_used, s.current_stock, `Rs.${Math.round(s.total_purchase_amount).toLocaleString()}`, (s.parties||[]).map(p=>p.name).join(', ')];
    vals.forEach((v, i) => {
      doc.rect(x, y, colW[i], rowH).stroke(C.border);
      doc.fillColor('#1e293b').font(F('normal')).fontSize(6).text(String(v??''), x+2, y+3, {width:colW[i]-4,height:rowH,lineBreak:false});
      x += colW[i];
    });
    y += rowH;
  });

  // Totals
  x = startX;
  doc.rect(x, y, totalW, rowH).fill(C.blue);
  ['TOTAL','','','','','','',`Rs.${Math.round(totalPurchase).toLocaleString()}`,''].forEach((v,i) => {
    doc.rect(x, y, colW[i], rowH).stroke(C.border);
    doc.fillColor('#1e293b').font(F('bold')).fontSize(7).text(String(v), x+2, y+3, {width:colW[i]-4,height:rowH,lineBreak:false});
    x += colW[i];
  });

  await safePdfPipe(doc, res);
}));

// ============ TRANSACTION EXPORT (Excel) ============
router.get('/api/mill-parts-stock/export/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  let items = [...(database.data.mill_parts_stock || [])];
  if (req.query.kms_year) items = items.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) items = items.filter(t => t.season === req.query.season);
  if (req.query.part_name) items = items.filter(t => t.part_name === req.query.part_name);
  if (req.query.txn_type) items = items.filter(t => t.txn_type === req.query.txn_type);
  if (req.query.date_from) items = items.filter(t => (t.date||'') >= req.query.date_from);
  if (req.query.date_to) items = items.filter(t => (t.date||'') <= req.query.date_to);
  items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Parts Transactions');
  let title = 'Mill Parts Transactions';
  if (req.query.part_name) title += ` - ${req.query.part_name}`;
  if (req.query.date_from || req.query.date_to) title += ` (${req.query.date_from||'...'} to ${req.query.date_to||'...'})`;
  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1a365d' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  const headers = ['Date','Part Name','Store Room','Type','Qty','Rate','Amount (Rs)','Party','Bill No','Remark'];
  ws.addRow([]); const hr = ws.addRow(headers);
  hr.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
    c.border = { top:{style:'thin',color:{argb:'FFcbd5e1'}},bottom:{style:'thin',color:{argb:'FFcbd5e1'}},left:{style:'thin',color:{argb:'FFcbd5e1'}},right:{style:'thin',color:{argb:'FFcbd5e1'}} };
    c.alignment = { horizontal: 'center' };
  });

  const thinB = { top:{style:'thin',color:{argb:'FFcbd5e1'}},bottom:{style:'thin',color:{argb:'FFcbd5e1'}},left:{style:'thin',color:{argb:'FFcbd5e1'}},right:{style:'thin',color:{argb:'FFcbd5e1'}} };
  const inFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdcfce7' } };
  const usedFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfee2e2' } };
  let totalAmt = 0;
  items.forEach(t => {
    const typ = t.txn_type === 'in' ? 'IN' : 'USED';
    const amt = t.total_amount || t.total_cost || 0;
    if (t.txn_type === 'in') totalAmt += amt;
    const r = ws.addRow([fmtDate(t.date), t.part_name, t.store_room_name||'', typ, t.quantity, t.rate||0, amt, t.party_name||'', t.bill_no||'', t.remark||'']);
    r.eachCell((c, ci) => { c.border = thinB; c.font = { size: 9 }; if (ci === 4) c.fill = typ === 'IN' ? inFill : usedFill; });
  });
  const tr = ws.addRow(['TOTAL','','','','','',totalAmt,'','','']);
  tr.eachCell(c => { c.border = thinB; c.font = { bold: true, size: 10, color: { argb: 'FF1a365d' } }; });

  [12, 18, 12, 8, 8, 10, 14, 18, 12, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=mill_parts_transactions.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

// ============ TRANSACTION EXPORT (PDF) ============
router.get('/api/mill-parts-stock/export/pdf', safeSync(async (req, res) => {
  const PDFDocument = require('pdfkit');
  let items = [...(database.data.mill_parts_stock || [])];
  if (req.query.kms_year) items = items.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) items = items.filter(t => t.season === req.query.season);
  if (req.query.part_name) items = items.filter(t => t.part_name === req.query.part_name);
  if (req.query.txn_type) items = items.filter(t => t.txn_type === req.query.txn_type);
  if (req.query.date_from) items = items.filter(t => (t.date||'') >= req.query.date_from);
  if (req.query.date_to) items = items.filter(t => (t.date||'') <= req.query.date_to);
  items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));

  const doc = createPdfDoc({ size: 'A4', layout: 'landscape', margin: 25 }, database);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mill_parts_transactions.pdf`);
  // PDF will be sent via safePdfPipe

  const C = { hdr: '#1a365d', border: '#cbd5e1', inBg: '#f0fdf4', usedBg: '#fef2f2', inBg2: '#dcfce7', usedBg2: '#fee2e2', blue: '#e0f2fe' };
  let title = 'Mill Parts Transactions';
  if (req.query.part_name) title += ` - ${req.query.part_name}`;
  doc.fontSize(16).font(F('bold')).fillColor(C.hdr).text(title, { align: 'center' });
  const sub = [];
  if (req.query.date_from || req.query.date_to) sub.push(`Date: ${req.query.date_from||'...'} to ${req.query.date_to||'...'}`);
  if (req.query.kms_year) sub.push(`FY: ${req.query.kms_year}`);
  if (sub.length) doc.fontSize(8).font(F('normal')).fillColor('grey').text(sub.join(' | '), { align: 'center' });
  doc.moveDown(0.5);

  const headers = ['Date','Part','Store Room','Type','Qty','Rate','Amount','Party','Bill No','Remark'];
  const colW = [50, 65, 55, 30, 30, 40, 55, 65, 45, 65];
  const startX = 25; let y = doc.y; const rowH = 15;
  const totalW = colW.reduce((a,b)=>a+b,0);

  let x = startX;
  doc.rect(x, y, totalW, rowH).fill(C.hdr);
  headers.forEach((h, i) => {
    doc.rect(x, y, colW[i], rowH).stroke(C.border);
    doc.fillColor('white').font(F('bold')).fontSize(6.5).text(h, x+2, y+3, {width:colW[i]-4,height:rowH,lineBreak:false});
    x += colW[i];
  });
  y += rowH;

  let totalAmt = 0;
  items.forEach((t, ri) => {
    if (y + rowH > doc.page.height - 25) { doc.addPage(); y = 25; }
    const isIn = t.txn_type === 'in';
    const amt = t.total_amount || t.total_cost || 0;
    if (isIn) totalAmt += amt;
    x = startX;
    const bg = ri%2===0 ? (isIn?C.inBg:C.usedBg) : (isIn?C.inBg2:C.usedBg2);
    doc.rect(x, y, totalW, rowH).fill(bg);
    const vals = [fmtDate(t.date), t.part_name, t.store_room_name||'', isIn?'IN':'USED', t.quantity, t.rate||0, amt?`Rs.${Math.round(amt).toLocaleString()}`:'-', t.party_name||'', t.bill_no||'', t.remark||''];
    vals.forEach((v, i) => {
      doc.rect(x, y, colW[i], rowH).stroke(C.border);
      doc.fillColor('#1e293b').font(F('normal')).fontSize(6).text(String(v??''), x+2, y+3, {width:colW[i]-4,height:rowH,lineBreak:false});
      x += colW[i];
    });
    y += rowH;
  });

  // Total row
  x = startX;
  doc.rect(x, y, totalW, rowH).fill(C.blue);
  ['TOTAL','','','','','',`Rs.${Math.round(totalAmt).toLocaleString()}`,'','',''].forEach((v,i) => {
    doc.rect(x, y, colW[i], rowH).stroke(C.border);
    doc.fillColor('#1e293b').font(F('bold')).fontSize(7).text(String(v), x+2, y+3, {width:colW[i]-4,height:rowH,lineBreak:false});
    x += colW[i];
  });

  await safePdfPipe(doc, res);
}));


// ============ SINGLE PART SUMMARY EXPORT ============
router.get('/api/mill-parts/part-summary/excel', safeAsync(async (req, res) => {
  const { part_name, kms_year, season } = req.query;
  if (!part_name) return res.status(400).json({ detail: 'part_name required' });
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  if (!database.data.mill_parts) database.data.mill_parts = [];
  let txns = database.data.mill_parts_stock.filter(t => t.part_name === part_name);
  if (kms_year) txns = txns.filter(t => t.kms_year === kms_year);
  if (season) txns = txns.filter(t => t.season === season);
  txns.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));
  const partInfo = database.data.mill_parts.find(p => p.name === part_name) || {};
  const unit = partInfo.unit || 'Pcs';
  const category = partInfo.category || 'General';
  const stockIn = +txns.filter(t => t.txn_type === 'in').reduce((s, t) => s + (t.quantity || 0), 0).toFixed(2);
  const stockUsed = +txns.filter(t => t.txn_type !== 'in').reduce((s, t) => s + (t.quantity || 0), 0).toFixed(2);
  const purchaseAmt = +txns.filter(t => t.txn_type === 'in').reduce((s, t) => s + (t.total_amount || t.total_cost || 0), 0).toFixed(2);
  const parties = {};
  txns.filter(t => t.txn_type === 'in' && t.party_name).forEach(t => {
    if (!parties[t.party_name]) parties[t.party_name] = { qty: 0, amount: 0 };
    parties[t.party_name].qty += (t.quantity || 0);
    parties[t.party_name].amount += (t.total_amount || t.total_cost || 0);
  });
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(part_name + ' Summary');
  // Title
  ws.mergeCells('A1:F1'); ws.getCell('A1').value = `${part_name} - Part Summary`;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1a365d' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells('A2:F2'); ws.getCell('A2').value = `Category: ${category} | Unit: ${unit} | Store Room: ${partInfo.store_room_name || 'N/A'}`;
  ws.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF666666' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  // Overview
  ws.getCell('A4').value = 'STOCK OVERVIEW'; ws.getCell('A4').font = { bold: true, size: 12, color: { argb: 'FF1a365d' } };
  ['Stock In', 'Stock Used', 'Current Stock', 'Total Purchase'].forEach((h, i) => {
    const c = ws.getCell(5, i + 1); c.value = h;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.alignment = { horizontal: 'center' };
  });
  [stockIn, stockUsed, +(stockIn - stockUsed).toFixed(2), `Rs.${purchaseAmt.toLocaleString()}`].forEach((v, i) => {
    const c = ws.getCell(6, i + 1); c.value = v;
    c.font = { bold: true, size: 11 }; c.alignment = { horizontal: 'center' };
  });
  let row = 8;
  // Parties
  const partyKeys = Object.keys(parties).sort();
  if (partyKeys.length) {
    ws.getCell(`A${row}`).value = 'PARTY-WISE PURCHASE'; ws.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: 'FF1a365d' } }; row++;
    ['Party Name', 'Quantity', 'Amount (Rs.)'].forEach((h, i) => {
      const c = ws.getCell(row, i + 1); c.value = h;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    }); row++;
    partyKeys.forEach(pn => {
      ws.getCell(row, 1).value = pn; ws.getCell(row, 1).font = { bold: true, size: 10 };
      ws.getCell(row, 2).value = +parties[pn].qty.toFixed(2);
      ws.getCell(row, 3).value = +parties[pn].amount.toFixed(2); row++;
    });
    ws.getCell(row, 1).value = 'TOTAL'; ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 2).value = +partyKeys.reduce((s, k) => s + parties[k].qty, 0).toFixed(2); ws.getCell(row, 2).font = { bold: true };
    ws.getCell(row, 3).value = +partyKeys.reduce((s, k) => s + parties[k].amount, 0).toFixed(2); ws.getCell(row, 3).font = { bold: true };
    row += 2;
  }
  // Transactions
  ws.getCell(`A${row}`).value = 'ALL TRANSACTIONS'; ws.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: 'FF1a365d' } }; row++;
  ['Date', 'Type', 'Qty', 'Rate', 'Amount', 'Party', 'Bill No', 'Remark'].forEach((h, i) => {
    const c = ws.getCell(row, i + 1); c.value = h;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  }); row++;
  txns.forEach(t => {
    ws.getCell(row, 1).value = fmtDate(t.date || '');
    ws.getCell(row, 2).value = t.txn_type === 'in' ? 'IN' : 'USED';
    ws.getCell(row, 3).value = t.quantity || 0;
    ws.getCell(row, 4).value = t.rate || 0;
    ws.getCell(row, 5).value = t.total_amount || t.total_cost || 0;
    ws.getCell(row, 6).value = t.party_name || '';
    ws.getCell(row, 7).value = t.bill_no || '';
    ws.getCell(row, 8).value = t.remark || '';
    for (let ci = 1; ci <= 8; ci++) ws.getCell(row, ci).font = { size: 9 };
    row++;
  });
  [12, 8, 8, 10, 14, 18, 12, 18].forEach((w, i) => ws.getColumn(i + 1).width = w);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${part_name.replace(/ /g, '_')}_summary.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

router.get('/api/mill-parts/part-summary/pdf', safeSync(async (req, res) => {
  const { part_name, kms_year, season } = req.query;
  if (!part_name) return res.status(400).json({ detail: 'part_name required' });
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  if (!database.data.mill_parts) database.data.mill_parts = [];
  let txns = database.data.mill_parts_stock.filter(t => t.part_name === part_name);
  if (kms_year) txns = txns.filter(t => t.kms_year === kms_year);
  if (season) txns = txns.filter(t => t.season === season);
  txns.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)) || (a.created_at||'').localeCompare(b.created_at||''));
  const partInfo = database.data.mill_parts.find(p => p.name === part_name) || {};
  const unit = partInfo.unit || 'Pcs';
  const category = partInfo.category || 'General';
  const stockIn = +txns.filter(t => t.txn_type === 'in').reduce((s, t) => s + (t.quantity || 0), 0).toFixed(2);
  const stockUsed = +txns.filter(t => t.txn_type !== 'in').reduce((s, t) => s + (t.quantity || 0), 0).toFixed(2);
  const purchaseAmt = +txns.filter(t => t.txn_type === 'in').reduce((s, t) => s + (t.total_amount || t.total_cost || 0), 0).toFixed(2);
  const parties = {};
  txns.filter(t => t.txn_type === 'in' && t.party_name).forEach(t => {
    if (!parties[t.party_name]) parties[t.party_name] = { qty: 0, amount: 0 };
    parties[t.party_name].qty += (t.quantity || 0);
    parties[t.party_name].amount += (t.total_amount || t.total_cost || 0);
  });
  const PDFDocument = require('pdfkit');
  const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
  branding._watermark = ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark');
  const doc = createPdfDoc({ size: 'A4', layout: 'landscape', margin: 30 }, database);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${part_name.replace(/ /g, '_')}_summary.pdf`);
  // PDF will be sent via safePdfPipe
  _addPdfH(doc, `${part_name} - Part Summary`, branding);
  doc.fontSize(9).fillColor('#666666').text(`Category: ${category} | Unit: ${unit} | Store Room: ${partInfo.store_room_name || 'N/A'}`, { align: 'center' });
  doc.moveDown(0.5);
  // Overview
  doc.fontSize(11).fillColor('#1a365d').font(F('bold')).text('Stock Overview');
  doc.moveDown(0.3);
  addPdfTable(doc, ['Stock In', 'Stock Used', 'Current Stock', 'Total Purchase'],
    [[`${stockIn} ${unit}`, `${stockUsed} ${unit}`, `${+(stockIn - stockUsed).toFixed(2)} ${unit}`, `Rs.${purchaseAmt.toLocaleString()}`]], [130, 130, 130, 150]);
  doc.moveDown(0.5);
  // Parties
  const partyKeys = Object.keys(parties).sort();
  if (partyKeys.length) {
    doc.fontSize(11).fillColor('#1a365d').font(F('bold')).text('Party-wise Purchase');
    doc.moveDown(0.3);
    const pRows = partyKeys.map(k => [k, (+parties[k].qty.toFixed(2)).toString(), `Rs.${(+parties[k].amount.toFixed(2)).toLocaleString()}`]);
    pRows.push(['TOTAL', (+partyKeys.reduce((s, k) => s + parties[k].qty, 0).toFixed(2)).toString(), `Rs.${(+partyKeys.reduce((s, k) => s + parties[k].amount, 0).toFixed(2)).toLocaleString()}`]);
    addPdfTable(doc, ['Party Name', `Qty (${unit})`, 'Amount (Rs.)'], pRows, [180, 100, 130]);
    doc.moveDown(0.5);
  }
  // Transactions
  if (txns.length) {
    doc.fontSize(11).fillColor('#1a365d').font(F('bold')).text('All Transactions');
    doc.moveDown(0.3);
    const tRows = txns.map(t => [fmtDate(t.date), t.txn_type==='in'?'IN':'USED', t.quantity||0, t.rate||0,
      (t.total_amount||t.total_cost||0), t.party_name||'-', t.bill_no||'-']);
    addPdfTable(doc, ['Date','Type','Qty','Rate','Amount','Party','Bill No'], tRows, [60,40,40,45,60,100,60]);
  }
  await safePdfPipe(doc, res);
}));

  return router;
};
