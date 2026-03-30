const express = require('express');
const https = require('https');
const http = require('http');
const { safeAsync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

// Upload local PDF to tmpfiles.org and get public URL
function uploadPdfToTmpFiles(localPdfPath) {
  return new Promise((resolve) => {
    // Step 1: Fetch PDF from local Express server
    const port = (global.DESKTOP_API_PORT) || 9876;
    const localUrl = `http://127.0.0.1:${port}${localPdfPath}`;
    console.log('[WhatsApp] Fetching local PDF:', localUrl);

    http.get(localUrl, (pdfRes) => {
      if (pdfRes.statusCode !== 200) {
        console.log('[WhatsApp] Local PDF fetch failed:', pdfRes.statusCode);
        resolve('');
        return;
      }
      const chunks = [];
      pdfRes.on('data', c => chunks.push(c));
      pdfRes.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        console.log('[WhatsApp] PDF fetched, size:', pdfBuffer.length, 'bytes');
        if (pdfBuffer.length < 100) { resolve(''); return; }

        // Step 2: Upload to tmpfiles.org
        const boundary = '----FormBoundary' + Date.now();
        const fileName = 'report_' + Date.now() + '.pdf';
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;
        const body = Buffer.concat([Buffer.from(header), pdfBuffer, Buffer.from(footer)]);

        const opts = {
          hostname: 'tmpfiles.org', path: '/api/v1/upload', method: 'POST',
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
        };

        const req = https.request(opts, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.status === 'success' && result.data && result.data.url) {
                // Convert view URL to direct download URL
                // http://tmpfiles.org/12345/file.pdf -> https://tmpfiles.org/dl/12345/file.pdf
                const dlUrl = result.data.url.replace('http://tmpfiles.org/', 'https://tmpfiles.org/dl/');
                console.log('[WhatsApp] tmpfiles.org upload OK:', dlUrl);
                resolve(dlUrl);
              } else {
                console.log('[WhatsApp] tmpfiles.org upload failed:', data.substring(0, 200));
                resolve('');
              }
            } catch (e) { console.log('[WhatsApp] tmpfiles.org parse error:', data.substring(0, 200)); resolve(''); }
          });
        });
        req.on('error', e => { console.log('[WhatsApp] tmpfiles.org upload error:', e.message); resolve(''); });
        req.write(body);
        req.end();
      });
      pdfRes.on('error', () => resolve(''));
    }).on('error', e => { console.log('[WhatsApp] Local PDF fetch error:', e.message); resolve(''); });
  });
}

// Resolve pdf_url: if local/localhost, upload to tmpfiles.org; if already public, return as-is
async function resolvePdfUrl(pdfUrl) {
  if (!pdfUrl) return '';
  // Detect localhost/127.0.0.1 URLs (desktop sends full http://127.0.0.1:PORT/api/... URLs)
  if (pdfUrl.includes('127.0.0.1') || pdfUrl.includes('localhost')) {
    try {
      const u = new URL(pdfUrl);
      const localPath = u.pathname + u.search;
      if (localPath.startsWith('/api/')) {
        return await uploadPdfToTmpFiles(localPath);
      }
    } catch (_) {}
    return '';
  }
  // If it's already a full public URL, return as-is
  if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) return pdfUrl;
  // Local path like /api/... - upload to tmpfiles.org
  if (pdfUrl.startsWith('/api/')) {
    return await uploadPdfToTmpFiles(pdfUrl);
  }
  return '';
}

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
    console.log('[WhatsApp] Sending to:', phone, 'mediaUrl:', mediaUrl ? 'yes' : 'no');
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const ok = result.success || res.statusCode === 201;
          console.log('[WhatsApp] Response:', res.statusCode, ok ? 'OK' : 'FAIL', data.substring(0, 200));
          resolve({ success: ok, data: result, error: ok ? '' : (result.error || result.message || `HTTP ${res.statusCode}`) });
        } catch (e) { console.log('[WhatsApp] Parse error:', data.substring(0, 200)); resolve({ success: false, error: data }); }
      });
    });
    req.on('error', e => { console.log('[WhatsApp] Network error:', e.message); resolve({ success: false, error: e.message }); });
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
    group_id: config.group_id || '', api_key_masked: masked,
    default_group_id: config.default_group_id || '',
    default_group_name: config.default_group_name || '',
    group_schedule_enabled: config.group_schedule_enabled || false,
    group_schedule_time: config.group_schedule_time || ''
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
  if (!Array.isArray(defaultNumbers)) defaultNumbers = [];
  const config = {
    setting_id: 'whatsapp_config', api_key: (req.body.api_key || '').trim(),
    country_code: (req.body.country_code || '91').trim(),
    enabled: !!req.body.api_key, default_numbers: defaultNumbers,
    group_id: (req.body.group_id || '').trim(),
    default_group_id: (req.body.default_group_id || '').trim(),
    default_group_name: (req.body.default_group_name || '').trim(),
    group_schedule_enabled: !!req.body.group_schedule_enabled,
    group_schedule_time: (req.body.group_schedule_time || '').trim()
  };
  if (idx >= 0) settings[idx] = config; else settings.push(config);
  // Use immediate save to prevent data loss from debounce
  if (database.saveImmediate) database.saveImmediate(); else database.save();
  console.log('[WhatsApp] Settings saved:', JSON.stringify({ default_numbers: config.default_numbers, group_id: config.group_id }));
  res.json({ success: true, message: 'WhatsApp settings save ho gayi!' });
}));

// GET groups from 360Messenger
router.get('/api/whatsapp/groups', safeAsync(async (req, res) => {
  const config = getWaSettings();
  const apiKey = config.api_key || '';
  if (!apiKey) return res.json({ success: false, groups: [], error: 'WhatsApp API key set nahi hai.' });
  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.360messenger.com', path: '/v2/groupChat/getGroupList', method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      };
      const req = https.request(options, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ success: false }); }
        });
      });
      req.on('error', e => resolve({ success: false, message: e.message }));
      req.setTimeout(30000, () => { req.destroy(); resolve({ success: false, message: 'Timeout' }); });
      req.end();
    });
    if (result.success) {
      const groups = (result.data && result.data.groups) || [];
      return res.json({ success: true, groups });
    }
    res.json({ success: false, groups: [], error: result.message || 'Group list fetch fail' });
  } catch (e) {
    res.json({ success: false, groups: [], error: e.message });
  }
}));

// Send message to WhatsApp group
router.post('/api/whatsapp/send-group', safeAsync(async (req, res) => {
  const groupId = req.body.group_id || '';
  const text = req.body.text || '';
  const mediaUrl = req.body.media_url || '';
  if (!groupId) return res.status(400).json({ detail: 'Group ID required' });
  if (!text && !mediaUrl) return res.status(400).json({ detail: 'Text ya media URL required' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  try {
    const result = await new Promise((resolve) => {
      const postData = JSON.stringify({ groupId, text, url: mediaUrl || undefined });
      const options = {
        hostname: 'api.360messenger.com', path: '/v2/sendGroup', method: 'POST',
        headers: { 'Authorization': `Bearer ${config.api_key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
      };
      const req = https.request(options, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ success: false }); }
        });
      });
      req.on('error', e => resolve({ success: false, error: e.message }));
      req.write(postData);
      req.end();
    });
    res.json({ success: result.success || false, message: result.success ? 'Group message bhej diya!' : '', error: result.error || result.message || '' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
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
  const phoneRaw = (req.body.phone || '').trim();
  const { party_name, total_amount, paid_amount, balance } = req.body;
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  // Try branding from app_settings first, then from database.data.branding
  const brandingFromSettings = col('app_settings').find(s => s.setting_id === 'branding');
  const branding = brandingFromSettings || database.data.branding || {};
  const company = branding.company_name || 'Mill Entry System';
  const bal = balance || ((total_amount || 0) - (paid_amount || 0));

  const text = `*${company}*\n---\nParty: ${party_name}\nTotal: Rs.${Number(total_amount||0).toLocaleString()}\nPaid: Rs.${Number(paid_amount||0).toLocaleString()}\n*Balance Due: Rs.${Number(bal).toLocaleString()}*\n---\nThank you\n${company}`;

  if (phoneRaw) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phoneRaw, config.country_code), text);
    return res.json({ success: r.success, message: r.success ? 'Reminder bhej diya!' : '', error: r.error || '' });
  }

  // Defensive: ensure default_numbers is always an array
  let nums = config.default_numbers || [];
  if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
  if (!Array.isArray(nums)) nums = [];
  if (!nums.length) return res.json({ success: false, error: 'Koi number nahi mila. Settings > WhatsApp mein default numbers SAVE karein.' });

  const results = [];
  for (const num of nums) {
    if (num && num.trim()) {
      const r = await sendWaMessage(config.api_key, cleanPhone(num.trim(), config.country_code), text);
      results.push({ phone: num, success: r.success, error: r.error || '' });
    }
  }
  const ok = results.filter(r => r.success).length;
  const firstErr = results.find(r => !r.success && r.error);
  res.json({ success: ok > 0, message: `${ok}/${results.length} numbers pe bhej diya!`, error: ok === 0 ? (firstErr?.error || '360Messenger API error') : '', details: results });
}));

// Daily report
router.post('/api/whatsapp/send-daily-report', safeAsync(async (req, res) => {
  const { report_text, pdf_url, send_to_group } = req.body;
  const phone = (req.body.phone || '').trim();
  if (!report_text) return res.status(400).json({ detail: 'Report text required' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  const resolvedPdfUrl = await resolvePdfUrl(pdf_url || '');

  // Defensive: ensure default_numbers is always an array
  let defaultNums = config.default_numbers || [];
  if (typeof defaultNums === 'string') defaultNums = defaultNums.split(',').map(n => n.trim()).filter(Boolean);
  if (!Array.isArray(defaultNums)) defaultNums = [];
  const groupId = (config.group_id || '').trim();

  console.log('[WhatsApp] send-daily-report: phone=' + phone + ', default_numbers=' + JSON.stringify(defaultNums) + ', group_id=' + groupId + ', pdf=' + (resolvedPdfUrl ? 'yes' : 'no'));

  const results = [];
  if (phone) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), report_text, resolvedPdfUrl);
    results.push({ target: phone, success: r.success, error: r.error || '' });
  } else {
    for (const num of defaultNums) {
      if (num && num.trim()) {
        const r = await sendWaMessage(config.api_key, cleanPhone(num.trim(), config.country_code), report_text, resolvedPdfUrl);
        results.push({ target: num, success: r.success, error: r.error || '' });
      }
    }
  }
  if (send_to_group && groupId) {
    const r = await sendWaMessage(config.api_key, groupId, report_text, resolvedPdfUrl);
    results.push({ target: 'group', success: r.success, error: r.error || '' });
  }
  if (!results.length) return res.json({ success: false, error: 'Koi number ya group set nahi hai. Settings > WhatsApp mein default numbers SAVE karein.' });
  const ok = results.filter(r => r.success).length;
  const firstErr2 = results.find(r => !r.success && r.error);
  res.json({ success: ok > 0, message: `${ok}/${results.length} targets pe bhej diya!`, error: ok === 0 ? (firstErr2?.error || '360Messenger API error') : '', details: results });
}));

// Party Ledger WhatsApp
router.post('/api/whatsapp/send-party-ledger', safeAsync(async (req, res) => {
  const { party_name, total_debit, total_credit, balance, transactions, pdf_url } = req.body;
  const phone = (req.body.phone || '').trim();
  if (!party_name) return res.status(400).json({ detail: 'Party name required' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  const resolvedPdfUrl = await resolvePdfUrl(pdf_url || '');

  const brandingFromSettings = col('app_settings').find(s => s.setting_id === 'branding');
  const branding = brandingFromSettings || database.data.branding || {};
  const company = branding.company_name || 'Mill Entry System';
  const bal = balance != null ? balance : ((total_debit||0) - (total_credit||0));
  const balLabel = bal > 0 ? 'Bakaya (Debit)' : bal < 0 ? 'Agrim (Credit)' : 'Settled';

  let text = `*${company}*\n━━━━━━━━━━━━━━━━\n*Party Ledger / खाता विवरण*\nParty: *${party_name}*\n━━━━━━━━━━━━━━━━\nTotal Debit (Kharcha): Rs.${Number(total_debit||0).toLocaleString()}\nTotal Credit (Jama): Rs.${Number(total_credit||0).toLocaleString()}\n*${balLabel}: Rs.${Math.abs(bal).toLocaleString()}*\n`;

  if (transactions && transactions.length > 0) {
    text += `\n*Recent Transactions (${Math.min(transactions.length, 10)}):*\n`;
    transactions.slice(0, 10).forEach(t => {
      const type = t.txn_type === 'jama' ? 'Jama' : 'Nikasi';
      text += `  ${t.date||''} | ${type} | Rs.${Number(t.amount||0).toLocaleString()}`;
      if (t.description) text += ` | ${String(t.description).substring(0, 30)}`;
      text += '\n';
    });
    if (transactions.length > 10) text += `  ... aur ${transactions.length - 10} entries\n`;
  }
  text += '\nThank you\n' + company;

  let nums = config.default_numbers || [];
  if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
  if (!Array.isArray(nums)) nums = [];

  const results = [];
  if (phone) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), text, resolvedPdfUrl);
    results.push({ target: phone, success: r.success, error: r.error || '' });
  } else {
    for (const num of nums) {
      if (num && num.trim()) {
        const r = await sendWaMessage(config.api_key, cleanPhone(num.trim(), config.country_code), text, resolvedPdfUrl);
        results.push({ target: num, success: r.success, error: r.error || '' });
      }
    }
  }
  if (!results.length) return res.json({ success: false, error: 'Koi number set nahi hai. Settings > WhatsApp mein default numbers SAVE karein.' });
  const ok = results.filter(r => r.success).length;
  const firstErrPL = results.find(r => !r.success && r.error);
  res.json({ success: ok > 0, message: `Party ledger ${ok}/${results.length} numbers pe bhej diya!`, error: ok === 0 ? (firstErrPL?.error || '360Messenger API error') : '', details: results });
}));

// Truck Payment WhatsApp
router.post('/api/whatsapp/send-truck-payment', safeAsync(async (req, res) => {
  const { truck_no, payments, total_net, total_paid, total_balance, pdf_url } = req.body;
  const phone = (req.body.phone || '').trim();
  if (!truck_no) return res.status(400).json({ detail: 'Truck number required' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  const resolvedPdfUrl = await resolvePdfUrl(pdf_url || '');

  const brandingFromSettings = col('app_settings').find(s => s.setting_id === 'branding');
  const branding = brandingFromSettings || database.data.branding || {};
  const company = branding.company_name || 'Mill Entry System';
  const balLabel = (total_balance || 0) > 0 ? 'Bakaya' : 'Settled';

  let text = `*${company}*\n━━━━━━━━━━━━━━━━\n*Truck Payment / ट्रक भुगतान*\nTruck: *${truck_no}*\n━━━━━━━━━━━━━━━━\nNet Amount: Rs.${Number(total_net||0).toLocaleString()}\nPaid: Rs.${Number(total_paid||0).toLocaleString()}\n*${balLabel}: Rs.${Math.abs(total_balance||0).toLocaleString()}*\n`;

  if (payments && payments.length > 0) {
    text += `\n*Trips (${Math.min(payments.length, 10)}):*\n`;
    payments.slice(0, 10).forEach(p => {
      text += `  ${p.date||''} | ${p.mandi_name||''} | Rs.${Number(p.net_amount||0).toLocaleString()}\n`;
    });
    if (payments.length > 10) text += `  ... aur ${payments.length - 10} trips\n`;
  }
  text += '\nThank you\n' + company;

  let nums = config.default_numbers || [];
  if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
  if (!Array.isArray(nums)) nums = [];

  const results = [];
  if (phone) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), text, resolvedPdfUrl);
    results.push({ target: phone, success: r.success, error: r.error || '' });
  } else {
    for (const num of nums) {
      if (num && num.trim()) {
        const r = await sendWaMessage(config.api_key, cleanPhone(num.trim(), config.country_code), text, resolvedPdfUrl);
        results.push({ target: num, success: r.success, error: r.error || '' });
      }
    }
  }
  if (!results.length) return res.json({ success: false, error: 'Koi number set nahi hai. Settings > WhatsApp mein default numbers SAVE karein.' });
  const ok = results.filter(r => r.success).length;
  const firstErrTP = results.find(r => !r.success && r.error);
  res.json({ success: ok > 0, message: `Truck payment ${ok}/${results.length} numbers pe bhej diya!`, error: ok === 0 ? (firstErrTP?.error || '360Messenger API error') : '', details: results });
}));

// Truck Owner WhatsApp
router.post('/api/whatsapp/send-truck-owner', safeAsync(async (req, res) => {
  const { truck_no, total_trips, total_gross, total_deductions, total_net, total_paid, total_balance, pdf_url } = req.body;
  const phone = (req.body.phone || '').trim();
  if (!truck_no) return res.status(400).json({ detail: 'Truck number required' });
  const config = getWaSettings();
  if (!config.api_key) return res.json({ success: false, error: 'API key set nahi hai.' });

  const resolvedPdfUrl = await resolvePdfUrl(pdf_url || '');

  const brandingFromSettings = col('app_settings').find(s => s.setting_id === 'branding');
  const branding = brandingFromSettings || database.data.branding || {};
  const company = branding.company_name || 'Mill Entry System';
  const balLabel = (total_balance || 0) > 0 ? 'Bakaya' : 'Settled';

  let text = `*${company}*\n━━━━━━━━━━━━━━━━\n*Truck Owner Payment / ट्रक मालिक भुगतान*\nTruck: *${truck_no}*\nTotal Trips: ${total_trips||0}\n━━━━━━━━━━━━━━━━\nGross Amount: Rs.${Number(total_gross||0).toLocaleString()}\nDeductions: Rs.${Number(total_deductions||0).toLocaleString()}\nNet Payable: Rs.${Number(total_net||0).toLocaleString()}\nPaid: Rs.${Number(total_paid||0).toLocaleString()}\n*${balLabel}: Rs.${Math.abs(total_balance||0).toLocaleString()}*\n\nThank you\n${company}`;

  let nums = config.default_numbers || [];
  if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
  if (!Array.isArray(nums)) nums = [];

  const results = [];
  if (phone) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phone, config.country_code), text, resolvedPdfUrl);
    results.push({ target: phone, success: r.success, error: r.error || '' });
  } else {
    for (const num of nums) {
      if (num && num.trim()) {
        const r = await sendWaMessage(config.api_key, cleanPhone(num.trim(), config.country_code), text, resolvedPdfUrl);
        results.push({ target: num, success: r.success, error: r.error || '' });
      }
    }
  }
  if (!results.length) return res.json({ success: false, error: 'Koi number set nahi hai. Settings > WhatsApp mein default numbers SAVE karein.' });
  const ok = results.filter(r => r.success).length;
  const firstErrTO = results.find(r => !r.success && r.error);
  res.json({ success: ok > 0, message: `Truck owner payment ${ok}/${results.length} numbers pe bhej diya!`, error: ok === 0 ? (firstErrTO?.error || '360Messenger API error') : '', details: results });
}));


// ============ SEND GST INVOICE ============
router.post('/api/whatsapp/send-gst-invoice', safeAsync(async (req, res) => {
  const { invoice_id, pdf_url, phone } = req.body;
  const invoices = db.getData('/gst_invoices', []);
  const inv = invoices.find(i => i.id === invoice_id);
  if (!inv) return res.json({ success: false, error: 'Invoice not found' });

  const config = db.getData('/settings/whatsapp', {});
  if (!config.api_key) return res.json({ success: false, error: 'WhatsApp API key set nahi hai. Settings > WhatsApp mein daalo.' });

  const branding = db.getData('/settings/branding', {});
  const company = branding.company_name || 'Mill Entry System';
  const totals = inv.totals || {};

  let text = `*${company}*\n━━━━━━━━━━━━━━━━\n*TAX INVOICE*\nInvoice No: *${inv.invoice_no || ''}*\nDate: ${inv.date || ''}\n━━━━━━━━━━━━━━━━\nBuyer: ${inv.buyer_name || ''}\nGSTIN: ${inv.buyer_gstin || ''}\n━━━━━━━━━━━━━━━━\nTaxable: Rs.${Number(totals.taxable||0).toLocaleString()}\n`;
  if (inv.is_igst) {
    text += `IGST: Rs.${Number(totals.igst||0).toLocaleString()}\n`;
  } else {
    text += `CGST: Rs.${Number(totals.cgst||0).toLocaleString()}\nSGST: Rs.${Number(totals.sgst||0).toLocaleString()}\n`;
  }
  text += `*Grand Total: Rs.${Number(totals.total||0).toLocaleString()}*\n\nThank you\n${company}`;

  const resolvedPdfUrl = await resolvePdfUrl(pdf_url);
  const nums = (config.default_numbers || '').split(',').map(n => n.trim()).filter(Boolean);
  const results = [];

  if (phone && phone.trim()) {
    const r = await sendWaMessage(config.api_key, cleanPhone(phone.trim(), config.country_code), text, resolvedPdfUrl);
    results.push({ target: phone, success: r.success });
  }
  for (const num of nums) {
    if (num && num.trim() && num.trim() !== (phone || '').trim()) {
      const r = await sendWaMessage(config.api_key, cleanPhone(num.trim(), config.country_code), text, resolvedPdfUrl);
      results.push({ target: num, success: r.success });
    }
  }
  if (!results.length) return res.json({ success: false, error: 'Koi number set nahi hai.' });
  const ok = results.filter(r => r.success).length;
  res.json({ success: ok > 0, message: `GST Invoice ${ok}/${results.length} numbers pe bhej diya!`, details: results });
}));



return router;
};
