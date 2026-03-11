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
      // Update Jama ledger entry with new rate
      const finalQntl = Math.round(((m.qntl || 0) - (m.bag || 0) / 100) * 100) / 100;
      if (finalQntl > 0 && database.data.cash_transactions) {
        const cashTaken = parseFloat(m.cash_paid) || 0;
        const dieselTaken = parseFloat(m.diesel_paid) || 0;
        const deductions = cashTaken + dieselTaken;
        const newGross = Math.round(finalQntl * req.body.rate_per_qntl * 100) / 100;
        const jamaIdx = database.data.cash_transactions.findIndex(t => t.linked_entry_id === m.id && (t.reference||'').startsWith('truck_entry:'));
        if (jamaIdx !== -1) {
          database.data.cash_transactions[jamaIdx].amount = newGross;
          database.data.cash_transactions[jamaIdx].description = `Truck Entry: ${m.truck_no} - ${finalQntl}Q @ Rs.${req.body.rate_per_qntl}` + (deductions > 0 ? ` (Ded: Rs.${deductions})` : '');
          database.data.cash_transactions[jamaIdx].updated_at = new Date().toISOString();
        }
      }
    });
    updatedCount = matching.length;
  } else {
    database.updateTruckPayment(req.params.entryId, { rate_per_qntl: req.body.rate_per_qntl });
  }
  database.save();
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
    const truckNo = entry?.truck_no || '';
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: truckNo, party_type: 'Truck',
      description: `Truck Payment: ${truckNo} - Rs.${req.body.amount}`,
      amount: Math.round(req.body.amount * 100) / 100, reference: `truck_pay:${req.params.entryId.substring(0,8)}`,
      kms_year: entry?.kms_year || '', season: entry?.season || '',
      created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
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
    const truckNo = entry.truck_no || '';
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: truckNo, party_type: 'Truck',
      description: `Truck Payment: ${truckNo} (Full - Mark Paid)`,
      amount: Math.round(net * 100) / 100, reference: `truck_markpaid:${req.params.entryId.substring(0,8)}`,
      kms_year: entry.kms_year || '', season: entry.season || '',
      created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
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
  // Auto Cash Book entries
  if (req.body.amount > 0) {
    // Create/Update JAMA (Ledger) entry for agent commission
    const target = database.getMandiTargets({ kms_year, season }).find(t => (t.mandi_name||'').toLowerCase() === mandiName.toLowerCase());
    if (target) {
      const entries = database.getEntries({ kms_year, season });
      const mandiEntries = entries.filter(e => (e.mandi_name||'').toLowerCase() === mandiName.toLowerCase());
      const achievedQntl = Math.round(mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0) * 100) / 100;
      const baseRate = target.base_rate ?? 10;
      const cuttingRate = target.cutting_rate ?? 5;
      const cuttingPercent = target.cutting_percent || 0;
      const cuttingQntl = Math.round(achievedQntl * cuttingPercent / 100 * 100) / 100;
      const totalAmount = Math.round(((target.target_qntl * baseRate) + (cuttingQntl * cuttingRate)) * 100) / 100;

      const linkedId = `agent_jama:${mandiName}:${kms_year}:${season}`;
      const ct = col('cash_transactions');
      const existingIdx = ct.findIndex(t => t.linked_payment_id === linkedId);
      if (existingIdx === -1 && totalAmount > 0) {
        ct.push({
          id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'jama',
          category: mandiName, party_type: 'Agent',
          description: `Agent Commission: ${mandiName} - ${achievedQntl}Q @ Rs.${baseRate}`,
          amount: totalAmount, reference: `agent_comm:${mandiName.substring(0,10)}`,
          kms_year: kms_year || '', season: season || '',
          created_by: req.query.username || 'system', linked_payment_id: linkedId,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
      } else if (existingIdx !== -1 && totalAmount > 0) {
        ct[existingIdx].amount = totalAmount;
        ct[existingIdx].description = `Agent Commission: ${mandiName} - ${achievedQntl}Q @ Rs.${baseRate}`;
        ct[existingIdx].updated_at = new Date().toISOString();
      }
    }

    // NIKASI (Cash) - Agent Payment
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: mandiName, party_type: 'Agent',
      description: `Agent Payment: ${mandiName} - Rs.${req.body.amount}`,
      amount: Math.round(req.body.amount * 100) / 100, reference: `agent_pay:${mandiName.substring(0,10)}`,
      kms_year: kms_year || '', season: season || '',
      created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
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
  const base_rate = target.base_rate ?? 10;
  const cutting_rate = target.cutting_rate ?? 5;
  const total_amount = (target.target_qntl * base_rate) + (cutting_qntl * cutting_rate);
  const current = database.getAgentPayment(mandiName, kms_year, season);
  const history = current.payments_history || [];
  history.push({ amount: total_amount, date: new Date().toISOString(), note: 'Full payment - marked as paid', by: req.query.username || 'admin' });
  database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: total_amount, status: 'paid', payments_history: history });
  if (total_amount > 0) {
    // JAMA (Ledger) - Agent Commission entry
    const mandiEntries = database.data.entries.filter(e => (e.mandi_name||'').toLowerCase() === mandiName.toLowerCase() && (!kms_year || e.kms_year === kms_year));
    const achieved_qntl = Math.round(mandiEntries.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0) * 100) / 100;
    const linked_jama_id = `agent_jama:${mandiName}:${kms_year}:${season}`;
    const existingJama = col('cash_transactions').find(t => t.linked_payment_id === linked_jama_id);
    if (!existingJama) {
      col('cash_transactions').push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'jama',
        category: mandiName, party_type: 'Agent',
        description: `Agent Commission: ${mandiName} - ${achieved_qntl}Q @ Rs.${base_rate}`,
        amount: Math.round(total_amount * 100) / 100, reference: `agent_comm:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: linked_jama_id,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    } else {
      existingJama.amount = Math.round(total_amount * 100) / 100;
      existingJama.description = `Agent Commission: ${mandiName} - ${achieved_qntl}Q @ Rs.${base_rate}`;
      existingJama.updated_at = new Date().toISOString();
    }
    // NIKASI (Cash) - Agent Payment
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
      category: mandiName, party_type: 'Agent',
      description: `Agent Payment: ${mandiName} (Full - Mark Paid)`,
      amount: Math.round(total_amount * 100) / 100, reference: `agent_markpaid:${mandiName.substring(0,10)}`,
      kms_year: kms_year || '', season: season || '',
      created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
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
  // Delete linked cash book entries (both nikasi and jama)
  database.data.cash_transactions = col('cash_transactions').filter(t =>
    t.linked_payment_id !== `agent:${mandiName}:${kms_year}:${season}` &&
    t.linked_payment_id !== `agent_jama:${mandiName}:${kms_year}:${season}`
  );
  database.save();
  res.json({ success: true, message: 'Payment undo ho gaya - status reset to pending' });
});

router.get('/api/agent-payments/:mandiName/history', (req, res) => {
  const { kms_year, season } = req.query;
  const mandiName = decodeURIComponent(req.params.mandiName);
  const payment = database.getAgentPayment(mandiName, kms_year, season);
  res.json({ history: payment.payments_history || [], total_paid: payment.paid_amount || 0 });
});

// ===== TRUCK OWNER CONSOLIDATED PAYMENT ENDPOINTS =====
router.post('/api/truck-owner/:truckNo/pay', (req, res) => {
  const truckNo = decodeURIComponent(req.params.truckNo);
  const { kms_year, season, username, role } = req.query;
  if (role !== 'admin') return res.status(403).json({ detail: 'Sirf admin payment kar sakta hai' });
  const { amount, note, payment_mode } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ detail: 'Amount 0 se zyada hona chahiye' });

  let entries = database.data.entries.filter(e => e.truck_no === truckNo);
  if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
  if (season) entries = entries.filter(e => e.season === season);
  if (!entries.length) return res.status(404).json({ detail: 'Is truck ke entries nahi mile' });

  entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let remaining = amount;
  for (const entry of entries) {
    if (remaining <= 0) break;
    const payment = database.getTruckPayment(entry.id);
    const rate = payment.rate_per_qntl || 0;
    const paidSoFar = payment.paid_amount || 0;
    const finalQntl = Math.round(((entry.qntl || 0) - (entry.bag || 0) / 100) * 100) / 100;
    const cashTaken = parseFloat(entry.cash_paid) || 0;
    const dieselTaken = parseFloat(entry.diesel_paid) || 0;
    const gross = Math.round(finalQntl * rate * 100) / 100;
    const net = Math.round((gross - cashTaken - dieselTaken) * 100) / 100;
    const tripBalance = Math.max(0, Math.round((net - paidSoFar) * 100) / 100);
    if (tripBalance <= 0) continue;
    const allot = Math.min(remaining, tripBalance);
    const newPaid = Math.round((paidSoFar + allot) * 100) / 100;
    const newBalance = Math.max(0, Math.round((net - newPaid) * 100) / 100);
    const history = payment.payments_history || [];
    history.push({ amount: allot, date: new Date().toISOString(), note: note ? `Owner Payment: ${note}` : 'Owner Payment', by: username || '', payment_mode: payment_mode || 'cash' });
    let status = 'pending';
    if (newBalance < 0.10) status = 'paid';
    else if (newPaid > 0) status = 'partial';
    database.updateTruckPayment(entry.id, { paid_amount: newPaid, payments_history: history, status });
    remaining = Math.round((remaining - allot) * 100) / 100;
  }

  // Cash book nikasi only (no ledger jama)
  col('cash_transactions').push({
    id: uuidv4(), date: new Date().toISOString().split('T')[0],
    account: payment_mode || 'cash', txn_type: 'nikasi',
    category: truckNo, party_type: 'Truck',
    description: `Truck Owner Payment: ${truckNo}` + (note ? ` - ${note}` : ''),
    amount: amount, reference: `truck_owner:${truckNo}`,
    linked_payment_id: `truck_owner:${truckNo}:${kms_year || ''}:${season || ''}`,
    kms_year: kms_year || '', season: season || '',
    created_at: new Date().toISOString()
  });

  // Store owner payment history
  if (!database.data.truck_owner_payments) database.data.truck_owner_payments = [];
  let ownerDoc = database.data.truck_owner_payments.find(d => d.truck_no === truckNo && d.kms_year === (kms_year||'') && d.season === (season||''));
  if (!ownerDoc) {
    ownerDoc = { truck_no: truckNo, kms_year: kms_year || '', season: season || '', payments_history: [] };
    database.data.truck_owner_payments.push(ownerDoc);
  }
  ownerDoc.payments_history.push({ amount, date: new Date().toISOString(), note: note || '', by: username || '', payment_mode: payment_mode || 'cash' });
  ownerDoc.updated_at = new Date().toISOString();

  database.save();
  res.json({ success: true, message: `₹${amount} payment ho gaya! (${Math.round(amount - remaining)} distributed)` });
});

router.post('/api/truck-owner/:truckNo/mark-paid', (req, res) => {
  const truckNo = decodeURIComponent(req.params.truckNo);
  const { kms_year, season, username, role } = req.query;
  if (role !== 'admin') return res.status(403).json({ detail: 'Sirf admin mark paid kar sakta hai' });

  let entries = database.data.entries.filter(e => e.truck_no === truckNo);
  if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
  if (season) entries = entries.filter(e => e.season === season);
  if (!entries.length) return res.status(404).json({ detail: 'Entries nahi mile' });

  let totalMarked = 0;
  for (const entry of entries) {
    const payment = database.getTruckPayment(entry.id);
    const rate = payment.rate_per_qntl || 0;
    const paidSoFar = payment.paid_amount || 0;
    const finalQntl = Math.round(((entry.qntl || 0) - (entry.bag || 0) / 100) * 100) / 100;
    const gross = Math.round(finalQntl * rate * 100) / 100;
    const deductions = (parseFloat(entry.cash_paid) || 0) + (parseFloat(entry.diesel_paid) || 0);
    const net = Math.round((gross - deductions) * 100) / 100;
    if (paidSoFar >= net && net > 0) continue;
    const tripBalance = Math.max(0, Math.round((net - paidSoFar) * 100) / 100);
    totalMarked += tripBalance;
    const history = payment.payments_history || [];
    history.push({ amount: tripBalance, date: new Date().toISOString(), note: 'Owner Mark Paid (Full)', by: username || '' });
    database.updateTruckPayment(entry.id, { paid_amount: net, payments_history: history, status: 'paid' });
  }

  if (totalMarked > 0) {
    // Cash book nikasi only (no ledger jama)
    col('cash_transactions').push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0],
      account: 'cash', txn_type: 'nikasi',
      category: truckNo, party_type: 'Truck',
      description: `Truck Owner Full Payment: ${truckNo}`,
      amount: totalMarked, reference: `truck_owner:${truckNo}`,
      linked_payment_id: `truck_owner:${truckNo}:${kms_year || ''}:${season || ''}`,
      kms_year: kms_year || '', season: season || '',
      created_at: new Date().toISOString()
    });
  }
  database.save();
  res.json({ success: true, message: `Sab trips paid! ₹${totalMarked} mark paid kiya` });
});

router.post('/api/truck-owner/:truckNo/undo-paid', (req, res) => {
  const truckNo = decodeURIComponent(req.params.truckNo);
  const { kms_year, season, username, role } = req.query;
  if (role !== 'admin') return res.status(403).json({ detail: 'Sirf admin undo kar sakta hai' });

  let entries = database.data.entries.filter(e => e.truck_no === truckNo);
  if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
  if (season) entries = entries.filter(e => e.season === season);

  for (const entry of entries) {
    const payment = database.getTruckPayment(entry.id);
    if (payment.paid_amount > 0) {
      const history = payment.payments_history || [];
      history.push({ amount: -(payment.paid_amount || 0), date: new Date().toISOString(), note: 'UNDO - Owner payment reversed', by: username || '' });
      database.updateTruckPayment(entry.id, { paid_amount: 0, payments_history: history, status: 'pending' });
    }
    // Delete individual linked entries
    database.data.cash_transactions = col('cash_transactions').filter(t => t.linked_payment_id !== `truck:${entry.id}`);
  }
  // Delete owner-level cash transactions
  database.data.cash_transactions = col('cash_transactions').filter(t => t.linked_payment_id !== `truck_owner:${truckNo}:${kms_year || ''}:${season || ''}`);
  database.save();
  res.json({ success: true, message: `${truckNo} ke saare payments undo ho gaye` });
});

router.get('/api/truck-owner/:truckNo/history', (req, res) => {
  const truckNo = decodeURIComponent(req.params.truckNo);
  const { kms_year, season } = req.query;

  if (!database.data.truck_owner_payments) database.data.truck_owner_payments = [];
  const ownerDoc = database.data.truck_owner_payments.find(d => d.truck_no === truckNo && d.kms_year === (kms_year||'') && d.season === (season||''));

  let entries = database.data.entries.filter(e => e.truck_no === truckNo);
  if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
  if (season) entries = entries.filter(e => e.season === season);

  const allHistory = [];
  if (ownerDoc) {
    for (const h of (ownerDoc.payments_history || [])) {
      allHistory.push({ ...h, source: 'owner' });
    }
  }
  for (const entry of entries) {
    const payment = database.getTruckPayment(entry.id);
    for (const h of (payment.payments_history || [])) {
      if (!(h.note || '').includes('Owner')) {
        allHistory.push({ ...h, source: 'trip', entry_id: entry.id });
      }
    }
  }
  allHistory.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  res.json({ history: allHistory });
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
