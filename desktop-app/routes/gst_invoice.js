const express = require('express');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

let registerFonts;
try {
  registerFonts = require('../shared/register_fonts');
} catch (_) {
  registerFonts = null;
}

module.exports = function(database) {
  const router = express.Router();
  const db = database;

  const safeSync = (fn) => (req, res, next) => { try { fn(req, res, next); } catch(e) { console.error('[GST_INVOICE]', e); res.status(500).json({ error: e.message }); }};
  const safeAsync = (fn) => async (req, res, next) => { try { await fn(req, res, next); } catch(e) { console.error('[GST_INVOICE]', e); res.status(500).json({ error: e.message }); }};

  // ============ GST COMPANY SETTINGS ============
  router.get('/api/gst-company-settings', safeSync((req, res) => {
    const settings = db.getData('/settings/gst_company', { company_name: '', gstin: '', address: '', state_code: '21', state_name: 'Odisha', phone: '', bank_name: '', bank_account: '', bank_ifsc: '' });
    res.json(settings);
  }));

  router.put('/api/gst-company-settings', safeSync((req, res) => {
    db.setData('/settings/gst_company', req.body);
    res.json({ success: true });
  }));

  // ============ GST INVOICE CRUD ============
  function calcTotals(items, is_igst) {
    const taxable = items.reduce((s, it) => s + (it.qty || 0) * (it.rate || 0), 0);
    const gst = items.reduce((s, it) => s + (it.qty || 0) * (it.rate || 0) * (it.gst_pct || 0) / 100, 0);
    return {
      taxable: Math.round(taxable * 100) / 100,
      gst: Math.round(gst * 100) / 100,
      cgst: is_igst ? 0 : Math.round(gst / 2 * 100) / 100,
      sgst: is_igst ? 0 : Math.round(gst / 2 * 100) / 100,
      igst: is_igst ? Math.round(gst * 100) / 100 : 0,
      total: Math.round((taxable + gst) * 100) / 100,
    };
  }

  router.get('/api/gst-invoices', safeSync((req, res) => {
    let invoices = db.getData('/gst_invoices', []);
    const { kms_year, season } = req.query;
    if (kms_year) invoices = invoices.filter(i => i.kms_year === kms_year);
    if (season) invoices = invoices.filter(i => i.season === season);
    invoices.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(invoices);
  }));

  router.post('/api/gst-invoices', safeSync((req, res) => {
    const inv = { ...req.body, id: uuidv4(), created_at: new Date().toISOString() };
    inv.totals = calcTotals(inv.items || [], inv.is_igst);
    const invoices = db.getData('/gst_invoices', []);
    invoices.push(inv);
    db.setData('/gst_invoices', invoices);
    res.json(inv);
  }));

  router.put('/api/gst-invoices/:id', safeSync((req, res) => {
    const invoices = db.getData('/gst_invoices', []);
    const idx = invoices.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const upd = { ...req.body, id: req.params.id, created_at: invoices[idx].created_at, updated_at: new Date().toISOString() };
    upd.totals = calcTotals(upd.items || [], upd.is_igst);
    invoices[idx] = upd;
    db.setData('/gst_invoices', invoices);
    res.json({ success: true, totals: upd.totals });
  }));

  router.delete('/api/gst-invoices/:id', safeSync((req, res) => {
    let invoices = db.getData('/gst_invoices', []);
    const before = invoices.length;
    invoices = invoices.filter(i => i.id !== req.params.id);
    if (invoices.length === before) return res.status(404).json({ error: 'Not found' });
    db.setData('/gst_invoices', invoices);
    res.json({ success: true });
  }));

  // ============ GST INVOICE PDF ============
  router.get('/api/gst-invoices/:id/pdf', safeSync((req, res) => {
    const invoices = db.getData('/gst_invoices', []);
    const inv = invoices.find(i => i.id === req.params.id);
    if (!inv) return res.status(404).json({ error: 'Not found' });

    const company = db.getData('/settings/gst_company', {});
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=GST_Invoice_${inv.invoice_no || inv.id}.pdf`);
    doc.pipe(res);

    if (registerFonts) registerFonts(doc);
    const bfont = doc._registeredFonts && doc._registeredFonts['FreeSansBold'] ? 'FreeSansBold' : 'Helvetica-Bold';
    const nfont = doc._registeredFonts && doc._registeredFonts['FreeSans'] ? 'FreeSans' : 'Helvetica';

    const W = doc.page.width - 80; // total usable width
    const L = 40; // left margin

    // === HEADER ===
    doc.font(bfont).fontSize(16).text(company.company_name || 'COMPANY NAME', L, 40, { align: 'center', width: W });
    let y = doc.y;
    if (company.address) { doc.font(nfont).fontSize(9).fillColor('#666').text(company.address, L, y, { align: 'center', width: W }); y = doc.y; }
    if (company.gstin) { doc.font(nfont).fontSize(9).fillColor('#666').text(`GSTIN: ${company.gstin}`, L, y, { align: 'center', width: W }); y = doc.y; }
    if (company.phone) { doc.font(nfont).fontSize(9).fillColor('#666').text(`Phone: ${company.phone}`, L, y, { align: 'center', width: W }); y = doc.y; }
    y += 6;
    doc.moveTo(L, y).lineTo(L + W, y).strokeColor('#334155').lineWidth(1).stroke();
    y += 8;

    // TAX INVOICE
    doc.font(bfont).fontSize(14).fillColor('#1e40af').text('TAX INVOICE', L, y, { align: 'center', width: W });
    y = doc.y + 8;

    // Invoice info
    doc.font(nfont).fontSize(9).fillColor('#000');
    doc.text(`Invoice No: ${inv.invoice_no || ''}`, L, y);
    doc.text(`Date: ${inv.date || ''}`, L + W - 150, y, { width: 150, align: 'right' });
    y = doc.y + 4;
    doc.font(bfont).fontSize(10).text(`Bill To: ${inv.buyer_name || ''}`, L, y);
    y = doc.y + 2;
    doc.font(nfont).fontSize(9);
    if (inv.buyer_gstin) { doc.text(`GSTIN: ${inv.buyer_gstin}`, L, y); y = doc.y + 1; }
    if (inv.buyer_address) { doc.text(`Address: ${inv.buyer_address}`, L, y); y = doc.y + 1; }
    y += 8;

    // === ITEMS TABLE ===
    const cols = [25, 120, 65, 45, 40, 55, 65, 35, 55, 60]; // ~565 total
    const headers = ['#', 'Item', 'HSN', 'Qty', 'Unit', 'Rate', 'Taxable', 'GST%', 'GST Amt', 'Total'];
    const rowH = 18;

    // Header row
    let x = L;
    doc.rect(L, y, W, rowH).fill('#e2e8f0');
    doc.font(bfont).fontSize(7).fillColor('#000');
    headers.forEach((h, i) => {
      const align = i >= 3 ? 'right' : 'left';
      doc.text(h, x + 2, y + 4, { width: cols[i] - 4, align });
      x += cols[i];
    });
    y += rowH;

    // Data rows
    const items = inv.items || [];
    const fmt = (v) => v ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    doc.font(nfont).fontSize(7).fillColor('#000');
    items.forEach((it, idx) => {
      const taxable = (it.qty || 0) * (it.rate || 0);
      const gst_a = taxable * (it.gst_pct || 0) / 100;
      const total = taxable + gst_a;
      const row = [String(idx + 1), it.name || '', it.hsn || '', String(it.qty || 0), it.unit || '', `Rs.${fmt(it.rate)}`, `Rs.${fmt(taxable)}`, `${it.gst_pct || 0}%`, `Rs.${fmt(gst_a)}`, `Rs.${fmt(total)}`];
      if (idx % 2 === 1) doc.rect(L, y, W, rowH).fill('#f8fafc').fillColor('#000');
      x = L;
      row.forEach((val, i) => {
        const align = i >= 3 ? 'right' : 'left';
        doc.text(val, x + 2, y + 4, { width: cols[i] - 4, align });
        x += cols[i];
      });
      y += rowH;
    });

    // Totals row
    const totals = inv.totals || {};
    doc.rect(L, y, W, rowH).fill('#f0fdf4');
    doc.font(bfont).fontSize(7).fillColor('#000');
    x = L;
    ['', '', '', '', '', '', `Rs.${fmt(totals.taxable)}`, '', `Rs.${fmt(totals.gst)}`, `Rs.${fmt(totals.total)}`].forEach((val, i) => {
      doc.text(val, x + 2, y + 4, { width: cols[i] - 4, align: i >= 3 ? 'right' : 'left' });
      x += cols[i];
    });
    y += rowH;

    // Grid lines
    doc.strokeColor('#94a3b8').lineWidth(0.5);
    const tableTop = y - rowH * (items.length + 2);
    for (let r = 0; r <= items.length + 2; r++) {
      const ry = tableTop + r * rowH;
      doc.moveTo(L, ry).lineTo(L + W, ry).stroke();
    }
    x = L;
    for (let c = 0; c <= cols.length; c++) {
      doc.moveTo(x, tableTop).lineTo(x, y).stroke();
      x += (cols[c] || 0);
    }
    y += 10;

    // === TAX SUMMARY ===
    doc.font(nfont).fontSize(9).fillColor('#000');
    const taxX = L + W - 220;
    doc.text('Taxable Amount:', taxX, y); doc.text(`Rs.${fmt(totals.taxable)}`, taxX + 120, y, { width: 100, align: 'right' }); y += 14;
    if (inv.is_igst) {
      doc.text('IGST:', taxX, y); doc.text(`Rs.${fmt(totals.igst)}`, taxX + 120, y, { width: 100, align: 'right' }); y += 14;
    } else {
      doc.text('CGST:', taxX, y); doc.text(`Rs.${fmt(totals.cgst)}`, taxX + 120, y, { width: 100, align: 'right' }); y += 14;
      doc.text('SGST:', taxX, y); doc.text(`Rs.${fmt(totals.sgst)}`, taxX + 120, y, { width: 100, align: 'right' }); y += 14;
    }
    doc.moveTo(taxX, y).lineTo(taxX + 220, y).strokeColor('#000').lineWidth(1).stroke(); y += 4;
    doc.font(bfont).fontSize(11).text('Grand Total:', taxX, y); doc.text(`Rs.${fmt(totals.total)}`, taxX + 120, y, { width: 100, align: 'right' }); y += 20;

    // Bank Details
    if (company.bank_name || company.bank_account) {
      doc.font(bfont).fontSize(8).text('Bank Details:', L, y); y += 12;
      doc.font(nfont).fontSize(8);
      const parts = [];
      if (company.bank_name) parts.push(`Bank: ${company.bank_name}`);
      if (company.bank_account) parts.push(`A/C: ${company.bank_account}`);
      if (company.bank_ifsc) parts.push(`IFSC: ${company.bank_ifsc}`);
      doc.text(parts.join(' | '), L, y); y += 16;
    }

    // Notes
    if (inv.notes) {
      doc.font(bfont).fontSize(8).text('Notes:', L, y); y += 12;
      doc.font(nfont).fontSize(8).text(inv.notes, L, y); y += 16;
    }

    // Footer
    doc.moveTo(L, y).lineTo(L + W, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke(); y += 6;
    doc.font(nfont).fontSize(8).fillColor('#999').text(`Thank you - ${company.company_name || ''}`, L, y, { align: 'center', width: W });

    doc.end();
  }));

  return router;
};
