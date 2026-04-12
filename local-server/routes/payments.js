const express = require('express');
const { safeSync, roundAmount } = require('./safe_handler');
const { fmtDate } = require('./pdf_helpers');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function(database) {

  // ===== TRUCK PAYMENTS =====
  router.get('/api/truck-payments', safeSync(async (req, res) => {
    // Exclude "Move to Paddy Purchase" entries (agent_extra settled)
    const entries = database.getEntries(req.query).filter(e => !e.moved_to_pvt_paddy);
    const allTxns = database.data.cash_transactions || [];
    
    // Get all truck_nos
    const truckNos = [...new Set(entries.map(e => e.truck_no).filter(Boolean))];
    
    // Get all ledger nikasi entries for these trucks
    const ledgerNikasi = allTxns.filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && truckNos.includes(t.category));
    
    // Deduction reference prefixes (already counted in deductions field)
    const DEDUCTION_PREFIXES = ['truck_cash_ded:', 'truck_diesel_ded:', 'entry_cash:'];
    
    // Group entries by truck_no
    const truckEntriesMap = {};
    entries.forEach(e => {
      const t = e.truck_no || '';
      if (!truckEntriesMap[t]) truckEntriesMap[t] = [];
      truckEntriesMap[t].push(e);
    });
    
    const payments = [];
    
    for (const [truckNo, truckEntries] of Object.entries(truckEntriesMap)) {
      // Sort oldest first for FIFO
      truckEntries.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)) || (a.created_at || '').localeCompare(b.created_at || ''));
      
      const truckLedger = ledgerNikasi.filter(t => t.category === truckNo);
      
      // Separate entry-specific vs manual payments
      const entrySpecificPaid = {};
      let manualPaymentsTotal = 0;
      
      for (const txn of truckLedger) {
        const ref = txn.reference || '';
        const amount = txn.amount || 0;
        
        if (DEDUCTION_PREFIXES.some(p => ref.startsWith(p))) continue;
        
        let attributed = false;
        for (const entry of truckEntries) {
          const eidShort = (entry.id || '').slice(0, 8);
          if (ref.startsWith(`truck_pay_ledger:${eidShort}`) || ref.startsWith(`truck_markpaid_ledger:${entry.id}`)) {
            entrySpecificPaid[entry.id] = (entrySpecificPaid[entry.id] || 0) + amount;
            attributed = true;
            break;
          }
        }
        if (!attributed) manualPaymentsTotal += amount;
      }
      
      // Distribute manual payments FIFO
      let remainingManual = manualPaymentsTotal;
      const entryManualPaid = {};
      for (const entry of truckEntries) {
        if (remainingManual <= 0) break;
        const payment = database.getTruckPayment(entry.id);
        const finalQntl = (entry.qntl || 0) - (entry.bag || 0) / 100;
        const deductions = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
        const net = finalQntl * payment.rate_per_qntl - deductions;
        const alreadyPaid = entrySpecificPaid[entry.id] || 0;
        const remainingForEntry = Math.max(0, net - alreadyPaid);
        const manualAlloc = Math.min(remainingManual, remainingForEntry);
        if (manualAlloc > 0) {
          entryManualPaid[entry.id] = manualAlloc;
          remainingManual -= manualAlloc;
        }
      }
      
      // Build payment status for each entry
      for (const entry of truckEntries) {
        const payment = database.getTruckPayment(entry.id);
        const finalQntl = (entry.qntl || 0) - (entry.bag || 0) / 100;
        const grossAmount = finalQntl * payment.rate_per_qntl;
        const deductions = (entry.cash_paid || 0) + (entry.diesel_paid || 0);
        const netAmount = grossAmount - deductions;
        const paidAmount = Math.round(((entrySpecificPaid[entry.id] || 0) + (entryManualPaid[entry.id] || 0)) * 100) / 100;
        const balanceAmount = Math.max(0, Math.round((netAmount - paidAmount) * 100) / 100);
        let status = 'pending';
        if (paidAmount > 0 && balanceAmount < 0.10) status = 'paid';
        else if (paidAmount > 0) status = 'partial';
        
        payments.push({
          entry_id: entry.id, truck_no: truckNo, date: entry.date,
          agent_name: entry.agent_name, mandi_name: entry.mandi_name,
          total_qntl: entry.qntl, total_bag: entry.bag,
          final_qntl: Math.round(finalQntl * 100) / 100,
          cash_taken: entry.cash_paid || 0, diesel_taken: entry.diesel_paid || 0,
          rate_per_qntl: payment.rate_per_qntl,
          gross_amount: roundAmount(grossAmount),
          deductions: Math.round(deductions * 100) / 100,
          net_amount: roundAmount(netAmount),
          paid_amount: paidAmount,
          balance_amount: balanceAmount,
          status, kms_year: entry.kms_year, season: entry.season
        });
      }
    }
    
    // Sort by date descending
    payments.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)));
    res.json(payments);
  }));

  router.put('/api/truck-payments/:entryId/rate', safeSync(async (req, res) => {
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

  router.post('/api/truck-payments/:entryId/pay', safeSync(async (req, res) => {
    const entry = database.data.entries.find(e => e.id === req.params.entryId);
    const current = database.getTruckPayment(req.params.entryId);
    const roundOff = parseFloat(req.body.round_off) || 0;
    const totalSettled = Math.round((req.body.amount + roundOff) * 100) / 100;
    const newPaidAmount = current.paid_amount + totalSettled;
    const history = current.payment_history || [];
    history.push({ amount: totalSettled, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
    database.updateTruckPayment(req.params.entryId, { paid_amount: newPaidAmount, payment_history: history });
    if (req.body.amount > 0) {
      if (!database.data.cash_transactions) database.data.cash_transactions = [];
      const truckNo = entry?.truck_no || '';
      // Cash Book Nikasi - actual cash
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: truckNo, party_type: 'Truck',
        description: `Truck Payment: ${truckNo} - Rs.${req.body.amount}`,
        amount: roundAmount(req.body.amount), reference: `truck_pay:${req.params.entryId.substring(0,8)}`,
        kms_year: entry?.kms_year || '', season: entry?.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
      // Ledger Nikasi - total including round off
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'nikasi',
        category: truckNo, party_type: 'Truck',
        description: `Truck Payment: ${truckNo} - Rs.${totalSettled}${roundOff ? ' (Cash: '+req.body.amount+', RoundOff: '+roundOff+')' : ''}`,
        amount: totalSettled, reference: `truck_pay_ledger:${req.params.entryId.substring(0,8)}`,
        kms_year: entry?.kms_year || '', season: entry?.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck_ledger:${req.params.entryId}:${uuidv4().substring(0,6)}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment recorded', total_paid: newPaidAmount });
  }));

  router.post('/api/truck-payments/:entryId/mark-paid', safeSync(async (req, res) => {
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
      // Cash Book Nikasi
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: truckNo, party_type: 'Truck',
        description: `Truck Payment: ${truckNo} (Full - Mark Paid)`,
        amount: roundAmount(net_amount), reference: `truck_markpaid:${req.params.entryId}`,
        kms_year: entry.kms_year || '', season: entry.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck:${req.params.entryId}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
      // Ledger Nikasi - reduce truck outstanding
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'nikasi',
        category: truckNo, party_type: 'Truck',
        description: `Truck Payment: ${truckNo} (Full - Mark Paid)`,
        amount: roundAmount(net_amount), reference: `truck_markpaid_ledger:${req.params.entryId}`,
        kms_year: entry.kms_year || '', season: entry.season || '',
        created_by: req.query.username || 'system', linked_payment_id: `truck_ledger_markpaid:${req.params.entryId}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment cleared' });
  }));

  router.post('/api/truck-payments/:entryId/undo-paid', safeSync(async (req, res) => {
    const entryId = req.params.entryId;
    const entry = database.data.entries.find(e => e.id === entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });
    const truckNo = entry.truck_no || '';
    const eidShort = entryId.slice(0, 8);
    
    // Reset truck_payments
    database.updateTruckPayment(entryId, { paid_amount: 0, status: 'pending' });
    
    if (database.data.cash_transactions) {
      const deductionPrefixes = [`truck_cash_ded:${eidShort}`, `truck_diesel_ded:${eidShort}`, `entry_cash:${eidShort}`, `truck_entry:${eidShort}`];
      
      // Delete ALL non-deduction entries for this truck (cash + ledger payments)
      database.data.cash_transactions = database.data.cash_transactions.filter(t => {
        // Keep entries that are not for this truck
        if (t.category !== truckNo) return true;
        const ref = t.reference || '';
        // Keep auto-deduction entries
        if (deductionPrefixes.some(p => ref.startsWith(p))) return true;
        // Keep jama entries (truck_entry is already in deductionPrefixes)
        if (t.account === 'ledger' && t.txn_type === 'jama') return true;
        // Delete everything else (payments - both manual and auto)
        if (t.txn_type === 'nikasi') return false;
        return true;
      });
      
      // Delete owner-level entries
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        !(t.linked_payment_id || '').startsWith(`truck_owner:${truckNo}:`)
      );
    }
    database.save();
    res.json({ success: true, message: 'Payment undo ho gaya - sab entries delete ho gayi' });
  }));

  router.get('/api/truck-payments/:entryId/history', safeSync(async (req, res) => {
    const entryId = req.params.entryId;
    const entry = database.data.entries.find(e => e.id === entryId);
    if (!entry) return res.json({ history: [], total_paid: 0 });
    
    const truckNo = entry.truck_no || '';
    const eidShort = entryId.slice(0, 8);
    const deductionPrefixes = [`truck_cash_ded:${eidShort}`, `truck_diesel_ded:${eidShort}`, `entry_cash:${eidShort}`];
    const txns = database.data.cash_transactions || [];
    
    // Get all ledger nikasi entries for this truck (payments, not deductions)
    const ledgerHistory = txns
      .filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === truckNo)
      .filter(t => !deductionPrefixes.some(p => (t.reference || '').startsWith(p)))
      .map(t => ({
        amount: t.amount || 0,
        date: t.created_at || t.date || '',
        note: t.description || '',
        by: t.created_by || 'system',
        source: 'ledger'
      }))
      .sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)));
    
    const totalPaid = Math.round(ledgerHistory.reduce((s, h) => s + h.amount, 0) * 100) / 100;
    res.json({ history: ledgerHistory, total_paid: totalPaid });
  }));

  // ===== AGENT PAYMENTS =====
  router.get('/api/agent-payments', safeSync(async (req, res) => {
    const targets = database.getMandiTargets(req.query);
    const entries = database.getEntries(req.query);
    const allCashTxns = database.data.cash_transactions || [];
    
    const payments = targets.map(target => {
      const mandiEntries = entries.filter(e => (e.mandi_name||'').toLowerCase() === (target.mandi_name||'').toLowerCase());
      const achieved_qntl = mandiEntries.reduce((sum, e) => sum + (e.final_w || 0) / 100, 0);
      const tp_weight_qntl = mandiEntries.reduce((sum, e) => sum + parseFloat(e.tp_weight || 0), 0);
      const excess_weight = Math.round((achieved_qntl - (target.target_qntl + target.target_qntl * target.cutting_percent / 100)) * 100) / 100;
      const agentName = (mandiEntries.length > 0 && mandiEntries[0].agent_name) ? mandiEntries[0].agent_name : (target.mandi_name || '');
      // Payment based on TP Weight
      const cutting_qntl = tp_weight_qntl * target.cutting_percent / 100;
      const target_amount = tp_weight_qntl * (target.base_rate ?? 10);
      const cutting_amount = cutting_qntl * (target.cutting_rate ?? 5);
      const total_amount = target_amount + cutting_amount;
      
      // Use ledger as source of truth for paid_amount
      const ledgerPaid = allCashTxns.filter(t =>
        t.account === 'ledger' && t.txn_type === 'nikasi' &&
        (t.category || '').toLowerCase() === (target.mandi_name || '').toLowerCase() &&
        (!req.query.kms_year || t.kms_year === req.query.kms_year) &&
        (!req.query.season || t.season === req.query.season)
      ).reduce((s, t) => s + (t.amount || 0), 0);
      const paidAmount = Math.round(ledgerPaid * 100) / 100;
      
      const balance_amount = Math.max(0, Math.round((total_amount - paidAmount) * 100) / 100);
      let status = 'pending';
      if (balance_amount < 0.01) status = 'paid';
      else if (paidAmount > 0) status = 'partial';
      return {
        mandi_name: target.mandi_name, agent_name: agentName,
        target_qntl: target.target_qntl, cutting_percent: target.cutting_percent,
        cutting_qntl: Math.round(cutting_qntl * 100) / 100,
        base_rate: target.base_rate ?? 10, cutting_rate: target.cutting_rate ?? 5,
        target_amount: roundAmount(target_amount),
        cutting_amount: roundAmount(cutting_amount),
        total_amount: roundAmount(total_amount),
        tp_weight_qntl: Math.round(tp_weight_qntl * 100) / 100,
        achieved_qntl: Math.round(achieved_qntl * 100) / 100,
        excess_weight: excess_weight,
        is_target_complete: achieved_qntl >= target.expected_total,
        paid_amount: paidAmount,
        balance_amount, status, kms_year: target.kms_year, season: target.season
      };
    });
    res.json(payments);
  }));

  router.post('/api/agent-payments/:mandiName/pay', safeSync(async (req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    const current = database.getAgentPayment(mandiName, kms_year, season);
    const roundOff1 = parseFloat(req.body.round_off) || 0;
    const agentTotal = Math.round((req.body.amount + roundOff1) * 100) / 100;
    const newPaidAmount = current.paid_amount + agentTotal;
    const history = current.payment_history || [];
    history.push({ amount: agentTotal, date: new Date().toISOString(), note: req.body.note || '', by: req.query.username || 'admin' });
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

      // NIKASI (Cash) - actual cash
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
        category: mandiName, party_type: 'Agent',
        description: `Agent Payment: ${mandiName} - Rs.${req.body.amount}`,
        amount: roundAmount(req.body.amount), reference: `agent_pay:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
      // NIKASI (Ledger) - total including round off
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'nikasi',
        category: mandiName, party_type: 'Agent',
        description: `Agent Payment: ${mandiName} - Rs.${agentTotal}${roundOff1 ? ' (Cash: '+req.body.amount+', RoundOff: '+roundOff1+')' : ''}`,
        amount: agentTotal, reference: `agent_pay_ledger:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: `agent_ledger_pay:${mandiName}:${kms_year}:${season}:${uuidv4().substring(0,6)}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Payment recorded', total_paid: newPaidAmount });
  }));

  router.post('/api/agent-payments/:mandiName/mark-paid', safeSync(async (req, res) => {
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
          amount: roundAmount(total_amount), reference: `agent_comm:${mandiName.substring(0,10)}`,
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
        amount: roundAmount(total_amount), reference: `agent_markpaid:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: `agent:${mandiName}:${kms_year}:${season}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
      // NIKASI (Ledger) - Reduce agent outstanding
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'ledger', txn_type: 'nikasi',
        category: mandiName, party_type: 'Agent',
        description: `Agent Payment: ${mandiName} (Full - Mark Paid)`,
        amount: roundAmount(total_amount), reference: `agent_markpaid_ledger:${mandiName.substring(0,10)}`,
        kms_year: kms_year || '', season: season || '',
        created_by: req.query.username || 'system', linked_payment_id: `agent_ledger_markpaid:${mandiName}:${kms_year}:${season}`,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: 'Agent/Mandi payment cleared' });
  }));

  router.post('/api/agent-payments/:mandiName/undo-paid', safeSync(async (req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    database.updateAgentPayment(mandiName, kms_year, season, { paid_amount: 0, status: 'pending' });
    if (database.data.cash_transactions) {
      // Delete cash entries (from Pay/Mark Paid)
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        t.linked_payment_id !== `agent:${mandiName}:${kms_year}:${season}` &&
        t.linked_payment_id !== `agent_jama:${mandiName}:${kms_year}:${season}`
      );
      // Delete ledger entries (from Pay button)
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        !(t.linked_payment_id || '').startsWith(`agent_ledger_pay:${mandiName}:${kms_year}:${season}`)
      );
      // Delete ledger entries (from Mark Paid button)
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        t.linked_payment_id !== `agent_ledger_markpaid:${mandiName}:${kms_year}:${season}`
      );
    }
    database.save();
    res.json({ success: true, message: 'Payment undo ho gaya' });
  }));

  router.get('/api/agent-payments/:mandiName/history', safeSync(async (req, res) => {
    const { kms_year, season } = req.query;
    const mandiName = decodeURIComponent(req.params.mandiName);
    const txns = database.data.cash_transactions || [];
    
    // Get all ledger nikasi entries for this agent (payments)
    const ledgerHistory = txns
      .filter(t => t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === mandiName)
      .filter(t => !kms_year || t.kms_year === kms_year)
      .filter(t => !season || t.season === season)
      .map(t => ({
        amount: t.amount || 0,
        date: t.created_at || t.date || '',
        note: t.description || '',
        by: t.created_by || 'system',
        source: 'ledger'
      }))
      .sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)));
    
    const totalPaid = Math.round(ledgerHistory.reduce((s, h) => s + h.amount, 0) * 100) / 100;
    res.json({ history: ledgerHistory, total_paid: totalPaid });
  }));

  // ===== TRUCK OWNER CONSOLIDATED PAYMENT ENDPOINTS =====
  router.post('/api/truck-owner/:truckNo/pay', safeSync(async (req, res) => {
    const truckNo = decodeURIComponent(req.params.truckNo);
    const { kms_year, season, username, role } = req.query;
    if (role !== 'admin') return res.status(403).json({ detail: 'Sirf admin payment kar sakta hai' });
    const { amount, note, payment_mode } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ detail: 'Amount 0 se zyada hona chahiye' });

    let entries = database.data.entries.filter(e => e.truck_no === truckNo);
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    if (!entries.length) return res.status(404).json({ detail: 'Is truck ke entries nahi mile' });

    entries.sort((a, b) => (a.date || '').slice(0,10).localeCompare((b.date || '').slice(0,10)));
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

    // Cash book nikasi - actual cash
    const roundOff2 = parseFloat(req.body.round_off) || 0;
    const ownerTotal = Math.round((amount + roundOff2) * 100) / 100;
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
    // Ledger nikasi - total including round off
    database.data.cash_transactions.push({
      id: uuidv4(), date: new Date().toISOString().split('T')[0],
      account: 'ledger', txn_type: 'nikasi',
      category: truckNo, party_type: 'Truck',
      description: `Truck Owner Payment: ${truckNo} - Rs.${ownerTotal}${roundOff2 ? ' (Cash: '+amount+', RoundOff: '+roundOff2+')' : ''}` + (note ? ` - ${note}` : ''),
      amount: ownerTotal, reference: `truck_owner_ledger:${truckNo}`,
      linked_payment_id: `truck_owner_ledger:${truckNo}:${kms_year || ''}:${season || ''}:${uuidv4().substring(0,6)}`,
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
    ownerDoc.payments_history.push({ amount: ownerTotal, date: new Date().toISOString(), note: note || '', by: username || '', payment_mode: payment_mode || 'cash' });
    ownerDoc.updated_at = new Date().toISOString();

    database.save();
    res.json({ success: true, message: `₹${amount} payment ho gaya! (${Math.round(amount - remaining)} distributed)` });
  }));

  router.post('/api/truck-owner/:truckNo/mark-paid', safeSync(async (req, res) => {
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
      // Cash book nikasi
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
      // Ledger nikasi - reduce truck outstanding
      database.data.cash_transactions.push({
        id: uuidv4(), date: new Date().toISOString().split('T')[0],
        account: 'ledger', txn_type: 'nikasi',
        category: truckNo, party_type: 'Truck',
        description: `Truck Owner Full Payment: ${truckNo}`,
        amount: totalMarked, reference: `truck_owner_ledger:${truckNo}`,
        linked_payment_id: `truck_owner_ledger:${truckNo}:${kms_year || ''}:${season || ''}:${uuidv4().substring(0,6)}`,
        kms_year: kms_year || '', season: season || '',
        created_at: new Date().toISOString()
      });
    }
    database.save();
    res.json({ success: true, message: `Sab trips paid! ₹${totalMarked} mark paid kiya` });
  }));

  router.post('/api/truck-owner/:truckNo/undo-paid', safeSync(async (req, res) => {
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
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        t.linked_payment_id !== `truck_owner:${truckNo}:${kms_year || ''}:${season || ''}`
      );
      // Also remove owner ledger entries
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        !(t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === truckNo &&
          (t.reference || '').startsWith(`truck_owner_ledger:${truckNo}`))
      );
    }
    database.save();
    res.json({ success: true, message: `${truckNo} ke saare payments undo ho gaye` });
  }));

  router.get('/api/truck-owner/:truckNo/history', safeSync(async (req, res) => {
    const truckNo = decodeURIComponent(req.params.truckNo);
    const { kms_year, season } = req.query;
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.entries) database.data.entries = [];

    // Get all ledger nikasi entries for this truck (source of truth)
    let ledgerPayments = database.data.cash_transactions.filter(t =>
      t.account === 'ledger' && t.txn_type === 'nikasi' && t.category === truckNo
    );
    if (kms_year) ledgerPayments = ledgerPayments.filter(t => t.kms_year === kms_year);
    if (season) ledgerPayments = ledgerPayments.filter(t => t.season === season);

    // Get entry IDs for this truck to identify deductions (not actual payments)
    let entries = database.data.entries.filter(e => e.truck_no === truckNo);
    if (kms_year) entries = entries.filter(e => e.kms_year === kms_year);
    if (season) entries = entries.filter(e => e.season === season);
    let dcEntries = (database.data.dc_deliveries || []).filter(e => e.vehicle_no === truckNo);
    if (kms_year) dcEntries = dcEntries.filter(e => e.kms_year === kms_year);
    if (season) dcEntries = dcEntries.filter(e => e.season === season);
    const entryShortIds = [...entries.map(e => (e.id || '').slice(0, 8)), ...dcEntries.map(e => (e.id || '').slice(0, 8))];

    const allHistory = [];
    for (const txn of ledgerPayments) {
      const ref = txn.reference || '';
      // Skip deduction entries (auto-created from entries/deliveries)
      const isDeduction = entryShortIds.some(eid =>
        ref.startsWith(`truck_cash_ded:${eid}`) || ref.startsWith(`truck_diesel_ded:${eid}`) ||
        ref.startsWith(`entry_cash:${eid}`) || ref.startsWith(`delivery_tcash:${eid}`) ||
        ref.startsWith(`delivery_tdiesel:${eid}`) || ref.startsWith(`delivery:${eid}`)
      );
      if (isDeduction) continue;
      allHistory.push({
        amount: txn.amount || 0,
        date: txn.created_at || txn.date || '',
        note: txn.description || '',
        by: txn.created_by || 'system',
        source: 'ledger'
      });
    }
    allHistory.sort((a, b) => (b.date || '').slice(0,10).localeCompare((a.date || '').slice(0,10)));
    res.json({ history: allHistory });
  }));

  return router;
};
