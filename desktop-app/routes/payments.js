const express = require('express');
const { safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function(database) {

  // ===== TRUCK PAYMENTS =====
  router.get('/api/truck-payments', safeSync((req, res) => {
    const entries = database.getEntries(req.query);
    const payments = entries.map(entry => {
      const payment = database.getTruckPayment(entry.id);
      const final_qntl = (entry.qntl || 0) - (entry.bag || 0) / 100;
      const gross_amount = final_qntl * payment.rate_per_qntl;
      const deductions = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
      const net_amount = gross_amount - deductions;
      const balance_amount = Math.max(0, net_amount - payment.paid_amount);
      let status = 'pending';
      if (balance_amount < 0.01) status = 'paid';
      else if (payment.paid_amount > 0) status = 'partial';
      return {
        entry_id: entry.id, truck_no: entry.truck_no, date: entry.date,
        agent_name: entry.agent_name, mandi_name: entry.mandi_name,
        total_qntl: entry.qntl, total_bag: entry.bag,
        final_qntl: Math.round(final_qntl * 100) / 100,
        cash_taken: entry.cash_paid || 0, diesel_taken: entry.diesel_paid || 0,
        rate_per_qntl: payment.rate_per_qntl,
        gross_amount: Math.round(gross_amount * 100) / 100,
        deductions: Math.round(deductions * 100) / 100,
        net_amount: Math.round(net_amount * 100) / 100,
        paid_amount: payment.paid_amount,
        balance_amount: Math.round(balance_amount * 100) / 100,
        status, kms_year: entry.kms_year, season: entry.season
      };
    });
    res.json(payments);
  }));

  router.put('/api/truck-payments/:entryId/rate', safeSync((req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.entryId);
    let updatedCount = 1;
    if (entry && entry.truck_no && entry.mandi_name) {
      const matching = database.data.entries.filter(e => e.truck_no === entry.truck_no && e.mandi_name === entry.mandi_name);
      matching.forEach(m => { database.updateTruckPayment(m.id, { rate_per_qntl: req.body.rate_per_qntl }); });
      updatedCount = matching.length;
    } else {
      database.updateTruckPayment(req.params.entryId, { rate_per_qntl: req.body.rate_per_qntl });
    }
    const payment = database.getTruckPayment(req.params.entryId);
    res.json({ success: true, payment, updated_count: updatedCount, truck_no: entry?.truck_no, mandi_name: entry?.mandi_name });
  }));

  router.post('/api/truck-payments/:entryId/pay', safeSync((req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.entryId);
    const current = database.getTruckPayment(req.params.entryId);
    const newPaidAmount = current.paid_amount + req.body.amount;
    const history = current.payment_history || [];
    history.push({ amount: req.body.amount, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
    database.updateTruckPayment(req.params.entryId, { paid_amount: newPaidAmount, payment_history: history });
    if (req.body.amount > 0 && !database.data.cash_transactions) database.data.cash_transactions = [];
    if (req.body.amount > 0) {
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: 'Truck Payment', description: `Truck Payment: ${entry?.truck_no || ''} - Rs.${req.body.amount}`,
        amount: Math.round(req.body.amount * 100) / 100, reference: `truck_pay:${req.params.entryId.substring(0,8)}`,
        kms_year: entry?.kms_year || '', season: entry?.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment recorded' });
  }));

  router.post('/api/truck-payments/:entryId/mark-paid', safeSync((req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });
    const current = database.getTruckPayment(req.params.entryId);
    const final_qntl = (entry.qntl || 0) - (entry.bag || 0) / 100;
    const gross_amount = final_qntl * current.rate_per_qntl;
    const deductions = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
    const net_amount = gross_amount - deductions;
    database.updateTruckPayment(req.params.entryId, { paid_amount: net_amount, status: 'paid' });
    if (net_amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: 'Truck Payment', description: `Truck Payment: ${entry.truck_no || ''} (Full - Mark Paid)`,
        amount: Math.round(net_amount * 100) / 100, reference: `truck_markpaid:${req.params.entryId.substring(0,8)}`,
        kms_year: entry.kms_year || '', season: entry.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment cleared' });
  }));

  router.post('/api/truck-payments/:entryId/undo-paid', safeSync((req, res) => {
    database.updateTruckPayment(req.params.entryId, { paid_amount: 0, status: 'pending' });
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `truck:${req.params.entryId}`);
    }
    database.save();
    res.json({ success: true, message: 'Payment undo ho gaya' });
  }));

  router.get('/api/truck-payments/:entryId/history', safeSync((req, res) => {
    const payment = database.getTruckPayment(req.params.entryId);
    res.json({ history: payment.payment_history || [], total_paid: payment.paid_amount || 0 });
  }));

  // ===== AGENT PAYMENTS =====
  router.get('/api/agent-payments', safeSync((req, res) => {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    const payments = targets.map(target => {
      const payment = database.getAgentPayment(target.mandi_name, target.kms_year, target.season);
      const mandiEntries = entries.filter(e => (e.mandi_name||'').toLowerCase() === (target.mandi_name||'').toLowerCase());
      const achieved_qntl = mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0);
      const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
      const target_amount = target.target_qntl * (target.base_rate ?? 10);
      const cutting_amount = cutting_qntl * (target.cutting_rate ?? 5);
      const total_amount = target_amount + cutting_amount;
      const balance_amount = Math.max(0, total_amount - payment.paid_amount);
      let status = 'pending';
      if (balance_amount < 0.01) status = 'paid';
      else if (payment.paid_amount > 0) status = 'partial';
      return {
        mandi_name: target.mandi_name, agent_name: target.agent_name || '',
        target_qntl: target.target_qntl, cutting_percent: target.cutting_percent,
        cutting_qntl: Math.round(cutting_qntl * 100) / 100,
        base_rate: target.base_rate ?? 10, cutting_rate: target.cutting_rate ?? 5,
        target_amount: Math.round(target_amount * 100) / 100,
        cutting_amount: Math.round(cutting_amount * 100) / 100,
        total_amount: Math.round(total_amount * 100) / 100,
        achieved_qntl: Math.round(achieved_qntl * 100) / 100,
        is_target_complete: achieved_qntl >= target.expected_total,
        paid_amount: payment.paid_amount,
        balance_amount: Math.round(balance_amount * 100) / 100,
        status, kms_year: target.kms_year, season: target.season
      };
    });
    res.json(payments);
  }));

  router.post('/api/agent-payments/:mandiName/pay', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    const current = database.getAgentPayment(mandiName, kms_year, season);
    const newPaidAmount = current.paid_amount + req.body.amount;
    const history = current.payment_history || [];
    history.push({ amount: req.body.amount, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
    database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: newPaidAmount, payment_history: history });
    if (req.body.amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: 'Agent Payment', description: `Agent Payment: ${mandiName} - Rs.${req.body.amount}`,
        amount: Math.round(req.body.amount * 100) / 100, reference: `agent_pay:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment recorded' });
  }));

  router.post('/api/agent-payments/:mandiName/mark-paid', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    const target = database.getMandiTargets({ kms_year, season }).find(t => t.mandi_name === mandiName);
    if (!target) return res.status(404).json({ detail: 'Mandi target not found' });
    const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
    const total_amount = (target.target_qntl * (target.base_rate ?? 10)) + (cutting_qntl * (target.cutting_rate ?? 5));
    database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: total_amount, status: 'paid' });
    if (total_amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      database.data.cash_transactions.push({
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
  }));

  router.post('/api/agent-payments/:mandiName/undo-paid', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: 0, status: 'pending' });
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `agent:${mandiName}:${kms_year}:${season}`);
    }
    database.save();
    res.json({ success: true, message: 'Payment undo ho gaya' });
  }));

  router.get('/api/agent-payments/:mandiName/history', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const payment = database.getAgentPayment(decodeURIComponent(req.params.mandiName), kms_year, season);
    res.json({ history: payment.payment_history || [], total_paid: payment.paid_amount || 0 });
  }));

  return router;
};
