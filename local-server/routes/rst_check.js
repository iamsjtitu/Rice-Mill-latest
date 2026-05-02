// v104.44.28 — Unified RST cross-check endpoint
module.exports = (db) => {
  const router = require('express').Router();
  const { col } = require('./_helpers')(db);

  const SALE_COLLECTIONS = ['sale_vouchers', 'by_product_sale_vouchers'];
  const PURCHASE_COLLECTIONS = ['purchase_vouchers', 'private_paddy', 'entries'];

  function search(collection, rst_no, exclude_id) {
    const rstLower = String(rst_no || '').trim().toLowerCase();
    if (!rstLower) return [];
    const items = (col(collection) || []).filter(d => {
      const dRst = String(d.rst_no || '').trim().toLowerCase();
      return dRst === rstLower && (!exclude_id || d.id !== exclude_id);
    }).slice(0, 5);
    return items.map(d => ({
      collection,
      id: d.id || '',
      voucher_no: d.voucher_no || d.voucher_no_label || '',
      party_name: d.party_name || d.seller_name || d.buyer_name || '',
      date: d.date || '',
      rst_no: d.rst_no || '',
      amount: d.total || d.subtotal || d.final_amount || 0,
      kg: d.kg || d.quantity || 0,
      agent_name: d.agent_name || '',
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
    res.json({ rst_no, context, exists_same, exists_other });
  });

  return router;
};
