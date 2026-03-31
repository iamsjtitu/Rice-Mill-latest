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
  const imgDir = path.join(database.dataFolder || '.', 'vw_images');
  try { if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true }); } catch(e) { console.error('[VW] Cannot create vw_images dir:', e.message); }

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

  function sendWaToGroup(apiKey, groupId, text, mediaUrl) {
    return new Promise((resolve) => {
      const postData = mediaUrl
        ? `groupId=${encodeURIComponent(groupId)}&text=${encodeURIComponent(text)}&url=${encodeURIComponent(mediaUrl)}`
        : `groupId=${encodeURIComponent(groupId)}&text=${encodeURIComponent(text)}`;
      const options = {
        hostname: 'api.360messenger.com', path: '/v2/sendGroup', method: 'POST',
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
      `Bags: ${pkts > 0 ? pkts : '-'}\n` +
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
    const { kms_year, status, date_from, date_to, vehicle_no, party_name, farmer_name, rst_no } = req.query;
    let items = col('vehicle_weights');
    if (kms_year) items = items.filter(w => w.kms_year === kms_year);
    if (status) items = items.filter(w => w.status === status);
    if (date_from) items = items.filter(w => (w.date || '') >= date_from);
    if (date_to) items = items.filter(w => (w.date || '') <= date_to);
    if (vehicle_no) items = items.filter(w => (w.vehicle_no || '').toLowerCase().includes(vehicle_no.toLowerCase()));
    if (party_name) items = items.filter(w => (w.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
    if (farmer_name) items = items.filter(w => (w.farmer_name || '').toLowerCase().includes(farmer_name.toLowerCase()));
    if (rst_no) items = items.filter(w => String(w.rst_no) === String(rst_no));
    items = [...items].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const total = items.length;
    const pageSize = parseInt(req.query.page_size) || 200;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * pageSize;
    items = items.slice(skip, skip + pageSize);
    res.json({ entries: items, count: items.length, total, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)) });
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
    if (doc) return res.json({
      enabled: doc.enabled || false,
      wa_group_id: doc.wa_group_id || '',
      wa_group_name: doc.wa_group_name || '',
      tg_chat_ids: doc.tg_chat_ids || [],
    });
    res.json({ enabled: false, wa_group_id: '', wa_group_name: '', tg_chat_ids: [] });
  }));

  // PUT /api/vehicle-weight/auto-notify-setting
  router.put('/api/vehicle-weight/auto-notify-setting', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const idx = settings.findIndex(s => s.setting_id === 'auto_vw_messaging');
    const update = { setting_id: 'auto_vw_messaging' };
    if ('enabled' in req.body) update.enabled = !!req.body.enabled;
    if ('wa_group_id' in req.body) update.wa_group_id = req.body.wa_group_id;
    if ('wa_group_name' in req.body) update.wa_group_name = req.body.wa_group_name;
    if ('tg_chat_ids' in req.body) update.tg_chat_ids = req.body.tg_chat_ids;
    if (idx >= 0) {
      Object.assign(settings[idx], update);
    } else {
      settings.push(update);
    }
    database.save();
    res.json({ success: true, ...update });
  }));

  // GET /api/vehicle-weight/image/:filename - Serve saved image
  router.get('/api/vehicle-weight/image/:filename', safeAsync(async (req, res) => {
    const fp = path.join(imgDir, req.params.filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ detail: 'Image not found' });
    res.type('image/jpeg').sendFile(fp);
  }));

  // GET /api/vehicle-weight/:entry_id/photos - Get entry photos as base64
  router.get('/api/vehicle-weight/:entry_id/photos', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === req.params.entry_id);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });
    res.json({
      entry_id: entry.id,
      rst_no: entry.rst_no,
      date: entry.date || '',
      vehicle_no: entry.vehicle_no || '',
      party_name: entry.party_name || '',
      farmer_name: entry.farmer_name || '',
      product: entry.product || '',
      trans_type: entry.trans_type || '',
      tot_pkts: entry.tot_pkts || 0,
      first_wt: entry.first_wt || 0,
      first_wt_time: entry.first_wt_time || '',
      second_wt: entry.second_wt || 0,
      second_wt_time: entry.second_wt_time || '',
      net_wt: entry.net_wt || 0,
      remark: entry.remark || '',
      cash_paid: entry.cash_paid || 0,
      diesel_paid: entry.diesel_paid || 0,
      first_wt_front_img: loadImageB64(entry.first_wt_front_img || ''),
      first_wt_side_img: loadImageB64(entry.first_wt_side_img || ''),
      second_wt_front_img: loadImageB64(entry.second_wt_front_img || ''),
      second_wt_side_img: loadImageB64(entry.second_wt_side_img || ''),
    });
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

    // Get VW-specific messaging config
    const appSettings = col('app_settings');
    const vwConfig = appSettings.find(s => s.setting_id === 'auto_vw_messaging') || {};
    const vwWaGroupId = vwConfig.wa_group_id || '';
    const vwTgChatIds = vwConfig.tg_chat_ids || [];

    // ── WhatsApp (to VW group or fallback to default numbers) ──
    try {
      const waSettings = getWaSettings();
      if (waSettings.enabled && waSettings.api_key) {
        if (vwWaGroupId) {
          const r = await sendWaToGroup(waSettings.api_key, vwWaGroupId, text);
          results.whatsapp.push(r);
        } else {
          let nums = waSettings.default_numbers || [];
          if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
          for (const num of nums) {
            if (num) {
              const r = await sendWaMessage(waSettings.api_key, cleanPhone(num.trim(), waSettings.country_code || '91'), text);
              results.whatsapp.push(r);
            }
          }
        }
      }
    } catch (e) { console.error('[VW] WA auto-notify error:', e.message); }

    // ── Telegram (to VW-specific chats or fallback) ──
    try {
      const tgConfig = getTelegramConfig();
      if (tgConfig && tgConfig.bot_token) {
        const botToken = tgConfig.bot_token;
        const chatIds = (vwTgChatIds && vwTgChatIds.length > 0) ? vwTgChatIds : (tgConfig.chat_ids || []);
        if (chatIds.length > 0) {
          for (const item of chatIds) {
            const cid = String(item.chat_id || '').trim();
            if (cid) {
              await telegramApi('sendMessage', botToken, { chat_id: cid, text: text, parse_mode: 'Markdown' });
            }
          }
          if (firstFrontB64) {
            const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(firstFrontB64, 'base64'), `1st Weight Front - RST #${rst}`, `1st_front_rst${rst}.jpg`);
            results.telegram.push(...r);
          }
          if (firstSideB64) {
            const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(firstSideB64, 'base64'), `1st Weight Side - RST #${rst}`, `1st_side_rst${rst}.jpg`);
            results.telegram.push(...r);
          }
          if (secondFrontB64) {
            const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(secondFrontB64, 'base64'), `2nd Weight Front - RST #${rst}`, `2nd_front_rst${rst}.jpg`);
            results.telegram.push(...r);
          }
          if (secondSideB64) {
            const r = await sendPhotoToAll(botToken, chatIds, Buffer.from(secondSideB64, 'base64'), `2nd Weight Side - RST #${rst}`, `2nd_side_rst${rst}.jpg`);
            results.telegram.push(...r);
          }
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

  router.get('/api/vehicle-weight/linked-rst', safeAsync(async (req, res) => {
    const kmsYear = req.query.kms_year || '';
    let entries = col('mill_entries');
    if (kmsYear) entries = entries.filter(e => e.kms_year === kmsYear);
    const linked = [...new Set(entries.map(e => parseInt(e.rst_no)).filter(n => !isNaN(n)))];
    res.json({ linked_rst: linked });
  }));


  router.get('/api/vehicle-weight/pending-count', safeAsync(async (req, res) => {
    const kmsYear = req.query.kms_year || '';
    let vwEntries = col('vehicle_weights').filter(w => w.status === 'completed');
    let meEntries = col('mill_entries');
    if (kmsYear) { vwEntries = vwEntries.filter(w => w.kms_year === kmsYear); meEntries = meEntries.filter(e => e.kms_year === kmsYear); }
    const vwRsts = new Set(vwEntries.map(w => w.rst_no).filter(Boolean));
    const linked = new Set(meEntries.map(e => parseInt(e.rst_no)).filter(n => !isNaN(n)));
    let pendingCount = 0;
    vwRsts.forEach(r => { if (!linked.has(r)) pendingCount++; });
    res.json({ pending_count: pendingCount, total_vw: vwRsts.size, linked: [...vwRsts].filter(r => linked.has(r)).length });
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
    const customFields = branding.custom_fields || [];
    const aboveParts = [], belowParts = [];
    for (const f of customFields) {
      const val = (f.value || '').trim();
      if (!val) continue;
      const lbl = (f.label || '').trim();
      const txt = lbl ? `${lbl}: ${val}` : val;
      if (f.placement === 'above') aboveParts.push(txt);
      else belowParts.push(txt);
    }
    const aboveText = aboveParts.join('  |  ');
    const belowText = belowParts.join('  |  ');

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

      // Custom fields ABOVE company name
      if (aboveText) {
        doc.font(fn).fontSize(7).fillColor('#8B0000').text(aboveText, x, y, { width: PW, align: 'center' });
        y += 3.5 * mm;
      }

      // Company name
      doc.font(fb).fontSize(15).fillColor('#1a1a2e').text(company, x, y, { width: PW, align: 'center' });
      y += 6 * mm;

      // Tagline
      doc.font(fn).fontSize(7.5).fillColor('#888').text(tagline, x, y, { width: PW, align: 'center' });
      y += 4 * mm;

      // Custom fields BELOW tagline
      if (belowText) {
        doc.font(fn).fontSize(7).fillColor('#374151').text(belowText, x, y, { width: PW, align: 'center' });
        y += 3 * mm;
      }

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


  // ── Bulk Export: Excel & PDF ──
  function _filterVwItems(query) {
    let items = col('vehicle_weights');
    if (query.kms_year) items = items.filter(w => w.kms_year === query.kms_year);
    if (query.status) items = items.filter(w => w.status === query.status);
    if (query.date_from) items = items.filter(w => (w.date || '') >= query.date_from);
    if (query.date_to) items = items.filter(w => (w.date || '') <= query.date_to);
    if (query.vehicle_no) items = items.filter(w => (w.vehicle_no || '').toLowerCase().includes(query.vehicle_no.toLowerCase()));
    if (query.party_name) items = items.filter(w => (w.party_name || '').toLowerCase().includes(query.party_name.toLowerCase()));
    if (query.farmer_name) items = items.filter(w => (w.farmer_name || '').toLowerCase().includes(query.farmer_name.toLowerCase()));
    if (query.rst_no) items = items.filter(w => String(w.rst_no) === String(query.rst_no));
    return [...items].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  router.get('/api/vehicle-weight/export/excel', safeAsync(async (req, res) => {
    const ExcelJS = require('exceljs');
    const items = _filterVwItems(req.query);
    const br = database.data.branding || {};
    const company = br.company_name || 'NAVKAR AGRO';
    const tagline = br.tagline || '';
    const cflds = br.custom_fields || [];
    const abParts = [], blParts = [];
    for (const f of cflds) {
      const val = (f.value || '').trim(); if (!val) continue;
      const lbl = (f.label || '').trim();
      const txt = lbl ? `${lbl}: ${val}` : val;
      if (f.placement === 'above') abParts.push(txt); else blParts.push(txt);
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Vehicle Weight');
    let cr = 1;
    if (abParts.length > 0) {
      ws.mergeCells(`A${cr}:M${cr}`);
      ws.getCell(`A${cr}`).value = abParts.join('  |  ');
      ws.getCell(`A${cr}`).font = { bold: true, size: 10, color: { argb: '8B0000' } };
      ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
      cr++;
    }
    ws.mergeCells(`A${cr}:M${cr}`);
    ws.getCell(`A${cr}`).value = `${company} - Vehicle Weight / तौल पर्ची`;
    ws.getCell(`A${cr}`).font = { bold: true, size: 14, color: { argb: '1a1a2e' } };
    ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
    cr++;
    const belowAll = [tagline, ...blParts].filter(Boolean);
    if (belowAll.length > 0) {
      ws.mergeCells(`A${cr}:M${cr}`);
      ws.getCell(`A${cr}`).value = belowAll.join('  |  ');
      ws.getCell(`A${cr}`).font = { size: 9, italic: true, color: { argb: '555555' } };
      ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
      cr++;
    }
    ws.mergeCells(`A${cr}:M${cr}`);
    ws.getCell(`A${cr}`).value = `Date: ${req.query.date_from || 'All'} to ${req.query.date_to || 'All'} | Total: ${items.length}`;
    ws.getCell(`A${cr}`).font = { size: 9, color: { argb: '666666' } };
    ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
    cr++;

    const headers = ['RST', 'Date', 'Vehicle', 'Party', 'Mandi', 'Product', 'Trans', 'Bags', '1st Wt (KG)', '2nd Wt (KG)', 'Net Wt (KG)', 'Cash', 'Diesel'];
    const hdrRowNum = cr + 1;
    const hdrRow = ws.getRow(hdrRowNum);
    headers.forEach((h, i) => {
      const cell = hdrRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a1a2e' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    items.forEach((e, idx) => {
      const row = ws.getRow(hdrRowNum + 1 + idx);
      [e.rst_no, e.date, e.vehicle_no, e.party_name, e.farmer_name, e.product, e.trans_type, e.tot_pkts, e.first_wt || 0, e.second_wt || 0, e.net_wt || 0, e.cash_paid || 0, e.diesel_paid || 0].forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (i >= 8) cell.alignment = { horizontal: 'right' };
      });
    });

    ws.columns.forEach(c => { c.width = 15; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=vehicle_weight.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  }));

  router.get('/api/vehicle-weight/export/pdf', safeAsync(async (req, res) => {
    const PDFDocument = require('pdfkit');
    const items = _filterVwItems(req.query);
    const br = database.data.branding || {};
    const company = br.company_name || 'NAVKAR AGRO';
    const pdfTagline = br.tagline || '';
    const cflds2 = br.custom_fields || [];
    const abParts2 = [], blParts2 = [];
    for (const f of cflds2) {
      const val = (f.value || '').trim(); if (!val) continue;
      const lbl = (f.label || '').trim();
      const txt = lbl ? `${lbl}: ${val}` : val;
      if (f.placement === 'above') abParts2.push(txt); else blParts2.push(txt);
    }

    const fontDir2 = path.join(__dirname, '..', 'fonts');
    const hasFS2 = fs.existsSync(path.join(fontDir2, 'FreeSans.ttf'));
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    if (hasFS2) {
      doc.registerFont('ExFont', path.join(fontDir2, 'FreeSans.ttf'));
      doc.registerFont('ExFontBold', path.join(fontDir2, 'FreeSansBold.ttf'));
    }
    const efn = hasFS2 ? 'ExFont' : 'Helvetica';
    const efb = hasFS2 ? 'ExFontBold' : 'Helvetica-Bold';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=vehicle_weight.pdf`);
    doc.pipe(res);

    if (abParts2.length > 0) doc.fontSize(8).font(efb).fillColor('#8B0000').text(abParts2.join('  |  '), { align: 'center' });
    doc.fontSize(16).font(efb).fillColor('#1a1a2e').text(`${company} - Vehicle Weight`, { align: 'center' });
    if (pdfTagline) doc.fontSize(8).font(efn).fillColor('#888').text(pdfTagline, { align: 'center' });
    if (blParts2.length > 0) doc.fontSize(8).font(efn).fillColor('#374151').text(blParts2.join('  |  '), { align: 'center' });
    doc.fontSize(8).font(efn).fillColor('#000').text(`Date: ${req.query.date_from || 'All'} to ${req.query.date_to || 'All'} | Total: ${items.length}`, { align: 'center' });
    doc.moveDown(0.5);

    const headers = ['RST', 'Date', 'Vehicle', 'Party', 'Mandi', 'Product', 'Trans', 'Bags', '1st Wt', '2nd Wt', 'Net Wt', 'Cash', 'Diesel'];
    const colW = [30, 55, 65, 70, 55, 60, 55, 30, 50, 50, 50, 45, 45];
    let x = 30, y = doc.y;

    // Header row
    doc.fontSize(7).font(efb);
    headers.forEach((h, i) => { doc.text(h, x, y, { width: colW[i], align: 'center' }); x += colW[i]; });
    y += 15; doc.moveTo(30, y).lineTo(790, y).stroke();

    // Data rows
    doc.font(efn).fontSize(7);
    items.forEach(e => {
      if (y > 540) { doc.addPage(); y = 30; }
      x = 30;
      const vals = [e.rst_no, e.date, e.vehicle_no, e.party_name, e.farmer_name, e.product, e.trans_type, e.tot_pkts,
        (e.first_wt || 0).toLocaleString(), (e.second_wt || 0).toLocaleString(), (e.net_wt || 0).toLocaleString(),
        e.cash_paid ? Number(e.cash_paid).toLocaleString() : '-', e.diesel_paid ? Number(e.diesel_paid).toLocaleString() : '-'];
      vals.forEach((v, i) => { doc.text(String(v || ''), x, y, { width: colW[i], align: i >= 7 ? 'right' : 'left' }); x += colW[i]; });
      y += 12;
    });

    doc.end();
  }));

  // ── Image Cleanup Settings ──

  function cleanupOldImages(days) {
    if (days <= 0) return 0;
    const cutoff = Date.now() - (days * 86400000);
    let deleted = 0;
    try {
      const files = fs.readdirSync(imgDir);
      for (const fname of files) {
        const fp = path.join(imgDir, fname);
        const stat = fs.statSync(fp);
        if (stat.isFile() && stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          deleted++;
        }
      }
      if (deleted > 0) console.log(`[VW] Image cleanup: ${deleted} files older than ${days} days deleted`);
    } catch (e) { console.error('[VW] Image cleanup error:', e.message); }
    return deleted;
  }

  // Run cleanup on startup
  try {
    const settings = col('app_settings');
    const cleanupDoc = settings.find(s => s.setting_id === 'image_cleanup');
    const days = cleanupDoc ? (cleanupDoc.days || 0) : 0;
    if (days > 0) cleanupOldImages(days);
  } catch (e) { /* ignore */ }

  // Periodic cleanup (every 24 hours)
  setInterval(() => {
    try {
      const settings = col('app_settings');
      const cleanupDoc = settings.find(s => s.setting_id === 'image_cleanup');
      const days = cleanupDoc ? (cleanupDoc.days || 0) : 0;
      if (days > 0) cleanupOldImages(days);
    } catch (e) { /* ignore */ }
  }, 86400000);

  router.get('/api/settings/image-cleanup', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const doc = settings.find(s => s.setting_id === 'image_cleanup');
    const days = doc ? (doc.days || 0) : 0;
    res.json({ days, enabled: days > 0 });
  }));

  router.put('/api/settings/image-cleanup', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    let days = parseInt(req.body.days || 0) || 0;
    if (days < 0) days = 0;
    const idx = settings.findIndex(s => s.setting_id === 'image_cleanup');
    if (idx >= 0) {
      settings[idx].days = days;
    } else {
      settings.push({ setting_id: 'image_cleanup', days });
    }
    database.save();
    res.json({ success: true, days, enabled: days > 0 });
  }));

  router.post('/api/settings/image-cleanup/run', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const doc = settings.find(s => s.setting_id === 'image_cleanup');
    const days = doc ? (doc.days || 0) : 0;
    if (days <= 0) return res.json({ success: false, message: 'Cleanup disabled (days = 0)', deleted: 0 });
    const deleted = cleanupOldImages(days);
    res.json({ success: true, message: `${deleted} purani images delete hui`, deleted });
  }));

  return router;
};
