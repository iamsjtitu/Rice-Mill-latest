const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

function col(name) {
  if (!database.data[name]) database.data[name] = [];
  return database.data[name];
}

function fmtAmt(val) { return val === 0 ? '0' : val.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

function getDailyReportData(query) {
  const { date, kms_year, season, mode } = query;
  const isDetail = mode === 'detail';
  const qDate = { date };

  // Filter by FY
  function filterFy(arr) {
    let r = arr.filter(e => e.date === date);
    if (kms_year) r = r.filter(e => e.kms_year === kms_year);
    if (season) r = r.filter(e => e.season === season);
    return r;
  }
  function filterFyOnly(arr) {
    let r = [...arr];
    if (kms_year) r = r.filter(e => e.kms_year === kms_year);
    if (season) r = r.filter(e => e.season === season);
    return r.filter(e => e.date === date);
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
  const allStaff = col('staff').filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name));

  const totalPaddyKg = entries.reduce((s, e) => s + (e.kg || 0), 0);
  const totalPaddyBags = entries.reduce((s, e) => s + (e.bag || 0), 0);
  const totalFinalW = entries.reduce((s, e) => s + (e.final_w || 0), 0);
  const pvtPaddyKg = pvtPaddy.reduce((s, e) => s + (e.kg || 0), 0);
  const pvtPaddyAmt = pvtPaddy.reduce((s, e) => s + (e.total_amount || 0), 0);
  const riceSaleQntl = riceSales.reduce((s, e) => s + (e.quantity_qntl || 0), 0);
  const riceSaleAmt = riceSales.reduce((s, e) => s + (e.total_amount || 0), 0);
  const millingPaddyIn = milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0);
  const millingRiceOut = milling.reduce((s, e) => s + (e.rice_qntl || 0), 0);
  const millingFrkUsed = milling.reduce((s, e) => s + (e.frk_used_qntl || 0), 0);
  const dcDeliveryQntl = dcDeliveries.reduce((s, d) => s + (d.quantity_qntl || 0), 0);
  const cashJama = cashTxns.filter(t => t.txn_type === 'jama' && t.account === 'cash').reduce((s, t) => s + (t.amount || 0), 0);
  const cashNikasi = cashTxns.filter(t => t.txn_type === 'nikasi' && t.account === 'cash').reduce((s, t) => s + (t.amount || 0), 0);
  const bankJama = cashTxns.filter(t => t.txn_type === 'jama' && t.account === 'bank').reduce((s, t) => s + (t.amount || 0), 0);
  const bankNikasi = cashTxns.filter(t => t.txn_type === 'nikasi' && t.account === 'bank').reduce((s, t) => s + (t.amount || 0), 0);
  const mspAmount = msp.reduce((s, p) => s + (p.amount || 0), 0);
  const pvtPaid = pvtPayments.filter(p => p.ref_type === 'paddy_purchase').reduce((s, p) => s + (p.amount || 0), 0);
  const pvtReceived = pvtPayments.filter(p => p.ref_type === 'rice_sale').reduce((s, p) => s + (p.amount || 0), 0);
  const bpAmount = bpSales.reduce((s, e) => s + (e.total_amount || 0), 0);
  const frkQntl = frk.reduce((s, f) => s + (f.quantity_qntl || 0), 0);
  const frkAmount = frk.reduce((s, f) => s + (f.total_amount || 0), 0);
  const partsIn = partsTxns.filter(t => t.txn_type === 'in');
  const partsUsed = partsTxns.filter(t => t.txn_type === 'used');
  const partsInAmt = partsIn.reduce((s, t) => s + (t.total_amount || 0), 0);

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

  return {
    date, mode: mode || 'normal',
    paddy_entries: {
      count: entries.length, total_kg: +totalPaddyKg.toFixed(2), total_bags: totalPaddyBags, total_final_w: +totalFinalW.toFixed(2),
      total_mill_w: +entries.reduce((s, e) => s + (e.mill_w || 0), 0).toFixed(2),
      details: entries.map(e => isDetail
        ? { truck_no: e.truck_no||'', agent: e.agent_name||'', mandi: e.mandi_name||'', rst_no: e.rst_no||'',
            tp_no: e.tp_no||'', season: e.season||'',
            kg: e.kg||0, qntl: e.qntl||0, bags: e.bag||0,
            g_deposite: e.g_deposite||0, gbw_cut: e.gbw_cut||0,
            mill_w: e.mill_w||0, moisture: e.moisture||0,
            cutting_percent: e.cutting_percent||0, disc_dust_poll: e.disc_dust_poll||0,
            final_w: e.final_w||0,
            plastic_bag: e.plastic_bag||0, p_pkt_cut: e.p_pkt_cut||0,
            g_issued: e.g_issued||0, cash_paid: e.cash_paid||0, diesel_paid: e.diesel_paid||0 }
        : { truck_no: e.truck_no||'', agent: e.agent_name||'', kg: e.kg||0, final_w: e.final_w||0 })
    },
    pvt_paddy: {
      count: pvtPaddy.length, total_kg: +pvtPaddyKg.toFixed(2), total_amount: +pvtPaddyAmt.toFixed(2),
      details: pvtPaddy.map(p => isDetail
        ? { party: p.party_name||'', variety: p.variety||'', kg: p.kg||0, rate: p.rate||0, amount: p.total_amount||0, vehicle: p.vehicle_no||'' }
        : { party: p.party_name||'', kg: p.kg||0, amount: p.total_amount||0 })
    },
    rice_sales: {
      count: riceSales.length, total_qntl: +riceSaleQntl.toFixed(2), total_amount: +riceSaleAmt.toFixed(2),
      details: riceSales.map(s => isDetail
        ? { party: s.party_name||'', qntl: s.quantity_qntl||0, type: s.rice_type||'', rate: s.rate||0, amount: s.total_amount||0, vehicle: s.vehicle_no||'' }
        : { party: s.party_name||'', qntl: s.quantity_qntl||0, type: s.rice_type||'', amount: s.total_amount||0 })
    },
    milling: {
      count: milling.length, paddy_input_qntl: +millingPaddyIn.toFixed(2), rice_output_qntl: +millingRiceOut.toFixed(2), frk_used_qntl: +millingFrkUsed.toFixed(2),
      details: milling.map(m => isDetail
        ? { paddy_in: m.paddy_input_qntl||0, rice_out: m.rice_qntl||0, type: m.rice_type||'', frk: m.frk_used_qntl||0, cmr_ready: m.cmr_delivery_qntl||0, outturn: m.outturn_ratio||0 }
        : { paddy_in: m.paddy_input_qntl||0, rice_out: m.rice_qntl||0, type: m.rice_type||'' })
    },
    dc_deliveries: {
      count: dcDeliveries.length, total_qntl: +dcDeliveryQntl.toFixed(2),
      details: isDetail ? dcDeliveries.map(d => ({ dc_no: d.dc_no||'', godown: d.godown||'', vehicle: d.vehicle_no||'', qntl: d.quantity_qntl||0, bags: d.bags||0 })) : []
    },
    cash_flow: {
      cash_jama: +cashJama.toFixed(2), cash_nikasi: +cashNikasi.toFixed(2),
      bank_jama: +bankJama.toFixed(2), bank_nikasi: +bankNikasi.toFixed(2),
      net_cash: +(cashJama - cashNikasi).toFixed(2), net_bank: +(bankJama - bankNikasi).toFixed(2),
      details: cashTxns.map(t => ({ desc: t.description||'', type: t.txn_type||'', account: t.account||'', category: t.category||'', amount: t.amount||0, party: t.party_name||'' }))
    },
    payments: {
      msp_received: +mspAmount.toFixed(2), pvt_paddy_paid: +pvtPaid.toFixed(2), rice_sale_received: +pvtReceived.toFixed(2),
      msp_details: isDetail ? msp.map(p => ({ agent: p.agent_name||'', amount: p.amount||0, mandi: p.mandi_name||'' })) : [],
      pvt_payment_details: isDetail ? pvtPayments.map(p => ({ party: p.party_name||'', amount: p.amount||0, ref_type: p.ref_type||'', mode: p.payment_mode||'' })) : []
    },
    byproducts: {
      count: bpSales.length, total_amount: +bpAmount.toFixed(2),
      details: isDetail ? bpSales.map(s => ({ type: s.type||'', buyer: s.buyer_name||'', qty: s.quantity||0, rate: s.rate||0, amount: s.total_amount||0 })) : []
    },
    frk: {
      count: frk.length, total_qntl: +frkQntl.toFixed(2), total_amount: +frkAmount.toFixed(2),
      details: isDetail ? frk.map(f => ({ party: f.party_name||'', qntl: f.quantity_qntl||0, rate: f.rate||0, amount: f.total_amount||0 })) : []
    },
    mill_parts: {
      in_count: partsIn.length, used_count: partsUsed.length, in_amount: +partsInAmt.toFixed(2),
      in_details: partsIn.map(t => ({ part: t.part_name||'', qty: t.quantity||0, rate: t.rate||0, party: t.party_name||'', bill_no: t.bill_no||'', amount: t.total_amount||0 })),
      used_details: partsUsed.map(t => ({ part: t.part_name||'', qty: t.quantity||0, remark: t.remark||'' }))
    },
    staff_attendance: {
      total: allStaff.length, present: presentC, absent: absentC, half_day: halfC, holiday: holidayC, not_marked: notMarkedC,
      details: staffDetails
    }
  };
}

router.get('/api/reports/daily', safeSync((req, res) => {
  res.json(getDailyReportData(req.query));
}));

// ============ DAILY REPORT PDF ============
router.get('/api/reports/daily/pdf', safeSync((req, res) => {
  const PDFDocument = require('pdfkit');
  const data = getDailyReportData(req.query);
  const isDetail = data.mode === 'detail';
  const modeLabel = isDetail ? 'DETAILED' : 'SUMMARY';

  const doc = new PDFDocument({ size: 'A4', margin: 25 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=daily_report_${data.mode}_${data.date}.pdf`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a365d').text(`Daily Report - ${data.date}`, { align: 'center' });
  doc.fontSize(8).font('Helvetica').fillColor('grey').text(`Mode: ${modeLabel} | KMS: ${req.query.kms_year || 'All'} | Season: ${req.query.season || 'All'}`, { align: 'center' });
  doc.moveDown(0.5);

  function section(num, title) { doc.moveDown(0.3); doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a365d').text(`${num}. ${title}`); doc.font('Helvetica').fillColor('black').fontSize(8); }
  function kvLine(label, val) { doc.text(`  ${label}: ${val}`); }

  // 1. Paddy
  const p = data.paddy_entries;
  section(1, `Paddy Entries (${p.count})`);
  kvLine('Total KG', p.total_kg); kvLine('Bags', p.total_bags); kvLine('Final W', p.total_final_w);

  // 2. Milling
  const ml = data.milling;
  if (ml.count) { section(2, `Milling (${ml.count})`); kvLine('Paddy In', `${ml.paddy_input_qntl} Q`); kvLine('Rice Out', `${ml.rice_output_qntl} Q`); kvLine('FRK Used', `${ml.frk_used_qntl} Q`); }

  // 3. Private Trading
  const pp = data.pvt_paddy; const rs = data.rice_sales;
  if (pp.count || rs.count) {
    section(3, 'Private Trading');
    if (pp.count) kvLine('Paddy Purchase', `${pp.total_kg} KG | Rs. ${fmtAmt(pp.total_amount)}`);
    if (rs.count) kvLine('Rice Sales', `${rs.total_qntl} Q | Rs. ${fmtAmt(rs.total_amount)}`);
  }

  // 4. Cash Flow
  const cf = data.cash_flow;
  section(4, 'Cash Flow');
  kvLine('Cash', `Jama: Rs.${fmtAmt(cf.cash_jama)} | Nikasi: Rs.${fmtAmt(cf.cash_nikasi)} | Net: Rs.${fmtAmt(cf.net_cash)}`);
  kvLine('Bank', `Jama: Rs.${fmtAmt(cf.bank_jama)} | Nikasi: Rs.${fmtAmt(cf.bank_nikasi)} | Net: Rs.${fmtAmt(cf.net_bank)}`);

  // 5. Payments
  const pay = data.payments;
  section(5, 'Payments');
  kvLine('MSP Received', `Rs. ${fmtAmt(pay.msp_received)}`);
  kvLine('Pvt Paddy Paid', `Rs. ${fmtAmt(pay.pvt_paddy_paid)}`);
  kvLine('Rice Sale Received', `Rs. ${fmtAmt(pay.rice_sale_received)}`);

  // 6. DC Deliveries
  const dc = data.dc_deliveries;
  if (dc.count) { section(6, `DC Deliveries (${dc.count})`); kvLine('Total', `${dc.total_qntl} Q`); }

  // 7. By-Products & FRK
  const bp = data.byproducts; const fk = data.frk;
  if (bp.count || fk.count) {
    section(7, 'Others');
    if (bp.count) kvLine('By-Products', `Rs. ${fmtAmt(bp.total_amount)}`);
    if (fk.count) kvLine('FRK Purchase', `${fk.total_qntl} Q | Rs. ${fmtAmt(fk.total_amount)}`);
  }

  // 8. Mill Parts
  const mp = data.mill_parts;
  if (mp.in_count || mp.used_count) {
    section(8, `Mill Parts (In:${mp.in_count} Used:${mp.used_count})`);
    kvLine('Purchase Amount', `Rs. ${fmtAmt(mp.in_amount)}`);
  }

  // 9. Staff Attendance
  const sa = data.staff_attendance;
  if (sa.total) {
    section(9, `Staff Attendance (${sa.total})`);
    kvLine('Present', sa.present); kvLine('Half Day', sa.half_day); kvLine('Holiday', sa.holiday); kvLine('Absent', sa.absent); kvLine('Not Marked', sa.not_marked);
    const statusMap = { present: 'P', absent: 'A', half_day: 'H', holiday: 'CH', not_marked: '-' };
    for (const d of sa.details) { doc.text(`    ${d.name}: ${statusMap[d.status] || d.status}`); }
  }

  doc.end();
}));

// ============ DAILY REPORT EXCEL ============
router.get('/api/reports/daily/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  const data = getDailyReportData(req.query);
  const isDetail = data.mode === 'detail';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Daily Report ${data.date}`);
  const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
  const hdrFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `Daily Report - ${data.date} (${isDetail ? 'DETAILED' : 'SUMMARY'})`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1a365d' } };
  let row = 3;

  function writeSection(title) { ws.getCell(`A${row}`).value = title; ws.getCell(`A${row}`).font = { bold: true, size: 11, color: { argb: 'FF1a365d' } }; row++; }
  function writeHeaders(hdrs) { hdrs.forEach((h, i) => { const c = ws.getCell(row, i + 1); c.value = h; c.fill = hdrFill; c.font = hdrFont; }); row++; }
  function writeRow(vals) { vals.forEach((v, i) => { ws.getCell(row, i + 1).value = v; }); row++; }

  // Paddy
  writeSection(`1. Paddy Entries (${data.paddy_entries.count})`);
  ws.getCell(`A${row}`).value = `Total KG: ${data.paddy_entries.total_kg} | Bags: ${data.paddy_entries.total_bags} | Final: ${data.paddy_entries.total_final_w}`;
  ws.getCell(`A${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } }; row++;
  if (data.paddy_entries.details.length) {
    if (isDetail) { writeHeaders(['Truck','Agent','Mandi','RST','KG','Bags','Moisture','Mill W','Final W']); data.paddy_entries.details.forEach(d => writeRow([d.truck_no,d.agent,d.mandi,d.rst_no,d.kg,d.bags,d.moisture,d.mill_w,d.final_w])); }
    else { writeHeaders(['Truck','Agent','KG','Final W']); data.paddy_entries.details.forEach(d => writeRow([d.truck_no,d.agent,d.kg,d.final_w])); }
  }
  row++;

  // Milling
  if (data.milling.count) {
    writeSection(`2. Milling (${data.milling.count})`);
    ws.getCell(`A${row}`).value = `Paddy In: ${data.milling.paddy_input_qntl}Q | Rice Out: ${data.milling.rice_output_qntl}Q | FRK: ${data.milling.frk_used_qntl}Q`;
    ws.getCell(`A${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } }; row++;
    row++;
  }

  // Cash Flow
  writeSection('3. Cash Flow');
  writeHeaders(['', 'Jama', 'Nikasi', 'Net']);
  writeRow(['Cash', data.cash_flow.cash_jama, data.cash_flow.cash_nikasi, data.cash_flow.net_cash]);
  writeRow(['Bank', data.cash_flow.bank_jama, data.cash_flow.bank_nikasi, data.cash_flow.net_bank]);
  row++;

  // Staff Attendance
  const sa = data.staff_attendance;
  if (sa.total) {
    writeSection(`4. Staff Attendance (${sa.total})`);
    writeHeaders(['Present','Half Day','Holiday','Absent','Not Marked']);
    writeRow([sa.present, sa.half_day, sa.holiday, sa.absent, sa.not_marked]);
    if (sa.details.length) {
      row++;
      const statusMap = { present: 'P', absent: 'A', half_day: 'H', holiday: 'CH', not_marked: '-' };
      writeHeaders(['Staff Name', 'Status']);
      sa.details.forEach(d => writeRow([d.name, statusMap[d.status] || d.status]));
    }
  }

  for (let i = 1; i <= 10; i++) ws.getColumn(i).width = 16;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=daily_report_${data.mode}_${data.date}.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

  return router;
};
