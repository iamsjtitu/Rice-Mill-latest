const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function(database) {

// ============ MILL PARTS MASTER ============
router.post('/api/mill-parts', safeSync((req, res) => {
  if (!database.data.mill_parts) database.data.mill_parts = [];
  const d = req.body;
  const name = (d.name || '').trim();
  if (!name) return res.status(400).json({ detail: 'Part name is required' });
  const existing = database.data.mill_parts.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) return res.status(400).json({ detail: 'Part already exists' });
  const doc = {
    id: uuidv4(), name, category: d.category || 'General', unit: d.unit || 'Pcs',
    min_stock: parseFloat(d.min_stock) || 0, created_at: new Date().toISOString()
  };
  database.data.mill_parts.push(doc); database.save(); res.json(doc);
}));

router.get('/api/mill-parts', safeSync((req, res) => {
  if (!database.data.mill_parts) database.data.mill_parts = [];
  const items = [...database.data.mill_parts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.json(items);
}));

router.delete('/api/mill-parts/:id', safeSync((req, res) => {
  if (!database.data.mill_parts) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.mill_parts.length;
  database.data.mill_parts = database.data.mill_parts.filter(p => p.id !== req.params.id);
  if (database.data.mill_parts.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
}));

// ============ MILL PARTS STOCK TRANSACTIONS ============
router.post('/api/mill-parts-stock', safeSync((req, res) => {
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  const d = req.body;
  const qty = parseFloat(d.quantity) || 0;
  const rate = parseFloat(d.rate) || 0;
  if (!(d.part_name || '').trim() || qty <= 0) return res.status(400).json({ detail: 'Part name and quantity required' });
  const doc = {
    id: uuidv4(), date: d.date || '', part_name: d.part_name || '', txn_type: d.txn_type || 'in',
    quantity: qty, rate, total_amount: Math.round(qty * rate * 100) / 100,
    party_name: d.party_name || '', bill_no: d.bill_no || '', remark: d.remark || '',
    kms_year: d.kms_year || '', season: d.season || '',
    created_by: d.created_by || '', created_at: new Date().toISOString()
  };
  database.data.mill_parts_stock.push(doc); database.save(); res.json(doc);
}));

router.get('/api/mill-parts-stock', safeSync((req, res) => {
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  let items = [...database.data.mill_parts_stock];
  if (req.query.part_name) items = items.filter(t => t.part_name === req.query.part_name);
  if (req.query.txn_type) items = items.filter(t => t.txn_type === req.query.txn_type);
  if (req.query.kms_year) items = items.filter(t => t.kms_year === req.query.kms_year);
  if (req.query.season) items = items.filter(t => t.season === req.query.season);
  if (req.query.party_name) items = items.filter(t => (t.party_name || '').toLowerCase().includes(req.query.party_name.toLowerCase()));
  res.json(items.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
}));

router.delete('/api/mill-parts-stock/:id', safeSync((req, res) => {
  if (!database.data.mill_parts_stock) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.mill_parts_stock.length;
  database.data.mill_parts_stock = database.data.mill_parts_stock.filter(t => t.id !== req.params.id);
  if (database.data.mill_parts_stock.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
}));

// ============ STOCK SUMMARY ============
function getStockSummary(query) {
  if (!database.data.mill_parts) database.data.mill_parts = [];
  if (!database.data.mill_parts_stock) database.data.mill_parts_stock = [];
  let txns = [...database.data.mill_parts_stock];
  if (query.kms_year) txns = txns.filter(t => t.kms_year === query.kms_year);
  if (query.season) txns = txns.filter(t => t.season === query.season);
  const parts = [...database.data.mill_parts];

  const summary = {};
  for (const p of parts) {
    summary[p.name] = { part_name: p.name, category: p.category || '', unit: p.unit || 'Pcs',
      min_stock: p.min_stock || 0, stock_in: 0, stock_used: 0, current_stock: 0,
      total_purchase_amount: 0, parties: {} };
  }
  for (const t of txns) {
    const pn = t.part_name || '';
    if (!summary[pn]) summary[pn] = { part_name: pn, category: '', unit: 'Pcs', min_stock: 0,
      stock_in: 0, stock_used: 0, current_stock: 0, total_purchase_amount: 0, parties: {} };
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
    s.current_stock = Math.round((s.stock_in - s.stock_used) * 100) / 100;
    s.total_purchase_amount = Math.round(s.total_purchase_amount * 100) / 100;
    s.parties = Object.entries(s.parties).map(([name, v]) => ({ name, ...v }));
    result.push(s);
  }
  result.sort((a, b) => a.part_name.localeCompare(b.part_name));
  return result;
}

router.get('/api/mill-parts/summary', safeSync((req, res) => {
  res.json(getStockSummary(req.query));
}));

// ============ STOCK EXPORT (Excel) ============
router.get('/api/mill-parts/summary/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  const summary = getStockSummary(req.query);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mill Parts Stock');
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = `Mill Parts Stock Summary${req.query.kms_year ? ' - ' + req.query.kms_year : ''}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  const headers = ['Part Name', 'Category', 'Unit', 'Stock In', 'Stock Used', 'Current Stock', 'Purchase Amount'];
  const hdrRow = ws.addRow([]); ws.addRow(headers);
  ws.getRow(3).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }; });
  for (const s of summary) {
    ws.addRow([s.part_name, s.category, s.unit, s.stock_in, s.stock_used, s.current_stock, s.total_purchase_amount]);
  }
  for (let i = 1; i <= 7; i++) ws.getColumn(i).width = 18;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=mill_parts_stock.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

// ============ STOCK EXPORT (PDF) ============
router.get('/api/mill-parts/summary/pdf', safeSync((req, res) => {
  const PDFDocument = require('pdfkit');
  const summary = getStockSummary(req.query);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=mill_parts_stock.pdf');
  doc.pipe(res);
  doc.fontSize(16).text(`Mill Parts Stock Summary${req.query.kms_year ? ' - ' + req.query.kms_year : ''}`, { align: 'center' });
  doc.moveDown();
  const headers = ['Part', 'Category', 'Unit', 'In', 'Used', 'Stock', 'Amount'];
  const colW = [120, 80, 50, 60, 60, 60, 80];
  let x = 30, y = doc.y;
  doc.fontSize(8).font('Helvetica-Bold');
  headers.forEach((h, i) => { doc.text(h, x, y, { width: colW[i] }); x += colW[i]; });
  doc.font('Helvetica').fontSize(7);
  for (const s of summary) {
    y += 14; x = 30;
    if (y > 550) { doc.addPage(); y = 30; }
    const vals = [s.part_name, s.category, s.unit, s.stock_in, s.stock_used, s.current_stock, `Rs.${s.total_purchase_amount}`];
    vals.forEach((v, i) => { doc.text(String(v), x, y, { width: colW[i] }); x += colW[i]; });
  }
  doc.end();
}));

  return router;
};
