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
    if (req.body.amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      const truckNo = entry?.truck_no || '';
      database.data.cash_transactions.push({
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
    res.json({ success: true, message: 'Payment recorded', total_paid: newPaidAmount });
  }));

  router.post('/api/truck-payments/:entryId/mark-paid', safeSync((req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });
    const current = database.getTruckPayment(req.params.entryId);
    const final_qntl = (entry.qntl || 0) - (entry.bag || 0) / 100;
    const gross_amount = final_qntl * current.rate_per_qntl;
    const deductions = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
    const net_amount = gross_amount - deductions;
    const history = current.payment_history || [];
    history.push({ amount: net_amount, date: new Date().toISOString(), note: 'Full payment - marked as paid', by: req.query.username || 'admin' });
    database.updateTruckPayment(req.params.entryId, { paid_amount: net_amount, status: 'paid', payment_history: history });
    if (net_amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      const truckNo = entry.truck_no || '';
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: truckNo, party_type: 'Truck',
        description: `Truck Payment: ${truckNo} (Full - Mark Paid)`,
        amount: Math.round(net_amount * 100) / 100, reference: `truck_markpaid:${req.params.entryId.substring(0,8)}`,
        kms_year: entry.kms_year || '', season: entry.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment cleared' });
  }));

  router.post('/api/truck-payments/:entryId/undo-paid', safeSync((req, res) => {
    const entryId = req.params.entryId;
    database.updateTruckPayment(entryId, { paid_amount: 0, status: 'pending' });
    if (database.data.cash_transactions) {
      // Delete individual trip entries
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `truck:${entryId}`);
      // Also delete owner-level entries for this truck
      const entry = database.data.entries.find(e => e.id === entryId);
      if (entry && entry.truck_no) {
        database.data.cash_transactions = database.data.cash_transactions.filter(t =>
          !(t.linked_payment_id || '').startsWith(`truck_owner:${entry.truck_no}:`)
        );
      }
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
        const existingIdx = database.data.cash_transactions.findIndex(t => t.linked_payment_id === linkedId);
        if (existingIdx === -1 && totalAmount > 0) {
          database.data.cash_transactions.push({
            id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'jama',
            category: mandiName, party_type: 'Agent',
            description: `Agent Commission: ${mandiName} @ Rs.${baseRate}`,
            amount: totalAmount, reference: `agent_comm:${mandiName.substring(0,10)}`,
            kms_year: kms_year || '', season: season || '',
            created_by: req.query.username || 'system', linked_payment_id: linkedId,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString()
          });
        } else if (existingIdx !== -1 && totalAmount > 0) {
          database.data.cash_transactions[existingIdx].amount = totalAmount;
          database.data.cash_transactions[existingIdx].description = `Agent Commission: ${mandiName} @ Rs.${baseRate}`;
          database.data.cash_transactions[existingIdx].updated_at = new Date().toISOString();
        }
      }

      // NIKASI (Cash) - Agent Payment
      database.data.cash_transactions.push({
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
    res.json({ success: true, message: 'Payment recorded', total_paid: newPaidAmount });
  }));

  router.post('/api/agent-payments/:mandiName/mark-paid', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    const target = database.getMandiTargets({ kms_year, season }).find(t => t.mandi_name === mandiName);
    if (!target) return res.status(404).json({ detail: 'Mandi target not found' });
    const cutting_qntl = target.target_qntl * target.cutting_percent / 100;
    const base_rate = target.base_rate ?? 10;
    const cutting_rate = target.cutting_rate ?? 5;
    const total_amount = (target.target_qntl * base_rate) + (cutting_qntl * cutting_rate);
    const current = database.getAgentPayment(mandiName, kms_year, season);
    const hist = current.payment_history || [];
    hist.push({ amount: total_amount, date: new Date().toISOString(), note: 'Full payment - marked as paid', by: req.query.username || 'admin' });
    database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: total_amount, status: 'paid', payment_history: hist });
    if (total_amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      // JAMA (Ledger) - Agent Commission entry
      const mandiEntries = database.data.entries.filter(e => (e.mandi_name||'').toLowerCase() === mandiName.toLowerCase() && (!kms_year || e.kms_year === kms_year));
      const achieved_qntl = Math.round(mandiEntries.reduce((s,e) => s + (e.qntl||0) - (e.bag||0)/100, 0) * 100) / 100;
      const linked_jama_id = `agent_jama:${mandiName}:${kms_year}:${season}`;
      const existingJama = database.data.cash_transactions.find(t => t.linked_payment_id === linked_jama_id);
      if (!existingJama) {
        database.data.cash_transactions.push({
          id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'jama',
          category: mandiName, party_type: 'Agent',
          description: `Agent Commission: ${mandiName} @ Rs.${base_rate}`,
          amount: Math.round(total_amount * 100) / 100, reference: `agent_comm:${mandiName.substring(0,10)}`,
          kms_year: kms_year || '', season: season || '',
          created_by: req.query.username || 'system', linked_payment_id: linked_jama_id,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
      } else {
        existingJama.amount = Math.round(total_amount * 100) / 100;
        existingJama.description = `Agent Commission: ${mandiName} @ Rs.${base_rate}`;
        existingJama.updated_at = new Date().toISOString();
      }
      // NIKASI (Cash) - Agent Payment
      database.data.cash_transactions.push({
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
  }));

  router.post('/api/agent-payments/:mandiName/undo-paid', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: 0, status: 'pending' });
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        t.linked_payment_id !== `agent:${mandiName}:${kms_year}:${season}` &&
        t.linked_payment_id !== `agent_jama:${mandiName}:${kms_year}:${season}`
      );
    }
    database.save();
    res.json({ success: true, message: 'Payment undo ho gaya' });
  }));

  router.get('/api/agent-payments/:mandiName/history', safeSync((req, res) => {
    const { kms_year, season } = req.query;
    const payment = database.getAgentPayment(decodeURIComponent(req.params.mandiName), kms_year, season);
    res.json({ history: payment.payment_history || [], total_paid: payment.paid_amount || 0 });
  }));

  // ===== TRUCK OWNER CONSOLIDATED PAYMENT ENDPOINTS =====
  router.post('/api/truck-owner/:truckNo/pay', safeSync((req, res) => {
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
      const history = payment.payment_history || [];
      history.push({ amount: allot, date: new Date().toISOString(), note: note ? `Owner Payment: ${note}` : 'Owner Payment', by: username || '', payment_mode: payment_mode || 'cash' });
      let status = 'pending';
      if (newBalance < 0.10) status = 'paid';
      else if (newPaid > 0) status = 'partial';
      database.updateTruckPayment(entry.id, { paid_amount: newPaid, payment_history: history, status });
      remaining = Math.round((remaining - allot) * 100) / 100;
    }

    // Cash book nikasi only (no ledger jama)
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    database.data.cash_transactions.push({
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
  }));

  router.post('/api/truck-owner/:truckNo/mark-paid', safeSync((req, res) => {
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
      const history = payment.payment_history || [];
      history.push({ amount: tripBalance, date: new Date().toISOString(), note: 'Owner Mark Paid (Full)', by: username || '' });
      database.updateTruckPayment(entry.id, { paid_amount: net, payment_history: history, status: 'paid' });
    }

    if (totalMarked > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      // Cash book nikasi only (no ledger jama)
      database.data.cash_transactions.push({
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
  }));

  router.post('/api/truck-owner/:truckNo/undo-paid', safeSync((req, res) => {
    const truckNo = decodeURIComponent(req.params.truckNo);
    const { kms_year, season, username, role } = req.query;
    if (role !== 'admin') return res.status(403).json({ detail: 'Sirf admin undo kar sakta hai' });

    let entries = database.data.entries.filter(e => e.truck_no === truckNo);
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);

    for (const entry of entries) {
      const payment = database.getTruckPayment(entry.id);
      if (payment.paid_amount > 0) {
        const history = payment.payment_history || [];
        history.push({ amount: -(payment.paid_amount || 0), date: new Date().toISOString(), note: 'UNDO - Owner payment reversed', by: username || '' });
        database.updateTruckPayment(entry.id, { paid_amount: 0, payment_history: history, status: 'pending' });
      }
      // Delete individual linked entries
      if (database.data.cash_transactions) {
        database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `truck:${entry.id}`);
      }
    }
    // Delete owner-level cash transactions
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t => t.linked_payment_id !== `truck_owner:${truckNo}:${kms_year || ''}:${season || ''}`);
    }
    database.save();
    res.json({ success: true, message: `${truckNo} ke saare payments undo ho gaye` });
  }));

  router.get('/api/truck-owner/:truckNo/history', safeSync((req, res) => {
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
      for (const h of (payment.payment_history || [])) {
        if (!(h.note || '').includes('Owner')) {
          allHistory.push({ ...h, source: 'trip', entry_id: entry.id });
        }
      }
    }
    allHistory.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||''));
    res.json({ history: allHistory });
  }));

  return router;
};
