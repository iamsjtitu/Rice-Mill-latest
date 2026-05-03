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

  // v104.44.44 — Row-level pakka/kaccha view projections
  // v104.44.53 — Balance properly projected (PKA: billed+tax, KCA: kaccha-advance)
  function _safeNum(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
  function _projectPakkaView(s) {
    const billed = _safeNum(s.billed_amount);
    const tax = _safeNum(s.tax_amount);
    return { ...s,
      kaccha_weight_kg: 0, kaccha_weight_qtl: 0, kaccha_weight_qtl_display: '',
      kaccha_amount: 0, kaccha_rate_per_qtl: 0,
      net_weight_kg: _safeNum(s.billed_weight_kg),
      net_weight_qtl: _safeNum(s.billed_weight_qtl),
      net_weight_qtl_display: s.billed_weight_qtl_display || '',
      amount: billed, total: billed + tax,
      balance: billed + tax, advance: 0,
      _view_mode: 'PKA'
    };
  }
  function _projectKacchaView(s) {
    const kac = _safeNum(s.kaccha_amount);
    const adv = _safeNum(s.advance);
    const kacRate = _safeNum(s.kaccha_rate_per_qtl);
    return { ...s,
      billed_weight_kg: 0, billed_weight_qtl: 0, billed_weight_qtl_display: '',
      billed_amount: 0, gst_type: 'none', gst_percent: 0, tax_amount: 0,
      rate_per_qtl: kacRate > 0 ? s.kaccha_rate_per_qtl : s.rate_per_qtl,
      net_weight_kg: _safeNum(s.kaccha_weight_kg),
      net_weight_qtl: _safeNum(s.kaccha_weight_qtl),
      net_weight_qtl_display: s.kaccha_weight_qtl_display || '',
      amount: kac, total: kac,
      balance: Math.max(0, kac - adv),
      _view_mode: 'KCA'
    };
  }

  router.get('/api/bp-sale-register', (req, res) => {
    ensure();
    let sales = [...database.data.bp_sale_register];
    const { product, kms_year, season, gst_filter } = req.query;
    if (product) sales = sales.filter(s => s.product === product);
    if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
    if (season) sales = sales.filter(s => s.season === season);
    // v104.44.44 — Row-level PKA/KCA projection
    if (gst_filter === 'PKA') {
      sales = sales.filter(s => _safeNum(s.billed_amount) > 0 || _safeNum(s.gst_percent) > 0).map(_projectPakkaView);
    } else if (gst_filter === 'KCA') {
      sales = sales.filter(s => _safeNum(s.kaccha_amount) > 0 || (_safeNum(s.billed_amount) === 0 && _safeNum(s.gst_percent) === 0)).map(_projectKacchaView);
    }
    sales.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(sales);
  });

  // v104.44.56 — FIFO payment allocation helpers (Option A + B + C)
  // v104.44.58 — Pull payments from BOTH local_party_accounts AND cash_transactions (jama txns)
  function _fetchPartyPayments(partyKey, kmsYear, season) {
    const items = [];
    const lpa = (database.data.local_party_accounts || [])
      .filter(p => p.party_name === partyKey && p.txn_type === 'payment'
        && (!kmsYear || p.kms_year === kmsYear)
        && (!season || p.season === season));
    items.push(...lpa);
    const ct = (database.data.cash_transactions || [])
      .filter(c => c.category === partyKey && c.txn_type === 'jama'
        && (!kmsYear || c.kms_year === kmsYear)
        && (!season || c.season === season));
    ct.forEach(c => items.push({
      date: c.date || '', party_name: c.category || '', txn_type: 'payment',
      amount: c.amount || 0, description: c.description || '', reference: c.id || '',
      created_at: c.created_at || ''
    }));
    const skip = ['lab test premium', 'oil premium', 'sale bhada', 'rice bran sale', 'rice sale', 'paddy sale', 'sale #', 'sale-'];
    return items.filter(p => {
      const d = (p.description || '').toLowerCase();
      return !skip.some(k => d.includes(k));
    }).sort((a, b) => ((a.date || '').localeCompare(b.date || '')) || ((a.created_at || '').localeCompare(b.created_at || '')));
  }
  function _enrichSalesWithPaymentsFifo(sales) {
    // Group by (party_key, kms, season)
    const buckets = {};
    sales.forEach(s => {
      const party = (s.party_name || '').trim();
      if (!party) return;
      s.payments_alloc = []; s._pka_alloc = []; s._kca_alloc = [];
      const vm = s._view_mode || '';
      const isSplit = _safeNum(s.billed_amount) > 0 && _safeNum(s.kaccha_amount) > 0;
      const kms = s.kms_year || ''; const ssn = s.season || '';
      const push = (key, amt, btype) => {
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push({ sale: s, debit: amt, btype });
      };
      if (vm === 'PKA') push(`${party} (PKA)|${kms}|${ssn}`, _safeNum(s.total), 'pka');
      else if (vm === 'KCA') push(`${party} (KCA)|${kms}|${ssn}`, _safeNum(s.total), 'kca');
      else if (isSplit) {
        const pkaDebit = _safeNum(s.billed_amount) + _safeNum(s.tax_amount);
        const kcaDebit = _safeNum(s.kaccha_amount);
        if (pkaDebit > 0) push(`${party} (PKA)|${kms}|${ssn}`, pkaDebit, 'pka');
        if (kcaDebit > 0) push(`${party} (KCA)|${kms}|${ssn}`, kcaDebit, 'kca');
      } else {
        push(`${party}|${kms}|${ssn}`, _safeNum(s.total), 'all');
      }
    });
    Object.entries(buckets).forEach(([bkey, entries]) => {
      const [partyKey, kms, ssn] = bkey.split('|');
      entries.sort((a, b) => ((a.sale.date || '').localeCompare(b.sale.date || '')) || ((a.sale.created_at || '').localeCompare(b.sale.created_at || '')));
      const payments = _fetchPartyPayments(partyKey, kms, ssn);
      const remaining = entries.map(e => ({ sale: e.sale, btype: e.btype, remaining: e.debit }));
      payments.forEach(p => {
        let amt = _safeNum(p.amount);
        const pdate = p.date || ''; const pdesc = p.description || '';
        for (const r of remaining) {
          if (amt <= 0) break;
          if (r.remaining <= 0) continue;
          const take = Math.min(amt, r.remaining);
          r.remaining = +(r.remaining - take).toFixed(2);
          amt = +(amt - take).toFixed(2);
          const entry = { date: pdate, amount: take, description: pdesc, type: r.btype };
          if (r.btype === 'pka') r.sale._pka_alloc.push(entry);
          else if (r.btype === 'kca') r.sale._kca_alloc.push(entry);
          else r.sale.payments_alloc.push(entry);
        }
      });
    });
    sales.forEach(s => {
      const all = [...(s.payments_alloc || []), ...(s._pka_alloc || []), ...(s._kca_alloc || [])];
      all.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      s.payments_alloc = all;
      s.total_received = +all.reduce((sum, p) => sum + _safeNum(p.amount), 0).toFixed(2);
      s.last_payment_date = all.length ? all[all.length - 1].date : '';
      const existingBalance = _safeNum(s.balance);
      const netPending = +(existingBalance - s.total_received).toFixed(2);
      s.pending_balance = netPending >= 0 ? netPending : netPending;
      delete s._pka_alloc; delete s._kca_alloc;
    });
    return sales;
  }

  // v104.44.56 — GET /with-payments (Option A + B)
  router.get('/api/bp-sale-register/with-payments', (req, res) => {
    ensure();
    let sales = [...database.data.bp_sale_register];
    const { product, kms_year, season, gst_filter } = req.query;
    if (product) sales = sales.filter(s => s.product === product);
    if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
    if (season) sales = sales.filter(s => s.season === season);
    if (gst_filter === 'PKA') sales = sales.filter(s => _safeNum(s.billed_amount) > 0 || _safeNum(s.gst_percent) > 0).map(_projectPakkaView);
    else if (gst_filter === 'KCA') sales = sales.filter(s => _safeNum(s.kaccha_amount) > 0 || (_safeNum(s.billed_amount) === 0 && _safeNum(s.gst_percent) === 0)).map(_projectKacchaView);
    sales.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    sales = _enrichSalesWithPaymentsFifo(sales);
    res.json(sales);
  });

  // v104.44.56 — GET /party-statement (Option C)
  router.get('/api/bp-sale-register/party-statement', (req, res) => {
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    const { party, kms_year, season, gst_filter } = req.query;
    if (!party) return res.json({ party: '', entries: [], summary: {} });
    let partyKeys;
    if (gst_filter === 'PKA') partyKeys = [`${party} (PKA)`];
    else if (gst_filter === 'KCA') partyKeys = [`${party} (KCA)`];
    else partyKeys = [`${party} (PKA)`, `${party} (KCA)`, party];
    let raw = (database.data.local_party_accounts || []).filter(p => partyKeys.includes(p.party_name));
    if (kms_year) raw = raw.filter(p => p.kms_year === kms_year);
    if (season) raw = raw.filter(p => p.season === season);
    // v104.44.58 — Also pull payments from cash_transactions (jama with category=party)
    const cashItems = (database.data.cash_transactions || []).filter(c =>
      partyKeys.includes(c.category) && c.txn_type === 'jama'
      && (!kms_year || c.kms_year === kms_year)
      && (!season || c.season === season));
    const skipKw = ['lab test premium', 'oil premium', 'sale bhada', 'rice bran sale', 'rice sale', 'paddy sale', 'sale #', 'sale-'];
    cashItems.forEach(c => {
      const desc = c.description || '';
      if (skipKw.some(k => desc.toLowerCase().includes(k))) return;
      raw.push({
        date: c.date || '', party_name: c.category || '', txn_type: 'payment',
        amount: c.amount || 0, description: desc, reference: c.id || '',
        created_at: c.created_at || ''
      });
    });
    raw.sort((a, b) => ((a.date || '').localeCompare(b.date || '')) || ((a.created_at || '').localeCompare(b.created_at || '')));
    let balance = 0;
    const entries = raw.map(r => {
      const amt = _safeNum(r.amount);
      const ttype = r.txn_type || '';
      let flow = ttype.toUpperCase();
      if (ttype === 'debit') { balance += amt; flow = 'Dr'; }
      else if (ttype === 'payment') { balance -= amt; flow = 'Cr'; }
      const desc = (r.description || '')
        .replace('Pakka (GST Bill)', 'PKA (GST Bill)')
        .replace('Kaccha (Slip)', 'KCA (Slip)')
        .replace(' - Pakka', ' - PKA')
        .replace(' - Kaccha', ' - KCA');
      return {
        date: r.date || '', party_name: r.party_name || '', txn_type: ttype, flow,
        amount: +amt.toFixed(2), description: desc, reference: r.reference || '',
        running_balance: +balance.toFixed(2)
      };
    });
    const summary = {
      party,
      total_debit: +entries.filter(e => e.flow === 'Dr').reduce((s, e) => s + e.amount, 0).toFixed(2),
      total_credit: +entries.filter(e => e.flow === 'Cr').reduce((s, e) => s + e.amount, 0).toFixed(2),
      closing_balance: +balance.toFixed(2),
      entry_count: entries.length
    };
    res.json({ party, gst_filter: gst_filter || 'ALL', kms_year: kms_year || '', season: season || '', entries, summary });
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

  // ---- EXCEL EXPORT (v104.44.51 — Professional with PKA/KCA breakdown) ----
  router.get('/api/bp-sale-register/export/excel', async (req, res) => {
    try {
      ensure();
      const ExcelJS = require('exceljs');
      const { fmtDate, applyConsolidatedExcelPolish } = require('./pdf_helpers');
      let sales = [...database.data.bp_sale_register];
      const { product, kms_year, season, date_from, date_to, billing_date_from, billing_date_to, rst_no, vehicle_no, bill_from, party_name, destination, gst_filter } = req.query;
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
      // Row-level PKA/KCA projection
      if (gst_filter === 'PKA') sales = sales.filter(s => _safeNum(s.billed_amount) > 0 || _safeNum(s.gst_percent) > 0).map(_projectPakkaView);
      else if (gst_filter === 'KCA') sales = sales.filter(s => _safeNum(s.kaccha_amount) > 0 || (_safeNum(s.billed_amount) === 0 && _safeNum(s.gst_percent) === 0)).map(_projectKacchaView);
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      // v104.44.56 — Enrich with FIFO-allocated payments
      sales = _enrichSalesWithPaymentsFifo(sales);
      const hasPayments = sales.some(s => (s.total_received || 0) > 0);

      // Detect split entries → show PKA/KCA breakdown columns in ALL view
      const hasSplit = sales.some(s => _safeNum(s.billed_amount) > 0 && _safeNum(s.kaccha_amount) > 0);
      const showPkaCol = hasSplit && gst_filter !== 'PKA' && gst_filter !== 'KCA';
      const showKcaCol = hasSplit && gst_filter !== 'PKA' && gst_filter !== 'KCA';

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

      // Detect optional columns
      const has = {
        bill: sales.some(s => s.bill_number), billing_date: sales.some(s => s.billing_date),
        rst: sales.some(s => s.rst_no), vehicle: sales.some(s => s.vehicle_no),
        billfrom: sales.some(s => s.bill_from), dest: sales.some(s => s.destination),
        bags: sales.some(s => s.bags), tax: sales.some(s => s.tax_amount),
        cash: sales.some(s => s.cash_paid), diesel: sales.some(s => s.diesel_paid),
        adv: sales.some(s => s.advance), remark: sales.some(s => s.remark)
      };

      // Build dynamic columns
      const cols = [{h:'V.No',k:'voucher_no',w:8},{h:'Date',k:'date',w:10}];
      if (has.bill) cols.push({h:'Bill No',k:'bill_number',w:10});
      if (has.billing_date) cols.push({h:'Bill Date',k:'billing_date',w:10});
      if (has.rst) cols.push({h:'RST',k:'rst_no',w:8});
      if (has.vehicle) cols.push({h:'Vehicle',k:'vehicle_no',w:12});
      if (has.billfrom) cols.push({h:'Bill From',k:'bill_from',w:14});
      cols.push({h:'Party Name',k:'party_name',w:16});
      if (has.dest) cols.push({h:'Destination',k:'destination',w:14});
      cols.push({h:'N/W (Qtl)',k:'net_weight_qtl',w:10});
      if (has.bags) cols.push({h:'Bags',k:'bags',w:7});
      cols.push({h:'Rate/Qtl',k:'rate_per_qtl',w:9});
      if (showPkaCol) cols.push({h:'PKA Amt',k:'billed_amount',w:12});
      if (showKcaCol) cols.push({h:'KCA Amt',k:'kaccha_amount',w:12});
      if (!showPkaCol && !showKcaCol) cols.push({h:'Amount',k:'amount',w:12});
      if (has.tax) cols.push({h:'Tax',k:'tax_amount',w:9});
      cols.push({h:'Total',k:'total',w:12});
      if (has.cash) cols.push({h:'Cash',k:'cash_paid',w:10});
      if (has.diesel) cols.push({h:'Diesel',k:'diesel_paid',w:10});
      if (has.adv) cols.push({h:'Advance',k:'advance',w:10});
      // v104.44.52 — PKA mode me Balance + Oil hide
      // v104.44.53 — Balance Premium ke baad (last) move kiya, premium-adjusted
      if (gst_filter !== 'PKA') {
        if (hasOil) { cols.push({h:'Oil%',k:'oil_pct',w:8},{h:'Diff%',k:'oil_diff',w:8},{h:'Premium',k:'oil_premium',w:12}); }
        cols.push({h:'Balance',k:'balance_final',w:12});
        // v104.44.56 — payment columns
        if (hasPayments) {
          cols.push({h:'Last Pmt',k:'last_payment_date',w:11});
          cols.push({h:'Received',k:'total_received',w:12});
          cols.push({h:'Pending',k:'pending_balance',w:12});
        }
      }
      if (has.remark) cols.push({h:'Remark',k:'remark',w:16});

      const ncols = cols.length;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${product || 'BP'} Sales`);

      // Branding
      const branding = (database.getBranding ? database.getBranding() : {}) || {};
      const company = (branding.company_name || 'Rice Mill').toUpperCase();
      const address = branding.address || '';
      const phone = branding.phone || '';

      // Title with mode badge
      const modeLabel = (gst_filter === 'PKA' || gst_filter === 'KCA') ? ` [${gst_filter}]` : ' [ALL]';
      let title = `${product || 'By-Product'} Sale Register${modeLabel}`;
      if (kms_year) title += ` - FY ${kms_year}`;
      if (season) title += ` (${season})`;
      const titleBg = gst_filter === 'PKA' ? 'FF2E7D32' : (gst_filter === 'KCA' ? 'FFC62828' : 'FF2E75B6');

      // Filter summary
      const fltParts = [];
      if (date_from || date_to) fltParts.push(`Period: ${date_from || '...'} to ${date_to || '...'}`);
      if (party_name) fltParts.push(`Party: ${party_name}`);
      if (vehicle_no) fltParts.push(`Vehicle: ${vehicle_no}`);
      if (bill_from) fltParts.push(`Bill From: ${bill_from}`);
      if (destination) fltParts.push(`Destination: ${destination}`);
      if (rst_no) fltParts.push(`RST: ${rst_no}`);
      const filterSummary = fltParts.join('  •  ');

      // Row 1: Company name
      ws.mergeCells(1, 1, 1, ncols);
      const c1 = ws.getCell(1, 1); c1.value = company;
      c1.font = { name:'Calibri', bold:true, size:14, color:{argb:'FF1F4E79'} };
      c1.alignment = { horizontal:'center' };

      // Row 2: address + phone
      if (address || phone) {
        ws.mergeCells(2, 1, 2, ncols);
        const c2 = ws.getCell(2, 1); c2.value = `${address}  |  ${phone}`;
        c2.font = { name:'Calibri', size:9, color:{argb:'FF666666'} };
        c2.alignment = { horizontal:'center' };
      }

      // Row 3: Title with mode-color background
      ws.mergeCells(3, 1, 3, ncols);
      const c3 = ws.getCell(3, 1); c3.value = title;
      c3.font = { name:'Calibri', bold:true, size:12, color:{argb:'FFFFFFFF'} };
      c3.fill = { type:'pattern', pattern:'solid', fgColor:{argb:titleBg} };
      c3.alignment = { horizontal:'center' };

      // Row 4: Filter summary (if any)
      let headerRow = 5;
      if (filterSummary) {
        ws.mergeCells(4, 1, 4, ncols);
        const c4 = ws.getCell(4, 1); c4.value = filterSummary;
        c4.font = { name:'Calibri', italic:true, size:9, color:{argb:'FF555555'} };
        c4.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFF5F5F5'} };
        c4.alignment = { horizontal:'center' };
        headerRow = 6;
      }

      // Header row
      cols.forEach((c, i) => {
        const cell = ws.getCell(headerRow, i + 1);
        cell.value = c.h;
        cell.font = { name:'Calibri', bold:true, size:9, color:{argb:'FFFFFFFF'} };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1F4E79'} };
        cell.alignment = { horizontal:'center', wrapText:true };
        cell.border = { top:{style:'thin', color:{argb:'FFB0C4DE'}}, bottom:{style:'thin', color:{argb:'FFB0C4DE'}}, left:{style:'thin', color:{argb:'FFB0C4DE'}}, right:{style:'thin', color:{argb:'FFB0C4DE'}} };
        ws.getColumn(i + 1).width = c.w;
      });

      // Data rows + totals
      const tot = { nw:0, bags:0, amt:0, billed:0, kaccha:0, tax:0, total:0, cash:0, diesel:0, adv:0, bal:0, balFinal:0, oilP:0, recv:0, pend:0 };
      sales.forEach((s, idx) => {
        const r = headerRow + 1 + idx;
        const op = oilMap[s.voucher_no||''] || oilMap[s.rst_no||''];
        const prem = op ? _safeNum(op.premium_amount) : 0;
        const balFinal = +(_safeNum(s.balance) + prem).toFixed(2);
        const recv = _safeNum(s.total_received);
        const pend = _safeNum(s.pending_balance);
        tot.nw += _safeNum(s.net_weight_kg); tot.bags += _safeNum(s.bags);
        tot.amt += _safeNum(s.amount); tot.billed += _safeNum(s.billed_amount); tot.kaccha += _safeNum(s.kaccha_amount);
        tot.tax += _safeNum(s.tax_amount); tot.total += _safeNum(s.total);
        tot.cash += _safeNum(s.cash_paid); tot.diesel += _safeNum(s.diesel_paid);
        tot.adv += _safeNum(s.advance); tot.bal += _safeNum(s.balance);
        tot.balFinal += balFinal; tot.recv += recv; tot.pend += pend;
        if (op) tot.oilP += prem;

        cols.forEach((c, i) => {
          const cell = ws.getCell(r, i + 1);
          let val;
          if (c.k === 'voucher_no') val = s.voucher_no || '';
          else if (c.k === 'date') val = fmtDate(s.date);
          else if (c.k === 'billing_date') val = fmtDate(s.billing_date);
          else if (c.k === 'net_weight_qtl') val = +(((s.net_weight_kg||0)/100).toFixed(2));
          else if (c.k === 'oil_pct') val = op ? op.actual_oil_pct : '';
          else if (c.k === 'oil_diff') val = op ? +((op.difference_pct||0).toFixed(2)) : '';
          else if (c.k === 'oil_premium') val = op ? +(prem.toFixed(2)) : '';
          else if (c.k === 'balance_final') val = balFinal;
          else if (c.k === 'last_payment_date') val = s.last_payment_date ? fmtDate(s.last_payment_date) : '';
          else if (c.k === 'total_received') val = recv > 0 ? recv : '';
          else if (c.k === 'pending_balance') val = pend;
          else if (['net_weight_kg','bags','rate_per_qtl','amount','billed_amount','kaccha_amount','tax_amount','total','cash_paid','diesel_paid','advance','balance'].includes(c.k)) val = _safeNum(s[c.k]);
          else val = s[c.k] || '';
          cell.value = val;
          cell.font = { name:'Calibri', size:9 };
          cell.border = { top:{style:'thin', color:{argb:'FFB0C4DE'}}, bottom:{style:'thin', color:{argb:'FFB0C4DE'}}, left:{style:'thin', color:{argb:'FFB0C4DE'}}, right:{style:'thin', color:{argb:'FFB0C4DE'}} };
          // Alt-row fill
          if (idx % 2 === 0) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFF0F6FC'} };
          // Color-coded PKA/KCA/Tax/Total/Balance cells
          if (c.k === 'billed_amount') {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFE8F5E9'} };
            cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FF2E7D32'} };
          } else if (c.k === 'kaccha_amount') {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFEBEE'} };
            cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FFC62828'} };
          } else if (c.k === 'tax_amount' && val) {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF8E1'} };
            cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FFEF6C00'} };
          } else if (c.k === 'total') {
            cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FF1B5E20'} };
          } else if (c.k === 'balance_final') {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF3E0'} };
            cell.font = { name:'Calibri', size:9, bold:true, color:{argb: balFinal > 0 ? 'FFC62828' : 'FF1B5E20' } };
          } else if (c.k === 'total_received' && val) {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFE0F7FA'} };
            cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FF00838F'} };
          } else if (c.k === 'pending_balance') {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFE0B2'} };
            cell.font = { name:'Calibri', size:9, bold:true, color:{argb: val > 0 ? 'FFE65100' : 'FF1B5E20' } };
          }
          if (['net_weight_kg','net_weight_qtl','bags','rate_per_qtl','amount','billed_amount','kaccha_amount','tax_amount','total','cash_paid','diesel_paid','advance','balance','balance_final','total_received','pending_balance','oil_pct','oil_diff','oil_premium'].includes(c.k)) {
            cell.alignment = { horizontal:'right' };
          }
          if (['amount','billed_amount','kaccha_amount','tax_amount','total','cash_paid','diesel_paid','advance','balance','balance_final','total_received','pending_balance','oil_premium'].includes(c.k)) {
            cell.numFmt = '#,##0.00';
          }
          if (c.k === 'oil_premium' && op && prem < 0) {
            cell.font = { name:'Calibri', size:9, color:{argb:'FFFF0000'} };
          }
        });
      });

      // Totals row
      const tr = headerRow + 1 + sales.length;
      cols.forEach((c, i) => {
        const cell = ws.getCell(tr, i + 1);
        cell.font = { name:'Calibri', bold:true, size:9, color:{argb:'FFFFFFFF'} };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2E75B6'} };
        cell.border = { top:{style:'thin', color:{argb:'FFB0C4DE'}}, bottom:{style:'thin', color:{argb:'FFB0C4DE'}}, left:{style:'thin', color:{argb:'FFB0C4DE'}}, right:{style:'thin', color:{argb:'FFB0C4DE'}} };
        let v = '';
        if (c.k === 'date') v = 'TOTAL';
        else if (c.k === 'net_weight_kg') v = +(tot.nw.toFixed(2));
        else if (c.k === 'net_weight_qtl') v = +((tot.nw/100).toFixed(2));
        else if (c.k === 'bags') v = tot.bags;
        else if (c.k === 'amount') v = +(tot.amt.toFixed(2));
        else if (c.k === 'billed_amount') v = +(tot.billed.toFixed(2));
        else if (c.k === 'kaccha_amount') v = +(tot.kaccha.toFixed(2));
        else if (c.k === 'tax_amount') v = +(tot.tax.toFixed(2));
        else if (c.k === 'total') v = +(tot.total.toFixed(2));
        else if (c.k === 'cash_paid') v = +(tot.cash.toFixed(2));
        else if (c.k === 'diesel_paid') v = +(tot.diesel.toFixed(2));
        else if (c.k === 'advance') v = +(tot.adv.toFixed(2));
        else if (c.k === 'balance') v = +(tot.bal.toFixed(2));
        else if (c.k === 'balance_final') v = +(tot.balFinal.toFixed(2));
        else if (c.k === 'total_received') v = tot.recv > 0 ? +(tot.recv.toFixed(2)) : '';
        else if (c.k === 'pending_balance') v = +(tot.pend.toFixed(2));
        else if (c.k === 'oil_premium') v = +(tot.oilP.toFixed(2));
        cell.value = v;
        if (['net_weight_kg','net_weight_qtl','bags','amount','billed_amount','kaccha_amount','tax_amount','total','cash_paid','diesel_paid','advance','balance','balance_final','total_received','pending_balance','oil_premium'].includes(c.k)) {
          cell.alignment = { horizontal:'right' };
        }
      });

      ws.pageSetup = { orientation:'landscape', fitToPage:true, fitToWidth:1, fitToHeight:0 };

      // Apply consolidated polish (auto-filter + freeze + no gridlines)
      try { applyConsolidatedExcelPolish(ws, { headerRow }); } catch (_) {}

      const fn = req.query.filename || `${(product||'byproduct').toLowerCase().replace(/ /g,'_')}_sale_register_${Date.now()}.xlsx`;
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename=${fn}`);
      await wb.xlsx.write(res); res.end();
    } catch(e) { res.status(500).json({detail:'Export failed: '+e.message}); }
  });

  // ---- PDF EXPORT (v104.44.51 — Professional with PKA/KCA breakdown + color coding) ----
  router.get('/api/bp-sale-register/export/pdf', async (req, res) => {
    try {
      ensure();
      const PDFDocument = require('pdfkit');
      const { addPdfHeader: _addPdfHeader, safePdfPipe, fmtDate, F, autoF } = require('./pdf_helpers');
      let sales = [...database.data.bp_sale_register];
      const { product, kms_year, season, date_from, date_to, billing_date_from, billing_date_to, rst_no, vehicle_no, bill_from, party_name, destination, gst_filter } = req.query;
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
      if (gst_filter === 'PKA') sales = sales.filter(s => _safeNum(s.billed_amount) > 0 || _safeNum(s.gst_percent) > 0).map(_projectPakkaView);
      else if (gst_filter === 'KCA') sales = sales.filter(s => _safeNum(s.kaccha_amount) > 0 || (_safeNum(s.billed_amount) === 0 && _safeNum(s.gst_percent) === 0)).map(_projectKacchaView);
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      // v104.44.56 — Enrich with FIFO-allocated payments
      sales = _enrichSalesWithPaymentsFifo(sales);
      const hasPayments = sales.some(s => (s.total_received || 0) > 0);

      // Detect split → show PKA/KCA breakdown columns
      const hasSplit = sales.some(s => _safeNum(s.billed_amount) > 0 && _safeNum(s.kaccha_amount) > 0);
      const showPkaCol = hasSplit && gst_filter !== 'PKA' && gst_filter !== 'KCA';
      const showKcaCol = hasSplit && gst_filter !== 'PKA' && gst_filter !== 'KCA';

      // Oil premium for Rice Bran
      if (!database.data.oil_premium) database.data.oil_premium = [];
      const oilMap = {};
      if (product === 'Rice Bran') {
        let opList = [...database.data.oil_premium];
        if (kms_year) opList = opList.filter(i => i.kms_year === kms_year);
        if (season) opList = opList.filter(i => i.season === season);
        opList.forEach(op => { const k = op.voucher_no || op.rst_no || ''; if (k) oilMap[k] = op; });
      }
      const hasOil = Object.keys(oilMap).length > 0 && sales.some(s => oilMap[s.voucher_no||''] || oilMap[s.rst_no||'']);

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
      pc.push(['NW(Qtl)',40,'net_weight_qtl']);
      if (has.bags) pc.push(['Bags',28,'bags']);
      pc.push(['Rate/Q',38,'rate_per_qtl']);
      if (showPkaCol) pc.push(['PKA',50,'billed_amount']);
      if (showKcaCol) pc.push(['KCA',50,'kaccha_amount']);
      if (!showPkaCol && !showKcaCol) pc.push(['Amount',50,'amount']);
      if (has.tax) pc.push(['Tax',35,'tax_amount']);
      pc.push(['Total',50,'total']);
      if (has.cash) pc.push(['Cash',38,'cash_paid']);
      if (has.diesel) pc.push(['Diesel',38,'diesel_paid']);
      if (has.adv) pc.push(['Adv',32,'advance']);
      // v104.44.52 — PKA mode me Balance + Oil hide
      // v104.44.53 — Balance ko Premium ke baad (last) move kiya, premium-adjusted
      if (gst_filter !== 'PKA') {
        if (hasOil) { pc.push(['Oil%',30,'oil_pct'],['Diff%',30,'oil_diff'],['Premium',45,'oil_premium']); }
        pc.push(['Balance',50,'balance_final']);
        // v104.44.56 — payment columns
        if (hasPayments) {
          pc.push(['Last Pmt',42,'last_payment_date']);
          pc.push(['Recvd',45,'total_received']);
          pc.push(['Pending',50,'pending_balance']);
        }
      }

      const headers = pc.map(c => c[0]);
      let widths = pc.map(c => c[1]);
      const keys = pc.map(c => c[2]);

      const doc = new PDFDocument({size:'A4',layout:'landscape',margin:20});
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename=${req.query.filename || `${(product||'bp').toLowerCase().replace(/ /g,'_')}_sales_${Date.now()}.pdf`}`);

      // Branding header (company + custom fields)
      const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill' };
      const modeLabel = (gst_filter === 'PKA' || gst_filter === 'KCA') ? ` [${gst_filter}]` : ' [ALL]';
      let title = `${product || 'By-Product'} Sale Register${modeLabel}`;
      if (kms_year) title += ` - FY ${kms_year}`;
      if (season) title += ` (${season})`;
      _addPdfHeader(doc, title, branding);

      // Mode-colored title strip (override the default teal title bar with mode color)
      // Actually addPdfHeader already drew the title; let's draw a colored mode strip below
      const modeBg = gst_filter === 'PKA' ? '#2E7D32' : (gst_filter === 'KCA' ? '#C62828' : '#2E75B6');
      // Filter summary
      const fltParts = [];
      if (date_from || date_to) fltParts.push(`Period: ${date_from || '...'} to ${date_to || '...'}`);
      if (party_name) fltParts.push(`Party: ${party_name}`);
      if (vehicle_no) fltParts.push(`Vehicle: ${vehicle_no}`);
      if (bill_from) fltParts.push(`Bill From: ${bill_from}`);
      if (destination) fltParts.push(`Destination: ${destination}`);
      if (rst_no) fltParts.push(`RST: ${rst_no}`);
      const filterSummary = fltParts.join('  •  ');
      if (filterSummary) {
        const subY = doc.y;
        doc.rect(20, subY, doc.page.width - 40, 14).fill('#F5F5F5');
        doc.fontSize(7).font(autoF(filterSummary, 'normal')).fillColor('#555555')
          .text(filterSummary, 22, subY + 3, { width: doc.page.width - 44, align: 'center', lineBreak: false });
        doc.y = subY + 16;
      }

      // Auto-fit widths to page
      const margin = 20;
      const pageW = doc.page.width - margin * 2;
      const totalW = widths.reduce((a,b) => a+b, 0);
      const scale = totalW > pageW ? pageW / totalW : 1;
      widths = widths.map(w => Math.floor(w * scale));
      const actualTotalW = widths.reduce((a,b) => a+b, 0);
      const startX = Math.max(margin, (doc.page.width - actualTotalW) / 2);

      const fs = 6;
      const rowH = fs + 8;
      let y = doc.y;

      // Header row (dark blue #1F4E79)
      doc.rect(startX, y, actualTotalW, rowH + 2).fill('#1F4E79');
      let x = startX;
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').font(autoF(h, 'bold')).fontSize(fs + 0.5)
          .text(h, x + 2, y + 3, { width: widths[i] - 4, align: 'center', lineBreak: false });
        x += widths[i];
      });
      y += rowH + 2;

      // Number column flags
      const isNumCol = keys.map(k => ['net_weight_kg','bags','rate_per_qtl','amount','billed_amount','kaccha_amount','tax_amount','total','cash_paid','diesel_paid','advance','balance','balance_final','total_received','pending_balance','oil_premium'].includes(k));

      // Data rows
      const tot = { nw:0, bags:0, amt:0, billed:0, kaccha:0, tax:0, total:0, cash:0, diesel:0, adv:0, bal:0, balFinal:0, oilP:0, recv:0, pend:0 };
      sales.forEach((s, ri) => {
        if (y + rowH > doc.page.height - margin - 30) { doc.addPage(); y = margin; }
        const op = oilMap[s.voucher_no||''] || oilMap[s.rst_no||''];
        const prem = op ? _safeNum(op.premium_amount) : 0;
        const balFinal = +(_safeNum(s.balance) + prem).toFixed(2);
        const recv = _safeNum(s.total_received);
        const pend = _safeNum(s.pending_balance);
        tot.nw += _safeNum(s.net_weight_kg); tot.bags += _safeNum(s.bags);
        tot.amt += _safeNum(s.amount); tot.billed += _safeNum(s.billed_amount); tot.kaccha += _safeNum(s.kaccha_amount);
        tot.tax += _safeNum(s.tax_amount); tot.total += _safeNum(s.total);
        tot.cash += _safeNum(s.cash_paid); tot.diesel += _safeNum(s.diesel_paid);
        tot.adv += _safeNum(s.advance); tot.bal += _safeNum(s.balance);
        tot.balFinal += balFinal; tot.recv += recv; tot.pend += pend;
        if (op) tot.oilP += prem;

        const baseBg = ri % 2 === 0 ? '#ffffff' : '#EBF1F8';
        x = startX;
        keys.forEach((k, ci) => {
          // Cell value
          let cellVal = '';
          if (k === 'voucher_no') cellVal = s.voucher_no || '';
          else if (k === 'date') cellVal = fmtDate(s.date);
          else if (k === 'party_name') cellVal = (s.party_name || '').substring(0, 16);
          else if (k === 'bill_from') cellVal = (s.bill_from || '').substring(0, 14);
          else if (k === 'destination') cellVal = (s.destination || '').substring(0, 12);
          else if (['amount','billed_amount','kaccha_amount','tax_amount','total','balance'].includes(k)) {
            const v = _safeNum(s[k]);
            cellVal = v ? Math.round(v).toLocaleString('en-IN') : '';
          }
          else if (k === 'balance_final') {
            cellVal = balFinal ? Math.round(balFinal).toLocaleString('en-IN') : '0';
          }
          else if (k === 'last_payment_date') cellVal = s.last_payment_date ? fmtDate(s.last_payment_date) : '';
          else if (k === 'total_received') cellVal = recv ? Math.round(recv).toLocaleString('en-IN') : '';
          else if (k === 'pending_balance') cellVal = pend ? Math.round(pend).toLocaleString('en-IN') : '0';
          else if (k === 'oil_pct') cellVal = op ? `${op.actual_oil_pct}%` : '';
          else if (k === 'oil_diff') {
            if (op) { const d = op.difference_pct || 0; cellVal = `${d>0?'+':''}${d.toFixed(2)}%`; }
          }
          else if (k === 'oil_premium') cellVal = op ? Math.round(prem).toLocaleString('en-IN') : '';
          else if (['net_weight_kg','bags','rate_per_qtl','cash_paid','diesel_paid','advance'].includes(k)) cellVal = String(_safeNum(s[k]) || '');
          else cellVal = String(s[k] || '');

          // Color overrides for PKA/KCA/Tax/Total/Balance(final)
          let cellBg = baseBg;
          let textColor = '#1F2937';
          let fontWeight = 'normal';
          if (k === 'billed_amount') { cellBg = '#D0EBD2'; textColor = '#1B5E20'; fontWeight = 'bold'; }
          else if (k === 'kaccha_amount') { cellBg = '#FFD6D6'; textColor = '#B71C1C'; fontWeight = 'bold'; }
          else if (k === 'tax_amount' && cellVal) { cellBg = '#FFE8B0'; textColor = '#E65100'; fontWeight = 'bold'; }
          else if (k === 'total') { textColor = '#0D47A1'; fontWeight = 'bold'; }
          else if (k === 'balance_final') { cellBg = '#FFF3E0'; textColor = balFinal > 0 ? '#C62828' : '#1B5E20'; fontWeight = 'bold'; }
          else if (k === 'total_received' && cellVal) { cellBg = '#E0F7FA'; textColor = '#00838F'; fontWeight = 'bold'; }
          else if (k === 'pending_balance') { cellBg = '#FFE0B2'; textColor = pend > 0 ? '#E65100' : '#1B5E20'; fontWeight = 'bold'; }

          doc.rect(x, y, widths[ci], rowH).fill(cellBg);
          doc.rect(x, y, widths[ci], rowH).stroke('#CCCCCC');
          doc.fillColor(textColor).font(autoF(cellVal, fontWeight)).fontSize(fs)
            .text(cellVal, x + 2, y + 2, { width: widths[ci] - 4, height: rowH - 2, lineBreak: false, align: isNumCol[ci] ? 'right' : 'left' });
          x += widths[ci];
        });
        y += rowH;
      });

      // Total row (mode-colored)
      if (y + rowH > doc.page.height - margin - 30) { doc.addPage(); y = margin; }
      doc.rect(startX, y, actualTotalW, rowH).fill('#2E75B6');
      x = startX;
      keys.forEach((k, ci) => {
        let v = '';
        if (k === 'date') v = 'TOTAL';
        else if (k === 'net_weight_kg') v = String(Math.round(tot.nw));
        else if (k === 'bags') v = String(tot.bags);
        else if (k === 'amount') v = Math.round(tot.amt).toLocaleString('en-IN');
        else if (k === 'billed_amount') v = tot.billed ? Math.round(tot.billed).toLocaleString('en-IN') : '';
        else if (k === 'kaccha_amount') v = tot.kaccha ? Math.round(tot.kaccha).toLocaleString('en-IN') : '';
        else if (k === 'tax_amount') v = Math.round(tot.tax).toLocaleString('en-IN');
        else if (k === 'total') v = Math.round(tot.total).toLocaleString('en-IN');
        else if (k === 'cash_paid') v = String(Math.round(tot.cash));
        else if (k === 'diesel_paid') v = String(Math.round(tot.diesel));
        else if (k === 'advance') v = String(Math.round(tot.adv));
        else if (k === 'balance') v = Math.round(tot.bal).toLocaleString('en-IN');
        else if (k === 'balance_final') v = Math.round(tot.balFinal).toLocaleString('en-IN');
        else if (k === 'last_payment_date') v = '';
        else if (k === 'total_received') v = tot.recv ? Math.round(tot.recv).toLocaleString('en-IN') : '';
        else if (k === 'pending_balance') v = Math.round(tot.pend).toLocaleString('en-IN');
        else if (k === 'oil_premium') v = Math.round(tot.oilP).toLocaleString('en-IN');
        doc.rect(x, y, widths[ci], rowH).stroke('#1F4E79');
        doc.fillColor('#FFFFFF').font(autoF(v, 'bold')).fontSize(fs)
          .text(v, x + 2, y + 2, { width: widths[ci] - 4, height: rowH - 2, lineBreak: false, align: isNumCol[ci] ? 'right' : 'left' });
        x += widths[ci];
      });
      y += rowH;
      doc.y = y + 8;

      // v104.44.54 — Payment Summary footer removed (user feedback)

      // Generated date footer
      doc.fontSize(7).font(F('normal')).fillColor('#999999')
        .text(`Generated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}`, { align: 'left' });

      await safePdfPipe(doc, res);
    } catch(e) { res.status(500).json({detail:'PDF failed: '+e.message}); }
  });

  // v104.44.56 — Option C: Party Statement Excel Export (A4 portrait)
  router.get('/api/bp-sale-register/export/statement-excel', async (req, res) => {
    try {
      ensure();
      const ExcelJS = require('exceljs');
      const { fmtDate } = require('./pdf_helpers');
      const { party, kms_year, season, gst_filter } = req.query;
      if (!party) return res.status(400).json({ detail: 'party required' });
      // Build statement (reuse the same logic as the route handler)
      let partyKeys;
      if (gst_filter === 'PKA') partyKeys = [`${party} (PKA)`];
      else if (gst_filter === 'KCA') partyKeys = [`${party} (KCA)`];
      else partyKeys = [`${party} (PKA)`, `${party} (KCA)`, party];
      let raw = (database.data.local_party_accounts || []).filter(p => partyKeys.includes(p.party_name));
      if (kms_year) raw = raw.filter(p => p.kms_year === kms_year);
      if (season) raw = raw.filter(p => p.season === season);
      // v104.44.58 — Also pull payments from cash_transactions
      const _cashItemsX = (database.data.cash_transactions || []).filter(c =>
        partyKeys.includes(c.category) && c.txn_type === 'jama'
        && (!kms_year || c.kms_year === kms_year)
        && (!season || c.season === season));
      const _skipKwX = ['lab test premium', 'oil premium', 'sale bhada', 'rice bran sale', 'rice sale', 'paddy sale', 'sale #', 'sale-'];
      _cashItemsX.forEach(c => {
        const d = c.description || ''; if (_skipKwX.some(k => d.toLowerCase().includes(k))) return;
        raw.push({ date: c.date||'', party_name: c.category||'', txn_type: 'payment', amount: c.amount||0, description: d, reference: c.id||'', created_at: c.created_at||'' });
      });
      raw.sort((a, b) => ((a.date || '').localeCompare(b.date || '')) || ((a.created_at || '').localeCompare(b.created_at || '')));
      let balance = 0;
      const entries = raw.map(r => {
        const amt = _safeNum(r.amount); const ttype = r.txn_type || ''; let flow = ttype.toUpperCase();
        if (ttype === 'debit') { balance += amt; flow = 'Dr'; }
        else if (ttype === 'payment') { balance -= amt; flow = 'Cr'; }
        const desc = (r.description || '')
          .replace('Pakka (GST Bill)', 'PKA (GST Bill)').replace('Kaccha (Slip)', 'KCA (Slip)')
          .replace(' - Pakka', ' - PKA').replace(' - Kaccha', ' - KCA');
        return { date: r.date || '', party_name: r.party_name || '', flow, amount: amt, description: desc, running_balance: balance };
      });
      const summary = {
        total_debit: +entries.filter(e => e.flow === 'Dr').reduce((s, e) => s + e.amount, 0).toFixed(2),
        total_credit: +entries.filter(e => e.flow === 'Cr').reduce((s, e) => s + e.amount, 0).toFixed(2),
        closing_balance: +balance.toFixed(2),
        entry_count: entries.length
      };
      const branding = (database.getBranding ? database.getBranding() : {}) || {};
      const company = (branding.company_name || 'Rice Mill').toUpperCase();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${party.substring(0, 25)} Statement`);
      const cols = [{h:'Date',w:14},{h:'Sub-Ledger',w:18},{h:'Type',w:8},{h:'Description',w:38},{h:'Debit (Dr)',w:14},{h:'Credit (Cr)',w:14},{h:'Balance',w:14}];
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
      const ncols = cols.length;
      const mode = gst_filter || 'ALL';
      const titleBg = mode === 'PKA' ? 'FF2E7D32' : (mode === 'KCA' ? 'FFC62828' : 'FF2E75B6');
      // Row 1 company
      ws.mergeCells(1, 1, 1, ncols);
      const c1 = ws.getCell(1, 1); c1.value = company;
      c1.font = { name: 'Calibri', bold: true, size: 14, color: {argb:'FF1F4E79'} }; c1.alignment = { horizontal: 'center' };
      // Row 3 title
      ws.mergeCells(3, 1, 3, ncols);
      const c3 = ws.getCell(3, 1);
      let title = `PARTY STATEMENT — ${party}  [${mode}]`;
      if (kms_year) title += `   FY ${kms_year}`;
      if (season) title += `   (${season})`;
      c3.value = title;
      c3.font = { name: 'Calibri', bold: true, size: 12, color: {argb:'FFFFFFFF'} };
      c3.fill = { type: 'pattern', pattern: 'solid', fgColor: {argb: titleBg} };
      c3.alignment = { horizontal: 'center' };
      // Row 4 summary
      ws.mergeCells(4, 1, 4, ncols);
      const c4 = ws.getCell(4, 1);
      c4.value = `Entries: ${summary.entry_count}   |   Total Debit: ₹${summary.total_debit.toLocaleString('en-IN')}   |   Total Credit: ₹${summary.total_credit.toLocaleString('en-IN')}   |   Closing Balance: ₹${summary.closing_balance.toLocaleString('en-IN')}`;
      c4.font = { name: 'Calibri', italic: true, size: 9, color: {argb:'FF555555'} };
      c4.fill = { type: 'pattern', pattern: 'solid', fgColor: {argb:'FFF5F5F5'} };
      c4.alignment = { horizontal: 'center' };
      // Header row 5
      const headerRow = 5;
      const border = { top:{style:'thin', color:{argb:'FFB0C4DE'}}, bottom:{style:'thin', color:{argb:'FFB0C4DE'}}, left:{style:'thin', color:{argb:'FFB0C4DE'}}, right:{style:'thin', color:{argb:'FFB0C4DE'}} };
      cols.forEach((c, i) => {
        const cell = ws.getCell(headerRow, i + 1); cell.value = c.h;
        cell.font = { name: 'Calibri', bold: true, size: 10, color: {argb:'FFFFFFFF'} };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: {argb:'FF1F4E79'} };
        cell.alignment = { horizontal: 'center' }; cell.border = border;
      });
      entries.forEach((e, idx) => {
        const r = headerRow + 1 + idx;
        const altFill = idx % 2 === 0 ? { type:'pattern', pattern:'solid', fgColor:{argb:'FFF0F6FC'} } : undefined;
        const debit = e.flow === 'Dr' ? e.amount : 0;
        const credit = e.flow === 'Cr' ? e.amount : 0;
        const vals = [fmtDate(e.date), e.party_name, e.flow, e.description, debit, credit, e.running_balance];
        vals.forEach((v, ci) => {
          const cell = ws.getCell(r, ci + 1); cell.value = v;
          cell.font = { name: 'Calibri', size: 9 }; cell.border = border;
          if (altFill) cell.fill = altFill;
          if (ci >= 4) { cell.alignment = { horizontal: 'right' }; cell.numFmt = '#,##0.00'; }
          if (ci === 4 && v) cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FF1B5E20'} };
          else if (ci === 5 && v) cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FFC62828'} };
          else if (ci === 6) cell.font = { name:'Calibri', size:9, bold:true, color:{argb:'FF0D47A1'} };
        });
      });
      const tr = headerRow + 1 + entries.length;
      for (let i = 1; i <= ncols; i++) {
        const cell = ws.getCell(tr, i); cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2E75B6'} };
        cell.font = { name:'Calibri', bold:true, size:9, color:{argb:'FFFFFFFF'} }; cell.border = border;
      }
      ws.getCell(tr, 1).value = 'CLOSING';
      ws.getCell(tr, 5).value = summary.total_debit; ws.getCell(tr, 5).numFmt = '#,##0.00'; ws.getCell(tr, 5).alignment = { horizontal:'right' };
      ws.getCell(tr, 6).value = summary.total_credit; ws.getCell(tr, 6).numFmt = '#,##0.00'; ws.getCell(tr, 6).alignment = { horizontal:'right' };
      ws.getCell(tr, 7).value = summary.closing_balance; ws.getCell(tr, 7).numFmt = '#,##0.00'; ws.getCell(tr, 7).alignment = { horizontal:'right' };
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRow }];
      ws.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      const fn = `${party.toLowerCase().replace(/\s+/g, '_')}_statement_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename=${fn}`);
      await wb.xlsx.write(res); res.end();
    } catch(e) { res.status(500).json({detail:'Statement Excel failed: '+e.message}); }
  });

  // v104.44.56 — Option C: Party Statement PDF Export (A4 portrait)
  router.get('/api/bp-sale-register/export/statement-pdf', async (req, res) => {
    try {
      ensure();
      const PDFDocument = require('pdfkit');
      const { addPdfHeader, safePdfPipe, fmtDate, F, autoF } = require('./pdf_helpers');
      const { party, kms_year, season, gst_filter } = req.query;
      if (!party) return res.status(400).json({ detail: 'party required' });
      let partyKeys;
      if (gst_filter === 'PKA') partyKeys = [`${party} (PKA)`];
      else if (gst_filter === 'KCA') partyKeys = [`${party} (KCA)`];
      else partyKeys = [`${party} (PKA)`, `${party} (KCA)`, party];
      let raw = (database.data.local_party_accounts || []).filter(p => partyKeys.includes(p.party_name));
      if (kms_year) raw = raw.filter(p => p.kms_year === kms_year);
      if (season) raw = raw.filter(p => p.season === season);
      raw.sort((a, b) => ((a.date || '').localeCompare(b.date || '')) || ((a.created_at || '').localeCompare(b.created_at || '')));
      let balance = 0;
      const entries = raw.map(r => {
        const amt = _safeNum(r.amount); const ttype = r.txn_type || ''; let flow = ttype.toUpperCase();
        if (ttype === 'debit') { balance += amt; flow = 'Dr'; }
        else if (ttype === 'payment') { balance -= amt; flow = 'Cr'; }
        const desc = (r.description || '')
          .replace('Pakka (GST Bill)', 'PKA (GST Bill)').replace('Kaccha (Slip)', 'KCA (Slip)')
          .replace(' - Pakka', ' - PKA').replace(' - Kaccha', ' - KCA');
        return { date: r.date || '', party_name: r.party_name || '', flow, amount: amt, description: desc, running_balance: balance };
      });
      const summary = {
        total_debit: +entries.filter(e => e.flow === 'Dr').reduce((s, e) => s + e.amount, 0).toFixed(2),
        total_credit: +entries.filter(e => e.flow === 'Cr').reduce((s, e) => s + e.amount, 0).toFixed(2),
        closing_balance: +balance.toFixed(2),
        entry_count: entries.length
      };
      const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 18 });
      const fn = `${party.toLowerCase().replace(/\s+/g, '_')}_statement_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename=${fn}`);
      const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill' };
      const mode = gst_filter || 'ALL';
      let title = `PARTY STATEMENT — ${party}  [${mode}]`;
      if (kms_year) title += `   FY ${kms_year}`;
      if (season) title += `   (${season})`;
      addPdfHeader(doc, title, branding);
      // Summary
      const summaryY = doc.y;
      doc.rect(18, summaryY, doc.page.width - 36, 16).fill('#F5F5F5');
      const sumText = `Entries: ${summary.entry_count}  |  Total Debit: ${summary.total_debit.toLocaleString('en-IN')}  |  Total Credit: ${summary.total_credit.toLocaleString('en-IN')}  |  Closing: ${summary.closing_balance.toLocaleString('en-IN')}`;
      doc.fontSize(8).font(autoF(sumText, 'bold')).fillColor('#1F4E79')
        .text(sumText, 22, summaryY + 4, { width: doc.page.width - 44, align: 'center', lineBreak: false });
      doc.y = summaryY + 20;
      // Table
      const headers = ['Date', 'Sub-Ledger', 'Type', 'Description', 'Dr', 'Cr', 'Balance'];
      const widths = [55, 70, 28, 218, 60, 60, 65];
      const totalW = widths.reduce((a, b) => a + b, 0);
      const startX = (doc.page.width - totalW) / 2;
      const fs = 7; const rowH = fs + 6; let y = doc.y;
      // Header row
      doc.rect(startX, y, totalW, rowH + 2).fill('#1F4E79');
      let x = startX;
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').font(autoF(h, 'bold')).fontSize(fs)
          .text(h, x + 2, y + 3, { width: widths[i] - 4, align: 'center', lineBreak: false });
        x += widths[i];
      });
      y += rowH + 2;
      entries.forEach((e, ri) => {
        if (y + rowH > doc.page.height - 30) { doc.addPage(); y = 18; }
        const baseBg = ri % 2 === 0 ? '#ffffff' : '#EBF1F8';
        x = startX;
        const debit = e.flow === 'Dr' ? Math.round(e.amount).toLocaleString('en-IN') : '';
        const credit = e.flow === 'Cr' ? Math.round(e.amount).toLocaleString('en-IN') : '';
        const cells = [fmtDate(e.date), e.party_name.substring(0, 18), e.flow, e.description.substring(0, 55), debit, credit, Math.round(e.running_balance).toLocaleString('en-IN')];
        const colors_ = [baseBg, baseBg, baseBg, baseBg, baseBg, baseBg, baseBg];
        const txtColors = ['#333', '#333', '#333', '#333', '#1B5E20', '#C62828', '#0D47A1'];
        cells.forEach((v, ci) => {
          doc.rect(x, y, widths[ci], rowH).fill(colors_[ci]);
          doc.rect(x, y, widths[ci], rowH).stroke('#CCCCCC');
          const align = ci >= 4 ? 'right' : 'left';
          const isBold = ci >= 4;
          doc.fillColor(txtColors[ci]).font(autoF(v, isBold ? 'bold' : 'normal')).fontSize(fs)
            .text(String(v), x + 2, y + 2, { width: widths[ci] - 4, height: rowH - 2, lineBreak: false, align });
          x += widths[ci];
        });
        y += rowH;
      });
      // Closing row
      if (y + rowH > doc.page.height - 30) { doc.addPage(); y = 18; }
      doc.rect(startX, y, totalW, rowH).fill('#2E75B6');
      x = startX;
      const closingCells = ['CLOSING', '', '', '', Math.round(summary.total_debit).toLocaleString('en-IN'), Math.round(summary.total_credit).toLocaleString('en-IN'), Math.round(summary.closing_balance).toLocaleString('en-IN')];
      closingCells.forEach((v, ci) => {
        doc.rect(x, y, widths[ci], rowH).stroke('#1F4E79');
        const align = ci >= 4 ? 'right' : 'left';
        doc.fillColor('#FFFFFF').font(autoF(v, 'bold')).fontSize(fs)
          .text(String(v), x + 2, y + 2, { width: widths[ci] - 4, height: rowH - 2, lineBreak: false, align });
        x += widths[ci];
      });
      y += rowH;
      doc.y = y + 6;
      doc.fontSize(7).font(F('normal')).fillColor('#999999')
        .text(`Generated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}`, { align: 'left' });
      await safePdfPipe(doc, res);
    } catch(e) { res.status(500).json({detail:'Statement PDF failed: '+e.message}); }
  });

  return router;
};
