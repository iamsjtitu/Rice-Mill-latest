const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');

module.exports = function(database) {
  const router = express.Router();

  // POST /api/voucher-payment
  router.post('/api/voucher-payment', safeHandler(async (req, res) => {
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.voucher_payments) database.data.voucher_payments = [];
    const { voucher_id, voucher_type, amount, payment_mode, date, bank_name, reference, notes, kms_year, season } = req.body;
    if (!voucher_id || !amount) return res.status(400).json({ detail: 'voucher_id and amount required' });
    const now = new Date().toISOString();
    const paymentId = uuidv4();

    // Create voucher payment record
    database.data.voucher_payments.push({
      id: paymentId, voucher_id, voucher_type: voucher_type || '', amount: parseFloat(amount),
      payment_mode: payment_mode || '', date: date || new Date().toISOString().split('T')[0],
      bank_name: bank_name || '', reference: reference || '', notes: notes || '',
      kms_year: kms_year || '', season: season || '', created_at: now
    });

    // Create cash transaction
    const account = payment_mode === 'Cash' ? 'cash' : 'bank';
    const txnType = voucher_type === 'sale' ? 'jama' : 'nikasi';
    database.data.cash_transactions.push({
      id: uuidv4(), date: date || new Date().toISOString().split('T')[0],
      account, txn_type: txnType, category: `${voucher_type || 'Voucher'} Payment`,
      party_type: voucher_type === 'sale' ? 'Rice Sale' : 'Pvt Paddy Purchase',
      description: `${voucher_type || ''} voucher payment - ${reference || ''}`,
      amount: parseFloat(amount), reference: `vpay:${paymentId.slice(0, 8)}`,
      bank_name: bank_name || '', kms_year: kms_year || '', season: season || '',
      created_by: req.query.username || '', created_at: now, updated_at: now
    });

    // Update paid_amount on the voucher
    const collections = { sale: 'sale_vouchers', purchase: 'purchase_vouchers', gunny_bag: 'gunny_bags' };
    const col = collections[voucher_type];
    if (col && database.data[col]) {
      const voucher = database.data[col].find(v => v.id === voucher_id);
      if (voucher) voucher.paid_amount = (voucher.paid_amount || 0) + parseFloat(amount);
    }
    database.save();
    res.json({ message: 'Payment recorded', id: paymentId });
  }));

  return router;
};
