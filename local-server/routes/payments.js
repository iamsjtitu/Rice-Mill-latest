const express = require('express');
const router = express.Router();

module.exports = function(database) {
  // Helper reference
  const ExcelJS = require('exceljs');
  const PDFDocument = require('pdfkit');
  const { v4: uuidv4 } = require('uuid');
  const col = (name) => { if (!database.data[name]) database.data[name] = []; return database.data[name]; };

// ============ TRUCK PAYMENTS ============
router.get('/api/truck-payments', (req, res) => {
  const entries = database.getEntries(req.query);
  const payments = entries.map(entry => {
    const payment = database.getTruckPayment(entry.id);
    const final_qntl = Math.round((entry.final_w || 0) / 100 * 100) / 100;
    const cash_taken = entry.cash_paid || 0;
    const diesel_taken = entry.diesel_paid || 0;
    const gross_amount = Math.round(final_qntl * payment.rate_per_qntl * 100) / 100;
    const deductions = Math.round((cash_taken + diesel_taken) * 100) / 100;
    const net_amount = Math.round((gross_amount - deductions) * 100) / 100;
    const balance_amount = Math.round(Math.max(0, net_amount - payment.paid_amount) * 100) / 100;
    
    let status = 'pending';
    if (balance_amount < 0.10) status = 'paid';
    else if (payment.paid_amount > 0) status = 'partial';
    
    return {
      entry_id: entry.id, truck_no: entry.truck_no || '', date: entry.date || '',
      agent_name: entry.agent_name || '', mandi_name: entry.mandi_name || '',
      total_qntl: Math.round((entry.qntl || 0) * 100) / 100, total_bag: entry.bag || 0,
      final_qntl, cash_taken, diesel_taken, rate_per_qntl: payment.rate_per_qntl,
      gross_amount, deductions, net_amount, paid_amount: payment.paid_amount,
      balance_amount, status, kms_year: entry.kms_year || '', season: entry.season || ''
    };
  });
  res.json(payments);
});

router.put('/api/truck-payments/:entryId/rate', (req, res) => {
  const entry = database.data.entries.find(e => e.id === req.params.entryId);
  let updatedCount = 1;
  
  if (entry && entry.truck_no && entry.mandi_name) {
    // Auto-update all entries with same truck_no + same mandi_name
    const matching = database.data.entries.filter(e => 
      e.truck_no === entry.truck_no && e.mandi_name === entry.mandi_name
    );
    matching.forEach(m => {
      database.updateTruckPayment(m.id, { rate_per_qntl: req.body.rate_per_qntl });
    });
    updatedCount = matching.length;
  } else {
    database.updateTruckPayment(req.params.entryId, { rate_per_qntl: req.body.rate_per_qntl });
  }
  
  res.json({ success: true, message: `Rate ₹${req.body.rate_per_qntl}/QNTL set for ${updatedCount} entries`, updated_count: updatedCount, truck_no: entry?.truck_no, mandi_name: entry?.mandi_name });
});

router.post('/api/truck-payments/:entryId/pay', (req, res) => {
  const entry = database.data.entries.find(e => e.id === req.params.entryId);
  const current = database.getTruckPayment(req.params.entryId);
  const newPaid = current.paid_amount + req.body.amount;
  const history = current.payments_history || [];
  history.push({ amount: req.body.amount, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
  database.updateTruckPayment(req.params.entryId, { paid_amount: newPaid, payments_history: history });
  // Auto Cash Book Nikasi
  if (req.body.amount > 0) {
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: 'Truck Payment', description: `Truck Payment: ${entry?.truck_no || ''} - Rs.${req.body.amount}`,
      amount: Math.round(req.body.amount * 100) / 100, reference: `truck_pay:${req.params.entryId.substring(0,8)}`,
      kms_year: entry?.kms_year || '', season: entry?.season || '',
      created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
      created_at: new Date().toISOString()
    });
  }
  database.save();
  res.json({ success: true, message: `Rs.${req.body.amount} payment recorded`, total_paid: newPaid });
});

router.post('/api/truck-payments/:entryId/mark-paid', (req, res) => {
  const entry = database.data.entries.find(e => e.id === req.params.entryId);
  if (!entry) return res.status(404).json({ detail: 'Entry not found' });
  
  const current = database.getTruckPayment(req.params.entryId);
  const final_qntl = (entry.final_w || 0) / 100;
  const net = (final_qntl * current.rate_per_qntl) - (entry.cash_paid || 0) - (entry.diesel_paid || 0);
  const history = current.payments_history || [];
  history.push({ amount: net, date: new Date().toISOString(), note: 'Full payment - marked as paid', by: req.query.username || 'admin' });
  database.updateTruckPayment(req.params.entryId, { paid_amount: net, status: 'paid', payments_history: history });
  // Auto Cash Book Nikasi
  if (net > 0) {
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: 'Truck Payment', description: `Truck Payment: ${entry.truck_no || ''} (Full - Mark Paid)`,
      amount: Math.round(net * 100) / 100, reference: `truck_markpaid:${req.params.entryId.substring(0,8)}`,
      kms_year: entry.kms_year || '', season: entry.season || '',
      created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
      created_at: new Date().toISOString()
    });
  }
  database.save();
  res.json({ success: true, message: 'Truck payment cleared' });
});

router.post('/api/truck-payments/:entryId/undo-paid', (req, res) => {
  const current = database.getTruckPayment(req.params.entryId);
  const history = current.payments_history || [];
  history.push({ amount: -(current.paid_amount || 0), date: new Date().toISOString(), note: 'UNDO - Payment reversed', by: req.query.username || 'admin' });
  database.updateTruckPayment(req.params.entryId, { paid_amount: 0, status: 'pending', payments_history: history });
  // Delete linked cash book entries
  database.data.cash_transactions = col('cash_transactions').filter(t => t.linked_payment_id !== `truck:${req.params.entryId}`);
  database.save();
  res.json({ success: true, message: 'Payment undo ho gaya - status reset to pending' });
});

router.get('/api/truck-payments/:entryId/history', (req, res) => {
  const payment = database.getTruckPayment(req.params.entryId);
  res.json({ history: payment.payments_history || [], total_paid: payment.paid_amount || 0 });
});

// ============ AGENT PAYMENTS ============
router.get('/api/agent-payments', (req, res) => {
  const targets = database.getMandiTargets(req.query);
  const entries = database.getEntries(req.query);
  
  const payments = targets.map(target => {
    const payment = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
    const mandiEntries = entries.filter(e => e.mandi_name === target.mandi_name);
    const achieved_qntl = Math.round(mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0) * 100) / 100;
    const cutting_qntl = Math.round(target.target_qntl * target.cutting_percent / 100 * 100) / 100;
    const base_rate = target.base_rate ?? 10;
    const cutting_rate = target.cutting_rate ?? 5;
    const target_amount = Math.round(target.target_qntl * base_rate * 100) / 100;
    const cutting_amount = Math.round(cutting_qntl * cutting_rate * 100) / 100;
    const total_amount = Math.round((target_amount + cutting_amount) * 100) / 100;
    const balance_amount = Math.round(Math.max(0, total_amount - payment.paid_amount) * 100) / 100;
    
    // Get agent name from entries
    const agentEntry = mandiEntries.find(e => e.agent_name);
    const agent_name = agentEntry ? agentEntry.agent_name : target.mandi_name;
    
    let status = 'pending';
    if (balance_amount < 0.01) status = 'paid';
    else if (payment.paid_amount > 0) status = 'partial';
    
    return {
      mandi_name: target.mandi_name, agent_name,
      target_qntl: target.target_qntl, cutting_percent: target.cutting_percent, cutting_qntl,
      base_rate, cutting_rate, target_amount, cutting_amount, total_amount,
      achieved_qntl, is_target_complete: achieved_qntl >= target.expected_total,
      paid_amount: payment.paid_amount, balance_amount, status,
      kms_year: target.kms_year, season: target.season
    };
  });
  res.json(payments);
});

router.post('/api/agent-payments/:mandiName/pay', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const current = database.getAgentPayment(mandiName, kms_year, season);
  const newPaid = current.paid_amount + req.body.amount;
  const history = current.payments_history || [];
  history.push({ amount: req.body.amount, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
  database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: newPaid, payments_history: history });
  // Auto Cash Book Nikasi
  if (req.body.amount > 0) {
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: 'Agent Payment', description: `Agent Payment: ${mandiName} - Rs.${req.body.amount}`,
      amount: Math.round(req.body.amount * 100) / 100, reference: `agent_pay:${mandiName.substring(0,10)}`,
      kms_year: kms_year || '', season: season || '',
      created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
      created_at: new Date().toISOString()
    });
  }
  database.save();
  res.json({ success: true, message: `Rs.${req.body.amount} payment recorded`, total_paid: newPaid });
});

router.post('/api/agent-payments/:mandiName/mark-paid', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const target = database.getMandiTargets({ kms_year, season }).find(t => t.mandi_name === mandiName);
  if (!target) return res.status(404).json({ detail: 'Mandi target not found' });
  
  const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
  const total_amount = (target.target_qntl * (target.base_rate ?? 10)) + (cutting_qntl * (target.cutting_rate ?? 5));
  const current = database.getAgentPayment(mandiName, kms_year, season);
  const history = current.payments_history || [];
  history.push({ amount: total_amount, date: new Date().toISOString(), note: 'Full payment - marked as paid', by: req.query.username || 'admin' });
  database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: total_amount, status: 'paid', payments_history: history });
  // Auto Cash Book Nikasi
  if (total_amount > 0) {
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: 'Agent Payment', description: `Agent Payment: ${mandiName} (Full - Mark Paid)`,
      amount: Math.round(total_amount * 100) / 100, reference: `agent_markpaid:${mandiName.substring(0,10)}`,
      kms_year: kms_year || '', season: season || '',
      created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
      created_at: new Date().toISOString()
    });
  }
  database.save();
  res.json({ success: true, message: 'Agent/Mandi payment cleared' });
});

router.post('/api/agent-payments/:mandiName/undo-paid', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const current = database.getAgentPayment(mandiName, kms_year, season);
  const history = current.payments_history || [];
  history.push({ amount: -(current.paid_amount || 0), date: new Date().toISOString(), note: 'UNDO - Payment reversed', by: req.query.username || 'admin' });
  database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: 0, status: 'pending', payments_history: history });
  // Delete linked cash book entries
  database.data.cash_transactions = col('cash_transactions').filter(t => t.linked_payment_id !== `agent:${mandiName}:${kms_year}:${season}`);
  database.save();
  res.json({ success: true, message: 'Payment undo ho gaya - status reset to pending' });
});

router.get('/api/agent-payments/:mandiName/history', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const payment = database.getAgentPayment(mandiName, kms_year, season);
  res.json({ history: payment.payments_history || [], total_paid: payment.paid_amount || 0 });
});

// ============ MILLING ENTRIES ============
router.get('/api/milling-entries', (req, res) => {
  const entries = database.getMillingEntries(req.query);
  res.json(entries);
});

router.get('/api/milling-summary', (req, res) => {
  res.json(database.getMillingSummary(req.query));
});

router.post('/api/milling-entries', (req, res) => {
  const entry = database.createMillingEntry({ ...req.body, created_by: req.query.username || '' });
  res.json(entry);
});

router.get('/api/milling-entries/:id', (req, res) => {
  const entries = database.getMillingEntries({});
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ detail: 'Milling entry not found' });
  res.json(entry);
});

router.put('/api/milling-entries/:id', (req, res) => {
  const updated = database.updateMillingEntry(req.params.id, req.body);
  if (!updated) return res.status(404).json({ detail: 'Milling entry not found' });
  res.json(updated);
});

router.delete('/api/milling-entries/:id', (req, res) => {
  const deleted = database.deleteMillingEntry(req.params.id);
  if (!deleted) return res.status(404).json({ detail: 'Milling entry not found' });
  res.json({ message: 'Milling entry deleted', id: req.params.id });
});

router.get('/api/paddy-stock', (req, res) => {
  const filters = req.query;
  let entries = [...database.data.entries];
  if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
  if (filters.season) entries = entries.filter(e => e.season === filters.season);
  const totalIn = +(entries.reduce((s, e) => s + (e.mill_w || 0), 0) / 100).toFixed(2);
  const millingEntries = database.getMillingEntries(filters);
  const totalUsed = +millingEntries.reduce((s, e) => s + (e.paddy_input_qntl || 0), 0).toFixed(2);
  res.json({ total_paddy_in_qntl: totalIn, total_paddy_used_qntl: totalUsed, available_paddy_qntl: +(totalIn - totalUsed).toFixed(2) });
});

router.get('/api/byproduct-stock', (req, res) => {
  if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
  const millingEntries = database.getMillingEntries(req.query);
  let sales = [...database.data.byproduct_sales];
  if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
  if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
  const products = ['bran', 'kunda', 'broken', 'kanki', 'husk'];
  const stock = {};
  products.forEach(p => {
    const produced = +millingEntries.reduce((s, e) => s + (e[`${p}_qntl`] || 0), 0).toFixed(2);
    const pSales = sales.filter(s => s.product === p);
    const sold = +pSales.reduce((s, e) => s + (e.quantity_qntl || 0), 0).toFixed(2);
    const revenue = +pSales.reduce((s, e) => s + (e.total_amount || 0), 0).toFixed(2);
    stock[p] = { produced_qntl: produced, sold_qntl: sold, available_qntl: +(produced - sold).toFixed(2), total_revenue: revenue };
  });
  res.json(stock);
});

router.post('/api/byproduct-sales', (req, res) => {
  if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
  const sale = {
    id: uuidv4(), ...req.body,
    total_amount: +((req.body.quantity_qntl || 0) * (req.body.rate_per_qntl || 0)).toFixed(2),
    created_by: req.query.username || '',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  database.data.byproduct_sales.push(sale);
  database.save();
  res.json(sale);
});

router.get('/api/byproduct-sales', (req, res) => {
  if (!database.data.byproduct_sales) database.data.byproduct_sales = [];
  let sales = [...database.data.byproduct_sales];
  if (req.query.product) sales = sales.filter(s => s.product === req.query.product);
  if (req.query.kms_year) sales = sales.filter(s => s.kms_year === req.query.kms_year);
  if (req.query.season) sales = sales.filter(s => s.season === req.query.season);
  res.json(sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.delete('/api/byproduct-sales/:id', (req, res) => {
  if (!database.data.byproduct_sales) return res.status(404).json({ detail: 'Sale not found' });
  const len = database.data.byproduct_sales.length;
  database.data.byproduct_sales = database.data.byproduct_sales.filter(s => s.id !== req.params.id);
  if (database.data.byproduct_sales.length < len) { database.save(); return res.json({ message: 'Sale deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Sale not found' });
});

// ============ FRK PURCHASES ============
router.post('/api/frk-purchases', (req, res) => {
  if (!database.data.frk_purchases) database.data.frk_purchases = [];
  const d = req.body;
  const sale = { id: uuidv4(), date: d.date, party_name: d.party_name || '', quantity_qntl: d.quantity_qntl || 0, rate_per_qntl: d.rate_per_qntl || 0, total_amount: +((d.quantity_qntl || 0) * (d.rate_per_qntl || 0)).toFixed(2), note: d.note || '', kms_year: d.kms_year || '', season: d.season || '', created_by: req.query.username || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  database.data.frk_purchases.push(sale); database.save(); res.json(sale);
});
router.get('/api/frk-purchases', (req, res) => {
  if (!database.data.frk_purchases) database.data.frk_purchases = [];
  let p = [...database.data.frk_purchases];
  if (req.query.kms_year) p = p.filter(x => x.kms_year === req.query.kms_year);
  if (req.query.season) p = p.filter(x => x.season === req.query.season);
  res.json(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});
router.delete('/api/frk-purchases/:id', (req, res) => {
  if (!database.data.frk_purchases) return res.status(404).json({ detail: 'Not found' });
  const len = database.data.frk_purchases.length;
  database.data.frk_purchases = database.data.frk_purchases.filter(x => x.id !== req.params.id);
  if (database.data.frk_purchases.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});
router.get('/api/frk-stock', (req, res) => {
  if (!database.data.frk_purchases) database.data.frk_purchases = [];
  let purchases = [...database.data.frk_purchases];
  if (req.query.kms_year) purchases = purchases.filter(x => x.kms_year === req.query.kms_year);
  if (req.query.season) purchases = purchases.filter(x => x.season === req.query.season);
  const totalPurchased = +purchases.reduce((s, p) => s + (p.quantity_qntl || 0), 0).toFixed(2);
  const totalCost = +purchases.reduce((s, p) => s + (p.total_amount || 0), 0).toFixed(2);
  const millingEntries = database.getMillingEntries(req.query);
  const totalUsed = +millingEntries.reduce((s, e) => s + (e.frk_used_qntl || 0), 0).toFixed(2);
  res.json({ total_purchased_qntl: totalPurchased, total_used_qntl: totalUsed, available_qntl: +(totalPurchased - totalUsed).toFixed(2), total_cost: totalCost });
});

// ============ PADDY CUSTODY REGISTER ============
router.get('/api/paddy-custody-register', (req, res) => {
  const filters = req.query;
  let entries = [...database.data.entries];
  if (filters.kms_year) entries = entries.filter(e => e.kms_year === filters.kms_year);
  if (filters.season) entries = entries.filter(e => e.season === filters.season);
  const millingEntries = database.getMillingEntries(filters);
  const rows = [];
  entries.forEach(e => rows.push({ date: e.date || '', type: 'received', description: `Truck: ${e.truck_no || ''} | Agent: ${e.agent_name || ''} | Mandi: ${e.mandi_name || ''}`, received_qntl: +((e.mill_w || 0) / 100).toFixed(2), issued_qntl: 0, source_id: e.id || '' }));
  millingEntries.forEach(e => rows.push({ date: e.date || '', type: 'issued', description: `Milling (${(e.rice_type || 'parboiled').charAt(0).toUpperCase() + (e.rice_type || '').slice(1)}) | Rice: ${e.rice_qntl || 0}Q`, received_qntl: 0, issued_qntl: e.paddy_input_qntl || 0, source_id: e.id || '' }));
  rows.sort((a, b) => a.date.localeCompare(b.date));
  let balance = 0;
  rows.forEach(r => { balance += r.received_qntl - r.issued_qntl; r.balance_qntl = +balance.toFixed(2); });
  res.json({ rows, total_received: +rows.reduce((s, r) => s + r.received_qntl, 0).toFixed(2), total_issued: +rows.reduce((s, r) => s + r.issued_qntl, 0).toFixed(2), final_balance: +balance.toFixed(2) });
});

// ============ BACKUP ENDPOINTS ============
router.get('/api/backups', (req, res) => {
  const backups = getBackupsList();
  const today = new Date().toISOString().substring(0, 10);
  const hasTodayBkp = backups.some(b => b.created_at.substring(0, 10) === today);
  res.json({ backups, has_today_backup: hasTodayBkp, max_backups: MAX_BACKUPS, backup_dir: path.resolve(BACKUP_DIR) });
});

router.post('/api/backups', (req, res) => {
  const result = createBackup('manual');
  if (result.success) return res.json({ success: true, message: 'Backup ban gaya!', backup: result });
  res.status(500).json({ detail: result.error });
});

router.post('/api/backups/restore', (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ detail: 'Filename required' });
  const result = restoreBackup(filename);
  if (result.success) return res.json(result);
  res.status(400).json({ detail: result.error });
});

router.delete('/api/backups/:filename', (req, res) => {
  const filepath = path.join(BACKUP_DIR, req.params.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ detail: 'File not found' });
  try {
    fs.unlinkSync(filepath);
    res.json({ success: true, message: 'Backup delete ho gaya' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

router.get('/api/backups/status', (req, res) => {
  const backups = getBackupsList();
  const today = new Date().toISOString().substring(0, 10);
  res.json({
    has_today_backup: backups.some(b => b.created_at.substring(0, 10) === today),
    last_backup: backups.length > 0 ? backups[0] : null,
    total_backups: backups.length
  });
});



  return router;
};
