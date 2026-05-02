// v104.44.32 — Fixed collection names (bp_sale_register, not by_product_sale_vouchers)
// Unified RST cross-check endpoint
// Detects duplicate in same category + overlap with opposite category (sale vs purchase)
module.exports = (db) => {
  const router = require('express').Router();
  // Inline col() helper — lowdb data access
  const col = (name) => (db && db.data && db.data[name]) || [];

  // Node uses 'entries' (not 'mill_entries') for mill entries collection
  const SALE_COLLECTIONS = ['sale_vouchers', 'bp_sale_register'];
  const PURCHASE_COLLECTIONS = ['purchase_vouchers', 'private_paddy', 'entries'];

  function rstMatches(docRst, target) {
    const s = String(docRst || '').trim().toLowerCase();
    return s === target.toLowerCase() || s === String(parseInt(target, 10));
  }

  function search(collection, rst_no, exclude_id) {
    const target = String(rst_no || '').trim();
    if (!target) return [];
    const items = (col(collection) || []).filter(d =>
      rstMatches(d.rst_no, target) && (!exclude_id || d.id !== exclude_id)
    ).slice(0, 5);
    return items.map(d => ({
      collection,
      id: d.id || '',
      voucher_no: d.voucher_no || d.voucher_no_label || '',
      party_name: d.party_name || d.seller_name || d.buyer_name || '',
      date: d.date || '',
      rst_no: String(d.rst_no || ''),
      amount: d.total || d.subtotal || d.final_amount || 0,
      kg: d.kg || d.quantity || 0,
      agent_name: d.agent_name || '',
      mandi_name: d.mandi_name || '',
    }));
  }

  function searchVw(rst_no, exclude_id, isSale) {
    const target = String(rst_no || '').trim();
    if (!target) return [];
    const items = (col('vehicle_weights') || []).filter(d => {
      if (!rstMatches(d.rst_no, target)) return false;
      if (exclude_id && d.id === exclude_id) return false;
      const tt = (d.trans_type || '').toLowerCase();
      const isDispatch = /dispatch|sale/.test(tt);
      const isReceive = /receive|purchase/.test(tt);
      return isSale ? isDispatch : isReceive;
    }).slice(0, 5);
    return items.map(d => ({
      collection: 'vehicle_weights',
      id: d.id || '',
      voucher_no: '',
      party_name: d.party_name || '',
      date: d.date || '',
      rst_no: String(d.rst_no || ''),
      amount: 0,
      kg: d.net_weight || 0,
      trans_type: d.trans_type || '',
      vehicle_no: d.vehicle_no || '',
      mandi_name: d.mandi_name || '',
    }));
  }

  router.get('/api/rst-check', (req, res) => {
    const rst_no = String(req.query.rst_no || '').trim();
    if (!rst_no) return res.json({ exists_same: [], exists_other: [] });
    const context = (req.query.context || 'sale').toString().toLowerCase();
    const exclude_id = (req.query.exclude_id || '').toString();
    const same_cols = context === 'sale' ? SALE_COLLECTIONS : PURCHASE_COLLECTIONS;
    const other_cols = context === 'sale' ? PURCHASE_COLLECTIONS : SALE_COLLECTIONS;
    const exists_same = same_cols.flatMap(c => search(c, rst_no, exclude_id));
    const exists_other = other_cols.flatMap(c => search(c, rst_no, exclude_id));
    // VW: trans_type-aware
    exists_same.push(...searchVw(rst_no, exclude_id, context === 'sale'));
    exists_other.push(...searchVw(rst_no, exclude_id, context !== 'sale'));
    res.json({ rst_no, context, exists_same, exists_other });
  });

  // v104.44.35 — Smallest unused number across collections (RST or TP)
  // Avoids stale-high-RST poisoning the next-X suggestion
  function smallestUnusedAcross(collections, field, kms_year) {
    const used = new Set();
    for (const c of collections) {
      const items = col(c) || [];
      for (const d of items) {
        if (kms_year && d.kms_year !== kms_year) continue;
        const n = parseInt(String(d[field] || '').trim(), 10);
        if (!isNaN(n) && n > 0) used.add(n);
      }
    }
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  router.get('/api/rst-check/next-rst', (req, res) => {
    const kms = (req.query.kms_year || '').toString();
    const n = smallestUnusedAcross(
      ['vehicle_weights', 'sale_vouchers', 'purchase_vouchers',
       'private_paddy', 'entries', 'bp_sale_register'],
      'rst_no', kms
    );
    res.json({ rst_no: n, kms_year: kms });
  });

  router.get('/api/rst-check/next-tp', (req, res) => {
    const kms = (req.query.kms_year || '').toString();
    const n = smallestUnusedAcross(['entries', 'vehicle_weights'], 'tp_no', kms);
    res.json({ tp_no: n, kms_year: kms });
  });

  return router;
};
