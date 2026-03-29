const express = require('express');
const router = express.Router();

module.exports = function(database) {
  // Helper reference
  const ExcelJS = require('exceljs');
  const PDFDocument = require('pdfkit');
  const { addPdfHeader: _addPdfHeader, addPdfTable , safePdfPipe} = require('./pdf_helpers');
  const addPdfHeader = (doc, title) => _addPdfHeader(doc, title, database.getBranding());

// ============ CMR EXPORT ENDPOINTS (continued) ============

// ---- MILLING REPORT EXCEL ----
router.get('/api/milling-report/excel', async (req, res) => {
  try {
    const entries = database.getMillingEntries(req.query);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Milling Report');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Type', key: 'rice_type', width: 10 },
      { header: 'Paddy (Q)', key: 'paddy', width: 12 }, { header: 'Rice %', key: 'rice_pct', width: 9 },
      { header: 'Rice (Q)', key: 'rice', width: 10 }, { header: 'FRK (Q)', key: 'frk', width: 9 },
      { header: 'CMR (Q)', key: 'cmr', width: 10 }, { header: 'Outturn %', key: 'outturn', width: 10 },
      { header: 'Bran (Q)', key: 'bran', width: 9 }, { header: 'Kunda (Q)', key: 'kunda', width: 9 },
      { header: 'Husk %', key: 'husk_pct', width: 9 }, { header: 'Note', key: 'note', width: 14 }
    ];
    entries.forEach(e => {
      ws.addRow({ date: e.date, rice_type: (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
        paddy: e.paddy_input_qntl||0, rice_pct: e.rice_percent||0, rice: e.rice_qntl||0,
        frk: e.frk_used_qntl||0, cmr: e.cmr_delivery_qntl||0, outturn: e.outturn_ratio||0,
        bran: e.bran_qntl||0, kunda: e.kunda_qntl||0, husk_pct: e.husk_percent||0, note: e.note||'' });
    });
    addExcelTitle(ws, 'Milling Report', 12);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- MILLING REPORT PDF ----
router.get('/api/milling-report/pdf', async (req, res) => {
  try {
    const entries = database.getMillingEntries(req.query);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'Milling Report');
    const headers = ['Date','Type','Paddy(Q)','Rice%','Rice(Q)','FRK(Q)','CMR(Q)','Outturn%','Bran(Q)','Husk%','Note'];
    const rows = entries.map(e => [e.date||'', (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
      (e.paddy_input_qntl||0), (e.rice_percent||0)+'%', (e.rice_qntl||0), (e.frk_used_qntl||0),
      (e.cmr_delivery_qntl||0), (e.outturn_ratio||0)+'%', (e.bran_qntl||0), (e.husk_percent||0)+'%', (e.note||'').substring(0,15)]);
    addPdfTable(doc, headers, rows, [50,45,45,35,40,35,40,40,35,35,60]);
    await safePdfPipe(doc, res);
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ---- FRK PURCHASES EXCEL ----
router.get('/api/frk-purchases/excel', async (req, res) => {
  try {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let purchases = [...database.data.frk_purchases];
    if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
    purchases.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('FRK Purchases');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Party Name', key: 'party', width: 18 },
      { header: 'Qty (QNTL)', key: 'qty', width: 12 }, { header: 'Rate (₹/Q)', key: 'rate', width: 12 },
      { header: 'Amount (₹)', key: 'amount', width: 14 }, { header: 'Note', key: 'note', width: 16 }
    ];
    purchases.forEach(p => ws.addRow({ date: p.date, party: p.party_name||'', qty: p.quantity_qntl||0, rate: p.rate_per_qntl||0, amount: p.total_amount||0, note: p.note||'' }));
    const totalRow = ws.addRow({ date: 'TOTAL', party: '', qty: +purchases.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2), rate: '', amount: +purchases.reduce((s,p)=>s+(p.total_amount||0),0).toFixed(2), note: '' });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'FRK Purchase Register', 6);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=frk_purchases_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- FRK PURCHASES PDF ----
router.get('/api/frk-purchases/pdf', async (req, res) => {
  try {
    if (!database.data.frk_purchases) database.data.frk_purchases = [];
    let purchases = [...database.data.frk_purchases];
    if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
    if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
    purchases.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Disposition', `attachment; filename=frk_purchases_${Date.now()}.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'FRK Purchase Register');
    const tq = +purchases.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2);
    const ta = +purchases.reduce((s,p)=>s+(p.total_amount||0),0).toFixed(2);
    const headers = ['Date','Party','Qty(Q)','Rate(Rs.)','Amount(Rs.)','Note'];
    const rows = purchases.map(p => [p.date||'', (p.party_name||'').substring(0,25), p.quantity_qntl||0, p.rate_per_qntl||0, p.total_amount||0, (p.note||'').substring(0,20)]);
    rows.push(['TOTAL', '', tq, '', ta, '']);
    addPdfTable(doc, headers, rows, [60, 120, 55, 55, 70, 80]);
    await safePdfPipe(doc, res);
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ---- BYPRODUCT SALES EXCEL ----
router.get('/api/byproduct-sales/excel', async (req, res) => {
  try {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    let sales = [...database.data.byproduct_sales];
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const millingEntries = database.getMillingEntries(req.query);
    const products = ['bran','kunda','broken','kanki','husk'];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('By-Product Sales');
    // Stock summary
    ws.columns = [
      { header: 'Product', key: 'product', width: 14 }, { header: 'Produced (Q)', key: 'produced', width: 14 },
      { header: 'Sold (Q)', key: 'sold', width: 12 }, { header: 'Available (Q)', key: 'available', width: 14 },
      { header: 'Revenue (₹)', key: 'revenue', width: 14 }
    ];
    products.forEach(p => {
      const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      ws.addRow({ product: p.charAt(0).toUpperCase()+p.slice(1), produced, sold, available: +(produced-sold).toFixed(2), revenue });
    });
    // Add gap + sales detail
    ws.addRow({});
    const detailHeaderRow = ws.addRow({ product: 'Date', produced: 'Product', sold: 'Qty (Q)', available: 'Rate (₹/Q)', revenue: 'Amount (₹)' });
    detailHeaderRow.font = { bold: true };
    sales.forEach(s => ws.addRow({ product: s.date||'', produced: (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), sold: s.quantity_qntl||0, available: s.rate_per_qntl||0, revenue: s.total_amount||0 }));
    const totalRow = ws.addRow({ product: 'TOTAL', produced: '', sold: +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2), available: '', revenue: +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2) });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'By-Product Stock & Sales Report', 5);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- BYPRODUCT SALES PDF ----
router.get('/api/byproduct-sales/pdf', async (req, res) => {
  try {
    if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
    let sales = [...database.data.byproduct_sales];
    if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
    if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
    sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const millingEntries = database.getMillingEntries(req.query);
    const products = ['bran','kunda','broken','kanki','husk'];
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'By-Product Stock & Sales Report');
    // Stock summary
    const sHeaders = ['Product','Produced(Q)','Sold(Q)','Available(Q)','Revenue(Rs.)'];
    const sRows = products.map(p => {
      const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      return [p.charAt(0).toUpperCase()+p.slice(1), produced, sold, +(produced-sold).toFixed(2), revenue];
    });
    addPdfTable(doc, sHeaders, sRows, [70, 70, 60, 70, 70]);
    doc.moveDown(1);
    // Sales detail
    doc.fontSize(11).font('Helvetica-Bold').text('Sales Detail', { align: 'left' });
    doc.moveDown(0.3);
    const headers = ['Date','Product','Qty(Q)','Rate(Rs.)','Amount(Rs.)','Buyer'];
    const tq = +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
    const ta = +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
    const rows = sales.map(s => [s.date||'', (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), s.quantity_qntl||0, s.rate_per_qntl||0, s.total_amount||0, (s.buyer_name||'').substring(0,20)]);
    rows.push(['TOTAL', '', tq, '', ta, '']);
    addPdfTable(doc, headers, rows, [55, 55, 45, 50, 60, 90]);
    await safePdfPipe(doc, res);
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});

// ---- PADDY CUSTODY REGISTER EXCEL ----
router.get('/api/paddy-custody-register/excel', async (req, res) => {
  try {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    const millingEntries = database.getMillingEntries(filters);
    const rows = [];
    entries.forEach(e => rows.push({ date: e.date||'', type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.mill_w||0)/100).toFixed(2), released_qntl: 0 }));
    millingEntries.forEach(e => rows.push({ date: e.date||'', type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
    rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let balance = 0;
    rows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Paddy Custody Register');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Description', key: 'description', width: 40 },
      { header: 'Received (QNTL)', key: 'received', width: 16 }, { header: 'Released (QNTL)', key: 'released', width: 16 },
      { header: 'Balance (QNTL)', key: 'balance', width: 16 }
    ];
    rows.forEach(r => ws.addRow({ date: r.date, description: r.description, received: r.received_qntl > 0 ? r.received_qntl : '', released: r.released_qntl > 0 ? r.released_qntl : '', balance: r.balance_qntl }));
    const totalRow = ws.addRow({ date: 'TOTAL', description: '', received: +rows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), released: +rows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), balance: +balance.toFixed(2) });
    totalRow.font = { bold: true };
    addExcelTitle(ws, 'Paddy Custody Register', 5);
    styleExcelHeader(ws);
    styleExcelData(ws, 5);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
});

// ---- PADDY CUSTODY REGISTER PDF ----
router.get('/api/paddy-custody-register/pdf', async (req, res) => {
  try {
    const filters = req.query;
    let entries = [...database.data.entries];
    if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
    if (filters.season) entries = entries.filter(e => e.season === filters.season);
    const millingEntries = database.getMillingEntries(filters);
    const rows = [];
    entries.forEach(e => rows.push({ date: e.date||'', type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.mill_w||0)/100).toFixed(2), released_qntl: 0 }));
    millingEntries.forEach(e => rows.push({ date: e.date||'', type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
    rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    let balance = 0;
    rows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'Paddy Custody Register');
    const headers = ['Date','Description','Received(Q)','Released(Q)','Balance(Q)'];
    const pdfRows = rows.map(r => [r.date, r.description.substring(0,35), r.received_qntl > 0 ? r.received_qntl : '-', r.released_qntl > 0 ? r.released_qntl : '-', r.balance_qntl]);
    pdfRows.push(['TOTAL', '', +rows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), +rows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), +balance.toFixed(2)]);
    addPdfTable(doc, headers, pdfRows, [50, 180, 60, 60, 60]);
    await safePdfPipe(doc, res);
  } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
});



  return router;
};
