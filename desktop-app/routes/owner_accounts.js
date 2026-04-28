const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');

module.exports = function(database) {
  const router = express.Router();

  // GET /api/owner-accounts
  router.get('/api/owner-accounts', safeHandler(async (req, res) => {
    if (!database.data.owner_accounts) database.data.owner_accounts = [];
    const accounts = [...database.data.owner_accounts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(accounts);
  }));

  // POST /api/owner-accounts
  router.post('/api/owner-accounts', safeHandler(async (req, res) => {
    if (!database.data.owner_accounts) database.data.owner_accounts = [];
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ detail: 'Owner account name is required' });
    const exists = database.data.owner_accounts.find(o => o.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) return res.status(400).json({ detail: 'Owner account already exists' });
    const doc = { id: uuidv4(), name: name.trim(), created_at: new Date().toISOString() };
    database.data.owner_accounts.push(doc);
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json(doc);
  }));

  // DELETE /api/owner-accounts/:id
  router.delete('/api/owner-accounts/:id', safeHandler(async (req, res) => {
    if (!database.data.owner_accounts) database.data.owner_accounts = [];
    const idx = database.data.owner_accounts.findIndex(o => o.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Owner account not found' });
    database.data.owner_accounts.splice(idx, 1);
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ message: 'Owner account deleted', id: req.params.id });
  }));

  // POST /api/owner-accounts/convert-from-ledger
  // Convert an existing party/category (e.g. "Titu") into an Owner Account.
  // Strategy: create owner if missing, find all cash/bank txns with category=name,
  // flip their txn_type, switch account to "owner", and update auto_ledger pairs.
  router.post('/api/owner-accounts/convert-from-ledger', safeHandler(async (req, res) => {
    if (!database.data.owner_accounts) database.data.owner_accounts = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    const name = String(req.body.name || '').trim();
    const dryRun = !!req.body.dry_run;
    if (!name) return res.status(400).json({ detail: 'Ledger name required' });

    const lower = name.toLowerCase();
    const txns = database.data.cash_transactions.filter(
      t => (t.category || '').trim().toLowerCase() === lower && (t.account === 'cash' || t.account === 'bank')
    );
    const cashCount = txns.filter(t => t.account === 'cash').length;
    const bankCount = txns.filter(t => t.account === 'bank').length;
    const totalAmount = txns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const existingOwner = database.data.owner_accounts.find(o => (o.name || '').toLowerCase() === lower);

    const preview = {
      owner_already_exists: !!existingOwner,
      matching_txn_count: txns.length,
      cash_txn_count: cashCount,
      bank_txn_count: bankCount,
      total_amount: Math.round(totalAmount * 100) / 100,
    };
    if (dryRun) return res.json({ success: true, dry_run: true, preview });

    let ownerId = existingOwner ? existingOwner.id : null;
    if (!ownerId) {
      const doc = { id: uuidv4(), name, created_at: new Date().toISOString() };
      database.data.owner_accounts.push(doc);
      ownerId = doc.id;
    }

    let converted = 0;
    const nowIso = new Date().toISOString();
    for (const txn of txns) {
      const oldType = txn.txn_type || '';
      const newType = oldType === 'nikasi' ? 'jama' : 'nikasi';
      txn.account = 'owner';
      txn.owner_name = name;
      txn.txn_type = newType;
      txn.updated_at = nowIso;
      converted++;
      // Mirror flip on auto_ledger pair (matches by reference prefix)
      const pairRef = `auto_ledger:${(txn.id || '').substring(0, 8)}`;
      database.data.cash_transactions.forEach(p => {
        if (p.reference === pairRef) {
          p.txn_type = newType;
          p.owner_name = name;
          p.updated_at = nowIso;
        }
      });
    }

    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true, owner_id: ownerId, name, converted, preview });
  }));

  return router;
};
