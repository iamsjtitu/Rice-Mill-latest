const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

// Helper to get collection safely
function col(name) {
  if (!database.data[name]) database.data[name] = [];
  return database.data[name];
}

// ============ CMR VS DC REPORT ============
router.get('/api/reports/cmr-vs-dc', safeSync((req, res) => {
  const q = req.query;
  let milling = col('milling_entries');
  let dcs = col('dc_entries');
  let deliveries = col('dc_deliveries');
  let bpSales = col('byproduct_sales');
  if (q.kms_year) { milling = milling.filter(e => e.kms_year === q.kms_year); dcs = dcs.filter(e => e.kms_year === q.kms_year); deliveries = deliveries.filter(e => e.kms_year === q.kms_year); bpSales = bpSales.filter(e => e.kms_year === q.kms_year); }
  if (q.season) { milling = milling.filter(e => e.season === q.season); dcs = dcs.filter(e => e.season === q.season); deliveries = deliveries.filter(e => e.season === q.season); bpSales = bpSales.filter(e => e.season === q.season); }
  const totalPaddyMilled = +milling.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2);
  const totalRiceProduced = +milling.reduce((s, e) => s + (e.rice_qntl || 0), 0).toFixed(2);
  const totalFrkUsed = +milling.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2);
  const totalCmr = +milling.reduce((s, e) => s + (e.cmr_delivery_qntl || 0), 0).toFixed(2);
  const avgOutturn = totalPaddyMilled > 0 ? +(totalCmr / totalPaddyMilled * 100).toFixed(2) : 0;
  const totalDcAllotted = +dcs.reduce((s, d) => s + (d.quantity_qntl || 0), 0).toFixed(2);
  const totalDcDelivered = +deliveries.reduce((s, d) => s + (d.quantity_qntl || 0), 0).toFixed(2);
  const bpRevenue = +bpSales.reduce((s, e) => s + (e.total_amount || 0), 0).toFixed(2);
  res.json({
    milling: { total_paddy_milled: totalPaddyMilled, total_rice_produced: totalRiceProduced, total_frk_used: totalFrkUsed, total_cmr_ready: totalCmr, avg_outturn_pct: avgOutturn, milling_count: milling.length },
    dc: { total_allotted: totalDcAllotted, total_delivered: totalDcDelivered, total_pending: +(totalDcAllotted - totalDcDelivered).toFixed(2), dc_count: dcs.length, delivery_count: deliveries.length },
    comparison: { cmr_vs_dc_allotted: +(totalCmr - totalDcAllotted).toFixed(2), cmr_vs_dc_delivered: +(totalCmr - totalDcDelivered).toFixed(2) },
    byproduct_revenue: bpRevenue
  });
}));

// ============ SEASON P&L ============
router.get('/api/reports/season-pnl', safeSync((req, res) => {
  const q = req.query;
  let mspPayments = col('msp_payments');
  let bpSales = col('byproduct_sales');
  let frkPurchases = col('frk_purchases');
  let gunnyBags = col('gunny_bags');
  let cashTxns = col('cash_transactions');
  let entries = col('entries');
  if (q.kms_year) { mspPayments = mspPayments.filter(e => e.kms_year === q.kms_year); bpSales = bpSales.filter(e => e.kms_year === q.kms_year); frkPurchases = frkPurchases.filter(e => e.kms_year === q.kms_year); gunnyBags = gunnyBags.filter(e => e.kms_year === q.kms_year); cashTxns = cashTxns.filter(e => e.kms_year === q.kms_year); entries = entries.filter(e => e.kms_year === q.kms_year); }
  if (q.season) { mspPayments = mspPayments.filter(e => e.season === q.season); bpSales = bpSales.filter(e => e.season === q.season); frkPurchases = frkPurchases.filter(e => e.season === q.season); gunnyBags = gunnyBags.filter(e => e.season === q.season); cashTxns = cashTxns.filter(e => e.season === q.season); entries = entries.filter(e => e.season === q.season); }
  const mspIncome = +mspPayments.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2);
  const bpIncome = +bpSales.reduce((s, e) => s + (e.total_amount || 0), 0).toFixed(2);
  const frkCost = +frkPurchases.reduce((s, p) => s + (p.total_amount || 0), 0).toFixed(2);
  const gunnyCost = +gunnyBags.filter(g => g.txn_type === 'in').reduce((s, g) => s + (g.amount || 0), 0).toFixed(2);
  const cashExpenses = +cashTxns.filter(t => t.txn_type === 'nikasi').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const cashIncomeOther = +cashTxns.filter(t => t.txn_type === 'jama').reduce((s, t) => s + (t.amount || 0), 0).toFixed(2);
  const truckPayments = +entries.reduce((s, e) => s + (e.tp_paid || 0), 0).toFixed(2);
  const agentPayments = +entries.reduce((s, e) => s + (e.agent_paid || 0), 0).toFixed(2);
  const totalIncome = +(mspIncome + bpIncome + cashIncomeOther).toFixed(2);
  const totalExpenses = +(frkCost + gunnyCost + cashExpenses + truckPayments + agentPayments).toFixed(2);
  const netPnl = +(totalIncome - totalExpenses).toFixed(2);
  res.json({
    income: { msp_payments: mspIncome, byproduct_sales: bpIncome, cash_book_jama: cashIncomeOther, total: totalIncome },
    expenses: { frk_purchases: frkCost, gunny_bags: gunnyCost, cash_book_nikasi: cashExpenses, truck_payments: truckPayments, agent_payments: agentPayments, total: totalExpenses },
    net_pnl: netPnl, profit: netPnl >= 0
  });
}));

// ============ P&L EXCEL EXPORT ============
router.get('/api/reports/season-pnl/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  // Re-use the pnl logic
  const q = req.query;
  let mspPayments = col('msp_payments'); let bpSales = col('byproduct_sales'); let frkPurchases = col('frk_purchases');
  let gunnyBags = col('gunny_bags'); let cashTxns = col('cash_transactions'); let entries = col('entries');
  if (q.kms_year) { mspPayments = mspPayments.filter(e => e.kms_year === q.kms_year); bpSales = bpSales.filter(e => e.kms_year === q.kms_year); frkPurchases = frkPurchases.filter(e => e.kms_year === q.kms_year); gunnyBags = gunnyBags.filter(e => e.kms_year === q.kms_year); cashTxns = cashTxns.filter(e => e.kms_year === q.kms_year); entries = entries.filter(e => e.kms_year === q.kms_year); }
  if (q.season) { mspPayments = mspPayments.filter(e => e.season === q.season); bpSales = bpSales.filter(e => e.season === q.season); frkPurchases = frkPurchases.filter(e => e.season === q.season); gunnyBags = gunnyBags.filter(e => e.season === q.season); cashTxns = cashTxns.filter(e => e.season === q.season); entries = entries.filter(e => e.season === q.season); }
  const data = {
    income: { msp_payments: +mspPayments.reduce((s,p)=>s+(p.amount||0),0).toFixed(2), byproduct_sales: +bpSales.reduce((s,e)=>s+(e.total_amount||0),0).toFixed(2), cash_book_jama: +cashTxns.filter(t=>t.txn_type==='jama').reduce((s,t)=>s+(t.amount||0),0).toFixed(2) },
    expenses: { frk_purchases: +frkPurchases.reduce((s,p)=>s+(p.total_amount||0),0).toFixed(2), gunny_bags: +gunnyBags.filter(g=>g.txn_type==='in').reduce((s,g)=>s+(g.amount||0),0).toFixed(2), cash_book_nikasi: +cashTxns.filter(t=>t.txn_type==='nikasi').reduce((s,t)=>s+(t.amount||0),0).toFixed(2), truck_payments: +entries.reduce((s,e)=>s+(e.tp_paid||0),0).toFixed(2), agent_payments: +entries.reduce((s,e)=>s+(e.agent_paid||0),0).toFixed(2) }
  };
  data.income.total = +(data.income.msp_payments + data.income.byproduct_sales + data.income.cash_book_jama).toFixed(2);
  data.expenses.total = +(data.expenses.frk_purchases + data.expenses.gunny_bags + data.expenses.cash_book_nikasi + data.expenses.truck_payments + data.expenses.agent_payments).toFixed(2);
  data.net_pnl = +(data.income.total - data.expenses.total).toFixed(2);
  data.profit = data.net_pnl >= 0;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Season P&L');
  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = `Season P&L Report${q.kms_year ? ' - KMS ' + q.kms_year : ''}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  let row = 3;
  ws.getCell(`A${row}`).value = 'INCOME'; ws.getCell(`A${row}`).font = { bold: true, size: 11, color: { argb: 'FF16a34a' } };
  for (const [label, val] of [['MSP Payments', data.income.msp_payments], ['By-Product Sales', data.income.byproduct_sales], ['Cash Book Jama', data.income.cash_book_jama], ['TOTAL INCOME', data.income.total]]) {
    row++; ws.getCell(`A${row}`).value = label; ws.getCell(`B${row}`).value = val;
    if (label.startsWith('TOTAL')) { ws.getCell(`A${row}`).font = { bold: true }; ws.getCell(`B${row}`).font = { bold: true }; }
  }
  row += 2;
  ws.getCell(`A${row}`).value = 'EXPENSES'; ws.getCell(`A${row}`).font = { bold: true, size: 11, color: { argb: 'FFdc2626' } };
  for (const [label, val] of [['FRK Purchases', data.expenses.frk_purchases], ['Gunny Bags', data.expenses.gunny_bags], ['Cash Book Nikasi', data.expenses.cash_book_nikasi], ['Truck Payments', data.expenses.truck_payments], ['Agent Payments', data.expenses.agent_payments], ['TOTAL EXPENSES', data.expenses.total]]) {
    row++; ws.getCell(`A${row}`).value = label; ws.getCell(`B${row}`).value = val;
    if (label.startsWith('TOTAL')) { ws.getCell(`A${row}`).font = { bold: true }; ws.getCell(`B${row}`).font = { bold: true }; }
  }
  row += 2;
  const pnlLabel = data.profit ? 'NET PROFIT' : 'NET LOSS';
  ws.getCell(`A${row}`).value = pnlLabel; ws.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: data.profit ? 'FF16a34a' : 'FFdc2626' } };
  ws.getCell(`B${row}`).value = data.net_pnl; ws.getCell(`B${row}`).font = { bold: true, size: 12 };
  ws.getColumn('A').width = 22; ws.getColumn('B').width = 22;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=season_pnl.xlsx');
  await wb.xlsx.write(res); res.end();
}));

// ============ P&L PDF EXPORT ============
router.get('/api/reports/season-pnl/pdf', safeSync((req, res) => {
  const PDFDocument = require('pdfkit');
  const q = req.query;
  let mspPayments = col('msp_payments'); let bpSales = col('byproduct_sales'); let frkPurchases = col('frk_purchases');
  let gunnyBags = col('gunny_bags'); let cashTxns = col('cash_transactions'); let entries = col('entries');
  if (q.kms_year) { mspPayments = mspPayments.filter(e => e.kms_year === q.kms_year); bpSales = bpSales.filter(e => e.kms_year === q.kms_year); frkPurchases = frkPurchases.filter(e => e.kms_year === q.kms_year); gunnyBags = gunnyBags.filter(e => e.kms_year === q.kms_year); cashTxns = cashTxns.filter(e => e.kms_year === q.kms_year); entries = entries.filter(e => e.kms_year === q.kms_year); }
  if (q.season) { mspPayments = mspPayments.filter(e => e.season === q.season); bpSales = bpSales.filter(e => e.season === q.season); frkPurchases = frkPurchases.filter(e => e.season === q.season); gunnyBags = gunnyBags.filter(e => e.season === q.season); cashTxns = cashTxns.filter(e => e.season === q.season); entries = entries.filter(e => e.season === q.season); }
  const mspIncome = mspPayments.reduce((s,p)=>s+(p.amount||0),0);
  const bpIncome = bpSales.reduce((s,e)=>s+(e.total_amount||0),0);
  const cashJama = cashTxns.filter(t=>t.txn_type==='jama').reduce((s,t)=>s+(t.amount||0),0);
  const frkCost = frkPurchases.reduce((s,p)=>s+(p.total_amount||0),0);
  const gunnyCost = gunnyBags.filter(g=>g.txn_type==='in').reduce((s,g)=>s+(g.amount||0),0);
  const cashNikasi = cashTxns.filter(t=>t.txn_type==='nikasi').reduce((s,t)=>s+(t.amount||0),0);
  const truckP = entries.reduce((s,e)=>s+(e.tp_paid||0),0);
  const agentP = entries.reduce((s,e)=>s+(e.agent_paid||0),0);
  const totalIncome = mspIncome + bpIncome + cashJama;
  const totalExpenses = frkCost + gunnyCost + cashNikasi + truckP + agentP;
  const netPnl = totalIncome - totalExpenses;
  const profit = netPnl >= 0;

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=season_pnl.pdf');
  doc.pipe(res);
  doc.fontSize(18).text('Season P&L Report', { align: 'center' }); doc.moveDown();
  doc.fontSize(12).fillColor('#16a34a').text('INCOME'); doc.fillColor('black').fontSize(9);
  doc.text(`  MSP Payments: Rs. ${mspIncome.toLocaleString()}`);
  doc.text(`  By-Product Sales: Rs. ${bpIncome.toLocaleString()}`);
  doc.text(`  Cash Book Jama: Rs. ${cashJama.toLocaleString()}`);
  doc.font('Helvetica-Bold').text(`  TOTAL INCOME: Rs. ${totalIncome.toLocaleString()}`); doc.font('Helvetica');
  doc.moveDown();
  doc.fontSize(12).fillColor('#dc2626').text('EXPENSES'); doc.fillColor('black').fontSize(9);
  doc.text(`  FRK Purchases: Rs. ${frkCost.toLocaleString()}`);
  doc.text(`  Gunny Bags: Rs. ${gunnyCost.toLocaleString()}`);
  doc.text(`  Cash Book Nikasi: Rs. ${cashNikasi.toLocaleString()}`);
  doc.text(`  Truck Payments: Rs. ${truckP.toLocaleString()}`);
  doc.text(`  Agent Payments: Rs. ${agentP.toLocaleString()}`);
  doc.font('Helvetica-Bold').text(`  TOTAL EXPENSES: Rs. ${totalExpenses.toLocaleString()}`); doc.font('Helvetica');
  doc.moveDown(2);
  doc.fontSize(14).fillColor(profit ? '#16a34a' : '#dc2626').font('Helvetica-Bold').text(`${profit ? 'NET PROFIT' : 'NET LOSS'}: Rs. ${netPnl.toLocaleString()}`, { align: 'center' });
  doc.end();
}));

// ============ CMR VS DC EXPORTS ============
router.get('/api/reports/cmr-vs-dc/excel', safeAsync(async (req, res) => {
  const ExcelJS = require('exceljs');
  const q = req.query;
  let milling = col('milling_entries'); let dcs = col('dc_entries'); let deliveries = col('dc_deliveries'); let bpSales = col('byproduct_sales');
  if (q.kms_year) { milling = milling.filter(e => e.kms_year === q.kms_year); dcs = dcs.filter(e => e.kms_year === q.kms_year); deliveries = deliveries.filter(e => e.kms_year === q.kms_year); bpSales = bpSales.filter(e => e.kms_year === q.kms_year); }
  if (q.season) { milling = milling.filter(e => e.season === q.season); dcs = dcs.filter(e => e.season === q.season); deliveries = deliveries.filter(e => e.season === q.season); bpSales = bpSales.filter(e => e.season === q.season); }
  const d = {
    milling: { total_paddy_milled: +milling.reduce((s,e)=>s+(e.paddy_input_qntl||0),0).toFixed(2), total_rice_produced: +milling.reduce((s,e)=>s+(e.rice_qntl||0),0).toFixed(2), total_frk_used: +milling.reduce((s,e)=>s+(e.frk_used_qntl||0),0).toFixed(2), total_cmr_ready: +milling.reduce((s,e)=>s+(e.cmr_delivery_qntl||0),0).toFixed(2), milling_count: milling.length },
    dc: { total_allotted: +dcs.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2), total_delivered: +deliveries.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2) }
  };
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('CMR vs DC');
  ws.mergeCells('A1:D1'); ws.getCell('A1').value = 'CMR vs DC Report'; ws.getCell('A1').font = { bold: true, size: 14 };
  let row = 3;
  ws.getCell(`A${row}`).value = 'MILLING'; ws.getCell(`A${row}`).font = { bold: true, size: 11 };
  for (const [l,v] of [['Paddy Milled (Q)',d.milling.total_paddy_milled],['Rice Produced (Q)',d.milling.total_rice_produced],['FRK Used (Q)',d.milling.total_frk_used],['CMR Ready (Q)',d.milling.total_cmr_ready]]) { row++; ws.getCell(`A${row}`).value=l; ws.getCell(`B${row}`).value=v; }
  row+=2; ws.getCell(`A${row}`).value='DC'; ws.getCell(`A${row}`).font={bold:true,size:11};
  for (const [l,v] of [['DC Allotted (Q)',d.dc.total_allotted],['DC Delivered (Q)',d.dc.total_delivered],['DC Pending (Q)',+(d.dc.total_allotted-d.dc.total_delivered).toFixed(2)]]) { row++; ws.getCell(`A${row}`).value=l; ws.getCell(`B${row}`).value=v; }
  ws.getColumn('A').width=22; ws.getColumn('B').width=22;
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition','attachment; filename=cmr_vs_dc.xlsx');
  await wb.xlsx.write(res); res.end();
}));

router.get('/api/reports/cmr-vs-dc/pdf', safeSync((req, res) => {
  const PDFDocument = require('pdfkit');
  const q = req.query;
  let milling = col('milling_entries'); let dcs = col('dc_entries'); let deliveries = col('dc_deliveries');
  if (q.kms_year) { milling=milling.filter(e=>e.kms_year===q.kms_year); dcs=dcs.filter(e=>e.kms_year===q.kms_year); deliveries=deliveries.filter(e=>e.kms_year===q.kms_year); }
  if (q.season) { milling=milling.filter(e=>e.season===q.season); dcs=dcs.filter(e=>e.season===q.season); deliveries=deliveries.filter(e=>e.season===q.season); }
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','attachment; filename=cmr_vs_dc.pdf');
  doc.pipe(res);
  doc.fontSize(18).text('CMR vs DC Report', { align: 'center' }); doc.moveDown();
  doc.fontSize(10);
  doc.text(`Paddy Milled: ${milling.reduce((s,e)=>s+(e.paddy_input_qntl||0),0).toFixed(2)} Q`);
  doc.text(`Rice Produced: ${milling.reduce((s,e)=>s+(e.rice_qntl||0),0).toFixed(2)} Q`);
  doc.text(`CMR Ready: ${milling.reduce((s,e)=>s+(e.cmr_delivery_qntl||0),0).toFixed(2)} Q`);
  doc.moveDown();
  doc.text(`DC Allotted: ${dcs.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2)} Q`);
  doc.text(`DC Delivered: ${deliveries.reduce((s,d)=>s+(d.quantity_qntl||0),0).toFixed(2)} Q`);
  doc.end();
}));

  return router;
};
