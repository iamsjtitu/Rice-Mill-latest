const express = require('express');

function getPrevFy(kmsYear) {
  if (!kmsYear) return null;
  const parts = kmsYear.split('-');
  if (parts.length === 2) return `${parseInt(parts[0])-1}-${parseInt(parts[1])-1}`;
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

  router.get('/api/fy-summary', (req, res) => {
    try {
      const { kms_year, season } = req.query;
      const prevFy = getPrevFy(kms_year);

      // 1. CASH & BANK
      const cashTxns = filterByFy(col('cash_transactions'), kms_year, season);
      const cashIn = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
      const cashOut = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
      const bankIn = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
      const bankOut = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
      let obCash = 0, obBank = 0;
      const savedOb = (col('opening_balances') || []).find(o => o.kms_year === kms_year);
      if (savedOb) { obCash = savedOb.cash || 0; obBank = savedOb.bank || 0; }
      else if (prevFy) {
        const prevCash = filterByFy(col('cash_transactions'), prevFy, season);
        obCash = rd(prevCash.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0)
          - prevCash.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0));
        obBank = rd(prevCash.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0)
          - prevCash.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0));
      }

      // 2. PADDY STOCK
      const entries = filterByFy(col('entries'), kms_year, season);
      const paddyIn = rd(entries.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0));
      const millingEntries = filterByFy(col('milling_entries'), kms_year, season);
      const paddyUsed = rd(millingEntries.reduce((s,e) => s + (e.paddy_input_qntl||0), 0));
      let obPaddy = 0;
      if (prevFy) {
        const pe = filterByFy(col('entries'), prevFy, season);
        const pm = filterByFy(col('milling_entries'), prevFy, season);
        obPaddy = rd(pe.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0) - pm.reduce((s,e) => s + (e.paddy_input_qntl||0), 0));
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
      if (prevFy) {
        const pf = filterByFy(col('frk_purchases') || [], prevFy, season);
        const pm = filterByFy(col('milling_entries'), prevFy, season);
        obFrk = rd(pf.reduce((s,p) => s + (p.quantity_qntl||0), 0) - pm.reduce((s,e) => s + (e.frk_used_qntl||0), 0));
      }

      // 5. BYPRODUCTS
      const bpSales = filterByFy(col('byproduct_sales') || [], kms_year, season);
      const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
      const prevMill = prevFy ? filterByFy(col('milling_entries'), prevFy, season) : [];
      const prevBpSales = prevFy ? filterByFy(col('byproduct_sales') || [], prevFy, season) : [];
      const byproducts = {};
      for (const p of products) {
        const produced = rd(millingEntries.reduce((s,e) => s + (e[`${p}_qntl`]||0), 0));
        const sold = rd(bpSales.filter(s => s.product === p).reduce((s,x) => s + (x.quantity_qntl||0), 0));
        const revenue = rd(bpSales.filter(s => s.product === p).reduce((s,x) => s + (x.total_amount||0), 0));
        let ob = 0;
        if (prevFy) {
          ob = rd(prevMill.reduce((s,e) => s + (e[`${p}_qntl`]||0), 0) - prevBpSales.filter(s => s.product === p).reduce((s,x) => s + (x.quantity_qntl||0), 0));
        }
        byproducts[p] = { opening_stock: ob, produced, sold, closing_stock: rd(ob + produced - sold), revenue };
      }

      // 6. MILL PARTS
      const partsStock = filterByFy(col('mill_parts_stock') || [], kms_year, season);
      const prevParts = prevFy ? filterByFy(col('mill_parts_stock') || [], prevFy, season) : [];
      const millParts = (col('mill_parts') || []).map(part => {
        const pn = part.name;
        const sIn = rd(partsStock.filter(t => t.part_name === pn && t.txn_type === 'in').reduce((s,t) => s + (t.quantity||0), 0));
        const sOut = rd(partsStock.filter(t => t.part_name === pn && t.txn_type !== 'in').reduce((s,t) => s + (t.quantity||0), 0));
        let ob = 0;
        if (prevFy) {
          ob = rd(prevParts.filter(t => t.part_name === pn && t.txn_type === 'in').reduce((s,t) => s + (t.quantity||0), 0)
            - prevParts.filter(t => t.part_name === pn && t.txn_type !== 'in').reduce((s,t) => s + (t.quantity||0), 0));
        }
        return { name: pn, unit: part.unit || 'Pcs', opening_stock: ob, stock_in: sIn, stock_used: sOut, closing_stock: rd(ob + sIn - sOut) };
      });

      // 7. DIESEL
      const dieselTxns = filterByFy(col('diesel_accounts') || [], kms_year, season);
      const prevDiesel = prevFy ? filterByFy(col('diesel_accounts') || [], prevFy, season) : [];
      const diesel = (col('diesel_pumps') || []).map(pump => {
        const pt = dieselTxns.filter(t => t.pump_id === pump.id);
        const td = rd(pt.filter(t => t.txn_type === 'debit').reduce((s,t) => s + (t.amount||0), 0));
        const tp = rd(pt.filter(t => t.txn_type === 'payment').reduce((s,t) => s + (t.amount||0), 0));
        let ob = 0;
        if (prevFy) {
          const pp = prevDiesel.filter(t => t.pump_id === pump.id);
          ob = rd(pp.filter(t => t.txn_type === 'debit').reduce((s,t) => s + (t.amount||0), 0) - pp.filter(t => t.txn_type === 'payment').reduce((s,t) => s + (t.amount||0), 0));
        }
        return { pump_name: pump.name, opening_balance: ob, total_diesel: td, total_paid: tp, closing_balance: rd(ob + td - tp) };
      });

      // 8. LOCAL PARTY
      const lpTxns = filterByFy(col('local_party_accounts') || [], kms_year, season);
      const prevLp = prevFy ? filterByFy(col('local_party_accounts') || [], prevFy, season) : [];
      const lpMap = {}, prevLpMap = {};
      for (const t of lpTxns) { const pn = (t.party_name||'').trim(); if (!pn) continue; if (!lpMap[pn]) lpMap[pn] = {d:0,p:0}; if (t.txn_type==='debit') lpMap[pn].d += t.amount||0; else if (t.txn_type==='payment') lpMap[pn].p += t.amount||0; }
      for (const t of prevLp) { const pn = (t.party_name||'').trim(); if (!pn) continue; if (!prevLpMap[pn]) prevLpMap[pn] = 0; if (t.txn_type==='debit') prevLpMap[pn] += t.amount||0; else if (t.txn_type==='payment') prevLpMap[pn] -= t.amount||0; }
      const allParties = new Set([...Object.keys(lpMap), ...Object.keys(prevLpMap).filter(k => Math.round(prevLpMap[k]*100)/100 !== 0)]);
      const lpOb = rd([...allParties].reduce((s,p) => s + (prevLpMap[p]||0), 0));
      const lpDebit = rd([...allParties].reduce((s,p) => s + (lpMap[p]?.d||0), 0));
      const lpPaid = rd([...allParties].reduce((s,p) => s + (lpMap[p]?.p||0), 0));

      // 9. STAFF ADVANCES
      const staffList = (col('staff') || []).filter(s => s.active);
      const advs = filterByFy(col('staff_advances') || [], kms_year, season);
      const pays = filterByFy(col('staff_payments') || [], kms_year, season);
      const prevAdv = prevFy ? filterByFy(col('staff_advances') || [], prevFy, season) : [];
      const prevPay = prevFy ? filterByFy(col('staff_payments') || [], prevFy, season) : [];
      const staffAdvances = staffList.map(s => {
        const adv = rd(advs.filter(a => a.staff_id === s.id).reduce((sum,a) => sum + (a.amount||0), 0));
        const ded = rd(pays.filter(p => p.staff_id === s.id).reduce((sum,p) => sum + (p.advance_deducted||0), 0));
        let ob = 0;
        if (prevFy) {
          ob = rd(prevAdv.filter(a => a.staff_id === s.id).reduce((sum,a) => sum + (a.amount||0), 0)
            - prevPay.filter(p => p.staff_id === s.id).reduce((sum,p) => sum + (p.advance_deducted||0), 0));
        }
        return { name: s.name, opening_balance: ob, total_advance: adv, total_deducted: ded, closing_balance: rd(ob + adv - ded) };
      });

      // 10. PRIVATE TRADING
      const privPaddy = filterByFy(col('private_paddy') || [], kms_year, season);
      const riceSales = filterByFy(col('rice_sales') || [], kms_year, season);

      res.json({
        kms_year: kms_year || '', season: season || '',
        cash_bank: { opening_cash: rd(obCash), cash_in: rd(cashIn), cash_out: rd(cashOut), closing_cash: rd(obCash+cashIn-cashOut), opening_bank: rd(obBank), bank_in: rd(bankIn), bank_out: rd(bankOut), closing_bank: rd(obBank+bankIn-bankOut) },
        paddy_stock: { opening_stock: obPaddy, paddy_in: paddyIn, paddy_used: paddyUsed, closing_stock: rd(obPaddy+paddyIn-paddyUsed) },
        milling: { total_paddy_milled: paddyUsed, total_rice_produced: totalRice, total_frk_used: totalFrkUsed, total_cmr_delivered: totalCmr, avg_outturn: paddyUsed > 0 ? rd(totalCmr/paddyUsed*100) : 0, total_entries: millingEntries.length },
        frk_stock: { opening_stock: obFrk, purchased: frkBought, used: totalFrkUsed, closing_stock: rd(obFrk+frkBought-totalFrkUsed), total_cost: frkCost },
        byproducts, mill_parts: millParts, diesel,
        local_party: { party_count: allParties.size, opening_balance: lpOb, total_debit: lpDebit, total_paid: lpPaid, closing_balance: rd(lpOb+lpDebit-lpPaid) },
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
        }
      });
    } catch (err) {
      console.error('FY Summary error:', err);
      res.status(500).json({ detail: 'FY Summary error' });
    }
  });

  // ============ FY SUMMARY PDF EXPORT ============
  router.get('/api/fy-summary/pdf', (req, res) => {
    try {
      const PDFDocument = require('pdfkit');
      const { addPdfHeader, addPdfTable, addSectionTitle, addTotalsRow, fmtAmt } = require('./pdf_helpers');

      // Get the same data by calling the summary logic inline
      const { kms_year, season } = req.query;
      const prevFy = getPrevFy(kms_year);

      // Reuse logic from GET /api/fy-summary
      const cashTxns = filterByFy(col('cash_transactions'), kms_year, season);
      const cashIn = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
      const cashOut = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
      const bankIn = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0);
      const bankOut = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0);
      let obCash = 0, obBank = 0;
      const savedOb = (col('opening_balances') || []).find(o => o.kms_year === kms_year);
      if (savedOb) { obCash = savedOb.cash || 0; obBank = savedOb.bank || 0; }
      else if (prevFy) {
        const prevCash = filterByFy(col('cash_transactions'), prevFy, season);
        obCash = rd(prevCash.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0) - prevCash.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0));
        obBank = rd(prevCash.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s,t) => s + (t.amount||0), 0) - prevCash.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s,t) => s + (t.amount||0), 0));
      }
      const entries = filterByFy(col('entries'), kms_year, season);
      const paddyIn = rd(entries.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0));
      const millingEntries = filterByFy(col('milling_entries'), kms_year, season);
      const paddyUsed = rd(millingEntries.reduce((s,e) => s + (e.paddy_input_qntl||0), 0));
      let obPaddy = 0;
      if (prevFy) { const pe = filterByFy(col('entries'), prevFy, season); const pm = filterByFy(col('milling_entries'), prevFy, season); obPaddy = rd(pe.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0) - pm.reduce((s,e) => s + (e.paddy_input_qntl||0), 0)); }
      const totalRice = rd(millingEntries.reduce((s,e) => s + (e.rice_qntl||0), 0));
      const totalFrkUsed = rd(millingEntries.reduce((s,e) => s + (e.frk_used_qntl||0), 0));
      const totalCmr = rd(millingEntries.reduce((s,e) => s + (e.cmr_delivery_qntl||0), 0));
      const frkPurchases = filterByFy(col('frk_purchases') || [], kms_year, season);
      const frkBought = rd(frkPurchases.reduce((s,p) => s + (p.quantity_qntl||0), 0));
      const frkCost = rd(frkPurchases.reduce((s,p) => s + (p.total_amount||0), 0));
      let obFrk = 0;
      if (prevFy) { const pf = filterByFy(col('frk_purchases') || [], prevFy, season); const pm = filterByFy(col('milling_entries'), prevFy, season); obFrk = rd(pf.reduce((s,p) => s + (p.quantity_qntl||0), 0) - pm.reduce((s,e) => s + (e.frk_used_qntl||0), 0)); }
      const bpSales = filterByFy(col('byproduct_sales') || [], kms_year, season);
      const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
      const prevMill = prevFy ? filterByFy(col('milling_entries'), prevFy, season) : [];
      const prevBpSales = prevFy ? filterByFy(col('byproduct_sales') || [], prevFy, season) : [];

      // Build PDF
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

      // 1. Cash & Bank
      addSectionTitle(doc, '1. Cash & Bank (Rs.)');
      addPdfTable(doc, ['Account', 'Opening', 'Inflow', 'Outflow', 'Closing'], [
        ['Cash', fmtAmt(obCash), fmtAmt(cashIn), fmtAmt(cashOut), fmtAmt(obCash+cashIn-cashOut)],
        ['Bank', fmtAmt(obBank), fmtAmt(bankIn), fmtAmt(bankOut), fmtAmt(obBank+bankIn-bankOut)],
      ], [65, 80, 80, 80, 80]);
      addTotalsRow(doc, ['TOTAL', fmtAmt(obCash+obBank), fmtAmt(cashIn+bankIn), fmtAmt(cashOut+bankOut), fmtAmt(obCash+obBank+cashIn+bankIn-cashOut-bankOut)], [65, 80, 80, 80, 80]);

      // 2. Paddy Stock
      addSectionTitle(doc, '2. Paddy Stock (Qtl)');
      addPdfTable(doc, ['Item', 'Opening', 'In', 'Used', 'Closing'], [
        ['Paddy', fmtAmt(obPaddy), fmtAmt(paddyIn), fmtAmt(paddyUsed), fmtAmt(obPaddy+paddyIn-paddyUsed)]
      ], [65, 80, 80, 80, 80]);

      // 3. FRK Stock
      addSectionTitle(doc, '3. FRK Stock (Qtl)');
      addPdfTable(doc, ['Item', 'Opening', 'Purchased', 'Used', 'Closing', 'Cost'], [
        ['FRK', fmtAmt(obFrk), fmtAmt(frkBought), fmtAmt(totalFrkUsed), fmtAmt(obFrk+frkBought-totalFrkUsed), fmtAmt(frkCost)]
      ], [55, 70, 70, 70, 70, 70]);

      // 4. Milling Summary
      addSectionTitle(doc, '4. Milling Summary');
      addPdfTable(doc, ['Entries', 'Paddy Milled', 'Rice Produced', 'FRK Used', 'CMR Delivered', 'Outturn%'], [
        [String(millingEntries.length), fmtAmt(paddyUsed), fmtAmt(totalRice), fmtAmt(totalFrkUsed), fmtAmt(totalCmr), paddyUsed > 0 ? (totalCmr/paddyUsed*100).toFixed(2) : '0']
      ], [50, 70, 70, 70, 75, 60]);

      // 5. Byproducts
      addSectionTitle(doc, '5. Byproduct Stock (Qtl)');
      const bpRows = products.map(p => {
        const produced = rd(millingEntries.reduce((s,e) => s + (e[`${p}_qntl`]||0), 0));
        const sold = rd(bpSales.filter(s => s.product === p).reduce((s,x) => s + (x.quantity_qntl||0), 0));
        const revenue = rd(bpSales.filter(s => s.product === p).reduce((s,x) => s + (x.total_amount||0), 0));
        let ob = 0;
        if (prevFy) { ob = rd(prevMill.reduce((s,e) => s + (e[`${p}_qntl`]||0), 0) - prevBpSales.filter(s => s.product === p).reduce((s,x) => s + (x.quantity_qntl||0), 0)); }
        return [p.charAt(0).toUpperCase()+p.slice(1), fmtAmt(ob), fmtAmt(produced), fmtAmt(sold), fmtAmt(ob+produced-sold), fmtAmt(revenue)];
      });
      addPdfTable(doc, ['Product', 'Opening', 'Produced', 'Sold', 'Closing', 'Revenue'], bpRows, [60, 60, 60, 60, 60, 70]);

      // 6. Mill Parts
      const partsStock = filterByFy(col('mill_parts_stock') || [], kms_year, season);
      const prevPartsStock = prevFy ? filterByFy(col('mill_parts_stock') || [], prevFy, season) : [];
      const mpRows = (col('mill_parts') || []).map(part => {
        const pn = part.name;
        const sIn = rd(partsStock.filter(t => t.part_name === pn && t.txn_type === 'in').reduce((s,t) => s + (t.quantity||0), 0));
        const sOut = rd(partsStock.filter(t => t.part_name === pn && t.txn_type !== 'in').reduce((s,t) => s + (t.quantity||0), 0));
        let ob = 0;
        if (prevFy) { ob = rd(prevPartsStock.filter(t => t.part_name === pn && t.txn_type === 'in').reduce((s,t) => s + (t.quantity||0), 0) - prevPartsStock.filter(t => t.part_name === pn && t.txn_type !== 'in').reduce((s,t) => s + (t.quantity||0), 0)); }
        return [pn, part.unit||'Pcs', fmtAmt(ob), fmtAmt(sIn), fmtAmt(sOut), fmtAmt(ob+sIn-sOut)];
      });
      if (mpRows.length) { addSectionTitle(doc, '6. Mill Parts Stock'); addPdfTable(doc, ['Part', 'Unit', 'Opening', 'In', 'Used', 'Closing'], mpRows, [80, 40, 60, 60, 60, 60]); }

      // 7. Diesel
      const dieselTxns = filterByFy(col('diesel_accounts') || [], kms_year, season);
      const prevDiesel = prevFy ? filterByFy(col('diesel_accounts') || [], prevFy, season) : [];
      const dRows = (col('diesel_pumps') || []).map(pump => {
        const pt = dieselTxns.filter(t => t.pump_id === pump.id);
        const td = rd(pt.filter(t => t.txn_type === 'debit').reduce((s,t) => s + (t.amount||0), 0));
        const tp = rd(pt.filter(t => t.txn_type === 'payment').reduce((s,t) => s + (t.amount||0), 0));
        let ob = 0;
        if (prevFy) { const pp = prevDiesel.filter(t => t.pump_id === pump.id); ob = rd(pp.filter(t => t.txn_type === 'debit').reduce((s,t) => s + (t.amount||0), 0) - pp.filter(t => t.txn_type === 'payment').reduce((s,t) => s + (t.amount||0), 0)); }
        return [pump.name, fmtAmt(ob), fmtAmt(td), fmtAmt(tp), fmtAmt(ob+td-tp)];
      });
      if (dRows.length) { addSectionTitle(doc, '7. Diesel Accounts (Rs.)'); addPdfTable(doc, ['Pump', 'Opening', 'Diesel', 'Paid', 'Balance'], dRows, [90, 75, 75, 75, 75]); }

      // 8. Local Party
      const lpTxns = filterByFy(col('local_party_accounts') || [], kms_year, season);
      const prevLp = prevFy ? filterByFy(col('local_party_accounts') || [], prevFy, season) : [];
      const lpMap2 = {}, prevLpMap2 = {};
      for (const t of lpTxns) { const pn = (t.party_name||'').trim(); if (!pn) continue; if (!lpMap2[pn]) lpMap2[pn] = {d:0,p:0}; if (t.txn_type==='debit') lpMap2[pn].d += t.amount||0; else if (t.txn_type==='payment') lpMap2[pn].p += t.amount||0; }
      for (const t of prevLp) { const pn = (t.party_name||'').trim(); if (!pn) continue; if (!prevLpMap2[pn]) prevLpMap2[pn] = 0; if (t.txn_type==='debit') prevLpMap2[pn] += t.amount||0; else if (t.txn_type==='payment') prevLpMap2[pn] -= t.amount||0; }
      const allP = new Set([...Object.keys(lpMap2), ...Object.keys(prevLpMap2).filter(k => Math.round(prevLpMap2[k]*100)/100 !== 0)]);
      addSectionTitle(doc, '8. Local Party (Rs.)');
      addPdfTable(doc, ['Metric', 'Value'], [
        ['Total Parties', String(allP.size)],
        ['Opening Balance', fmtAmt([...allP].reduce((s,p) => s + (prevLpMap2[p]||0), 0))],
        ['Total Debit', fmtAmt([...allP].reduce((s,p) => s + (lpMap2[p]?.d||0), 0))],
        ['Total Paid', fmtAmt([...allP].reduce((s,p) => s + (lpMap2[p]?.p||0), 0))],
        ['Closing Balance', fmtAmt([...allP].reduce((s,p) => s + (prevLpMap2[p]||0) + (lpMap2[p]?.d||0) - (lpMap2[p]?.p||0), 0))],
      ], [120, 120]);

      // 9. Staff Advances
      const staffList = (col('staff') || []).filter(s => s.active);
      const advs = filterByFy(col('staff_advances') || [], kms_year, season);
      const pays = filterByFy(col('staff_payments') || [], kms_year, season);
      const prevAdv2 = prevFy ? filterByFy(col('staff_advances') || [], prevFy, season) : [];
      const prevPay2 = prevFy ? filterByFy(col('staff_payments') || [], prevFy, season) : [];
      const sRows = staffList.map(s => {
        const adv = rd(advs.filter(a => a.staff_id === s.id).reduce((sum,a) => sum + (a.amount||0), 0));
        const ded = rd(pays.filter(p => p.staff_id === s.id).reduce((sum,p) => sum + (p.advance_deducted||0), 0));
        let ob = 0;
        if (prevFy) { ob = rd(prevAdv2.filter(a => a.staff_id === s.id).reduce((sum,a) => sum + (a.amount||0), 0) - prevPay2.filter(p => p.staff_id === s.id).reduce((sum,p) => sum + (p.advance_deducted||0), 0)); }
        return [s.name, fmtAmt(ob), fmtAmt(adv), fmtAmt(ded), fmtAmt(ob+adv-ded)];
      });
      if (sRows.length) { addSectionTitle(doc, '9. Staff Advances (Rs.)'); addPdfTable(doc, ['Staff', 'Opening', 'Advance', 'Deducted', 'Balance'], sRows, [90, 75, 75, 75, 75]); }

      // 10. Private Trading
      const privPaddy = filterByFy(col('private_paddy') || [], kms_year, season);
      const riceSales = filterByFy(col('rice_sales') || [], kms_year, season);
      addSectionTitle(doc, '10. Private Trading (Rs.)');
      addPdfTable(doc, ['Category', 'Qty (Qtl)', 'Amount', 'Paid/Recd', 'Balance'], [
        ['Paddy Purchase', fmtAmt(privPaddy.reduce((s,p) => s + (p.quantity_qntl||0), 0)), fmtAmt(privPaddy.reduce((s,p) => s + (p.total_amount||0), 0)), fmtAmt(privPaddy.reduce((s,p) => s + (p.paid_amount||0), 0)), fmtAmt(privPaddy.reduce((s,p) => s + (p.total_amount||0) - (p.paid_amount||0), 0))],
        ['Rice Sales', fmtAmt(riceSales.reduce((s,r) => s + (r.quantity_qntl||0), 0)), fmtAmt(riceSales.reduce((s,r) => s + (r.total_amount||0), 0)), fmtAmt(riceSales.reduce((s,r) => s + (r.paid_amount||0), 0)), fmtAmt(riceSales.reduce((s,r) => s + (r.total_amount||0) - (r.paid_amount||0), 0))],
      ], [80, 65, 75, 75, 75]);

      doc.end();
    } catch (err) {
      console.error('FY Summary PDF error:', err);
      res.status(500).json({ detail: 'PDF generation error' });
    }
  });

  return router;
};
