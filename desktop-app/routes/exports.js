const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { addPdfHeader: _addPdfHeader, addPdfTable, fmtDate, registerFonts, F , safePdfPipe} = require('./pdf_helpers');
const { styleExcelHeader, styleExcelData, addExcelTitle } = require('./excel_helpers');

module.exports = function(database) {

  function addPdfHeader(doc, title) {
    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHeader(doc, title, branding);
  }

  // ===== ENTRIES EXPORT =====
  router.get('/api/export/excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Mill Entries');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Truck No', key: 'truck_no', width: 14 },
        { header: 'RST No', key: 'rst_no', width: 10 }, { header: 'TP No', key: 'tp_no', width: 10 },
        { header: 'Agent', key: 'agent_name', width: 14 }, { header: 'Mandi', key: 'mandi_name', width: 14 },
        { header: 'QNTL', key: 'qntl', width: 10 }, { header: 'BAG', key: 'bag', width: 8 },
        { header: 'G.Dep', key: 'g_deposite', width: 8 }, { header: 'GBW Cut', key: 'gbw_cut', width: 10 },
        { header: 'P.Pkt', key: 'plastic_bag', width: 8 }, { header: 'P.Cut', key: 'p_pkt_cut', width: 10 },
        { header: 'Mill W', key: 'mill_w', width: 12 }, { header: 'Moist%', key: 'moisture', width: 9 },
        { header: 'M.Cut', key: 'moisture_cut', width: 9 }, { header: 'Cut%', key: 'cutting_percent', width: 8 },
        { header: 'D/D/P', key: 'disc_dust_poll', width: 8 }, { header: 'Final W', key: 'final_w', width: 12 },
        { header: 'G.Issued', key: 'g_issued', width: 10 }, { header: 'Cash', key: 'cash_paid', width: 10 },
        { header: 'Diesel', key: 'diesel_paid', width: 10 }
      ];
      entries.forEach(e => ws.addRow({ date: e.date, truck_no: e.truck_no, rst_no: e.rst_no || '', tp_no: e.tp_no || '', agent_name: e.agent_name, mandi_name: e.mandi_name, qntl: +(e.qntl||0).toFixed(2), bag: e.bag||0, g_deposite: e.g_deposite||0, gbw_cut: +((e.gbw_cut||0)/100).toFixed(2), plastic_bag: e.plastic_bag||0, p_pkt_cut: +((e.p_pkt_cut||0)/100).toFixed(2), mill_w: +((e.mill_w||0)/100).toFixed(2), moisture: e.moisture||0, moisture_cut: +((e.moisture_cut||0)/100).toFixed(2), cutting_percent: e.cutting_percent||0, disc_dust_poll: e.disc_dust_poll||0, final_w: +((e.final_w||0)/100).toFixed(2), g_issued: e.g_issued||0, cash_paid: e.cash_paid||0, diesel_paid: e.diesel_paid||0 }));

      // Add totals row
      if (entries.length > 0) {
        const totals = {
          date: 'TOTAL', truck_no: '', rst_no: '', tp_no: '', agent_name: '', mandi_name: `${entries.length} entries`,
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
          g_issued: entries.reduce((s,e) => s+(e.g_issued||0), 0),
          cash_paid: entries.reduce((s,e) => s+(e.cash_paid||0), 0),
          diesel_paid: entries.reduce((s,e) => s+(e.diesel_paid||0), 0)
        };
        const totalRow = ws.addRow(totals);
        totalRow.eachCell(c => { c.font = { bold: true, size: 10, color: { argb: 'FF92400E' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }; });
      }

      addExcelTitle(ws, 'Mill Entries Report', 21, database); styleExcelHeader(ws); styleExcelData(ws, 5);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/export/pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 20 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=mill_entries_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'Mill Entries Report');
      const h = ['Date','Truck','RST','TP','Agent','Mandi','QNTL','BAG','G.Dep','GBW','P.Pkt','P.Cut','Mill W','M%','M.Cut','C%','D/D/P','Final W','G.Iss','Cash','Diesel'];
      const w = [38,38,28,28,38,38,32,24,24,28,24,28,34,22,28,22,24,34,26,30,30];
      const rows = entries.map(e => [fmtDate(e.date),e.truck_no||'',e.rst_no||'',e.tp_no||'',e.agent_name||'',e.mandi_name||'',(e.qntl||0).toFixed(2),e.bag||0,e.g_deposite||0,((e.gbw_cut||0)/100).toFixed(2),e.plastic_bag||0,((e.p_pkt_cut||0)/100).toFixed(2),((e.mill_w||0)/100).toFixed(2),e.moisture||0,((e.moisture_cut||0)/100).toFixed(2),e.cutting_percent||0,e.disc_dust_poll||0,((e.final_w||0)/100).toFixed(2),e.g_issued||0,e.cash_paid||0,e.diesel_paid||0]);
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
        const tCash = entries.reduce((s,e) => s+(e.cash_paid||0), 0);
        const tDiesel = entries.reduce((s,e) => s+(e.diesel_paid||0), 0);
        addTotalsRow(doc, ['TOTAL','','','','',`${entries.length} entries`,tQntl.toFixed(2),tBag,tGDep,tGbw.toFixed(2),tPPkt,tPCut.toFixed(2),tMillW.toFixed(2),'',tMCut.toFixed(2),'','',tFinalW.toFixed(2),tGIss,tCash,tDiesel], w);
      }

      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== TRUCK PAYMENTS EXPORT =====
  router.get('/api/export/truck-payments-excel', safeAsync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Truck Payments');
      ws.columns = [{header:'Date',key:'date',width:12},{header:'Truck No',key:'truck_no',width:14},{header:'Mandi',key:'mandi',width:14},{header:'Final QNTL',key:'fq',width:12},{header:'Rate',key:'rate',width:8},{header:'Gross',key:'gross',width:12},{header:'Cash',key:'cash',width:10},{header:'Diesel',key:'diesel',width:10},{header:'Deductions',key:'ded',width:12},{header:'Net',key:'net',width:12},{header:'Paid',key:'paid',width:10},{header:'Balance',key:'bal',width:12},{header:'Status',key:'status',width:10}];
      entries.forEach(e => { const p=database.getTruckPayment(e.id); const fq=(e.qntl||0)-(e.bag||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); ws.addRow({date:e.date,truck_no:e.truck_no,mandi:e.mandi_name,fq:+fq.toFixed(2),rate:p.rate_per_qntl,gross:+g.toFixed(2),cash:e.cash_paid||0,diesel:e.diesel_paid||0,ded:+d.toFixed(2),net:+n.toFixed(2),paid:p.paid_amount,bal:+b.toFixed(2),status:b<0.10?'Paid':(p.paid_amount>0?'Partial':'Pending')}); });
      addExcelTitle(ws, 'Truck Payments', 13, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  router.get('/api/export/truck-payments-pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=truck_payments_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'Truck Payments Report');
      const h = ['Date','Truck','Mandi','Final QNTL','Rate','Gross','Ded','Net','Paid','Balance','Status'];
      const rows = entries.map(e => { const p=database.getTruckPayment(e.id); const fq=(e.qntl||0)-(e.bag||0)/100; const g=fq*p.rate_per_qntl; const d=(e.cash_paid||0)+(e.diesel_paid||0); const n=g-d; const b=Math.max(0,n-p.paid_amount); return [e.date,e.truck_no,e.mandi_name,fq.toFixed(2),p.rate_per_qntl,g.toFixed(2),d.toFixed(2),n.toFixed(2),p.paid_amount,b.toFixed(2),b<0.10?'Paid':(p.paid_amount>0?'Partial':'Pending')]; });
      addPdfTable(doc, h, rows, [50,55,55,45,35,50,50,50,45,50,40]); await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== AGENT PAYMENTS EXPORT =====
  router.get('/api/export/agent-payments-excel', safeAsync(async (req, res) => {
    try {
      const targets = database.getMandiTargets(req.query); const entries = database.getEntries(req.query);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Agent Payments');
      ws.columns = [{header:'Mandi',key:'mandi',width:14},{header:'Agent',key:'agent',width:14},{header:'Target',key:'target',width:12},{header:'Cutting',key:'cutting',width:12},{header:'B.Rate',key:'br',width:10},{header:'C.Rate',key:'cr',width:10},{header:'Total',key:'total',width:12},{header:'Achieved',key:'ach',width:10},{header:'Paid',key:'paid',width:10},{header:'Balance',key:'bal',width:12},{header:'Status',key:'status',width:10}];
      targets.forEach(t => { const me=entries.filter(e=>e.mandi_name.toLowerCase()===t.mandi_name.toLowerCase()); const ach=me.reduce((s,e)=>s+(e.final_w||0)/100,0); const cq=t.target_qntl*t.cutting_percent/100; const tot=(t.target_qntl*(t.base_rate??10))+(cq*(t.cutting_rate??5)); const p=database.getAgentPayment(t.mandi_name,t.kms_year,t.season); const bal=Math.max(0,tot-p.paid_amount); const ae=me.find(e=>e.agent_name); ws.addRow({mandi:t.mandi_name,agent:ae?ae.agent_name:'',target:t.target_qntl,cutting:+cq.toFixed(2),br:t.base_rate??10,cr:t.cutting_rate??5,total:+tot.toFixed(2),ach:+ach.toFixed(2),paid:p.paid_amount,bal:+bal.toFixed(2),status:bal<0.01?'Paid':(p.paid_amount>0?'Partial':'Pending')}); });
      addExcelTitle(ws, 'Agent Payments', 11, database); styleExcelHeader(ws); styleExcelData(ws, 5);
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
    res.setHeader('Content-Disposition', `attachment; filename=agent_payments_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'Agent Payments Report');
      const h = ['Mandi','Agent','Target','Cutting','B.Rate','C.Rate','Total','Achieved','Paid','Balance','Status'];
      const rows = targets.map(t => { const me=entries.filter(e=>e.mandi_name.toLowerCase()===t.mandi_name.toLowerCase()); const ach=me.reduce((s,e)=>s+(e.final_w||0)/100,0); const cq=t.target_qntl*t.cutting_percent/100; const tot=(t.target_qntl*(t.base_rate??10))+(cq*(t.cutting_rate??5)); const p=database.getAgentPayment(t.mandi_name,t.kms_year,t.season); const bal=Math.max(0,tot-p.paid_amount); const ae=me.find(e=>e.agent_name); return [t.mandi_name,ae?ae.agent_name:'',t.target_qntl,cq.toFixed(2),t.base_rate??10,t.cutting_rate??5,tot.toFixed(2),ach.toFixed(2),p.paid_amount,bal.toFixed(2),bal<0.01?'Paid':(p.paid_amount>0?'Partial':'Pending')]; });
      addPdfTable(doc, h, rows, [55,55,40,40,35,35,50,45,45,50,40]); await safePdfPipe(doc, res);
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

      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=dashboard_${filterLabel}_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe
      addPdfHeader(doc, 'Dashboard Report');

      // Sub-header
      doc.fontSize(8).font(F('normal')).fillColor('grey')
        .text(`FY: ${req.query.kms_year || 'All'} | Season: ${req.query.season || 'All'} | Filter: ${filterLabel}`, { align: 'center' });
      doc.moveDown(0.5);

      // ---- STOCK SECTION ----
      if (showStock) {
        addSectionTitle(doc, 'STOCK OVERVIEW');

        // Paddy from CMR (mill entries final_w)
        const cmrPaddy = Math.round(entries.reduce((s, e) => s + (e.final_w || 0), 0) / 100 * 100) / 100;

        // Private paddy
        let pvtEntries = database.data.private_paddy || [];
        if (req.query.kms_year) pvtEntries = pvtEntries.filter(e => e.kms_year === req.query.kms_year);
        if (req.query.season) pvtEntries = pvtEntries.filter(e => e.season === req.query.season);
        pvtEntries = pvtEntries.filter(e => e.source !== 'agent_extra');
        const pvtPaddy = Math.round(pvtEntries.reduce((s, e) => s + ((e.qntl || 0) - (e.bag || 0) / 100), 0) * 100) / 100;

        const totalPaddyIn = Math.round((cmrPaddy + pvtPaddy) * 100) / 100;

        // Milling data
        const millingEntries = database.getMillingEntries(req.query);
        const paddyUsed = Math.round(millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0) * 100) / 100;
        const riceRaw = Math.round(millingEntries.filter(e => !e.product_type || e.product_type === 'raw').reduce((s, e) => s + (e.rice_qntl || 0), 0) * 100) / 100;
        const riceUsna = Math.round(millingEntries.filter(e => e.product_type === 'usna').reduce((s, e) => s + (e.rice_qntl || 0), 0) * 100) / 100;
        const frk = Math.round(millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0) * 100) / 100;
        const byproduct = Math.round(millingEntries.reduce((s, e) => s + (e.bran_qntl || 0) + (e.kunda_qntl || 0), 0) * 100) / 100;
        const paddyAvail = Math.round((totalPaddyIn - paddyUsed) * 100) / 100;

        // Gunny bags
        let gunnyEntries = database.data.gunny_bags || [];
        if (req.query.kms_year) gunnyEntries = gunnyEntries.filter(e => e.kms_year === req.query.kms_year);
        if (req.query.season) gunnyEntries = gunnyEntries.filter(e => e.season === req.query.season);
        const gunnyIn = gunnyEntries.filter(e => e.txn_type === 'in').reduce((s, e) => s + (e.quantity || 0), 0);
        const gunnyOut = gunnyEntries.filter(e => e.txn_type === 'out').reduce((s, e) => s + (e.quantity || 0), 0);

        const stockHeaders = ['Item', 'Source', 'IN', 'OUT/Used', 'Available', 'Unit'];
        const stockRows = [
          ['Paddy', 'CMR (Mill Entry)', cmrPaddy, '-', '-', 'Qntl'],
          ['Paddy', 'Private Purchase', pvtPaddy, '-', '-', 'Qntl'],
          ['Paddy Total', '', totalPaddyIn, paddyUsed, paddyAvail, 'Qntl'],
          ['Rice (Raw)', 'Milling', riceRaw, '-', riceRaw, 'Qntl'],
          ['Rice (Usna)', 'Milling', riceUsna, '-', riceUsna, 'Qntl'],
          ['FRK', 'Milling', frk, '-', frk, 'Qntl'],
          ['By-Products', 'Milling', byproduct, '-', byproduct, 'Qntl'],
          ['Gunny Bags', 'All Sources', gunnyIn, gunnyOut, gunnyIn - gunnyOut, 'Bags'],
        ];
        _addTbl(doc, stockHeaders, stockRows, [75, 80, 70, 70, 80, 50]);
        doc.moveDown(0.5);
      }

      // ---- TARGETS SECTION ----
      if (showTargets) {
        addSectionTitle(doc, targetMandi ? `MANDI TARGETS - ${targetMandi}` : 'MANDI TARGETS');

        let targets = database.getMandiTargets(req.query);
        if (targetMandi) targets = targets.filter(t => t.mandi_name === targetMandi);

        if (targets.length > 0) {
          const tgtHeaders = ['Mandi', 'Target (Q)', 'Cut %', 'Expected (Q)', 'Achieved (Q)', 'Pending (Q)', 'Progress', 'Agent Amt'];
          const tgtRows = [];
          let totTarget = 0, totExpected = 0, totAchieved = 0, totPending = 0, totAgent = 0;

          for (const t of targets) {
            const mandiEntries = entries.filter(e => (e.mandi_name || '').toLowerCase() === (t.mandi_name || '').toLowerCase());
            const achieved = Math.round(mandiEntries.reduce((s, e) => s + (e.final_w || 0) / 100, 0) * 100) / 100;
            const expected = t.expected_total || t.target_qntl;
            const pending = Math.round(Math.max(0, expected - achieved) * 100) / 100;
            const progress = expected > 0 ? Math.round(achieved / expected * 1000) / 10 : 0;
            const cuttingQ = Math.round(t.target_qntl * t.cutting_percent / 100 * 100) / 100;
            const agentAmt = Math.round((t.target_qntl * (t.base_rate || 10)) + (cuttingQ * (t.cutting_rate || 5)));

            totTarget += t.target_qntl; totExpected += expected;
            totAchieved += achieved; totPending += pending; totAgent += agentAmt;

            tgtRows.push([t.mandi_name, t.target_qntl, `${t.cutting_percent}%`, expected, achieved, pending, `${progress}%`, `Rs.${fmtAmt(agentAmt)}`]);
          }

          const totProg = totExpected > 0 ? Math.round(totAchieved / totExpected * 1000) / 10 : 0;
          tgtRows.push(['TOTAL', Math.round(totTarget * 100) / 100, '-', Math.round(totExpected * 100) / 100, Math.round(totAchieved * 100) / 100, Math.round(totPending * 100) / 100, `${totProg}%`, `Rs.${fmtAmt(totAgent)}`]);

          _addTbl(doc, tgtHeaders, tgtRows, [60, 50, 35, 55, 55, 55, 45, 60]);
        } else {
          doc.fontSize(9).font(F('normal')).fillColor('#64748b').text('Koi target set nahi hai', { align: 'center' });
        }
      }

      // Footer
      doc.moveDown(1);
      const branding = database.getBranding ? database.getBranding() : {};
      doc.fontSize(7).font(F('normal')).fillColor('#94a3b8')
        .text(`Generated by ${branding.company_name || 'Mill Entry System'} | ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: err.message }); }
  }));

  // ===== SUMMARY REPORT =====
  router.get('/api/export/summary-report-pdf', safeSync(async (req, res) => {
    try {
      const entries = database.getEntries(req.query); const totals = database.getTotals ? database.getTotals(req.query) : {};
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=summary_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'Summary Report');
      doc.fontSize(10).font(F('bold')).text('Overview:', { underline: true }); doc.moveDown(0.3); doc.font(F('normal')).fontSize(9);
      doc.text(`Total Entries: ${entries.length}`); doc.text(`Total QNTL: ${(totals.total_qntl||0).toFixed?.(2)||0}`); doc.text(`Total Final W: ${((totals.total_final_w||0)/100).toFixed?.(2)||0}`);
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
    res.setHeader('Content-Disposition', `attachment; filename=truck_owner_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'Truck Owner Report');
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
        { header: 'Bran (Q)', key: 'bran', width: 9 }, { header: 'Kunda (Q)', key: 'kunda', width: 9 },
        { header: 'Husk %', key: 'husk_pct', width: 9 }, { header: 'Note', key: 'note', width: 14 }
      ];
      entries.forEach(e => {
        ws.addRow({ date: e.date, rice_type: (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
          paddy: e.paddy_input_qntl||0, rice_pct: e.rice_percent||0, rice: e.rice_qntl||0,
          frk: e.frk_used_qntl||0, cmr: e.cmr_delivery_qntl||0, outturn: e.outturn_ratio||0,
          bran: e.bran_qntl||0, kunda: e.kunda_qntl||0, husk_pct: e.husk_percent||0, note: e.note||'' });
      });
      addExcelTitle(ws, 'Milling Report', 12, database); styleExcelHeader(ws); styleExcelData(ws, 5);
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
    res.setHeader('Content-Disposition', `attachment; filename=milling_report_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'Milling Report');
      const headers = ['Date','Type','Paddy(Q)','Rice%','Rice(Q)','FRK(Q)','CMR(Q)','Outturn%','Bran(Q)','Husk%','Note'];
      const rows = entries.map(e => [fmtDate(e.date), (e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1),
        (e.paddy_input_qntl||0), (e.rice_percent||0)+'%', (e.rice_qntl||0), (e.frk_used_qntl||0),
        (e.cmr_delivery_qntl||0), (e.outturn_ratio||0)+'%', (e.bran_qntl||0), (e.husk_percent||0)+'%', (e.note||'').substring(0,15)]);
      addPdfTable(doc, headers, rows, [50,45,45,35,40,35,40,40,35,35,60]);
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
      purchases.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('FRK Purchases');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Party Name', key: 'party', width: 18 },
        { header: 'Qty (QNTL)', key: 'qty', width: 12 }, { header: 'Rate (Rs./Q)', key: 'rate', width: 12 },
        { header: 'Amount (Rs.)', key: 'amount', width: 14 }, { header: 'Note', key: 'note', width: 16 }
      ];
      purchases.forEach(p => ws.addRow({ date: p.date, party: p.party_name||'', qty: p.quantity_qntl||0, rate: p.rate_per_qntl||0, amount: p.total_amount||0, note: p.note||'' }));
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
      purchases.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=frk_purchases_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'FRK Purchase Register');
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
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const millingEntries = database.getMillingEntries(req.query);
      const products = ['bran','kunda','broken','kanki','husk'];
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
      sales.forEach(s => ws.addRow({ product: s.date||'', produced: (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), sold: s.quantity_qntl||0, available: s.rate_per_qntl||0, revenue: s.total_amount||0 }));
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
      sales.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      const millingEntries = database.getMillingEntries(req.query);
      const products = ['bran','kunda','broken','kanki','husk'];
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=byproduct_sales_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'By-Product Stock & Sales Report');
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
      const rows = sales.map(s => [s.date||'', (s.product||'').charAt(0).toUpperCase()+(s.product||'').slice(1), s.quantity_qntl||0, s.rate_per_qntl||0, s.total_amount||0, (s.buyer_name||'').substring(0,20)]);
      rows.push(['TOTAL', '', tq, '', ta, '']);
      addPdfTable(doc, headers, rows, [55, 55, 45, 50, 60, 90]);
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  // ---- PADDY CUSTODY REGISTER ----
  router.get('/api/paddy-custody-register/excel', safeAsync(async (req, res) => {
    try {
      const filters = req.query;
      let entries = [...database.data.entries];
      if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
      if (filters.season) entries = entries.filter(e => e.season === filters.season);
      const millingEntries = database.getMillingEntries(filters);
      const rows = [];
      entries.forEach(e => rows.push({ date: fmtDate(e.date), type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.qntl||0)-(e.bag||0)/100).toFixed(2), released_qntl: 0 }));
      millingEntries.forEach(e => rows.push({ date: fmtDate(e.date), type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
      rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      let balance = 0;
      rows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Paddy Custody Register');
      ws.columns = [
        { header: 'Date', key: 'date', width: 12 }, { header: 'Description', key: 'description', width: 40 },
        { header: 'Received (QNTL)', key: 'received', width: 16 }, { header: 'Released (QNTL)', key: 'released', width: 16 },
        { header: 'Balance (QNTL)', key: 'balance', width: 16 }
      ];
      rows.forEach(r => ws.addRow({ date: r.date, description: r.description, received: r.received_qntl > 0 ? r.received_qntl : '', released: r.released_qntl > 0 ? r.released_qntl : '', balance: r.balance_qntl }));
      const totalRow = ws.addRow({ date: 'TOTAL', description: '', received: +rows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), released: +rows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), balance: +balance.toFixed(2) });
      totalRow.font = { bold: true };
      addExcelTitle(ws, 'Paddy Custody Register', 5, database); styleExcelHeader(ws); styleExcelData(ws, 5);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.xlsx`);
      await wb.xlsx.write(res); res.end();
    } catch (err) { res.status(500).json({ detail: 'Export failed: ' + err.message }); }
  }));

  router.get('/api/paddy-custody-register/pdf', safeSync(async (req, res) => {
    try {
      const filters = req.query;
      let entries = [...database.data.entries];
      if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
      if (filters.season) entries = entries.filter(e => e.season === filters.season);
      const millingEntries = database.getMillingEntries(filters);
      const rows = [];
      entries.forEach(e => rows.push({ date: fmtDate(e.date), type: 'received', description: `Truck: ${e.truck_no||''} | Agent: ${e.agent_name||''} | Mandi: ${e.mandi_name||''}`, received_qntl: +((e.qntl||0)-(e.bag||0)/100).toFixed(2), released_qntl: 0 }));
      millingEntries.forEach(e => rows.push({ date: fmtDate(e.date), type: 'released', description: `Milling (${(e.rice_type||'').charAt(0).toUpperCase()+(e.rice_type||'').slice(1)}) | Rice: ${e.rice_qntl||0}Q`, received_qntl: 0, released_qntl: e.paddy_input_qntl||0 }));
      rows.sort((a,b) => (a.date||'').localeCompare(b.date||''));
      let balance = 0;
      rows.forEach(r => { balance += r.received_qntl - r.released_qntl; r.balance_qntl = +balance.toFixed(2); });
      const doc = new PDFDocument({ size: 'A4', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=paddy_custody_${Date.now()}.pdf`);
      // PDF will be sent via safePdfPipe addPdfHeader(doc, 'Paddy Custody Register');
      const headers = ['Date','Description','Received(Q)','Released(Q)','Balance(Q)'];
      const pdfRows = rows.map(r => [r.date, r.description.substring(0,35), r.received_qntl > 0 ? r.received_qntl : '-', r.released_qntl > 0 ? r.released_qntl : '-', r.balance_qntl]);
      pdfRows.push(['TOTAL', '', +rows.reduce((s,r)=>s+r.received_qntl,0).toFixed(2), +rows.reduce((s,r)=>s+r.released_qntl,0).toFixed(2), +balance.toFixed(2)]);
      addPdfTable(doc, headers, pdfRows, [50, 180, 60, 60, 60]);
      await safePdfPipe(doc, res);
    } catch (err) { res.status(500).json({ detail: 'PDF failed: ' + err.message }); }
  }));

  return router;
};
