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

  return router;
};
