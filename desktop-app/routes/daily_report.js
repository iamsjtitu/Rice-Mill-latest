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
  const dieselTotalAmount = dieselTxns.filter(t => t.txn_type === 'diesel' || t.txn_type === 'debit').reduce((s, t) => s + (t.amount || 0), 0);
  const dieselTotalPaid = dieselTxns.filter(t => t.txn_type === 'payment' || t.txn_type === 'credit').reduce((s, t) => s + (t.amount || 0), 0);

  // Build entry_id -> mandi_name map for diesel mandi lookup
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

  // All entries return ALL fields regardless of mode
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
      total_g_deposite: entries.reduce((s, e) => s + (e.g_deposite || 0), 0),
      total_g_issued: entries.reduce((s, e) => s + (e.g_issued || 0), 0),
      total_cash_paid: +totalCashPaid.toFixed(2),
      total_diesel_paid: +totalDieselPaid.toFixed(2),
      details: entryDetails
    },
    milling: {
      count: milling.length,
      paddy_input_qntl: +milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2),
      rice_output_qntl: +milling.reduce((s, e) => s + (e.rice_qntl || 0), 0).toFixed(2),
      frk_used_qntl: +milling.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2),
      details: isDetail ? milling.map(m => ({ paddy_in: m.paddy_input_qntl||0, rice_out: m.rice_qntl||0, type: m.rice_type||'', frk: m.frk_used_qntl||0 })) : []
    },
    cash_flow: {
      cash_jama: +cashJama.toFixed(2), cash_nikasi: +cashNikasi.toFixed(2),
      bank_jama: +bankJama.toFixed(2), bank_nikasi: +bankNikasi.toFixed(2),
      net_cash: +(cashJama - cashNikasi).toFixed(2), net_bank: +(bankJama - bankNikasi).toFixed(2),
      details: cashTxns.map(t => ({ desc: t.description||'', type: t.txn_type||'', account: t.account||'', category: t.category||'', amount: t.amount||0, party: t.party_name||'' }))
    },
    payments: {
      msp_received: +mspAmount.toFixed(2), pvt_paddy_paid: +pvtPaid.toFixed(2), rice_sale_received: +pvtReceived.toFixed(2),
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

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=daily_report_${data.mode}_${data.date}.pdf`);
  doc.pipe(res);

  // Title
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a365d').text(`Daily Report - ${data.date}`, { align: 'center' });
  doc.fontSize(8).font('Helvetica').fillColor('grey').text(`Mode: ${modeLabel} | KMS: ${req.query.kms_year || 'All'} | Season: ${req.query.season || 'All'}`, { align: 'center' });
  doc.moveDown(0.4);

  // Table helper
  function drawTable(headers, rows, colWidths, fontSize) {
    const fs = fontSize || 7;
    const startX = doc.x;
    let y = doc.y;
    const rowH = fs + 6;

    // Check page space
    if (y + rowH * (rows.length + 1) + 20 > doc.page.height - 25) { doc.addPage(); y = doc.y; }

    // Header
    let x = startX;
    doc.rect(x, y, colWidths.reduce((a,b)=>a+b,0), rowH).fill('#1a365d');
    headers.forEach((h, i) => {
      doc.fillColor('white').font('Helvetica-Bold').fontSize(fs).text(h, x + 2, y + 2, { width: colWidths[i] - 4, height: rowH, lineBreak: false });
      x += colWidths[i];
    });
    y += rowH;

    // Data rows
    rows.forEach((row, ri) => {
      if (y + rowH > doc.page.height - 25) { doc.addPage(); y = doc.y; }
      x = startX;
      if (ri % 2 === 0) doc.rect(x, y, colWidths.reduce((a,b)=>a+b,0), rowH).fill('#f8fafc');
      row.forEach((cell, ci) => {
        doc.fillColor('black').font('Helvetica').fontSize(fs).text(String(cell ?? ''), x + 2, y + 2, { width: colWidths[ci] - 4, height: rowH, lineBreak: false });
        x += colWidths[ci];
      });
      y += rowH;
    });
    doc.y = y + 4;
    doc.x = startX;
  }

  function sectionTitle(num, title) {
    if (doc.y > doc.page.height - 60) doc.addPage();
    doc.moveDown(0.2);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a365d').text(`${num}. ${title}`);
    doc.fillColor('black').font('Helvetica').fontSize(7);
  }

  function summaryLine(text) {
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#475569').text(text);
    doc.fillColor('black').font('Helvetica');
  }

  // 1. Paddy Entries
  const p = data.paddy_entries;
  sectionTitle(1, `Paddy Entries (${p.count})`);
  summaryLine(`Total Mill W (QNTL): ${(p.total_mill_w/100).toFixed(2)} | Total BAG: ${p.total_bags} | Final W QNTL: ${(p.total_final_w/100).toFixed(2)}`);
  summaryLine(`Total Cash Paid: Rs.${fmtAmt(p.total_cash_paid)} | Total Diesel Paid: Rs.${fmtAmt(p.total_diesel_paid)}`);

  if (p.details.length) {
    if (isDetail) {
      drawTable(
        ['Truck','Agent','Mandi','RST','TP','QNTL','Bags','G.Dep','GBW','P.Pkt','P.Cut','Mill W','M%','M.Cut','C%','D/D/P','Final W','G.Iss','Cash','Diesel'],
        p.details.map(d => [
          d.truck_no, d.agent, d.mandi, d.rst_no, d.tp_no,
          (d.kg/100).toFixed(2), d.bags, d.g_deposite, (d.gbw_cut/100).toFixed(2),
          d.plastic_bag, (d.p_pkt_cut/100).toFixed(2), (d.mill_w/100).toFixed(2),
          d.moisture, ((d.moisture_cut||0)/100).toFixed(2), `${d.cutting_percent}%`, d.disc_dust_poll,
          (d.final_w/100).toFixed(2), d.g_issued, d.cash_paid, d.diesel_paid
        ]),
        [42,35,38,24,24,30,24,24,28,24,26,30,22,26,24,24,30,24,30,30], 6
      );
    } else {
      drawTable(
        ['Truck','Mandi','Agent','QNTL','Bags','Mill W','Final W','Cash','Diesel'],
        p.details.map(d => [
          d.truck_no, d.mandi, d.agent,
          (d.kg/100).toFixed(2), d.bags, (d.mill_w/100).toFixed(2),
          (d.final_w/100).toFixed(2), d.cash_paid, d.diesel_paid
        ]),
        [65,60,55,50,40,55,55,55,55]
      );
    }
  }

  // 4. Cash Flow
  const cf = data.cash_flow;
  sectionTitle(4, 'Cash Flow');
  drawTable(
    ['','Jama (In)','Nikasi (Out)','Net'],
    [
      ['Cash', `Rs.${fmtAmt(cf.cash_jama)}`, `Rs.${fmtAmt(cf.cash_nikasi)}`, `Rs.${fmtAmt(cf.net_cash)}`],
      ['Bank', `Rs.${fmtAmt(cf.bank_jama)}`, `Rs.${fmtAmt(cf.bank_nikasi)}`, `Rs.${fmtAmt(cf.net_bank)}`]
    ],
    [80, 100, 100, 100]
  );

  if (cf.details.length) {
    const cfHeaders = isDetail ? ['Description','Party','Category','Type','Account','Amount'] : ['Description','Type','Account','Amount'];
    const cfRows = cf.details.map(d => isDetail
      ? [d.desc, d.party, d.category, d.type.toUpperCase(), d.account.toUpperCase(), `Rs.${fmtAmt(d.amount)}`]
      : [d.desc, d.type.toUpperCase(), d.account.toUpperCase(), `Rs.${fmtAmt(d.amount)}`]);
    const cfWidths = isDetail ? [180,60,60,50,50,60] : [230,60,60,70];
    drawTable(cfHeaders, cfRows, cfWidths);
  }

  // 5. Payments
  sectionTitle(5, 'Payments Summary');
  drawTable(['MSP Received','Pvt Paddy Paid','Rice Sale Received'],
    [[`Rs.${fmtAmt(data.payments.msp_received)}`,`Rs.${fmtAmt(data.payments.pvt_paddy_paid)}`,`Rs.${fmtAmt(data.payments.rice_sale_received)}`]],
    [120,120,120]);

  // 6. Pump Account
  const pa = data.pump_account;
  sectionTitle(6, 'Pump Account / Diesel');
  summaryLine(`Total Diesel: Rs.${fmtAmt(pa.total_diesel)} | Total Paid: Rs.${fmtAmt(pa.total_paid)} | Balance: Rs.${fmtAmt(pa.balance)}`);
  if (pa.details.length) {
    drawTable(
      ['Pump','Type','Truck','Mandi','Description','Amount'],
      pa.details.map(d => [d.pump, d.txn_type === 'payment' || d.txn_type === 'credit' ? 'PAID' : 'DIESEL', d.truck_no, d.mandi, d.desc, `Rs.${fmtAmt(d.amount)}`]),
      [60,40,60,60,170,60]
    );
  }

  // 11. Staff Attendance
  const sa = data.staff_attendance;
  if (sa.total) {
    sectionTitle(11, `Staff Attendance (${sa.total})`);
    drawTable(['Present','Half Day','Holiday','Absent','Not Marked'],
      [[sa.present, sa.half_day, sa.holiday, sa.absent, sa.not_marked]],
      [60,60,60,60,60]);
    const statusMap = { present: 'P', absent: 'A', half_day: 'H', holiday: 'CH', not_marked: '-' };
    drawTable(['Staff Name','Status'],
      sa.details.map(d => [d.name, statusMap[d.status] || d.status]),
      [120, 60]);
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
  const subFont = { bold: true, size: 9, color: { argb: 'FF475569' } };

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `Daily Report - ${data.date} (${isDetail ? 'DETAILED' : 'SUMMARY'})`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1a365d' } };
  ws.getCell('A2').value = `KMS Year: ${req.query.kms_year || 'All'} | Season: ${req.query.season || 'All'}`;
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  let row = 4;

  function writeSection(title) { ws.getCell(`A${row}`).value = title; ws.getCell(`A${row}`).font = { bold: true, size: 11, color: { argb: 'FF1a365d' } }; row++; }
  function writeHeaders(hdrs) { hdrs.forEach((h, i) => { const c = ws.getCell(row, i + 1); c.value = h; c.fill = hdrFill; c.font = hdrFont; }); row++; }
  function writeRow(vals) { vals.forEach((v, i) => { ws.getCell(row, i + 1).value = v; }); row++; }
  function writeSummary(text) { ws.getCell(`A${row}`).value = text; ws.getCell(`A${row}`).font = subFont; row++; }

  // 1. Paddy Entries
  const p = data.paddy_entries;
  writeSection(`1. Paddy Entries (${p.count})`);
  writeSummary(`Total Mill W(Q): ${(p.total_mill_w/100).toFixed(2)} | Bags: ${p.total_bags} | Final W(Q): ${(p.total_final_w/100).toFixed(2)}`);
  writeSummary(`Bag Dep: ${p.total_g_deposite} | Bag Issued: ${p.total_g_issued} | Cash: Rs.${fmtAmt(p.total_cash_paid)} | Diesel: Rs.${fmtAmt(p.total_diesel_paid)}`);

  if (p.details.length) {
    if (isDetail) {
      writeHeaders(['Truck','Agent','Mandi','RST','TP','QNTL','Bags','G.Dep','GBW','P.Pkt','P.Cut','Mill W','M%','M.Cut','C%','D/D/P','Final W','G.Iss','Cash','Diesel']);
      p.details.forEach(d => writeRow([
        d.truck_no, d.agent, d.mandi, d.rst_no, d.tp_no,
        +(d.kg/100).toFixed(2), d.bags, d.g_deposite, +(d.gbw_cut/100).toFixed(2),
        d.plastic_bag, +(d.p_pkt_cut/100).toFixed(2), +(d.mill_w/100).toFixed(2),
        d.moisture, +((d.moisture_cut||0)/100).toFixed(2), `${d.cutting_percent}%`, d.disc_dust_poll,
        +(d.final_w/100).toFixed(2), d.g_issued, d.cash_paid, d.diesel_paid
      ]));
    } else {
      writeHeaders(['Truck','Mandi','Agent','QNTL','Bags','Mill W','Final W','Cash','Diesel']);
      p.details.forEach(d => writeRow([
        d.truck_no, d.mandi, d.agent,
        +(d.kg/100).toFixed(2), d.bags, +(d.mill_w/100).toFixed(2),
        +(d.final_w/100).toFixed(2), d.cash_paid, d.diesel_paid
      ]));
    }
  }
  row++;

  // 4. Cash Flow
  writeSection('4. Cash Flow');
  const cf = data.cash_flow;
  writeHeaders(['','Jama (In)','Nikasi (Out)','Net']);
  writeRow(['Cash', cf.cash_jama, cf.cash_nikasi, cf.net_cash]);
  writeRow(['Bank', cf.bank_jama, cf.bank_nikasi, cf.net_bank]);
  row++;

  if (cf.details.length) {
    if (isDetail) {
      writeHeaders(['Description','Party','Category','Type','Account','Amount']);
      cf.details.forEach(d => writeRow([d.desc, d.party, d.category, d.type.toUpperCase(), d.account.toUpperCase(), d.amount]));
    } else {
      writeHeaders(['Description','Type','Account','Amount']);
      cf.details.forEach(d => writeRow([d.desc, d.type.toUpperCase(), d.account.toUpperCase(), d.amount]));
    }
  }
  row++;

  // 5. Payments
  writeSection('5. Payments');
  writeHeaders(['MSP Received','Pvt Paddy Paid','Rice Sale Received']);
  writeRow([data.payments.msp_received, data.payments.pvt_paddy_paid, data.payments.rice_sale_received]);
  row++;

  // 6. Pump Account
  const pa = data.pump_account;
  writeSection('6. Pump Account / Diesel');
  writeSummary(`Total Diesel: Rs.${fmtAmt(pa.total_diesel)} | Paid: Rs.${fmtAmt(pa.total_paid)} | Balance: Rs.${fmtAmt(pa.balance)}`);
  if (pa.details.length) {
    writeHeaders(['Pump','Type','Truck','Mandi','Description','Amount']);
    pa.details.forEach(d => writeRow([d.pump, d.txn_type === 'payment' || d.txn_type === 'credit' ? 'PAID' : 'DIESEL', d.truck_no, d.mandi, d.desc, d.amount]));
  }
  row++;

  // 11. Staff Attendance
  const sa = data.staff_attendance;
  if (sa.total) {
    writeSection(`11. Staff Attendance (${sa.total})`);
    writeHeaders(['Present','Half Day','Holiday','Absent','Not Marked']);
    writeRow([sa.present, sa.half_day, sa.holiday, sa.absent, sa.not_marked]);
    row++;
    const statusMap = { present: 'P', absent: 'A', half_day: 'H', holiday: 'CH', not_marked: '-' };
    writeHeaders(['Staff Name', 'Status']);
    sa.details.forEach(d => writeRow([d.name, statusMap[d.status] || d.status]));
  }

  // Auto-fit column widths
  for (let i = 1; i <= ws.columnCount; i++) {
    let maxLen = 0;
    ws.getColumn(i).eachCell(c => { if (c.value) maxLen = Math.max(maxLen, String(c.value).length); });
    ws.getColumn(i).width = Math.min(Math.max(maxLen + 2, 8), 25);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=daily_report_${data.mode}_${data.date}.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

  return router;
};
