const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { getColumns, fmtVal, getPdfHeaders, getPdfWidthsMm, getExcelHeaders, getEntryRow } = require('../shared/report_helper');
const { getDailyReportData, generateDailyReportPdf } = require('./daily_report_logic');

function fmtAmt(val) { return val === 0 ? '0' : val.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtDate(d) { if (!d) return ''; const s = String(d).split('T')[0]; const p = s.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s; }

module.exports = function(database) {

function col(name) {
  if (!database.data[name]) database.data[name] = [];
  return database.data[name];
}

router.get('/api/reports/daily', safeSync(async (req, res) => {
  res.json(getDailyReportData(database, req.query));
}));

// ============ DAILY REPORT PDF ============
router.get('/api/reports/daily/pdf', safeSync(async (req, res) => {
  const PDFDocument = require('pdfkit');
  const data = getDailyReportData(database, req.query);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
    res.setHeader('Content-Disposition', `attachment; filename=daily_report_${data.mode}_${data.date}.pdf`);
  // PDF will be sent via safePdfPipe

  generateDailyReportPdf(doc, data, req.query);

  await safePdfPipe(doc, res);
}));

// ============ DAILY REPORT EXCEL ============
router.get('/api/reports/daily/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  const { styleExcelData, addExcelTitle, COLORS } = require('./excel_helpers');
const { safePdfPipe } = require('./pdf_helpers');
  const data = getDailyReportData(database, req.query);
  const isDetail = data.mode === 'detail';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Daily Report ${data.date}`);
  const colCount = 6;

  addExcelTitle(ws, `Daily Report - ${data.date} (${isDetail ? 'DETAILED' : 'SUMMARY'})`, colCount, database);
  ws.getCell('A4').value = `FY: ${req.query.kms_year || 'All'} | Season: ${req.query.season || 'All'}`;
  ws.getCell('A4').font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  let row = 6;

  const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  const hdrFont = { bold: true, color: { argb: COLORS.headerText }, size: 9 };
  const subFont = { bold: true, size: 9, color: { argb: 'FF475569' } };
  const sectionFont = { bold: true, size: 11, color: { argb: COLORS.titleText } };

  function writeSection(title) { ws.getCell(`A${row}`).value = title; ws.getCell(`A${row}`).font = sectionFont; row++; }
  function writeHeaders(hdrs) { hdrs.forEach((h, i) => { const c = ws.getCell(row, i + 1); c.value = h; c.fill = hdrFill; c.font = hdrFont; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }); ws.getRow(row).height = 24; row++; }
  function writeRow(vals) { vals.forEach((v, i) => { const c = ws.getCell(row, i + 1); c.value = v; c.alignment = { vertical: 'middle' }; }); row++; }
  function writeSummary(text) { ws.getCell(`A${row}`).value = text; ws.getCell(`A${row}`).font = subFont; row++; }
  // Track max widths per column
  const colMaxWidths = {};
  function setColWidths(widthArr) {
    widthArr.forEach((w, i) => {
      const ci = i + 1;
      colMaxWidths[ci] = Math.max(colMaxWidths[ci] || 0, w);
    });
  }

  // 1. Paddy Entries
  const p = data.paddy_entries;
  writeSection(`1. Paddy Entries (${p.count})`);
  writeSummary(`Total Mill W(Q): ${(p.total_mill_w/100).toFixed(2)} | Bags: ${p.total_bags} | Final W(Q): ${(p.total_final_w/100).toFixed(2)}`);
  writeSummary(`Bag Dep: ${p.total_g_deposite} | Bag Issued: ${p.total_g_issued} | Cash: Rs.${fmtAmt(p.total_cash_paid)} | Diesel: Rs.${fmtAmt(p.total_diesel_paid)}`);

  if (p.details.length) {
    const colKey = isDetail ? 'detail_mode_columns' : 'summary_mode_columns';
    const dailyCols = getColumns('daily_paddy_entries_report', colKey);
    writeHeaders(getExcelHeaders(dailyCols));
    p.details.forEach(d => writeRow(dailyCols.map(c => fmtVal(d[c.field], c.type))));
    setColWidths(dailyCols.map(c => c.width_excel || 12));
  }
  row++;

  // 4. Cash Flow
  writeSection('4. Cash Flow');
  const cf = data.cash_flow;
  writeHeaders(['','Jama (Cr)','Nikasi (Dr)','Net']);
  writeRow(['Cash', cf.cash_jama, cf.cash_nikasi, cf.net_cash]);
  writeRow(['Bank', cf.bank_jama, cf.bank_nikasi, cf.net_bank]);
  row++;

  if (cf.details.length) {
    if (isDetail) {
      writeHeaders(['Description','Party','Category','Type','Account','Amount']);
      cf.details.forEach(d => writeRow([d.desc, d.party, d.category, d.type.toUpperCase(), d.account.toUpperCase(), d.amount]));
      setColWidths([35, 18, 15, 10, 10, 14]);
    } else {
      writeHeaders(['Description','Type','Account','Amount']);
      cf.details.forEach(d => writeRow([d.desc, d.type.toUpperCase(), d.account.toUpperCase(), d.amount]));
      setColWidths([40, 10, 10, 14]);
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
    setColWidths([16, 10, 14, 14, 30, 14]);
  }
  row++;

  // 6.5. Cash Transactions
  const ctxn = data.cash_transactions;
  if (ctxn && ctxn.count > 0) {
    writeSection(`Cash Transactions (${ctxn.count})`);
    writeSummary(`Jama: Rs.${fmtAmt(ctxn.total_jama)} | Nikasi: Rs.${fmtAmt(ctxn.total_nikasi)} | Balance: Rs.${fmtAmt(ctxn.total_jama - ctxn.total_nikasi)}`);
    if (ctxn.details && ctxn.details.length) {
      if (isDetail) {
        writeHeaders(['Date', 'Party Name', 'Type (Jama/Nikasi)', 'Amount (Rs.)', 'Description']);
        ctxn.details.forEach(d => writeRow([d.date||'', d.party_name||'', d.txn_type === 'jama' ? 'Jama' : 'Nikasi', d.amount, d.description||'']));
        setColWidths([12, 22, 12, 14, 35]);
      } else {
        writeHeaders(['Date', 'Party Name', 'Type (Jama/Nikasi)', 'Amount (Rs.)']);
        ctxn.details.forEach(d => writeRow([d.date||'', d.party_name||'', d.txn_type === 'jama' ? 'Jama' : 'Nikasi', d.amount]));
        setColWidths([12, 22, 12, 14]);
      }
    }
    row++;
  }

  // 7. Mill Parts Stock
  const mp = data.mill_parts;
  if (mp && (mp.in_count || mp.used_count)) {
    writeSection(`7. Mill Parts Stock (In: ${mp.in_count} | Used: ${mp.used_count})`);
    if (mp.in_details && mp.in_details.length) {
      writeSummary(`Parts Purchased - Total: Rs. ${fmtAmt(mp.in_amount || 0)}`);
      writeHeaders(['Part', 'Qty', 'Rate', 'Party', 'Bill No', 'Store Room', 'Amount']);
      mp.in_details.forEach(d => writeRow([d.part||'', d.qty||0, d.rate||0, d.party||'', d.bill_no||'', d.store_room||'', d.amount||0]));
    }
    if (mp.used_details && mp.used_details.length) {
      writeSummary('Parts Used:');
      writeHeaders(['Part', 'Qty', 'Store Room', 'Remark']);
      mp.used_details.forEach(d => writeRow([d.part||'', d.qty||0, d.store_room||'', d.remark||'']));
    }
    row++;
  }

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

  // 12. Hemali Payments
  const hp = data.hemali_payments;
  if (hp && hp.count) {
    writeSection(`12. Hemali Payments (${hp.count})`);
    writeHeaders(['Paid', 'Unpaid', 'Total Work', 'Total Paid']);
    writeRow([hp.paid_count, hp.unpaid_count, hp.total_work, hp.total_paid]);
    row++;
    if (hp.details.length) {
      writeHeaders(['Sardar', 'Items', 'Total', 'Adv Deducted', 'Paid', 'New Advance', 'Status']);
      hp.details.forEach(d => writeRow([d.sardar, d.items, d.total, d.advance_deducted, d.amount_paid, d.new_advance, d.status.toUpperCase()]));
    }
  }

  // Apply column widths: use tracked max from sections, then auto-fit remaining
  for (let i = 1; i <= ws.columnCount; i++) {
    if (colMaxWidths[i]) {
      ws.getColumn(i).width = colMaxWidths[i];
    } else {
      let maxLen = 0;
      ws.getColumn(i).eachCell(c => { if (c.value) maxLen = Math.max(maxLen, String(c.value).length); });
      ws.getColumn(i).width = Math.min(Math.max(maxLen + 2, 10), 40);
    }
  }
  // Apply alternating row colors to data rows
  for (let r = 6; r <= ws.rowCount; r++) {
    const rowObj = ws.getRow(r);
    let isHdr = false;
    rowObj.eachCell(c => { if (c.fill && c.fill.fgColor && c.fill.fgColor.argb === COLORS.headerBg) isHdr = true; });
    if (!isHdr && !rowObj.getCell(1).font?.bold) {
      const isEven = r % 2 === 0;
      rowObj.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (!cell.fill || !cell.fill.fgColor || cell.fill.fgColor.argb === 'FF000000') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F7FF' : 'FFFFFFFF' } };
          cell.border = { top: { style: 'hair', color: { argb: 'FFD0D5DD' } }, bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } } };
        }
      });
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=daily_report_${data.mode}_${data.date}.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

  return router;
};
