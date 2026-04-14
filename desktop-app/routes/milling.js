const express = require('express');
const { safeSync, safeAsync, roundAmount } = require('./safe_handler');
const { addPdfHeader: _addPdfHeader, addPdfTable, fmtAmt, fmtDate, C, registerFonts, F, safePdfPipe } = require('./pdf_helpers');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function(database) {

  // ===== BY-PRODUCT CATEGORIES =====
  const DEFAULT_BP_CATS = [
    {id:"bran",name:"Rice Bran",name_hi:"",is_auto:false,order:1},
    {id:"kunda",name:"Mota Kunda",name_hi:"",is_auto:false,order:2},
    {id:"broken",name:"Broken Rice",name_hi:"",is_auto:false,order:3},
    {id:"rejection_rice",name:"Rejection Rice",name_hi:"",is_auto:false,order:4},
    {id:"pin_broken_rice",name:"Pin Broken Rice",name_hi:"",is_auto:false,order:5},
    {id:"poll",name:"Poll",name_hi:"",is_auto:false,order:6},
    {id:"husk",name:"Bhusa",name_hi:"",is_auto:true,order:7},
  ];
  function getBpCats() {
    if (!database.data.byproduct_categories || database.data.byproduct_categories.length === 0) {
      database.data.byproduct_categories = JSON.parse(JSON.stringify(DEFAULT_BP_CATS));
      database.save();
    }
    return [...database.data.byproduct_categories].sort((a,b) => (a.order||0)-(b.order||0));
  }
  router.get('/api/byproduct-categories', safeSync(async (req, res) => { res.json(getBpCats()); }));
  router.post('/api/byproduct-categories', safeSync(async (req, res) => {
    const cats = getBpCats(); const d = req.body;
    let catId = (d.id || d.name || '').toLowerCase().trim().replace(/\s+/g,'_');
    if (cats.find(c => c.id === catId)) return res.status(400).json({detail:'Category already exists'});
    const newCat = {id:catId,name:d.name||'',name_hi:d.name_hi||'',is_auto:!!d.is_auto,order:Math.max(...cats.map(c=>c.order||0),0)+1};
    if (newCat.is_auto) database.data.byproduct_categories.forEach(c => c.is_auto = false);
    database.data.byproduct_categories.push(newCat);
    database.save();
    res.json(newCat);
  }));
  router.put('/api/byproduct-categories/:id', safeSync(async (req, res) => {
    const cats = getBpCats(); const idx = database.data.byproduct_categories.findIndex(c => c.id === req.params.id);
    if (idx < 0) return res.status(404).json({detail:'Not found'}); const d = req.body;
    if (d.name !== undefined) database.data.byproduct_categories[idx].name = d.name;
    if (d.name_hi !== undefined) database.data.byproduct_categories[idx].name_hi = d.name_hi;
    if (d.is_auto) { database.data.byproduct_categories.forEach(c => c.is_auto = false); database.data.byproduct_categories[idx].is_auto = true; }
    if (d.order !== undefined) database.data.byproduct_categories[idx].order = d.order;
    database.save(); res.json({success:true});
  }));
  router.delete('/api/byproduct-categories/:id', safeSync(async (req, res) => {
    const len = database.data.byproduct_categories.length;
    database.data.byproduct_categories = database.data.byproduct_categories.filter(c => c.id !== req.params.id);
    if (database.data.byproduct_categories.length < len) {
      database.save();
      return res.json({success:true});
    }
    res.status(404).json({detail:'Not found'});
  }));
  router.put('/api/byproduct-categories-reorder', safeSync(async (req, res) => {
    const order = req.body.order || [];
    order.forEach((id, i) => { const c = database.data.byproduct_categories.find(c => c.id === id); if (c) c.order = i + 1; });
    database.save(); res.json({success:true});
  }));


  // ===== MILLING ENTRIES =====
  router.get('/api/milling-entries', safeSync(async (req, res) => {
    res.json(database.getMillingEntries(req.query));
  }));
  router.get('/api/milling-summary', safeSync(async (req, res) => {
    res.json(database.getMillingSummary(req.query));
  }));
  router.post('/api/milling-entries', safeSync(async (req, res) => {
    res.json(database.createMillingEntry({ ...req.body, created_by: req.query.username || '' }));
  }));
  router.get('/api/milling-entries/:id', safeSync(async (req, res) => {
    const entries = database.getMillingEntries({});
    const entry = entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json(entry);
  }));
  router.put('/api/milling-entries/:id', safeSync(async (req, res) => {
    const updated = database.updateMillingEntry(req.params.id, req.body);
    if (!updated) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json(updated);
  }));
  router.delete('/api/milling-entries/:id', safeSync(async (req, res) => {
    if (!database.deleteMillingEntry(req.params.id)) return res.status(404).json({ detail: 'Milling entry not found' });
    res.json({ message: 'Milling entry deleted', id: req.params.id });
  }));

  // ===== PADDY STOCK =====
  router.get('/api/paddy-stock', safeSync(async (req, res) => {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);

    // Opening Stock
    let obPaddy = 0;
    if (filters.kms_year && database.data.opening_stock) {
      const obDoc = database.data.opening_stock.find(d => d.kms_year === filters.kms_year);
      if (obDoc && obDoc.stocks) obPaddy = parseFloat(obDoc.stocks.paddy || 0);
    }

    // CMR paddy: QNTL - BAG - P.Cut
    const cmrIn = +(entries.reduce((s, e) => s + ((e.qntl || 0) - (e.bag || 0) / 100 - (e.p_pkt_cut || 0) / 100), 0)).toFixed(2);
    // Private paddy purchases (NOT in custody maintenance, EXCLUDE agent_extra to avoid double-counting)
    let pvtEntries = (database.data.private_paddy || []).filter(e => e.source !== 'agent_extra');
    if (filters.kms_year) pvtEntries = pvtEntries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) pvtEntries = pvtEntries.filter(e => e.season === filters.season);
    const pvtIn = +pvtEntries.reduce((s, e) => s + (e.final_qntl || 0), 0).toFixed(2);
    const totalIn = +(obPaddy + cmrIn + pvtIn).toFixed(2);
    const millingEntries = database.getMillingEntries(filters);
    const totalUsed = +millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2);

    // Released paddy
    if (!database.data.paddy_release) database.data.paddy_release = [];
    let releases = [...database.data.paddy_release];
    if (filters.kms_year) releases = releases.filter(r => r.kms_year === filters.kms_year);
    if (filters.season) releases = releases.filter(r => r.season === filters.season);
    const totalReleased = +releases.reduce((s, r) => s + (r.qty_qtl || 0), 0).toFixed(2);

    res.json({ total_paddy_in_qntl: totalIn, total_paddy_used_qntl: totalUsed, available_paddy_qntl: +(totalIn - totalUsed - totalReleased).toFixed(2), total_released_qntl: totalReleased, cmr_paddy_in_qntl: cmrIn, pvt_paddy_in_qntl: pvtIn, ob_paddy_qntl: obPaddy });
  }));

  // ===== RICE STOCK =====
  router.get('/api/rice-stock', safeSync(async (req, res) => {
    const filters = req.query;
    const millingEntries = database.getMillingEntries(filters);
    const totalProduced = +millingEntries.reduce((s, e) => s + (e.rice_qntl || 0), 0).toFixed(2);
    const parboiledProduced = +millingEntries.filter(e => e.rice_type === 'parboiled').reduce((s, e) => s + (e.rice_qntl || 0), 0).toFixed(2);
    const rawProduced = +millingEntries.filter(e => e.rice_type === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0).toFixed(2);

    // DC deliveries (govt) - split by rice_type via DC
    let dcDeliveries = database.data.dc_deliveries || [];
    if (filters.kms_year) dcDeliveries = dcDeliveries.filter(d => d.kms_year === filters.kms_year);
    if (filters.season) dcDeliveries = dcDeliveries.filter(d => d.season === filters.season);
    const govtDelivered = +dcDeliveries.reduce((s, d) => s + (d.quantity_qntl || 0), 0).toFixed(2);
    // Get rice_type from parent DC for each delivery
    const dcEntries = database.data.dc_entries || [];
    const dcTypeMap = {};
    dcEntries.forEach(dc => { dcTypeMap[dc.id] = dc.rice_type || 'parboiled'; });
    const parboiledDelivered = +dcDeliveries.filter(d => (dcTypeMap[d.dc_id] || 'parboiled') === 'parboiled').reduce((s, d) => s + (d.quantity_qntl || 0), 0).toFixed(2);
    const rawDelivered = +dcDeliveries.filter(d => (dcTypeMap[d.dc_id] || 'parboiled') === 'raw').reduce((s, d) => s + (d.quantity_qntl || 0), 0).toFixed(2);

    // Pvt rice sales
    let riceSales = database.data.rice_sales || [];
    if (filters.kms_year) riceSales = riceSales.filter(s => s.kms_year === filters.kms_year);
    if (filters.season) riceSales = riceSales.filter(s => s.season === filters.season);
    const pvtSold = +riceSales.reduce((s, r) => s + (r.quantity_qntl || 0), 0).toFixed(2);
    const parboiledSold = +riceSales.filter(s => (s.rice_type || 'parboiled') === 'parboiled').reduce((s, r) => s + (r.quantity_qntl || 0), 0).toFixed(2);
    const rawSold = +riceSales.filter(s => (s.rice_type || 'parboiled') === 'raw').reduce((s, r) => s + (r.quantity_qntl || 0), 0).toFixed(2);

    const available = +(totalProduced - govtDelivered - pvtSold).toFixed(2);
    const parboiledAvailable = +(parboiledProduced - parboiledDelivered - parboiledSold).toFixed(2);
    const rawAvailable = +(rawProduced - rawDelivered - rawSold).toFixed(2);
    res.json({
      total_produced_qntl: totalProduced, parboiled_produced_qntl: parboiledProduced,
      raw_produced_qntl: rawProduced, govt_delivered_qntl: govtDelivered,
      pvt_sold_qntl: pvtSold, available_qntl: available,
      parboiled_available_qntl: parboiledAvailable, raw_available_qntl: rawAvailable,
      milling_count: millingEntries.length, dc_delivery_count: dcDeliveries.length, pvt_sale_count: riceSales.length
    });
  }));

  // ===== BYPRODUCT STOCK & SALES =====
  router.get('/api/byproduct-stock', safeSync(async (req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    const millingEntries = database.getMillingEntries(req.query);
    let sales = [...database.data.byproduct_sales];
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    const products = ['bran', 'kunda', 'broken', 'rejection_rice', 'pin_broken_rice', 'poll', 'husk'];
    // Also count from bp_sale_register (new dedicated registers)
    if (!database.data.bp_sale_register) database.data.bp_sale_register = [];
    let bpRegSales = [...database.data.bp_sale_register];
    if (req.query.kms_year) bpRegSales = bpRegSales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) bpRegSales = bpRegSales.filter(s => s.season === req.query.season);
    const stock = {};
    products.forEach(p => {
      const produced = +millingEntries.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s, e) => s + (e.quantity_qntl || 0), 0).toFixed(2);
      const revenue = +pSales.reduce((s, e) => s + (e.total_amount || 0), 0).toFixed(2);
      // Match product name to bp_sale_register product field (e.g. "Rice Bran" -> "bran")
      const productNameMap = {bran:'Rice Bran',kunda:'Mota Kunda',broken:'Broken Rice',rejection_rice:'Rejection Rice',pin_broken_rice:'Pin Broken Rice',poll:'Poll',husk:'Bhusa'};
      const regName = productNameMap[p] || p;
      const regSales = bpRegSales.filter(s => s.product === regName);
      const soldReg = +regSales.reduce((s, e) => s + (e.net_weight_qtl || 0), 0).toFixed(2);
      const revenueReg = +regSales.reduce((s, e) => s + (e.total || 0), 0).toFixed(2);
      const totalSold = +(sold + soldReg).toFixed(2);
      stock[p] = { produced_qntl: produced, sold_qntl: totalSold, available_qntl: +(produced - totalSold).toFixed(2), total_revenue: +(revenue + revenueReg).toFixed(2) };
    });
    res.json(stock);
  }));

  router.post('/api/byproduct-sales', safeSync(async (req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const sale = { id: uuidv4(), ...req.body, total_amount: +((req.body.quantity_qntl || 0) * (req.body.rate_per_qntl || 0)).toFixed(2), created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.byproduct_sales.push(sale);

    // Auto-create Ledger JAMA entry (buyer owes us for byproduct sale)
    const buyer = (req.body.buyer_name || '').trim();
    if (buyer && sale.total_amount > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: req.body.date || '', account: 'ledger', txn_type: 'jama',
        amount: sale.total_amount, category: buyer, party_type: 'By-Product Sale',
        description: `${(req.body.product || '').charAt(0).toUpperCase() + (req.body.product || '').slice(1)} sale - ${req.body.quantity_qntl || 0} Qntl @ Rs.${req.body.rate_per_qntl || 0}/Q`,
        reference: `byproduct:${sale.id}`, kms_year: req.body.kms_year || '', season: req.body.season || '',
        created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    }

    database.save();
    res.json(sale);
  }));

  router.get('/api/byproduct-sales', safeSync(async (req, res) => {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    let sales = [...database.data.byproduct_sales];
    if (req.query.product) sales = sales.filter(s => s.product === req.query.product);
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    res.json(sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }));

  router.delete('/api/byproduct-sales/:id', safeSync(async (req, res) => {
    if (!database.data.byproduct_sales) return res.status(404).json({ detail: 'Sale not found' });
    const len = database.data.byproduct_sales.length;
    database.data.byproduct_sales = database.data.byproduct_sales.filter(s => s.id !== req.params.id);
    // Also delete linked ledger entry
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.reference !== `byproduct:${req.params.id}`);
    }
    if (database.data.byproduct_sales.length < len) { database.save(); return res.json({ message: 'Sale deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Sale not found' });
  }));

  // ===== FRK PURCHASES =====
  router.post('/api/frk-purchases', safeSync(async (req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    const d = req.body;
    const p = { id: uuidv4(), date: d.date, party_name: d.party_name || '', quantity_qntl: d.quantity_qntl || 0, rate_per_qntl: d.rate_per_qntl || 0, total_amount: +((d.quantity_qntl || 0) * (d.rate_per_qntl || 0)).toFixed(2), note: d.note || '', kms_year: d.kms_year || '', season: d.season || '', created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    database.data.frk_purchases.push(p); database.save(); res.json(p);
  }));
  router.get('/api/frk-purchases', safeSync(async (req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let p = [...database.data.frk_purchases];
    if (req.query.kms_year) p = p.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) p = p.filter(x => x.season === req.query.season);
    res.json(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }));
  router.delete('/api/frk-purchases/:id', safeSync(async (req, res) => {
    if (!database.data.frk_purchases) return res.status(404).json({ detail: 'Not found' });
    const len = database.data.frk_purchases.length;
    database.data.frk_purchases = database.data.frk_purchases.filter(x => x.id !== req.params.id);
    if (database.data.frk_purchases.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
    res.status(404).json({ detail: 'Not found' });
  }));
  router.get('/api/frk-stock', safeSync(async (req, res) => {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let purchases = [...database.data.frk_purchases];
    if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
    const totalPurchased = +purchases.reduce((s, p) => s + (p.quantity_qntl || 0), 0).toFixed(2);
    const totalCost = +purchases.reduce((s, p) => s + (p.total_amount || 0), 0).toFixed(2);
    const millingEntries = database.getMillingEntries(req.query);
    const totalUsed = +millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2);
    res.json({ total_purchased_qntl: totalPurchased, total_used_qntl: totalUsed, available_qntl: +(totalPurchased - totalUsed).toFixed(2), total_cost: totalCost });
  }));

  // ===== PADDY CUSTODY REGISTER =====
  router.get('/api/paddy-custody-register', safeSync(async (req, res) => {
    const filters = req.query;
    const groupBy = filters.group_by || 'daily';
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    // Use paddy_release for Released column (NOT milling_entries)
    let paddyReleases = [...(database.data.paddy_release || [])];
    if (filters.kms_year) paddyReleases = paddyReleases.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) paddyReleases = paddyReleases.filter(e => e.season === filters.season);
    const rows = [];
    entries.forEach(e => rows.push({ date: e.date || '', type: 'received', description: `Truck: ${e.truck_no || ''} | Agent: ${e.agent_name || ''} | Mandi: ${e.mandi_name || ''}`, received_qntl: +(parseFloat(e.tp_weight || 0)).toFixed(2), issued_qntl: 0, source_id: e.id || '' }));
    paddyReleases.forEach(e => rows.push({ date: e.date || '', type: 'issued', description: `Paddy Release | RO: ${e.ro_number || '-'} | Qty: ${e.qty_qtl || 0} Qtl`, received_qntl: 0, issued_qntl: +(parseFloat(e.qty_qtl || 0)).toFixed(2), source_id: e.id || '' }));
    rows.sort((a, b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
    let balance = 0;
    rows.forEach(r => { balance += r.received_qntl - r.issued_qntl; r.balance_qntl = +balance.toFixed(2); });
    const totalReceived = +rows.reduce((s, r) => s + r.received_qntl, 0).toFixed(2);
    const totalIssued = +rows.reduce((s, r) => s + r.issued_qntl, 0).toFixed(2);

    // Weekly grouping
    if (groupBy === 'weekly' && rows.length > 0) {
      const weeklyRows = [];
      let weekData = null;
      for (const r of rows) {
        let weekKey;
        try {
          const dt = new Date(r.date);
          const day = dt.getDay();
          const diff = dt.getDate() - day + (day === 0 ? -6 : 1); // Monday
          const weekStart = new Date(dt.setDate(diff));
          weekKey = weekStart.toISOString().split('T')[0];
        } catch { weekKey = r.date; }
        if (!weekData || weekData._wk !== weekKey) {
          if (weekData) weeklyRows.push(weekData);
          const ws = new Date(weekKey);
          const we = new Date(ws); we.setDate(we.getDate() + 6);
          const fmtD = (d) => { const dd = String(d.getDate()).padStart(2, '0'); const mm = String(d.getMonth() + 1).padStart(2, '0'); return `${dd}-${mm}-${d.getFullYear()}`; };
          weekData = { _wk: weekKey, date: `${fmtD(ws)} to ${fmtD(we)}`, type: 'summary', description: `Week: ${fmtD(ws)} - ${fmtD(we)}`, received_qntl: 0, issued_qntl: 0, balance_qntl: 0 };
        }
        weekData.received_qntl = +(weekData.received_qntl + r.received_qntl).toFixed(2);
        weekData.issued_qntl = +(weekData.issued_qntl + r.issued_qntl).toFixed(2);
        weekData.balance_qntl = r.balance_qntl;
      }
      if (weekData) weeklyRows.push(weekData);
      weeklyRows.forEach(wr => delete wr._wk);
      return res.json({ rows: weeklyRows, total_received: totalReceived, total_issued: totalIssued, final_balance: +balance.toFixed(2) });
    }

    res.json({ rows, total_received: totalReceived, total_issued: totalIssued, final_balance: +balance.toFixed(2) });
  }));

  // ===== PADDY CHALNA (CUTTING) =====
  router.get('/api/paddy-cutting', safeSync(async (req, res) => {
    if (!database.data.paddy_cutting) database.data.paddy_cutting = [];
    let entries = [...database.data.paddy_cutting];
    if (req.query.kms_year) entries = entries.filter(e => e.kms_year === req.query.kms_year);
    if (req.query.season) entries = entries.filter(e => e.season === req.query.season);
    if (req.query.date_from) entries = entries.filter(e => (e.date || '') >= req.query.date_from);
    if (req.query.date_to) entries = entries.filter(e => (e.date || '') <= req.query.date_to);
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json({ entries });
  }));

  router.get('/api/paddy-cutting/summary', safeSync(async (req, res) => {
    const kmsYear = req.query.kms_year;
    const season = req.query.season;
    let millEntries = database.data.entries || [];
    if (kmsYear) millEntries = millEntries.filter(e => e.kms_year === kmsYear);
    if (season) millEntries = millEntries.filter(e => e.season === season);
    const bagsMill = millEntries.reduce((s, e) => s + (parseInt(e.bag) || 0), 0);
    const bagsPlastic = millEntries.reduce((s, e) => s + (parseInt(e.plastic_bag) || 0), 0);
    const totalReceived = bagsMill + bagsPlastic;
    if (!database.data.paddy_cutting) database.data.paddy_cutting = [];
    let cutEntries = [...database.data.paddy_cutting];
    if (kmsYear) cutEntries = cutEntries.filter(e => e.kms_year === kmsYear);
    if (season) cutEntries = cutEntries.filter(e => e.season === season);
    const totalCut = cutEntries.reduce((s, e) => s + (parseInt(e.bags_cut) || 0), 0);
    res.json({ bags_mill: bagsMill, bags_plastic: bagsPlastic, total_received: totalReceived, total_cut: totalCut, remaining: totalReceived - totalCut });
  }));

  // ===== PADDY CHALNA EXCEL EXPORT =====
  router.get('/api/paddy-cutting/excel', safeAsync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    if (!database.data.paddy_cutting) database.data.paddy_cutting = [];
    let entries = [...database.data.paddy_cutting];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let millEntries = database.data.entries || [];
    if (kms_year) millEntries = millEntries.filter(e => e.kms_year === kms_year);
    if (season) millEntries = millEntries.filter(e => e.season === season);
    const bagsMill = millEntries.reduce((s, e) => s + (parseInt(e.bag) || 0), 0);
    const bagsPlastic = millEntries.reduce((s, e) => s + (parseInt(e.plastic_bag) || 0), 0);
    const totalReceived = bagsMill + bagsPlastic;
    const totalCut = entries.reduce((s, e) => s + (parseInt(e.bags_cut) || 0), 0);
    const remaining = totalReceived - totalCut;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Paddy Chalna');
    const hdrStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }, alignment: { horizontal: 'center' } };
    const summaryFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };

    // Title
    let title = 'Paddy Chalna (Cutting) Report';
    const subtitleParts = [];
    if (kms_year) subtitleParts.push(`FY: ${kms_year}`);
    if (season) subtitleParts.push(`Season: ${season}`);
    if (date_from) subtitleParts.push(`From: ${fmtDate(date_from)}`);
    if (date_to) subtitleParts.push(`To: ${fmtDate(date_to)}`);
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    if (subtitleParts.length) {
      ws.mergeCells('A2:F2');
      ws.getCell('A2').value = subtitleParts.join(' | ');
      ws.getCell('A2').font = { size: 9, color: { argb: 'FF6B7280' } };
      ws.getCell('A2').alignment = { horizontal: 'center' };
    }

    // Summary
    let row = 4;
    const summaryItems = [['Total Paddy Bags', totalReceived], ['Total Cut', totalCut], ['Remaining Paddy Bags', remaining]];
    summaryItems.forEach(([label, val]) => {
      ws.getCell(row, 1).value = label; ws.getCell(row, 1).font = { bold: true, size: 10 }; ws.getCell(row, 1).fill = summaryFill;
      ws.getCell(row, 2).value = val; ws.getCell(row, 2).font = { bold: true, size: 11 }; ws.getCell(row, 2).alignment = { horizontal: 'right' }; ws.getCell(row, 2).fill = summaryFill;
      row++;
    });
    row++;

    // Headers
    const headers = ['#', 'Date', 'Bags Cut', 'Running Total', 'Remaining', 'Remark'];
    headers.forEach((h, i) => { const c = ws.getCell(row, i + 1); c.value = h; Object.assign(c, hdrStyle); });
    row++;

    // Data with running total
    let running = 0;
    entries.forEach((e, i) => {
      const bags = parseInt(e.bags_cut) || 0;
      running += bags;
      const entryRemaining = totalReceived - running;
      [i + 1, fmtDate(e.date || ''), bags, running, entryRemaining, e.remark || ''].forEach((v, j) => { ws.getCell(row, j + 1).value = v; });
      row++;
    });

    // Total row
    ws.getCell(row, 2).value = 'TOTAL'; ws.getCell(row, 2).font = { bold: true };
    ws.getCell(row, 3).value = totalCut; ws.getCell(row, 3).font = { bold: true };
    ws.getCell(row, 5).value = remaining; ws.getCell(row, 5).font = { bold: true };
    ws.getCell(row, 6).value = `${entries.length} entries`; ws.getCell(row, 6).font = { bold: true };

    [6, 14, 14, 16, 16, 35].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=paddy_chalna.xlsx');
    res.send(Buffer.from(buf));
  }));

  // ===== PADDY CHALNA PDF EXPORT =====
  router.get('/api/paddy-cutting/pdf', safeSync(async (req, res) => {
    const { kms_year, season, date_from, date_to } = req.query;
    if (!database.data.paddy_cutting) database.data.paddy_cutting = [];
    let entries = [...database.data.paddy_cutting];
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (date_from) entries = entries.filter(e => (e.date || '') >= date_from);
    if (date_to) entries = entries.filter(e => (e.date || '') <= date_to);
    entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let millEntries = database.data.entries || [];
    if (kms_year) millEntries = millEntries.filter(e => e.kms_year === kms_year);
    if (season) millEntries = millEntries.filter(e => e.season === season);
    const bagsMill = millEntries.reduce((s, e) => s + (parseInt(e.bag) || 0), 0);
    const bagsPlastic = millEntries.reduce((s, e) => s + (parseInt(e.plastic_bag) || 0), 0);
    const totalReceived = bagsMill + bagsPlastic;
    const totalCut = entries.reduce((s, e) => s + (parseInt(e.bags_cut) || 0), 0);
    const remaining = totalReceived - totalCut;

    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    branding._watermark = ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark');
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=paddy_chalna.pdf');

    const subtitleParts = [];
    if (kms_year) subtitleParts.push(`FY: ${kms_year}`);
    if (season) subtitleParts.push(season);
    if (date_from) subtitleParts.push(`From: ${fmtDate(date_from)}`);
    if (date_to) subtitleParts.push(`To: ${fmtDate(date_to)}`);
    _addPdfHeader(doc, 'Paddy Chalna (Cutting) Report', branding, subtitleParts.join(' | '));

    // Summary
    doc.fontSize(9).font(F('bold'));
    doc.fillColor('#1a365d').text(`Total Paddy Bags: ${totalReceived}   |   Total Cut: ${totalCut}   |   Remaining: ${remaining}`, { align: 'center' });
    doc.moveDown(0.5);

    // Table
    const headers = ['#', 'Date', 'Bags Cut', 'Running Total', 'Remaining', 'Remark'];
    const colW = [25, 65, 60, 70, 70, 220];
    const tableRows = [];
    let running = 0;
    entries.forEach((e, i) => {
      const bags = parseInt(e.bags_cut) || 0;
      running += bags;
      const entryRemaining = totalReceived - running;
      tableRows.push([String(i + 1), fmtDate(e.date || ''), String(bags), String(running), String(entryRemaining), e.remark || '-']);
    });
    tableRows.push(['', 'TOTAL', String(totalCut), '', String(remaining), `${entries.length} entries`]);
    addPdfTable(doc, headers, tableRows, colW);

    await safePdfPipe(doc, res);
  }));

  router.post('/api/paddy-cutting', safeSync(async (req, res) => {
    if (!database.data.paddy_cutting) database.data.paddy_cutting = [];
    const d = req.body;
    const bagsCut = parseInt(d.bags_cut || 0) || 0;
    if (bagsCut <= 0) return res.status(400).json({ detail: 'Bags Cut 0 se zyada hona chahiye' });
    const entry = { id: uuidv4(), date: d.date || new Date().toISOString().split('T')[0], bags_cut: bagsCut, remark: (d.remark || '').trim(), kms_year: d.kms_year || '', season: d.season || '', created_at: new Date().toISOString() };
    database.data.paddy_cutting.push(entry);
    database.save();
    res.json({ success: true, entry });
  }));

  router.put('/api/paddy-cutting/:id', safeSync(async (req, res) => {
    if (!database.data.paddy_cutting) return res.status(404).json({ detail: 'Entry not found' });
    const entry = database.data.paddy_cutting.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });
    if ('date' in req.body) entry.date = req.body.date;
    if ('bags_cut' in req.body) { const b = parseInt(req.body.bags_cut || 0) || 0; if (b <= 0) return res.status(400).json({ detail: 'Bags Cut 0 se zyada hona chahiye' }); entry.bags_cut = b; }
    if ('remark' in req.body) entry.remark = (req.body.remark || '').trim();
    database.save();
    res.json({ success: true, entry });
  }));

  router.delete('/api/paddy-cutting/:id', safeSync(async (req, res) => {
    if (!database.data.paddy_cutting) return res.status(404).json({ detail: 'Entry not found' });
    const len = database.data.paddy_cutting.length;
    database.data.paddy_cutting = database.data.paddy_cutting.filter(e => e.id !== req.params.id);
    if (database.data.paddy_cutting.length < len) { database.save(); return res.json({ success: true, message: 'Deleted' }); }
    res.status(404).json({ detail: 'Entry not found' });
  }));

  return router;
};
