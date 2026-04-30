const { v4: uuid } = require('uuid');

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function ensure() { if (!database.data.bp_sale_register) database.data.bp_sale_register = []; }

  function ensureTxn() { if (!database.data.cash_transactions) database.data.cash_transactions = []; }
  function ensureTruck() { if (!database.data.truck_payments) database.data.truck_payments = []; }
  function ensureDiesel() { if (!database.data.diesel_accounts) database.data.diesel_accounts = []; }
  function ensureLP() { if (!database.data.local_party_accounts) database.data.local_party_accounts = []; }

  function getDefaultPump() {
    ensureDiesel();
    const pumps = database.data.diesel_accounts.filter(d => d.pump_name);
    return pumps.length ? pumps[pumps.length - 1].pump_name : 'Diesel Pump';
  }

  function createBpLedgerEntries(d, docId, username) {
    ensureTxn(); ensureTruck(); ensureDiesel(); ensureLP();
    const party = (d.party_name || '').trim();
    const cash = parseFloat(d.cash_paid || 0);
    const diesel = parseFloat(d.diesel_paid || 0);
    const advance = parseFloat(d.advance || 0);
    const total = parseFloat(d.total || 0);
    const vehicle = (d.vehicle_no || '').trim();
    const product = d.product || 'By-Product';
    const vno = d.voucher_no || docId.substring(0, 8);
    const now = new Date().toISOString();
    const base = { kms_year: d.kms_year || '', season: d.season || '', created_by: username, created_at: now, updated_at: now };

    // 1. Party Ledger NIKASI (maal beche)
    if (party && total > 0) {
      database.data.cash_transactions.push({ id: uuid(), date: d.date || '', account: 'ledger', txn_type: 'nikasi', amount: total, category: party, party_type: 'BP Sale', description: `${product} Sale #${vno}`, reference: `bp_sale:${docId}`, ...base });
    }
    // 2. Advance → Ledger NIKASI (party ka baki kam) + Cash JAMA
    if (advance > 0 && party) {
      database.data.cash_transactions.push({ id: uuid(), date: d.date || '', account: 'ledger', txn_type: 'nikasi', amount: advance, category: party, party_type: 'BP Sale', description: `Advance received - ${product} #${vno}`, reference: `bp_sale_adv:${docId}`, ...base });
      database.data.cash_transactions.push({ id: uuid(), date: d.date || '', account: 'cash', txn_type: 'jama', amount: advance, category: party, party_type: 'BP Sale', description: `Advance received - ${product} #${vno}`, reference: `bp_sale_adv_cash:${docId}`, ...base });
    }
    // 3. Cash to truck → Cash NIKASI
    if (cash > 0) {
      database.data.cash_transactions.push({ id: uuid(), date: d.date || '', account: 'cash', txn_type: 'nikasi', amount: cash, category: vehicle || party, party_type: vehicle ? 'Truck' : 'BP Sale', description: `Truck cash - ${product} #${vno}`, reference: `bp_sale_cash:${docId}`, ...base });
    }
    // 4. Diesel → Pump Ledger JAMA (humne pump se kharida) + diesel_accounts
    if (diesel > 0) {
      const pumpName = getDefaultPump();
      const pumpDoc = database.data.diesel_accounts.find(da => da.pump_name === pumpName);
      const pumpId = pumpDoc ? (pumpDoc.pump_id || '') : '';
      database.data.cash_transactions.push({ id: uuid(), date: d.date || '', account: 'ledger', txn_type: 'jama', amount: diesel, category: pumpName, party_type: 'Diesel', description: `Diesel for truck - ${product} #${vno} - ${party}`, reference: `bp_sale_diesel:${docId}`, ...base });
      database.data.diesel_accounts.push({ id: uuid(), date: d.date || '', pump_id: pumpId, pump_name: pumpName, truck_no: vehicle, agent_name: party, amount: diesel, txn_type: 'debit', description: `Diesel for ${product} #${vno} - ${party}`, reference: `bp_sale_diesel:${docId}`, ...base });
    }
    // 5. Truck ledger entries - NIKASI
    if (cash > 0 && vehicle) {
      database.data.cash_transactions.push({ id: uuid(), date: d.date || '', account: 'ledger', txn_type: 'nikasi', amount: cash, category: vehicle, party_type: 'Truck', description: `Truck cash deduction - ${product} #${vno}`, reference: `bp_truck_cash:${docId}`, ...base });
    }
    if (diesel > 0 && vehicle) {
      database.data.cash_transactions.push({ id: uuid(), date: d.date || '', account: 'ledger', txn_type: 'nikasi', amount: diesel, category: vehicle, party_type: 'Truck', description: `Truck diesel deduction - ${product} #${vno}`, reference: `bp_truck_diesel:${docId}`, ...base });
    }
    const truckTotal = cash + diesel;
    if (truckTotal > 0 && vehicle) {
      database.data.truck_payments.push({ entry_id: docId, truck_no: vehicle, date: d.date || '', cash_taken: cash, diesel_taken: diesel, gross_amount: 0, deductions: truckTotal, net_amount: 0, paid_amount: 0, balance_amount: 0, status: 'pending', source: 'BP Sale', description: `${product} #${vno} - ${party}`, reference: `bp_sale_truck:${docId}`, ...base });
    }
    // Local party accounts
    if (party && total > 0) {
      database.data.local_party_accounts.push({ id: uuid(), date: d.date || '', party_name: party, txn_type: 'debit', amount: total, description: `${product} Sale #${vno}`, source_type: 'bp_sale', reference: `bp_sale:${docId}`, kms_year: d.kms_year || '', season: d.season || '', created_by: username, created_at: now });
    }
    if (advance > 0 && party) {
      database.data.local_party_accounts.push({ id: uuid(), date: d.date || '', party_name: party, txn_type: 'payment', amount: advance, description: `Advance received - ${product} #${vno}`, source_type: 'bp_sale_advance', reference: `bp_sale_adv:${docId}`, kms_year: d.kms_year || '', season: d.season || '', created_by: username, created_at: now });
    }
  }

  function deleteBpLedgerEntries(docId) {
    ensureTxn(); ensureTruck(); ensureDiesel(); ensureLP();
    const matchRef = (ref) => !!ref && ((ref.includes(`bp_sale`) && ref.includes(docId)) || (ref.includes(`bp_truck`) && ref.includes(docId)));
    database.data.cash_transactions = database.data.cash_transactions.filter(t => !matchRef(t.reference));
    database.data.truck_payments = database.data.truck_payments.filter(t => !matchRef(t.reference));
    database.data.diesel_accounts = database.data.diesel_accounts.filter(t => !(t.reference && t.reference.includes(`bp_sale`) && t.reference.includes(docId)));
    database.data.local_party_accounts = database.data.local_party_accounts.filter(t => !(t.reference && t.reference.includes(`bp_sale`) && t.reference.includes(docId)));
  }

  router.get('/api/bp-sale-register', (req, res) => {
    ensure();
    let sales = [...database.data.bp_sale_register];
    const { product, kms_year, season } = req.query;
    if (product) sales = sales.filter(s => s.product === product);
    if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
    if (season) sales = sales.filter(s => s.season === season);
    sales.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(sales);
  });

  /**
   * Calculate amount/tax/total based on billing mode.
   *
   * REGULAR (data.split_billing !== true):
   *   amount = net_weight × rate (full weight taxed)
   *   tax = amount × gst%
   *   total = amount + tax
   *
   * SPLIT BILLING (data.split_billing === true):
   *   User provides: billed_weight_kg (pakka, GST applies) + kaccha_weight_kg (no GST)
   *   net_weight_kg = billed + kaccha (physical dispatch total)
   *   billed_amount = billed_weight × rate   ← only this is GST-taxable
   *   kaccha_amount = kaccha_weight × rate   ← non-taxable, cash slip
   *   tax = billed_amount × gst%
   *   total = billed_amount + tax + kaccha_amount  (full receivable)
   *   amount field stores billed_amount for GST register compatibility
   */
  function computeAmountsAndTax(data) {
    const rate = parseFloat(data.rate_per_qtl || 0);
    const kacchaRate = (data.kaccha_rate_per_qtl !== undefined && data.kaccha_rate_per_qtl !== null && data.kaccha_rate_per_qtl !== "" && parseFloat(data.kaccha_rate_per_qtl) > 0)
      ? parseFloat(data.kaccha_rate_per_qtl)
      : rate;
    const isSplit = !!data.split_billing;

    if (isSplit) {
      const billedKg = parseFloat(data.billed_weight_kg || 0);
      const kacchaKg = parseFloat(data.kaccha_weight_kg || 0);
      const billedQtl = +(billedKg / 100).toFixed(4);
      const kacchaQtl = +(kacchaKg / 100).toFixed(4);
      const billedAmt = +(billedQtl * rate).toFixed(2);
      const kacchaAmt = +(kacchaQtl * kacchaRate).toFixed(2);
      data.net_weight_kg = +(billedKg + kacchaKg).toFixed(3); // sum for physical dispatch
      data.net_weight_qtl = +(billedQtl + kacchaQtl).toFixed(4);
      data.billed_weight_qtl = billedQtl;
      data.kaccha_weight_qtl = kacchaQtl;
      data.billed_amount = billedAmt;
      data.kaccha_amount = kacchaAmt;
      data.kaccha_rate_per_qtl = kacchaRate;
      data.amount = billedAmt; // GST-taxable portion (field kept same name for register compatibility)
      const taxAmt = data.gst_percent ? +(billedAmt * parseFloat(data.gst_percent || 0) / 100).toFixed(2) : 0;
      data.tax_amount = taxAmt;
      data.total = +(billedAmt + taxAmt + kacchaAmt).toFixed(2);
    } else {
      const nw = parseFloat(data.net_weight_kg || 0);
      const nwQtl = +(nw / 100).toFixed(4);
      const amount = +(nwQtl * rate).toFixed(2);
      data.net_weight_qtl = nwQtl;
      data.amount = amount;
      // Clear split fields if toggled off
      data.billed_weight_kg = 0; data.billed_weight_qtl = 0; data.billed_amount = 0;
      data.kaccha_weight_kg = 0; data.kaccha_weight_qtl = 0; data.kaccha_amount = 0;
      data.kaccha_rate_per_qtl = 0;
      const taxAmt = data.gst_percent ? +(amount * parseFloat(data.gst_percent || 0) / 100).toFixed(2) : 0;
      data.tax_amount = taxAmt;
      data.total = +(amount + taxAmt).toFixed(2);
    }
  }

  // Helper: next BP sale voucher_no in `S-NNN` format
  const nextBpVoucherNo = () => {
    ensure();
    let maxN = 0;
    const re = /^S-(\d+)$/;
    for (const s of database.data.bp_sale_register || []) {
      const m = re.exec(s.voucher_no || '');
      if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
    }
    return `S-${String(maxN + 1).padStart(3, '0')}`;
  };

  router.get('/api/bp-sale-register/next-voucher-no', (req, res) => {
    res.json({ voucher_no: nextBpVoucherNo() });
  });

  router.post('/api/bp-sale-register', (req, res) => {
    ensure();
    const data = { ...req.body };
    data.id = uuid().substring(0, 12);
    data.created_at = new Date().toISOString();
    data.updated_at = data.created_at;
    data.created_by = req.query.username || '';

    // Auto-generate voucher_no if blank (format: S-001, S-002 ...). User-entered values preserved.
    if (!String(data.voucher_no || '').trim()) {
      data.voucher_no = nextBpVoucherNo();
    }

    computeAmountsAndTax(data);

    const cash = parseFloat(data.cash_paid || 0);
    const diesel = parseFloat(data.diesel_paid || 0);
    const advance = parseFloat(data.advance || 0);
    data.cash_paid = cash;
    data.diesel_paid = diesel;
    data.advance = advance;
    data.balance = +(data.total - advance).toFixed(2);

    database.data.bp_sale_register.push(data);
    database.save();
    createBpLedgerEntries(data, data.id, req.query.username || '');
    database.save();
    res.json(data);
  });

  router.put('/api/bp-sale-register/:id', (req, res) => {
    ensure();
    const idx = database.data.bp_sale_register.findIndex(s => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Not found' });

    const data = { ...req.body };
    data.updated_at = new Date().toISOString();
    data.updated_by = req.query.username || '';

    computeAmountsAndTax(data);

    const cash = parseFloat(data.cash_paid || 0);
    const diesel = parseFloat(data.diesel_paid || 0);
    const advance = parseFloat(data.advance || 0);
    data.cash_paid = cash;
    data.diesel_paid = diesel;
    data.advance = advance;
    data.balance = +(data.total - advance).toFixed(2);

    data.id = req.params.id;
    data.created_at = database.data.bp_sale_register[idx].created_at;
    data.created_by = database.data.bp_sale_register[idx].created_by;
    database.data.bp_sale_register[idx] = data;
    deleteBpLedgerEntries(req.params.id);
    createBpLedgerEntries(data, req.params.id, req.query.username || '');
    database.save();
    res.json({ success: true });
  });

  router.delete('/api/bp-sale-register/:id', (req, res) => {
    ensure();
    const len = database.data.bp_sale_register.length;
    database.data.bp_sale_register = database.data.bp_sale_register.filter(s => s.id !== req.params.id);
    if (database.data.bp_sale_register.length < len) {
      deleteBpLedgerEntries(req.params.id);
      database.save();
      return res.json({ success: true });
    }
    res.status(404).json({ detail: 'Not found' });
  });

  router.get('/api/bp-sale-register/suggestions/bill-from', (req, res) => {
    ensure();
    const set = new Set(database.data.bp_sale_register.map(s => s.bill_from).filter(Boolean));
    res.json([...set].sort());
  });

  router.get('/api/bp-sale-register/suggestions/party-name', (req, res) => {
    ensure();
    const set = new Set(database.data.bp_sale_register.map(s => s.party_name).filter(Boolean));
    res.json([...set].sort());
  });

  router.get('/api/bp-sale-register/suggestions/destination', (req, res) => {
    ensure();
    const set = new Set(database.data.bp_sale_register.map(s => s.destination).filter(Boolean));
    res.json([...set].sort());
  });

  // ---- EXCEL EXPORT ----
  router.get('/api/bp-sale-register/export/excel', async (req, res) => {
    try {
      ensure();
      const ExcelJS = require('exceljs');
      const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
      const { fmtDate, applyConsolidatedExcelPolish} = require('./pdf_helpers');
      let sales = [...database.data.bp_sale_register];
      const { product, kms_year, season, date_from, date_to, billing_date_from, billing_date_to, rst_no, vehicle_no, bill_from, party_name, destination } = req.query;
      if (product) sales = sales.filter(s => s.product === product);
      if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
      if (season) sales = sales.filter(s => s.season === season);
      if (date_from) sales = sales.filter(s => (s.date||'') >= date_from);
      if (date_to) sales = sales.filter(s => (s.date||'') <= date_to);
      if (billing_date_from) sales = sales.filter(s => (s.billing_date||'') >= billing_date_from);
      if (billing_date_to) sales = sales.filter(s => (s.billing_date||'') <= billing_date_to);
      if (rst_no) sales = sales.filter(s => (s.rst_no||'').toLowerCase().includes(rst_no.toLowerCase()));
      if (vehicle_no) sales = sales.filter(s => (s.vehicle_no||'').toLowerCase().includes(vehicle_no.toLowerCase()));
      if (bill_from) sales = sales.filter(s => (s.bill_from||'').toLowerCase().includes(bill_from.toLowerCase()));
      if (party_name) sales = sales.filter(s => (s.party_name||'').toLowerCase().includes(party_name.toLowerCase()));
      if (destination) sales = sales.filter(s => (s.destination||'').toLowerCase().includes(destination.toLowerCase()));
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      // Oil premium map for Rice Bran
      if (!database.data.oil_premium) database.data.oil_premium = [];
      const oilMap = {};
      if (product === 'Rice Bran') {
        let opItems = [...database.data.oil_premium];
        if (kms_year) opItems = opItems.filter(i => i.kms_year === kms_year);
        if (season) opItems = opItems.filter(i => i.season === season);
        opItems.forEach(op => { const k = op.voucher_no || op.rst_no || ''; if (k) oilMap[k] = op; });
      }
      const hasOil = Object.keys(oilMap).length > 0 && sales.some(s => oilMap[s.voucher_no||''] || oilMap[s.rst_no||'']);

      // Detect which optional columns have data
      const has = {
        bill: sales.some(s => s.bill_number), billing_date: sales.some(s => s.billing_date),
        rst: sales.some(s => s.rst_no), vehicle: sales.some(s => s.vehicle_no),
        billfrom: sales.some(s => s.bill_from), dest: sales.some(s => s.destination),
        bags: sales.some(s => s.bags), tax: sales.some(s => s.tax_amount),
        cash: sales.some(s => s.cash_paid), diesel: sales.some(s => s.diesel_paid),
        adv: sales.some(s => s.advance), remark: sales.some(s => s.remark)
      };

      // Build dynamic columns
      const cols = [{h:'V.No',k:'vno',w:8},{h:'Date',k:'date',w:10}];
      if (has.bill) cols.push({h:'Bill No',k:'bill',w:10});
      if (has.billing_date) cols.push({h:'Bill Date',k:'bdate',w:10});
      if (has.rst) cols.push({h:'RST',k:'rst',w:8});
      if (has.vehicle) cols.push({h:'Vehicle',k:'vehicle',w:12});
      if (has.billfrom) cols.push({h:'Bill From',k:'billfrom',w:14});
      cols.push({h:'Party',k:'party',w:16});
      if (has.dest) cols.push({h:'Destination',k:'dest',w:14});
      cols.push({h:'N/W(Kg)',k:'nwkg',w:10},{h:'N/W(Qtl)',k:'nwqtl',w:9});
      if (has.bags) cols.push({h:'Bags',k:'bags',w:7});
      cols.push({h:'Rate/Q',k:'rate',w:9},{h:'Amount',k:'amount',w:12});
      if (has.tax) cols.push({h:'Tax',k:'tax',w:9});
      cols.push({h:'Total',k:'total',w:12});
      if (has.cash) cols.push({h:'Cash',k:'cash',w:9});
      if (has.diesel) cols.push({h:'Diesel',k:'diesel',w:9});
      if (has.adv) cols.push({h:'Advance',k:'adv',w:8});
      cols.push({h:'Balance',k:'balance',w:12});
      if (hasOil) { cols.push({h:'Oil%',k:'oilpct',w:8},{h:'Diff%',k:'oildiff',w:8},{h:'Premium',k:'oilprem',w:12}); }
      if (has.remark) cols.push({h:'Remark',k:'remark',w:14});

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${product || 'BP'} Sales`);
      ws.columns = cols.map(c => ({header:c.h, key:c.k, width:c.w}));
      sales.forEach((s, i) => {
        const op = oilMap[s.voucher_no||''] || oilMap[s.rst_no||''];
        const row = {vno:s.voucher_no||'', date:fmtDate(s.date), party:s.party_name||'', nwkg:s.net_weight_kg||0, nwqtl:+(((s.net_weight_kg||0)/100).toFixed(2)), rate:s.rate_per_qtl||0, amount:s.amount||0, total:s.total||0, balance:s.balance||0};
        if (has.bill) row.bill = s.bill_number||'';
        if (has.billing_date) row.bdate = fmtDate(s.billing_date);
        if (has.rst) row.rst = s.rst_no||'';
        if (has.vehicle) row.vehicle = s.vehicle_no||'';
        if (has.billfrom) row.billfrom = s.bill_from||'';
        if (has.dest) row.dest = s.destination||'';
        if (has.bags) row.bags = s.bags||0;
        if (has.tax) row.tax = s.tax_amount||0;
        if (has.cash) row.cash = s.cash_paid||0;
        if (has.diesel) row.diesel = s.diesel_paid||0;
        if (has.adv) row.adv = s.advance||0;
        if (hasOil) { row.oilpct = op ? op.actual_oil_pct : ''; row.oildiff = op ? +(op.difference_pct||0).toFixed(2) : ''; row.oilprem = op ? +(op.premium_amount||0).toFixed(2) : ''; }
        if (has.remark) row.remark = s.remark||'';
        ws.addRow(row);
      });
      addExcelTitle(ws, `${product || 'By-Product'} Sale Register`, cols.length, database);
      styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename=${(product||'bp').toLowerCase().replace(/ /g,'_')}_sales_${Date.now()}.xlsx`);
      // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
      try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
      await wb.xlsx.write(res); res.end();
    } catch(e) { res.status(500).json({detail:'Export failed: '+e.message}); }
  });

  // ---- PDF EXPORT ----
  router.get('/api/bp-sale-register/export/pdf', async (req, res) => {
    try {
      ensure();
      const PDFDocument = require('pdfkit');
      const { addPdfHeader: _addPdfHeader, addPdfTable, safePdfPipe, fmtDate } = require('./pdf_helpers');
      const addPdfHeader = (doc, title) => _addPdfHeader(doc, title, database.getBranding ? database.getBranding() : {company_name:'Mill'});
      let sales = [...database.data.bp_sale_register];
      const { product, kms_year, season, date_from, date_to, billing_date_from, billing_date_to, rst_no, vehicle_no, bill_from, party_name, destination } = req.query;
      if (product) sales = sales.filter(s => s.product === product);
      if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
      if (season) sales = sales.filter(s => s.season === season);
      if (date_from) sales = sales.filter(s => (s.date||'') >= date_from);
      if (date_to) sales = sales.filter(s => (s.date||'') <= date_to);
      if (billing_date_from) sales = sales.filter(s => (s.billing_date||'') >= billing_date_from);
      if (billing_date_to) sales = sales.filter(s => (s.billing_date||'') <= billing_date_to);
      if (rst_no) sales = sales.filter(s => (s.rst_no||'').toLowerCase().includes(rst_no.toLowerCase()));
      if (vehicle_no) sales = sales.filter(s => (s.vehicle_no||'').toLowerCase().includes(vehicle_no.toLowerCase()));
      if (bill_from) sales = sales.filter(s => (s.bill_from||'').toLowerCase().includes(bill_from.toLowerCase()));
      if (party_name) sales = sales.filter(s => (s.party_name||'').toLowerCase().includes(party_name.toLowerCase()));
      if (destination) sales = sales.filter(s => (s.destination||'').toLowerCase().includes(destination.toLowerCase()));
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      // Oil premium map for Rice Bran
      if (!database.data.oil_premium) database.data.oil_premium = [];
      const oilMapPdf = {};
      if (product === 'Rice Bran') {
        let opList = [...database.data.oil_premium];
        if (kms_year) opList = opList.filter(i => i.kms_year === kms_year);
        if (season) opList = opList.filter(i => i.season === season);
        opList.forEach(op => { const k = op.voucher_no || op.rst_no || ''; if (k) oilMapPdf[k] = op; });
      }
      const hasOilPdf = Object.keys(oilMapPdf).length > 0 && sales.some(s => oilMapPdf[s.voucher_no||''] || oilMapPdf[s.rst_no||'']);

      // Detect which optional columns have data
      const has = {
        bill: sales.some(s => s.bill_number), rst: sales.some(s => s.rst_no),
        vehicle: sales.some(s => s.vehicle_no), billfrom: sales.some(s => s.bill_from),
        dest: sales.some(s => s.destination), bags: sales.some(s => s.bags),
        tax: sales.some(s => s.tax_amount), cash: sales.some(s => s.cash_paid),
        diesel: sales.some(s => s.diesel_paid), adv: sales.some(s => s.advance)
      };

      // Build dynamic columns: [header, width, key]
      const pc = [['V.No',28,'voucher_no'],['Date',42,'date']];
      if (has.bill) pc.push(['Bill',40,'bill_number']);
      if (has.rst) pc.push(['RST',28,'rst_no']);
      if (has.vehicle) pc.push(['Vehicle',48,'vehicle_no']);
      if (has.billfrom) pc.push(['BillFrom',55,'bill_from']);
      pc.push(['Party',65,'party_name']);
      if (has.dest) pc.push(['Destination',50,'destination']);
      pc.push(['NW(Kg)',40,'net_weight_kg']);
      if (has.bags) pc.push(['Bags',28,'bags']);
      pc.push(['Rate/Q',38,'rate_per_qtl'],['Amount',50,'amount']);
      if (has.tax) pc.push(['Tax',35,'tax_amount']);
      pc.push(['Total',50,'total']);
      if (has.cash) pc.push(['Cash',38,'cash_paid']);
      if (has.diesel) pc.push(['Diesel',38,'diesel_paid']);
      if (has.adv) pc.push(['Adv',32,'advance']);
      pc.push(['Balance',48,'balance']);
      if (hasOilPdf) { pc.push(['Oil%',30,'oil_pct'],['Diff%',30,'oil_diff'],['Premium',45,'oil_premium']); }

      const doc = new PDFDocument({size:'A4',layout:'landscape',margin:20});
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename=${(product||'bp').toLowerCase().replace(/ /g,'_')}_sales_${Date.now()}.pdf`);
      let title = `${product || 'By-Product'} Sale Register`;
      if (kms_year) title += ` - FY ${kms_year}`;
      addPdfHeader(doc, title);

      const headers = pc.map(c => c[0]);
      const colWidths = pc.map(c => c[1]);
      const keys = pc.map(c => c[2]);
      const rows = sales.map((s,i) => {
        const op = oilMapPdf[s.voucher_no||''] || oilMapPdf[s.rst_no||''];
        return keys.map(k => {
          if (k === 'voucher_no') return s.voucher_no||'';
          if (k === 'date') return fmtDate(s.date);
          if (k === 'party_name') return (s.party_name||'').substring(0,14);
          if (k === 'bill_from') return (s.bill_from||'').substring(0,12);
          if (k === 'destination') return (s.destination||'').substring(0,10);
          if (['amount','tax_amount','total','balance'].includes(k)) return Math.round(s[k]||0);
          if (k === 'oil_pct') return op ? `${op.actual_oil_pct}%` : '';
          if (k === 'oil_diff') { if (!op) return ''; const d=op.difference_pct||0; return `${d>0?'+':''}${d.toFixed(2)}%`; }
          if (k === 'oil_premium') return op ? Math.round(op.premium_amount||0) : '';
          return s[k]||0;
        });
      });
      addPdfTable(doc, headers, rows, colWidths);
      await safePdfPipe(doc, res);
    } catch(e) { res.status(500).json({detail:'PDF failed: '+e.message}); }
  });

  return router;
};
