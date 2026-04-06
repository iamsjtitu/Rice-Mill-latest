const express = require('express');
const { safeHandler } = require('./safe_handler');
const { fmtDate } = require('./pdf_helpers');

module.exports = function(database) {
  const router = express.Router();

  // GET /api/gst-ledger/opening-balance
  router.get('/api/gst-ledger/opening-balance', safeHandler(async (req, res) => {
    const kms_year = req.query.kms_year;
    if (!database.data.gst_opening_balances) database.data.gst_opening_balances = {};
    const saved = database.data.gst_opening_balances[kms_year];
    if (saved) return res.json({ igst: saved.igst || 0, sgst: saved.sgst || 0, cgst: saved.cgst || 0, kms_year, source: 'manual' });
    res.json({ igst: 0, sgst: 0, cgst: 0, kms_year, source: 'none' });
  }));

  // PUT /api/gst-ledger/opening-balance
  router.put('/api/gst-ledger/opening-balance', safeHandler(async (req, res) => {
    const { kms_year, igst, sgst, cgst } = req.body;
    if (!kms_year) return res.status(400).json({ detail: 'kms_year is required' });
    if (!database.data.gst_opening_balances) database.data.gst_opening_balances = {};
    const doc = { kms_year, igst: parseFloat(igst) || 0, sgst: parseFloat(sgst) || 0, cgst: parseFloat(cgst) || 0, updated_at: new Date().toISOString() };
    database.data.gst_opening_balances[kms_year] = doc;
    database.save();
    res.json(doc);
  }));

  // GET /api/gst-ledger
  router.get('/api/gst-ledger', safeHandler(async (req, res) => {
    const { kms_year, season } = req.query;
    if (!database.data.gst_opening_balances) database.data.gst_opening_balances = {};
    const ob = database.data.gst_opening_balances[kms_year] || { igst: 0, sgst: 0, cgst: 0 };

    const entries = [];
    const filter = (arr) => (arr || []).filter(v => (!kms_year || v.kms_year === kms_year) && (!season || v.season === season));

    // Purchase vouchers → credit
    filter(database.data.purchase_vouchers).forEach(p => {
      const cgst = p.cgst_amount || 0, sgst = p.sgst_amount || 0, igst = p.igst_amount || 0;
      if (cgst > 0 || sgst > 0 || igst > 0) {
        entries.push({ date: p.date || '', type: 'purchase', voucher_type: 'Purchase', voucher_no: p.voucher_no || '', party: p.party_name || '',
          description: `Purchase #${p.voucher_no || ''} - ${p.party_name || ''}`, cgst: Math.round(cgst * 100) / 100, sgst: Math.round(sgst * 100) / 100,
          igst: Math.round(igst * 100) / 100, direction: 'credit', id: p.id || '' });
      }
    });

    // Gunny bags purchases → credit
    filter(database.data.gunny_bags).filter(g => g.txn_type === 'in').forEach(g => {
      let cgst = g.cgst_amount || 0, sgst = g.sgst_amount || 0, igst = 0;
      if (g.gst_type === 'igst') { igst = g.gst_amount || 0; cgst = 0; sgst = 0; }
      if (cgst > 0 || sgst > 0 || igst > 0) {
        entries.push({ date: g.date || '', type: 'purchase', voucher_type: 'Gunny Bag', voucher_no: g.invoice_no || '', party: g.party_name || g.source || '',
          description: `Gunny Bag - ${g.party_name || g.source || ''}`, cgst: Math.round(cgst * 100) / 100, sgst: Math.round(sgst * 100) / 100,
          igst: Math.round(igst * 100) / 100, direction: 'credit', id: g.id || '' });
      }
    });

    // Sale vouchers → debit
    filter(database.data.sale_vouchers).forEach(s => {
      const cgst = s.cgst_amount || 0, sgst = s.sgst_amount || 0, igst = s.igst_amount || 0;
      if (cgst > 0 || sgst > 0 || igst > 0) {
        entries.push({ date: s.date || '', type: 'sale', voucher_type: 'Sale', voucher_no: s.voucher_no || '', party: s.party_name || '',
          description: `Sale #${s.voucher_no || ''} - ${s.party_name || ''}`, cgst: Math.round(cgst * 100) / 100, sgst: Math.round(sgst * 100) / 100,
          igst: Math.round(igst * 100) / 100, direction: 'debit', id: s.id || '' });
      }
    });

    entries.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));

    let rc = ob.cgst || 0, rs = ob.sgst || 0, ri = ob.igst || 0;
    for (const e of entries) {
      if (e.direction === 'credit') { rc += e.cgst; rs += e.sgst; ri += e.igst; }
      else { rc -= e.cgst; rs -= e.sgst; ri -= e.igst; }
      e.running_cgst = Math.round(rc * 100) / 100;
      e.running_sgst = Math.round(rs * 100) / 100;
      e.running_igst = Math.round(ri * 100) / 100;
    }

    const sum = (dir, field) => Math.round(entries.filter(e => e.direction === dir).reduce((s, e) => s + (e[field] || 0), 0) * 100) / 100;
    res.json({
      opening_balance: { igst: ob.igst || 0, sgst: ob.sgst || 0, cgst: ob.cgst || 0 },
      entries,
      summary: {
        credit: { cgst: sum('credit', 'cgst'), sgst: sum('credit', 'sgst'), igst: sum('credit', 'igst') },
        debit: { cgst: sum('debit', 'cgst'), sgst: sum('debit', 'sgst'), igst: sum('debit', 'igst') },
        balance: { cgst: Math.round(rc * 100) / 100, sgst: Math.round(rs * 100) / 100, igst: Math.round(ri * 100) / 100 }
      },
      total_entries: entries.length
    });
  }));

  // GET /api/govt-bags/stock
  router.get('/api/govt-bags/stock', safeHandler(async (req, res) => {
    const { kms_year, season } = req.query;
    const bags = (database.data.gunny_bags || []).filter(b => b.bag_type === 'new' && (!kms_year || b.kms_year === kms_year) && (!season || b.season === season));
    const bags_in = bags.filter(b => b.txn_type === 'in').reduce((s, b) => s + (b.quantity || 0), 0);
    const bags_out = bags.filter(b => b.txn_type === 'out').reduce((s, b) => s + (b.quantity || 0), 0);
    res.json({ bags_in, bags_out, stock: bags_in - bags_out });
  }));

  return router;
};
