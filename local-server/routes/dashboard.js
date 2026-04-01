const express = require('express');
const { safeSync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

  router.get('/api/dashboard/agent-totals', safeSync(async (req, res) => {
    const entries = database.getEntries(req.query);
    const agentMap = {};
    entries.forEach(e => {
      if (!e.agent_name) return;
      if (!agentMap[e.agent_name]) {
        agentMap[e.agent_name] = { agent_name: e.agent_name, total_qntl: 0, total_final_w: 0, total_entries: 0, total_bag: 0 };
      }
      agentMap[e.agent_name].total_qntl += (e.qntl || 0);
      agentMap[e.agent_name].total_final_w += (e.final_w || 0) / 100;
      agentMap[e.agent_name].total_entries += 1;
      agentMap[e.agent_name].total_bag += (e.bag || 0);
    });
    const agent_totals = Object.values(agentMap).map(a => ({
      ...a,
      total_qntl: Math.round(a.total_qntl * 100) / 100,
      total_final_w: Math.round(a.total_final_w * 100) / 100
    })).sort((a, b) => b.total_final_w - a.total_final_w);
    res.json({ agent_totals });
  }));

  router.get('/api/dashboard/date-range-totals', safeSync(async (req, res) => {
    const entries = database.getEntries(req.query);
    const totals = entries.reduce((acc, e) => ({
      total_kg: acc.total_kg + (e.kg || 0),
      total_qntl: acc.total_qntl + (e.qntl || 0),
      total_bag: acc.total_bag + (e.bag || 0),
      total_final_w: acc.total_final_w + (e.final_w || 0) / 100,
      total_entries: acc.total_entries + 1
    }), { total_kg: 0, total_qntl: 0, total_bag: 0, total_final_w: 0, total_entries: 0 });
    res.json({
      ...totals,
      total_kg: Math.round(totals.total_kg * 100) / 100,
      total_qntl: Math.round(totals.total_qntl * 100) / 100,
      total_final_w: Math.round(totals.total_final_w * 100) / 100,
      start_date: req.query.start_date || null,
      end_date: req.query.end_date || null
    });
  }));

  router.get('/api/dashboard/monthly-trend', safeSync(async (req, res) => {
    const entries = database.getEntries(req.query);
    const monthMap = {};
    entries.forEach(e => {
      const month = (e.date || '').substring(0, 7);
      if (!month) return;
      if (!monthMap[month]) {
        monthMap[month] = { month, total_qntl: 0, total_final_w: 0, total_entries: 0, total_bag: 0 };
      }
      monthMap[month].total_qntl += (e.qntl || 0);
      monthMap[month].total_final_w += (e.final_w || 0) / 100;
      monthMap[month].total_entries += 1;
      monthMap[month].total_bag += (e.bag || 0);
    });
    const monthly_data = Object.values(monthMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        ...m,
        total_qntl: Math.round(m.total_qntl * 100) / 100,
        total_final_w: Math.round(m.total_final_w * 100) / 100
      }));
    res.json({ monthly_data });
  }));

  return router;
};
