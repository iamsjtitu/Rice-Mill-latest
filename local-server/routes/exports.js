const express = require('express');
const router = express.Router();

module.exports = function(database) {

// ============ EXPORT ENDPOINTS (Excel & PDF) ============
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Helper: Style Excel header row
function styleExcelHeader(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0D3B66' } },
      bottom: { style: 'thin', color: { argb: 'FF0D3B66' } },
      left: { style: 'thin', color: { argb: 'FF0D3B66' } },
      right: { style: 'thin', color: { argb: 'FF0D3B66' } }
    };
  });
  sheet.columns.forEach(col => { col.width = Math.max(col.width || 14, 14); });
  // A4 page setup for printing
  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
}

function styleExcelData(sheet, startRow) {
  const lastRow = sheet.rowCount;
  const colCount = sheet.columnCount;
  for (let r = startRow; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const isEven = (r - startRow) % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= colCount) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F7FF' : 'FFFFFFFF' } };
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          left: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          right: { style: 'hair', color: { argb: 'FFD0D5DD' } }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { size: 10 };
      }
    });
    row.eachCell((cell) => {
      if (cell.value === 'Paid') {
        cell.font = { bold: true, size: 10, color: { argb: 'FF16A34A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      } else if (cell.value === 'Pending') {
        cell.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      } else if (cell.value === 'Partial') {
        cell.font = { bold: true, size: 10, color: { argb: 'FFD97706' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    });
  }
}

// Helper: Add branding title row to Excel
function addExcelTitle(sheet, title, colCount) {
  const branding = database.getBranding();
  sheet.insertRow(1, []); sheet.insertRow(1, []); sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, colCount); sheet.mergeCells(2, 1, 2, colCount); sheet.mergeCells(3, 1, 3, colCount);
  const tc = sheet.getCell('A1'); tc.value = branding.company_name;
  tc.font = { bold: true, size: 18, color: { argb: 'FF1B4F72' } }; tc.alignment = { horizontal: 'center', vertical: 'middle' };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  sheet.getRow(1).height = 32;
  const sc = sheet.getCell('A2'); sc.value = branding.tagline;
  sc.font = { size: 10, italic: true, color: { argb: 'FF666666' } }; sc.alignment = { horizontal: 'center' };
  const dc = sheet.getCell('A3'); dc.value = `${title} | ${new Date().toLocaleDateString('en-IN')}`;
  dc.font = { bold: true, size: 12, color: { argb: 'FFD97706' } }; dc.alignment = { horizontal: 'center' };
  dc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
  sheet.getRow(3).height = 24;
}

// Helper: PDF header
function addPdfHeader(doc, title) {
  const branding = database.getBranding();
  doc.fontSize(18).font('Helvetica-Bold').text(branding.company_name, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(branding.tagline, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(8).text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#1E3A5F');
  doc.moveDown(0.5);
}

// Helper: PDF table
function addPdfTable(doc, headers, rows, colWidths) {
  const startX = 40;
  const pageWidth = doc.page.width - 80;
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  const scale = pageWidth / totalW;
  const widths = colWidths.map(w => w * scale);
  
  // Header
  let x = startX;
  doc.fontSize(7).font('Helvetica-Bold');
  const headerY = doc.y;
  doc.rect(startX, headerY - 2, pageWidth, 16).fill('#1E3A5F');
  headers.forEach((h, i) => {
    doc.fillColor('#FFFFFF').text(h, x + 2, headerY, { width: widths[i] - 4, align: 'center' });
    x += widths[i];
  });
  doc.y = headerY + 16;
  
  // Rows
  doc.font('Helvetica').fontSize(7).fillColor('#333333');
  rows.forEach((row, ri) => {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      doc.y = 40;
    }
    x = startX;
    const rowY = doc.y;
    if (ri % 2 === 0) doc.rect(startX, rowY - 1, pageWidth, 13).fill('#F0F4F8').fillColor('#333333');
    else doc.fillColor('#333333');
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x + 2, rowY, { width: widths[i] - 4, align: i === 0 ? 'left' : 'right' });
      x += widths[i];
    });
    doc.y = rowY + 13;
  });
}

// ---- ENTRIES EXCEL ----
router.get('/api/export/excel', async (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mill Entries');
    
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Truck No', key: 'truck_no', width: 14 },
      { header: 'RST No', key: 'rst_no', width: 10 },
      { header: 'TP No', key: 'tp_no', width: 10 },
      { header: 'Agent', key: 'agent_name', width: 14 },
      { header: 'Mandi', key: 'mandi_name', width: 14 },
      { header: 'QNTL', key: 'qntl', width: 10 },
      { header: 'BAG', key: 'bag', width: 8 },
      { header: 'G.Dep', key: 'g_deposite', width: 8 },
      { header: 'GBW Cut', key: 'gbw_cut', width: 10 },
      { header: 'Mill W (QNTL)', key: 'mill_w', width: 13 },
      { header: 'Moist%', key: 'moisture', width: 9 },
      { header: 'M.Cut', key: 'moisture_cut', width: 9 },
      { header: 'Cut%', key: 'cutting_percent', width: 8 },
      { header: 'D/D/P', key: 'disc_dust_poll', width: 8 },
      { header: 'Final W (QNTL)', key: 'final_w', width: 14 },
      { header: 'G.Issued', key: 'g_issued', width: 10 },
      { header: 'Cash', key: 'cash_paid', width: 10 },
      { header: 'Diesel', key: 'diesel_paid', width: 10 }
    ];
    
    entries.forEach(e => {
      ws.addRow({
        date: e.date, truck_no: e.truck_no, rst_no: e.rst_no || '', tp_no: e.tp_no || '',
        agent_name: e.agent_name, mandi_name: e.mandi_name,
        qntl: +(e.qntl || 0).toFixed(2), bag: e.bag || 0, g_deposite: e.g_deposite || 0,
        gbw_cut: +(e.gbw_cut || 0).toFixed(2), mill_w: +((e.mill_w || 0) / 100).toFixed(2),
        moisture: e.moisture || 0, moisture_cut: +((e.moisture_cut || 0) / 100).toFixed(2),
        cutting_percent: e.cutting_percent || 0, disc_dust_poll: e.disc_dust_poll || 0,
        final_w: +((e.final_w || 0) / 100).toFixed(2), g_issued: e.g_issued || 0,
        cash_paid: e.cash_paid || 0, diesel_paid: e.diesel_paid || 0
      });
    });
    
    addExcelTitle(ws, 'Mill Entries Report', 19);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- ENTRIES PDF ----
router.get('/api/export/pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Mill Entries Report');
    const headers = ['Date', 'Truck', 'Agent', 'Mandi', 'QNTL', 'BAG', 'Mill W', 'Cut%', 'Final W', 'Cash', 'Diesel'];
    const rows = entries.map(e => [
      e.date || '', e.truck_no || '', e.agent_name || '', e.mandi_name || '',
      (e.qntl || 0).toFixed(2), e.bag || 0, ((e.mill_w || 0) / 100).toFixed(2),
      e.cutting_percent || 0, ((e.final_w || 0) / 100).toFixed(2),
      e.cash_paid || 0, e.diesel_paid || 0
    ]);
    const colWidths = [55, 60, 60, 60, 40, 35, 45, 35, 50, 45, 45];
    addPdfTable(doc, headers, rows, colWidths);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- TRUCK PAYMENTS EXCEL ----
router.get('/api/export/truck-payments-excel', async (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Truck Payments');
    
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Truck No', key: 'truck_no', width: 14 },
      { header: 'Mandi', key: 'mandi', width: 14 },
      { header: 'Final QNTL', key: 'final_qntl', width: 12 },
      { header: 'Rate', key: 'rate', width: 8 },
      { header: 'Gross', key: 'gross', width: 12 },
      { header: 'Cash', key: 'cash', width: 10 },
      { header: 'Diesel', key: 'diesel', width: 10 },
      { header: 'Deductions', key: 'ded', width: 12 },
      { header: 'Net Amount', key: 'net', width: 12 },
      { header: 'Paid', key: 'paid', width: 10 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 10 }
    ];
    
    entries.forEach(entry => {
      const p = database.getTruckPayment(entry.id);
      const fq = (entry.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      ws.addRow({
        date: entry.date, truck_no: entry.truck_no, mandi: entry.mandi_name,
        final_qntl: +fq.toFixed(2), rate: p.rate_per_qntl, gross: +gross.toFixed(2),
        cash: entry.cash_paid || 0, diesel: entry.diesel_paid || 0, ded: +ded.toFixed(2),
        net: +net.toFixed(2), paid: p.paid_amount, balance: +bal.toFixed(2),
        status: bal < 0.10 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')
      });
    });
    
    addExcelTitle(ws, 'Truck Payments Report', 13);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- TRUCK PAYMENTS PDF ----
router.get('/api/export/truck-payments-pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Truck Payments Report');
    const headers = ['Date', 'Truck', 'Mandi', 'Final QNTL', 'Rate', 'Gross', 'Deductions', 'Net', 'Paid', 'Balance', 'Status'];
    const rows = entries.map(e => {
      const p = database.getTruckPayment(e.id);
      const fq = (e.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (e.cash_paid || 0) + (e.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      return [e.date, e.truck_no, e.mandi_name, fq.toFixed(2), p.rate_per_qntl, gross.toFixed(2), ded.toFixed(2), net.toFixed(2), p.paid_amount, bal.toFixed(2), bal < 0.10 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')];
    });
    addPdfTable(doc, headers, rows, [50, 55, 55, 45, 35, 50, 50, 50, 45, 50, 40]);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- AGENT PAYMENTS EXCEL ----
router.get('/api/export/agent-payments-excel', async (req, res) => {
  try {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Agent Payments');
    
    ws.columns = [
      { header: 'Mandi', key: 'mandi', width: 14 },
      { header: 'Agent', key: 'agent', width: 14 },
      { header: 'Target QNTL', key: 'target', width: 12 },
      { header: 'Cutting QNTL', key: 'cutting', width: 12 },
      { header: 'Base Rate', key: 'base_rate', width: 10 },
      { header: 'Cut Rate', key: 'cut_rate', width: 10 },
      { header: 'Total Amount', key: 'total', width: 12 },
      { header: 'Achieved', key: 'achieved', width: 10 },
      { header: 'Paid', key: 'paid', width: 10 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 10 }
    ];
    
    targets.forEach(target => {
      const me = entries.filter(e => e.mandi_name === target.mandi_name);
      const achieved = me.reduce((s, e) => s + (e.final_w || 0) / 100, 0);
      const cq = target.target_qntl * target.cutting_percent / 100;
      const total = (target.target_qntl * (target.base_rate ?? 10)) + (cq * (target.cutting_rate ?? 5));
      const p = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
      const bal = Math.max(0, total - p.paid_amount);
      const ae = me.find(e => e.agent_name);
      ws.addRow({
        mandi: target.mandi_name, agent: ae ? ae.agent_name : '',
        target: target.target_qntl, cutting: +cq.toFixed(2),
        base_rate: target.base_rate ?? 10, cut_rate: target.cutting_rate ?? 5,
        total: +total.toFixed(2), achieved: +achieved.toFixed(2),
        paid: p.paid_amount, balance: +bal.toFixed(2),
        status: bal < 0.01 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')
      });
    });
    
    addExcelTitle(ws, 'Agent Payments Report', 11);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- AGENT PAYMENTS PDF ----
router.get('/api/export/agent-payments-pdf', (req, res) => {
  try {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Agent Payments Report');
    const headers = ['Mandi', 'Agent', 'Target', 'Cutting', 'B.Rate', 'C.Rate', 'Total', 'Achieved', 'Paid', 'Balance', 'Status'];
    const rows = targets.map(t => {
      const me = entries.filter(e => e.mandi_name === t.mandi_name);
      const ach = me.reduce((s, e) => s + (e.final_w || 0) / 100, 0);
      const cq = t.target_qntl * t.cutting_percent / 100;
      const tot = (t.target_qntl * (t.base_rate ?? 10)) + (cq * (t.cutting_rate ?? 5));
      const p = database.getAgentPayment(t.mandi_name, t.kms_year, t.season);
      const bal = Math.max(0, tot - p.paid_amount);
      const ae = me.find(e => e.agent_name);
      return [t.mandi_name, ae ? ae.agent_name : '', t.target_qntl, cq.toFixed(2), t.base_rate ?? 10, t.cutting_rate ?? 5, tot.toFixed(2), ach.toFixed(2), p.paid_amount, bal.toFixed(2), bal < 0.01 ? 'Paid' : (p.paid_amount > 0 ? 'Partial' : 'Pending')];
    });
    addPdfTable(doc, headers, rows, [55, 55, 40, 40, 35, 35, 50, 45, 45, 50, 40]);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- SUMMARY REPORT PDF ----
router.get('/api/export/summary-report-pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const totals = database.getTotals(req.query);
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=summary_report_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Summary Report');
    
    doc.fontSize(10).font('Helvetica-Bold').text('Overview:', { underline: true });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Total Entries: ${entries.length}`);
    doc.text(`Total QNTL: ${(totals.total_qntl || 0).toFixed(2)}`);
    doc.text(`Total BAG: ${totals.total_bag || 0}`);
    doc.text(`Total Mill W (QNTL): ${((totals.total_mill_w || 0) / 100).toFixed(2)}`);
    doc.text(`Total Final W (QNTL): ${((totals.total_final_w || 0) / 100).toFixed(2)}`);
    doc.text(`Total Cash Paid: Rs.${totals.total_cash_paid || 0}`);
    doc.text(`Total Diesel Paid: Rs.${totals.total_diesel_paid || 0}`);
    doc.text(`Total G.Issued: ${totals.total_g_issued || 0}`);
    doc.moveDown(1);
    
    // Agent-wise summary
    doc.fontSize(10).font('Helvetica-Bold').text('Agent-wise Summary:', { underline: true });
    doc.moveDown(0.3);
    const agentMap = {};
    entries.forEach(e => {
      if (!e.agent_name) return;
      if (!agentMap[e.agent_name]) agentMap[e.agent_name] = { entries: 0, qntl: 0, final_w: 0 };
      agentMap[e.agent_name].entries++;
      agentMap[e.agent_name].qntl += e.qntl || 0;
      agentMap[e.agent_name].final_w += (e.final_w || 0) / 100;
    });
    const agentHeaders = ['Agent', 'Entries', 'QNTL', 'Final W (QNTL)'];
    const agentRows = Object.entries(agentMap).map(([name, data]) => [name, data.entries, data.qntl.toFixed(2), data.final_w.toFixed(2)]);
    addPdfTable(doc, agentHeaders, agentRows, [120, 50, 60, 80]);
    
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ---- TRUCK OWNER EXCEL ----
router.get('/api/export/truck-owner-excel', async (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const truckData = {};
    entries.forEach(entry => {
      const tn = entry.truck_no || 'Unknown';
      const p = database.getTruckPayment(entry.id);
      const fq = (entry.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      if (!truckData[tn]) truckData[tn] = { truck_no: tn, trips: 0, total_qntl: 0, total_gross: 0, total_deductions: 0, total_net: 0, total_paid: 0, total_balance: 0 };
      truckData[tn].trips++; truckData[tn].total_qntl += fq; truckData[tn].total_gross += gross;
      truckData[tn].total_deductions += ded; truckData[tn].total_net += net; truckData[tn].total_paid += p.paid_amount; truckData[tn].total_balance += bal;
    });
    
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Truck Owner');
    ws.columns = [
      { header: 'Truck No', key: 'truck_no', width: 14 },
      { header: 'Trips', key: 'trips', width: 8 },
      { header: 'Total QNTL', key: 'qntl', width: 12 },
      { header: 'Gross', key: 'gross', width: 12 },
      { header: 'Deductions', key: 'ded', width: 12 },
      { header: 'Net Payable', key: 'net', width: 12 },
      { header: 'Paid', key: 'paid', width: 12 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 10 }
    ];
    
    Object.values(truckData).forEach(t => {
      ws.addRow({
        truck_no: t.truck_no, trips: t.trips, qntl: +t.total_qntl.toFixed(2),
        gross: +t.total_gross.toFixed(2), ded: +t.total_deductions.toFixed(2),
        net: +t.total_net.toFixed(2), paid: +t.total_paid.toFixed(2),
        balance: +t.total_balance.toFixed(2),
        status: t.total_balance < 0.10 ? 'Paid' : (t.total_paid > 0 ? 'Partial' : 'Pending')
      });
    });
    
    addExcelTitle(ws, 'Truck Owner Report', 9);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ detail: 'Export failed: ' + err.message });
  }
});

// ---- TRUCK OWNER PDF ----
router.get('/api/export/truck-owner-pdf', (req, res) => {
  try {
    const entries = database.getEntries(req.query);
    const truckData = {};
    entries.forEach(entry => {
      const tn = entry.truck_no || 'Unknown';
      const p = database.getTruckPayment(entry.id);
      const fq = (entry.final_w || 0) / 100;
      const gross = fq * p.rate_per_qntl;
      const ded = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net = gross - ded;
      const bal = Math.max(0, net - p.paid_amount);
      if (!truckData[tn]) truckData[tn] = { truck_no: tn, trips: 0, total_qntl: 0, total_gross: 0, total_deductions: 0, total_net: 0, total_paid: 0, total_balance: 0 };
      truckData[tn].trips++; truckData[tn].total_qntl += fq; truckData[tn].total_gross += gross;
      truckData[tn].total_deductions += ded; truckData[tn].total_net += net; truckData[tn].total_paid += p.paid_amount; truckData[tn].total_balance += bal;
    });
    
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.pdf`);
    doc.pipe(res);
    
    addPdfHeader(doc, 'Truck Owner Consolidated Report');
    const headers = ['Truck No', 'Trips', 'Total QNTL', 'Gross', 'Deductions', 'Net Payable', 'Paid', 'Balance', 'Status'];
    const rows = Object.values(truckData).map(t => [
      t.truck_no, t.trips, t.total_qntl.toFixed(2), t.total_gross.toFixed(2),
      t.total_deductions.toFixed(2), t.total_net.toFixed(2), t.total_paid.toFixed(2),
      t.total_balance.toFixed(2), t.total_balance < 0.10 ? 'Paid' : (t.total_paid > 0 ? 'Partial' : 'Pending')
    ]);
    addPdfTable(doc, headers, rows, [55, 35, 50, 50, 50, 55, 50, 50, 40]);
    doc.end();
  } catch (err) {
    res.status(500).json({ detail: 'PDF failed: ' + err.message });
  }
});

// ============ CMR EXPORT ENDPOINTS ============



  return router;
};
