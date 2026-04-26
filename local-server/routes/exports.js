const express = require('express');
const { safeAsync, safeSync, roundAmount } = require('./safe_handler');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, addTotalsRow, addSectionTitle, fmtAmt, fmtDate, registerFonts, F , safePdfPipe, drawSummaryBanner, drawSectionBand, ensureSpace, addExcelSummaryBanner, STAT_COLORS, fmtInr} = require('./pdf_helpers');
const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    branding._watermark = ((database.data || {}).app_settings || []).find(s => s.setting_id === 'watermark');
    _addPdfHeader(doc, title, branding);
  }

  // ===== ENTRIES EXPORT =====
  router.get('/api/export/excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Mill Entries');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Truck No', key: 'truck_no', width: 14 },
        { header: 'RST No', key: 'rst_no', width: 10 }, { header: 'TP No', key: 'tp_no', width: 10 },
        { header: 'TP Wt (Q)', key: 'tp_weight', width: 10 },
        { header: 'Agent', key: 'agent_name', width: 14 }, { header: 'Mandi', key: 'mandi_name', width: 22 },
        { header: 'QNTL', key: 'qntl', width: 10 }, { header: 'BAG', key: 'bag', width: 8 },
        { header: 'G.Dep', key: 'g_deposite', width: 8 }, { header: 'GBW Cut', key: 'gbw_cut', width: 10 },
        { header: 'P.Pkt', key: 'plastic_bag', width: 8 }, { header: 'P.Cut', key: 'p_pkt_cut', width: 10 },
        { header: 'Mill W', key: 'mill_w', width: 12 }, { header: 'Moist%', key: 'moisture', width: 9 },
        { header: 'M.Cut', key: 'moisture_cut', width: 9 }, { header: 'Cut%', key: 'cutting_percent', width: 8 },
        { header: 'D/D/P', key: 'disc_dust_poll', width: 8 }, { header: 'Final W', key: 'final_w', width: 12 },
        { header: 'G.Issued', key: 'g_issued', width: 10 }
      ];
      entries.forEach(e => ws.addRow({ date: fmtDate(e.date), truck_no: e.truck_no, rst_no: e.rst_no || '', tp_no: e.tp_no || '', tp_weight: parseFloat(e.tp_weight || 0) || 0, agent_name: e.agent_name, mandi_name: e.mandi_name, qntl: +(e.qntl||0).toFixed(2), bag: e.bag||0, g_deposite: e.g_deposite||0, gbw_cut: +((e.gbw_cut||0)/100).toFixed(2), plastic_bag: e.plastic_bag||0, p_pkt_cut: +((e.p_pkt_cut||0)/100).toFixed(2), mill_w: +((e.mill_w||0)/100).toFixed(2), moisture: e.moisture||0, moisture_cut: +((e.moisture_cut||0)/100).toFixed(2), cutting_percent: e.cutting_percent||0, disc_dust_poll: e.disc_dust_poll||0, final_w: +((e.final_w||0)/100).toFixed(2), g_issued: e.g_issued||0 }));

      // Add totals row
      if (entries.length > 0) {
        const totals = {
          date: 'TOTAL', truck_no: '', rst_no: '', tp_no: '',
          tp_weight: +entries.reduce((s,e) => s+(parseFloat(e.tp_weight||0)||0), 0).toFixed(2),
          agent_name: '', mandi_name: `${entries.length} entries`,
          qntl: +entries.reduce((s,e) => s+(e.qntl||0), 0).toFixed(2),
          bag: entries.reduce((s,e) => s+(e.bag||0), 0),
          g_deposite: entries.reduce((s,e) => s+(e.g_deposite||0), 0),
          gbw_cut: +entries.reduce((s,e) => s+((e.gbw_cut||0)/100), 0).toFixed(2),
          plastic_bag: entries.reduce((s,e) => s+(e.plastic_bag||0), 0),
          p_pkt_cut: +entries.reduce((s,e) => s+((e.p_pkt_cut||0)/100), 0).toFixed(2),
          mill_w: +entries.reduce((s,e) => s+((e.mill_w||0)/100), 0).toFixed(2),
          moisture: '', moisture_cut: +entries.reduce((s,e) => s+((e.moisture_cut||0)/100), 0).toFixed(2),
          cutting_percent: '', disc_dust_poll: '',
          final_w: +entries.reduce((s,e) => s+((e.final_w||0)/100), 0).toFixed(2),
          g_issued: entries.reduce((s,e) => s+(e.g_issued||0), 0)
        };
        const totalRow = ws.addRow(totals);
        totalRow.eachCell(c => { c.font = { bold: true, size: 10, color: { argb: 'FF92400E' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }; });
        // Light-themed summary banner
        addExcelSummaryBanner(ws, totalRow.number + 2, 20, [
          { lbl: 'Total Entries', val: String(entries.length) },
          { lbl: 'QNTL', val: totals.qntl.toFixed(2) },
          { lbl: 'Bags', val: String(totals.bag) },
          { lbl: 'TP Wt', val: totals.tp_weight.toFixed(2) },
          { lbl: 'Mill W', val: totals.mill_w.toFixed(2) },
          { lbl: 'Final W', val: totals.final_w.toFixed(2) },
          { lbl: 'G.Deposite', val: String(totals.g_deposite) },
          { lbl: 'G.Issued', val: String(totals.g_issued) },
        ]);
      }

      addExcelTitle(ws, req.query.report_title || 'Mill Entries Report', 20, database); styleExcelHeader(ws); styleExcelData(ws, 5);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/export/pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 20 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe
      addPdfHeader(doc, req.query.report_title || 'Mill Entries Report');
      const h = ['Date','Truck','RST','TP','TP Wt','Agent','Mandi','QNTL','BAG','G.Dep','GBW','P.Pkt','P.Cut','Mill W','M%','M.Cut','C%','D/D/P','Final W','G.Iss'];
      const w = [40,46,28,26,28,36,60,32,26,26,28,26,28,34,24,28,24,26,34,28];
      const rows = entries.map(e => [fmtDate(e.date),e.truck_no||'',e.rst_no||'',e.tp_no||'',parseFloat(e.tp_weight||0)||0?(parseFloat(e.tp_weight||0)).toFixed(1):'-',e.agent_name||'',e.mandi_name||'',(e.qntl||0).toFixed(2),e.bag||0,e.g_deposite||0,((e.gbw_cut||0)/100).toFixed(2),e.plastic_bag||0,((e.p_pkt_cut||0)/100).toFixed(2),((e.mill_w||0)/100).toFixed(2),e.moisture||0,((e.moisture_cut||0)/100).toFixed(2),e.cutting_percent||0,e.disc_dust_poll||0,((e.final_w||0)/100).toFixed(2),e.g_issued||0]);
      addPdfTable(doc, h, rows, w);

      // Totals row
      if (entries.length > 0) {
        const tQntl = entries.reduce((s,e) => s+(e.qntl||0), 0);
        const tBag = entries.reduce((s,e) => s+(e.bag||0), 0);
        const tGDep = entries.reduce((s,e) => s+(e.g_deposite||0), 0);
        const tGbw = entries.reduce((s,e) => s+((e.gbw_cut||0)/100), 0);
        const tPPkt = entries.reduce((s,e) => s+(e.plastic_bag||0), 0);
        const tPCut = entries.reduce((s,e) => s+((e.p_pkt_cut||0)/100), 0);
        const tMillW = entries.reduce((s,e) => s+((e.mill_w||0)/100), 0);
        const tMCut = entries.reduce((s,e) => s+((e.moisture_cut||0)/100), 0);
        const tFinalW = entries.reduce((s,e) => s+((e.final_w||0)/100), 0);
        const tGIss = entries.reduce((s,e) => s+(e.g_issued||0), 0);
        const tTpWt = entries.reduce((s,e) => s+(parseFloat(e.tp_weight||0)||0), 0);
        addTotalsRow(doc, ['TOTAL','','','',tTpWt > 0 ? tTpWt.toFixed(2) : '-','',`${entries.length} entries`,tQntl.toFixed(2),tBag,tGDep,tGbw.toFixed(2),tPPkt,tPCut.toFixed(2),tMillW.toFixed(2),'',tMCut.toFixed(2),'','',tFinalW.toFixed(2),tGIss], w);
        // Light-themed summary banner
        const tableW = w.reduce((a, b) => a + b, 0);
        if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        drawSummaryBanner(doc, [
          { lbl: 'TOTAL ENTRIES', val: String(entries.length), color: STAT_COLORS.primary },
          { lbl: 'QNTL', val: tQntl.toFixed(2), color: STAT_COLORS.gold },
          { lbl: 'BAGS', val: String(tBag), color: STAT_COLORS.blue },
          { lbl: 'TP WEIGHT', val: tTpWt > 0 ? tTpWt.toFixed(2) : '-', color: STAT_COLORS.purple },
          { lbl: 'MILL W', val: tMillW.toFixed(2), color: STAT_COLORS.orange },
          { lbl: 'FINAL W', val: tFinalW.toFixed(2), color: STAT_COLORS.emerald },
          { lbl: 'G.DEPOSITE', val: String(tGDep), color: STAT_COLORS.green },
          { lbl: 'G.ISSUED', val: String(tGIss), color: STAT_COLORS.red },
        ], doc.page.margins.left, doc.y + 6, tableW);
      }

      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== TRUCK PAYMENTS EXPORT =====
  router.get('/api/export/truck-payments-excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Truck Payments');
      ws.columns = [{header:'Date',key:'date',width:12},{header:'Truck No',key:'truck_no',width:14},{header:'Mandi',key:'mandi',width:22},{header:'Final QNTL',key:'fq',width:12},{header:'Rate',key:'rate',width:8},{header:'Gross',key:'gross',width:12},{header:'Cash',key:'cash',width:10},{header:'Diesel',key:'diesel',width:10},{header:'Deductions',key:'ded',width:12},{header:'Net',key:'net',width:12},{header:'Paid',key:'paid',width:10},{header:'Balance',key:'bal',width:12},{header:'Status',key:'status',width:10}];
      let tg=0,tded=0,tn=0,tp=0,tb=0,paidCnt=0,partCnt=0,pendCnt=0;
      entries.forEach(e => { const p=database.getTruckPayment(e.id); const fq=(e.qntl||0)-(e.bag||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); const st=b<0.10?'Paid':(p.paid_amount>0?'Partial':'Pending'); ws.addRow({date:fmtDate(e.date),truck_no:e.truck_no,mandi:e.mandi_name,fq:+fq.toFixed(2),rate:p.rate_per_qntl,gross:+g.toFixed(2),cash:e.cash_paid||0,diesel:e.diesel_paid||0,ded:+d.toFixed(2),net:+n.toFixed(2),paid:p.paid_amount,bal:+b.toFixed(2),status:st}); tg+=g;tded+=d;tn+=n;tp+=p.paid_amount;tb+=b; if(st==='Paid')paidCnt++;else if(st==='Partial')partCnt++;else pendCnt++; });
      addExcelTitle(ws, 'Truck Payments', 13, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      // Light-themed summary banner
      if (entries.length > 0) {
        addExcelSummaryBanner(ws, ws.lastRow.number + 2, 13, [
          { lbl: 'Total Trucks', val: String(entries.length) },
          { lbl: 'Paid', val: String(paidCnt) },
          { lbl: 'Partial', val: String(partCnt) },
          { lbl: 'Pending', val: String(pendCnt) },
          { lbl: 'Gross', val: fmtInr(tg) },
          { lbl: 'Total Paid', val: fmtInr(tp) },
          { lbl: 'Outstanding', val: fmtInr(tb) },
        ]);
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/export/truck-payments-pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      entries.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.pdf`);
      addPdfHeader(doc, 'Truck Payments Report');
      const h = ['Date','Truck','Mandi','Final QNTL','Rate','Gross','Ded','Net','Paid','Balance','Status'];
      let tg=0,tded=0,tn=0,tp=0,tb=0,paidCnt=0,partCnt=0,pendCnt=0;
      const rows = entries.map(e => { const p=database.getTruckPayment(e.id); const fq=(e.qntl||0)-(e.bag||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); const st=b<0.10?'Paid':(p.paid_amount>0?'Partial':'Pending'); tg+=g;tded+=d;tn+=n;tp+=p.paid_amount;tb+=b; if(st==='Paid')paidCnt++;else if(st==='Partial')partCnt++;else pendCnt++; return [fmtDate(e.date),e.truck_no,e.mandi_name,fq.toFixed(2),p.rate_per_qntl,g.toFixed(2),d.toFixed(2),n.toFixed(2),p.paid_amount,b.toFixed(2),st]; });
      const w = [50,55,55,45,35,50,50,50,45,50,40];
      addPdfTable(doc, h, rows, w);
      // Light-themed summary banner
      if (entries.length > 0) {
        const tableW = w.reduce((a, b) => a + b, 0);
        if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        drawSummaryBanner(doc, [
          { lbl: 'TOTAL TRUCKS', val: String(entries.length), color: STAT_COLORS.primary },
          { lbl: 'PAID', val: String(paidCnt), color: STAT_COLORS.emerald },
          { lbl: 'PARTIAL', val: String(partCnt), color: STAT_COLORS.orange },
          { lbl: 'PENDING', val: String(pendCnt), color: STAT_COLORS.red },
          { lbl: 'GROSS', val: fmtInr(tg), color: STAT_COLORS.gold },
          { lbl: 'TOTAL PAID', val: fmtInr(tp), color: STAT_COLORS.green },
          { lbl: 'OUTSTANDING', val: fmtInr(tb), color: STAT_COLORS.blue },
        ], doc.page.margins.left, doc.y + 6, tableW);
      }
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== AGENT PAYMENTS EXPORT =====
  router.get('/api/export/agent-payments-excel', safeAsync(async (req, res) => {
    try {
      const targets = database.getMandiTargets(req.query); const entries = database.getEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Agent Payments');
      ws.columns = [{header:'Mandi',key:'mandi',width:22},{header:'Agent',key:'agent',width:14},{header:'Target',key:'target',width:12},{header:'Cutting',key:'cutting',width:12},{header:'B.Rate',key:'br',width:10},{header:'C.Rate',key:'cr',width:10},{header:'Total',key:'total',width:12},{header:'TP Wt',key:'tpw',width:12},{header:'Achieved',key:'ach',width:12},{header:'Excess',key:'excess',width:12},{header:'Paid',key:'paid',width:10},{header:'Balance',key:'bal',width:12},{header:'Status',key:'status',width:10}];
      let tt=0,tp=0,tb=0,paidCnt=0,partCnt=0,pendCnt=0;
      targets.forEach(t => { const me=entries.filter(e=>e.mandi_name.toLowerCase()===t.mandi_name.toLowerCase()); const ach=me.reduce((s,e)=>s+(e.final_w||0)/100,0); const tpw=me.reduce((s,e)=>s+parseFloat(e.tp_weight||0),0); const cq=tpw*t.cutting_percent/100; const excess=+(ach-(t.target_qntl+t.target_qntl*t.cutting_percent/100)).toFixed(2); const tot=(tpw*(t.base_rate??10))+(cq*(t.cutting_rate??5)); const p=database.getAgentPayment(t.mandi_name,t.kms_year,t.season); const bal=Math.max(0,tot-p.paid_amount); const st=bal<0.01?'Paid':(p.paid_amount>0?'Partial':'Pending'); const ae=me.find(e=>e.agent_name); ws.addRow({mandi:t.mandi_name,agent:ae?ae.agent_name:'',target:t.target_qntl,cutting:+cq.toFixed(2),br:t.base_rate??10,cr:t.cutting_rate??5,total:+tot.toFixed(2),tpw:+tpw.toFixed(2),ach:+ach.toFixed(2),excess:excess,paid:p.paid_amount,bal:+bal.toFixed(2),status:st}); tt+=tot;tp+=p.paid_amount;tb+=bal; if(st==='Paid')paidCnt++;else if(st==='Partial')partCnt++;else pendCnt++; });
      addExcelTitle(ws, 'Agent Payments', 13, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      // Light-themed summary banner
      if (targets.length > 0) {
        addExcelSummaryBanner(ws, ws.lastRow.number + 2, 13, [
          { lbl: 'Total Mandis', val: String(targets.length) },
          { lbl: 'Paid', val: String(paidCnt) },
          { lbl: 'Partial', val: String(partCnt) },
          { lbl: 'Pending', val: String(pendCnt) },
          { lbl: 'Total Amount', val: fmtInr(tt) },
          { lbl: 'Paid Amount', val: fmtInr(tp) },
          { lbl: 'Outstanding', val: fmtInr(tb) },
        ]);
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/export/agent-payments-pdf', safeSync(async (req, res) => {
    try {
      const targets = database.getMandiTargets(req.query); const entries = database.getEntries(req.query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.pdf`);
      addPdfHeader(doc, 'Agent Payments Report');
      const h = ['Mandi','Agent','Target','Cutting','B.Rate','C.Rate','Total','TP Wt','Achieved','Excess','Paid','Balance','Status'];
      let tt=0,tp=0,tb=0,paidCnt=0,partCnt=0,pendCnt=0;
      const rows = targets.map(t => { const me=entries.filter(e=>e.mandi_name.toLowerCase()===t.mandi_name.toLowerCase()); const ach=me.reduce((s,e)=>s+(e.final_w||0)/100,0); const tpw=me.reduce((s,e)=>s+parseFloat(e.tp_weight||0),0); const cq=tpw*t.cutting_percent/100; const excess=(ach-(t.target_qntl+t.target_qntl*t.cutting_percent/100)).toFixed(2); const tot=(tpw*(t.base_rate??10))+(cq*(t.cutting_rate??5)); const p=database.getAgentPayment(t.mandi_name,t.kms_year,t.season); const bal=Math.max(0,tot-p.paid_amount); const st=bal<0.01?'Paid':(p.paid_amount>0?'Partial':'Pending'); tt+=tot;tp+=p.paid_amount;tb+=bal; if(st==='Paid')paidCnt++;else if(st==='Partial')partCnt++;else pendCnt++; const ae=me.find(e=>e.agent_name); return [t.mandi_name,ae?ae.agent_name:'',t.target_qntl,cq.toFixed(2),t.base_rate??10,t.cutting_rate??5,tot.toFixed(2),tpw.toFixed(2),ach.toFixed(2),excess,p.paid_amount,bal.toFixed(2),st]; });
      const w = [50,45,35,35,30,30,45,40,40,40,40,45,35];
      addPdfTable(doc, h, rows, w);
      // Light-themed summary banner
      if (targets.length > 0) {
        const tableW = w.reduce((a, b) => a + b, 0);
        if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        drawSummaryBanner(doc, [
          { lbl: 'TOTAL MANDIS', val: String(targets.length), color: STAT_COLORS.primary },
          { lbl: 'PAID', val: String(paidCnt), color: STAT_COLORS.emerald },
          { lbl: 'PARTIAL', val: String(partCnt), color: STAT_COLORS.orange },
          { lbl: 'PENDING', val: String(pendCnt), color: STAT_COLORS.red },
          { lbl: 'TOTAL AMT', val: fmtInr(tt), color: STAT_COLORS.gold },
          { lbl: 'PAID AMT', val: fmtInr(tp), color: STAT_COLORS.green },
          { lbl: 'OUTSTANDING', val: fmtInr(tb), color: STAT_COLORS.blue },
        ], doc.page.margins.left, doc.y + 6, tableW);
      }
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== DASHBOARD PDF EXPORT =====
  router.get('/api/export/dashboard-pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const filterLabel = req.query.filter || 'all';
      const showStock = !req.query.filter || req.query.filter === 'all' || req.query.filter === 'stock';
      const showTargets = !req.query.filter || req.query.filter !== 'stock';
      const targetMandi = req.query.filter && req.query.filter !== 'all' && req.query.filter !== 'stock' ? req.query.filter : null;

      const doc = new PDFDocument({ size: 'A4', margin: 25 });
      registerFonts(doc);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=dashboard_${filterLabel}_${Date.now()}.pdf`);
      addPdfHeader(doc, 'Dashboard Report');

      // Sub-header
      doc.fontSize(8.5).font(F('bold')).fillColor('#475569')
        .text(`DASHBOARD REPORT  |  FY: ${req.query.kms_year || 'All'}  |  Season: ${req.query.season || 'All'}  |  Filter: ${filterLabel}  |  ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
          { align: 'center' });
      doc.moveDown(0.6);

      // ============================================================
      // Compute STOCK + TARGETS data
      // ============================================================
      const cmrPaddy = Math.round(entries.reduce((s, e) => s + (e.final_w || 0), 0) / 100 * 100) / 100;

      let pvtEntries = database.data.private_paddy || [];
      if (req.query.kms_year) pvtEntries = pvtEntries.filter(e => e.kms_year === req.query.kms_year);
      if (req.query.season) pvtEntries = pvtEntries.filter(e => e.season === req.query.season);
      pvtEntries = pvtEntries.filter(e => e.source !== 'agent_extra');
      const pvtPaddy = Math.round(pvtEntries.reduce((s, e) => s + ((e.qntl || 0) - (e.bag || 0) / 100), 0) * 100) / 100;
      const totalPaddyIn = Math.round((cmrPaddy + pvtPaddy) * 100) / 100;

      const millingEntries = database.getMillingEntries(req.query);
      const paddyUsed = Math.round(millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0) * 100) / 100;
      const riceRaw = Math.round(millingEntries.filter(e => !e.product_type || e.product_type === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0) * 100) / 100;
      const riceUsna = Math.round(millingEntries.filter(e => e.product_type === 'usna').reduce((s, e) => s + (e.rice_qntl || 0), 0) * 100) / 100;
      const frk = Math.round(millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0) * 100) / 100;
      const byproduct = Math.round(millingEntries.reduce((s, e) => s + (e.bran_qntl || 0) + (e.kunda_qntl || 0), 0) * 100) / 100;
      const paddyAvail = Math.round((totalPaddyIn - paddyUsed) * 100) / 100;

      let gunnyEntries = database.data.gunny_bags || [];
      if (req.query.kms_year) gunnyEntries = gunnyEntries.filter(e => e.kms_year === req.query.kms_year);
      if (req.query.season) gunnyEntries = gunnyEntries.filter(e => e.season === req.query.season);
      const gunnyIn = gunnyEntries.filter(e => e.txn_type === 'in').reduce((s, e) => s + (e.quantity || 0), 0);
      const gunnyOut = gunnyEntries.filter(e => e.txn_type === 'out').reduce((s, e) => s + (e.quantity || 0), 0);

      // Targets
      let targets = database.getMandiTargets(req.query);
      if (targetMandi) targets = targets.filter(t => t.mandi_name === targetMandi);
      let totTarget = 0, totExpected = 0, totAchieved = 0, totPending = 0, totAgent = 0;
      const targetRows = [];
      for (const t of targets) {
        const mandiEntries = entries.filter(e => (e.mandi_name || '').toLowerCase() === (t.mandi_name || '').toLowerCase());
        const achieved = Math.round(mandiEntries.reduce((s, e) => s + (e.final_w || 0) / 100, 0) * 100) / 100;
        // TP weight (sum of tp_weight column) — used for agent commission, NOT target_qntl
        const tpw = mandiEntries.reduce((s, e) => s + parseFloat(e.tp_weight || 0), 0);
        const expected = t.expected_total || t.target_qntl;
        const pending = Math.round(Math.max(0, expected - achieved) * 100) / 100;
        const progress = expected > 0 ? Math.round(achieved / expected * 1000) / 10 : 0;
        // Use ?? (not ||) so explicit 0 rates are respected. cutting_percent on TP weight.
        const cuttingPct = t.cutting_percent ?? 0;
        const baseRate = t.base_rate ?? 10;
        const cuttingRate = t.cutting_rate ?? 5;
        const cuttingQ = Math.round(tpw * cuttingPct / 100 * 100) / 100;
        const agentAmt = Math.round((tpw * baseRate) + (cuttingQ * cuttingRate));
        totTarget += t.target_qntl; totExpected += expected;
        totAchieved += achieved; totPending += pending; totAgent += agentAmt;
        targetRows.push({ t, achieved, expected, pending, progress, agentAmt });
      }
      const overallProgress = totExpected > 0 ? Math.round(totAchieved / totExpected * 1000) / 10 : 0;
      const progressColor = overallProgress >= 100 ? STAT_COLORS.green : (overallProgress >= 50 ? STAT_COLORS.gold : STAT_COLORS.red);
      const availColor = paddyAvail >= 0 ? STAT_COLORS.emerald : STAT_COLORS.red;

      // ============================================================
      // KPI HERO BANNER
      // ============================================================
      const kpis = [];
      if (showStock) {
        kpis.push({ lbl: 'PADDY IN', val: `${totalPaddyIn.toFixed(1)} Q`, color: STAT_COLORS.blue });
        kpis.push({ lbl: 'PADDY USED', val: `${paddyUsed.toFixed(1)} Q`, color: STAT_COLORS.orange });
        kpis.push({ lbl: 'AVAILABLE', val: `${paddyAvail.toFixed(1)} Q`, color: availColor });
        kpis.push({ lbl: 'RICE PRODUCED', val: `${(riceRaw + riceUsna).toFixed(1)} Q`, color: STAT_COLORS.purple });
      }
      if (showTargets && targets.length) {
        kpis.push({ lbl: 'TARGETS', val: `${Math.round(totExpected)} Q`, color: STAT_COLORS.gold });
        kpis.push({ lbl: 'ACHIEVED', val: `${Math.round(totAchieved)} Q (${overallProgress}%)`, color: progressColor });
        kpis.push({ lbl: 'PENDING', val: `${Math.round(totPending)} Q`, color: STAT_COLORS.red });
      }
      if (kpis.length) {
        const margin = 25;
        const bannerW = doc.page.width - margin * 2;
        const newY = drawSummaryBanner(doc, kpis, margin, doc.y, bannerW);
        doc.y = newY + 8;
      }

      const outline = doc.outline;

      // ---- STOCK SECTION ----
      if (showStock) {
        ensureSpace(doc, 170);
        if (outline) outline.addItem('Stock Overview');
        drawSectionBand(doc, 'Stock Overview', {
          subtitle: `FY ${req.query.kms_year || 'All'} · ${req.query.season || 'All'}`,
          preset: 'orange',
        });

        const stockHeaders = ['Item', 'Source', 'IN', 'OUT/Used', 'Available', 'Unit'];
        const stockRows = [
          ['Paddy', 'CMR (Mill Entry)', cmrPaddy.toFixed(2), '—', '—', 'Qntl'],
          ['Paddy', 'Private Purchase', pvtPaddy.toFixed(2), '—', '—', 'Qntl'],
          ['TOTAL PADDY', '', totalPaddyIn.toFixed(2), paddyUsed.toFixed(2), paddyAvail.toFixed(2), 'Qntl'],
          ['Rice (Raw)', 'Milling', riceRaw.toFixed(2), '—', riceRaw.toFixed(2), 'Qntl'],
          ['Rice (Usna)', 'Milling', riceUsna.toFixed(2), '—', riceUsna.toFixed(2), 'Qntl'],
          ['FRK', 'Milling', frk.toFixed(2), '—', frk.toFixed(2), 'Qntl'],
          ['By-Products', 'Milling', byproduct.toFixed(2), '—', byproduct.toFixed(2), 'Qntl'],
          ['Gunny Bags', 'All Sources', String(gunnyIn), String(gunnyOut), String(gunnyIn - gunnyOut), 'Bags'],
        ];
        // Use percentage-based widths so table fills page (matches Python redesign)
        const pageW = doc.page.width - 50;
        const sw = [0.18, 0.22, 0.16, 0.16, 0.18, 0.10].map(w => Math.floor(pageW * w));
        addPdfTable(doc, stockHeaders, stockRows, sw, { fontSize: 8 });
        doc.moveDown(0.4);
      }

      // ---- TARGETS SECTION ----
      if (showTargets) {
        ensureSpace(doc, 130);
        if (outline) outline.addItem(targetMandi ? `Mandi Targets · ${targetMandi}` : 'Mandi Targets');
        drawSectionBand(doc, targetMandi ? `Mandi Targets · ${targetMandi}` : 'Mandi Targets', {
          subtitle: targets.length ? `Overall: ${overallProgress}% achieved` : null,
          preset: 'teal',
        });

        if (targetRows.length > 0) {
          const tgtHeaders = ['Mandi', 'Target (Q)', 'Cut %', 'Expected (Q)', 'Achieved (Q)', 'Pending (Q)', 'Progress', 'Agent Amt'];
          const tgtRowsData = targetRows.map(({ t, achieved, expected, pending, progress, agentAmt }) =>
            [t.mandi_name, t.target_qntl.toFixed(1), `${t.cutting_percent}%`,
              expected.toFixed(1), achieved.toFixed(1), pending.toFixed(1),
              `${progress}%`, `Rs.${fmtAmt(agentAmt)}`]
          );
          tgtRowsData.push(['TOTAL', totTarget.toFixed(1), '—', totExpected.toFixed(1),
            totAchieved.toFixed(1), totPending.toFixed(1), `${overallProgress}%`, `Rs.${fmtAmt(totAgent)}`]);

          const pageW = doc.page.width - 50;
          const tw = [0.16, 0.10, 0.07, 0.13, 0.13, 0.13, 0.12, 0.16].map(w => Math.floor(pageW * w));
          addPdfTable(doc, tgtHeaders, tgtRowsData, tw, { fontSize: 8 });
        } else {
          doc.fontSize(9).font(F('normal')).fillColor('#64748b').text('Koi target set nahi hai', { align: 'center' });
        }
      }

      // Footer
      doc.moveDown(1.2);
      const branding = database.getBranding ? database.getBranding() : {};
      doc.fontSize(7.5).font(F('normal')).fillColor('#94a3b8')
        .text(`Generated by ${branding.company_name || 'Mill Entry System'}  ·  ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
          { align: 'center' });
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== SUMMARY REPORT =====
  router.get('/api/export/summary-report-pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);

      // ============================================================
      // Compute ALL data first
      // ============================================================
      // STOCK
      const cmrPaddy = Math.round(entries.reduce((s, e) => s + (e.final_w || 0), 0) / 100 * 100) / 100;
      let pvtEntries = database.data.private_paddy || [];
      if (req.query.kms_year) pvtEntries = pvtEntries.filter(e => e.kms_year === req.query.kms_year);
      if (req.query.season) pvtEntries = pvtEntries.filter(e => e.season === req.query.season);
      pvtEntries = pvtEntries.filter(e => e.source !== 'agent_extra');
      const pvtPaddy = Math.round(pvtEntries.reduce((s, e) => s + ((e.qntl || 0) - (e.bag || 0) / 100), 0) * 100) / 100;
      const totalPaddyIn = Math.round((cmrPaddy + pvtPaddy) * 100) / 100;
      const millingEntries = database.getMillingEntries(req.query);
      const paddyUsed = Math.round(millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0) * 100) / 100;
      const riceRaw = Math.round(millingEntries.filter(e => !e.product_type || e.product_type === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0) * 100) / 100;
      const riceUsna = Math.round(millingEntries.filter(e => e.product_type === 'usna').reduce((s, e) => s + (e.rice_qntl || 0), 0) * 100) / 100;
      const frk = Math.round(millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0) * 100) / 100;
      const paddyAvail = Math.round((totalPaddyIn - paddyUsed) * 100) / 100;
      let gunnyEntries = database.data.gunny_bags || [];
      if (req.query.kms_year) gunnyEntries = gunnyEntries.filter(e => e.kms_year === req.query.kms_year);
      if (req.query.season) gunnyEntries = gunnyEntries.filter(e => e.season === req.query.season);
      const gunnyIn = gunnyEntries.filter(e => e.txn_type === 'in').reduce((s, e) => s + (e.quantity || 0), 0);
      const gunnyOut = gunnyEntries.filter(e => e.txn_type === 'out').reduce((s, e) => s + (e.quantity || 0), 0);

      // TARGETS
      let targets = database.getMandiTargets(req.query);
      if (!targets.length && (req.query.kms_year || req.query.season)) {
        targets = database.getMandiTargets({});
      }
      let totT = 0, totE = 0, totA = 0, totP = 0;
      const targetCalc = [];
      for (const t of targets) {
        const mEntries = entries.filter(e => (e.mandi_name || '').toLowerCase() === (t.mandi_name || '').toLowerCase());
        const achieved = Math.round(mEntries.reduce((s, e) => s + (e.final_w || 0) / 100, 0) * 100) / 100;
        const expected = t.expected_total || t.target_qntl;
        const pending = Math.round(Math.max(0, expected - achieved) * 100) / 100;
        const pr = expected > 0 ? Math.round(achieved / expected * 1000) / 10 : 0;
        totT += t.target_qntl; totE += expected; totA += achieved; totP += pending;
        targetCalc.push({ t, achieved, expected, pending, pr });
      }
      const overallProgress = totE > 0 ? Math.round(totA / totE * 1000) / 10 : 0;

      // TRUCK PAYMENTS
      let truckNet = 0, truckPaid = 0, truckBal = 0;
      const truckRowsData = [];
      for (const e of entries) {
        const p = database.getTruckPayment ? database.getTruckPayment(e.id) : { rate_per_qntl: 0, paid_amount: 0 };
        const rate = p.rate_per_qntl ?? 0;
        const paid = p.paid_amount || 0;
        const fq = (e.qntl || 0) - (e.bag || 0) / 100;
        const cash = e.cash_paid || 0; const diesel = e.diesel_paid || 0;
        const net = Math.round((fq * rate - cash - diesel) * 100) / 100;
        const bal = Math.round(Math.max(0, net - paid) * 100) / 100;
        truckNet += net; truckPaid += paid; truckBal += bal;
        truckRowsData.push([
          fmtDate(e.date), String(e.truck_no || '').slice(0, 12), String(e.mandi_name || '').slice(0, 16),
          fq.toFixed(2), `Rs.${fmtAmt(net)}`, `Rs.${fmtAmt(paid)}`, `Rs.${fmtAmt(bal)}`,
          bal < 0.10 ? 'Paid' : 'Pending',
        ]);
      }

      // AGENT PAYMENTS — use TP weight (achieved procurement) + respect explicit 0 rates
      let agentAmt = 0, agentPaid = 0, agentBal = 0;
      const agentRowsData = [];
      for (const t of targets) {
        // TP weight from mill entries for this mandi
        const mandiEntries = entries.filter(e => (e.mandi_name || '').toLowerCase() === (t.mandi_name || '').toLowerCase());
        const tpw = mandiEntries.reduce((s, e) => s + parseFloat(e.tp_weight || 0), 0);
        const cuttingPct = t.cutting_percent ?? 0;
        const br = t.base_rate ?? 10;
        const cr = t.cutting_rate ?? 5;
        const cq = Math.round(tpw * cuttingPct / 100 * 100) / 100;
        const total_amt = Math.round(((tpw * br) + (cq * cr)) * 100) / 100;
        let paid = 0;
        if (database.data.agent_payments) {
          const apDoc = database.data.agent_payments.find(a => a.mandi_name === t.mandi_name && a.kms_year === t.kms_year && a.season === t.season);
          if (apDoc) paid = apDoc.paid_amount || 0;
        }
        const bal = Math.round(Math.max(0, total_amt - paid) * 100) / 100;
        agentAmt += total_amt; agentPaid += paid; agentBal += bal;
        agentRowsData.push([
          t.mandi_name, tpw.toFixed(1), cq.toFixed(1), `Rs.${br}/Rs.${cr}`,
          `Rs.${fmtAmt(total_amt)}`, `Rs.${fmtAmt(paid)}`, `Rs.${fmtAmt(bal)}`,
          bal <= 0 ? 'Paid' : 'Pending',
        ]);
      }

      // GRAND TOTALS
      const ga = truckNet + agentAmt;
      const gp = truckPaid + agentPaid;
      const gb = truckBal + agentBal;
      const paidPct = ga > 0 ? Math.round(gp / ga * 1000) / 10 : 0;
      const progressColor = overallProgress >= 100 ? STAT_COLORS.green : (overallProgress >= 50 ? STAT_COLORS.gold : STAT_COLORS.red);
      const paidPctColor = paidPct >= 90 ? STAT_COLORS.green : (paidPct >= 50 ? STAT_COLORS.gold : STAT_COLORS.red);

      // ============================================================
      // BUILD PDF
      // ============================================================
      const doc = new PDFDocument({ size: 'A4', margin: 25 });
      registerFonts(doc);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=summary_report_${Date.now()}.pdf`);
      addPdfHeader(doc, 'Complete Summary Report');

      // Sub-header
      doc.fontSize(8.5).font(F('bold')).fillColor('#475569')
        .text(`COMPLETE SUMMARY REPORT  |  FY: ${req.query.kms_year || 'All'}  |  Season: ${req.query.season || 'All'}  |  ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
          { align: 'center' });
      doc.moveDown(0.6);

      // KPI HERO BANNER
      const kpis = [
        { lbl: 'PADDY IN', val: `${Math.round(totalPaddyIn)} Q`, color: STAT_COLORS.blue },
        { lbl: 'PADDY USED', val: `${Math.round(paddyUsed)} Q`, color: STAT_COLORS.orange },
        { lbl: 'TARGETS', val: `${Math.round(totE)} Q`, color: STAT_COLORS.gold },
        { lbl: 'ACHIEVED', val: `${overallProgress}%`, color: progressColor },
        { lbl: 'GRAND TOTAL', val: `Rs.${fmtAmt(Math.round(ga))}`, color: STAT_COLORS.purple },
        { lbl: 'PAID', val: `Rs.${fmtAmt(Math.round(gp))} (${paidPct}%)`, color: paidPctColor },
        { lbl: 'BALANCE DUE', val: `Rs.${fmtAmt(Math.round(gb))}`, color: STAT_COLORS.red },
      ];
      const margin = 25;
      const bannerW = doc.page.width - margin * 2;
      doc.y = drawSummaryBanner(doc, kpis, margin, doc.y, bannerW) + 8;

      const pageW = doc.page.width - 50;
      const outline = doc.outline;  // PDFKit document outline (bookmarks panel)

      // SECTION 1: STOCK
      ensureSpace(doc, 170);  // band (22) + ~6 rows (130) + spacing (18)
      if (outline) outline.addItem('1 · Stock Overview');
      drawSectionBand(doc, '1 · Stock Overview', {
        subtitle: `Available: ${paddyAvail.toFixed(1)} Q · Rice: ${(riceRaw + riceUsna).toFixed(1)} Q`,
        preset: 'orange',
      });
      const stockHeaders = ['Item', 'IN', 'OUT/Used', 'Available', 'Unit'];
      const stockRows = [
        ['Paddy (CMR)', cmrPaddy.toFixed(2), '—', '—', 'Qntl'],
        ['Paddy (Pvt)', pvtPaddy.toFixed(2), '—', '—', 'Qntl'],
        ['TOTAL PADDY', totalPaddyIn.toFixed(2), paddyUsed.toFixed(2), paddyAvail.toFixed(2), 'Qntl'],
        ['Rice (Raw)', riceRaw.toFixed(2), '—', riceRaw.toFixed(2), 'Qntl'],
        ['Rice (Usna)', riceUsna.toFixed(2), '—', riceUsna.toFixed(2), 'Qntl'],
        ['FRK', frk.toFixed(2), '—', frk.toFixed(2), 'Qntl'],
        ['Gunny Bags', String(gunnyIn), String(gunnyOut), String(gunnyIn - gunnyOut), 'Bags'],
      ];
      const sw = [0.30, 0.18, 0.18, 0.22, 0.12].map(w => Math.floor(pageW * w));
      addPdfTable(doc, stockHeaders, stockRows, sw, { fontSize: 8 });
      doc.moveDown(0.4);

      // SECTION 2: TARGETS
      ensureSpace(doc, 130);  // band + header + ~3 rows minimum
      if (outline) outline.addItem('2 · Mandi Targets');
      drawSectionBand(doc, '2 · Mandi Targets', {
        subtitle: targets.length ? `Overall: ${overallProgress}% achieved` : null,
        preset: 'teal',
      });
      if (targetCalc.length > 0) {
        const tgtHeaders = ['Mandi', 'Target (Q)', 'Cut %', 'Expected (Q)', 'Achieved (Q)', 'Pending (Q)', 'Progress'];
        const tgtRows = targetCalc.map(({ t, achieved, expected, pending, pr }) =>
          [t.mandi_name, t.target_qntl.toFixed(1), `${t.cutting_percent}%`,
            expected.toFixed(1), achieved.toFixed(1), pending.toFixed(1), `${pr}%`]
        );
        tgtRows.push(['TOTAL', totT.toFixed(1), '—', totE.toFixed(1), totA.toFixed(1), totP.toFixed(1), `${overallProgress}%`]);
        const tw = [0.20, 0.13, 0.10, 0.15, 0.15, 0.15, 0.12].map(w => Math.floor(pageW * w));
        addPdfTable(doc, tgtHeaders, tgtRows, tw, { fontSize: 8 });
      } else {
        doc.fontSize(9).font(F('normal')).fillColor('#64748b').text('No targets set', { align: 'center' });
      }
      doc.moveDown(0.4);

      // SECTION 3: TRUCK PAYMENTS
      ensureSpace(doc, 130);
      if (outline) outline.addItem('3 · Truck Payments');
      drawSectionBand(doc, '3 · Truck Payments', {
        subtitle: `Balance: Rs.${fmtAmt(Math.round(truckBal))}`,
        preset: 'purple',
      });
      if (truckRowsData.length > 0) {
        const tHeaders = ['Date', 'Truck', 'Mandi', 'QNTL', 'Net', 'Paid', 'Balance', 'Status'];
        const tRows = [...truckRowsData];
        tRows.push(['TOTAL', '', '', '', `Rs.${fmtAmt(Math.round(truckNet))}`, `Rs.${fmtAmt(Math.round(truckPaid))}`, `Rs.${fmtAmt(Math.round(truckBal))}`, '']);
        const tw = [0.10, 0.12, 0.14, 0.10, 0.13, 0.12, 0.13, 0.16].map(w => Math.floor(pageW * w));
        addPdfTable(doc, tHeaders, tRows, tw, { fontSize: 7 });
      } else {
        doc.fontSize(9).font(F('normal')).fillColor('#64748b').text('No truck entries', { align: 'center' });
      }
      doc.moveDown(0.4);

      // SECTION 4: AGENT/MANDI PAYMENTS
      ensureSpace(doc, 130);
      if (outline) outline.addItem('4 · Agent / Mandi Payments');
      drawSectionBand(doc, '4 · Agent / Mandi Payments', {
        subtitle: `Balance: Rs.${fmtAmt(Math.round(agentBal))}`,
        preset: 'rose',
      });
      if (agentRowsData.length > 0) {
        const aHeaders = ['Mandi', 'TP Weight', 'Cutting', 'Rates', 'Total', 'Paid', 'Balance', 'Status'];
        const aRows = [...agentRowsData];
        aRows.push(['TOTAL', '', '', '', `Rs.${fmtAmt(Math.round(agentAmt))}`, `Rs.${fmtAmt(Math.round(agentPaid))}`, `Rs.${fmtAmt(Math.round(agentBal))}`, '']);
        const aw = [0.16, 0.10, 0.10, 0.16, 0.13, 0.12, 0.13, 0.10].map(w => Math.floor(pageW * w));
        addPdfTable(doc, aHeaders, aRows, aw, { fontSize: 7 });
      } else {
        doc.fontSize(9).font(F('normal')).fillColor('#64748b').text('No agent payments', { align: 'center' });
      }
      doc.moveDown(0.4);

      // SECTION 5: GRAND TOTAL
      ensureSpace(doc, 160);  // band + header + 2 rows + grand total emphasis row
      if (outline) outline.addItem('5 · Grand Total');
      drawSectionBand(doc, '5 · Grand Total', {
        subtitle: `Outstanding: Rs.${fmtAmt(Math.round(gb))} (${(100 - paidPct).toFixed(1)}%)`,
        preset: 'amber',
      });
      const gHeaders = ['Category', 'Total Amount', 'Paid', 'Balance'];
      const gRows = [
        ['Truck Payments', `Rs.${fmtAmt(Math.round(truckNet))}`, `Rs.${fmtAmt(Math.round(truckPaid))}`, `Rs.${fmtAmt(Math.round(truckBal))}`],
        ['Agent Payments', `Rs.${fmtAmt(Math.round(agentAmt))}`, `Rs.${fmtAmt(Math.round(agentPaid))}`, `Rs.${fmtAmt(Math.round(agentBal))}`],
      ];
      const gw = [0.30, 0.25, 0.20, 0.25].map(w => Math.floor(pageW * w));
      addPdfTable(doc, gHeaders, gRows, gw, { fontSize: 9 });
      // GRAND TOTAL row — uses standard amber totals helper for safe page-flow handling
      addTotalsRow(doc, ['GRAND TOTAL', `Rs.${fmtAmt(Math.round(ga))}`, `Rs.${fmtAmt(Math.round(gp))}`, `Rs.${fmtAmt(Math.round(gb))}`], gw, { fontSize: 9 });

      // Footer
      doc.moveDown(1);
      const branding = database.getBranding ? database.getBranding() : {};
      doc.fontSize(7.5).font(F('normal')).fillColor('#94a3b8')
        .text(`Generated by ${branding.company_name || 'Mill Entry System'}  ·  ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
          { align: 'center' });

      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== TRUCK OWNER REPORT =====
  router.get('/api/export/truck-owner-excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query); const td = {};
      entries.forEach(e => { const tn=e.truck_no||'Unknown'; const p=database.getTruckPayment(e.id); const fq=(e.qntl||0)-(e.bag||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); if(!td[tn])td[tn]={truck_no:tn,trips:0,tq:0,tg:0,tded:0,tn2:0,tp:0,tb:0}; td[tn].trips++;td[tn].tq+=fq;td[tn].tg+=g;td[tn].tded+=d;td[tn].tn2+=n;td[tn].tp+=p.paid_amount;td[tn].tb+=b; });
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Truck Owner');
      ws.columns = [{header:'Truck No',key:'t',width:14},{header:'Trips',key:'tr',width:8},{header:'Total QNTL',key:'q',width:12},{header:'Gross',key:'g',width:12},{header:'Deductions',key:'d',width:12},{header:'Net',key:'n',width:12},{header:'Paid',key:'p',width:12},{header:'Balance',key:'b',width:12},{header:'Status',key:'s',width:10}];
      Object.values(td).forEach(t => ws.addRow({t:t.truck_no,tr:t.trips,q:+t.tq.toFixed(2),g:+t.tg.toFixed(2),d:+t.tded.toFixed(2),n:+t.tn2.toFixed(2),p:+t.tp.toFixed(2),b:+t.tb.toFixed(2),s:t.tb<0.10?'Paid':(t.tp>0?'Partial':'Pending')}));
      addExcelTitle(ws, 'Truck Owner Report', 9, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/export/truck-owner-pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query); const td = {};
      entries.forEach(e => { const tn=e.truck_no||'Unknown'; const p=database.getTruckPayment(e.id); const fq=(e.qntl||0)-(e.bag||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); if(!td[tn])td[tn]={truck_no:tn,trips:0,tq:0,tg:0,tded:0,tn2:0,tp:0,tb:0}; td[tn].trips++;td[tn].tq+=fq;td[tn].tg+=g;td[tn].tded+=d;td[tn].tn2+=n;td[tn].tp+=p.paid_amount;td[tn].tb+=b; });
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe
      addPdfHeader(doc, 'Truck Owner Report');
      const h = ['Truck','Trips','QNTL','Gross','Ded','Net','Paid','Balance','Status'];
      const rows = Object.values(td).map(t => [t.truck_no,t.trips,t.tq.toFixed(2),t.tg.toFixed(2),t.tded.toFixed(2),t.tn2.toFixed(2),t.tp.toFixed(2),t.tb.toFixed(2),t.tb<0.10?'Paid':(t.tp>0?'Partial':'Pending')]);
      addPdfTable(doc, h, rows, [55,35,50,50,50,55,50,50,40]); await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== CMR EXPORT ENDPOINTS =====
  // ---- MILLING REPORT ----
  router.get('/api/milling-report/excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getMillingEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Milling Report');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Type', key: 'rice_type', width: 10 },
        { header: 'Paddy (Q)', key: 'paddy', width: 12 }, { header: 'Rice %', key: 'rice_pct', width: 9 },
        { header: 'Rice (Q)', key: 'rice', width: 10 }, { header: 'FRK (Q)', key: 'frk', width: 9 },
        { header: 'CMR (Q)', key: 'cmr', width: 10 }, { header: 'Outturn %', key: 'outturn', width: 10 },
        { header: 'Rice Bran (Q)', key: 'bran', width: 11 }, { header: 'Mota Kunda (Q)', key: 'kunda', width: 11 },
        { header: 'Broken Rice (Q)', key: 'broken_rice', width: 11 }, { header: 'Rejection Rice (Q)', key: 'rejection_rice', width: 13 },
        { header: 'Pin Broken (Q)', key: 'pin_broken', width: 11 }, { header: 'Poll (Q)', key: 'poll', width: 9 },
        { header: 'Bhusa %', key: 'husk_pct', width: 9 }, { header: 'Note', key: 'note', width: 14 }
      ];
      entries.forEach(e => {
        ws.addRow({ date: fmtDate(e.date), rice_type: (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
          paddy: e.paddy_input_qntl||0, rice_pct: e.rice_percent||0, rice: e.rice_qntl||0,
          frk: e.frk_used_qntl||0, cmr: e.cmr_delivery_qntl||0, outturn: e.outturn_ratio||0,
          bran: e.bran_qntl||0, kunda: e.kunda_qntl||0, broken_rice: e.broken_qntl||0,
          rejection_rice: e.rejection_rice_qntl||0, pin_broken: e.pin_broken_rice_qntl||0, poll: e.poll_qntl||0,
          husk_pct: e.husk_percent||0, note: e.note||'' });
      });
      addExcelTitle(ws, 'Milling Report', 16, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
  }));

  router.get('/api/milling-report/pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getMillingEntries(req.query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.pdf`);
      addPdfHeader(doc, 'Milling Report');
      const headers = ['Date','Type','Paddy(Q)','Rice%','Rice(Q)','FRK(Q)','CMR(Q)','Out%','RBran(Q)','MKunda(Q)','BrkR(Q)','RejR(Q)','PinBR(Q)','Poll(Q)','Bhusa%'];
      const rows = entries.map(e => [fmtDate(e.date), (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
        (e.paddy_input_qntl||0), (e.rice_percent||0)+'%', (e.rice_qntl||0), (e.frk_used_qntl||0),
        (e.cmr_delivery_qntl||0), (e.outturn_ratio||0)+'%', (e.bran_qntl||0), (e.kunda_qntl||0),
        (e.broken_qntl||0), (e.rejection_rice_qntl||0), (e.pin_broken_rice_qntl||0), (e.poll_qntl||0), (e.husk_percent||0)+'%']);
      addPdfTable(doc, headers, rows, [45,35,42,30,38,30,38,35,35,38,35,32,32,32,32]);
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ---- FRK PURCHASES ----
  router.get('/api/frk-purchases/excel', safeAsync(async (req, res) => {
    try {
      if (!database.data.frk_purchases) database.data.frk_purchases = [];
      let purchases = [...database.data.frk_purchases];
      if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
      if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
      purchases.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('FRK Purchases');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Party Name', key: 'party', width: 18 },
        { header: 'Qty (QNTL)', key: 'qty', width: 12 }, { header: 'Rate (Rs./Q)', key: 'rate', width: 12 },
        { header: 'Amount (Rs.)', key: 'amount', width: 14 }, { header: 'Note', key: 'note', width: 16 }
      ];
      purchases.forEach(p => ws.addRow({ date: fmtDate(p.date), party: p.party_name||'', qty: p.quantity_qntl||0, rate: p.rate_per_qntl||0, amount: p.total_amount||0, note: p.note||'' }));
      const totalRow = ws.addRow({ date: 'TOTAL', party: '', qty: +purchases.reduce((s,p)=>s+(p.quantity_qntl||0),0).toFixed(2), rate: '', amount: +purchases.reduce((s,p)=>s+(p.total_amount||0),0).toFixed(2), note: '' });
      totalRow.font = { bold: true };
      addExcelTitle(ws, 'FRK Purchase Register', 6, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=frk_purchases_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
  }));

  router.get('/api/frk-purchases/pdf', safeSync(async (req, res) => {
    try {
      if (!database.data.frk_purchases) database.data.frk_purchases = [];
      let purchases = [...database.data.frk_purchases];
      if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
      if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
      purchases.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
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
  }));

  // ---- BYPRODUCT SALES ----
  router.get('/api/byproduct-sales/excel', safeAsync(async (req, res) => {
    try {
      if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
      let sales = [...database.data.byproduct_sales];
      if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
      if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
      sales.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
      const millingEntries = database.getMillingEntries(req.query);
      const products = ['bran','kunda','broken','rejection_rice','pin_broken_rice','poll','husk'];
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('By-Product Sales');
      ws.columns = [
        { header: 'Product', key: 'product', width: 14 }, { header: 'Produced (Q)', key: 'produced', width: 14 },
        { header: 'Sold (Q)', key: 'sold', width: 12 }, { header: 'Available (Q)', key: 'available', width: 14 },
        { header: 'Revenue (Rs.)', key: 'revenue', width: 14 }
      ];
      products.forEach(p => {
        const produced = +millingEntries.reduce((s,e)=>s+(e[`${p}_qntl`]||0),0).toFixed(2);
        const pSales = sales.filter(s => s.product === p);
        const sold = +pSales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
        const revenue = +pSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
        ws.addRow({ product: p.charAt(0).toUpperCase()+p.slice(1), produced, sold, available: +(produced-sold).toFixed(2), revenue });
      });
      ws.addRow({});
      const detailHeaderRow = ws.addRow({ product: 'Date', produced: 'Product', sold: 'Qty (Q)', available: 'Rate (Rs./Q)', revenue: 'Amount (Rs.)' });
      detailHeaderRow.font = { bold: true };
      sales.forEach(s => ws.addRow({ product: fmtDate(s.date)||'', produced: (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), sold: s.quantity_qntl||0, available: s.rate_per_qntl||0, revenue: s.total_amount||0 }));
      const totalRow = ws.addRow({ product: 'TOTAL', produced: '', sold: +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2), available: '', revenue: +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2) });
      totalRow.font = { bold: true };
      addExcelTitle(ws, 'By-Product Stock & Sales Report', 5, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
  }));

  router.get('/api/byproduct-sales/pdf', safeSync(async (req, res) => {
    try {
      if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
      let sales = [...database.data.byproduct_sales];
      if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
      if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
      sales.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)));
      const millingEntries = database.getMillingEntries(req.query);
      const products = ['bran','kunda','broken','rejection_rice','pin_broken_rice','poll','husk'];
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.pdf`);
      addPdfHeader(doc, 'By-Product Stock & Sales Report');
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
      doc.fontSize(11).font(F('bold')).text('Sales Detail', { align: 'left' });
      doc.moveDown(0.3);
      const headers = ['Date','Product','Qty(Q)','Rate(Rs.)','Amount(Rs.)','Buyer'];
      const tq = +sales.reduce((s,e)=>s+(e.quantity_qntl||0),0).toFixed(2);
      const ta = +sales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2);
      const rows = sales.map(s => [fmtDate(s.date)||'', (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), s.quantity_qntl||0, s.rate_per_qntl||0, s.total_amount||0, (s.buyer_name||'').substring(0,20)]);
      rows.push(['TOTAL', '', tq, '', ta, '']);
      addPdfTable(doc, headers, rows, [55, 55, 45, 50, 60, 90]);
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ---- PADDY CUSTODY REGISTER ----
  router.get('/api/paddy-custody-register/excel', safeAsync(async (req, res) => {
    try {
      const filters = req.query;
      const groupBy = filters.group_by || 'daily';

      // Reuse the API endpoint logic to get properly grouped data
      let entries = [...database.data.entries];
      if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
      if (filters.season) entries = entries.filter(e => e.season === filters.season);
      const millingEntries = database.getMillingEntries(filters);
      const allRows = [];
      entries.forEach(e => allRows.push({ date: e.date||'', type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +(parseFloat(e.tp_weight||0)).toFixed(2), released_qntl: 0 }));
      millingEntries.forEach(e => allRows.push({ date: e.date||'', type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
      allRows.sort((a,b) => (a.date).localeCompare(b.date));
      let balance = 0;
      allRows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });

      let rows = allRows;
      if (groupBy === 'weekly' && allRows.length > 0) {
        const weeklyRows = [];
        let wd = null;
        for (const r of allRows) {
          let wk;
          try { const dt = new Date(r.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); const ws = new Date(dt.setDate(diff)); wk = ws.toISOString().split('T')[0]; } catch { wk = r.date; }
          if (!wd || wd._wk !== wk) {
            if (wd) weeklyRows.push(wd);
            const ws = new Date(wk); const we = new Date(ws); we.setDate(we.getDate() + 6);
            const fD = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
            wd = { _wk: wk, date: `${fD(ws)} to ${fD(we)}`, description: `Week: ${fD(ws)} - ${fD(we)}`, received_qntl: 0, released_qntl: 0, balance_qntl: 0 };
          }
          wd.received_qntl = +(wd.received_qntl + r.received_qntl).toFixed(2);
          wd.released_qntl = +(wd.released_qntl + r.released_qntl).toFixed(2);
          wd.balance_qntl = r.balance_qntl;
        }
        if (wd) weeklyRows.push(wd);
        weeklyRows.forEach(wr => delete wr._wk);
        rows = weeklyRows;
      } else {
        rows.forEach(r => r.date = fmtDate(r.date));
      }

      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Paddy Custody Register');
      ws.columns = [
        { header: 'Date', key: 'date', width: groupBy === 'weekly' ? 28 : 12 }, { header: 'Description', key: 'description', width: 40 },
        { header: 'Received (QNTL)', key: 'received', width: 16 }, { header: 'Released (QNTL)', key: 'released', width: 16 },
        { header: 'Balance (QNTL)', key: 'balance', width: 16 }
      ];
      rows.forEach(r => ws.addRow({ date: r.date, description: r.description, received: r.received_qntl > 0 ? r.received_qntl : '', released: r.released_qntl > 0 ? r.released_qntl : '', balance: r.balance_qntl }));
      const totalRow = ws.addRow({ date: 'TOTAL', description: '', received: +allRows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), released: +allRows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), balance: +balance.toFixed(2) });
      totalRow.font = { bold: true };
      addExcelTitle(ws, `Paddy Custody Register${groupBy === 'weekly' ? ' (Weekly)' : ''}`, 5, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
  }));

  router.get('/api/paddy-custody-register/pdf', safeSync(async (req, res) => {
    try {
      const filters = req.query;
      const groupBy = filters.group_by || 'daily';

      let entries = [...database.data.entries];
      if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
      if (filters.season) entries = entries.filter(e => e.season === filters.season);
      const millingEntries = database.getMillingEntries(filters);
      const allRows = [];
      entries.forEach(e => allRows.push({ date: e.date||'', type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +(parseFloat(e.tp_weight||0)).toFixed(2), released_qntl: 0 }));
      millingEntries.forEach(e => allRows.push({ date: e.date||'', type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
      allRows.sort((a,b) => (a.date).localeCompare(b.date));
      let balance = 0;
      allRows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });

      let rows = allRows;
      if (groupBy === 'weekly' && allRows.length > 0) {
        const weeklyRows = [];
        let wd = null;
        for (const r of allRows) {
          let wk;
          try { const dt = new Date(r.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); const ws = new Date(dt.setDate(diff)); wk = ws.toISOString().split('T')[0]; } catch { wk = r.date; }
          if (!wd || wd._wk !== wk) {
            if (wd) weeklyRows.push(wd);
            const ws = new Date(wk); const we = new Date(ws); we.setDate(we.getDate() + 6);
            const fD = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
            wd = { _wk: wk, date: `${fD(ws)} to ${fD(we)}`, description: `Week: ${fD(ws)} - ${fD(we)}`, received_qntl: 0, released_qntl: 0, balance_qntl: 0 };
          }
          wd.received_qntl = +(wd.received_qntl + r.received_qntl).toFixed(2);
          wd.released_qntl = +(wd.released_qntl + r.released_qntl).toFixed(2);
          wd.balance_qntl = r.balance_qntl;
        }
        if (wd) weeklyRows.push(wd);
        weeklyRows.forEach(wr => delete wr._wk);
        rows = weeklyRows;
      } else {
        rows.forEach(r => r.date = fmtDate(r.date));
      }

      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.pdf`);
      addPdfHeader(doc, `Paddy Custody Register${groupBy === 'weekly' ? ' (Weekly)' : ''}`);
      const headers = ['Date','Description','Received(Q)','Released(Q)','Balance(Q)'];
      const pdfRows = rows.map(r => [r.date, (r.description||'').substring(0,35), r.received_qntl > 0 ? r.received_qntl : '-', r.released_qntl > 0 ? r.released_qntl : '-', r.balance_qntl]);
      pdfRows.push(['TOTAL', '', +allRows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), +allRows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), +balance.toFixed(2)]);
      addPdfTable(doc, headers, pdfRows, [groupBy === 'weekly' ? 90 : 50, 180, 60, 60, 60]);
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  return router;
};
