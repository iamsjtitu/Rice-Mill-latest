const { v4: uuid } = require('uuid');

const STANDARD_OIL = { Raw: 22, Boiled: 25 };

module.exports = function(database) {
  const express = require('express');
  const router = express.Router();

  function ensure() { if (!database.data.oil_premium) database.data.oil_premium = []; }

  router.get('/api/oil-premium', (req, res) => {
    ensure();
    let items = [...database.data.oil_premium];
    const { kms_year, season, bran_type } = req.query;
    if (kms_year) items = items.filter(i => i.kms_year === kms_year);
    if (season) items = items.filter(i => i.season === season);
    if (bran_type) items = items.filter(i => i.bran_type === bran_type);
    items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json(items);
  });

  router.post('/api/oil-premium', (req, res) => {
    ensure();
    const data = { ...req.body };
    data.id = uuid().substring(0, 12);
    data.created_at = new Date().toISOString();
    data.updated_at = data.created_at;
    data.created_by = req.query.username || '';

    const branType = data.bran_type || 'Boiled';
    const standard = STANDARD_OIL[branType] || 25;
    const actual = parseFloat(data.actual_oil_pct || 0);
    const rate = parseFloat(data.rate || 0);
    const qty = parseFloat(data.qty_qtl || 0);

    data.standard_oil_pct = standard;
    data.difference_pct = +(actual - standard).toFixed(4);
    data.premium_amount = standard ? +(rate * (actual - standard) * qty / standard).toFixed(2) : 0;

    database.data.oil_premium.push(data);
    database.save();
    res.json(data);
  });

  router.put('/api/oil-premium/:id', (req, res) => {
    ensure();
    const idx = database.data.oil_premium.findIndex(i => i.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Not found' });

    const data = { ...req.body };
    data.updated_at = new Date().toISOString();
    data.updated_by = req.query.username || '';

    const branType = data.bran_type || 'Boiled';
    const standard = STANDARD_OIL[branType] || 25;
    const actual = parseFloat(data.actual_oil_pct || 0);
    const rate = parseFloat(data.rate || 0);
    const qty = parseFloat(data.qty_qtl || 0);

    data.standard_oil_pct = standard;
    data.difference_pct = +(actual - standard).toFixed(4);
    data.premium_amount = standard ? +(rate * (actual - standard) * qty / standard).toFixed(2) : 0;

    data.id = req.params.id;
    data.created_at = database.data.oil_premium[idx].created_at;
    data.created_by = database.data.oil_premium[idx].created_by;
    database.data.oil_premium[idx] = data;
    database.save();
    res.json({ success: true });
  });

  router.delete('/api/oil-premium/:id', (req, res) => {
    ensure();
    const len = database.data.oil_premium.length;
    database.data.oil_premium = database.data.oil_premium.filter(i => i.id !== req.params.id);
    if (database.data.oil_premium.length < len) { database.save(); return res.json({ success: true }); }
    res.status(404).json({ detail: 'Not found' });
  });

  router.get('/api/oil-premium/lookup-sale', (req, res) => {
    // v104.44.95 — Also return party_weight_qtl from party_weights register
    if (!database.data.bp_sale_register) database.data.bp_sale_register = [];
    if (!database.data.party_weights) database.data.party_weights = [];
    const { voucher_no, rst_no, kms_year } = req.query;
    if (!voucher_no && !rst_no) return res.status(400).json({ detail: 'voucher_no or rst_no required' });

    let sale = null;
    const sales = database.data.bp_sale_register.filter(s => s.product === 'Rice Bran');
    if (voucher_no) {
      sale = sales.find(s => s.voucher_no === voucher_no && (!kms_year || s.kms_year === kms_year));
    } else if (rst_no) {
      sale = sales.find(s => s.rst_no === rst_no && (!kms_year || s.kms_year === kms_year));
    }
    if (!sale) return res.status(404).json({ detail: 'Sale not found' });

    // Merge total party_weight (Qtl) for this voucher (Rice Bran)
    const pwEntries = (database.data.party_weights || []).filter(p =>
      p.product === 'Rice Bran' &&
      p.voucher_no === sale.voucher_no &&
      (!kms_year || p.kms_year === kms_year)
    );
    const totalPartyKg = pwEntries.reduce((s, p) => s + (parseFloat(p.party_net_weight_kg) || 0), 0);
    const out = { ...sale };
    out.party_weight_qtl = totalPartyKg ? Math.round((totalPartyKg / 100) * 100) / 100 : 0;
    out.party_weight_exists = pwEntries.length > 0 && totalPartyKg > 0;
    res.json(out);
  });

  // ---- EXCEL EXPORT ----
  router.get('/api/oil-premium/export/excel', async (req, res) => {
    try {
      ensure();
      const ExcelJS = require('exceljs');
      const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');
      const { fmtDate, applyConsolidatedExcelPolish} = require('./pdf_helpers');
      let items = [...database.data.oil_premium];
      const { kms_year, season, bran_type, date_from, date_to, party_name } = req.query;
      if (kms_year) items = items.filter(i => i.kms_year === kms_year);
      if (season) items = items.filter(i => i.season === season);
      if (bran_type) items = items.filter(i => i.bran_type === bran_type);
      if (date_from) items = items.filter(i => (i.date||'') >= date_from);
      if (date_to) items = items.filter(i => (i.date||'') <= date_to);
      if (party_name) items = items.filter(i => (i.party_name||'').toLowerCase().includes(party_name.toLowerCase()));
      items.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      const has = {
        voucher: items.some(i => i.voucher_no), rst: items.some(i => i.rst_no),
        remark: items.some(i => i.remark)
      };

      const cols = [{h:'S.No',k:'sno',w:5},{h:'Date',k:'date',w:10}];
      if (has.voucher) cols.push({h:'Voucher',k:'voucher',w:10});
      if (has.rst) cols.push({h:'RST',k:'rst',w:8});
      cols.push({h:'Type',k:'type',w:8},{h:'Party',k:'party',w:18},{h:'Rate',k:'rate',w:10},
        {h:'Qty(Qtl)',k:'qty',w:10},{h:'Std%',k:'std',w:9},{h:'Actual%',k:'actual',w:9},
        {h:'Diff%',k:'diff',w:9},{h:'Premium',k:'premium',w:14});
      if (has.remark) cols.push({h:'Remark',k:'remark',w:16});

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Oil Premium');
      ws.columns = cols.map(c => ({header:c.h, key:c.k, width:c.w}));
      items.forEach((item, i) => {
        const row = {sno:i+1, date:fmtDate(item.date), type:item.bran_type||'', party:item.party_name||'',
          rate:item.rate||0, qty:+(item.qty_qtl||0).toFixed(2), std:item.standard_oil_pct||0,
          actual:item.actual_oil_pct||0, diff:+(item.difference_pct||0).toFixed(2),
          premium:+(item.premium_amount||0).toFixed(2)};
        if (has.voucher) row.voucher = item.voucher_no||'';
        if (has.rst) row.rst = item.rst_no||'';
        if (has.remark) row.remark = item.remark||'';
        ws.addRow(row);
      });
      let ttl = `Oil Premium Register`;
      if (kms_year) ttl += ` - FY ${kms_year}`;
      addExcelTitle(ws, ttl, cols.length, database);
      styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename=${req.query.filename || `oil_premium_${Date.now()}.xlsx`}`);
      // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
      try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
      await wb.xlsx.write(res); res.end();
    } catch(e) { res.status(500).json({detail:'Export failed: '+e.message}); }
  });

  // ---- PDF EXPORT ----
  router.get('/api/oil-premium/export/pdf', async (req, res) => {
    try {
      ensure();
      const PDFDocument = require('pdfkit');
      const { addPdfHeader: _addPdfHeader, addPdfTable, safePdfPipe, fmtDate } = require('./pdf_helpers');
      const addPdfHeader = (doc, title) => _addPdfHeader(doc, title, database.getBranding ? database.getBranding() : {company_name:'Mill'});
      let items = [...database.data.oil_premium];
      const { kms_year, season, bran_type, date_from, date_to, party_name } = req.query;
      if (kms_year) items = items.filter(i => i.kms_year === kms_year);
      if (season) items = items.filter(i => i.season === season);
      if (bran_type) items = items.filter(i => i.bran_type === bran_type);
      if (date_from) items = items.filter(i => (i.date||'') >= date_from);
      if (date_to) items = items.filter(i => (i.date||'') <= date_to);
      if (party_name) items = items.filter(i => (i.party_name||'').toLowerCase().includes(party_name.toLowerCase()));
      items.sort((a,b) => (a.date||'').localeCompare(b.date||''));

      const has = {
        voucher: items.some(i => i.voucher_no), rst: items.some(i => i.rst_no)
      };

      const pc = [['S.No',22,'sno'],['Date',45,'date']];
      if (has.voucher) pc.push(['Voucher',45,'voucher_no']);
      if (has.rst) pc.push(['RST',30,'rst_no']);
      pc.push(['Type',35,'bran_type'],['Party',80,'party_name'],['Rate',42,'rate'],
        ['Qty(Q)',40,'qty_qtl'],['Std%',30,'standard_oil_pct'],['Actual%',38,'actual_oil_pct'],
        ['Diff%',35,'difference_pct'],['Premium',60,'premium_amount']);

      const doc = new PDFDocument({size:'A4',layout:'landscape',margin:20});
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename=${req.query.filename || `oil_premium_${Date.now()}.pdf`}`);
      let title = 'Oil Premium Register';
      if (kms_year) title += ` - FY ${kms_year}`;
      if (bran_type) title += ` (${bran_type})`;
      addPdfHeader(doc, title);

      const headers = pc.map(c => c[0]);
      const colWidths = pc.map(c => c[1]);
      const keys = pc.map(c => c[2]);
      const rows = items.map((item,i) => keys.map(k => {
        if (k === 'sno') return i+1;
        if (k === 'date') return fmtDate(item.date);
        if (k === 'party_name') return (item.party_name||'').substring(0,18);
        if (k === 'difference_pct') { const d=item[k]||0; return `${d>0?'+':''}${d.toFixed(2)}%`; }
        if (k === 'premium_amount') return Math.round(item[k]||0);
        if (k === 'qty_qtl') return (item[k]||0).toFixed(2);
        return item[k]||'';
      }));
      addPdfTable(doc, headers, rows, colWidths);
      await safePdfPipe(doc, res);
    } catch(e) { res.status(500).json({detail:'PDF failed: '+e.message}); }
  });

  return router;
};
