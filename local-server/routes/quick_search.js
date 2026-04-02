/**
 * Quick Search - Search across all collections
 * Desktop + Local Server route
 */
const express = require('express');

module.exports = function quickSearchRoutes(database) {
  const router = express.Router();

  router.get('/api/quick-search', (req, res) => {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);

    if (!q) return res.json({ results: [], total: 0 });

    const results = [];
    const ql = q.toLowerCase();
    const match = (val) => val && String(val).toLowerCase().includes(ql);

    // 1. Mill Entries
    (database.data.entries || [])
      .filter(e => match(e.truck_no) || match(e.agent_name) || match(e.mandi_name) || match(e.rst_no) || match(e.tp_no))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(e => results.push({
        id: e.id, type: 'entry', tab: 'entries',
        title: `Truck: ${e.truck_no || ''}`,
        subtitle: `${e.agent_name || ''} - ${e.mandi_name || ''} | ${e.kg || 0} kg`,
        date: e.date || '', data: { id: e.id, date: e.date, truck_no: e.truck_no, agent_name: e.agent_name, mandi_name: e.mandi_name, kg: e.kg, qntl: e.qntl }
      }));

    // 2. Cash Transactions
    (database.data.cash_transactions || [])
      .filter(t => match(t.category) || match(t.description) || match(t.party_type))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(t => results.push({
        id: t.id, type: 'cash_transaction', tab: 'cashbook',
        title: `${t.category || ''} (${t.txn_type === 'jama' ? 'Jama' : 'Nikasi'})`,
        subtitle: `Rs.${(t.amount || 0).toLocaleString('en-IN')} | ${(t.description || '').slice(0, 60)}`,
        date: t.date || '', data: { id: t.id, date: t.date, category: t.category, amount: t.amount, txn_type: t.txn_type, account: t.account }
      }));

    // 3. Private Paddy
    (database.data.private_paddy || [])
      .filter(p => match(p.party_name) || match(p.mandi_name))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(p => results.push({
        id: p.id, type: 'private_paddy', tab: 'payments',
        title: `Private: ${p.party_name || ''}`,
        subtitle: `${p.mandi_name || ''} | Total: Rs.${(p.total_amount || 0).toLocaleString('en-IN')}`,
        date: p.date || '', data: { id: p.id, date: p.date, party_name: p.party_name, mandi_name: p.mandi_name, total_amount: p.total_amount }
      }));

    // 4. Sale Vouchers
    (database.data.sale_vouchers || [])
      .filter(s => match(s.party_name) || match(s.voucher_no) || match(s.truck_no))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(s => results.push({
        id: s.id, type: 'sale_voucher', tab: 'vouchers',
        title: `Sale: ${s.party_name || ''}`,
        subtitle: `Voucher #${s.voucher_no || ''} | Rs.${(s.total || 0).toLocaleString('en-IN')}`,
        date: s.date || '', data: { id: s.id, date: s.date, party_name: s.party_name, voucher_no: s.voucher_no, total: s.total }
      }));

    // 5. Purchase Vouchers
    (database.data.purchase_vouchers || [])
      .filter(p => match(p.party_name) || match(p.voucher_no) || match(p.truck_no))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(p => results.push({
        id: p.id, type: 'purchase_voucher', tab: 'vouchers',
        title: `Purchase: ${p.party_name || ''}`,
        subtitle: `Voucher #${p.voucher_no || ''} | Rs.${(p.total || 0).toLocaleString('en-IN')}`,
        date: p.date || '', data: { id: p.id, date: p.date, party_name: p.party_name, voucher_no: p.voucher_no, total: p.total }
      }));

    // 6. DC Entries
    (database.data.dc_entries || [])
      .filter(d => match(d.party_name) || match(d.vehicle_no) || match(d.lot_no))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(d => results.push({
        id: d.id, type: 'dc_entry', tab: 'dctracker',
        title: `DC: ${d.party_name || ''}`,
        subtitle: `Vehicle: ${d.vehicle_no || ''} | Lot: ${d.lot_no || ''}`,
        date: d.date || '', data: { id: d.id, date: d.date, party_name: d.party_name, vehicle_no: d.vehicle_no, lot_no: d.lot_no }
      }));

    // 7. Staff
    (database.data.staff || [])
      .filter(s => match(s.name) || match(s.phone) || match(s.role))
      .slice(0, limit)
      .forEach(s => results.push({
        id: s.id, type: 'staff', tab: 'staff',
        title: `Staff: ${s.name || ''}`,
        subtitle: `${s.role || ''} | Rs.${(s.salary || 0).toLocaleString('en-IN')}`,
        date: '', data: { id: s.id, name: s.name, role: s.role, salary: s.salary }
      }));

    // 8. Milling Entries
    (database.data.milling_entries || [])
      .filter(m => match(m.rice_type) || match(m.note))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(m => results.push({
        id: m.id, type: 'milling', tab: 'milling',
        title: `Milling: ${m.rice_type || ''}`,
        subtitle: `Paddy: ${m.paddy_input_qntl || 0}Q | Rice: ${m.rice_qntl || 0}Q | OT: ${m.outturn_ratio || 0}%`,
        date: m.date || '', data: { id: m.id, date: m.date, rice_type: m.rice_type, paddy_input_qntl: m.paddy_input_qntl, rice_qntl: m.rice_qntl }
      }));

    // 9. Diesel Accounts
    (database.data.diesel_accounts || [])
      .filter(d => match(d.truck_no) || match(d.pump_name) || match(d.description))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(d => results.push({
        id: d.id, type: 'diesel', tab: 'cashbook',
        title: `Diesel: ${d.truck_no || ''}`,
        subtitle: `${d.pump_name || ''} | Rs.${(d.amount || 0).toLocaleString('en-IN')}`,
        date: d.date || '', data: { id: d.id, date: d.date, truck_no: d.truck_no, pump_name: d.pump_name, amount: d.amount }
      }));

    // 10. Mill Parts Stock
    (database.data.mill_parts_stock || [])
      .filter(m => match(m.part_name) || match(m.party_name))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(m => results.push({
        id: m.id, type: 'mill_part', tab: 'mill-parts',
        title: `Part: ${m.part_name || ''}`,
        subtitle: `${m.party_name || ''} | Rs.${(m.total_amount || 0).toLocaleString('en-IN')}`,
        date: m.date || '', data: { id: m.id, date: m.date, part_name: m.part_name, party_name: m.party_name, total_amount: m.total_amount }
      }));

    // 11. Hemali Payments
    (database.data.hemali_payments || [])
      .filter(h => match(h.sardar_name))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(h => results.push({
        id: h.id, type: 'hemali', tab: 'hemali',
        title: `Hemali: ${h.sardar_name || ''}`,
        subtitle: `Rs.${(h.total || 0).toLocaleString('en-IN')} | ${h.status || ''}`,
        date: h.date || '', data: { id: h.id, date: h.date, sardar_name: h.sardar_name, total: h.total, status: h.status }
      }));

    // 12. Rice Sales
    (database.data.rice_sales || [])
      .filter(r => match(r.buyer_name) || match(r.party_name))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, limit)
      .forEach(r => results.push({
        id: r.id, type: 'rice_sale', tab: 'payments',
        title: `Rice Sale: ${r.buyer_name || r.party_name || ''}`,
        subtitle: `Rs.${(r.total_amount || 0).toLocaleString('en-IN')}`,
        date: r.date || '', data: { id: r.id, date: r.date, buyer_name: r.buyer_name, total_amount: r.total_amount }
      }));

    // 13. Truck Leases
    (database.data.truck_leases || [])
      .filter(t => match(t.truck_no) || match(t.owner_name))
      .slice(0, limit)
      .forEach(t => results.push({
        id: t.id, type: 'truck_lease', tab: 'payments',
        title: `Lease: ${t.truck_no || ''}`,
        subtitle: `Owner: ${t.owner_name || ''} | Rent: Rs.${(t.monthly_rent || 0).toLocaleString('en-IN')}`,
        date: '', data: { id: t.id, truck_no: t.truck_no, owner_name: t.owner_name, monthly_rent: t.monthly_rent }
      }));

    res.json({ results, total: results.length, query: q });
  });

  return router;
};
