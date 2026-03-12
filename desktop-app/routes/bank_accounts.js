const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { safeHandler } = require('./safe_handler');

module.exports = function(database) {
  const router = express.Router();

  // GET /api/bank-accounts
  router.get('/api/bank-accounts', safeHandler(async (req, res) => {
    if (!database.data.bank_accounts) database.data.bank_accounts = [];
    const accounts = [...database.data.bank_accounts].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(accounts);
  }));

  // POST /api/bank-accounts
  router.post('/api/bank-accounts', safeHandler(async (req, res) => {
    if (!database.data.bank_accounts) database.data.bank_accounts = [];
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ detail: 'Bank name is required' });
    const exists = database.data.bank_accounts.find(b => b.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) return res.status(400).json({ detail: 'Bank already exists' });
    const doc = { id: uuidv4(), name: name.trim(), created_at: new Date().toISOString() };
    database.data.bank_accounts.push(doc);
    database.save();
    res.json(doc);
  }));

  // DELETE /api/bank-accounts/:id
  router.delete('/api/bank-accounts/:id', safeHandler(async (req, res) => {
    if (!database.data.bank_accounts) database.data.bank_accounts = [];
    const idx = database.data.bank_accounts.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ detail: 'Bank account not found' });
    database.data.bank_accounts.splice(idx, 1);
    database.save();
    res.json({ message: 'Bank account deleted', id: req.params.id });
  }));

  return router;
};
