const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');
const { fmtDate } = require('./pdf_helpers');

module.exports = function(database) {
  const router = express.Router();

  // POST /api/voucher-payment
  router.post('/api/voucher-payment', safeHandler(async (req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.voucher_payments) database.data.voucher_payments = [];
    if (!database.data.local_party_accounts) database.data.local_party_accounts = [];
    const { voucher_id, voucher_type, amount, payment_mode, date, bank_name, reference, notes, kms_year, season } = req.body;
    if (!voucher_id || !amount) return res.status(400).json({ detail: 'voucher_id and amount required' });
    const now = new Date().toISOString();
    const paymentId = uuidv4();
    const payDate = date || new Date().toISOString().split('T')[0];
    const username = req.query.username || '';

    // Create voucher payment record
    database.data.voucher_payments.push({
      id: paymentId, voucher_id, voucher_type: voucher_type || '', amount: parseFloat(amount),
      payment_mode: payment_mode || '', date: payDate,
      bank_name: bank_name || '', reference: reference || '', notes: notes || '',
      kms_year: kms_year || '', season: season || '', created_at: now
    });

    // Get voucher and party name
    const collections = { sale: 'sale_vouchers', purchase: 'purchase_vouchers', gunny_bag: 'gunny_bags' };
    const col = collections[voucher_type];
    const voucher = col && database.data[col] ? database.data[col].find(v => v.id === voucher_id) : null;
    const party = (voucher && (voucher.party_name || voucher.source || '')) || '';
    const voucherNo = voucher ? (voucher.voucher_no || '') : '';

    const payAccount = payment_mode === 'Cash' ? 'cash' : 'bank';
    const base = { kms_year: kms_year || '', season: season || '', created_by: username, created_at: now, updated_at: now };
    const roundOff = parseFloat(req.body.round_off) || 0;
    const totalSettled = Math.round((parseFloat(amount) + roundOff) * 100) / 100;

    if (voucher_type === 'sale') {
      const sourceLabel = `Sale #${voucherNo}`;
      const desc = `Payment received - ${sourceLabel} - ${party}` + (notes ? ` (${notes})` : '');
      // Cash/Bank JAMA - actual cash
      const cashEntry = { id: uuidv4(), date: payDate, account: payAccount, txn_type: 'jama',
        amount: parseFloat(amount), category: party, party_type: 'Sale Book',
        description: desc, reference: `voucher_payment:${paymentId}`, ...base };
      if (payAccount === 'bank' && bank_name) cashEntry.bank_name = bank_name;
      database.data.cash_transactions.push(cashEntry);
      // Ledger NIKASI - total including round off
      database.data.cash_transactions.push({
        id: uuidv4(), date: payDate, account: 'ledger', txn_type: 'nikasi',
        amount: totalSettled, category: party, party_type: 'Sale Book',
        description: `${desc} - Rs.${totalSettled}${roundOff ? ' (Cash: '+amount+', RoundOff: '+roundOff+')' : ''}`, reference: `voucher_payment_ledger:${paymentId}`, ...base
      });
      // Local party payment entry (total including round off)
      if (party) {
        database.data.local_party_accounts.push({
          id: uuidv4(), date: payDate, party_name: party,
          txn_type: 'payment', amount: totalSettled,
          description: `Payment received - ${sourceLabel}` + (notes ? ` (${notes})` : ''),
          source_type: 'sale_voucher_payment', reference: `voucher_payment:${paymentId}`, ...base
        });
      }
    } else {
      const sourceLabel = voucher_type === 'purchase' ? `Purchase #${voucherNo}` : `Gunny Bag (${payDate})`;
      const partyType = voucher_type === 'purchase' ? 'Purchase Voucher' : 'Gunny Bag';
      const desc = `Payment made - ${sourceLabel} - ${party}` + (notes ? ` (${notes})` : '');
      // Cash/Bank NIKASI - actual cash
      const cashEntry = { id: uuidv4(), date: payDate, account: payAccount, txn_type: 'nikasi',
        amount: parseFloat(amount), category: party, party_type: partyType,
        description: desc, reference: `voucher_payment:${paymentId}`, ...base };
      if (payAccount === 'bank' && bank_name) cashEntry.bank_name = bank_name;
      database.data.cash_transactions.push(cashEntry);
      // Ledger NIKASI - total including round off
      database.data.cash_transactions.push({
        id: uuidv4(), date: payDate, account: 'ledger', txn_type: 'nikasi',
        amount: totalSettled, category: party, party_type: partyType,
        description: `${desc} - Rs.${totalSettled}${roundOff ? ' (Cash: '+amount+', RoundOff: '+roundOff+')' : ''}`, reference: `voucher_payment_ledger:${paymentId}`, ...base
      });
      // Local party settlement entry (total including round off)
      if (party) {
        database.data.local_party_accounts.push({
          id: uuidv4(), date: payDate, party_name: party,
          txn_type: 'payment', amount: totalSettled,
          description: `Payment made - ${sourceLabel}` + (notes ? ` (${notes})` : ''),
          source_type: `${voucher_type}_voucher_payment`, reference: `voucher_payment:${paymentId}`, ...base
        });
      }
    }

    // Update paid_amount on the voucher (total including round off)
    if (voucher) {
      const oldPaid = voucher.paid_amount || voucher.advance || 0;
      voucher.paid_amount = Math.round((oldPaid + totalSettled) * 100) / 100;
      voucher.balance = Math.round(((voucher.total || 0) - voucher.paid_amount) * 100) / 100;
    }
    database.save();
    res.json({ message: 'Payment recorded', id: paymentId });
  }));

  // GET /api/voucher-payment/history/:partyName
  router.get('/api/voucher-payment/history/:partyName', safeHandler(async (req, res) => {
    if (!database.data.voucher_payments) database.data.voucher_payments = [];
    const partyName = decodeURIComponent(req.params.partyName);
    const partyType = req.query.party_type || '';
    // Find vouchers for this party
    const collections = { 'Purchase Voucher': 'purchase_vouchers', 'Sale Book': 'sale_vouchers' };
    const col = collections[partyType] || 'purchase_vouchers';
    const vouchers = (database.data[col] || []).filter(v => v.party_name === partyName);
    const voucherIds = vouchers.map(v => v.id);
    const payments = database.data.voucher_payments.filter(p => voucherIds.includes(p.voucher_id));
    payments.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(payments);
  }));

  // POST /api/voucher-payment/undo
  router.post('/api/voucher-payment/undo', safeHandler(async (req, res) => {
    if (!database.data.voucher_payments) database.data.voucher_payments = [];
    const { payment_id } = req.body;
    if (!payment_id) return res.status(400).json({ detail: 'payment_id required' });
    const idx = database.data.voucher_payments.findIndex(p => p.id === payment_id);
    if (idx === -1) return res.status(404).json({ detail: 'Payment not found' });
    const payment = database.data.voucher_payments[idx];
    // Reverse paid_amount on voucher
    const collections = { sale: 'sale_vouchers', purchase: 'purchase_vouchers' };
    const col = collections[payment.voucher_type];
    if (col && database.data[col]) {
      const voucher = database.data[col].find(v => v.id === payment.voucher_id);
      if (voucher) {
        voucher.paid_amount = Math.max(0, (voucher.paid_amount || 0) - payment.amount);
        voucher.balance = Math.round(((voucher.total || 0) - voucher.paid_amount) * 100) / 100;
      }
    }
    // Remove payment
    database.data.voucher_payments.splice(idx, 1);
    // Remove related cash + ledger transactions
    if (database.data.cash_transactions) {
      database.data.cash_transactions = database.data.cash_transactions.filter(t =>
        t.reference !== `voucher_payment:${payment_id}` &&
        t.reference !== `voucher_payment_ledger:${payment_id}`
      );
    }
    // Remove related local_party_accounts entry
    if (database.data.local_party_accounts) {
      database.data.local_party_accounts = database.data.local_party_accounts.filter(t =>
        t.reference !== `voucher_payment:${payment_id}`
      );
    }
    database.save();
    res.json({ message: 'Payment undone' });
  }));

  return router;
};
