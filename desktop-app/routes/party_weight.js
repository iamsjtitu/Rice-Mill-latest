// v104.44.70 — Party Weight Register (Desktop Electron parity)
// Tracks party dharam-kaata weight vs our mill weight for shortage/excess
const { v4: uuid } = require('uuid');

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
    const { product = '', kms_year = '', season = '', date_from = '', date_to = '', party_name = '', voucher_no = '' } = req.query;
    let items = database.data.party_weights.slice();
    if (product) items = items.filter(i => i.product === product);
    if (kms_year) items = items.filter(i => (i.kms_year || '') === kms_year);
    if (season) items = items.filter(i => (i.season || '') === season);
    if (date_from) items = items.filter(i => (i.date || '') >= date_from);
    if (date_to) items = items.filter(i => (i.date || '') <= date_to);
    if (party_name) {
      const q = party_name.toLowerCase();
      items = items.filter(i => (i.party_name || '').toLowerCase().includes(q));
    }
    if (voucher_no) {
      const q = String(voucher_no).toLowerCase();
      items = items.filter(i => String(i.voucher_no || '').toLowerCase().includes(q));
    }
    items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(items);
  });

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
    const now = new Date().toISOString();

    const doc = {
      id: uuid(),
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
      created_at: now,
      updated_at: now,
      created_by: username,
    };
    database.data.party_weights.push(doc);
    database.save();
    res.json(doc);
  });

  // PUT /api/party-weight/:id
  router.put('/api/party-weight/:id', (req, res) => {
    ensure();
    const data = req.body || {};
    const idx = database.data.party_weights.findIndex(i => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Entry not found' });
    const existing = database.data.party_weights[idx];
    const ourKg = parseFloat(data.our_net_weight_kg != null ? data.our_net_weight_kg : existing.our_net_weight_kg || 0);
    const partyKg = parseFloat(data.party_net_weight_kg != null ? data.party_net_weight_kg : existing.party_net_weight_kg || 0);
    const diff = computeDiff(ourKg, partyKg);
    const updates = {
      our_net_weight_kg: ourKg,
      party_net_weight_kg: partyKg,
      shortage_kg: diff.shortage_kg,
      excess_kg: diff.excess_kg,
      remark: data.remark != null ? data.remark : existing.remark || '',
      party_name: data.party_name != null ? data.party_name : existing.party_name || '',
      date: data.date != null ? data.date : existing.date || '',
      updated_at: new Date().toISOString(),
    };
    const merged = { ...existing, ...updates };
    database.data.party_weights[idx] = merged;
    database.save();
    res.json(merged);
  });

  // DELETE /api/party-weight/:id
  router.delete('/api/party-weight/:id', (req, res) => {
    ensure();
    const before = database.data.party_weights.length;
    database.data.party_weights = database.data.party_weights.filter(i => i.id !== req.params.id);
    if (database.data.party_weights.length === before) return res.status(404).json({ detail: 'Entry not found' });
    database.save();
    res.json({ deleted: true });
  });

  return router;
};
