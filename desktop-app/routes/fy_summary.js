const express = require('express');

function getPrevFy(kmsYear) {
  if (!kmsYear) return null;
  const parts = kmsYear.split('-');
  if (parts.length === 2) return `${parseInt(parts[0])-1}-${parseInt(parts[1])-1}`;
  return null;
}
function getNextFy(kmsYear) {
  if (!kmsYear) return null;
  const parts = kmsYear.split('-');
  if (parts.length === 2) return `${parseInt(parts[0])+1}-${parseInt(parts[1])+1}`;
  return null;
}

module.exports = function(database) {
  const router = express.Router();

  function col(name) { return database.data[name] || []; }
  function filterByFy(arr, fy, season) {
    let r = arr;
    if (fy) r = r.filter(x => x.kms_year === fy);
    if (season) r = r.filter(x => x.season === season);
    return r;
  }
  const rd = (v) => Math.round((v || 0) * 100) / 100;

  function computeFySummary(kms_year, season) {
    const prevFy = getPrevFy(kms_year);
    const savedOb = (col('opening_balances') || []).find(o => o.kms_year === kms_year);

    // 1. CASH & BANK
    const cashTxns = filterByFy(col('cash_transactions'), kms_year, season);
    const cashIn = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
    const cashOut = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
    const bankIn = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
    const bankOut = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
    let obCash = 0, obBank = 0;
    if (savedOb) { obCash = savedOb.cash || 0; obBank = savedOb.bank || 0; }
    else if (prevFy) {
      const prevSaved = (col('opening_balances') || []).find(o => o.kms_year === prevFy);
      const prevCash = filterByFy(col('cash_transactions'), prevFy, season);
      const pci = prevCash.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
      const pco = prevCash.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
      const pbi = prevCash.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
      const pbo = prevCash.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
      if (prevSaved) { obCash = rd((prevSaved.cash||0) + pci - pco); obBank = rd((prevSaved.bank||0) + pbi - pbo); }
      else { obCash = rd(pci - pco); obBank = rd(pbi - pbo); }
    }

    // 2. PADDY STOCK
    const entries = filterByFy(col('entries'), kms_year, season);
    const paddyIn = rd(entries.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0));
    const millingEntries = filterByFy(col('milling_entries'), kms_year, season);
    const paddyUsed = rd(millingEntries.reduce((s,e) => s + (e.paddy_input_qntl||0), 0));
    let obPaddy = 0;
    if (savedOb && savedOb.paddy_stock !== undefined) { obPaddy = savedOb.paddy_stock || 0; }
    else if (prevFy) {
      const prevSaved = (col('opening_balances') || []).find(o => o.kms_year === prevFy);
      const pe = filterByFy(col('entries'), prevFy, season);
      const pm = filterByFy(col('milling_entries'), prevFy, season);
      const prevOb = prevSaved ? (prevSaved.paddy_stock || 0) : 0;
      obPaddy = rd(prevOb + pe.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0) - pm.reduce((s,e) => s + (e.paddy_input_qntl||0), 0));
    }

    // 3. MILLING
    const totalRice = rd(millingEntries.reduce((s,e) => s + (e.rice_qntl||0), 0));
    const totalFrkUsed = rd(millingEntries.reduce((s,e) => s + (e.frk_used_qntl||0), 0));
    const totalCmr = rd(millingEntries.reduce((s,e) => s + (e.cmr_delivery_qntl||0), 0));

    // 4. FRK STOCK
    const frkPurchases = filterByFy(col('frk_purchases') || [], kms_year, season);
    const frkBought = rd(frkPurchases.reduce((s,p) => s + (p.quantity_qntl||0), 0));
    const frkCost = rd(frkPurchases.reduce((s,p) => s + (p.total_amount||0), 0));
    let obFrk = 0;
    if (savedOb && savedOb.frk_stock !== undefined) { obFrk = savedOb.frk_stock || 0; }
    else if (prevFy) {
      const prevSaved = (col('opening_balances') || []).find(o => o.kms_year === prevFy);
      const pf = filterByFy(col('frk_purchases') || [], prevFy, season);
      const pm = filterByFy(col('milling_entries'), prevFy, season);
      const prevOb = prevSaved ? (prevSaved.frk_stock || 0) : 0;
      obFrk = rd(prevOb + pf.reduce((s,p) => s + (p.quantity_qntl||0), 0) - pm.reduce((s,e) => s + (e.frk_used_qntl||0), 0));
    }

    // 5. BYPRODUCTS
    const bpSales = filterByFy(col('byproduct_sales') || [], kms_year, season);
    const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
    const savedBp = (savedOb && savedOb.byproducts) || {};
    const prevMill = (!Object.keys(savedBp).length && prevFy) ? filterByFy(col('milling_entries'), prevFy, season) : [];
    const prevBpSales = (!Object.keys(savedBp).length && prevFy) ? filterByFy(col('byproduct_sales') || [], prevFy, season) : [];
    const byproducts = {};
    for (const p of products) {
      const produced = rd(millingEntries.reduce((s,e) => s + (e[`${p}_qntl`]||0), 0));
      const sold = rd(bpSales.filter(s => s.product === p).reduce((s,x) => s + (x.quantity_qntl||0), 0));
      const revenue = rd(bpSales.filter(s => s.product === p).reduce((s,x) => s + (x.total_amount||0), 0));
      let ob = 0;
      if (Object.keys(savedBp).length) { ob = savedBp[p] || 0; }
      else if (prevFy) {
        const prevSaved = (col('opening_balances') || []).find(o => o.kms_year === prevFy);
        const prevBpOb = prevSaved && prevSaved.byproducts ? (prevSaved.byproducts[p] || 0) : 0;
        ob = rd(prevBpOb + prevMill.reduce((s,e) => s + (e[`${p}_qntl`]||0), 0) - prevBpSales.filter(s => s.product === p).reduce((s,x) => s + (x.quantity_qntl||0), 0));
      }
      byproducts[p] = { opening_stock: ob, produced, sold, closing_stock: rd(ob + produced - sold), revenue };
    }

    // 6. MILL PARTS
    const partsStock = filterByFy(col('mill_parts_stock') || [], kms_year, season);
    const savedMp = (savedOb && savedOb.mill_parts) || {};
    const prevPartsS = (!Object.keys(savedMp).length && prevFy) ? filterByFy(col('mill_parts_stock') || [], prevFy, season) : [];
    const millParts = (col('mill_parts') || []).map(part => {
      const pn = part.name;
      const sIn = rd(partsStock.filter(t => t.part_name === pn && t.txn_type === 'in').reduce((s,t) => s + (t.quantity||0), 0));
      const sOut = rd(partsStock.filter(t => t.part_name === pn && t.txn_type !== 'in').reduce((s,t) => s + (t.quantity||0), 0));
      let ob = 0;
      if (Object.keys(savedMp).length) { ob = savedMp[pn] || 0; }
      else if (prevFy) {
        const prevSaved = (col('opening_balances') || []).find(o => o.kms_year === prevFy);
        const prevOb = prevSaved && prevSaved.mill_parts ? (prevSaved.mill_parts[pn] || 0) : 0;
        ob = rd(prevOb + prevPartsS.filter(t => t.part_name === pn && t.txn_type === 'in').reduce((s,t) => s + (t.quantity||0), 0)
          - prevPartsS.filter(t => t.part_name === pn && t.txn_type !== 'in').reduce((s,t) => s + (t.quantity||0), 0));
      }
      return { name: pn, unit: part.unit || 'Pcs', opening_stock: ob, stock_in: sIn, stock_used: sOut, closing_stock: rd(ob + sIn - sOut) };
    });

    // 7. DIESEL
    const dieselTxns = filterByFy(col('diesel_accounts') || [], kms_year, season);
    const savedDiesel = (savedOb && savedOb.diesel) || {};
    const prevDieselTxns = (!Object.keys(savedDiesel).length && prevFy) ? filterByFy(col('diesel_accounts') || [], prevFy, season) : [];
    const diesel = (col('diesel_pumps') || []).map(pump => {
      const pt = dieselTxns.filter(t => t.pump_id === pump.id);
      const td = rd(pt.filter(t => t.txn_type === 'debit').reduce((s,t) => s + (t.amount||0), 0));
      const tp = rd(pt.filter(t => t.txn_type === 'payment').reduce((s,t) => s + (t.amount||0), 0));
      let ob = 0;
      if (Object.keys(savedDiesel).length) { ob = savedDiesel[pump.id] || 0; }
      else if (prevFy) {
        const prevSaved = (col('opening_balances') || []).find(o => o.kms_year === prevFy);
        const prevOb = prevSaved && prevSaved.diesel ? (prevSaved.diesel[pump.id] || 0) : 0;
        const pp = prevDieselTxns.filter(t => t.pump_id === pump.id);
        ob = rd(prevOb + pp.filter(t => t.txn_type === 'debit').reduce((s,t) => s + (t.amount||0), 0)
          - pp.filter(t => t.txn_type === 'payment').reduce((s,t) => s + (t.amount||0), 0));
      }
      return { pump_name: pump.name, pump_id: pump.id, opening_balance: ob, total_diesel: td, total_paid: tp, closing_balance: rd(ob + td - tp) };
    });

    // 8. LOCAL PARTY
    const lpTxns = filterByFy(col('local_party_accounts') || [], kms_year, season);
    const savedLp = (savedOb && savedOb.local_party) || {};
    const prevLpTxns = (!Object.keys(savedLp).length && prevFy) ? filterByFy(col('local_party_accounts') || [], prevFy, season) : [];
    const lpMap = {};
    for (const t of lpTxns) { const pn = (t.party_name||'').trim(); if (!pn) continue; if (!lpMap[pn]) lpMap[pn] = {d:0,p:0}; if (t.txn_type==='debit') lpMap[pn].d += t.amount||0; else if (t.txn_type==='payment') lpMap[pn].p += t.amount||0; }
    let allLpParties, lpTotalOb;
    if (Object.keys(savedLp).length) {
      allLpParties = new Set([...Object.keys(lpMap), ...Object.keys(savedLp).filter(k => rd(savedLp[k]) !== 0)]);
      lpTotalOb = rd([...allLpParties].reduce((s,p) => s + (savedLp[p]||0), 0));
    } else {
      const prevLpMap = {};
      for (const t of prevLpTxns) { const pn = (t.party_name||'').trim(); if (!pn) continue; if (!prevLpMap[pn]) prevLpMap[pn] = 0; if (t.txn_type==='debit') prevLpMap[pn] += t.amount||0; else if (t.txn_type==='payment') prevLpMap[pn] -= t.amount||0; }
      allLpParties = new Set([...Object.keys(lpMap), ...Object.keys(prevLpMap).filter(k => rd(prevLpMap[k]) !== 0)]);
      lpTotalOb = rd([...allLpParties].reduce((s,p) => s + (prevLpMap[p]||0), 0));
    }
    const lpDebit = rd([...allLpParties].reduce((s,p) => s + (lpMap[p]?.d||0), 0));
    const lpPaid = rd([...allLpParties].reduce((s,p) => s + (lpMap[p]?.p||0), 0));

    // 9. STAFF ADVANCES
    const staffList = (col('staff') || []).filter(s => s.active);
    const advs = filterByFy(col('staff_advances') || [], kms_year, season);
    const pays = filterByFy(col('staff_payments') || [], kms_year, season);
    const savedStaff = (savedOb && savedOb.staff) || {};
    const prevAdv = (!Object.keys(savedStaff).length && prevFy) ? filterByFy(col('staff_advances') || [], prevFy, season) : [];
    const prevPay = (!Object.keys(savedStaff).length && prevFy) ? filterByFy(col('staff_payments') || [], prevFy, season) : [];
    const staffAdvances = staffList.map(s => {
      const adv = rd(advs.filter(a => a.staff_id === s.id).reduce((sum,a) => sum + (a.amount||0), 0));
      const ded = rd(pays.filter(p => p.staff_id === s.id).reduce((sum,p) => sum + (p.advance_deducted||0), 0));
      let ob = 0;
      if (Object.keys(savedStaff).length) { ob = savedStaff[s.id] || 0; }
      else if (prevFy) {
        const prevSaved = (col('opening_balances') || []).find(o => o.kms_year === prevFy);
        const prevOb = prevSaved && prevSaved.staff ? (prevSaved.staff[s.id] || 0) : 0;
        ob = rd(prevOb + prevAdv.filter(a => a.staff_id === s.id).reduce((sum,a) => sum + (a.amount||0), 0)
          - prevPay.filter(p => p.staff_id === s.id).reduce((sum,p) => sum + (p.advance_deducted||0), 0));
      }
      return { name: s.name, staff_id: s.id, opening_balance: ob, total_advance: adv, total_deducted: ded, closing_balance: rd(ob + adv - ded) };
    });

    // 10. PRIVATE TRADING
    const privPaddy = filterByFy(col('private_paddy') || [], kms_year, season);
    const riceSales = filterByFy(col('rice_sales') || [], kms_year, season);

    // 11. LEDGER PARTIES
    const ledgerTxns = cashTxns.filter(t => t.account === 'ledger');
    let savedLedger = (savedOb && savedOb.ledger_parties) || {};
    const ledgerMap = {};
    for (const t of ledgerTxns) {
      const cat = (t.category||'').trim();
      if (!cat) continue;
      if (!ledgerMap[cat]) ledgerMap[cat] = { party_name: cat, party_type: t.party_type || '', jama: 0, nikasi: 0 };
      if (t.txn_type === 'jama') ledgerMap[cat].jama += t.amount||0;
      else ledgerMap[cat].nikasi += t.amount||0;
      if (!ledgerMap[cat].party_type && t.party_type) ledgerMap[cat].party_type = t.party_type;
    }
    if (!Object.keys(savedLedger).length && prevFy) {
      const prevLedgerTxns = filterByFy(col('cash_transactions'), prevFy, season).filter(t => t.account === 'ledger');
      const prevSavedLp = ((col('opening_balances') || []).find(o => o.kms_year === prevFy) || {}).ledger_parties || {};
      const prevLedgerMap = {};
      for (const t of prevLedgerTxns) { const cat = (t.category||'').trim(); if (!cat) continue; if (!prevLedgerMap[cat]) prevLedgerMap[cat] = 0; if (t.txn_type === 'jama') prevLedgerMap[cat] += t.amount||0; else prevLedgerMap[cat] -= t.amount||0; }
      savedLedger = {};
      for (const cat of new Set([...Object.keys(prevLedgerMap), ...Object.keys(prevSavedLp)])) {
        const val = rd((prevSavedLp[cat]||0) + (prevLedgerMap[cat]||0));
        if (val !== 0) savedLedger[cat] = val;
      }
    }
    const allLedgerParties = new Set([...Object.keys(ledgerMap), ...Object.keys(savedLedger).filter(k => rd(savedLedger[k]) !== 0)]);
    const ledgerSection = [...allLedgerParties].sort().map(cat => {
      const info = ledgerMap[cat] || { party_name: cat, party_type: '', jama: 0, nikasi: 0 };
      const ob = savedLedger[cat] || 0;
      return { party_name: cat, party_type: info.party_type || '', opening_balance: rd(ob), total_jama: rd(info.jama), total_nikasi: rd(info.nikasi), closing_balance: rd(ob + info.jama - info.nikasi) };
    });

    return {
      kms_year: kms_year || '', season: season || '',
      cash_bank: { opening_cash: rd(obCash), cash_in: rd(cashIn), cash_out: rd(cashOut), closing_cash: rd(obCash+cashIn-cashOut), opening_bank: rd(obBank), bank_in: rd(bankIn), bank_out: rd(bankOut), closing_bank: rd(obBank+bankIn-bankOut) },
      paddy_stock: { opening_stock: obPaddy, paddy_in: paddyIn, paddy_used: paddyUsed, closing_stock: rd(obPaddy+paddyIn-paddyUsed) },
      milling: { total_paddy_milled: paddyUsed, total_rice_produced: totalRice, total_frk_used: totalFrkUsed, total_cmr_delivered: totalCmr, avg_outturn: paddyUsed > 0 ? rd(totalCmr/paddyUsed*100) : 0, total_entries: millingEntries.length },
      frk_stock: { opening_stock: obFrk, purchased: frkBought, used: totalFrkUsed, closing_stock: rd(obFrk+frkBought-totalFrkUsed), total_cost: frkCost },
      byproducts, mill_parts: millParts, diesel,
      local_party: { party_count: allLpParties.size, opening_balance: lpTotalOb, total_debit: lpDebit, total_paid: lpPaid, closing_balance: rd(lpTotalOb+lpDebit-lpPaid) },
      staff_advances: staffAdvances,
      private_trading: {
        paddy_purchase_amount: rd(privPaddy.reduce((s,p) => s + (p.total_amount||0), 0)),
        paddy_paid: rd(privPaddy.reduce((s,p) => s + (p.paid_amount||0), 0)),
        paddy_balance: rd(privPaddy.reduce((s,p) => s + (p.total_amount||0) - (p.paid_amount||0), 0)),
        paddy_qty: rd(privPaddy.reduce((s,p) => s + (p.quantity_qntl||0), 0)),
        rice_sale_amount: rd(riceSales.reduce((s,r) => s + (r.total_amount||0), 0)),
        rice_received: rd(riceSales.reduce((s,r) => s + (r.paid_amount||0), 0)),
        rice_balance: rd(riceSales.reduce((s,r) => s + (r.total_amount||0) - (r.paid_amount||0), 0)),
        rice_qty: rd(riceSales.reduce((s,r) => s + (r.quantity_qntl||0), 0)),
      },
      ledger_parties: {
        total_parties: ledgerSection.length,
        total_opening: rd(ledgerSection.reduce((s,l) => s + l.opening_balance, 0)),
        total_jama: rd(ledgerSection.reduce((s,l) => s + l.total_jama, 0)),
        total_nikasi: rd(ledgerSection.reduce((s,l) => s + l.total_nikasi, 0)),
        total_closing: rd(ledgerSection.reduce((s,l) => s + l.closing_balance, 0)),
        parties: ledgerSection
      }
    };
  }

  router.get('/api/fy-summary', (req, res) => {
    try {
      const result = computeFySummary(req.query.kms_year, req.query.season);
      res.json(result);
    } catch (err) {
      console.error('FY Summary error:', err);
      res.status(500).json({ detail: 'FY Summary error' });
    }
  });

  router.post('/api/fy-summary/carry-forward', (req, res) => {
    try {
      const { kms_year } = req.body;
      if (!kms_year) return res.status(400).json({ detail: 'kms_year is required' });
      const nextFy = getNextFy(kms_year);
      if (!nextFy) return res.status(400).json({ detail: 'Invalid kms_year format' });

      const summary = computeFySummary(kms_year);
      const cb = summary.cash_bank;
      const ps = summary.paddy_stock;
      const frk = summary.frk_stock;
      const bp = summary.byproducts;
      const mp = summary.mill_parts;
      const dieselData = summary.diesel;
      const staff = summary.staff_advances;
      const pt = summary.private_trading;
      const ledger = summary.ledger_parties;

      const obDoc = {
        kms_year: nextFy,
        cash: cb.closing_cash,
        bank: cb.closing_bank,
        bank_details: {},
        paddy_stock: ps.closing_stock,
        frk_stock: frk.closing_stock,
        byproducts: {},
        mill_parts: {},
        diesel: {},
        local_party: {},
        staff: {},
        ledger_parties: {},
        private_trading: { paddy_balance: pt.paddy_balance, rice_balance: pt.rice_balance },
        carried_from: kms_year,
        updated_at: new Date().toISOString()
      };
      for (const [p, v] of Object.entries(bp)) obDoc.byproducts[p] = v.closing_stock;
      for (const p of mp) obDoc.mill_parts[p.name] = p.closing_stock;
      for (const d of dieselData) if (d.closing_balance !== 0) obDoc.diesel[d.pump_id] = d.closing_balance;
      for (const s of staff) if (s.closing_balance !== 0) obDoc.staff[s.staff_id] = s.closing_balance;
      for (const l of ledger.parties) if (l.closing_balance !== 0) obDoc.ledger_parties[l.party_name] = l.closing_balance;

      // Local party per-party
      const lpTxns = filterByFy(col('local_party_accounts') || [], kms_year);
      const lpPartyMap = {};
      for (const t of lpTxns) { const pn = (t.party_name||'').trim(); if (!pn) continue; if (!lpPartyMap[pn]) lpPartyMap[pn] = 0; if (t.txn_type==='debit') lpPartyMap[pn] += t.amount||0; else if (t.txn_type==='payment') lpPartyMap[pn] -= t.amount||0; }
      const existingOb = (col('opening_balances') || []).find(o => o.kms_year === kms_year);
      if (existingOb && existingOb.local_party) {
        for (const [pn, val] of Object.entries(existingOb.local_party)) { lpPartyMap[pn] = (lpPartyMap[pn] || 0) + val; }
      }
      for (const [k, v] of Object.entries(lpPartyMap)) if (rd(v) !== 0) obDoc.local_party[k] = rd(v);

      // Save to opening_balances
      const existing = (col('opening_balances') || []).findIndex(o => o.kms_year === nextFy);
      if (existing >= 0) { database.data.opening_balances[existing] = obDoc; }
      else { if (!database.data.opening_balances) database.data.opening_balances = []; database.data.opening_balances.push(obDoc); }
      database.save();

      res.json({ message: `Closing balances of ${kms_year} carried forward to ${nextFy}`, next_fy: nextFy, opening_balances: obDoc });
    } catch (err) {
      console.error('Carry forward error:', err);
      res.status(500).json({ detail: 'Carry forward failed' });
    }
  });

  // ============ FY SUMMARY PDF EXPORT ============
  router.get('/api/fy-summary/pdf', (req, res) => {
    try {
      const PDFDocument = require('pdfkit');
      const { addPdfHeader, addPdfTable, addSectionTitle, addTotalsRow, fmtAmt } = require('./pdf_helpers');
      const { kms_year, season } = req.query;
      const data = computeFySummary(kms_year, season);

      const doc = new PDFDocument({ size: 'A4', margin: 25 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => {
        const pdfBuf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=FY_Summary_${kms_year || 'all'}.pdf`);
        res.send(pdfBuf);
      });

      const branding = (col('branding') || [])[0] || {};
      addPdfHeader(doc, 'FY Summary - Balance Sheet', branding, `KMS ${kms_year || 'All'}${season ? ' | ' + season : ''}`);
      const cb = data.cash_bank;

      addSectionTitle(doc, '1. Cash & Bank (Rs.)');
      addPdfTable(doc, ['Account', 'Opening', 'Inflow', 'Outflow', 'Closing'], [
        ['Cash', fmtAmt(cb.opening_cash), fmtAmt(cb.cash_in), fmtAmt(cb.cash_out), fmtAmt(cb.closing_cash)],
        ['Bank', fmtAmt(cb.opening_bank), fmtAmt(cb.bank_in), fmtAmt(cb.bank_out), fmtAmt(cb.closing_bank)],
      ], [65, 80, 80, 80, 80]);
      addTotalsRow(doc, ['TOTAL', fmtAmt(cb.opening_cash+cb.opening_bank), fmtAmt(cb.cash_in+cb.bank_in), fmtAmt(cb.cash_out+cb.bank_out), fmtAmt(cb.closing_cash+cb.closing_bank)], [65, 80, 80, 80, 80]);

      const ps = data.paddy_stock;
      addSectionTitle(doc, '2. Paddy Stock (Qtl)');
      addPdfTable(doc, ['Item', 'Opening', 'In', 'Used', 'Closing'], [['Paddy', fmtAmt(ps.opening_stock), fmtAmt(ps.paddy_in), fmtAmt(ps.paddy_used), fmtAmt(ps.closing_stock)]], [65, 80, 80, 80, 80]);

      const frk = data.frk_stock;
      addSectionTitle(doc, '3. FRK Stock (Qtl)');
      addPdfTable(doc, ['Item', 'Opening', 'Purchased', 'Used', 'Closing', 'Cost'], [['FRK', fmtAmt(frk.opening_stock), fmtAmt(frk.purchased), fmtAmt(frk.used), fmtAmt(frk.closing_stock), fmtAmt(frk.total_cost)]], [55, 70, 70, 70, 70, 70]);

      const ml = data.milling;
      addSectionTitle(doc, '4. Milling Summary');
      addPdfTable(doc, ['Entries', 'Paddy Milled', 'Rice Produced', 'FRK Used', 'CMR Delivered', 'Outturn%'], [[String(ml.total_entries), fmtAmt(ml.total_paddy_milled), fmtAmt(ml.total_rice_produced), fmtAmt(ml.total_frk_used), fmtAmt(ml.total_cmr_delivered), String(ml.avg_outturn)]], [50, 70, 70, 70, 75, 60]);

      const bp = data.byproducts;
      const bpRows = Object.entries(bp).map(([name, v]) => [name.charAt(0).toUpperCase()+name.slice(1), fmtAmt(v.opening_stock), fmtAmt(v.produced), fmtAmt(v.sold), fmtAmt(v.closing_stock), fmtAmt(v.revenue)]);
      if (bpRows.length) { addSectionTitle(doc, '5. Byproduct Stock (Qtl)'); addPdfTable(doc, ['Product', 'Opening', 'Produced', 'Sold', 'Closing', 'Revenue'], bpRows, [60, 60, 60, 60, 60, 70]); }

      const mpRows = data.mill_parts.map(p => [p.name, p.unit, fmtAmt(p.opening_stock), fmtAmt(p.stock_in), fmtAmt(p.stock_used), fmtAmt(p.closing_stock)]);
      if (mpRows.length) { addSectionTitle(doc, '6. Mill Parts Stock'); addPdfTable(doc, ['Part', 'Unit', 'Opening', 'In', 'Used', 'Closing'], mpRows, [80, 40, 60, 60, 60, 60]); }

      const dRows = data.diesel.map(d => [d.pump_name, fmtAmt(d.opening_balance), fmtAmt(d.total_diesel), fmtAmt(d.total_paid), fmtAmt(d.closing_balance)]);
      if (dRows.length) { addSectionTitle(doc, '7. Diesel Accounts (Rs.)'); addPdfTable(doc, ['Pump', 'Opening', 'Diesel', 'Paid', 'Balance'], dRows, [90, 75, 75, 75, 75]); }

      const lp = data.local_party;
      addSectionTitle(doc, '8. Local Party (Rs.)');
      addPdfTable(doc, ['Metric', 'Value'], [['Parties', String(lp.party_count)], ['Opening', fmtAmt(lp.opening_balance)], ['Total Debit', fmtAmt(lp.total_debit)], ['Total Paid', fmtAmt(lp.total_paid)], ['Closing', fmtAmt(lp.closing_balance)]], [120, 120]);

      const sRows = data.staff_advances.map(s => [s.name, fmtAmt(s.opening_balance), fmtAmt(s.total_advance), fmtAmt(s.total_deducted), fmtAmt(s.closing_balance)]);
      if (sRows.length) { addSectionTitle(doc, '9. Staff Advances (Rs.)'); addPdfTable(doc, ['Staff', 'Opening', 'Advance', 'Deducted', 'Balance'], sRows, [90, 75, 75, 75, 75]); }

      const lParties = data.ledger_parties.parties || [];
      if (lParties.length) {
        addSectionTitle(doc, '10. Ledger Parties (Rs.)');
        const lRows = lParties.map(l => [l.party_name, l.party_type || '', fmtAmt(l.opening_balance), fmtAmt(l.total_jama), fmtAmt(l.total_nikasi), fmtAmt(l.closing_balance)]);
        lRows.push(['TOTAL', '', fmtAmt(data.ledger_parties.total_opening), fmtAmt(data.ledger_parties.total_jama), fmtAmt(data.ledger_parties.total_nikasi), fmtAmt(data.ledger_parties.total_closing)]);
        addPdfTable(doc, ['Party', 'Type', 'Opening', 'Jama', 'Nikasi', 'Balance'], lRows, [80, 55, 60, 60, 60, 60]);
      }

      const pt = data.private_trading;
      addSectionTitle(doc, '11. Private Trading (Rs.)');
      addPdfTable(doc, ['Category', 'Qty (Qtl)', 'Amount', 'Paid/Recd', 'Balance'], [
        ['Paddy Purchase', fmtAmt(pt.paddy_qty), fmtAmt(pt.paddy_purchase_amount), fmtAmt(pt.paddy_paid), fmtAmt(pt.paddy_balance)],
        ['Rice Sales', fmtAmt(pt.rice_qty), fmtAmt(pt.rice_sale_amount), fmtAmt(pt.rice_received), fmtAmt(pt.rice_balance)],
      ], [80, 65, 75, 75, 75]);

      doc.end();
    } catch (err) {
      console.error('FY Summary PDF error:', err);
      res.status(500).json({ detail: 'PDF generation error' });
    }
  });

  return router;
};
