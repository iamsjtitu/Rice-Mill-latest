const express = require('express');
const https = require('https');
const { safeAsync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

function col(name) {
  if (!database.data[name]) database.data[name] = [];
  return database.data[name];
}

function getTelegramConfig() {
  const settings = col('app_settings');
  let config = settings.find(s => s.setting_id === 'telegram_config');
  // Migrate old single chat_id to chat_ids list
  if (config && !config.chat_ids && config.chat_id) {
    config.chat_ids = [{ chat_id: config.chat_id, label: 'Default' }];
  }
  return config || null;
}

function saveTelegramConfig(config) {
  const settings = col('app_settings');
  const idx = settings.findIndex(s => s.setting_id === 'telegram_config');
  if (idx >= 0) {
    settings[idx] = config;
  } else {
    settings.push(config);
  }
  database.save();
}

function addTelegramLog(log) {
  const logs = col('telegram_logs');
  logs.push(log);
  // Keep only last 50 logs
  if (logs.length > 50) {
    database.data.telegram_logs = logs.slice(-50);
  }
  database.save();
}

// Promisified HTTPS request helper
function telegramApi(method, botToken, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (chunk) => chunks += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { resolve({ ok: false, description: 'Invalid response' }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

// Multipart form upload for sending documents
function telegramSendDocument(botToken, chatId, caption, pdfBuffer, filename) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now().toString(36);
    const parts = [];

    // chat_id field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}`);
    // caption field
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}`);
    // document file
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`);

    const head = Buffer.from(parts.join('\r\n') + '\r\n');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, pdfBuffer, tail]);

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendDocument`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (chunk) => chunks += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { resolve({ ok: false, description: 'Invalid response' }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// Generate PDF buffer using pdfkit (reuses daily_report logic)
function generateDetailReportPDF(query) {
  const { createPdfDoc } = require('./pdf_helpers');
  const { getDailyReportData, generateDailyReportPdf } = require('./daily_report_logic');

  return new Promise((resolve, reject) => {
    try {
      const data = getDailyReportData(database, query);
      const doc = createPdfDoc({ size: 'A4', layout: 'landscape', margin: 25 }, database);
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      generateDailyReportPdf(doc, data, query);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// buildReportData removed - using shared daily_report_logic

// ===== API ROUTES =====

// GET config
router.get('/api/telegram/config', safeAsync(async (req, res) => {
  const config = getTelegramConfig();
  if (!config) return res.json({ bot_token: '', chat_ids: [], schedule_time: '21:00', enabled: false });
  const masked = { ...config };
  if (masked.bot_token) {
    const t = masked.bot_token;
    masked.bot_token_masked = t.length > 12 ? t.slice(0,8) + '...' + t.slice(-4) : '***';
  }
  res.json(masked);
}));

// POST config
router.post('/api/telegram/config', safeAsync(async (req, res) => {
  const { bot_token, chat_ids, schedule_time, enabled } = req.body;
  if (!bot_token) return res.status(400).json({ detail: 'Bot Token zaroori hai' });
  if (!chat_ids || chat_ids.length === 0) return res.status(400).json({ detail: 'Kam se kam ek Chat ID add karein' });

  const cleanIds = chat_ids.filter(c => String(c.chat_id||'').trim()).map((c, i) => ({
    chat_id: String(c.chat_id).trim(), label: String(c.label||'').trim() || `Chat ${i+1}`
  }));
  if (cleanIds.length === 0) return res.status(400).json({ detail: 'Valid Chat ID add karein' });

  // Validate bot token
  const botInfo = await telegramApi('getMe', bot_token, {});
  if (!botInfo.ok) return res.status(400).json({ detail: 'Invalid Bot Token' });

  const config = {
    setting_id: 'telegram_config', bot_token, chat_ids: cleanIds,
    schedule_time: schedule_time || '21:00', enabled: !!enabled,
    bot_name: botInfo.result.first_name || '', bot_username: botInfo.result.username || '',
    updated_at: new Date().toISOString()
  };
  saveTelegramConfig(config);
  res.json({ success: true, message: `Config save ho gayi! ${cleanIds.length} recipients set.`, bot_name: config.bot_name });
}));

// POST test
router.post('/api/telegram/test', safeAsync(async (req, res) => {
  const { bot_token, chat_ids } = req.body;
  if (!bot_token || !chat_ids || chat_ids.length === 0) return res.status(400).json({ detail: 'Bot Token aur Chat ID dono zaroori hain' });

  const results = [];
  for (const item of chat_ids) {
    const cid = String(item.chat_id||'').trim();
    const label = item.label || cid;
    if (!cid) continue;
    try {
      const result = await telegramApi('sendMessage', bot_token, { chat_id: cid, text: `Navkar Agro - Test Message\n${label}: Connected!` });
      results.push({ label, status: result.ok ? 'sent' : 'failed', error: result.ok ? '' : (result.description||'') });
    } catch (e) {
      results.push({ label, status: 'failed', error: e.message });
    }
  }
  const sent = results.filter(r => r.status === 'sent').length;
  const failed = results.filter(r => r.status === 'failed').length;
  let msg = `${sent} ko message gaya`;
  if (failed) msg += `, ${failed} failed`;
  res.json({ success: sent > 0, message: msg, details: results });
}));

// POST send-report
router.post('/api/telegram/send-report', safeAsync(async (req, res) => {
  const config = getTelegramConfig();
  if (!config || !config.bot_token || !config.chat_ids || config.chat_ids.length === 0) {
    return res.status(400).json({ detail: 'Telegram config set nahi hai. Settings mein configure karein.' });
  }

  const today = new Date().toISOString().split('T')[0];
  const reportDate = (req.body && req.body.date) || today;
  const kmsYear = (req.body && req.body.kms_year) || '';
  const season = (req.body && req.body.season) || '';

  // Generate PDF
  let pdfBuffer;
  try {
    const query = { date: reportDate, kms_year: kmsYear, season: season, mode: 'detail', source: 'telegram' };
    pdfBuffer = await generateDetailReportPDF(query);
  } catch (e) {
    return res.status(500).json({ detail: 'PDF generate nahi hua: ' + e.message });
  }

  const caption = `Detail Report - ${reportDate}`;
  const results = [];
  for (const item of config.chat_ids) {
    const cid = String(item.chat_id||'').trim();
    const label = item.label || cid;
    if (!cid) continue;
    try {
      const result = await telegramSendDocument(config.bot_token, cid, caption, pdfBuffer, `detail_report_${reportDate}.pdf`);
      results.push({ label, ok: result.ok, error: result.ok ? '' : (result.description||'Unknown error') });
    } catch (e) {
      results.push({ label, ok: false, error: e.message });
    }
  }

  const sent = results.filter(r => r.ok).length;
  addTelegramLog({
    date: reportDate, sent_at: new Date().toISOString(),
    status: sent > 0 ? 'success' : 'failed', type: 'manual', sent_to: sent, total: results.length
  });
  res.json({ success: sent > 0, message: `Report ${sent}/${results.length} recipients ko bhej diya!`, details: results });
}));

// GET logs
router.get('/api/telegram/logs', safeAsync(async (req, res) => {
  const logs = col('telegram_logs').slice().reverse().slice(0, 20);
  res.json(logs);
}));

return router;
};
