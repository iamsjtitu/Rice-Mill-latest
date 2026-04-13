const { v4: uuid } = require('uuid');

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function ensure() { if (!database.data.bp_sale_register) database.data.bp_sale_register = []; }

  router.get('/api/bp-sale-register', (req, res) => {
    ensure();
    let sales = [...database.data.bp_sale_register];
    const { product, kms_year, season } = req.query;
    if (product) sales = sales.filter(s => s.product === product);
    if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
    if (season) sales = sales.filter(s => s.season === season);
    sales.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(sales);
  });

  router.post('/api/bp-sale-register', (req, res) => {
    ensure();
    const data = { ...req.body };
    data.id = uuid().substring(0, 12);
    data.created_at = new Date().toISOString();
    data.updated_at = data.created_at;
    data.created_by = req.query.username || '';

    const nw = parseFloat(data.net_weight_kg || 0);
    const rate = parseFloat(data.rate_per_qtl || 0);
    const nwQtl = +(nw / 100).toFixed(4);
    const amount = +(nwQtl * rate).toFixed(2);
    data.net_weight_qtl = nwQtl;
    data.amount = amount;

    let taxAmt = 0;
    if (data.gst_percent) { taxAmt = +(amount * parseFloat(data.gst_percent || 0) / 100).toFixed(2); }
    data.tax_amount = taxAmt;
    data.total = +(amount + taxAmt).toFixed(2);

    const cash = parseFloat(data.cash_paid || 0);
    const diesel = parseFloat(data.diesel_paid || 0);
    const advance = parseFloat(data.advance || 0);
    data.cash_paid = cash;
    data.diesel_paid = diesel;
    data.advance = advance;
    data.balance = +(data.total - advance).toFixed(2);

    database.data.bp_sale_register.push(data);
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

    const nw = parseFloat(data.net_weight_kg || 0);
    const rate = parseFloat(data.rate_per_qtl || 0);
    const nwQtl = +(nw / 100).toFixed(4);
    const amount = +(nwQtl * rate).toFixed(2);
    data.net_weight_qtl = nwQtl;
    data.amount = amount;

    let taxAmt = 0;
    if (data.gst_percent) { taxAmt = +(amount * parseFloat(data.gst_percent || 0) / 100).toFixed(2); }
    data.tax_amount = taxAmt;
    data.total = +(amount + taxAmt).toFixed(2);

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
    database.save();
    res.json({ success: true });
  });

  router.delete('/api/bp-sale-register/:id', (req, res) => {
    ensure();
    const len = database.data.bp_sale_register.length;
    database.data.bp_sale_register = database.data.bp_sale_register.filter(s => s.id !== req.params.id);
    if (database.data.bp_sale_register.length < len) { database.save(); return res.json({ success: true }); }
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

  // ---- EXCEL EXPORT ----
  router.get('/api/bp-sale-register/export/excel', async (req, res) => {
    try {
      ensure();
      const ExcelJS = require('exceljs');
      const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
      const { fmtDate } = require('./pdf_helpers');
      let sales = [...database.data.bp_sale_register];
      const { product, kms_year, season } = req.query;
      if (product) sales = sales.filter(s => s.product === product);
      if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
      if (season) sales = sales.filter(s => s.season === season);
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${product || 'BP'} Sales`);
      ws.columns = [
        {header:'S.No',key:'sno',width:5},{header:'Date',key:'date',width:10},{header:'Bill No',key:'bill',width:10},
        {header:'RST',key:'rst',width:8},{header:'Vehicle',key:'vehicle',width:12},{header:'Bill From',key:'billfrom',width:14},
        {header:'Party',key:'party',width:16},{header:'Destination',key:'dest',width:14},
        {header:'N/W(Kg)',key:'nwkg',width:10},{header:'Bags',key:'bags',width:7},{header:'Rate/Q',key:'rate',width:9},
        {header:'Amount',key:'amount',width:12},{header:'Tax',key:'tax',width:9},{header:'Total',key:'total',width:12},
        {header:'Cash',key:'cash',width:9},{header:'Diesel',key:'diesel',width:9},{header:'Adv',key:'adv',width:8},{header:'Balance',key:'balance',width:12}
      ];
      sales.forEach((s, i) => {
        ws.addRow({sno:i+1,date:fmtDate(s.date),bill:s.bill_number||'',rst:s.rst_no||'',vehicle:s.vehicle_no||'',
          billfrom:s.bill_from||'',party:s.party_name||'',dest:s.destination||'',
          nwkg:s.net_weight_kg||0,bags:s.bags||0,rate:s.rate_per_qtl||0,
          amount:s.amount||0,tax:s.tax_amount||0,total:s.total||0,
          cash:s.cash_paid||0,diesel:s.diesel_paid||0,adv:s.advance||0,balance:s.balance||0});
      });
      addExcelTitle(ws, `${product || 'By-Product'} Sale Register`, 18, database);
      styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename=${(product||'bp').toLowerCase().replace(/ /g,'_')}_sales_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch(e) { res.status(500).json({detail:'Export failed: '+e.message}); }
  });

  // ---- PDF EXPORT ----
  router.get('/api/bp-sale-register/export/pdf', async (req, res) => {
    try {
      ensure();
      const PDFDocument = require('pdfkit');
      const { addPdfHeader: _addPdfHeader, addPdfTable, safePdfPipe, fmtDate } = require('./pdf_helpers');
      const addPdfHeader = (doc, title) => _addPdfHeader(doc, title, database.getBranding ? database.getBranding() : {company_name:'Mill'});
      let sales = [...database.data.bp_sale_register];
      const { product, kms_year, season } = req.query;
      if (product) sales = sales.filter(s => s.product === product);
      if (kms_year) sales = sales.filter(s => s.kms_year === kms_year);
      if (season) sales = sales.filter(s => s.season === season);
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      const doc = new PDFDocument({size:'A4',layout:'landscape',margin:20});
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename=${(product||'bp').toLowerCase().replace(/ /g,'_')}_sales_${Date.now()}.pdf`);
      let title = `${product || 'By-Product'} Sale Register`;
      if (kms_year) title += ` - FY ${kms_year}`;
      addPdfHeader(doc, title);
      const headers = ['S.No','Date','Bill','RST','Vehicle','Party','Dest','NW(Kg)','Bags','Rate/Q','Amount','Tax','Total','Cash','Diesel','Adv','Bal'];
      const rows = sales.map((s,i) => [i+1,fmtDate(s.date),s.bill_number||'',s.rst_no||'',s.vehicle_no||'',
        (s.party_name||'').substring(0,14),(s.destination||'').substring(0,10),
        s.net_weight_kg||0,s.bags||0,s.rate_per_qtl||0,
        Math.round(s.amount||0),Math.round(s.tax_amount||0),Math.round(s.total||0),
        s.cash_paid||0,s.diesel_paid||0,s.advance||0,Math.round(s.balance||0)]);
      addPdfTable(doc, headers, rows, [22,42,38,28,48,60,42,38,28,35,42,30,42,32,32,28,40]);
      await safePdfPipe(doc, res);
    } catch(e) { res.status(500).json({detail:'PDF failed: '+e.message}); }
  });

  return router;
};
