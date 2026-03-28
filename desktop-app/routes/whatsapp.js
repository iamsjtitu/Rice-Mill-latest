const express = require('express');
const https = require('https');
const { safeAsync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

function col(name) {
  if (!database.data[name]) database.data[name] = [];
  return database.data[name];
}

function getWaSettings() {
  const settings = col('app_settings');
  let config = settings.find(s => s.setting_id === 'whatsapp_config');
  if (!config) return { api_key: '', country_code: '91', enabled: false, default_numbers: [], group_id: '' };
  return config;
}

function cleanPhone(phone, countryCode = '91') {
  phone = phone.trim().replace(/[\s\-\+]/g, '');
  if (phone.startsWith('0')) phone = phone.substring(1);
  if (!phone.startsWith(countryCode)) phone = countryCode + phone;
  return phone;
}

function sendWaMessage(apiKey, phone, text, mediaUrl) {
  return new Promise((resolve, reject) => {
    const postData = `phonenumber=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}${mediaUrl ? '&url=' + encodeURIComponent(mediaUrl) : ''}`;
    const options = {
      hostname: 'api.360messenger.com', path: '/v2/sendMessage', method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ success: result.success || res.statusCode === 201, data: result });
        } catch (e) { resolve({ success: false, error: data }); }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.write(postData);
    req.end();
  });
}

// GET settings
router.get('/api/whatsapp/settings', safeAsync(async (req, res) => {
  const config = getWaSettings();
  const apiKey = config.api_key || '';
  let masked = '';
  if (apiKey.length > 8) masked = apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
  res.json({
    api_key: config.api_key || '', country_code: config.country_code || '91',
    enabled: config.enabled || false, default_numbers: config.default_numbers || [],
    group_id: config.group_id || '', api_key_masked: masked
  });
}));

// PUT settings
router.put('/api/whatsapp/settings', safeAsync(async (req, res) => {
  const settings = col('app_settings');
  const idx = settings.findIndex(s => s.setting_id === 'whatsapp_config');
  let defaultNumbers = req.body.default_numbers || '';
  if (typeof defaultNumbers === 'string') {
    defaultNumbers = defaultNumbers.split(',').map(n => n.trim()).filter(Boolean);
  }
  const config = {
    setting_id: 'whatsapp_config', api_key: (req.body.api_key || '').trim(),
    country_code: (req.body.country_code || '91').trim(),
    enabled: !!req.body.api_key, default_numbers: defaultNumbers,
    group_id: (req.body.group_id || '').trim()
  };
  if (idx >= 0) settings[idx] = config; else settings.push(config);
  database.save();
  res.json({ success: true, message: 'WhatsApp settings save ho gayi!' });
}));

// Test message
router.post('/api/whatsapp/test', safeAsync(async (req, res) => {
  const phone = req.body.phone;
  if (!phone) return res.status(400).json({ detail: 'Phone number daalein' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'WhatsApp API key set nahi hai.' });
  const result = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), 'Test message from Mill Entry System - WhatsApp connected!');
  res.json({ success: result.success, message: result.success ? 'WhatsApp message bhej diya!' : '', error: result.error || '' });
}));

// Send message
router.post('/api/whatsapp/send', safeAsync(async (req, res) => {
  const { phone, text, media_url } = req.body;
  if (!phone) return res.status(400).json({ detail: 'Phone number required' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });
  const result = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), text || '', media_url || '');
  res.json({ success: result.success, message: result.success ? 'Message bhej diya!' : '', error: result.error || '' });
}));

// Payment reminder
router.post('/api/whatsapp/send-payment-reminder', safeAsync(async (req, res) => {
  const { phone, party_name, total_amount, paid_amount, balance } = req.body;
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  const branding = col('app_settings').find(s => s.setting_id === 'branding') || {};
  const company = branding.company_name || 'Mill Entry System';
  const bal = balance || ((total_amount || 0) - (paid_amount || 0));

  const text = `*${company}*\n---\nParty: ${party_name}\nTotal: Rs.${Number(total_amount||0).toLocaleString()}\nPaid: Rs.${Number(paid_amount||0).toLocaleString()}\n*Balance Due: Rs.${Number(bal).toLocaleString()}*\n---\nKripya baaki rashi ka bhugtan karein.\nDhanyavaad!`;

  if (phone) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), text);
    return res.json({ success: r.success, message: r.success ? 'Reminder bhej diya!' : '', error: r.error || '' });
  }

  const nums = config.default_numbers || [];
  if (!nums.length) return res.json({ success: false, error: 'Koi number nahi mila. Default numbers set karein.' });

  const results = [];
  for (const num of nums) {
    const r = await sendWaMessage(config.api_key, cleanPhone(num, config.country_code), text);
    results.push({ phone: num, success: r.success });
  }
  const ok = results.filter(r => r.success).length;
  res.json({ success: ok > 0, message: `${ok}/${results.length} numbers pe bhej diya!`, details: results });
}));

// Daily report
router.post('/api/whatsapp/send-daily-report', safeAsync(async (req, res) => {
  const { report_text, pdf_url, send_to_group, phone } = req.body;
  if (!report_text) return res.status(400).json({ detail: 'Report text required' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  const results = [];
  if (phone) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), report_text, pdf_url || '');
    results.push({ target: phone, success: r.success });
  } else {
    for (const num of (config.default_numbers || [])) {
      const r = await sendWaMessage(config.api_key, cleanPhone(num, config.country_code), report_text, pdf_url || '');
      results.push({ target: num, success: r.success });
    }
  }
  if (send_to_group && config.group_id) {
    const r = await sendWaMessage(config.api_key, config.group_id, report_text, pdf_url || '');
    results.push({ target: 'group', success: r.success });
  }
  if (!results.length) return res.json({ success: false, error: 'Koi number ya group set nahi hai.' });
  const ok = results.filter(r => r.success).length;
  res.json({ success: ok > 0, message: `${ok}/${results.length} targets pe bhej diya!`, details: results });
}));

return router;
};
