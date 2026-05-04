// v104.44.70 — Party Weight Register (Desktop Electron parity)
// Tracks party dharam-kaata weight vs our mill weight for shortage/excess
// v104.44.93 — Excel/PDF export endpoints + vehicle filter parity.
const { v4: uuid } = require('uuid');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function ensure() { if (!database.data.party_weights) database.data.party_weights = []; }

  function computeDiff(ourKg, partyKg) {
    const diff = Math.round((ourKg - partyKg) * 100) / 100;
    return {
      shortage_kg: Math.max(0, diff),
      excess_kg: Math.abs(Math.min(0, diff)),
    };
  }

  // v104.44.94 — Sync Lab Test (oil_premium) qty when shortage adjusts BP weight
  function resyncOilPremiumForVoucher(voucherNo, pwId, newQtyQtl) {
    if (!database.data.oil_premium) return;
    const op = database.data.oil_premium.find(o => (o.voucher_no || '') === voucherNo);
    if (!op) return;
    if (op.original_qty_qtl_pre_adjust == null) {
      op.original_qty_qtl_pre_adjust = parseFloat(op.qty_qtl || 0);
    }
    const rate = parseFloat(op.rate || 0);
    const standard = parseFloat(op.standard_oil_pct || 0);
    const actual = parseFloat(op.actual_oil_pct || 0);
    const newQty = Math.round(newQtyQtl * 100) / 100;
    const newPrem = standard ? Math.round(rate * (actual - standard) * newQty / standard * 100) / 100 : 0;
    op.qty_qtl = newQty;
    op.premium_amount = newPrem;
    op.auto_adjust_party_weight_id = pwId;
    op.updated_at = new Date().toISOString();
    // Update mirrored cash_transactions
    if (database.data.cash_transactions) {
      for (const t of database.data.cash_transactions) {
        const ref = t.reference || '';
        if (ref === `oil_premium:${op.id}` || ref.startsWith(`oil_premium:${(op.id || '').slice(0, 8)}`)) {
          t.amount = Math.abs(newPrem);
          t.updated_at = op.updated_at;
        }
      }
    }
  }

  function revertOilPremiumForVoucher(voucherNo) {
    if (!database.data.oil_premium) return;
    const op = database.data.oil_premium.find(o => (o.voucher_no || '') === voucherNo);
    if (!op || op.original_qty_qtl_pre_adjust == null) return;
    const origQty = parseFloat(op.original_qty_qtl_pre_adjust);
    const rate = parseFloat(op.rate || 0);
    const standard = parseFloat(op.standard_oil_pct || 0);
    const actual = parseFloat(op.actual_oil_pct || 0);
    const origPrem = standard ? Math.round(rate * (actual - standard) * origQty / standard * 100) / 100 : 0;
    op.qty_qtl = origQty;
    op.premium_amount = origPrem;
    delete op.auto_adjust_party_weight_id;
    delete op.original_qty_qtl_pre_adjust;
    op.updated_at = new Date().toISOString();
    if (database.data.cash_transactions) {
      for (const t of database.data.cash_transactions) {
        const ref = t.reference || '';
        if (ref === `oil_premium:${op.id}` || ref.startsWith(`oil_premium:${(op.id || '').slice(0, 8)}`)) {
          t.amount = Math.abs(origPrem);
          t.updated_at = op.updated_at;
        }
      }
    }
  }

  // v104.44.93 — Auto-adjust BP sale on party-weight save
  function applyAutoAdjust(pwId, product, voucherNo, kmsYear, partyName, dateStr, shortageKg, excessKg, season, username) {
    if (shortageKg <= 0 && excessKg <= 0) return { mode: 'skipped', amount: 0, message: 'No diff' };
    if (!database.data.bp_sale_register) return { mode: 'skipped', amount: 0, message: 'No BP collection' };
    const idx = database.data.bp_sale_register.findIndex(s =>
      String(s.voucher_no || '') === voucherNo && (s.product || '') === product && (s.kms_year || '') === kmsYear
    );
    if (idx < 0) return { mode: 'skipped', amount: 0, message: 'BP sale not found' };
    const bp = database.data.bp_sale_register[idx];
    const deltaKg = shortageKg > 0 ? -shortageKg : excessKg;

    if (bp.split_billing) {
      const newKaccha = Math.max(0, parseFloat(bp.kaccha_weight_kg || 0) + deltaKg);
      const kacchaRate = parseFloat(bp.kaccha_rate_per_qtl || 0) || parseFloat(bp.rate_per_qtl || 0);
      const newKacchaAmt = Math.round((newKaccha / 100) * kacchaRate * 100) / 100;
      const pakkaAmt = parseFloat(bp.amount || 0);
      const pakkaTax = parseFloat(bp.tax_amount || 0);
      const newTotal = Math.round((pakkaAmt + pakkaTax + newKacchaAmt) * 100) / 100;
      const newBalance = Math.round((newTotal - parseFloat(bp.advance || 0)) * 100) / 100;
      database.data.bp_sale_register[idx] = {
        ...bp,
        kaccha_weight_kg: newKaccha,
        kaccha_amount: newKacchaAmt,
        total: newTotal,
        balance: newBalance,
        updated_at: new Date().toISOString(),
        auto_adjust_party_weight_id: pwId,
      };
      // v104.44.94 — Sync KCA ledger entries so cash book + party ledger reflect new amount
      const docId = bp.id;
      const nowIso = new Date().toISOString();
      if (database.data.cash_transactions) {
        for (const t of database.data.cash_transactions) {
          if ((t.reference || '') === `bp_sale_ka:${docId}`) { t.amount = newKacchaAmt; t.updated_at = nowIso; }
        }
      }
      if (database.data.local_party_accounts) {
        for (const t of database.data.local_party_accounts) {
          if ((t.reference || '') === `bp_sale_ka:${docId}`) { t.amount = newKacchaAmt; t.updated_at = nowIso; }
        }
      }
      if (database.data.truck_payments) {
        for (const t of database.data.truck_payments) {
          if ((t.reference || '') === `bp_sale_truck:${docId}`) { t.net_amount = newTotal; t.updated_at = nowIso; }
        }
      }
      // v104.44.94 — Auto-resync Lab Test (oil_premium) qty
      resyncOilPremiumForVoucher(voucherNo, pwId, newKaccha / 100);
      database.save();
      return { mode: 'split', amount: Math.round((deltaKg / 100) * kacchaRate * 100) / 100,
               message: `KCA weight adjusted by ${deltaKg.toFixed(2)} Kg → new KCA amt ₹${newKacchaAmt.toLocaleString('en-IN')}` };
    }

    // SOLO PKA — virtual KCA ledger entry
    const pakkaRate = parseFloat(bp.rate_per_qtl || 0);
    const absKg = Math.abs(deltaKg);
    const adjAmt = Math.round((absKg / 100) * pakkaRate * 100) / 100;
    if (adjAmt <= 0) return { mode: 'skipped', amount: 0, message: 'Zero adj amt' };
    const txnType = shortageKg > 0 ? 'jama' : 'nikasi';
    const sword = shortageKg > 0 ? 'Shortage' : 'Excess';
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    database.data.cash_transactions.push({
      id: uuid(),
      date: dateStr || bp.date || '',
      account: 'ledger',
      txn_type: txnType,
      category: partyName ? `${partyName} (KCA)` : '',
      party_type: 'BP Sale',
      description: `Weight ${sword} adjustment (${absKg.toFixed(2)} Kg @ ₹${pakkaRate.toLocaleString('en-IN')}/Qtl) - Voucher #${voucherNo}`,
      amount: adjAmt,
      kms_year: kmsYear || bp.kms_year || '',
      season: season || bp.season || '',
      reference: `party_weight:${pwId}`,
      created_at: new Date().toISOString(),
      created_by: username || 'system',
    });
    database.save();
    return { mode: 'solo_pka', amount: shortageKg > 0 ? adjAmt : -adjAmt,
             message: `Virtual KCA ledger ${txnType.toUpperCase()} ₹${adjAmt.toLocaleString('en-IN')}` };
  }

  function reverseAutoAdjust(pwId) {
    if (database.data.cash_transactions) {
      const before = database.data.cash_transactions.length;
      database.data.cash_transactions = database.data.cash_transactions.filter(t => (t.reference || '') !== `party_weight:${pwId}`);
      if (database.data.cash_transactions.length !== before) database.save();
    }
    const pw = (database.data.party_weights || []).find(p => p.id === pwId);
    if (!pw || !pw.auto_adjusted) return;
    if (!database.data.bp_sale_register) return;
    const idx = database.data.bp_sale_register.findIndex(s => s.auto_adjust_party_weight_id === pwId);
    if (idx < 0) return;
    const bp = database.data.bp_sale_register[idx];
    const oldShort = parseFloat(pw.shortage_kg || 0);
    const oldExcess = parseFloat(pw.excess_kg || 0);
    const revertDelta = oldShort - oldExcess;
    const newKaccha = Math.max(0, parseFloat(bp.kaccha_weight_kg || 0) + revertDelta);
    const kacchaRate = parseFloat(bp.kaccha_rate_per_qtl || 0) || parseFloat(bp.rate_per_qtl || 0);
    const newKacchaAmt = Math.round((newKaccha / 100) * kacchaRate * 100) / 100;
    const pakkaAmt = parseFloat(bp.amount || 0);
    const pakkaTax = parseFloat(bp.tax_amount || 0);
    const newTotal = Math.round((pakkaAmt + pakkaTax + newKacchaAmt) * 100) / 100;
    const newBalance = Math.round((newTotal - parseFloat(bp.advance || 0)) * 100) / 100;
    const { auto_adjust_party_weight_id, ...rest } = bp;
    database.data.bp_sale_register[idx] = {
      ...rest,
      kaccha_weight_kg: newKaccha,
      kaccha_amount: newKacchaAmt,
      total: newTotal,
      balance: newBalance,
      updated_at: new Date().toISOString(),
    };
    // v104.44.94 — Sync KCA ledger entries back
    const docId = bp.id;
    const nowIso = new Date().toISOString();
    if (database.data.cash_transactions) {
      for (const t of database.data.cash_transactions) {
        if ((t.reference || '') === `bp_sale_ka:${docId}`) { t.amount = newKacchaAmt; t.updated_at = nowIso; }
      }
    }
    if (database.data.local_party_accounts) {
      for (const t of database.data.local_party_accounts) {
        if ((t.reference || '') === `bp_sale_ka:${docId}`) { t.amount = newKacchaAmt; t.updated_at = nowIso; }
      }
    }
    if (database.data.truck_payments) {
      for (const t of database.data.truck_payments) {
        if ((t.reference || '') === `bp_sale_truck:${docId}`) { t.net_amount = newTotal; t.updated_at = nowIso; }
      }
    }
    // v104.44.94 — Revert oil_premium for this voucher
    revertOilPremiumForVoucher(bp.voucher_no || '');
    database.save();
  }

  function fetchSaleInfo(product, voucherNo, kmsYear) {
    const vno = String(voucherNo || '').trim();
    if (!vno) return null;
    // BP register first
    const bps = (database.data.bp_sale_register || []).find(s => {
      if (String(s.voucher_no || '') !== vno) return false;
      if (product && s.product !== product) return false;
      if (kmsYear && s.kms_year !== kmsYear) return false;
      return true;
    });
    if (bps) {
      return {
        voucher_no: bps.voucher_no || '',
        date: bps.date || '',
        party_name: bps.party_name || '',
        vehicle_no: bps.vehicle_no || '',
        rst_no: bps.rst_no || '',
        net_weight_kg: parseFloat(bps.net_weight_kg || 0),
        kms_year: bps.kms_year || '',
        season: bps.season || '',
        source: 'bp_sale_register',
      };
    }
    // Fallback: sale_vouchers (Pvt Rice / Govt Rice)
    const sv = (database.data.sale_vouchers || []).find(s => {
      if (String(s.voucher_no || '') !== vno) return false;
      if (kmsYear && s.kms_year !== kmsYear) return false;
      return true;
    });
    if (sv) {
      return {
        voucher_no: sv.voucher_no || '',
        date: sv.date || '',
        party_name: sv.party_name || '',
        vehicle_no: sv.vehicle_no || '',
        rst_no: sv.rst_no || '',
        net_weight_kg: parseFloat(sv.net_weight_kg || 0),
        kms_year: sv.kms_year || '',
        season: sv.season || '',
        source: 'sale_vouchers',
      };
    }
    return null;
  }

  // GET /api/party-weight/lookup
  router.get('/api/party-weight/lookup', (req, res) => {
    const { voucher_no = '', product = '', kms_year = '' } = req.query;
    const info = fetchSaleInfo(product, voucher_no, kms_year);
    if (!info) return res.status(404).json({ detail: `Voucher #${voucher_no} not found` });
    res.json(info);
  });

  // GET /api/party-weight
  router.get('/api/party-weight', (req, res) => {
    ensure();
    const items = filterItems(req.query);
    items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(items);
  });

  function filterItems(q) {
    const { product = '', kms_year = '', season = '', date_from = '', date_to = '',
            party_name = '', voucher_no = '', vehicle_no = '' } = q || {};
    let items = database.data.party_weights.slice();
    if (product) items = items.filter(i => i.product === product);
    if (kms_year) items = items.filter(i => (i.kms_year || '') === kms_year);
    if (season) items = items.filter(i => (i.season || '') === season);
    if (date_from) items = items.filter(i => (i.date || '') >= date_from);
    if (date_to) items = items.filter(i => (i.date || '') <= date_to);
    if (party_name) {
      const qq = party_name.toLowerCase();
      items = items.filter(i => (i.party_name || '').toLowerCase().includes(qq));
    }
    if (voucher_no) {
      const qq = String(voucher_no).toLowerCase();
      items = items.filter(i => String(i.voucher_no || '').toLowerCase().includes(qq));
    }
    if (vehicle_no) {
      const qq = String(vehicle_no).toLowerCase();
      items = items.filter(i => String(i.vehicle_no || '').toLowerCase().includes(qq));
    }
    return items;
  }

  // POST /api/party-weight
  router.post('/api/party-weight', (req, res) => {
    ensure();
    const data = req.body || {};
    const username = req.query.username || '';
    const voucherNo = String(data.voucher_no || '').trim();
    const product = String(data.product || '').trim();
    if (!voucherNo) return res.status(400).json({ detail: 'Voucher No. required' });
    if (!product) return res.status(400).json({ detail: 'Product required' });

    const kms = data.kms_year || '';
    const dup = database.data.party_weights.find(i => i.product === product && i.voucher_no === voucherNo && (i.kms_year || '') === kms);
    if (dup) return res.status(400).json({ detail: `Party Weight entry for Voucher #${voucherNo} already exists` });

    const info = fetchSaleInfo(product, voucherNo, kms);
    const ourKg = parseFloat(data.our_net_weight_kg || (info ? info.net_weight_kg : 0) || 0);
    const partyKg = parseFloat(data.party_net_weight_kg || 0);
    const diff = computeDiff(ourKg, partyKg);
    const autoAdjust = data.auto_adjust !== false;
    const now = new Date().toISOString();
    const pwId = uuid();

    const doc = {
      id: pwId,
      product,
      voucher_no: voucherNo,
      date: data.date || (info ? info.date : '') || '',
      party_name: data.party_name || (info ? info.party_name : '') || '',
      vehicle_no: data.vehicle_no || (info ? info.vehicle_no : '') || '',
      rst_no: data.rst_no || (info ? info.rst_no : '') || '',
      our_net_weight_kg: ourKg,
      party_net_weight_kg: partyKg,
      shortage_kg: diff.shortage_kg,
      excess_kg: diff.excess_kg,
      remark: data.remark || '',
      kms_year: kms,
      season: data.season || (info ? info.season : '') || '',
      auto_adjusted: false,
      adjust_mode: '',
      adjust_amount: 0,
      created_at: now,
      updated_at: now,
      created_by: username,
    };
    database.data.party_weights.push(doc);
    database.save();

    // v104.44.93 — Apply auto-adjust if requested
    if (autoAdjust && (diff.shortage_kg > 0 || diff.excess_kg > 0)) {
      const adj = applyAutoAdjust(pwId, product, voucherNo, kms, doc.party_name, doc.date,
                                    diff.shortage_kg, diff.excess_kg, doc.season, username);
      if (adj.mode !== 'skipped') {
        const idx = database.data.party_weights.findIndex(p => p.id === pwId);
        if (idx >= 0) {
          database.data.party_weights[idx] = { ...database.data.party_weights[idx],
            auto_adjusted: true, adjust_mode: adj.mode, adjust_amount: adj.amount };
          database.save();
        }
        doc.auto_adjusted = true;
        doc.adjust_mode = adj.mode;
        doc.adjust_amount = adj.amount;
        doc.adjust_message = adj.message;
      }
    }
    res.json(doc);
  });

  // PUT /api/party-weight/:id
  router.put('/api/party-weight/:id', (req, res) => {
    ensure();
    const data = req.body || {};
    const username = req.query.username || '';
    const idx = database.data.party_weights.findIndex(i => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Entry not found' });
    const existing = database.data.party_weights[idx];

    // Reverse any prior adjustment first
    if (existing.auto_adjusted) reverseAutoAdjust(req.params.id);

    const ourKg = parseFloat(data.our_net_weight_kg != null ? data.our_net_weight_kg : existing.our_net_weight_kg || 0);
    const partyKg = parseFloat(data.party_net_weight_kg != null ? data.party_net_weight_kg : existing.party_net_weight_kg || 0);
    const diff = computeDiff(ourKg, partyKg);
    const autoAdjust = data.auto_adjust != null ? !!data.auto_adjust : !!existing.auto_adjusted;

    const updates = {
      our_net_weight_kg: ourKg,
      party_net_weight_kg: partyKg,
      shortage_kg: diff.shortage_kg,
      excess_kg: diff.excess_kg,
      remark: data.remark != null ? data.remark : existing.remark || '',
      party_name: data.party_name != null ? data.party_name : existing.party_name || '',
      date: data.date != null ? data.date : existing.date || '',
      auto_adjusted: false,
      adjust_mode: '',
      adjust_amount: 0,
      updated_at: new Date().toISOString(),
    };
    let merged = { ...existing, ...updates };
    database.data.party_weights[idx] = merged;
    database.save();

    if (autoAdjust && (diff.shortage_kg > 0 || diff.excess_kg > 0)) {
      const adj = applyAutoAdjust(req.params.id, existing.product || '', existing.voucher_no || '',
                                    existing.kms_year || '', updates.party_name, updates.date,
                                    diff.shortage_kg, diff.excess_kg, existing.season || '', username);
      if (adj.mode !== 'skipped') {
        merged = { ...merged, auto_adjusted: true, adjust_mode: adj.mode, adjust_amount: adj.amount };
        database.data.party_weights[idx] = merged;
        database.save();
      }
    }
    res.json(merged);
  });

  // v104.44.94 — One-shot backfill endpoint: sync all BP sales that were auto-adjusted via PW
  router.post('/api/party-weight/resync-ledger', (req, res) => {
    ensure();
    let fixedBp = 0, fixedTxn = 0, fixedLpa = 0, fixedTp = 0, fixedOp = 0;
    const nowIso = new Date().toISOString();
    for (const bp of (database.data.bp_sale_register || [])) {
      if (!bp.auto_adjust_party_weight_id) continue;
      const docId = bp.id;
      if (!docId) continue;
      const newKacchaAmt = parseFloat(bp.kaccha_amount || 0);
      const newTotal = parseFloat(bp.total || 0);
      if (database.data.cash_transactions) {
        for (const t of database.data.cash_transactions) {
          if ((t.reference || '') === `bp_sale_ka:${docId}`) { t.amount = newKacchaAmt; t.updated_at = nowIso; fixedTxn++; }
        }
      }
      if (database.data.local_party_accounts) {
        for (const t of database.data.local_party_accounts) {
          if ((t.reference || '') === `bp_sale_ka:${docId}`) { t.amount = newKacchaAmt; t.updated_at = nowIso; fixedLpa++; }
        }
      }
      if (database.data.truck_payments) {
        for (const t of database.data.truck_payments) {
          if ((t.reference || '') === `bp_sale_truck:${docId}`) { t.net_amount = newTotal; t.updated_at = nowIso; fixedTp++; }
        }
      }
      const voucher = bp.voucher_no || '';
      if (voucher) {
        const newQty = parseFloat(bp.kaccha_weight_kg || 0) / 100;
        resyncOilPremiumForVoucher(voucher, bp.auto_adjust_party_weight_id, newQty);
        fixedOp++;
      }
      fixedBp++;
    }
    database.save();
    res.json({
      success: true,
      bp_sales_checked: fixedBp,
      cash_transactions_synced: fixedTxn,
      local_party_accounts_synced: fixedLpa,
      truck_payments_synced: fixedTp,
      oil_premium_resynced: fixedOp,
    });
  });

  // DELETE /api/party-weight/:id
  router.delete('/api/party-weight/:id', (req, res) => {
    ensure();
    const existing = database.data.party_weights.find(i => i.id === req.params.id);
    if (existing && existing.auto_adjusted) reverseAutoAdjust(req.params.id);
    const before = database.data.party_weights.length;
    database.data.party_weights = database.data.party_weights.filter(i => i.id !== req.params.id);
    if (database.data.party_weights.length === before) return res.status(404).json({ detail: 'Entry not found' });
    database.save();
    res.json({ deleted: true });
  });

  // ============================================================
  // v104.44.93 — Excel & PDF Export (parity with Python)
  // ============================================================

  router.get('/api/party-weight/export/excel', async (req, res) => {
    try {
      ensure();
      const items = filterItems(req.query).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      const product = req.query.product || '';
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Party Weight Register');

      // Title
      ws.mergeCells('A1:J1');
      const tCell = ws.getCell('A1');
      tCell.value = `Party Weight Register — ${product || 'All Products'}`;
      tCell.font = { bold: true, size: 16, color: { argb: 'FF1E3A8A' } };
      tCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 28;

      // Subtitle filters
      const parts = [];
      if (req.query.kms_year) parts.push(`KMS: ${req.query.kms_year}`);
      if (req.query.season) parts.push(`Season: ${req.query.season}`);
      if (req.query.date_from || req.query.date_to) parts.push(`Date: ${req.query.date_from || 'start'} → ${req.query.date_to || 'today'}`);
      if (req.query.party_name) parts.push(`Party: ${req.query.party_name}`);
      if (req.query.voucher_no) parts.push(`Voucher: ${req.query.voucher_no}`);
      if (req.query.vehicle_no) parts.push(`Vehicle: ${req.query.vehicle_no}`);
      if (parts.length) {
        ws.mergeCells('A2:J2');
        const sCell = ws.getCell('A2');
        sCell.value = parts.join('  •  ');
        sCell.font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
        sCell.alignment = { horizontal: 'center' };
      }

      // Headers row 4
      const headers = ['Date', 'Voucher', 'Party', 'Vehicle', 'RST',
                        'Our N/W (Kg)', 'Party N/W (Kg)', 'Shortage (Kg)', 'Excess (Kg)', 'Remark'];
      const hRow = ws.getRow(4);
      headers.forEach((h, i) => {
        const c = hRow.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      });
      hRow.height = 22;

      // Data rows
      let totalShort = 0, totalExcess = 0;
      items.forEach((it, idx) => {
        const shortKg = parseFloat(it.shortage_kg || 0) || 0;
        const excessKg = parseFloat(it.excess_kg || 0) || 0;
        totalShort += shortKg; totalExcess += excessKg;
        const row = ws.addRow([
          it.date || '', it.voucher_no || '', it.party_name || '',
          it.vehicle_no || '', it.rst_no || '',
          parseFloat(it.our_net_weight_kg || 0) || 0,
          parseFloat(it.party_net_weight_kg || 0) || 0,
          shortKg, excessKg, it.remark || '',
        ]);
        row.height = 18;
        let fillColor = null;
        if (shortKg > 0) fillColor = 'FFFEE2E2';
        else if (excessKg > 0) fillColor = 'FFDCFCE7';
        else if (idx % 2) fillColor = 'FFF8FAFC';
        row.eachCell((c, cn) => {
          c.font = { size: 9 };
          c.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }, left: { style: 'thin', color: { argb: 'FFCBD5E1' } }, right: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
          if (fillColor) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
          if (cn >= 6 && cn <= 9) {
            c.alignment = { horizontal: 'right', vertical: 'middle' };
            c.numFmt = '#,##0.00';
          } else c.alignment = { horizontal: 'left', vertical: 'middle' };
        });
      });

      // Totals row
      const trow = ws.addRow(['TOTALS', '', '', '', '', '', '', Math.round(totalShort * 100) / 100, Math.round(totalExcess * 100) / 100, '']);
      trow.height = 22;
      trow.eachCell((c, cn) => {
        c.font = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        c.border = { top: { style: 'medium', color: { argb: 'FF1E3A8A' } }, bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (cn >= 6) {
          c.alignment = { horizontal: 'right', vertical: 'middle' };
          c.numFmt = '#,##0.00';
        } else c.alignment = { horizontal: 'left', vertical: 'middle' };
      });

      // Widths
      const widths = [11, 12, 24, 14, 8, 14, 14, 14, 14, 26];
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 4 }];

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="party_weight_${product || 'all'}_${req.query.kms_year || 'all'}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) { res.status(500).json({ detail: String(e) }); }
  });

  router.get('/api/party-weight/export/pdf', (req, res) => {
    try {
      ensure();
      const items = filterItems(req.query).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      const product = req.query.product || '';
      const totalShort = items.reduce((a, i) => a + (parseFloat(i.shortage_kg || 0) || 0), 0);
      const totalExcess = items.reduce((a, i) => a + (parseFloat(i.excess_kg || 0) || 0), 0);
      const shortCount = items.filter(i => (parseFloat(i.shortage_kg || 0) || 0) > 0).length;
      const excessCount = items.filter(i => (parseFloat(i.excess_kg || 0) || 0) > 0).length;

      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="party_weight_${product || 'all'}_${req.query.kms_year || 'all'}.pdf"`);
      doc.pipe(res);

      // Title
      doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(16).text(`Party Weight Register — ${product || 'All Products'}`, { align: 'center' });
      doc.moveDown(0.2);

      // Filters subtitle
      const parts = [];
      if (req.query.kms_year) parts.push(`KMS: ${req.query.kms_year}`);
      if (req.query.season) parts.push(`Season: ${req.query.season}`);
      if (req.query.date_from || req.query.date_to) parts.push(`Date: ${req.query.date_from || 'start'} → ${req.query.date_to || 'today'}`);
      if (req.query.party_name) parts.push(`Party: ${req.query.party_name}`);
      if (req.query.voucher_no) parts.push(`Voucher: ${req.query.voucher_no}`);
      if (req.query.vehicle_no) parts.push(`Vehicle: ${req.query.vehicle_no}`);
      doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(9).text(parts.length ? parts.join('  •  ') : 'All records', { align: 'center' });
      doc.moveDown(0.5);

      // Stats strip
      const stats = [
        { label: 'Records', value: String(items.length), color: '#1E3A8A' },
        { label: 'Shortage Cases', value: String(shortCount), color: '#DC2626' },
        { label: 'Excess Cases', value: String(excessCount), color: '#16A34A' },
        { label: 'Total Shortage', value: `${totalShort.toFixed(2)} Kg`, color: '#DC2626' },
        { label: 'Total Excess', value: `${totalExcess.toFixed(2)} Kg`, color: '#16A34A' },
      ];
      const statsW = 153, statsH = 38;
      const statsTotal = statsW * stats.length;
      let statsX = (doc.page.width - statsTotal) / 2;
      let statsY = doc.y;
      stats.forEach(s => {
        doc.rect(statsX, statsY, statsW, statsH).fill('#F8FAFC').stroke('#1E3A8A');
        doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(8).text(s.label, statsX, statsY + 4, { width: statsW, align: 'center' });
        doc.fillColor(s.color).fontSize(11).text(s.value, statsX, statsY + 20, { width: statsW, align: 'center' });
        statsX += statsW;
      });
      doc.y = statsY + statsH + 10;

      // Table
      const headers = ['Date', 'Voucher', 'Party', 'Vehicle', 'RST', 'Our N/W (Kg)', 'Party N/W (Kg)', 'Shortage', 'Excess', 'Remark'];
      const widths = [45, 50, 130, 60, 35, 70, 70, 60, 60, 140];
      const totalW = widths.reduce((a, b) => a + b, 0);
      const startX = (doc.page.width - totalW) / 2;
      let y = doc.y;
      const rowH = 16, hH = 20;

      doc.rect(startX, y, totalW, hH).fill('#1E3A8A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      let x = startX;
      headers.forEach((h, i) => { doc.text(h, x + 2, y + 6, { width: widths[i] - 4, align: 'center' }); x += widths[i]; });
      y += hH;

      for (const it of items) {
        if (y + rowH > doc.page.height - 50) { doc.addPage(); y = 30; }
        const shortKg = parseFloat(it.shortage_kg || 0) || 0;
        const excessKg = parseFloat(it.excess_kg || 0) || 0;
        const fill = shortKg > 0 ? '#FEE2E2' : (excessKg > 0 ? '#DCFCE7' : '#FFFFFF');
        doc.rect(startX, y, totalW, rowH).fill(fill);
        doc.strokeColor('#CBD5E1').lineWidth(0.3).rect(startX, y, totalW, rowH).stroke();
        const vals = [
          (it.date || '').slice(-5),
          it.voucher_no || '-',
          (it.party_name || '').slice(0, 20),
          (it.vehicle_no || '').slice(0, 12),
          it.rst_no || '',
          (parseFloat(it.our_net_weight_kg || 0) || 0).toFixed(2),
          (parseFloat(it.party_net_weight_kg || 0) || 0).toFixed(2),
          shortKg ? shortKg.toFixed(2) : '—',
          excessKg ? excessKg.toFixed(2) : '—',
          (it.remark || '').slice(0, 28),
        ];
        doc.fillColor('#0F172A').font('Helvetica').fontSize(7);
        x = startX;
        vals.forEach((v, i) => {
          const align = i >= 5 && i <= 8 ? 'right' : 'left';
          doc.text(String(v), x + 2, y + 4, { width: widths[i] - 4, align });
          x += widths[i];
        });
        y += rowH;
      }

      // Totals
      if (y + rowH + 4 > doc.page.height - 50) { doc.addPage(); y = 30; }
      doc.rect(startX, y, totalW, rowH + 4).fill('#FEF3C7');
      doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(9);
      const tvals = ['TOTALS', '', '', '', '', '', '', totalShort.toFixed(2), totalExcess.toFixed(2), ''];
      x = startX;
      tvals.forEach((v, i) => {
        const align = i >= 5 && i <= 8 ? 'right' : 'left';
        doc.text(String(v), x + 2, y + 6, { width: widths[i] - 4, align });
        x += widths[i];
      });

      // Footer
      doc.y = y + rowH + 14;
      doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(7)
        .text(`Generated: ${new Date().toUTCString()}`, { align: 'center' });

      doc.end();
    } catch (e) { res.status(500).json({ detail: String(e) }); }
  });

  return router;
};
