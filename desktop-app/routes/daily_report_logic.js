const { getColumns, fmtVal, getPdfHeaders, getPdfWidthsMm, getExcelHeaders, getEntryRow } = require('../shared/report_helper');

function fmtAmt(val) { return val === 0 ? '0' : val.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtDate(d) { if (!d) return ''; const s = String(d).split('T')[0]; const p = s.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s; }

function getDailyReportData(database, query) {
  function col(name) {
    if (!database.data[name]) database.data[name] = [];
    return database.data[name];
  }

  const { date, kms_year, season, mode } = query;
  const isDetail = mode === 'detail';

  function filterFy(arr) {
    let r = arr.filter(e => e.date === date);
    if (kms_year) r = r.filter(e => e.kms_year === kms_year);
    if (season) r = r.filter(e => e.season === season);
    return r;
  }

  const entries = filterFy(col('entries'));
  const pvtPaddy = filterFy(col('private_paddy'));
  const riceSales = filterFy(col('rice_sales'));
  const milling = filterFy(col('milling_entries'));
  const dcDeliveries = col('dc_deliveries').filter(d => d.date === date);
  const cashTxns = filterFy(col('cash_transactions'));
  const msp = filterFy(col('msp_payments'));
  const pvtPayments = col('private_payments').filter(p => p.date === date);
  const bpSales = filterFy(col('byproduct_sales'));
  const frk = filterFy(col('frk_purchases'));
  const partsTxns = col('mill_parts_stock').filter(t => t.date === date);
  const staffAtt = col('staff_attendance').filter(a => a.date === date);
  const allStaff = col('staff').filter(s => s.active !== false).sort((a, b) => (a.name||'').localeCompare(b.name||''));
  const dieselTxns = filterFy(col('diesel_accounts'));
  const saleVouchers = (col('sale_vouchers') || []).filter(sv => sv.date === date);
  const purchaseVouchers = (col('purchase_vouchers') || []).filter(pv => pv.date === date);
  const dieselTotalAmount = dieselTxns.filter(t => t.txn_type === 'diesel' || t.txn_type === 'debit').reduce((s, t) => s + (t.amount || 0), 0);
  
  const dieselAccPaid = dieselTxns.filter(t => t.txn_type === 'payment' || t.txn_type === 'credit').reduce((s, t) => s + (t.amount || 0), 0);
  const allCashTxnsFy = filterFy(col('cash_transactions'));
  const dieselLedgerPaid = allCashTxnsFy.filter(t => t.account === 'ledger' && t.txn_type === 'nikasi'
    && ((t.party_type || '') === 'Diesel' || (t.reference || '').startsWith('diesel_pay'))
  ).reduce((s, t) => s + (t.amount || 0), 0);
  const dieselTotalPaid = Math.max(dieselAccPaid, dieselLedgerPaid);

  const entryMandiMap = {};
  entries.forEach(e => { if (e.id) entryMandiMap[e.id] = e.mandi_name || ''; });

  const totalMillW = entries.reduce((s, e) => s + (e.mill_w || 0), 0);
  const totalFinalW = entries.reduce((s, e) => s + (e.final_w || 0), 0);
  const totalCashPaid = entries.reduce((s, e) => s + (e.cash_paid || 0), 0);
  const totalDieselPaid = entries.reduce((s, e) => s + (e.diesel_paid || 0), 0);
  const cashJama = cashTxns.filter(t => t.txn_type === 'jama' && t.account === 'cash').reduce((s, t) => s + (t.amount || 0), 0);
  const cashNikasi = cashTxns.filter(t => t.txn_type === 'nikasi' && t.account === 'cash').reduce((s, t) => s + (t.amount || 0), 0);
  const bankJama = cashTxns.filter(t => t.txn_type === 'jama' && t.account === 'bank').reduce((s, t) => s + (t.amount || 0), 0);
  const bankNikasi = cashTxns.filter(t => t.txn_type === 'nikasi' && t.account === 'bank').reduce((s, t) => s + (t.amount || 0), 0);
  const mspAmount = msp.reduce((s, p) => s + (p.amount || 0), 0);
  const pvtPaid = pvtPayments.filter(p => p.ref_type === 'paddy_purchase').reduce((s, p) => s + (p.amount || 0), 0);
  const pvtReceived = pvtPayments.filter(p => p.ref_type === 'rice_sale').reduce((s, p) => s + (p.amount || 0), 0);

  const attMap = {};
  for (const a of staffAtt) attMap[a.staff_id] = a.status;
  let presentC = 0, absentC = 0, halfC = 0, holidayC = 0, notMarkedC = 0;
  const staffDetails = [];
  for (const s of allStaff) {
    const status = attMap[s.id] || 'not_marked';
    staffDetails.push({ name: s.name, status });
    if (status === 'present') presentC++;
    else if (status === 'absent') absentC++;
    else if (status === 'half_day') halfC++;
    else if (status === 'holiday') holidayC++;
    else notMarkedC++;
  }

  const entryDetails = entries.map(e => ({
    truck_no: e.truck_no||'', agent: e.agent_name||'', mandi: e.mandi_name||'',
    rst_no: e.rst_no||'', tp_no: e.tp_no||'', season: e.season||'',
    kg: e.kg||0, qntl: e.qntl||0, bags: e.bag||0,
    g_deposite: e.g_deposite||0, gbw_cut: e.gbw_cut||0,
    mill_w: e.mill_w||0, moisture: e.moisture||0, moisture_cut: e.moisture_cut||0,
    cutting_percent: e.cutting_percent||0, disc_dust_poll: e.disc_dust_poll||0,
    final_w: e.final_w||0, plastic_bag: e.plastic_bag||0, p_pkt_cut: e.p_pkt_cut||0,
    g_issued: e.g_issued||0, cash_paid: e.cash_paid||0, diesel_paid: e.diesel_paid||0
  }));

  return {
    date, mode: mode || 'normal',
    paddy_entries: {
      count: entries.length,
      total_mill_w: +(totalMillW).toFixed(2),
      total_bags: entries.reduce((s, e) => s + (e.bag || 0), 0),
      total_final_w: +(totalFinalW).toFixed(2),
      total_kg: entries.reduce((s, e) => s + (e.kg || 0), 0),
      total_g_deposite: entries.reduce((s, e) => s + (e.g_deposite || 0), 0),
      total_g_issued: entries.reduce((s, e) => s + (e.g_issued || 0), 0),
      total_cash_paid: +totalCashPaid.toFixed(2),
      total_diesel_paid: +totalDieselPaid.toFixed(2),
      details: entryDetails
    },
    pvt_paddy: {
      count: pvtPaddy.length,
      total_qntl: +pvtPaddy.reduce((s, e) => s + (e.qntl || 0), 0).toFixed(2),
      total_amount: pvtPaddy.reduce((s, e) => s + (e.total_amount || e.amount || 0), 0),
      details: pvtPaddy.map(p => ({ party: p.party_name||'', mandi: p.mandi_name||'', truck_no: p.truck_no||'', qntl: +(p.qntl||0).toFixed(2), rate: p.rate||0, amount: p.total_amount||p.amount||0, cash_paid: p.cash_paid||0, diesel_paid: p.diesel_paid||0 }))
    },
    rice_sales: {
      count: riceSales.length,
      total_qntl: +riceSales.reduce((s, e) => s + (e.quantity_qntl || e.qntl || 0), 0).toFixed(2),
      total_amount: riceSales.reduce((s, e) => s + (e.total_amount || e.amount || 0), 0),
      details: riceSales.map(r => ({ party: r.buyer_name||r.party_name||'', qntl: +(r.quantity_qntl||r.qntl||0).toFixed(2), type: r.rice_type||'', rate: r.rate||0, amount: r.total_amount||r.amount||0, vehicle: r.vehicle_no||'' }))
    },
    milling: {
      count: milling.length,
      paddy_input_qntl: +milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2),
      rice_output_qntl: +milling.reduce((s, e) => s + (e.rice_qntl || 0), 0).toFixed(2),
      frk_used_qntl: +milling.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2),
      details: isDetail ? milling.map(m => ({ paddy_in: m.paddy_input_qntl||0, rice_out: m.rice_qntl||0, type: m.rice_type||'', frk: m.frk_used_qntl||0, cmr_ready: m.cmr_ready||0, outturn: m.outturn||0 })) : []
    },
    dc_deliveries: {
      count: dcDeliveries.length,
      total_bags: dcDeliveries.reduce((s, e) => s + (e.bags || 0), 0),
      total_qntl: dcDeliveries.reduce((s, e) => s + (e.qntl || 0), 0),
      details: isDetail ? dcDeliveries.map(d => ({ dc_no: d.dc_no||'', godown: d.godown||d.destination||'', vehicle: d.vehicle_no||d.vehicle||'', bags: d.bags||0, qntl: d.qntl||0, type: d.rice_type||'' })) : []
    },
    cash_flow: {
      cash_jama: +cashJama.toFixed(2), cash_nikasi: +cashNikasi.toFixed(2),
      bank_jama: +bankJama.toFixed(2), bank_nikasi: +bankNikasi.toFixed(2),
      net_cash: +(cashJama - cashNikasi).toFixed(2), net_bank: +(bankJama - bankNikasi).toFixed(2),
      details: cashTxns.map(t => ({ desc: t.description||'', type: t.txn_type||'', account: t.account||'', category: t.category||'', amount: t.amount||0, party: t.party_name||'', description: t.description||'', payment_mode: (t.account||'cash').charAt(0).toUpperCase() + (t.account||'cash').slice(1) }))
    },
    payments: {
      msp_received: +mspAmount.toFixed(2), pvt_paddy_paid: +pvtPaid.toFixed(2), rice_sale_received: +pvtReceived.toFixed(2),
      msp_details: msp.map(p => ({ party: p.party_name||'', amount: p.amount||0, mode: p.payment_mode||'Cash' })),
      pvt_payment_details: pvtPayments.filter(p => p.ref_type === 'paddy_purchase').map(p => ({ party: p.party_name||'', amount: p.amount||0, mode: p.payment_mode||'Cash' })),
      rice_sale_details: pvtPayments.filter(p => p.ref_type === 'rice_sale').map(p => ({ party: p.party_name||p.buyer_name||'', amount: p.amount||0, mode: p.payment_mode||'Cash' }))
    },
    byproducts: {
      count: bpSales.length,
      total_amount: bpSales.reduce((s, e) => s + (e.amount || 0), 0),
      details: isDetail ? bpSales.map(b => ({ type: b.type||'', buyer: b.buyer_name||'', amount: b.amount||0 })) : []
    },
    frk: {
      count: frk.length,
      total_amount: frk.reduce((s, e) => s + (e.amount || 0), 0),
      total_qntl: frk.reduce((s, e) => s + (e.qntl || 0), 0),
      details: isDetail ? frk.map(f => ({ party: f.party_name||'', qntl: f.qntl||0, rate: f.rate||0, amount: f.amount||0 })) : []
    },
    mill_parts: {
      in_count: partsTxns.filter(t => t.txn_type === 'purchase' || t.txn_type === 'in').length,
      used_count: partsTxns.filter(t => t.txn_type === 'used' || t.txn_type === 'out').length,
      in_amount: partsTxns.filter(t => t.txn_type === 'purchase' || t.txn_type === 'in').reduce((s, t) => s + (t.amount || t.total_cost || 0), 0),
      in_details: isDetail ? partsTxns.filter(t => t.txn_type === 'purchase' || t.txn_type === 'in').map(t => ({ part: t.part_name||'', qty: t.quantity||0, rate: t.rate||0, party: t.party_name||'', bill_no: t.bill_no||'', amount: t.amount||t.total_cost||t.total_amount||0 })) : [],
      used_details: isDetail ? partsTxns.filter(t => t.txn_type === 'used' || t.txn_type === 'out').map(t => ({ part: t.part_name||'', qty: t.quantity||0, remark: t.remark||t.description||'' })) : []
    },
    pump_account: {
      total_diesel: +dieselTotalAmount.toFixed(2),
      total_paid: +dieselTotalPaid.toFixed(2),
      balance: +(dieselTotalAmount - dieselTotalPaid).toFixed(2),
      details: dieselTxns.map(t => ({
        pump: t.pump_name||'', txn_type: t.txn_type||'', amount: t.amount||0,
        truck_no: t.truck_no||'',
        mandi: t.mandi_name || entryMandiMap[t.linked_entry_id||''] || (t.description||'').split('Mandi ').pop() || '',
        desc: t.description||''
      }))
    },
    cash_transactions: {
      count: cashTxns.filter(t => t.account === 'cash').length,
      total_jama: +cashTxns.filter(t => t.txn_type === 'jama' && t.account === 'cash').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
      total_nikasi: +cashTxns.filter(t => t.txn_type === 'nikasi' && t.account === 'cash').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2),
      details: cashTxns.filter(t => t.account === 'cash').map(t => ({
        date: t.date || date,
        party_name: t.category || '',
        party_type: t.party_type || '',
        txn_type: t.txn_type || '',
        amount: Math.round((t.amount || 0) * 100) / 100,
        description: t.description || '',
        payment_mode: 'Cash'
      }))
    },
    staff_attendance: {
      total: allStaff.length, present: presentC, absent: absentC, half_day: halfC, holiday: holidayC, not_marked: notMarkedC,
      details: staffDetails
    },
    sale_vouchers: {
      count: saleVouchers.length,
      total_amount: Math.round(saleVouchers.reduce((s, sv) => s + (sv.total || sv.subtotal || 0), 0) * 100) / 100,
      details: saleVouchers.map(sv => ({
        voucher_no: sv.voucher_no || '', date: sv.date || '', party: sv.party_name || sv.buyer_name || '',
        items_count: (sv.items || []).length, amount: sv.total || sv.subtotal || 0
      }))
    },
    purchase_vouchers: {
      count: purchaseVouchers.length,
      total_amount: Math.round(purchaseVouchers.reduce((s, pv) => s + (pv.total || pv.subtotal || 0), 0) * 100) / 100,
      details: purchaseVouchers.map(pv => ({
        voucher_no: pv.voucher_no || '', date: pv.date || '', party: pv.party_name || pv.seller_name || '',
        items_count: (pv.items || []).length, amount: pv.total || pv.subtotal || 0
      }))
    }
  };
}

function generateDailyReportPdf(doc, data, query) {
  const isDetail = data.mode === 'detail';
  const modeLabel = isDetail ? 'DETAILED' : 'SUMMARY';
  const isTelegram = query.source === 'telegram';

  // Colors
  const C = {
    hdrBg: '#1a365d', hdrText: '#ffffff', border: '#cbd5e1',
    altRow: '#f8fafc', blueBg: '#e0f2fe', greenBg: '#dcfce7',
    yellowBg: '#fef3c7', purpleBg: '#e0e7ff', orangeBg: '#fff7ed',
    staffBg: '#dbeafe', section: '#1a365d', sub: '#475569'
  };

  // Draw a table with grid borders and colored headers
  function drawTable(headers, rows, colWidths, opts) {
    opts = opts || {};
    const fs = opts.fontSize || 7;
    const hdrBg = opts.headerBg || C.hdrBg;
    const hdrTextColor = opts.headerTextColor || C.hdrText;
    let y = doc.y;
    const rowH = fs + 8;
    const totalW = colWidths.reduce((a,b) => a+b, 0);
    const startX = Math.max(25, (doc.page.width - totalW) / 2);

    // Page check
    if (y + rowH * (rows.length + 1) + 20 > doc.page.height - 25) { doc.addPage(); y = 25; }

    // Header row
    let x = startX;
    doc.rect(x, y, totalW, rowH).fill(hdrBg);
    headers.forEach((h, i) => {
      doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
      doc.fillColor(hdrTextColor).font('Helvetica-Bold').fontSize(fs + 0.5)
        .text(String(h), x + 3, y + 3, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: opts.align || 'left' });
      x += colWidths[i];
    });
    y += rowH;

    // Data rows
    rows.forEach((row, ri) => {
      if (y + rowH > doc.page.height - 25) { doc.addPage(); y = 25; }
      x = startX;
      const bgColor = ri % 2 === 0 ? '#ffffff' : C.altRow;
      doc.rect(x, y, totalW, rowH).fill(bgColor);
      row.forEach((cell, ci) => {
        doc.rect(x, y, colWidths[ci], rowH).stroke(C.border);
        doc.fillColor('#1e293b').font('Helvetica').fontSize(fs)
          .text(String(cell ?? ''), x + 3, y + 3, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false });
        x += colWidths[ci];
      });
      y += rowH;
    });
    doc.y = y + 6;
    doc.x = 25;
  }

  // Summary box (colored background, 2 rows)
  function drawSummaryBox(labels, values, colWidths, bgColor) {
    const fs = 7; const rowH = 16;
    let y = doc.y;
    const totalW = colWidths.reduce((a,b) => a+b, 0);
    const startX = Math.max(25, (doc.page.width - totalW) / 2);
    if (y + rowH * 2 + 10 > doc.page.height - 25) { doc.addPage(); y = 25; }

    // Header
    let x = startX;
    doc.rect(x, y, totalW, rowH).fill(bgColor);
    labels.forEach((l, i) => {
      doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(fs + 0.5)
        .text(String(l), x + 3, y + 3, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
      x += colWidths[i];
    });
    y += rowH;

    // Values
    x = startX;
    doc.rect(x, y, totalW, rowH).fill('#ffffff');
    values.forEach((v, i) => {
      doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
      doc.fillColor('#1e293b').font('Helvetica').fontSize(fs)
        .text(String(v ?? ''), x + 3, y + 3, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
      x += colWidths[i];
    });
    doc.y = y + rowH + 2;
    doc.x = startX;
  }

  function sectionTitle(num, title) {
    if (doc.y > doc.page.height - 60) doc.addPage();
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(C.section).text(`${num}. ${title}`, { align: 'center' });
    doc.moveDown(0.15);
    doc.fillColor('black').font('Helvetica').fontSize(7);
  }

  function subText(text) {
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(C.sub).text(text);
    doc.moveDown(0.1);
    doc.fillColor('black').font('Helvetica').fontSize(7);
  }

  // ===== TITLE =====
  doc.fontSize(16).font('Helvetica-Bold').fillColor(C.section).text(`Detail Report - ${fmtDate(data.date)}`, { align: 'center' });
  doc.fontSize(8.5).font('Helvetica').fillColor('grey').text(`Mode: ${modeLabel} | KMS: ${query.kms_year || 'All'} | Season: ${query.season || 'All'}`, { align: 'center' });
  doc.moveDown(0.2);
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(25, doc.y).lineTo(doc.page.width - 25, doc.y).stroke();
  doc.moveDown(0.4);

  // ===== 1. PADDY ENTRIES =====
  const p = data.paddy_entries;
  sectionTitle(1, `Paddy Entries (${p.count})`);
  drawSummaryBox(
    ['Total Mill W (QNTL)', 'Total BAG', 'Final W QNTL (Auto)', 'Bag Deposite', 'Bag Issued'],
    [(p.total_mill_w/100).toFixed(2), p.total_bags, (p.total_final_w/100).toFixed(2), p.total_g_deposite||0, p.total_g_issued||0],
    [100, 90, 100, 80, 80], C.blueBg
  );
  drawSummaryBox(
    ['Total Cash Paid', 'Total Diesel Paid'],
    [`Rs.${fmtAmt(p.total_cash_paid)}`, `Rs.${fmtAmt(p.total_diesel_paid)}`],
    [250, 250], C.greenBg
  );

  if (p.details.length) {
    if (isTelegram) {
        // Simplified columns for Telegram (Truck, Agent, Mandi, RST, TP, QNTL, Bags, Mill W, Final W, Cash, Diesel)
        const simpleHeaders = ['Truck', 'Agent', 'Mandi', 'RST', 'TP', 'QNTL', 'Bags', 'Mill W', 'Final W', 'Cash', 'Diesel'];
        const simpleRows = p.details.map(d => [
            d.truck_no, d.agent, d.mandi, d.rst_no, d.tp_no,
            (d.kg/100).toFixed(2), d.bags, (d.mill_w/100).toFixed(2), (d.final_w/100).toFixed(2),
            d.cash_paid, d.diesel_paid
        ]);
        const simpleWidths = [60, 50, 60, 40, 40, 50, 40, 50, 50, 50, 50];
        drawTable(simpleHeaders, simpleRows, simpleWidths, { fontSize: 7 });
    } else {
        const colKey = isDetail ? 'detail_mode_columns' : 'summary_mode_columns';
        const dailyCols = getColumns('daily_paddy_entries_report', colKey);
        const pdfHdrs = getPdfHeaders(dailyCols);
        const pdfWidths = getPdfWidthsMm(dailyCols);
        drawTable(
          pdfHdrs,
          p.details.map(d => dailyCols.map(c => String(fmtVal(d[c.field], c.type)))),
          pdfWidths, { fontSize: isDetail ? 6 : 7 }
        );
    }
  }

  // ===== 2. MILLING =====
  const ml = data.milling;
  if (ml.count) {
    sectionTitle(2, `Milling (${ml.count})`);
    drawSummaryBox(
      ['Paddy In (Q)', 'Rice Out (Q)', 'FRK Used (Q)'],
      [ml.paddy_input_qntl, ml.rice_output_qntl, ml.frk_used_qntl],
      [170, 170, 170], C.yellowBg
    );
    if (isDetail && ml.details.length) {
      drawTable(
        ['Paddy In (Q)', 'Rice Out (Q)', 'Type', 'FRK (Q)', 'CMR Ready (Q)', 'Outturn%'],
        ml.details.map(d => [d.paddy_in, d.rice_out, d.type, d.frk, d.cmr_ready||0, d.outturn||0]),
        [75, 75, 70, 60, 75, 60]
      );
    }
  }

  // ===== 3. PRIVATE TRADING =====
  const pp = data.pvt_paddy;
  const rs = data.rice_sales;
  if (pp.count || rs.count) {
    sectionTitle(3, 'Private Trading');
    if (pp.count) {
      subText(`Paddy Purchase (${pp.count}): ${pp.total_kg} KG | Rs. ${fmtAmt(pp.total_amount)}`);
      if (pp.details.length) {
        drawTable(
          isDetail ? ['Party','Variety','KG','Rate','Amount'] : ['Party','KG','Amount'],
          pp.details.map(d => isDetail
            ? [d.party, d.type||'', d.kg, d.rate||0, `Rs.${fmtAmt(d.amount)}`]
            : [d.party, d.kg, `Rs.${fmtAmt(d.amount)}`]),
          isDetail ? [90,60,55,55,75] : [200,100,120]
        );
      }
    }
    if (rs.count) {
      subText(`Rice Sales (${rs.count}): ${rs.total_qntl} Q | Rs. ${fmtAmt(rs.total_amount)}`);
      if (rs.details.length) {
        drawTable(
          isDetail ? ['Buyer','Type','Qntl','Rate','Amount'] : ['Buyer','Qntl','Amount'],
          rs.details.map(d => isDetail
            ? [d.buyer, d.type||'', d.qntl, d.rate||0, `Rs.${fmtAmt(d.amount)}`]
            : [d.buyer, d.qntl, `Rs.${fmtAmt(d.amount)}`]),
          isDetail ? [90,60,55,55,75] : [200,100,120]
        );
      }
    }
  }

  // ===== 4. CASH FLOW =====
  const cf = data.cash_flow;
  sectionTitle(4, 'Cash Flow');
  drawSummaryBox(
    ['', 'Jama (In)', 'Nikasi (Out)', 'Net'],
    ['', '', '', ''],
    [80, 130, 130, 130], C.greenBg
  );
  // Overwrite with actual cash/bank rows
  doc.y -= 2;
  drawTable(
    ['','Jama (In)','Nikasi (Out)','Net'],
    [
      ['Cash', `Rs.${fmtAmt(cf.cash_jama)}`, `Rs.${fmtAmt(cf.cash_nikasi)}`, `Rs.${fmtAmt(cf.net_cash)}`],
      ['Bank', `Rs.${fmtAmt(cf.bank_jama)}`, `Rs.${fmtAmt(cf.bank_nikasi)}`, `Rs.${fmtAmt(cf.net_bank)}`]
    ],
    [80, 130, 130, 130], { headerBg: C.greenBg, headerTextColor: '#1e293b' }
  );

  if (cf.details.length) {
    const cfH = isDetail ? ['Description','Party','Category','Type','Account','Amount'] : ['Description','Type','Account','Amount'];
    const cfR = cf.details.map(d => isDetail
      ? [d.desc, d.party, d.category, (d.type||'').toUpperCase(), (d.account||'').toUpperCase(), `Rs.${fmtAmt(d.amount)}`]
      : [d.desc, (d.type||'').toUpperCase(), (d.account||'').toUpperCase(), `Rs.${fmtAmt(d.amount)}`]);
    const cfW = isDetail ? [200,80,80,55,55,80] : [330,80,80,100];
    drawTable(cfH, cfR, cfW);
  }

  // ===== 5. PAYMENTS =====
  sectionTitle(5, 'Payments Summary');
  drawSummaryBox(
    ['MSP Received', 'Pvt Paddy Paid', 'Rice Sale Received'],
    [`Rs.${fmtAmt(data.payments.msp_received)}`, `Rs.${fmtAmt(data.payments.pvt_paddy_paid)}`, `Rs.${fmtAmt(data.payments.rice_sale_received)}`],
    [170, 170, 170], C.purpleBg
  );

  // ===== 6. PUMP ACCOUNT =====
  const pa = data.pump_account;
  if (pa.details.length) {
    sectionTitle(6, 'Pump Account / Diesel');
    drawSummaryBox(
      ['Total Diesel', 'Total Paid', 'Balance'],
      [`Rs.${fmtAmt(pa.total_diesel)}`, `Rs.${fmtAmt(pa.total_paid)}`, `Rs.${fmtAmt(pa.balance)}`],
      [170, 170, 170], C.orangeBg
    );
    drawTable(
      ['Pump','Type','Truck','Mandi','Description','Amount'],
      pa.details.map(d => [d.pump, d.txn_type === 'payment' || d.txn_type === 'credit' ? 'PAID' : 'DIESEL', d.truck_no, d.mandi, d.desc, `Rs.${fmtAmt(d.amount)}`]),
      [90, 60, 90, 90, 300, 90]
    );
  }

  // ===== 7. CASH TRANSACTIONS =====
  const ctxn = data.cash_transactions;
  if (ctxn && ctxn.count > 0) {
    sectionTitle(7, `Cash Transactions (${ctxn.count})`);
    drawSummaryBox(
      ['Total Jama', 'Total Nikasi', 'Balance'],
      [`Rs.${fmtAmt(ctxn.total_jama)}`, `Rs.${fmtAmt(ctxn.total_nikasi)}`, `Rs.${fmtAmt(ctxn.total_jama - ctxn.total_nikasi)}`],
      [170, 170, 170], C.yellowBg || C.orangeBg
    );
    if (ctxn.details && ctxn.details.length) {
      const ctH = isDetail ? ['Date','Party Name','Type','Amount (Rs.)','Description'] : ['Date','Party Name','Type','Amount (Rs.)'];
      const ctR = ctxn.details.map(d => {
        const row = [d.date||'', d.party_name||'', d.txn_type === 'jama' ? 'JAMA' : 'NIKASI', `Rs.${fmtAmt(d.amount)}`];
        if (isDetail) row.push(d.description||'');
        return row;
      });
      const ctW = isDetail ? [60,150,55,80,250] : [80,280,80,150];
      drawTable(ctH, ctR, ctW);
    }
  }

  // ===== 8. DC DELIVERIES =====
  const dc = data.dc_deliveries;
  if (dc.count) {
    sectionTitle(8, `DC Deliveries (${dc.count}) - ${dc.total_qntl} Q`);
    if (isDetail && dc.details.length) {
      drawTable(
        ['DC No','Type','Bags','Qntl','Destination'],
        dc.details.map(d => [d.dc_no, d.type, d.bags, d.qntl, d.destination]),
        [80, 100, 80, 80, 100]
      );
    }
  }

  // ===== 9. BY-PRODUCTS =====
  const bp = data.byproducts;
  if (bp.count) {
    sectionTitle(9, `By-Product Sales (${bp.count}) - Rs. ${fmtAmt(bp.total_amount)}`);
    if (isDetail && bp.details.length) {
      drawTable(
        ['Type','Buyer','Amount'],
        bp.details.map(d => [d.type, d.buyer, `Rs.${fmtAmt(d.amount)}`]),
        [120, 150, 100]
      );
    }
  }

  // ===== 10. FRK =====
  const fk = data.frk;
  if (fk.count) {
    sectionTitle(10, `FRK Purchase (${fk.count}) - ${fk.total_qntl} Q | Rs. ${fmtAmt(fk.total_amount)}`);
    if (isDetail && fk.details.length) {
      drawTable(
        ['Party','Qntl','Rate','Amount'],
        fk.details.map(d => [d.party, d.qntl, d.rate, `Rs.${fmtAmt(d.amount)}`]),
        [150, 90, 90, 100]
      );
    }
  }

  // ===== 11. MILL PARTS =====
  const mp = data.mill_parts;
  if (mp.in_count || mp.used_count) {
    sectionTitle(11, `Mill Parts Stock (In: ${mp.in_count} | Used: ${mp.used_count}) | Purchase: Rs. ${fmtAmt(mp.in_amount)}`);
    if (mp.in_details.length) {
      subText('Parts Purchased:');
      drawTable(
        ['Part','Qty','Rate','Party','Bill No','Amount'],
        mp.in_details.map(d => [d.part, d.qty, d.rate||0, d.party||'', d.bill_no||'', `Rs.${fmtAmt(d.amount)}`]),
        [80, 45, 55, 80, 60, 70]
      );
    }
    if (mp.used_details.length) {
      subText('Parts Used:');
      drawTable(
        ['Part','Qty'],
        mp.used_details.map(d => [d.part, d.qty]),
        [200, 100]
      );
    }
  }

  // ===== 12. STAFF ATTENDANCE =====
  const sa = data.staff_attendance;
  if (sa.total) {
    sectionTitle(12, `Staff Attendance (${sa.total})`);
    drawSummaryBox(
      ['Present','Half Day','Holiday','Absent','Not Marked'],
      [sa.present, sa.half_day, sa.holiday, sa.absent, sa.not_marked],
      [95, 95, 95, 95, 95], C.staffBg
    );
    if (sa.details.length) {
      const statusMap = { present: 'P', absent: 'A', half_day: 'H', holiday: 'CH', not_marked: '-' };
      drawTable(['Staff Name','Status'],
        sa.details.map(d => [d.name, statusMap[d.status] || d.status]),
        [250, 100]);
    }
  }
}

module.exports = { getDailyReportData, generateDailyReportPdf };
