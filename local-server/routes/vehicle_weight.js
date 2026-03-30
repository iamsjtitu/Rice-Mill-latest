/**
 * Vehicle Weight Routes - Desktop App (Electron/Express)
 * Mirrors: /app/backend/routes/vehicle_weight.py
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { safeAsync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

  // Image storage directory
  const imgDir = path.join(database.dir || '.', 'vw_images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  function saveImage(entryId, tag, b64data) {
    if (!b64data) return '';
    const filename = `${entryId}_${tag}.jpg`;
    fs.writeFileSync(path.join(imgDir, filename), Buffer.from(b64data, 'base64'));
    return filename;
  }

  function loadImageB64(filename) {
    if (!filename) return '';
    const fp = path.join(imgDir, filename);
    if (fs.existsSync(fp)) return fs.readFileSync(fp).toString('base64');
    return '';
  }

  function col(name) {
    if (!database.data[name]) database.data[name] = [];
    return database.data[name];
  }

  // ── Helper: Next RST number ──
  function getNextRst(kmsYear) {
    const weights = col('vehicle_weights');
    const filtered = kmsYear ? weights.filter(w => w.kms_year === kmsYear) : weights;
    if (filtered.length === 0) return 1;
    const maxRst = Math.max(...filtered.map(w => w.rst_no || 0));
    return maxRst + 1;
  }

  // ── Helper: Get WhatsApp settings ──
  function getWaSettings() {
    const settings = col('app_settings');
    const config = settings.find(s => s.setting_id === 'whatsapp_config');
    if (!config) return { api_key: '', country_code: '91', enabled: false, default_numbers: [], group_id: '' };
    return config;
  }

  function cleanPhone(phone, countryCode = '91') {
    phone = phone.trim().replace(/[\s\-\+]/g, '');
    if (phone.startsWith('0')) phone = phone.substring(1);
    if (!phone.startsWith(countryCode)) phone = countryCode + phone;
    return phone;
  }

  function sendWaMessage(apiKey, phone, text) {
    return new Promise((resolve) => {
      const postData = `phonenumber=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}`;
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
            const ok = result.success || res.statusCode === 201;
            resolve({ success: ok, data: result, error: ok ? '' : (result.error || result.message || `HTTP ${res.statusCode}`) });
          } catch (e) { resolve({ success: false, error: data }); }
        });
      });
      req.on('error', e => resolve({ success: false, error: e.message }));
      req.write(postData);
      req.end();
    });
  }

  function sendWaToGroup(apiKey, groupId, text) {
    return new Promise((resolve) => {
      const postData = `phonenumber=${encodeURIComponent(groupId)}&text=${encodeURIComponent(text)}`;
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
            const ok = result.success || res.statusCode === 201;
            resolve({ success: ok, data: result });
          } catch (e) { resolve({ success: false, error: data }); }
        });
      });
      req.on('error', e => resolve({ success: false, error: e.message }));
      req.write(postData);
      req.end();
    });
  }

  // ── Helper: Get Telegram config ──
  function getTelegramConfig() {
    const settings = col('app_settings');
    const config = settings.find(s => s.setting_id === 'telegram_config');
    if (config && !config.chat_ids && config.chat_id) {
      config.chat_ids = [{ chat_id: config.chat_id, label: 'Default' }];
    }
    return config || null;
  }

  function telegramApi(method, botToken, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const options = {
        hostname: 'api.telegram.org', path: `/bot${botToken}/${method}`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      };
      const req = https.request(options, (res) => {
        let chunks = '';
        res.on('data', c => chunks += c);
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

  // Send photo to Telegram using multipart
  function telegramSendPhoto(botToken, chatId, photoBuffer, caption, filename) {
    return new Promise((resolve, reject) => {
      const boundary = '----FormBoundary' + Date.now().toString(36);
      const parts = [];
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`);
      const head = Buffer.from(parts.join('\r\n') + '\r\n');
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([head, photoBuffer, tail]);
      const options = {
        hostname: 'api.telegram.org', path: `/bot${botToken}/sendPhoto`, method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
      };
      const req = https.request(options, (res) => {
        let chunks = '';
        res.on('data', c => chunks += c);
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

  async function sendPhotoToAll(botToken, chatIds, photoBuffer, caption, filename) {
    const results = [];
    for (const item of chatIds) {
      const cid = String(item.chat_id || '').trim();
      if (!cid) continue;
      try {
        const r = await telegramSendPhoto(botToken, cid, photoBuffer, caption, filename);
        results.push(r);
      } catch (e) {
        results.push({ ok: false, description: e.message });
      }
    }
    return results;
  }

  // ── Helper: Build weight text ──
  function buildWeightText(entry) {
    const rst = entry.rst_no || '?';
    const pkts = entry.tot_pkts || entry.pkts || 0;
    const farmer = entry.farmer_name || '';
    const mandi = entry.mandi_name || '';
    const farmerMandi = farmer || mandi;
    let text = `*Weight Slip — RST #${rst}*\n` +
      `Date: ${entry.date || ''}\n` +
      `Vehicle: ${entry.vehicle_no || ''}\n` +
      `Party: ${entry.party_name || ''}\n`;
    if (farmerMandi) text += `Farmer/Mandi: ${farmerMandi}\n`;
    text += `Product: ${entry.product || ''}\n` +
      `Packets: ${pkts > 0 ? pkts : '-'}\n` +
      `───────────────\n` +
      `Gross Wt: ${Number(entry.gross_wt || entry.first_wt || 0).toLocaleString()} KG\n` +
      `Tare Wt: ${Number(entry.tare_wt || entry.second_wt || 0).toLocaleString()} KG\n` +
      `*Net Wt: ${Number(entry.net_wt || 0).toLocaleString()} KG*\n` +
      `───────────────\n`;
    const cash = entry.cash_paid || 0;
    const diesel = entry.diesel_paid || 0;
    if (cash > 0) text += `Cash Paid: \u20b9${Number(cash).toLocaleString()}\n`;
    if (diesel > 0) text += `Diesel Paid: \u20b9${Number(diesel).toLocaleString()}\n`;
    if (cash > 0 || diesel > 0) text += `───────────────\n`;
    return text;
  }

  // ========================================
  // ROUTES
  // ========================================

  // GET /api/vehicle-weight - List weights
  router.get('/api/vehicle-weight', safeAsync(async (req, res) => {
    const { kms_year, status } = req.query;
    const limit = parseInt(req.query.limit) || 200;
    let items = col('vehicle_weights');
    if (kms_year) items = items.filter(w => w.kms_year === kms_year);
    if (status) items = items.filter(w => w.status === status);
    items = [...items].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    items = items.slice(0, limit);
    res.json({ entries: items, count: items.length });
  }));

  // GET /api/vehicle-weight/pending
  router.get('/api/vehicle-weight/pending', safeAsync(async (req, res) => {
    const { kms_year } = req.query;
    let items = col('vehicle_weights').filter(w => w.status === 'pending');
    if (kms_year) items = items.filter(w => w.kms_year === kms_year);
    items = [...items].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json({ pending: items, count: items.length });
  }));

  // GET /api/vehicle-weight/next-rst
  router.get('/api/vehicle-weight/next-rst', safeAsync(async (req, res) => {
    const rst = getNextRst(req.query.kms_year || '');
    res.json({ rst_no: rst });
  }));

  // GET /api/vehicle-weight/auto-notify-setting
  router.get('/api/vehicle-weight/auto-notify-setting', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const doc = settings.find(s => s.setting_id === 'auto_vw_messaging');
    if (doc) return res.json({ enabled: doc.enabled || false });
    res.json({ enabled: false });
  }));

  // PUT /api/vehicle-weight/auto-notify-setting
  router.put('/api/vehicle-weight/auto-notify-setting', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const enabled = !!req.body.enabled;
    const idx = settings.findIndex(s => s.setting_id === 'auto_vw_messaging');
    if (idx >= 0) {
      settings[idx].enabled = enabled;
    } else {
      settings.push({ setting_id: 'auto_vw_messaging', enabled });
    }
    database.save();
    res.json({ success: true, enabled });
  }));

  // POST /api/vehicle-weight/auto-notify - Auto send weight + saved camera images
  router.post('/api/vehicle-weight/auto-notify', safeAsync(async (req, res) => {
    const entryId = req.body.entry_id || '';

    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const text = buildWeightText(entry);
    const rst = entry.rst_no || '?';
    const results = { whatsapp: [], telegram: [] };

    // Load saved camera images from disk
    const firstFrontB64 = loadImageB64(entry.first_wt_front_img || '');
    const firstSideB64 = loadImageB64(entry.first_wt_side_img || '');
    const secondFrontB64 = loadImageB64(entry.second_wt_front_img || '');
    const secondSideB64 = loadImageB64(entry.second_wt_side_img || '');

    // ── WhatsApp ──
    try {
      const waSettings = getWaSettings();
      if (waSettings.enabled && waSettings.api_key) {
        let nums = waSettings.default_numbers || [];
        if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
        for (const num of nums) {
          if (num) {
            const r = await sendWaMessage(waSettings.api_key, cleanPhone(num.trim(), waSettings.country_code || '91'), text);
            results.whatsapp.push(r);
          }
        }
      }
    } catch (e) { console.error('[VW] WA auto-notify error:', e.message); }

    // ── Telegram (text + all saved photos) ──
    try {
      const tgConfig = getTelegramConfig();
      if (tgConfig && tgConfig.bot_token && tgConfig.chat_ids && tgConfig.chat_ids.length > 0) {
        const botToken = tgConfig.bot_token;
        const chatIds = tgConfig.chat_ids;
        // Send text
        for (const item of chatIds) {
          const cid = String(item.chat_id || '').trim();
          if (cid) {
            await telegramApi('sendMessage', botToken, { chat_id: cid, text: text, parse_mode: 'Markdown' });
          }
        }
        // Send 1st weight photos
        if (firstFrontB64) {
          const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(firstFrontB64, 'base64'), `1st Weight Front - RST #${rst}`, `1st_front_rst${rst}.jpg`);
          results.telegram.push(...r);
        }
        if (firstSideB64) {
          const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(firstSideB64, 'base64'), `1st Weight Side - RST #${rst}`, `1st_side_rst${rst}.jpg`);
          results.telegram.push(...r);
        }
        // Send 2nd weight photos
        if (secondFrontB64) {
          const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(secondFrontB64, 'base64'), `2nd Weight Front - RST #${rst}`, `2nd_front_rst${rst}.jpg`);
          results.telegram.push(...r);
        }
        if (secondSideB64) {
          const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(secondSideB64, 'base64'), `2nd Weight Side - RST #${rst}`, `2nd_side_rst${rst}.jpg`);
          results.telegram.push(...r);
        }
      }
    } catch (e) { console.error('[VW] Telegram auto-notify error:', e.message); }

    const waSent = results.whatsapp.filter(r => r.success).length;
    const tgSent = results.telegram.filter(r => r.ok).length;
    res.json({ success: true, message: `WA: ${waSent} sent, TG: ${tgSent} sent`, results });
  }));

  // GET /api/vehicle-weight/by-rst/:rst_no - Lookup by RST (used by Entries form auto-fill)
  router.get('/api/vehicle-weight/by-rst/:rst_no', safeAsync(async (req, res) => {
    const rstNo = parseInt(req.params.rst_no);
    const kmsYear = req.query.kms_year || '';
    const weights = col('vehicle_weights');
    let entry = kmsYear
      ? weights.find(w => w.rst_no === rstNo && w.kms_year === kmsYear)
      : weights.find(w => w.rst_no === rstNo);
    if (!entry) return res.status(404).json({ detail: 'RST not found in Vehicle Weight' });
    res.json({ success: true, entry });
  }));

  // POST /api/vehicle-weight/send-manual - Manual send text + camera photos
  router.post('/api/vehicle-weight/send-manual', safeAsync(async (req, res) => {
    const text = req.body.text || '';
    const frontImageB64 = req.body.front_image || '';
    const sideImageB64 = req.body.side_image || '';
    const sendToNumbers = req.body.send_to_numbers || false;
    const sendToGroup = req.body.send_to_group || false;

    const results = { whatsapp: [], telegram: [] };
    const frontBytes = frontImageB64 ? Buffer.from(frontImageB64, 'base64') : null;
    const sideBytes = sideImageB64 ? Buffer.from(sideImageB64, 'base64') : null;

    // ── WhatsApp ──
    try {
      const waSettings = getWaSettings();
      if (waSettings.enabled && waSettings.api_key) {
        if (sendToNumbers) {
          let nums = waSettings.default_numbers || [];
          if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
          for (const num of nums) {
            if (num) {
              const r = await sendWaMessage(waSettings.api_key, cleanPhone(num.trim(), waSettings.country_code || '91'), text);
              results.whatsapp.push({ to: num, success: r.success || false });
            }
          }
        }
        if (sendToGroup) {
          const groupId = (waSettings.group_id || '').trim();
          if (groupId) {
            const r = await sendWaToGroup(waSettings.api_key, groupId, text);
            results.whatsapp.push({ to: 'group', success: r.success || false });
          }
        }
      }
    } catch (e) { console.error('[VW] WA manual send error:', e.message); }

    // ── Telegram (text + photos) ──
    try {
      const tgConfig = getTelegramConfig();
      if (tgConfig && tgConfig.bot_token && tgConfig.chat_ids && tgConfig.chat_ids.length > 0) {
        const botToken = tgConfig.bot_token;
        const chatIds = tgConfig.chat_ids;
        // Text message
        for (const item of chatIds) {
          const cid = String(item.chat_id || '').trim();
          if (cid) {
            await telegramApi('sendMessage', botToken, { chat_id: cid, text: text, parse_mode: 'Markdown' });
          }
        }
        // Photos
        if (frontBytes) {
          const r = await sendPhotoToAll(botToken, chatIds, frontBytes, 'Front View', 'front.jpg');
          results.telegram.push(...r);
        }
        if (sideBytes) {
          const r = await sendPhotoToAll(botToken, chatIds, sideBytes, 'Side View', 'side.jpg');
          results.telegram.push(...r);
        }
      }
    } catch (e) { console.error('[VW] TG manual send error:', e.message); }

    const waSent = results.whatsapp.filter(r => r.success).length;
    const tgSent = results.telegram.filter(r => r.ok).length;
    res.json({ success: true, message: `WA: ${waSent}, TG: ${tgSent}`, results });
  }));

  // POST /api/vehicle-weight - Create new entry with first weight
  router.post('/api/vehicle-weight', safeAsync(async (req, res) => {
    const data = req.body;
    const kmsYear = data.kms_year || '';
    let rstNo;
    if (data.rst_no && parseInt(data.rst_no) > 0) {
      rstNo = parseInt(data.rst_no);
      // Check duplicate RST
      const weights = col('vehicle_weights');
      const dup = kmsYear
        ? weights.find(w => w.rst_no === rstNo && w.kms_year === kmsYear)
        : weights.find(w => w.rst_no === rstNo);
      if (dup) return res.status(400).json({ detail: `RST #${rstNo} already exists! Duplicate RST number.` });
    } else {
      rstNo = getNextRst(kmsYear);
    }

    const entry = {
      id: uuidv4(),
      rst_no: rstNo,
      date: data.date || new Date().toISOString().split('T')[0],
      kms_year: kmsYear,
      vehicle_no: (data.vehicle_no || '').trim().toUpperCase(),
      party_name: (data.party_name || '').trim(),
      farmer_name: (data.farmer_name || '').trim(),
      product: data.product || 'PADDY',
      trans_type: data.trans_type || 'Receive(Pur)',
      j_pkts: parseInt(data.j_pkts || 0) || 0,
      p_pkts: parseInt(data.p_pkts || 0) || 0,
      tot_pkts: parseInt(data.tot_pkts || 0) || 0,
      first_wt: parseFloat(data.first_wt || 0) || 0,
      first_wt_time: new Date().toISOString(),
      second_wt: 0,
      second_wt_time: '',
      net_wt: 0,
      remark: data.remark || '',
      cash_paid: parseFloat(data.cash_paid || 0) || 0,
      diesel_paid: parseFloat(data.diesel_paid || 0) || 0,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Save first weight camera photos
    entry.first_wt_front_img = saveImage(entry.id, '1st_front', data.first_wt_front_img || '');
    entry.first_wt_side_img = saveImage(entry.id, '1st_side', data.first_wt_side_img || '');

    col('vehicle_weights').push(entry);
    database.save();
    res.json({ success: true, entry, message: `RST #${rstNo} - First weight saved!` });
  }));

  // PUT /api/vehicle-weight/:entry_id/second-weight
  router.put('/api/vehicle-weight/:entry_id/second-weight', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === req.params.entry_id);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const secondWt = parseFloat(req.body.second_wt || 0) || 0;
    const firstWt = entry.first_wt;
    const netWt = Math.abs(firstWt - secondWt);
    const grossWt = Math.max(firstWt, secondWt);
    const tareWt = Math.min(firstWt, secondWt);

    entry.second_wt = secondWt;
    entry.second_wt_time = new Date().toISOString();
    entry.net_wt = netWt;
    entry.gross_wt = grossWt;
    entry.tare_wt = tareWt;
    entry.status = 'completed';

    // Save second weight camera photos
    const f2 = saveImage(entry.id, '2nd_front', req.body.second_wt_front_img || '');
    const s2 = saveImage(entry.id, '2nd_side', req.body.second_wt_side_img || '');
    if (f2) entry.second_wt_front_img = f2;
    if (s2) entry.second_wt_side_img = s2;

    if ('cash_paid' in req.body) entry.cash_paid = parseFloat(req.body.cash_paid || 0) || 0;
    if ('diesel_paid' in req.body) entry.diesel_paid = parseFloat(req.body.diesel_paid || 0) || 0;

    database.save();
    res.json({ success: true, entry, message: `RST #${entry.rst_no} - Net Wt: ${netWt} KG` });
  }));

  // DELETE /api/vehicle-weight/:entry_id
  router.delete('/api/vehicle-weight/:entry_id', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const idx = weights.findIndex(w => w.id === req.params.entry_id);
    if (idx === -1) return res.status(404).json({ detail: 'Entry not found' });
    weights.splice(idx, 1);
    database.save();
    res.json({ success: true, message: 'Entry deleted' });
  }));

  // PUT /api/vehicle-weight/:entry_id/edit
  router.put('/api/vehicle-weight/:entry_id/edit', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === req.params.entry_id);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const editable = ['vehicle_no', 'party_name', 'farmer_name', 'product', 'tot_pkts', 'cash_paid', 'diesel_paid'];
    for (const f of editable) {
      if (f in req.body) {
        if (f === 'cash_paid' || f === 'diesel_paid') {
          entry[f] = parseFloat(req.body[f] || 0) || 0;
        } else {
          entry[f] = req.body[f];
        }
      }
    }
    database.save();
    res.json({ success: true, entry });
  }));

  // GET /api/vehicle-weight/:entry_id/slip-pdf - A5 portrait, 2 copies (Party + Customer)
  router.get('/api/vehicle-weight/:entry_id/slip-pdf', safeAsync(async (req, res) => {
    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');

    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === req.params.entry_id);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const branding = database.data.branding || {};
    const company = branding.company_name || 'NAVKAR AGRO';
    const tagline = branding.tagline || 'JOLKO, KESINGA';

    const firstWt = entry.first_wt || 0;
    const secondWt = entry.second_wt || 0;
    const netWt = entry.net_wt || 0;
    const grossWt = entry.gross_wt || Math.max(firstWt, secondWt);
    const tareWt = entry.tare_wt || Math.min(firstWt, secondWt);
    const cash = entry.cash_paid || 0;
    const diesel = entry.diesel_paid || 0;
    const rst = entry.rst_no || '';

    // A5 portrait: 148mm x 210mm = ~419.53 x 595.28 pts
    const W = 419.53, H = 595.28;
    const doc = new PDFDocument({ size: [W, H], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end', () => {
      const pdfBuf = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=WeightSlip_RST${rst}.pdf`);
      res.send(pdfBuf);
    });

    const fontDir = path.join(__dirname, '..', 'fonts');
    const hasFreeSans = fs.existsSync(path.join(fontDir, 'FreeSans.ttf'));
    if (hasFreeSans) {
      doc.registerFont('AppFont', path.join(fontDir, 'FreeSans.ttf'));
      doc.registerFont('AppFontBold', path.join(fontDir, 'FreeSansBold.ttf'));
    }
    const fn = hasFreeSans ? 'AppFont' : 'Helvetica';
    const fb = hasFreeSans ? 'AppFontBold' : 'Helvetica-Bold';

    const LM = 14, RM = 14; // ~5mm margins
    const PW = W - LM - RM;
    const mm = 2.835; // 1mm in points

    // PDFKit uses TOP-DOWN coordinates: y=0 is top, y increases downward
    function drawCopy(startY, copyLabel, showSig) {
      const x = LM;
      let y = startY;
      const bh = 95 * mm;

      // Border box
      doc.lineWidth(1.5).strokeColor('#333').rect(x, y, PW, bh).stroke();

      // Copy label (top-right on border)
      const lw = doc.font(fb).fontSize(7).widthOfString(copyLabel);
      doc.rect(x + PW - lw - 40, y - 3, lw + 12, 8).fill('#fff');
      doc.font(fb).fontSize(7).fillColor('#888').text(copyLabel, x + PW - lw - 34, y - 1, { lineBreak: false });

      y += 5 * mm;

      // Company name
      doc.font(fb).fontSize(15).fillColor('#1a1a2e').text(company, x, y, { width: PW, align: 'center' });
      y += 6 * mm;

      // Tagline
      doc.font(fn).fontSize(7.5).fillColor('#888').text(tagline, x, y, { width: PW, align: 'center' });
      y += 4 * mm;

      // Header line
      doc.lineWidth(1.5).strokeColor('#1a1a2e').moveTo(x + 6, y).lineTo(x + PW - 6, y).stroke();
      y += 3.5 * mm;

      // Slip title
      doc.font(fb).fontSize(10).fillColor('#333').text('WEIGHT SLIP', x, y, { width: PW, align: 'center' });
      y += 5 * mm;

      // Info grid
      const rows = [
        ['RST No.', `#${rst}`, 'Date', entry.date || ''],
        ['Vehicle', entry.vehicle_no || '', 'Trans', entry.trans_type || ''],
        ['Party', entry.party_name || '', 'Farmer', entry.farmer_name || ''],
        ['Product', entry.product || '', 'Bags', String(entry.tot_pkts || 0)],
      ];
      const rh = 4.5 * mm;
      const c1w = 18 * mm, c2w = 40 * mm, c3w = 14 * mm;

      rows.forEach((row, i) => {
        const ry = y + i * rh;
        doc.lineWidth(0.4).strokeColor('#ccc').moveTo(x + 6, ry + rh).lineTo(x + PW - 6, ry + rh).stroke();
        doc.font(fb).fontSize(7).fillColor('#555').text(row[0], x + 8, ry, { lineBreak: false });
        const fsize = i === 0 ? 9.5 : 8.5;
        doc.font(i === 0 ? fb : fn).fontSize(fsize).fillColor('#000').text(String(row[1]).substring(0, 22), x + 8 + c1w, ry, { lineBreak: false });
        doc.font(fb).fontSize(7).fillColor('#555').text(row[2], x + 8 + c1w + c2w, ry, { lineBreak: false });
        doc.font(fn).fontSize(8.5).fillColor('#000').text(String(row[3]).substring(0, 22), x + 8 + c1w + c2w + c3w, ry, { lineBreak: false });
      });

      y += rows.length * rh + 4 * mm;

      // Weight boxes
      const wtItems = [
        { label: 'Gross', val: `${Number(grossWt).toLocaleString()} KG`, bg: '#f5f5f5', fg: '#111', bc: '#bbb' },
        { label: 'Tare', val: `${Number(tareWt).toLocaleString()} KG`, bg: '#f5f5f5', fg: '#111', bc: '#bbb' },
        { label: 'Net', val: `${Number(netWt).toLocaleString()} KG`, bg: '#e8f5e9', fg: '#1b5e20', bc: '#388e3c' },
      ];
      if (cash > 0) wtItems.push({ label: 'Cash', val: `Rs.${Number(cash).toLocaleString()}`, bg: '#fff8e1', fg: '#e65100', bc: '#f9a825' });
      if (diesel > 0) wtItems.push({ label: 'Diesel', val: `Rs.${Number(diesel).toLocaleString()}`, bg: '#fff8e1', fg: '#e65100', bc: '#f9a825' });

      const numCols = wtItems.length;
      const colW = (PW - 12) / numCols;
      const boxH = 11 * mm;

      wtItems.forEach((item, i) => {
        const bx = x + 6 + i * colW;
        doc.rect(bx, y, colW - 2, boxH).fill(item.bg);
        doc.lineWidth(item.label === 'Net' ? 0.8 : 0.4).strokeColor(item.bc).rect(bx, y, colW - 2, boxH).stroke();
        doc.font(fn).fontSize(6).fillColor('#666').text(item.label, bx, y + 2, { width: colW - 2, align: 'center' });
        const fz = item.label === 'Net' ? 13 : (item.label === 'Cash' || item.label === 'Diesel') ? 10 : 11;
        doc.font(fb).fontSize(fz).fillColor(item.fg).text(item.val, bx, y + 4.5 * mm, { width: colW - 2, align: 'center' });
      });

      y += boxH + 3 * mm;

      // Signatures
      if (showSig) {
        const sigW = 38 * mm;
        const sigLineY = y + 10 * mm;
        doc.lineWidth(0.6).strokeColor('#333');
        doc.moveTo(x + 22, sigLineY).lineTo(x + 22 + sigW, sigLineY).stroke();
        doc.font(fn).fontSize(6).fillColor('#555').text('Driver', x + 22, sigLineY + 2, { width: sigW, align: 'center' });
        doc.moveTo(x + PW - 22 - sigW, sigLineY).lineTo(x + PW - 22, sigLineY).stroke();
        doc.font(fn).fontSize(6).fillColor('#555').text('Authorized', x + PW - 22 - sigW, sigLineY + 2, { width: sigW, align: 'center' });
      }

      // Footer at bottom of copy block
      doc.font(fn).fontSize(5).fillColor('#bbb').text(`${company} | Computer Generated`, x, startY + bh - 10, { width: PW, align: 'center' });
    }

    // Draw copies (PDFKit top-down: start from top margin)
    const partyOnly = req.query.party_only === '1';
    const topMargin = 5 * mm;
    const copy1Top = topMargin;

    if (partyOnly) {
      drawCopy(copy1Top, 'PARTY COPY', false);
    } else {
      drawCopy(copy1Top, 'PARTY COPY', false);

      // Cut line below first copy
      const cutY = copy1Top + 95 * mm + 2 * mm;
      doc.lineWidth(0.8).strokeColor('#aaa').dash(3, { space: 3 }).moveTo(LM, cutY).lineTo(W - RM, cutY).stroke();
      doc.undash();
      doc.font(fn).fontSize(5).fillColor('#aaa').text('- - - CUT HERE - - -', LM, cutY - 4, { width: PW, align: 'center' });

      const copy2Top = cutY + 2 * mm;
      drawCopy(copy2Top, 'CUSTOMER COPY', true);
    }

    doc.end();
  }));

  return router;
};
