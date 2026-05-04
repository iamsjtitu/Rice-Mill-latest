// v104.44.87 — Total Sales Register Node parity (Desktop + LAN)
// Mirrors /app/backend/routes/total_sales_register.py
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function safeNum(v) { const n = parseFloat(v || 0); return isNaN(n) ? 0 : n; }
  function safeInt(v) { const n = parseInt(v || 0); return isNaN(n) ? 0 : n; }
  function round2(n) { return Math.round((n || 0) * 100) / 100; }

  function ensureCollections() {
    ['bp_sale_register', 'rice_sales', 'sale_vouchers', 'cash_transactions'].forEach(c => {
      if (!database.data[c]) database.data[c] = [];
    });
  }

  function fetchPartyReceived(partyKey, kmsYear, season) {
    // v104.44.90 — Cash payments only. Premium adjustments folded into row total instead.
    if (!partyKey) return 0;
    const skipKw = ['lab test premium', 'lab test bonus', 'oil premium', 'sale bhada'];
    const txns = (database.data.cash_transactions || []).filter(t => {
      if (t.category !== partyKey) return false;
      if (t.txn_type !== 'jama') return false;
      if (kmsYear && t.kms_year !== kmsYear) return false;
      if (season && t.season !== season) return false;
      const d = (t.description || '').toLowerCase();
      if (skipKw.some(k => d.includes(k))) return false;
      return true;
    });
    // Dedupe by (date, description), prefer auto_ledger reference
    const grouped = new Map();
    for (const r of txns) {
      const key = `${r.date || ''}::${((r.description || '').trim().toLowerCase())}`;
      const ref = r.reference || '';
      const existing = grouped.get(key);
      if (!existing) grouped.set(key, r);
      else if (ref.startsWith('auto_ledger:') && !(existing.reference || '').startsWith('auto_ledger:')) grouped.set(key, r);
    }
    let sum = 0;
    for (const r of grouped.values()) sum += safeNum(r.amount);
    return round2(sum);
  }

  function buildPremiumMap(bpItems) {
    // v104.44.90 — Map voucher_no/rst_no -> signed premium_amount for Rice Bran sales.
    const pmap = {};
    if (!bpItems || bpItems.length === 0) return pmap;
    const voucherSet = new Set(), rstSet = new Set();
    for (const s of bpItems) {
      if ((s.product || '').trim() !== 'Rice Bran') continue;
      const v = (s.voucher_no || '').trim();
      const r = String(s.rst_no || '').trim();
      if (v) voucherSet.add(v);
      if (r) rstSet.add(r);
    }
    if (voucherSet.size === 0 && rstSet.size === 0) return pmap;
    for (const op of (database.data.oil_premium || [])) {
      const v = (op.voucher_no || '').trim();
      const r = String(op.rst_no || '').trim();
      const amt = safeNum(op.premium_amount);
      if (v && voucherSet.has(v)) pmap[`v:${v}`] = (pmap[`v:${v}`] || 0) + amt;
      if (r && rstSet.has(r)) pmap[`r:${r}`] = (pmap[`r:${r}`] || 0) + amt;
    }
    return pmap;
  }

  function premiumForSale(s, pmap) {
    if ((s.product || '').trim() !== 'Rice Bran') return 0;
    const v = (s.voucher_no || '').trim();
    const r = String(s.rst_no || '').trim();
    if (v && pmap[`v:${v}`] !== undefined) return pmap[`v:${v}`];
    if (r && pmap[`r:${r}`] !== undefined) return pmap[`r:${r}`];
    return 0;
  }

  function bpToRows(s, premium = 0) {
    // v104.44.90 — Premium folds into KCA total (split) or row total (non-split).
    const common = {
      source: 'bp_sale', id: s.id, date: s.date || '',
      voucher_no: s.voucher_no || '', bill_number: s.bill_number || '',
      billing_date: s.billing_date || '', rst_no: String(s.rst_no || ''),
      vehicle_no: s.vehicle_no || '', bill_from: s.bill_from || '',
      product: s.product || '', party_name: s.party_name || '',
      destination: s.destination || '', bags: safeInt(s.bags),
      kms_year: s.kms_year || '', season: s.season || '',
      gst_type: s.gst_type || '',
    };
    const advanceTotal = safeNum(s.advance);
    if (s.split_billing) {
      const pakkaKg = safeNum(s.billed_weight_kg);
      const pakkaQtl = round2(pakkaKg / 100);
      const pakkaRate = safeNum(s.rate_per_qtl);
      const pakkaAmt = round2(pakkaQtl * pakkaRate);
      const pakkaTax = round2(s.tax_amount);
      const pakkaTotal = round2(pakkaAmt + pakkaTax);
      const kacchaKg = safeNum(s.kaccha_weight_kg);
      const kacchaQtl = round2(kacchaKg / 100);
      const kacchaRate = safeNum(s.kaccha_rate_per_qtl) || pakkaRate;
      const kacchaAmt = round2(kacchaQtl * kacchaRate);
      const kacchaTotal = round2(kacchaAmt + premium);  // v104.44.90 — premium folded in
      const combined = pakkaTotal + kacchaTotal;
      const pakkaAdv = combined > 0 ? round2(advanceTotal * (pakkaTotal / combined)) : 0;
      const kacchaAdv = round2(advanceTotal - pakkaAdv);
      const totalKg = pakkaKg + kacchaKg;
      // v104.44.91 — All bags go to KCA row when split (PKA shows 0)
      const pakkaBags = 0;
      const kacchaBags = common.bags;
      return [
        { ...common, split_type: 'PKA', bags: pakkaBags, net_weight_qtl: pakkaQtl,
          rate_per_qtl: pakkaRate, amount: pakkaAmt, tax: pakkaTax, total: pakkaTotal,
          balance: round2(pakkaTotal - pakkaAdv), advance: pakkaAdv, split_billing: true },
        { ...common, split_type: 'KCA', bags: kacchaBags, net_weight_qtl: kacchaQtl,
          rate_per_qtl: kacchaRate, amount: kacchaAmt, tax: 0, total: kacchaTotal,
          balance: round2(kacchaTotal - kacchaAdv), advance: kacchaAdv, split_billing: true },
      ];
    }
    const amt = safeNum(s.amount);
    const tax = safeNum(s.tax_amount);
    const baseTotal = safeNum(s.total) || (amt + tax);
    const total = round2(baseTotal + premium);  // v104.44.90 — premium folded in
    const balance = round2(total - advanceTotal);
    return [{ ...common, split_type: '', net_weight_qtl: round2(safeNum(s.net_weight_kg) / 100),
      rate_per_qtl: safeNum(s.rate_per_qtl), amount: round2(amt), tax: round2(tax),
      total: round2(total), balance: round2(balance), advance: round2(advanceTotal), split_billing: false }];
  }

  function rsToRow(s) {
    const total = safeNum(s.total_amount);
    const paid = safeNum(s.paid_amount);
    return {
      source: 'rice_sale', id: s.id, date: s.date || '',
      voucher_no: '', bill_number: '', billing_date: s.date || '',
      rst_no: String(s.rst_no || ''), vehicle_no: s.truck_no || '',
      bill_from: '', product: s.rice_type || 'Pvt Rice',
      party_name: s.party_name || '', destination: '',
      net_weight_qtl: safeNum(s.quantity_qntl), bags: safeInt(s.bags),
      rate_per_qtl: safeNum(s.rate_per_qntl), amount: round2(total), tax: 0,
      total: round2(total), balance: round2(total - paid), advance: round2(paid),
      kms_year: s.kms_year || '', season: s.season || '',
      split_billing: false, split_type: '', gst_type: '',
    };
  }

  function svToRow(s) {
    const items = s.items || [];
    let totalQtl = 0, totalBags = 0;
    const rates = [], productNames = [];
    for (const it of items) {
      let q = safeNum(it.quantity || it.weight_qntl);
      const unit = String(it.unit || '').toUpperCase();
      if (unit === 'KG') q = q / 100;
      totalQtl += q;
      totalBags += safeInt(it.bags);
      const r = safeNum(it.rate);
      if (r > 0) rates.push(r);
      const nm = it.item_name || '';
      if (nm && !productNames.includes(nm)) productNames.push(nm);
    }
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    const subtotal = safeNum(s.subtotal);
    const tax = safeNum(s.cgst_amount) + safeNum(s.sgst_amount) + safeNum(s.igst_amount);
    const total = safeNum(s.total) || round2(subtotal + tax);
    const paid = safeNum(s.paid_amount);
    const balance = safeNum(s.balance) || round2(total - paid);
    const gstType = s.gst_type || 'none';
    const isKca = gstType === 'none' || gstType === '';
    const productLabel = 'Govt Rice' + (productNames.length ? ` · ${productNames.slice(0, 2).join(' / ')}` : '');
    const voucher = s.voucher_no_label || (s.voucher_no ? `S-${String(s.voucher_no).padStart(3, '0')}` : '');
    return {
      source: 'sale_voucher', id: s.id, date: s.date || '',
      voucher_no: voucher, bill_number: s.invoice_no || '',
      billing_date: s.date || '', rst_no: String(s.rst_no || ''),
      vehicle_no: s.truck_no || '', bill_from: s.bill_book || '',
      product: productLabel, party_name: s.party_name || '',
      destination: s.destination || '', net_weight_qtl: round2(totalQtl),
      bags: totalBags, rate_per_qtl: avgRate, amount: round2(subtotal),
      tax: round2(tax), total: round2(total), balance: round2(balance),
      advance: round2(paid), kms_year: s.kms_year || '', season: s.season || '',
      split_billing: false, split_type: isKca ? 'KCA' : 'PKA', gst_type: gstType,
    };
  }

  async function computeTotalSales(q) {
    ensureCollections();
    const { kms_year = '', season = '', date_from = '', date_to = '',
            party_name = '', product = '', source = '', search = '' } = q;

    const inCommon = (r) => {
      if (kms_year && r.kms_year !== kms_year) return false;
      if (season && r.season !== season) return false;
      if (date_from && (r.date || '') < date_from) return false;
      if (date_to && (r.date || '') > date_to) return false;
      return true;
    };

    let rows = [];

    if (!source || source === 'bp_sale') {
      // v104.44.90 — Build premium map (voucher_no/rst_no -> premium_amount), fold into row total
      const filteredBp = (database.data.bp_sale_register || []).filter(s => {
        if (!inCommon(s)) return false;
        if (product && !String(s.product || '').toLowerCase().includes(product.toLowerCase())) return false;
        if (party_name && !String(s.party_name || '').toLowerCase().includes(party_name.toLowerCase())) return false;
        return true;
      });
      const pmap = buildPremiumMap(filteredBp);
      for (const s of filteredBp) {
        const prem = premiumForSale(s, pmap);
        rows.push(...bpToRows(s, prem));
      }
    }

    if ((!source || source === 'rice_sale') && (!product || product.toLowerCase().includes('rice'))) {
      for (const s of database.data.rice_sales || []) {
        if (!inCommon(s)) continue;
        if (party_name && !String(s.party_name || '').toLowerCase().includes(party_name.toLowerCase())) continue;
        rows.push(rsToRow(s));
      }
    }

    if (!source || source === 'sale_voucher') {
      for (const s of database.data.sale_vouchers || []) {
        if (!inCommon(s)) continue;
        if (party_name && !String(s.party_name || '').toLowerCase().includes(party_name.toLowerCase())) continue;
        const row = svToRow(s);
        if (product && !String(row.product || '').toLowerCase().includes(product.toLowerCase())) continue;
        rows.push(row);
      }
    }

    // FIFO allocate payments per (party_key, kms, season)
    const partyKey = (r) => {
      if ((r.split_type === 'PKA' || r.split_type === 'KCA') && r.source === 'bp_sale') {
        return `${(r.party_name || '').trim()} (${r.split_type})`;
      }
      return (r.party_name || '').trim();
    };
    const buckets = new Map();
    for (const r of rows) {
      const pk = partyKey(r);
      if (!pk) continue;
      const key = `${pk}::${r.kms_year || ''}::${r.season || ''}`;
      if (!buckets.has(key)) buckets.set(key, { pk, kms: r.kms_year || '', ssn: r.season || '', rows: [] });
      buckets.get(key).rows.push(r);
    }
    for (const { pk, kms, ssn, rows: group } of buckets.values()) {
      const receivedTotal = fetchPartyReceived(pk, kms, ssn);
      group.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || '').localeCompare(b.id || ''));
      let remaining = receivedTotal;
      for (const r of group) {
        if (remaining <= 0) {
          r.advance = 0;
          r.balance = round2(r.total);
          continue;
        }
        const alloc = Math.min(remaining, safeNum(r.total));
        r.advance = round2(alloc);
        r.balance = round2(safeNum(r.total) - alloc);
        remaining = round2(remaining - alloc);
      }
    }

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.party_name || '').toLowerCase().includes(q) ||
        (r.vehicle_no || '').toLowerCase().includes(q) ||
        (r.rst_no || '').toLowerCase().includes(q) ||
        (r.voucher_no || '').toLowerCase().includes(q) ||
        (r.product || '').toLowerCase().includes(q) ||
        (r.bill_number || '').toLowerCase().includes(q));
    }

    // v104.44.93/.94 — Enrich rows with party_weight shortage/excess + party_net_weight (Qtl)
    const pwMap = {};
    for (const pw of (database.data.party_weights || [])) {
      const v = String(pw.voucher_no || '').trim();
      if (!v) continue;
      const e = pwMap[v] || (pwMap[v] = { shortage_kg: 0, excess_kg: 0, party_net_weight_kg: 0 });
      e.shortage_kg += parseFloat(pw.shortage_kg || 0) || 0;
      e.excess_kg += parseFloat(pw.excess_kg || 0) || 0;
      e.party_net_weight_kg += parseFloat(pw.party_net_weight_kg || 0) || 0;
    }
    for (const r of rows) {
      const v = String(r.voucher_no || '').trim();
      const pw = v ? pwMap[v] : null;
      if (r.split_type === 'PKA') {
        r.shortage_kg = 0; r.excess_kg = 0;
        r.shortage_qtl = 0; r.excess_qtl = 0;
        r.party_net_weight_qtl = 0;
      } else {
        const sk = pw ? pw.shortage_kg : 0;
        const ek = pw ? pw.excess_kg : 0;
        const pk = pw ? pw.party_net_weight_kg : 0;
        r.shortage_kg = Math.round(sk * 100) / 100;
        r.excess_kg = Math.round(ek * 100) / 100;
        r.shortage_qtl = Math.round((sk / 100) * 100) / 100;
        r.excess_qtl = Math.round((ek / 100) * 100) / 100;
        r.party_net_weight_qtl = Math.round((pk / 100) * 100) / 100;
      }
    }

    rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));

    const totals = {
      rows_count: rows.length,
      net_weight_qtl: round2(rows.reduce((s, r) => s + r.net_weight_qtl, 0)),
      bags: rows.reduce((s, r) => s + r.bags, 0),
      amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
      tax: round2(rows.reduce((s, r) => s + r.tax, 0)),
      total: round2(rows.reduce((s, r) => s + r.total, 0)),
      balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
      received: round2(rows.reduce((s, r) => s + r.advance, 0)),
      shortage_kg: round2(rows.reduce((s, r) => s + (r.shortage_kg || 0), 0)),
      excess_kg: round2(rows.reduce((s, r) => s + (r.excess_kg || 0), 0)),
      shortage_qtl: round2(rows.reduce((s, r) => s + (r.shortage_qtl || 0), 0)),
      excess_qtl: round2(rows.reduce((s, r) => s + (r.excess_qtl || 0), 0)),
      party_net_weight_qtl: round2(rows.reduce((s, r) => s + (r.party_net_weight_qtl || 0), 0)),
    };

    const parties = {};
    for (const r of rows) {
      const key = (r.party_name || '').trim() || '(Unknown)';
      if (!parties[key]) parties[key] = { party_name: key, rows: 0, net_weight_qtl: 0, bags: 0, total: 0, balance: 0, received: 0, products: new Set() };
      const p = parties[key];
      p.rows += 1;
      p.net_weight_qtl = round2(p.net_weight_qtl + r.net_weight_qtl);
      p.bags += r.bags;
      p.total = round2(p.total + r.total);
      p.balance = round2(p.balance + r.balance);
      p.received = round2(p.received + r.advance);
      if (r.product) p.products.add(r.product);
    }
    const partiesList = Object.values(parties)
      .map(p => ({ ...p, products: [...p.products].filter(Boolean).sort() }))
      .sort((a, b) => b.total - a.total);

    return { rows, totals, parties: partiesList };
  }

  // GET /api/total-sales-register
  router.get('/api/total-sales-register', async (req, res) => {
    try {
      const data = await computeTotalSales(req.query || {});
      res.json(data);
    } catch (e) {
      console.error('[total-sales]', e);
      res.status(500).json({ detail: String(e) });
    }
  });

  // GET /api/total-sales-register/export/excel
  router.get('/api/total-sales-register/export/excel', async (req, res) => {
    try {
      const { rows, totals } = await computeTotalSales(req.query || {});
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Total Sales');
      const headers = ['Date', 'Voucher', 'Bill No', 'RST', 'Vehicle', 'Bill From', 'Party', 'Destination',
                       'N/W (Qtl)', 'Party W (Qtl)', 'Short (Qtl)', 'Bags', 'Rate/Q', 'Amount', 'Tax', 'Total',
                       'Received(T)', 'Balance(T)'];
      const lastCol = String.fromCharCode(64 + headers.length);
      ws.mergeCells(`A1:${lastCol}1`);
      ws.getCell('A1').value = 'TOTAL SALES REGISTER';
      ws.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF1E3A8A' } };
      ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 26;

      const meta = `KMS ${req.query.kms_year || 'ALL'}  •  ${req.query.season || 'All Seasons'}`;
      ws.mergeCells(`A2:${lastCol}2`);
      ws.getCell('A2').value = meta;
      ws.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF475569' } };
      ws.getCell('A2').alignment = { horizontal: 'center' };

      ws.getRow(4).values = headers;
      ws.getRow(4).height = 22;
      ws.getRow(4).eachCell(c => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      rows.forEach((r, idx) => {
        const voucherDisp = (r.voucher_no || '-') + (r.split_type ? ` · ${r.split_type}` : '');
        const row = ws.addRow([r.date || '', voucherDisp, r.bill_number || '', r.rst_no || '',
          r.vehicle_no || '', r.bill_from || '', r.party_name || '', r.destination || '',
          r.net_weight_qtl,
          Math.round((r.party_net_weight_qtl || 0) * 100) / 100,
          Math.round((r.shortage_qtl || 0) * 100) / 100,
          r.bags, r.rate_per_qtl,
          r.amount, r.tax, r.total, r.advance, r.balance]);
        row.height = 18;
        const fillColor = r.split_type === 'PKA' ? 'FFD1FAE5' : r.split_type === 'KCA' ? 'FFFEF3C7' : (idx % 2 ? 'FFF8FAFC' : 'FFFFFFFF');
        row.eachCell((c, cn) => {
          c.font = { size: 9 };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
          c.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
          if (cn >= 9) {
            c.alignment = { horizontal: 'right', vertical: 'middle' };
            if (cn === 12) c.numFmt = '#,##0';
            else c.numFmt = '#,##0.00';
          } else c.alignment = { horizontal: 'left', vertical: 'middle' };
        });
      });

      const trow = ws.addRow(['TOTALS', '', '', '', '', '', '', '',
        totals.net_weight_qtl,
        totals.party_net_weight_qtl || 0,
        totals.shortage_qtl || 0,
        totals.bags, '',
        totals.amount, totals.tax, totals.total, totals.received, totals.balance]);
      trow.height = 22;
      trow.eachCell((c, cn) => {
        c.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        c.border = { top: { style: 'medium', color: { argb: 'FF1E3A8A' } }, bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (cn >= 9) {
          c.alignment = { horizontal: 'right', vertical: 'middle' };
          if (cn === 12) c.numFmt = '#,##0';
          else c.numFmt = '#,##0.00';
        } else c.alignment = { horizontal: 'left', vertical: 'middle' };
      });

      const widths = [11, 14, 11, 7, 13, 13, 22, 14, 11, 11, 10, 7, 10, 13, 10, 13, 14, 14];
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 4 }];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="total_sales_${req.query.kms_year || 'all'}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) { console.error('[ts-excel]', e); res.status(500).json({ detail: String(e) }); }
  });

  // GET /api/total-sales-register/export/pdf
  router.get('/api/total-sales-register/export/pdf', async (req, res) => {
    try {
      const { rows, totals } = await computeTotalSales(req.query || {});
      const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 30 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="total_sales_${req.query.kms_year || 'all'}.pdf"`);
      doc.pipe(res);

      // Title
      doc.fontSize(20).fillColor('#1E3A8A').font('Helvetica-Bold')
        .text('TOTAL SALES REGISTER', { align: 'center' });
      doc.moveDown(0.1);
      doc.fontSize(10).fillColor('#475569').font('Helvetica-Oblique')
        .text(`KMS ${req.query.kms_year || 'ALL'}  -  ${req.query.season || 'All Seasons'}`, { align: 'center' });
      doc.moveDown(0.3);

      // Stats strip
      doc.fontSize(9).fillColor('#1E3A8A').font('Helvetica-Bold')
        .text(`Entries: ${totals.rows_count}  |  N/W: ${totals.net_weight_qtl.toFixed(2)} Qtl  |  Bags: ${totals.bags}  |  Total: ₹${totals.total.toLocaleString('en-IN')}  |  Received(T): ₹${totals.received.toLocaleString('en-IN')}  |  Balance(T): ₹${totals.balance.toLocaleString('en-IN')}`,
          { align: 'center' });
      doc.moveDown(0.5);

      // Table layout (manual grid)
      const headers = ['Date', 'Voucher', 'Bill No', 'RST', 'Vehicle', 'BillFrom', 'Party', 'Dest', 'N/W', 'PartyW', 'Short', 'Bags', 'Rate', 'Amount', 'Tax', 'Total', 'Recv(T)', 'Bal(T)'];
      const widths = [42, 60, 50, 28, 55, 55, 100, 48, 45, 50, 45, 25, 40, 60, 38, 60, 60, 60];
      const totalW = widths.reduce((a, b) => a + b, 0);
      const startX = (doc.page.width - totalW) / 2;
      let y = doc.y;
      const rowHeight = 16;
      const headerHeight = 20;

      // Header bg
      doc.rect(startX, y, totalW, headerHeight).fill('#0F172A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      let x = startX;
      headers.forEach((h, i) => {
        doc.text(h, x + 2, y + 6, { width: widths[i] - 4, align: 'center' });
        x += widths[i];
      });
      y += headerHeight;

      // Rows
      for (const r of rows) {
        if (y + rowHeight > doc.page.height - 60) {
          doc.addPage();
          y = 40;
        }
        const voucherDisp = (r.voucher_no || '-') + (r.split_type ? ` ${r.split_type}` : '');
        const fillColor = r.split_type === 'PKA' ? '#D1FAE5' : r.split_type === 'KCA' ? '#FEF3C7' : '#FFFFFF';
        doc.rect(startX, y, totalW, rowHeight).fill(fillColor);
        const vals = [(r.date || '').slice(-5), voucherDisp.slice(0, 14),
          (r.bill_number || '').slice(0, 10), r.rst_no || '',
          (r.vehicle_no || '').slice(0, 12), (r.bill_from || '').slice(0, 10),
          (r.party_name || '').slice(0, 18),
          (r.destination || '').slice(0, 12), r.net_weight_qtl.toFixed(2),
          (r.party_net_weight_qtl || 0) > 0 ? r.party_net_weight_qtl.toFixed(2) : '—',
          (r.shortage_qtl || 0) > 0 ? r.shortage_qtl.toFixed(2) : '—',
          String(r.bags),
          String(Math.round(r.rate_per_qtl)), r.amount.toFixed(2), r.tax.toFixed(2),
          r.total.toFixed(2), r.advance.toFixed(2), r.balance.toFixed(2)];
        doc.fillColor('#0F172A').font('Helvetica').fontSize(7);
        x = startX;
        vals.forEach((v, i) => {
          const align = i >= 8 ? 'right' : 'left';
          doc.text(String(v), x + 2, y + 4, { width: widths[i] - 4, align });
          x += widths[i];
        });
        // Row border
        doc.strokeColor('#CBD5E1').lineWidth(0.3).rect(startX, y, totalW, rowHeight).stroke();
        y += rowHeight;
      }

      // Totals row
      if (y + rowHeight > doc.page.height - 60) { doc.addPage(); y = 40; }
      doc.rect(startX, y, totalW, rowHeight + 4).fill('#FEF3C7');
      doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(9);
      const tvals = ['TOTALS', '', '', '', '', '', '', '', totals.net_weight_qtl.toFixed(2),
        (totals.party_net_weight_qtl || 0).toFixed(2),
        (totals.shortage_qtl || 0).toFixed(2),
        String(totals.bags), '',
        totals.amount.toFixed(2), totals.tax.toFixed(2), totals.total.toFixed(2),
        totals.received.toFixed(2), totals.balance.toFixed(2)];
      x = startX;
      tvals.forEach((v, i) => {
        const align = i >= 8 ? 'right' : 'left';
        doc.text(String(v), x + 2, y + 6, { width: widths[i] - 4, align });
        x += widths[i];
      });
      doc.strokeColor('#1E3A8A').lineWidth(1).rect(startX, y, totalW, rowHeight + 4).stroke();
      y += rowHeight + 10;

      // Legend + footer
      doc.fillColor('#64748B').font('Helvetica').fontSize(7);
      doc.text(`Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}  |  Rows: ${rows.length}  |  PKA = Green (GST Bill)  |  KCA = Amber (Slip)`,
        startX, y + 5, { width: totalW, align: 'center' });

      doc.end();
    } catch (e) { console.error('[ts-pdf]', e); res.status(500).json({ detail: String(e) }); }
  });

  return router;
};
