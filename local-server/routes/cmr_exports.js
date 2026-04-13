const express = require('express');
const router = express.Router();

module.exports = function(database) {
  // Helper reference
  const ExcelJS = require('exceljs');
  const PDFDocument = require('pdfkit');
  const { addPdfHeader: _addPdfHeader, addPdfTable , safePdfPipe, fmtDate} = require('./pdf_helpers');
  const addPdfHeader = (doc, title) => _addPdfHeader(doc, title, database.getBranding());
  const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');

  const DEFAULT_BP_CATS = [
    {id:"bran",name:"Bran",name_hi:"भूसी",is_auto:false,order:1},
    {id:"kunda",name:"Kunda",name_hi:"कुंडा",is_auto:false,order:2},
    {id:"broken",name:"Broken",name_hi:"टूटा",is_auto:false,order:3},
    {id:"kanki",name:"Kanki",name_hi:"कंकी",is_auto:false,order:4},
    {id:"husk",name:"Husk",name_hi:"भूसा",is_auto:true,order:5},
  ];
  function getBpCats() {
    if (!database.data.byproduct_categories || database.data.byproduct_categories.length === 0) {
      database.data.byproduct_categories = JSON.parse(JSON.stringify(DEFAULT_BP_CATS));
      database.save();
    }
    return [...database.data.byproduct_categories].sort((a,b) => (a.order||0)-(b.order||0));
  }

// ============ CMR EXPORT ENDPOINTS (continued) ============

// ---- MILLING REPORT EXCEL ----
router.get('/api/milling-report/excel', async (req, res) => {
  try {
    const entries = database.getMillingEntries(req.query);
    entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
    const cats = getBpCats();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Milling Report');
    // Dynamic columns
    const baseCols = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Type', key: 'rice_type', width: 10 },
      { header: 'Paddy (Q)', key: 'paddy', width: 12 }, { header: 'Rice %', key: 'rice_pct', width: 9 },
      { header: 'Rice (Q)', key: 'rice', width: 10 }, { header: 'FRK (Q)', key: 'frk', width: 9 },
      { header: 'CMR (Q)', key: 'cmr', width: 10 }, { header: 'Outturn %', key: 'outturn', width: 10 },
    ];
    const bpCols = cats.map(c => ({
      header: c.is_auto ? `${c.name} %` : `${c.name} (Q)`,
      key: c.is_auto ? `${c.id}_pct` : `${c.id}_qntl`,
      width: 11
    }));
    ws.columns = [...baseCols, ...bpCols, { header: 'Note', key: 'note', width: 14 }];
    entries.forEach(e => {
      const row = { date: fmtDate(e.date), rice_type: (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
        paddy: e.paddy_input_qntl||0, rice_pct: e.rice_percent||0, rice: e.rice_qntl||0,
        frk: e.frk_used_qntl||0, cmr: e.cmr_delivery_qntl||0, outturn: e.outturn_ratio||0, note: e.note||'' };
      cats.forEach(c => {
        if (c.is_auto) row[`${c.id}_pct`] = e[`${c.id}_percent`] || 0;
        else row[`${c.id}_qntl`] = e[`${c.id}_qntl`] || 0;
      });
      ws.addRow(row);
    });
    addExcelTitle(ws, 'Milling Report', baseCols.length + bpCols.length + 1);
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
    entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
    const cats = getBpCats();
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.pdf`);
    addPdfHeader(doc, 'Milling Report');
    // Dynamic headers
    const baseHeaders = ['Date','Type','Paddy(Q)','Rice%','Rice(Q)','FRK(Q)','CMR(Q)','Outturn%'];
    const bpHeaders = cats.map(c => c.is_auto ? `${c.name}%` : `${c.name}(Q)`);
    const headers = [...baseHeaders, ...bpHeaders, 'Note'];
    const rows = entries.map(e => {
      const baseRow = [fmtDate(e.date), (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
        (e.paddy_input_qntl||0), (e.rice_percent||0)+'%', (e.rice_qntl||0), (e.frk_used_qntl||0),
        (e.cmr_delivery_qntl||0), (e.outturn_ratio||0)+'%'];
      cats.forEach(c => {
        if (c.is_auto) baseRow.push((e[`${c.id}_percent`]||0)+'%');
        else baseRow.push(e[`${c.id}_qntl`]||0);
      });
      baseRow.push((e.note||'').substring(0,15));
      return baseRow;
    });
    const baseWidths = [50,45,45,35,40,35,40,40];
    const bpWidths = cats.map(() => 35);
    addPdfTable(doc, headers, rows, [...baseWidths, ...bpWidths, 50]);
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
    purchases.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('FRK Purchases');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Party Name', key: 'party', width: 18 },
      { header: 'Qty (QNTL)', key: 'qty', width: 12 }, { header: 'Rate (₹/Q)', key: 'rate', width: 12 },
      { header: 'Amount (₹)', key: 'amount', width: 14 }, { header: 'Note', key: 'note', width: 16 }
    ];
    purchases.forEach(p => ws.addRow({ date: fmtDate(p.date), party: p.party_name||'', qty: p.quantity_qntl||0, rate: p.rate_per_qntl||0, amount: p.total_amount||0, note: p.note||'' }));
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
    purchases.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=frk_purchases_${Date.now()}.pdf`);
    // PDF will be sent via safePdfPipe
    addPdfHeader(doc, 'FRK Purchase Register');
    const tq = +purchases.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2);
    const ta = +purchases.reduce((s,p)=>s+(p.total_amount||0),0).toFixed(2);
    const headers = ['Date','Party','Qty(Q)','Rate(Rs.)','Amount(Rs.)','Note'];
    const rows = purchases.map(p => [fmtDate(p.date), (p.party_name||'').substring(0,25), p.quantity_qntl||0, p.rate_per_qntl||0, p.total_amount||0, (p.note||'').substring(0,20)]);
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
    sales.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
    const millingEntries = database.getMillingEntries(req.query);
    // Dynamic categories
    const cats = getBpCats();
    const products = cats.map(c => c.id);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('By-Product Sales');
    // Stock summary
    ws.columns = [
      { header: 'Product', key: 'product', width: 14 }, { header: 'Produced (Q)', key: 'produced', width: 14 },
      { header: 'Sold (Q)', key: 'sold', width: 12 }, { header: 'Available (Q)', key: 'available', width: 14 },
      { header: 'Revenue (₹)', key: 'revenue', width: 14 }
    ];
    products.forEach(p => {
      const cat = cats.find(c => c.id === p);
      const label = cat ? cat.name : p.charAt(0).toUpperCase()+p.slice(1);
      const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      ws.addRow({ product: label, produced, sold, available: +(produced-sold).toFixed(2), revenue });
    });
    // Add gap + sales detail
    ws.addRow({});
    const detailHeaderRow = ws.addRow({ product: 'Date', produced: 'Product', sold: 'Qty (Q)', available: 'Rate (₹/Q)', revenue: 'Amount (₹)' });
    detailHeaderRow.font = { bold: true };
    sales.forEach(s => ws.addRow({ product: fmtDate(s.date), produced: (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), sold: s.quantity_qntl||0, available: s.rate_per_qntl||0, revenue: s.total_amount||0 }));
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
    sales.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
    const millingEntries = database.getMillingEntries(req.query);
    // Dynamic categories
    const cats = getBpCats();
    const products = cats.map(c => c.id);
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.pdf`);
    addPdfHeader(doc, 'By-Product Stock & Sales Report');
    // Stock summary
    const sHeaders = ['Product','Produced(Q)','Sold(Q)','Available(Q)','Revenue(Rs.)'];
    const sRows = products.map(p => {
      const cat = cats.find(c => c.id === p);
      const label = cat ? cat.name : p.charAt(0).toUpperCase()+p.slice(1);
      const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
      const pSales = sales.filter(s => s.product === p);
      const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      return [label, produced, sold, +(produced-sold).toFixed(2), revenue];
    });
    addPdfTable(doc, sHeaders, sRows, [70, 70, 60, 70, 70]);
    doc.moveDown(1);
    // Sales detail
    doc.fontSize(11).font('Helvetica-Bold').text('Sales Detail', { align: 'left' });
    doc.moveDown(0.3);
    const headers = ['Date','Product','Qty(Q)','Rate(Rs.)','Amount(Rs.)','Buyer'];
    const tq = +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
    const ta = +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
    const rows = sales.map(s => [fmtDate(s.date), (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), s.quantity_qntl||0, s.rate_per_qntl||0, s.total_amount||0, (s.buyer_name||'').substring(0,20)]);
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
    entries.forEach(e => rows.push({ _rawDate: e.date||'', date: fmtDate(e.date), type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.mill_w||0)/100).toFixed(2), released_qntl: 0 }));
    millingEntries.forEach(e => rows.push({ _rawDate: e.date||'', date: fmtDate(e.date), type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
    rows.sort((a,b) => (a._rawDate).localeCompare(b._rawDate));
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
    entries.forEach(e => rows.push({ _rawDate: e.date||'', date: fmtDate(e.date), type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.mill_w||0)/100).toFixed(2), released_qntl: 0 }));
    millingEntries.forEach(e => rows.push({ _rawDate: e.date||'', date: fmtDate(e.date), type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
    rows.sort((a,b) => (a._rawDate).localeCompare(b._rawDate));
    let balance = 0;
    rows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
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
