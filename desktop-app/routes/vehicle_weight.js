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
const { waHostname, waPathPrefix } = require('./wa_helper');
const { fmtDate, createPdfDoc, registerFonts, F, autoF, addPdfHeader, applyConsolidatedExcelPolish} = require('./pdf_helpers');
const router = express.Router();

module.exports = function(database) {

  // Image storage directory
  const imgDir = path.join(database.dataFolder || '.', 'vw_images');
  try { if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true }); } catch(e) { console.error('[VW] Cannot create vw_images dir:', e.message); }

  function saveImage(entryId, tag, b64data) {
    try {
      if (!b64data) return '';
      // Handle Buffer-like objects {type:'Buffer', data:[...]}
      if (typeof b64data === 'object') {
        if (b64data.type === 'Buffer' && Array.isArray(b64data.data)) {
          b64data = Buffer.from(b64data.data).toString('base64');
        } else {
          console.warn('[VW] saveImage: received object type, skipping');
          return '';
        }
      }
      if (typeof b64data !== 'string') {
        console.warn('[VW] saveImage: received non-string type:', typeof b64data);
        return '';
      }
      // Strip data URL prefix if present (data:image/jpeg;base64,...)
      let raw = b64data;
      if (raw.startsWith('data:')) {
        const commaIdx = raw.indexOf(',');
        if (commaIdx > 0) raw = raw.substring(commaIdx + 1);
      }
      if (!raw || raw.length < 100) return ''; // too small = invalid
      const filename = `${entryId}_${tag}.jpg`;
      fs.writeFileSync(path.join(imgDir, filename), Buffer.from(raw, 'base64'));
      return filename;
    } catch (e) {
      console.error('[VW] saveImage error:', e.message);
      return '';
    }
  }

  function loadImageB64(filename) {
    if (!filename) return '';
    const fp = path.join(imgDir, filename);
    if (fs.existsSync(fp)) return fs.readFileSync(fp).toString('base64');
    return '';
  }

  // Upload image to tmpfiles.org and return public download URL
  function uploadImageForWa(imageBuffer, filename) {
    return new Promise((resolve) => {
      const boundary = '----WaUpload' + Date.now().toString(36);
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([head, imageBuffer, tail]);
      const options = {
        hostname: 'tmpfiles.org', path: '/api/v1/upload', method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.status === 'success' && result.data && result.data.url) {
              // Convert http://tmpfiles.org/12345/file.jpg → https://tmpfiles.org/dl/12345/file.jpg
              const dlUrl = result.data.url.replace('://tmpfiles.org/', '://tmpfiles.org/dl/').replace('http://', 'https://');
              resolve(dlUrl);
            } else { resolve(''); }
          } catch (_e) { resolve(''); }
        });
      });
      req.on('error', () => resolve(''));
      req.setTimeout(30000, () => { req.destroy(); resolve(''); });
      req.write(body);
      req.end();
    });
  }

  // Upload file to tmpfiles.org and return public download URL
  function uploadFileForWa(fileBuffer, filename, contentType) {
    return new Promise((resolve) => {
      const boundary = '----WaUpload' + Date.now().toString(36);
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType || 'application/octet-stream'}\r\n\r\n`
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([head, fileBuffer, tail]);
      const options = {
        hostname: 'tmpfiles.org', path: '/api/v1/upload', method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            console.log('[VW] tmpfiles upload resp:', JSON.stringify(result).substring(0, 200));
            if (result.status === 'success' && result.data && result.data.url) {
              const dlUrl = result.data.url.replace('://tmpfiles.org/', '://tmpfiles.org/dl/').replace('http://', 'https://');
              resolve(dlUrl);
            } else { resolve(''); }
          } catch (_e) { resolve(''); }
        });
      });
      req.on('error', (e) => { console.error('[VW] tmpfiles upload error:', e.message); resolve(''); });
      req.setTimeout(30000, () => { req.destroy(); resolve(''); });
      req.write(body);
      req.end();
    });
  }

  function col(name) {
    if (!database.data[name]) database.data[name] = [];
    return database.data[name];
  }

  // ── Helper: Next RST number — v104.44.36: max+1 with outlier cap (RST > 9999 = junk) ──
  function getNextRst(kmsYear) {
    const SANE_CAP = 9999;
    const used = new Set();
    const cols = ['vehicle_weights', 'sale_vouchers', 'purchase_vouchers',
                  'private_paddy', 'entries', 'bp_sale_register'];
    for (const c of cols) {
      const items = col(c) || [];
      for (const d of items) {
        if (kmsYear && d.kms_year !== kmsYear) continue;
        const n = parseInt(String(d.rst_no || '').trim(), 10);
        if (!isNaN(n) && n > 0 && n <= SANE_CAP) used.add(n);
      }
    }
    return used.size ? Math.max(...used) + 1 : 1;
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

  function sendWaMessage(apiKey, phone, text, mediaUrl) {
    return new Promise((resolve) => {
      const postData = `phonenumber=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}${mediaUrl ? '&url=' + encodeURIComponent(mediaUrl) : ''}`;
      const options = {
        hostname: waHostname((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {}), path: `${waPathPrefix((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {})}/sendMessage`, method: 'POST',
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
        hostname: waHostname((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {}), path: `${waPathPrefix((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {})}/sendGroup`, method: 'POST',
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
      `Date: ${fmtDate(entry.date) || ''}\n` +
      `Vehicle: ${entry.vehicle_no || ''}\n` +
      `Trans: ${entry.trans_type || ''}\n` +
      `Party: ${entry.party_name || ''}\n`;
    if (farmerMandi) text += `Source/Mandi: ${farmerMandi}\n`;
    text += `Product: ${entry.product || ''}\n` +
      `Bags: ${pkts > 0 ? pkts : '-'}\n` +
      `───────────────\n` +
      `Gross Wt: ${Number(entry.gross_wt || entry.first_wt || 0).toLocaleString()} KG\n` +
      `Tare Wt: ${Number(entry.tare_wt || entry.second_wt || 0).toLocaleString()} KG\n` +
      `*Net Wt: ${Number(entry.net_wt || 0).toLocaleString()} KG*\n` +
      `───────────────\n`;
    const cash = entry.cash_paid || 0;
    const diesel = entry.diesel_paid || 0;
    const gIssued = parseFloat(entry.g_issued || 0) || 0;
    if (gIssued > 0) text += `G.Issued: ${gIssued.toLocaleString()}\n`;
    if (entry.tp_no) text += `TP: ${entry.tp_no}\n`;
    const tpWt = parseFloat(entry.tp_weight || 0) || 0;
    if (tpWt > 0) text += `TP Weight: ${tpWt} Q\n`;
    if (entry.remark) text += `Remark: ${entry.remark}\n`;
    if (cash > 0) text += `Cash Paid: \u20b9${Number(cash).toLocaleString()}\n`;
    if (diesel > 0) text += `Diesel Paid: \u20b9${Number(diesel).toLocaleString()}\n`;
    if (gIssued > 0 || cash > 0 || diesel > 0) text += `───────────────\n`;
    return text;
  }

  // ========================================
  // ROUTES
  // ========================================

  // GET /api/vehicle-weight - List weights
  router.get('/api/vehicle-weight', safeAsync(async (req, res) => {
    try {
      const { kms_year, status, date_from, date_to, vehicle_no, party_name, farmer_name, rst_no, trans_type } = req.query;
      let items = col('vehicle_weights');
      if (kms_year) items = items.filter(w => w.kms_year === kms_year);
      if (status) items = items.filter(w => w.status === status);
      const hasSearch = vehicle_no || party_name || farmer_name || rst_no;
      if (!hasSearch) {
        if (date_from) items = items.filter(w => (w.date || '') >= date_from);
        if (date_to) items = items.filter(w => (w.date || '') <= date_to);
      }
      if (vehicle_no) items = items.filter(w => (w.vehicle_no || '').toLowerCase().includes(vehicle_no.toLowerCase()));
      if (party_name) items = items.filter(w => (w.party_name || '').toLowerCase().includes(party_name.toLowerCase()));
      if (farmer_name) items = items.filter(w => (w.farmer_name || '').toLowerCase().includes(farmer_name.toLowerCase()));
      if (rst_no) items = items.filter(w => String(w.rst_no) === String(rst_no));
      // trans_type filter: "sale" → matches dispatch/sale; "purchase" → receive/purchase; otherwise exact match.
      if (trans_type) {
        const tt = String(trans_type).toLowerCase().trim();
        if (tt === 'sale') items = items.filter(w => /sale|dispatch/i.test(w.trans_type || ''));
        else if (tt === 'purchase') items = items.filter(w => /purchase|receive/i.test(w.trans_type || ''));
        else items = items.filter(w => (w.trans_type || '') === trans_type);
      }
      items = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b.rst_no) || 0) - (Number(a.rst_no) || 0));
      const total = items.length;
      const pageSize = parseInt(req.query.page_size) || 200;
      const page = parseInt(req.query.page) || 1;
      const skip = (page - 1) * pageSize;
      items = items.slice(skip, skip + pageSize);
      res.json({ entries: items, count: items.length, total, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(total / pageSize)) });
    } catch (err) {
      console.error('[VW] GET /api/vehicle-weight error:', err.message, err.stack);
      res.status(500).json({ detail: err.message, stack: (err.stack || '').slice(0, 500) });
    }
  }));

  // GET /api/vehicle-weight/pending
  router.get('/api/vehicle-weight/pending', safeAsync(async (req, res) => {
    const { kms_year } = req.query;
    let items = col('vehicle_weights').filter(w => w.status === 'pending');
    if (kms_year) items = items.filter(w => w.kms_year === kms_year);
    items = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b.rst_no) || 0) - (Number(a.rst_no) || 0));
    res.json({ pending: items, count: items.length });
  }));

  // GET /api/vehicle-weight/next-rst
  router.get('/api/vehicle-weight/next-rst', safeAsync(async (req, res) => {
    const rst = getNextRst(req.query.kms_year || '');
    res.json({ rst_no: rst });
  }));

  // GET /api/settings/vw-date-lock
  router.get('/api/settings/vw-date-lock', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const doc = settings.find(s => s.setting_id === 'vw_date_lock');
    res.json({ locked: doc ? !!doc.locked : false });
  }));

  // PUT /api/settings/vw-date-lock
  router.put('/api/settings/vw-date-lock', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const idx = settings.findIndex(s => s.setting_id === 'vw_date_lock');
    const update = { setting_id: 'vw_date_lock', locked: !!req.body.locked };
    if (idx >= 0) Object.assign(settings[idx], update);
    else settings.push(update);
    database.save();
    res.json({ success: true, locked: update.locked });
  }));

  // GET /api/vehicle-weight/rst-edit-setting
  router.get('/api/vehicle-weight/rst-edit-setting', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const doc = settings.find(s => s.setting_id === 'manual_rst_edit');
    res.json({ enabled: doc ? !!doc.enabled : false });
  }));

  // PUT /api/vehicle-weight/rst-edit-setting
  router.put('/api/vehicle-weight/rst-edit-setting', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const idx = settings.findIndex(s => s.setting_id === 'manual_rst_edit');
    const update = { setting_id: 'manual_rst_edit', enabled: !!req.body.enabled };
    if (idx >= 0) Object.assign(settings[idx], update);
    else settings.push(update);
    database.save();
    res.json({ success: true, enabled: update.enabled });
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
      gross_wt: entry.gross_wt || 0,
      tare_wt: entry.tare_wt || 0,
      remark: entry.remark || '',
      cash_paid: entry.cash_paid || 0,
      diesel_paid: entry.diesel_paid || 0,
      g_issued: entry.g_issued || 0,
      tp_no: entry.tp_no || '',
      tp_weight: entry.tp_weight || 0,
      first_wt_front_img: loadImageB64(entry.first_wt_front_img || ''),
      first_wt_side_img: loadImageB64(entry.first_wt_side_img || ''),
      second_wt_front_img: loadImageB64(entry.second_wt_front_img || ''),
      second_wt_side_img: loadImageB64(entry.second_wt_side_img || ''),
    });
  }));

  // Generate Weight Report PDF buffer using PDFKit
  function generateWeightPdfBuffer(entry) {
    return new Promise((resolve, reject) => {
      try {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', margin: 20 });
        registerFonts(doc);
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const rst = entry.rst_no || '?';
        const firstWt = parseFloat(entry.first_wt || 0);
        const secondWt = parseFloat(entry.second_wt || 0);
        const grossWt = parseFloat(entry.gross_wt || Math.max(firstWt, secondWt) || 0);
        const tareWt = parseFloat(entry.tare_wt || Math.min(firstWt, secondWt) || 0);
        const netWt = parseFloat(entry.net_wt || 0);
        const bags = parseInt(entry.tot_pkts || 0);
        const avgWt = (netWt && bags > 0) ? (netWt / bags).toFixed(2) : '0.00';
        const cash = parseFloat(entry.cash_paid || 0);
        const diesel = parseFloat(entry.diesel_paid || 0);
        const gIssued = parseFloat(entry.g_issued || 0);
        const tpNo = entry.tp_no || '';
        const tpWt = entry.tp_weight || entry.tp_wt || '';
        const remark = entry.remark || '';

        // Get branding from settings + attach watermark
        const branding = { ...(database.data.branding || {}) };
        const wmSetting = (database.data.app_settings || []).find(s => s.setting_id === 'watermark');
        if (wmSetting) branding._watermark = wmSetting;

        function fmtIST(ts) {
          if (!ts) return '';
          try { return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }); }
          catch(e) { return ts.substring(0, 8); }
        }

        // ── Branding Header (from settings with custom fields) ──
        addPdfHeader(doc, `WEIGHT REPORT — RST #${rst}`, branding);

        const W = doc.page.width;
        const LM = 20;
        const PW = W - 40;
        let y = doc.y + 4;

        // ── Info Table (grid) ──
        const colW = PW / 4;
        const rowH = 18;

        function drawGridRow(lbl1, val1, lbl2, val2, alt) {
          if (alt) doc.rect(LM, y, PW, rowH).fill('#f0f8ff');
          doc.strokeColor('#999').lineWidth(0.3).rect(LM, y, PW, rowH).stroke();
          doc.moveTo(LM + colW, y).lineTo(LM + colW, y + rowH).stroke();
          doc.moveTo(LM + 2 * colW, y).lineTo(LM + 2 * colW, y + rowH).stroke();
          doc.moveTo(LM + 3 * colW, y).lineTo(LM + 3 * colW, y + rowH).stroke();
          const ty = y + 5;
          doc.font(autoF(lbl1, 'normal')).fontSize(7.5).fillColor('#555').text(lbl1, LM + 3, ty, { width: colW - 6, lineBreak: false });
          doc.font(autoF(val1, 'bold')).fontSize(8.5).fillColor('#000').text(String(val1).substring(0, 26), LM + colW + 3, ty, { width: colW - 6, lineBreak: false });
          doc.font(autoF(lbl2, 'normal')).fontSize(7.5).fillColor('#555').text(lbl2, LM + 2 * colW + 3, ty, { width: colW - 6, lineBreak: false });
          doc.font(autoF(val2, 'bold')).fontSize(8.5).fillColor('#000').text(String(val2).substring(0, 26), LM + 3 * colW + 3, ty, { width: colW - 6, lineBreak: false });
          y += rowH;
        }

        drawGridRow('RST No.', `#${rst}`, 'Date / दिनांक', fmtDate(entry.date || ''), true);
        drawGridRow('Vehicle / गाड़ी', entry.vehicle_no || '-', 'Trans Type', entry.trans_type || '-', false);
        const _isSaleSlip = String(entry.trans_type || '').toLowerCase().match(/sale|dispatch/);
        drawGridRow('Party / पार्टी', entry.party_name || '-', _isSaleSlip ? 'Destination' : 'Source/Mandi', entry.farmer_name || '-', true);
        drawGridRow('Product / माल', entry.product || '-', 'Bags / बोरे', bags ? String(bags) : '-', false);
        // Conditional rows
        if (gIssued || tpNo) drawGridRow('G.Issued', gIssued ? String(Math.round(gIssued)) : '-', 'TP No.', tpNo || '-', true);
        if (tpWt || remark) drawGridRow('TP Weight', tpWt ? `${tpWt} Q` : '-', 'Remark', remark || '-', false);

        y += 4;

        // ── Weight Bars + Compact Photos ──
        function drawWeightBar(label, wt, timeStr, frontKey, sideKey, bgColor) {
          doc.rect(LM, y, PW, 18).fill(bgColor);
          doc.font(autoF(label, 'bold')).fontSize(9).fillColor('#fff').text(label, LM + 4, y + 4, { width: PW * 0.35, lineBreak: false });
          doc.font(F('bold')).fontSize(10).fillColor('#fff').text(`${Number(wt).toLocaleString()} KG`, LM + PW * 0.35, y + 3, { width: PW * 0.3, align: 'center', lineBreak: false });
          doc.font(F('normal')).fontSize(7.5).fillColor('#ddd').text(`Time: ${fmtIST(timeStr)}`, LM + PW * 0.65, y + 5, { width: PW * 0.33, align: 'right', lineBreak: false });
          y += 18;

          const imgW = PW / 2 - 4;
          const imgH = 80;
          const frontB64 = loadImageB64(entry[frontKey] || '');
          const sideB64 = loadImageB64(entry[sideKey] || '');
          if (frontB64 || sideB64) {
            if (frontB64 && sideB64) {
              // Both images — center the pair
              const totalW = imgW * 2 + 8;
              const startX = LM + (PW - totalW) / 2;
              try { doc.image(Buffer.from(frontB64, 'base64'), startX, y + 1, { width: imgW, height: imgH, fit: [imgW, imgH] }); } catch(e) {}
              try { doc.image(Buffer.from(sideB64, 'base64'), startX + imgW + 8, y + 1, { width: imgW, height: imgH, fit: [imgW, imgH] }); } catch(e) {}
            } else {
              // Single image — center it
              const singleX = LM + (PW - imgW) / 2;
              const b64 = frontB64 || sideB64;
              try { doc.image(Buffer.from(b64, 'base64'), singleX, y + 1, { width: imgW, height: imgH, fit: [imgW, imgH] }); } catch(e) {}
            }
            y += imgH + 4;
          }
          y += 2;
        }

        drawWeightBar('1st Weight / पहला वजन', firstWt, entry.first_wt_time || '', 'first_wt_front_img', 'first_wt_side_img', '#1a5276');
        if (secondWt > 0) drawWeightBar('2nd Weight / दूसरा वजन', secondWt, entry.second_wt_time || '', 'second_wt_front_img', 'second_wt_side_img', '#34495e');

        y += 4;

        // ── Summary Boxes ──
        const items = [
          { label: 'GROSS\nकुल', value: `${Number(grossWt).toLocaleString()} KG`, bg: '#dce6f0', fg: '#1a5276' },
          { label: 'TARE\nखाली', value: `${Number(tareWt).toLocaleString()} KG`, bg: '#f0e8dc', fg: '#6d4c1d' },
          { label: 'NET\nशुद्ध', value: `${Number(netWt).toLocaleString()} KG`, bg: '#d5f5d5', fg: '#1b7a30' },
          { label: 'AVG/BAG\nप्रति बोरा', value: `${avgWt} KG`, bg: '#e3f2fd', fg: '#1565c0' },
        ];
        if (cash > 0) items.push({ label: 'CASH\nनकद', value: `₹${Number(cash).toLocaleString()}`, bg: '#fff8e1', fg: '#e65100' });
        if (diesel > 0) items.push({ label: 'DIESEL\nडीजल', value: `₹${Number(diesel).toLocaleString()}`, bg: '#fce4d6', fg: '#bf360c' });

        const boxW = PW / items.length;
        const boxH = 36;
        items.forEach((b, i) => {
          const bx = LM + i * boxW;
          doc.rect(bx, y, boxW, boxH).fill(b.bg);
          doc.strokeColor('#ccc').lineWidth(0.3).rect(bx, y, boxW, boxH).stroke();
          doc.font(autoF(b.label, 'normal')).fontSize(5.5).fillColor(b.fg).text(b.label, bx + 2, y + 3, { width: boxW - 4, align: 'center' });
          doc.font(F('bold')).fontSize(10).fillColor(b.fg).text(b.value, bx + 2, y + 20, { width: boxW - 4, align: 'center', lineBreak: false });
        });

        doc.end();
      } catch (e) { reject(e); }
    });
  }

  // Send PDF as base64 document via 360Messenger
  function sendWaGroupDoc(apiKey, groupId, caption, pdfB64, filename) {
    return new Promise((resolve) => {
      const boundary = '----WaPdf' + Date.now().toString(36);
      const parts = [];
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="groupId"\r\n\r\n${groupId}`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\n${caption}`);
      const pdfBuf = Buffer.from(pdfB64, 'base64');
      const fileHead = `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`;
      const fileTail = `\r\n--${boundary}--\r\n`;
      const textParts = parts.join('\r\n') + '\r\n';
      const body = Buffer.concat([Buffer.from(textParts), Buffer.from(fileHead), pdfBuf, Buffer.from(fileTail)]);
      const options = {
        hostname: waHostname((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {}), path: `${waPathPrefix((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {})}/sendGroup`, method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            console.log('[VW] WA group doc resp:', res.statusCode, data.substring(0, 200));
            resolve({ success: result.success || res.statusCode === 201, data: result });
          } catch (e) { console.log('[VW] WA group doc raw:', data.substring(0, 200)); resolve({ success: false, error: data }); }
        });
      });
      req.on('error', e => { console.error('[VW] WA group doc error:', e.message); resolve({ success: false, error: e.message }); });
      req.write(body);
      req.end();
    });
  }

  function sendWaNumDoc(apiKey, phone, caption, pdfB64, filename) {
    return new Promise((resolve) => {
      const boundary = '----WaPdf' + Date.now().toString(36);
      const parts = [];
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="phonenumber"\r\n\r\n${phone}`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\n${caption}`);
      const pdfBuf = Buffer.from(pdfB64, 'base64');
      const fileHead = `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`;
      const fileTail = `\r\n--${boundary}--\r\n`;
      const textParts = parts.join('\r\n') + '\r\n';
      const body = Buffer.concat([Buffer.from(textParts), Buffer.from(fileHead), pdfBuf, Buffer.from(fileTail)]);
      const options = {
        hostname: waHostname((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {}), path: `${waPathPrefix((database.data.app_settings || []).find(s => s.setting_id === 'whatsapp_config') || {})}/sendMessage`, method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length }
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
      req.write(body);
      req.end();
    });
  }

  // POST /api/vehicle-weight/auto-notify - Auto send weight PDF to WhatsApp & Telegram
  router.post('/api/vehicle-weight/auto-notify', safeAsync(async (req, res) => {
    const entryId = req.body.entry_id || '';
    const weightType = req.body.weight_type || '1st';

    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const rst = entry.rst_no || '?';
    const caption = `*${weightType} Weight Report - RST #${rst}*`;
    const results = { whatsapp: [], telegram: [] };

    const appSettings = col('app_settings');
    const vwConfig = appSettings.find(s => s.setting_id === 'auto_vw_messaging') || {};
    const vwWaGroupId = vwConfig.wa_group_id || '';
    const vwTgChatIds = vwConfig.tg_chat_ids || [];

    // Step 1: Generate PDF
    let pdfBuffer = null;
    try {
      pdfBuffer = await generateWeightPdfBuffer(entry);
      console.log(`[VW] PDF generated: ${pdfBuffer.length} bytes`);
    } catch (e) { console.error('[VW] PDF gen error:', e.message); }

    // Step 2: Upload PDF to tmpfiles.org for public URL
    let pdfUrl = '';
    if (pdfBuffer) {
      try {
        pdfUrl = await uploadFileForWa(pdfBuffer, `WeightReport_RST${rst}.pdf`, 'application/pdf');
        console.log(`[VW] PDF uploaded: ${pdfUrl}`);
      } catch (e) { console.error('[VW] PDF upload error:', e.message); }
    }

    // Step 3: WhatsApp - send caption + PDF URL
    try {
      const waSettings = getWaSettings();
      if (waSettings.enabled && waSettings.api_key) {
        if (vwWaGroupId) {
          // Send text + PDF URL to group
          const r = await sendWaToGroup(waSettings.api_key, vwWaGroupId, caption, pdfUrl || undefined);
          results.whatsapp.push(r);
        } else {
          let nums = waSettings.default_numbers || [];
          if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
          for (const num of nums) {
            if (num) {
              const r = await sendWaMessage(waSettings.api_key, cleanPhone(num.trim(), waSettings.country_code || '91'), caption, pdfUrl || undefined);
              results.whatsapp.push(r);
            }
          }
        }
      }
    } catch (e) { console.error('[VW] WA auto-notify error:', e.message); }

    // Step 4: Telegram - send PDF as document
    try {
      const tgConfig = getTelegramConfig();
      if (tgConfig && tgConfig.bot_token && pdfBuffer) {
        const botToken = tgConfig.bot_token;
        const chatIds = (vwTgChatIds && vwTgChatIds.length > 0) ? vwTgChatIds : (tgConfig.chat_ids || []);
        const FormData = require('form-data');
        const axios = require('axios');
        for (const item of chatIds) {
          const cid = String(item.chat_id || '').trim();
          if (cid) {
            try {
              const form = new FormData();
              form.append('chat_id', cid);
              form.append('caption', caption.replace(/\*/g, ''));
              form.append('document', pdfBuffer, { filename: `WeightReport_RST${rst}.pdf`, contentType: 'application/pdf' });
              await axios.post(`https://api.telegram.org/bot${botToken}/sendDocument`, form, { headers: form.getHeaders(), timeout: 30000 });
              results.telegram.push({ ok: true });
            } catch (te) { console.error('[VW] TG send doc error:', te.message); }
          }
        }
      }
    } catch (e) { console.error('[VW] Telegram auto-notify error:', e.message); }

    const waSent = results.whatsapp.filter(r => r.success).length;
    const tgSent = results.telegram.filter(r => r.ok).length;
    res.json({ success: true, message: `WA: ${waSent} sent, TG: ${tgSent} sent`, results });
  }));

  // GET /api/vehicle-weight/by-rst/:rst_no - Lookup by RST (used by Entries form auto-fill)
  // Query params:
  //   kms_year — optional financial year filter
  //   expected_context — "sale" | "purchase" (optional). If provided and trans_type
  //   does not match, returns 409 conflict so caller can warn the user instead of
  //   silently pulling the wrong RST data.
  router.get('/api/vehicle-weight/by-rst/:rst_no', safeAsync(async (req, res) => {
    const rstNo = parseInt(req.params.rst_no);
    const kmsYear = req.query.kms_year || '';
    const expected = (req.query.expected_context || '').toLowerCase();
    const weights = col('vehicle_weights');
    const entry = kmsYear
      ? weights.find(w => w.rst_no === rstNo && w.kms_year === kmsYear)
      : weights.find(w => w.rst_no === rstNo);
    if (!entry) return res.status(404).json({ detail: 'RST not found in Vehicle Weight' });

    const tt = String(entry.trans_type || '').toLowerCase();
    const isPurchase = tt.includes('receive') || tt.includes('purchase');
    const isSale = tt.includes('issue') || tt.includes('sale');
    const context = isPurchase ? 'purchase' : (isSale ? 'sale' : 'unknown');

    if (expected && context !== 'unknown' && expected !== context) {
      return res.status(409).json({
        detail: `Ye RST Number ${context === 'purchase' ? 'Purchase' : 'Sale'} ka hai`,
        actual_context: context,
        expected_context: expected,
        trans_type: entry.trans_type || '',
        rst_no: rstNo,
      });
    }
    res.json({ success: true, entry, context });
  }));

  router.get('/api/vehicle-weight/linked-rst', safeAsync(async (req, res) => {
    const kmsYear = req.query.kms_year || '';
    let entries = col('entries');
    if (kmsYear) entries = entries.filter(e => e.kms_year === kmsYear);
    const linked = [...new Set(entries.map(e => parseInt(e.rst_no)).filter(n => !isNaN(n)))];
    res.json({ linked_rst: linked });
  }));

  router.get('/api/vehicle-weight/linked-rst-sale', safeAsync(async (req, res) => {
    const kmsYear = req.query.kms_year || '';
    let dels = col('dc_deliveries');
    if (kmsYear) dels = dels.filter(d => d.kms_year === kmsYear);
    const linked = new Set();
    dels.forEach(d => {
      const raw = (d.rst_no || '').toString().trim();
      if (!raw) return;
      raw.split('/').forEach(p => {
        const n = parseInt(p.trim());
        if (!isNaN(n)) linked.add(n);
      });
    });
    res.json({ linked_rst: [...linked] });
  }));

  router.get('/api/vehicle-weight/linked-rst-bp-sale', safeAsync(async (req, res) => {
    // RSTs from BP Sale Register linked to Vehicle Weight Sale entries
    const kmsYear = req.query.kms_year || '';
    let sales = col('bp_sale_register');
    if (kmsYear) sales = sales.filter(s => s.kms_year === kmsYear);
    const linked = new Set();
    sales.forEach(s => {
      const raw = (s.rst_no === undefined || s.rst_no === null) ? '' : String(s.rst_no).trim();
      if (!raw) return;
      raw.split('/').forEach(p => {
        const n = parseInt(p.trim());
        if (!isNaN(n)) linked.add(n);
      });
    });
    res.json({ linked_rst: [...linked] });
  }));


  router.get('/api/vehicle-weight/pending-count', safeAsync(async (req, res) => {
    const kmsYear = req.query.kms_year || '';
    let vwEntries = col('vehicle_weights').filter(w => w.status === 'completed');
    let meEntries = col('entries');
    if (kmsYear) { vwEntries = vwEntries.filter(w => w.kms_year === kmsYear); meEntries = meEntries.filter(e => e.kms_year === kmsYear); }
    const vwRsts = new Set(vwEntries.map(w => { const n = parseInt(w.rst_no); return isNaN(n) ? null : n; }).filter(n => n !== null));
    const linked = new Set(meEntries.map(e => parseInt(e.rst_no)).filter(n => !isNaN(n)));
    let pendingCount = 0;
    vwRsts.forEach(r => { if (!linked.has(r)) pendingCount++; });
    res.json({ pending_count: pendingCount, total_vw: vwRsts.size, linked: [...vwRsts].filter(r => linked.has(r)).length });
  }));


  // POST /api/vehicle-weight/send-manual - Manual send weight text
  router.post('/api/vehicle-weight/send-manual', safeAsync(async (req, res) => {
    const entryId = req.body.entry_id || '';
    const sendToNumbers = req.body.send_to_numbers || false;
    const sendToGroup = req.body.send_to_group || false;

    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const rst = entry.rst_no || '?';
    const caption = `*Weight Report - RST #${rst}*`;
    const results = { whatsapp: [], telegram: [] };

    // WhatsApp - text only (desktop = local, no public URL)
    try {
      const waSettings = getWaSettings();
      if (waSettings.enabled && waSettings.api_key) {
        if (sendToNumbers) {
          let nums = waSettings.default_numbers || [];
          if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
          for (const num of nums) {
            if (num) {
              const r = await sendWaMessage(waSettings.api_key, cleanPhone(num.trim(), waSettings.country_code || '91'), caption);
              results.whatsapp.push({ to: num, success: r.success || false });
            }
          }
        }
        if (sendToGroup) {
          const groupId = (waSettings.group_id || '').trim();
          if (groupId) {
            const r = await sendWaToGroup(waSettings.api_key, groupId, caption);
            results.whatsapp.push({ to: 'group', success: r.success || false });
          }
        }
      }
    } catch (e) { console.error('[VW] WA manual send error:', e.message); }

    const waSent = results.whatsapp.filter(r => r.success).length;
    res.json({ success: true, message: `WA: ${waSent} sent`, results });
  }));

  // POST /api/vehicle-weight - Create new entry with first weight
  // ============ Bag Stock Sync (VW Sale → gunny_bags 'out') ============
  function _isVwSale(transType) {
    const t = (transType || '').toLowerCase();
    return t.includes('sale') || t.includes('dispatch') || t.includes('sell');
  }

  function syncSaleBagOut(vwEntry, username) {
    const rstNo = vwEntry.rst_no;
    if (rstNo == null) return;
    const ref = `vw_sale_bag:${rstNo}`;
    const isSale = _isVwSale(vwEntry.trans_type);
    const bagType = (vwEntry.bag_type || '').trim();
    const qty = parseInt(vwEntry.tot_pkts || 0) || 0;
    const gb = col('gunny_bags');

    if (!(isSale && bagType && qty > 0)) {
      // Remove existing linked entry
      for (let i = gb.length - 1; i >= 0; i--) {
        if (gb[i].reference === ref) gb.splice(i, 1);
      }
      return;
    }

    const now = new Date().toISOString();
    const fields = {
      date: vwEntry.date || '',
      bag_type: bagType,
      txn_type: 'out',
      quantity: qty,
      source: (vwEntry.party_name || 'VW Sale').trim(),
      rate: 0,
      amount: 0,
      notes: `Auto from VW Sale (RST #${rstNo})`,
      kms_year: vwEntry.kms_year || '',
      season: vwEntry.season || 'Kharif',
      created_by: username || 'system',
      linked_entry_id: vwEntry.id,
      reference: ref,
      rst_no: String(rstNo),
      truck_no: vwEntry.vehicle_no || '',
      updated_at: now,
    };
    const idx = gb.findIndex(g => g.reference === ref);
    if (idx >= 0) {
      gb[idx] = { ...gb[idx], ...fields };
    } else {
      gb.push({ id: uuidv4(), created_at: now, ...fields });
    }
  }

  // ============ Sale Bhada Ledger Sync (VW Sale → cash_transactions Truck JAMA) ============
  // For Sale dispatches, mill ne truck owner ko bhada (lump-sum freight) dena hota hai.
  // Auto-creates `cash_transactions` ledger entry: account=ledger, party_type=Truck, txn_type=jama
  // Reference: `vw_sale_bhada:{rst_no}` — idempotent (update on edit, delete on cancel/zero).
  function syncSaleBhadaLedger(vwEntry, username) {
    const rstNo = vwEntry.rst_no;
    if (rstNo == null) return;
    const isSale = _isVwSale(vwEntry.trans_type);
    const transTypeLower = (vwEntry.trans_type || '').toLowerCase();
    const isPurchase = transTypeLower.includes('purchase') || transTypeLower.includes('receive');
    const vehicleNo = (vwEntry.vehicle_no || '').trim();
    const bhada = parseFloat(vwEntry.bhada || 0) || 0;
    const ct = col('cash_transactions');

    // Distinct refs for sale vs purchase to avoid collision on same RST
    const saleRef = `vw_sale_bhada:${rstNo}`;
    const purchaseRef = `vw_purchase_bhada:${rstNo}`;
    const activeRef = isSale ? saleRef : (isPurchase ? purchaseRef : null);
    const inactiveRef = isSale ? purchaseRef : (isPurchase ? saleRef : null);

    // Always clear inactive (other-direction) ledger if present
    if (inactiveRef) {
      for (let i = ct.length - 1; i >= 0; i--) {
        if (ct[i].reference === inactiveRef) ct.splice(i, 1);
      }
    }

    if (!(activeRef && vehicleNo && bhada > 0)) {
      if (activeRef) {
        for (let i = ct.length - 1; i >= 0; i--) {
          if (ct[i].reference === activeRef) ct.splice(i, 1);
        }
      }
      return;
    }

    const now = new Date().toISOString();
    const label = isSale ? 'Sale' : 'Purchase';
    const fields = {
      date: vwEntry.date || '',
      account: 'ledger',
      txn_type: 'jama',
      category: vehicleNo,
      party_type: 'Truck',
      amount: bhada,
      description: `${label} Bhada (RST #${rstNo}) → ${vwEntry.farmer_name || vwEntry.party_name || ''}`,
      kms_year: vwEntry.kms_year || '',
      season: vwEntry.season || 'Kharif',
      created_by: username || 'system',
      linked_entry_id: vwEntry.id,
      reference: activeRef,
      updated_at: now,
    };
    const idx = ct.findIndex(t => t.reference === activeRef);
    if (idx >= 0) {
      ct[idx] = { ...ct[idx], ...fields };
    } else {
      ct.push({ id: uuidv4(), created_at: now, ...fields });
    }
  }

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
      // Double-check no duplicate (race condition guard)
      const weights2 = col('vehicle_weights');
      const dup2 = kmsYear
        ? weights2.find(w => w.rst_no === rstNo && w.kms_year === kmsYear)
        : weights2.find(w => w.rst_no === rstNo);
      if (dup2) rstNo = getNextRst(kmsYear);
    }

    // TP No. duplicate check
    const tpNoRaw = (data.tp_no || '').trim();
    if (tpNoRaw) {
      const allWeights = col('vehicle_weights');
      const tpDup = kmsYear
        ? allWeights.find(w => w.tp_no === tpNoRaw && w.kms_year === kmsYear)
        : allWeights.find(w => w.tp_no === tpNoRaw);
      if (tpDup) return res.status(400).json({ detail: `TP No. ${tpNoRaw} already RST #${tpDup.rst_no} mein hai! Duplicate TP allowed nahi hai.` });
    }

    const entry = {
      id: uuidv4(),
      rst_no: rstNo,
      date: data.date || new Date().toISOString().split('T')[0],
      kms_year: kmsYear,
      vehicle_no: (data.vehicle_no || '').trim().toUpperCase(),
      party_name: (data.party_name || '').trim(),
      tp_no: tpNoRaw,
      tp_weight: parseFloat(data.tp_weight || 0) || 0,
      g_issued: parseFloat(data.g_issued || 0) || 0,
      farmer_name: (data.farmer_name || '').trim(),
      product: data.product || 'PADDY',
      trans_type: data.trans_type || 'Receive(Purchase)',
      bag_type: (data.bag_type || '').trim(),
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
      bhada: parseFloat(data.bhada || 0) || 0,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Save first weight camera photos
    entry.first_wt_front_img = saveImage(entry.id, '1st_front', data.first_wt_front_img || '');
    entry.first_wt_side_img = saveImage(entry.id, '1st_side', data.first_wt_side_img || '');

    col('vehicle_weights').push(entry);
    syncSaleBagOut(entry, req.body.username);
    syncSaleBhadaLedger(entry, req.body.username);
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

    // Validation: 2nd weight should not be greater than 1st weight
    if (secondWt > firstWt) {
      return res.status(400).json({ detail: `2nd Weight (${Math.round(secondWt)} KG) pehle weight (${Math.round(firstWt)} KG) se zyada hai! Negative weight entry allowed nahi hai.` });
    }

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
    if ('bhada' in req.body) entry.bhada = parseFloat(req.body.bhada || 0) || 0;
    if ('g_issued' in req.body) entry.g_issued = parseFloat(req.body.g_issued || 0) || 0;
    if ('tp_no' in req.body) {
      const newTp = (req.body.tp_no || '').trim();
      if (newTp) {
        const tpDup = weights.find(w => w.tp_no === newTp && w.id !== req.params.entry_id && (!entry.kms_year || w.kms_year === entry.kms_year));
        if (tpDup) return res.status(400).json({ detail: `TP No. ${newTp} already RST #${tpDup.rst_no} mein hai! Duplicate TP allowed nahi hai.` });
      }
      entry.tp_no = newTp;
    }
    if ('tp_weight' in req.body) entry.tp_weight = parseFloat(req.body.tp_weight || 0) || 0;
    if ('tot_pkts' in req.body) entry.tot_pkts = parseInt(req.body.tot_pkts || 0) || 0;

    syncSaleBagOut(entry, req.body.username);
    syncSaleBhadaLedger(entry, req.body.username);
    database.save();
    res.json({ success: true, entry, message: `RST #${entry.rst_no} - Net Wt: ${netWt} KG` });
  }));

  // DELETE /api/vehicle-weight/:entry_id
  router.delete('/api/vehicle-weight/:entry_id', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const idx = weights.findIndex(w => w.id === req.params.entry_id);
    if (idx === -1) return res.status(404).json({ detail: 'Entry not found' });
    const vw = weights[idx];
    const rstNo = vw.rst_no;
    const kmsYear = vw.kms_year || '';

    // Cascade: delete linked mill entry + transactions
    const cascaded = [];
    if (rstNo !== undefined && rstNo !== null) {
      const entries = col('entries');
      // rst_no can be int or string - check both
      const meIdx = entries.findIndex(e => (String(e.rst_no) === String(rstNo)) && (!kmsYear || e.kms_year === kmsYear));
      if (meIdx !== -1) {
        const me = entries[meIdx];
        const eid = me.id;
        entries.splice(meIdx, 1);
        const ct = col('cash_transactions');
        for (let i = ct.length - 1; i >= 0; i--) { if (ct[i].linked_entry_id === eid) ct.splice(i, 1); }
        const da = col('diesel_accounts');
        for (let i = da.length - 1; i >= 0; i--) { if (da[i].linked_entry_id === eid) da.splice(i, 1); }
        const gb = col('gunny_bags');
        for (let i = gb.length - 1; i >= 0; i--) { if (gb[i].linked_entry_id === eid) gb.splice(i, 1); }
        cascaded.push(`Mill Entry RST #${rstNo}`);
      }
    }

    weights.splice(idx, 1);
    // Cascade: also remove linked sale-bag-out + sale/purchase-bhada-ledger entries
    if (rstNo !== undefined && rstNo !== null) {
      const gb2 = col('gunny_bags');
      const bagRef = `vw_sale_bag:${rstNo}`;
      for (let i = gb2.length - 1; i >= 0; i--) { if (gb2[i].reference === bagRef) gb2.splice(i, 1); }
      const ct2 = col('cash_transactions');
      const saleRef = `vw_sale_bhada:${rstNo}`;
      const purRef = `vw_purchase_bhada:${rstNo}`;
      for (let i = ct2.length - 1; i >= 0; i--) {
        if (ct2[i].reference === saleRef || ct2[i].reference === purRef) ct2.splice(i, 1);
      }
    }
    database.save();
    let msg = 'Entry deleted';
    if (cascaded.length) msg += ` + ${cascaded.join(', ')} bhi delete kiya`;
    res.json({ success: true, message: msg });
  }));

  // PUT /api/vehicle-weight/:entry_id/edit
  router.put('/api/vehicle-weight/:entry_id/edit', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === req.params.entry_id);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const editable = ['vehicle_no', 'party_name', 'farmer_name', 'product', 'tot_pkts', 'bag_type', 'cash_paid', 'diesel_paid', 'bhada', 'g_issued', 'tp_no', 'tp_weight', 'remark'];
    for (const f of editable) {
      if (f in req.body) {
        if (f === 'cash_paid' || f === 'diesel_paid' || f === 'bhada' || f === 'tp_weight') {
          entry[f] = parseFloat(req.body[f] || 0) || 0;
        } else if (f === 'tp_no') {
          const newTp = (req.body[f] || '').trim();
          if (newTp) {
            const tpDup = weights.find(w => w.tp_no === newTp && w.id !== req.params.entry_id && (!entry.kms_year || w.kms_year === entry.kms_year));
            if (tpDup) return res.status(400).json({ detail: `TP No. ${newTp} already RST #${tpDup.rst_no} mein hai! Duplicate TP allowed nahi hai.` });
          }
          entry[f] = newTp;
        } else {
          entry[f] = req.body[f];
        }
      }
    }

    // Cascade edit to linked Mill Entry
    const rstNo = entry.rst_no;
    if (rstNo != null) {
      const entries = col('entries');
      const fieldMap = { vehicle_no: 'truck_no', party_name: 'party_name', farmer_name: 'mandi_name', tp_no: 'tp_no', tp_weight: 'tp_weight', tot_pkts: 'bag' };
      const editedFields = Object.keys(req.body).filter(f => f in fieldMap);
      if (editedFields.length > 0) {
        const linked = entries.filter(e => String(e.rst_no) === String(rstNo) && (!entry.kms_year || e.kms_year === entry.kms_year));
        for (const mill of linked) {
          for (const vwF of editedFields) {
            mill[fieldMap[vwF]] = entry[vwF];
          }
        }
      }
    }

    syncSaleBagOut(entry, req.query.username);
    syncSaleBhadaLedger(entry, req.query.username);
    database.save();
    res.json({ success: true, entry });
  }));

  // HEAD /api/vehicle-weight/:entry_id/weight-report-pdf - for WhatsApp URL validation
  router.head('/api/vehicle-weight/:entry_id/weight-report-pdf', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === req.params.entry_id);
    if (!entry) return res.status(404).json({ detail: 'Not found' });
    res.set('Content-Type', 'application/pdf').status(200).end();
  }));

  // GET /api/vehicle-weight/:entry_id/weight-report-pdf - Professional A4 weight report
  router.get('/api/vehicle-weight/:entry_id/weight-report-pdf', safeAsync(async (req, res) => {
    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === req.params.entry_id);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });
    const pdfBuffer = await generateWeightPdfBuffer(entry);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="WeightReport_RST${entry.rst_no || ''}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    res.send(pdfBuffer);
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
      res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `WeightSlip_RST${rst}.pdf`}`);
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

      // Border box (outer) - dark thick border
      doc.lineWidth(2).strokeColor('#1a1a2e').rect(x, y, PW, bh).stroke();

      // Copy label (top-right on border)
      const lw = doc.font(fb).fontSize(7).widthOfString(copyLabel);
      doc.rect(x + PW - lw - 40, y - 3, lw + 12, 8).fill('#fff');
      doc.font(fb).fontSize(7).fillColor('#888').text(copyLabel, x + PW - lw - 34, y - 1, { lineBreak: false });

      y += 5 * mm;

      // Custom fields ABOVE company name
      if (aboveText) {
        doc.font(fn).fontSize(8).fillColor('#8B0000').text(aboveText, x, y, { width: PW, align: 'center' });
        y += 4.5 * mm;
      }

      // Company name - large bold
      doc.font(fb).fontSize(18).fillColor('#000').text(company, x, y, { width: PW, align: 'center' });
      y += 7 * mm;

      // Tagline
      doc.font(fn).fontSize(8).fillColor('#888').text(tagline, x, y, { width: PW, align: 'center' });
      y += 4 * mm;

      // Custom fields BELOW tagline
      if (belowText) {
        doc.font(fn).fontSize(7).fillColor('#374151').text(belowText, x, y, { width: PW, align: 'center' });
        y += 3 * mm;
      }

      // Slip title
      doc.font(fb).fontSize(11).fillColor('#333').text('WEIGHT SLIP / \u0924\u094c\u0932 \u092a\u0930\u094d\u091a\u0940', x, y, { width: PW, align: 'center' });
      y += 5 * mm;

      // Header separator line (thick)
      doc.lineWidth(1.5).strokeColor('#1a1a2e').moveTo(x, y).lineTo(x + PW, y).stroke();

      // ── Bordered Info Table (4 rows x 4 cols with cell borders) ──
      const _isSaleSlip2 = String(entry.trans_type || '').toLowerCase().match(/sale|dispatch/);
      const rows = [
        ['RST No.', `#${rst}`, 'Date / \u0926\u093f\u0928\u093e\u0902\u0915', fmtDate(entry.date) || ''],
        ['Vehicle / \u0917\u093e\u0921\u093c\u0940', entry.vehicle_no || '', 'Trans Type', entry.trans_type || ''],
        ['Party / \u092a\u093e\u0930\u094d\u091f\u0940', entry.party_name || '', _isSaleSlip2 ? 'Destination' : 'Source/Mandi', entry.farmer_name || ''],
        ['Product / \u092e\u093e\u0932', entry.product || '', 'Bags / \u092c\u094b\u0930\u0947', String(entry.tot_pkts || 0)],
      ];
      const gIssued = parseFloat(entry.g_issued || 0) || 0;
      const tpNo = entry.tp_no || '';
      const tpWeight = parseFloat(entry.tp_weight || 0) || 0;
      const remarkText = entry.remark || '';
      if (gIssued > 0) rows.push(['G.Issued', gIssued.toLocaleString(), 'TP No.', tpNo || '-']);
      else if (tpNo) rows.push(['TP No.', tpNo, '', '']);
      if (tpWeight > 0) rows.push(['TP Weight', `${tpWeight} Q`, '', '']);
      if (remarkText) rows.push(['Remark', remarkText, '', '']);
      const rh = 6 * mm;
      const c1w = PW * 0.18;
      const c2w = PW * 0.32;
      const c3w = PW * 0.18;

      rows.forEach((row, i) => {
        const ry = y + i * rh;
        const ryBottom = ry + rh;

        // Horizontal line at bottom of each row
        doc.lineWidth(0.5).strokeColor('#999').moveTo(x, ryBottom).lineTo(x + PW, ryBottom).stroke();
        // Vertical column separators
        doc.moveTo(x + c1w, ry).lineTo(x + c1w, ryBottom).stroke();
        doc.moveTo(x + c1w + c2w, ry).lineTo(x + c1w + c2w, ryBottom).stroke();
        doc.moveTo(x + c1w + c2w + c3w, ry).lineTo(x + c1w + c2w + c3w, ryBottom).stroke();

        const textY = ry + rh * 0.25;

        // Label 1
        doc.font(fn).fontSize(8).fillColor('#333').text(row[0], x + 2 * mm, textY, { lineBreak: false });
        // Value 1 - bold
        doc.font(i === 0 ? fb : fn).fontSize(i === 0 ? 10 : 9).fillColor('#000').text(String(row[1]).substring(0, 22), x + c1w + 2 * mm, textY, { lineBreak: false });
        // Label 2
        doc.font(fn).fontSize(8).fillColor('#333').text(row[2], x + c1w + c2w + 2 * mm, textY, { lineBreak: false });
        // Value 2 - bold
        doc.font(i === 0 ? fb : fn).fontSize(i === 0 ? 10 : 9).fillColor('#000').text(String(row[3]).substring(0, 22), x + c1w + c2w + c3w + 2 * mm, textY, { lineBreak: false });
      });

      y += rows.length * rh;

      // Thick line separating table from weight boxes
      doc.lineWidth(1.5).strokeColor('#1a1a2e').moveTo(x, y).lineTo(x + PW, y).stroke();
      y += 1 * mm;

      // ── Weight boxes (Gross | Tare | Net + optional Cash/Diesel) ──
      const wtItems = [
        { label: 'GROSS / \u0915\u0941\u0932', val: `${Number(grossWt).toLocaleString()} KG`, bg: '#f0f0f0', fg: '#000', bc: '#999' },
        { label: 'TARE / \u0916\u093e\u0932\u0940', val: `${Number(tareWt).toLocaleString()} KG`, bg: '#f0f0f0', fg: '#000', bc: '#999' },
        { label: 'NET / \u0936\u0941\u0926\u094d\u0927', val: `${Number(netWt).toLocaleString()} KG`, bg: '#dcf5dc', fg: '#1b5e20', bc: '#2e7d32' },
      ];
      if (cash > 0) wtItems.push({ label: 'CASH / \u0928\u0915\u0926', val: `Rs.${Number(cash).toLocaleString()}`, bg: '#fff8e1', fg: '#e65100', bc: '#f9a825' });
      if (diesel > 0) wtItems.push({ label: 'DIESEL / \u0921\u0940\u091c\u0932', val: `Rs.${Number(diesel).toLocaleString()}`, bg: '#fff8e1', fg: '#e65100', bc: '#f9a825' });

      const numCols = wtItems.length;
      const colW = PW / numCols;
      const boxH = 13 * mm;

      wtItems.forEach((item, i) => {
        const bx = x + i * colW;
        doc.rect(bx, y, colW, boxH).fill(item.bg);
        doc.lineWidth(item.label.includes('NET') ? 1.2 : 0.5).strokeColor(item.bc).rect(bx, y, colW, boxH).stroke();
        doc.font(fb).fontSize(7).fillColor('#555').text(item.label, bx, y + 2, { width: colW, align: 'center' });
        const fz = item.label.includes('NET') ? 14 : (item.label.includes('CASH') || item.label.includes('DIESEL')) ? 11 : 12;
        doc.font(fb).fontSize(fz).fillColor(item.fg).text(item.val, bx, y + 4.5 * mm, { width: colW, align: 'center' });
      });

      y += boxH + 2 * mm;

      // Signatures (only for customer copy)
      if (showSig) {
        const sigW = 38 * mm;
        const sigLineY = y + 10 * mm;
        doc.lineWidth(0.6).strokeColor('#333');
        doc.moveTo(x + 22, sigLineY).lineTo(x + 22 + sigW, sigLineY).stroke();
        doc.font(fn).fontSize(6).fillColor('#555').text('Driver / \u0921\u094d\u0930\u093e\u0907\u0935\u0930', x + 22, sigLineY + 2, { width: sigW, align: 'center' });
        doc.moveTo(x + PW - 22 - sigW, sigLineY).lineTo(x + PW - 22, sigLineY).stroke();
        doc.font(fn).fontSize(6).fillColor('#555').text('Authorized / \u0905\u0927\u093f\u0915\u0943\u0924', x + PW - 22 - sigW, sigLineY + 2, { width: sigW, align: 'center' });
      }

      // Footer at bottom of copy block
      doc.font(fn).fontSize(6).fillColor('#999').text(`${company} | Computer Generated`, x, startY + bh - 10, { width: PW, align: 'center' });
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
    return [...items].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b.rst_no) || 0) - (Number(a.rst_no) || 0));
  }

  router.get('/api/vehicle-weight/export/excel', safeAsync(async (req, res) => {
    const ExcelJS = require('exceljs');
    const items = _filterVwItems(req.query);
    items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
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

    const isSale = String(req.query.trans_type || '').toLowerCase().trim() === 'sale';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(isSale ? 'Vehicle Weight - Sale' : 'Vehicle Weight');
    const nCols = isSale ? 11 : 15;
    const lastCol = isSale ? 'K' : 'O';
    let cr = 1;
    if (abParts.length > 0) {
      ws.mergeCells(`A${cr}:${lastCol}${cr}`);
      ws.getCell(`A${cr}`).value = abParts.join('  |  ');
      ws.getCell(`A${cr}`).font = { name: 'Inter', bold: true, size: 10, color: { argb: '8B0000' } };
      ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
      cr++;
    }
    ws.mergeCells(`A${cr}:${lastCol}${cr}`);
    ws.getCell(`A${cr}`).value = `${company} - ${isSale ? 'Vehicle Weight - Sale / बिक्री' : 'Vehicle Weight / तौल पर्ची'}`;
    ws.getCell(`A${cr}`).font = { name: 'Inter', bold: true, size: 14, color: { argb: '1a1a2e' } };
    ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
    cr++;
    const belowAll = [tagline, ...blParts].filter(Boolean);
    if (belowAll.length > 0) {
      ws.mergeCells(`A${cr}:${lastCol}${cr}`);
      ws.getCell(`A${cr}`).value = belowAll.join('  |  ');
      ws.getCell(`A${cr}`).font = { name: 'Inter', size: 9, italic: true, color: { argb: '555555' } };
      ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
      cr++;
    }
    ws.mergeCells(`A${cr}:${lastCol}${cr}`);
    ws.getCell(`A${cr}`).value = `Date: ${fmtDate(req.query.date_from) || 'All'} to ${fmtDate(req.query.date_to) || 'All'} | Total: ${items.length}`;
    ws.getCell(`A${cr}`).font = { name: 'Inter', size: 9, color: { argb: '666666' } };
    ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
    cr++;

    const headers = isSale
      ? ['RST', 'Date', 'Vehicle', 'Party', 'Destination', 'Product', 'Bags', 'Bag Type', 'Net Wt (KG)', 'Bhada', 'Remark']
      : ['RST', 'Date', 'Vehicle', 'Party', 'Mandi', 'Product', 'Trans Type', 'Bags', '1st Wt (KG)', '2nd Wt (KG)', 'Net Wt (KG)', 'TP Wt (Q)', 'G.Issued', 'Cash', 'Diesel'];
    const hdrRowNum = cr + 1;
    const hdrRow = ws.getRow(hdrRowNum);
    headers.forEach((h, i) => {
      const cell = hdrRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Inter', bold: true, color: { argb: 'FFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a1a2e' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    items.forEach((e, idx) => {
      const row = ws.getRow(hdrRowNum + 1 + idx);
      const vals = isSale
        ? [e.rst_no, fmtDate(e.date), e.vehicle_no, e.party_name, e.farmer_name, e.product, e.tot_pkts, e.bag_type || '', e.net_wt || 0, parseFloat(e.bhada || 0) || 0, e.remark || '']
        : [e.rst_no, fmtDate(e.date), e.vehicle_no, e.party_name, e.farmer_name, e.product, e.trans_type, e.tot_pkts, e.first_wt || 0, e.second_wt || 0, e.net_wt || 0, parseFloat(e.tp_weight || 0) || 0, e.g_issued || 0, e.cash_paid || 0, e.diesel_paid || 0];
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        // Sale: right-align Bags + Net Wt + Bhada (cols 7,9,10). Purchase: cols >= 9.
        if (isSale ? (i === 6 || i === 8 || i === 9) : (i >= 8)) cell.alignment = { horizontal: 'right' };
      });
    });

    // Totals row
    if (items.length > 0) {
      const totRow = ws.getRow(hdrRowNum + 1 + items.length);
      const totBags = items.reduce((s, e) => s + (Number(e.tot_pkts) || 0), 0);
      const tot1st = items.reduce((s, e) => s + (Number(e.first_wt) || 0), 0);
      const tot2nd = items.reduce((s, e) => s + (Number(e.second_wt) || 0), 0);
      const totNet = items.reduce((s, e) => s + (Number(e.net_wt) || 0), 0);
      const totTp = items.reduce((s, e) => s + (parseFloat(e.tp_weight) || 0), 0);
      const totGIss = items.reduce((s, e) => s + (Number(e.g_issued) || 0), 0);
      const totCash = items.reduce((s, e) => s + (Number(e.cash_paid) || 0), 0);
      const totDiesel = items.reduce((s, e) => s + (Number(e.diesel_paid) || 0), 0);
      const totBhada = items.reduce((s, e) => s + (parseFloat(e.bhada) || 0), 0);
      const totVals = isSale
        ? ['', '', '', '', '', 'TOTAL:', totBags, '', totNet, totBhada, '']
        : ['', '', '', '', '', '', 'TOTAL:', totBags, tot1st, tot2nd, totNet, totTp, totGIss, totCash, totDiesel];
      const rightFrom = isSale ? 6 : 7;
      totVals.forEach((v, i) => {
        const cell = totRow.getCell(i + 1);
        cell.value = v;
        cell.font = { name: 'Inter', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a1a2e' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (i >= rightFrom) cell.alignment = { horizontal: 'right' };
      });
    }

    ws.columns.forEach((c, i) => { c.width = i === 4 ? 22 : 15; });

    // Light-themed summary banner
    if (items.length > 0) {
      const { addExcelSummaryBanner: addSB, fmtInr: fmtI } = require('./pdf_helpers');
      const totBags2 = items.reduce((s, e) => s + (Number(e.tot_pkts) || 0), 0);
      const totNet2 = items.reduce((s, e) => s + (Number(e.net_wt) || 0), 0);
      const totCash2 = items.reduce((s, e) => s + (Number(e.cash_paid) || 0), 0);
      const totDiesel2 = items.reduce((s, e) => s + (Number(e.diesel_paid) || 0), 0);
      const totBhada2 = items.reduce((s, e) => s + (parseFloat(e.bhada) || 0), 0);
      const lastRow = ws.lastRow ? ws.lastRow.number : 5;
      const stats = isSale
        ? [
            { lbl: 'Total Entries', val: String(items.length) },
            { lbl: 'Total Bags', val: totBags2.toLocaleString() },
            { lbl: 'Net Wt', val: `${totNet2.toLocaleString()} KG` },
            { lbl: 'Total Bhada', val: fmtI(totBhada2) },
          ]
        : [
            { lbl: 'Total Entries', val: String(items.length) },
            { lbl: 'Total Bags', val: totBags2.toLocaleString() },
            { lbl: '1st Wt', val: `${items.reduce((s, e) => s + (Number(e.first_wt) || 0), 0).toLocaleString()} KG` },
            { lbl: '2nd Wt', val: `${items.reduce((s, e) => s + (Number(e.second_wt) || 0), 0).toLocaleString()} KG` },
            { lbl: 'Net Wt', val: `${totNet2.toLocaleString()} KG` },
            { lbl: 'Cash Paid', val: fmtI(totCash2) },
            { lbl: 'Diesel', val: fmtI(totDiesel2) },
          ];
      addSB(ws, lastRow + 2, nCols, stats);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `${isSale ? 'vehicle_weight_sales' : 'vehicle_weight'}.xlsx`}`);
    // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
    try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
    await wb.xlsx.write(res);
    res.end();
  }));

  router.get('/api/vehicle-weight/export/pdf', safeAsync(async (req, res) => {
    const PDFDocument = require('pdfkit');
    const items = _filterVwItems(req.query);
    items.sort((a,b) => (a.date||'').slice(0,10).localeCompare((b.date||'').slice(0,10)) || (Number(a.rst_no)||0) - (Number(b.rst_no)||0));
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
    const doc = createPdfDoc({ size: 'A4', layout: 'landscape', margin: 25 }, database);
    if (hasFS2) {
      doc.registerFont('ExFont', path.join(fontDir2, 'FreeSans.ttf'));
      doc.registerFont('ExFontBold', path.join(fontDir2, 'FreeSansBold.ttf'));
    }
    const efn = hasFS2 ? 'ExFont' : 'Helvetica';
    const efb = hasFS2 ? 'ExFontBold' : 'Helvetica-Bold';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `${String(req.query.trans_type||'').toLowerCase()==='sale' ? 'vehicle_weight_sales' : 'vehicle_weight'}.pdf`}`);
    doc.pipe(res);

    const isSale = String(req.query.trans_type || '').toLowerCase().trim() === 'sale';
    const PW = 792; // A4 landscape width
    const LM = 25;
    const TW = PW - 2 * LM;

    // ── Header Section ──
    // Gold accent stripe on top
    doc.rect(LM, 18, TW, 3).fill('#f9a825');
    // Dark header bar
    const headerH = abParts2.length > 0 ? 58 : 50;
    doc.rect(LM, 21, TW, headerH).fill('#0d1b2a');

    let hy = 25;
    if (abParts2.length > 0) {
      doc.fontSize(7).font(efn).fillColor('#f9a825').text(abParts2.join('  |  '), LM, hy, { width: TW, align: 'center' });
      hy += 11;
    }
    doc.fontSize(18).font(efb).fillColor('#ffffff').text(company, LM, hy, { width: TW, align: 'center' });
    hy += 22;
    if (pdfTagline) {
      doc.fontSize(8).font(efn).fillColor('#7ec8e3').text(pdfTagline, LM, hy, { width: TW, align: 'center' });
      hy += 11;
    }
    if (blParts2.length > 0) {
      doc.fontSize(7).font(efn).fillColor('#b0c4de').text(blParts2.join('  |  '), LM, hy, { width: TW, align: 'center' });
      hy += 11;
    }

    // Subtitle bar with dual-tone
    const subY = 21 + headerH + 2;
    doc.rect(LM, subY, TW, 18).fill('#e8edf5');
    doc.rect(LM, subY, 4, 18).fill('#1565c0'); // Blue left accent
    doc.fontSize(9).font(efb).fillColor('#1a237e');
    const dateRange = `${req.query.date_from || 'All'} to ${req.query.date_to || 'All'}`;
    doc.text(`Vehicle Weight Register`, LM + 12, subY + 4, { width: TW - 22, align: 'center', continued: false });
    doc.font(efn).fontSize(8).fillColor('#455a64').text(`Date: ${dateRange}  |  Records: ${items.length}`, LM, subY + 5, { width: TW - 10, align: 'right' });

    let y = subY + 24;

    // ── Table ──
    // Sale view: # RST Date Vehicle Party Destination Product Bags BagType NetWt Bhada Remark
    // Purchase view: # RST Date Vehicle Party Mandi Product Bags 1stWt 2ndWt NetWt TPWt G.Iss Cash Diesel
    const headers = isSale
      ? ['#', 'RST', 'Date', 'Vehicle', 'Party', 'Destination', 'Product', 'Bags', 'Bag Type', 'Net Wt', 'Bhada', 'Remark']
      : ['#', 'RST', 'Date', 'Vehicle', 'Party', 'Mandi', 'Product', 'Bags', '1st Wt', '2nd Wt', 'Net Wt', 'TP Wt', 'G.Iss', 'Cash', 'Diesel'];
    const colW = isSale
      ? [22, 36, 55, 62, 72, 70, 60, 32, 60, 52, 60, 161]
      : [22, 36, 55, 62, 68, 64, 55, 32, 52, 52, 52, 36, 36, 46, 46];
    const rightAlign = isSale
      ? [false, true, false, false, false, false, false, true, false, true, true, false]
      : [false, true, false, false, false, false, false, true, true, true, true, true, true, true, true];

    // Column group colors for header: Info=navy, Weight=teal, Money=dark green
    const drawTableHeader = (yPos) => {
      if (isSale) {
        // Sale: cols 0-8 navy(info+bags+bag_type), col 9 teal(net wt), col 10 amber(bhada), col 11 navy(remark)
        const infoW = colW.slice(0, 9).reduce((s,w) => s+w, 0);
        doc.rect(LM, yPos, infoW, 15).fill('#1a237e');
        const wtW = colW[9];
        doc.rect(LM + infoW, yPos, wtW, 15).fill('#004d40');
        const monW = colW[10];
        doc.rect(LM + infoW + wtW, yPos, monW, 15).fill('#e65100');
        doc.rect(LM + infoW + wtW + monW, yPos, colW[11], 15).fill('#1a237e');
      } else {
        // Info columns (#, RST, Date, Vehicle, Party, Mandi, Product, Bags) - Navy
        const infoW = colW.slice(0, 8).reduce((s,w) => s+w, 0);
        doc.rect(LM, yPos, infoW, 15).fill('#1a237e');
        // Weight columns (1st, 2nd, Net, TP Wt) - Teal
        const wtW = colW.slice(8, 12).reduce((s,w) => s+w, 0);
        doc.rect(LM + infoW, yPos, wtW, 15).fill('#004d40');
        // Money columns (G.Iss, Cash, Diesel) - Dark amber
        const monW = colW.slice(12, 15).reduce((s,w) => s+w, 0);
        doc.rect(LM + infoW + wtW, yPos, monW, 15).fill('#e65100');
      }

      doc.fontSize(7).font(efb).fillColor('#ffffff');
      let hx = LM + 2;
      headers.forEach((h, i) => {
        doc.text(h, hx, yPos + 4, { width: colW[i] - 4, align: rightAlign[i] ? 'right' : 'left' });
        hx += colW[i];
      });
      return yPos + 15;
    };

    y = drawTableHeader(y);

    // Totals accumulators
    let totBags = 0, tot1st = 0, tot2nd = 0, totNet = 0, totTp = 0, totGiss = 0, totCash = 0, totDiesel = 0, totBhada = 0;
    let lastDate = '';

    // Data rows
    doc.font(efn).fontSize(7);
    items.forEach((e, idx) => {
      if (y > 535) {
        doc.addPage();
        y = 25;
        y = drawTableHeader(y);
        doc.font(efn).fontSize(7);
        lastDate = '';
      }

      const curDate = (e.date || '').slice(0, 10);
      // Date group separator line when date changes
      if (lastDate && curDate !== lastDate) {
        doc.lineWidth(0.8).strokeColor('#1565c0').moveTo(LM, y).lineTo(LM + TW, y).stroke();
      }
      lastDate = curDate;

      // Alternating row background
      const rowColor = idx % 2 === 0 ? '#f5f7ff' : '#ffffff';
      doc.rect(LM, y, TW, 13).fill(rowColor);

      // Subtle column separators
      let sepX = LM;
      colW.forEach((w) => { sepX += w; doc.lineWidth(0.2).strokeColor('#d0d5dd').moveTo(sepX, y).lineTo(sepX, y + 13).stroke(); });

      const bags = Number(e.tot_pkts || 0);
      const first = Number(e.first_wt || 0);
      const second = Number(e.second_wt || 0);
      const net = Number(e.net_wt || 0);
      const tpWt = parseFloat(e.tp_weight || 0) || 0;
      const gIss = Number(e.g_issued || 0);
      const cash = Number(e.cash_paid || 0);
      const diesel = Number(e.diesel_paid || 0);
      const bhada = parseFloat(e.bhada || 0) || 0;

      totBags += bags; tot1st += first; tot2nd += second; totNet += net; totTp += tpWt; totGiss += gIss; totCash += cash; totDiesel += diesel; totBhada += bhada;

      x = LM + 2;
      const vals = isSale
        ? [
            idx + 1, e.rst_no, fmtDate(e.date), e.vehicle_no, e.party_name, e.farmer_name || '-', e.product, bags || '-',
            e.bag_type || '-',
            net ? net.toLocaleString() : '-',
            bhada ? bhada.toLocaleString() : '-',
            (e.remark || '').slice(0, 40),
          ]
        : [
            idx + 1, e.rst_no, fmtDate(e.date), e.vehicle_no, e.party_name, e.farmer_name, e.product, bags || '-',
            first ? first.toLocaleString() : '-', second ? second.toLocaleString() : '-',
            net ? net.toLocaleString() : '-', tpWt > 0 ? tpWt : '-', gIss > 0 ? gIss.toLocaleString() : '-',
            cash ? cash.toLocaleString() : '-', diesel ? diesel.toLocaleString() : '-'
          ];

      vals.forEach((v, i) => {
        if (isSale) {
          // Sale-mode coloring:
          //   col 0 (#) gray; col 1 (RST) bold navy; col 2 (Date) dark; col 9 (Net Wt) green;
          //   col 10 (Bhada) orange bold; col 11 (Remark) default.
          if (i === 0) { doc.font(efn).fillColor('#78909c'); }
          else if (i === 1) { doc.font(efb).fillColor('#1a237e'); }
          else if (i === 2) { doc.font(efn).fillColor('#37474f'); }
          else if (i === 9 && net > 0) { doc.font(efb).fillColor('#1b5e20'); }
          else if (i === 10 && bhada > 0) { doc.font(efb).fillColor('#e65100'); }
          else { doc.font(efn).fillColor('#212121'); }
        } else {
          if (i === 0) { doc.font(efn).fillColor('#78909c'); } // # column gray
          else if (i === 1) { doc.font(efb).fillColor('#1a237e'); } // RST bold navy
          else if (i === 2) { doc.font(efn).fillColor('#37474f'); } // Date dark gray
          else if (i === 8) { doc.font(efn).fillColor('#0277bd'); } // 1st Wt blue
          else if (i === 9) { doc.font(efn).fillColor('#7b1fa2'); } // 2nd Wt purple
          else if (i === 10 && net > 0) { doc.font(efb).fillColor('#1b5e20'); } // Net Wt green bold
          else if (i === 11 && cash > 0) { doc.font(efb).fillColor('#2e7d32'); } // Cash green
          else if (i === 12 && diesel > 0) { doc.font(efb).fillColor('#e65100'); } // Diesel orange
          else { doc.font(efn).fillColor('#212121'); }
        }
        doc.text(String(v || '-'), x, y + 3, { width: colW[i] - 4, align: rightAlign[i] ? 'right' : 'left' });
        x += colW[i];
      });

      // Bottom row line
      doc.lineWidth(0.2).strokeColor('#e0e0e0').moveTo(LM, y + 13).lineTo(LM + TW, y + 13).stroke();
      y += 13;
    });

    // ── Totals Row ──
    y += 3;
    doc.lineWidth(1.5).strokeColor('#1b5e20').moveTo(LM, y).lineTo(LM + TW, y).stroke();
    y += 1;
    doc.rect(LM, y, TW, 16).fill('#e8f5e9');
    // Green left accent on totals
    doc.rect(LM, y, 4, 16).fill('#2e7d32');
    doc.fontSize(8).font(efb).fillColor('#1b5e20');
    x = LM + 2;
    const totVals = isSale
      ? ['', '', '', '', '', 'TOTAL:', '', totBags.toLocaleString(), '',
         totNet.toLocaleString(),
         totBhada ? totBhada.toLocaleString() : '-', '']
      : ['', '', '', '', '', '', 'TOTAL:', totBags.toLocaleString(),
         tot1st.toLocaleString(), tot2nd.toLocaleString(), totNet.toLocaleString(),
         totTp > 0 ? totTp.toFixed(1) : '-', totGiss > 0 ? totGiss.toLocaleString() : '-',
         totCash ? totCash.toLocaleString() : '-', totDiesel ? totDiesel.toLocaleString() : '-'];
    const totalLabelIdx = isSale ? 5 : 6;
    totVals.forEach((v, i) => {
      doc.text(String(v), x, y + 4, { width: colW[i] - 4, align: rightAlign[i] ? 'right' : (i === totalLabelIdx ? 'right' : 'left') });
      x += colW[i];
    });
    doc.lineWidth(1).strokeColor('#2e7d32').moveTo(LM, y + 16).lineTo(LM + TW, y + 16).stroke();

    // ── Light-themed Summary Banner ──
    if (items.length > 0) {
      const { drawSummaryBanner: drawSB, STAT_COLORS: SC, fmtInr: fmtI } = require('./pdf_helpers');
      y += 22;
      if (y + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      drawSB(doc, isSale ? [
        { lbl: 'TOTAL ENTRIES', val: String(items.length), color: SC.primary },
        { lbl: 'TOTAL BAGS', val: totBags.toLocaleString(), color: SC.blue },
        { lbl: 'NET WT', val: totNet.toLocaleString(), color: SC.emerald },
        { lbl: 'TOTAL BHADA', val: fmtI(totBhada), color: SC.orange },
      ] : [
        { lbl: 'TOTAL ENTRIES', val: String(items.length), color: SC.primary },
        { lbl: 'TOTAL BAGS', val: totBags.toLocaleString(), color: SC.blue },
        { lbl: '1ST WT', val: tot1st.toLocaleString(), color: SC.teal },
        { lbl: '2ND WT', val: tot2nd.toLocaleString(), color: SC.purple },
        { lbl: 'NET WT', val: totNet.toLocaleString(), color: SC.emerald },
        { lbl: 'CASH PAID', val: fmtI(totCash), color: SC.green },
        { lbl: 'DIESEL', val: fmtI(totDiesel), color: SC.orange },
      ], LM, y, TW);
      y += 32;
    }

    // ── Footer ──
    y += 14;
    doc.lineWidth(0.5).strokeColor('#b0bec5').moveTo(LM, y).lineTo(LM + TW, y).stroke();
    y += 4;
    doc.fontSize(7).font(efn).fillColor('#78909c').text(`${company}`, LM, y);
    doc.text(`v${require('../package.json').version}  |  Generated: ${new Date().toLocaleString('en-IN')}`, LM, y, { width: TW, align: 'right' });

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

  // Mandi cutting map - save/load from database
  router.get('/api/settings/mandi-cutting-map', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const doc = settings.find(s => s.setting_id === 'mandi_cutting_map');
    res.json(doc ? (doc.value || {}) : {});
  }));

  router.put('/api/settings/mandi-cutting-map', safeAsync(async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ detail: 'Key missing' });
    const settings = col('app_settings');
    const idx = settings.findIndex(s => s.setting_id === 'mandi_cutting_map');
    if (idx >= 0) {
      if (!settings[idx].value) settings[idx].value = {};
      settings[idx].value[key] = value;
    } else {
      settings.push({ setting_id: 'mandi_cutting_map', value: { [key]: value } });
    }
    database.save();
    res.json({ success: true });
  }));

  // Camera config - save/load from database
  router.get('/api/settings/camera-config', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const doc = settings.find(s => s.setting_id === 'camera_config');
    res.json(doc ? (doc.value || {}) : {});
  }));

  router.put('/api/settings/camera-config', safeAsync(async (req, res) => {
    const settings = col('app_settings');
    const idx = settings.findIndex(s => s.setting_id === 'camera_config');
    if (idx >= 0) { settings[idx].value = req.body; }
    else { settings.push({ setting_id: 'camera_config', value: req.body }); }
    database.save();
    res.json({ success: true });
  }));

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

  // ════════════════════════════════════════════════════════════════════════
  // 🛻 TRUCK OWNER — Per-Trip Breakdown (Bhada-based, FIFO settlement)
  // ════════════════════════════════════════════════════════════════════════

  router.get('/api/truck-owner/per-trip-trucks', safeAsync(async (req, res) => {
    const { kms_year, season } = req.query;
    const vws = col('vehicle_weights');
    const agg = {};
    for (const vw of vws) {
      const v = (vw.vehicle_no || '').trim();
      const b = parseFloat(vw.bhada || 0) || 0;
      if (!v || b <= 0) continue;
      if (kms_year && vw.kms_year !== kms_year) continue;
      if (season && vw.season !== season) continue;
      if (!agg[v]) agg[v] = { vehicle_no: v, trips_count: 0, total_bhada: 0 };
      agg[v].trips_count += 1;
      agg[v].total_bhada += b;
    }
    const out = Object.values(agg).sort((a, b) => a.vehicle_no.localeCompare(b.vehicle_no));
    res.json({ trucks: out });
  }));

  router.get('/api/truck-owner/per-trip-all', safeAsync(async (req, res) => {
    const { kms_year, season, date_from, date_to, filter_status } = req.query;
    const vws = col('vehicle_weights');
    const truckMap = {};
    for (const vw of vws) {
      const v = (vw.vehicle_no || '').trim();
      const b = parseFloat(vw.bhada || 0) || 0;
      if (!v || b <= 0) continue;
      if (kms_year && vw.kms_year !== kms_year) continue;
      if (season && vw.season !== season) continue;
      if (!truckMap[v]) truckMap[v] = [];
      truckMap[v].push(vw);
    }
    const ledgerNikasis = col('cash_transactions').filter(t =>
      t.account === 'ledger' && t.party_type === 'Truck' && t.txn_type === 'nikasi' &&
      (!kms_year || t.kms_year === kms_year)
    );
    const allTrips = [];
    const agg = { total_trips: 0, sale_count: 0, purchase_count: 0, total_bhada: 0, total_paid: 0, total_pending: 0, settled_count: 0, partial_count: 0, pending_count: 0, extra_paid_unallocated: 0 };

    for (const [vno, trucks] of Object.entries(truckMap)) {
      const truckVWs = [...trucks].filter(vw => {
        if (date_from && (vw.date || '') < date_from) return false;
        if (date_to && (vw.date || '') > date_to) return false;
        return true;
      }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const truckNiks = ledgerNikasis.filter(n => n.category === vno);
      const directPaid = {};
      let pool = 0;
      let totalPaidPool = 0;
      for (const n of truckNiks) {
        const ref = n.reference || '';
        const amt = parseFloat(n.amount) || 0;
        totalPaidPool += amt;
        if (ref.startsWith('truck_settle_ledger:')) {
          const parts = ref.split(':');
          const rst = parseInt(parts[parts.length - 1]);
          if (!isNaN(rst)) { directPaid[rst] = (directPaid[rst] || 0) + amt; continue; }
        }
        pool += amt;
      }
      let totalBhadaTruck = 0;
      for (const vw of truckVWs) {
        const bhada = parseFloat(vw.bhada || 0) || 0;
        const tt = (vw.trans_type || '').toLowerCase();
        const isSale = tt.includes('sale') || tt.includes('dispatch');
        const isPurchase = tt.includes('purchase') || tt.includes('receive');
        const ttype = isSale ? 'sale' : (isPurchase ? 'purchase' : 'other');
        let paid = Math.min(directPaid[vw.rst_no] || 0, bhada);
        const remaining = bhada - paid;
        if (remaining > 0 && pool > 0) { const take = Math.min(pool, remaining); paid += take; pool -= take; }
        let status;
        if (paid >= bhada && bhada > 0) status = 'settled';
        else if (paid > 0) status = 'partial';
        else status = 'pending';
        allTrips.push({
          rst_no: vw.rst_no, date: vw.date || '', vehicle_no: vno,
          trans_type: ttype, trans_type_raw: vw.trans_type || '',
          party_name: vw.party_name || '', farmer_name: vw.farmer_name || '',
          product: vw.product || '', tot_pkts: vw.tot_pkts || 0, net_wt: vw.net_wt || 0,
          bhada, paid_amount: Math.round(paid * 100) / 100,
          pending_amount: Math.round((bhada - paid) * 100) / 100, status, vw_id: vw.id,
        });
        agg.total_trips++;
        if (ttype === 'sale') agg.sale_count++; else if (ttype === 'purchase') agg.purchase_count++;
        agg.total_bhada += bhada; agg.total_paid += paid;
        if (status === 'settled') agg.settled_count++;
        else if (status === 'partial') agg.partial_count++;
        else agg.pending_count++;
        totalBhadaTruck += bhada;
      }
      agg.extra_paid_unallocated += Math.max(0, totalPaidPool - totalBhadaTruck);
    }
    agg.total_pending = Math.round((agg.total_bhada - agg.total_paid) * 100) / 100;
    agg.total_bhada = Math.round(agg.total_bhada * 100) / 100;
    agg.total_paid = Math.round(agg.total_paid * 100) / 100;
    agg.extra_paid_unallocated = Math.round(agg.extra_paid_unallocated * 100) / 100;

    let filtered = allTrips;
    if (filter_status && filter_status !== 'all') {
      filtered = filtered.filter(t => t.status === filter_status);
    }
    filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || ((b.rst_no || 0) - (a.rst_no || 0)));
    res.json({ trips: filtered, summary: agg, total_trucks: Object.keys(truckMap).length });
  }));

  router.get('/api/truck-owner/per-trip-pending-count', safeAsync(async (req, res) => {
    const { kms_year, season } = req.query;
    const vws = col('vehicle_weights');
    const truckMap = {};
    for (const vw of vws) {
      const v = (vw.vehicle_no || '').trim();
      const b = parseFloat(vw.bhada || 0) || 0;
      if (!v || b <= 0) continue;
      if (kms_year && vw.kms_year !== kms_year) continue;
      if (season && vw.season !== season) continue;
      if (!truckMap[v]) truckMap[v] = [];
      truckMap[v].push(vw);
    }
    let pending = 0;
    const ledgerNikasis = col('cash_transactions').filter(t =>
      t.account === 'ledger' && t.party_type === 'Truck' && t.txn_type === 'nikasi'
    );
    for (const [vno, trucks] of Object.entries(truckMap)) {
      const truckVWs = [...trucks].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const truckNiks = ledgerNikasis.filter(n => n.category === vno);
      const directPaid = {};
      let pool = 0;
      for (const n of truckNiks) {
        const ref = n.reference || '';
        if (ref.startsWith('truck_settle_ledger:')) {
          const parts = ref.split(':');
          const targetRst = parseInt(parts[parts.length - 1]);
          if (!isNaN(targetRst)) { directPaid[targetRst] = (directPaid[targetRst] || 0) + (parseFloat(n.amount) || 0); continue; }
        }
        pool += parseFloat(n.amount) || 0;
      }
      for (const vw of truckVWs) {
        const bhada = parseFloat(vw.bhada || 0) || 0;
        let paid = Math.min(directPaid[vw.rst_no] || 0, bhada);
        const remaining = bhada - paid;
        if (remaining > 0 && pool > 0) { const take = Math.min(pool, remaining); paid += take; pool -= take; }
        if (paid < bhada) pending++;
      }
    }
    res.json({ pending_count: pending });
  }));

  router.get('/api/truck-owner/:vehicle_no/per-trip', safeAsync(async (req, res) => {
    const vno = (req.params.vehicle_no || '').trim();
    if (!vno) return res.status(400).json({ detail: 'vehicle_no required' });
    const { kms_year, season, date_from, date_to } = req.query;

    const vws = col('vehicle_weights').filter(vw => {
      if ((vw.vehicle_no || '').trim() !== vno) return false;
      const b = parseFloat(vw.bhada || 0) || 0;
      if (b <= 0) return false;
      if (kms_year && vw.kms_year !== kms_year) return false;
      if (season && vw.season !== season) return false;
      if (date_from && (vw.date || '') < date_from) return false;
      if (date_to && (vw.date || '') > date_to) return false;
      return true;
    });
    vws.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.created_at || '').localeCompare(b.created_at || '') || ((a.rst_no || 0) - (b.rst_no || 0)));

    const nikasis = col('cash_transactions').filter(t =>
      t.account === 'ledger' && t.party_type === 'Truck' && t.category === vno && t.txn_type === 'nikasi' &&
      (!kms_year || t.kms_year === kms_year)
    );
    nikasis.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Step 1: Direct trip-targeted settlements (reference = truck_settle_ledger:{vno}:{rst})
    const directPaid = {};
    const poolNikasis = [];
    for (const n of nikasis) {
      const ref = n.reference || '';
      if (ref.startsWith('truck_settle_ledger:')) {
        const parts = ref.split(':');
        if (parts.length >= 3) {
          const targetRst = parseInt(parts[parts.length - 1]);
          if (!isNaN(targetRst)) {
            directPaid[targetRst] = (directPaid[targetRst] || 0) + (parseFloat(n.amount || 0) || 0);
            continue;
          }
        }
      }
      poolNikasis.push(n);
    }
    let pool = poolNikasis.reduce((s, n) => s + (parseFloat(n.amount || 0) || 0), 0);
    const totalPaidPool = nikasis.reduce((s, n) => s + (parseFloat(n.amount || 0) || 0), 0);

    const trips = [];
    for (const vw of vws) {
      const bhada = parseFloat(vw.bhada || 0) || 0;
      const tt = (vw.trans_type || '').toLowerCase();
      const isSale = tt.includes('sale') || tt.includes('dispatch');
      const isPurchase = tt.includes('purchase') || tt.includes('receive');
      const ttype = isSale ? 'sale' : (isPurchase ? 'purchase' : 'other');

      let paid = Math.min(directPaid[vw.rst_no] || 0, bhada);
      const remaining = bhada - paid;
      if (remaining > 0 && pool > 0) {
        const take = Math.min(pool, remaining);
        paid += take;
        pool -= take;
      }

      let status;
      if (paid >= bhada && bhada > 0) status = 'settled';
      else if (paid > 0) status = 'partial';
      else status = 'pending';

      trips.push({
        rst_no: vw.rst_no, date: vw.date || '', trans_type: ttype, trans_type_raw: vw.trans_type || '',
        party_name: vw.party_name || '', farmer_name: vw.farmer_name || '',
        product: vw.product || '', tot_pkts: vw.tot_pkts || 0, net_wt: vw.net_wt || 0,
        bhada, paid_amount: Math.round(paid * 100) / 100,
        pending_amount: Math.round((bhada - paid) * 100) / 100,
        status, vw_id: vw.id,
      });
    }
    trips.sort((a, b) => (b.date || '').localeCompare(a.date || '') || ((b.rst_no || 0) - (a.rst_no || 0)));

    const totalBhada = trips.reduce((s, t) => s + t.bhada, 0);
    const totalPaid = trips.reduce((s, t) => s + t.paid_amount, 0);
    res.json({
      vehicle_no: vno, driver_name: '',
      trips,
      summary: {
        total_trips: trips.length,
        sale_count: trips.filter(t => t.trans_type === 'sale').length,
        purchase_count: trips.filter(t => t.trans_type === 'purchase').length,
        total_bhada: Math.round(totalBhada * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        total_pending: Math.round((totalBhada - totalPaid) * 100) / 100,
        settled_count: trips.filter(t => t.status === 'settled').length,
        partial_count: trips.filter(t => t.status === 'partial').length,
        pending_count: trips.filter(t => t.status === 'pending').length,
        extra_paid_unallocated: Math.round(Math.max(0, totalPaidPool - totalBhada) * 100) / 100,
      },
    });
  }));

  router.post('/api/truck-owner/:vehicle_no/settle/:rst_no', safeAsync(async (req, res) => {
    const vno = (req.params.vehicle_no || '').trim();
    const rstNo = parseInt(req.params.rst_no);
    if (!vno || isNaN(rstNo)) return res.status(400).json({ detail: 'vehicle_no + rst_no required' });

    const vw = col('vehicle_weights').find(v => (v.vehicle_no || '').trim() === vno && Number(v.rst_no) === rstNo);
    if (!vw) return res.status(404).json({ detail: 'VW entry not found' });
    const bhada = parseFloat(vw.bhada || 0) || 0;
    if (bhada <= 0) return res.status(400).json({ detail: 'No bhada on this trip' });

    const data = req.body || {};
    const amount = parseFloat(data.amount || bhada) || bhada;
    if (amount <= 0) return res.status(400).json({ detail: 'Amount > 0 chahiye' });
    const note = data.note || '';
    const roundOff = parseFloat(data.round_off || 0) || 0;
    let payAccount = (data.account || data.payment_mode || 'cash').toLowerCase();
    if (!['cash', 'bank', 'owner'].includes(payAccount)) payAccount = 'cash';
    if (payAccount === 'bank' && !data.bank_name) return res.status(400).json({ detail: 'Bank name select karein' });
    if (payAccount === 'owner' && !data.owner_name) return res.status(400).json({ detail: 'Owner account select karein' });
    const bankName = payAccount === 'bank' ? (data.bank_name || '') : '';
    const ownerName = payAccount === 'owner' ? (data.owner_name || '') : '';
    const dateStr = data.date || new Date().toISOString().split('T')[0];
    const username = data.username || 'system';
    const partyLabel = vw.farmer_name || vw.party_name || '';
    let descBase = `Bhada Settle (RST #${rstNo} → ${partyLabel})`;
    if (note) descBase += ` - ${note}`;
    const nowIso = new Date().toISOString();
    const ts = `${Date.now()}_${vno}_${rstNo}`;

    // 1. Cash/Bank/Owner NIKASI
    col('cash_transactions').push({
      id: `txn_${ts}`,
      date: dateStr, account: payAccount, bank_name: bankName, owner_name: ownerName,
      txn_type: 'nikasi', category: vno, party_type: 'Truck',
      description: descBase, amount,
      reference: `truck_settle:${vno}:${rstNo}`,
      linked_entry_id: vw.id, kms_year: vw.kms_year || '', season: vw.season || 'Kharif',
      created_by: username, created_at: nowIso,
    });

    // 2. Ledger NIKASI for FIFO settlement
    const ownerTotal = Math.round((amount + roundOff) * 100) / 100;
    const descLedger = descBase + (roundOff ? ` (Pay: ${amount}, Round Off: ${roundOff})` : '');
    col('cash_transactions').push({
      id: `txn_ledger_${ts}_${uuidv4().slice(0, 6)}`,
      date: dateStr, account: 'ledger',
      txn_type: 'nikasi', category: vno, party_type: 'Truck',
      description: descLedger, amount: ownerTotal,
      reference: `truck_settle_ledger:${vno}:${rstNo}`,
      linked_entry_id: vw.id, kms_year: vw.kms_year || '', season: vw.season || 'Kharif',
      created_by: username, created_at: nowIso,
    });

    database.save();
    res.json({ success: true, settled_amount: amount, round_off: roundOff, rst_no: rstNo, payment_mode: payAccount });
  }));

  router.get('/api/truck-owner/:vehicle_no/trip-history/:rst_no', safeAsync(async (req, res) => {
    const vno = (req.params.vehicle_no || '').trim();
    const rstNo = parseInt(req.params.rst_no);
    const direct = col('cash_transactions').filter(t =>
      t.category === vno && t.party_type === 'Truck' && t.txn_type === 'nikasi' &&
      (t.reference === `truck_settle:${vno}:${rstNo}` || t.reference === `truck_settle_ledger:${vno}:${rstNo}`)
    ).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    res.json({ vehicle_no: vno, rst_no: rstNo, payments: direct });
  }));

  // ════════════════════════════════════════════════════════════════════════════
  // 🛻 TRUCK OWNER — All Trucks Per-Trip PDF / Excel Export (combined view)
  // ════════════════════════════════════════════════════════════════════════════

  /** Build all-trucks per-trip payload with filtering. Mirrors Python _build_pertrip_all_payload. */
  function _buildPerTripAllPayload(query) {
    const { kms_year, season, date_from, date_to, filter_status, trans_type, search } = query || {};
    const vws = col('vehicle_weights');
    const truckMap = {};
    for (const vw of vws) {
      const v = (vw.vehicle_no || '').trim();
      const b = parseFloat(vw.bhada || 0) || 0;
      if (!v || b <= 0) continue;
      if (kms_year && vw.kms_year !== kms_year) continue;
      if (season && vw.season !== season) continue;
      if (!truckMap[v]) truckMap[v] = [];
      truckMap[v].push(vw);
    }
    const ledgerNikasis = col('cash_transactions').filter(t =>
      t.account === 'ledger' && t.party_type === 'Truck' && t.txn_type === 'nikasi' &&
      (!kms_year || t.kms_year === kms_year)
    );
    const allTrips = [];
    for (const [vno, trucks] of Object.entries(truckMap)) {
      const truckVWs = [...trucks].filter(vw => {
        if (date_from && (vw.date || '') < date_from) return false;
        if (date_to && (vw.date || '') > date_to) return false;
        return true;
      }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const truckNiks = ledgerNikasis.filter(n => n.category === vno);
      const directPaid = {};
      let pool = 0;
      for (const n of truckNiks) {
        const ref = n.reference || '';
        const amt = parseFloat(n.amount) || 0;
        if (ref.startsWith('truck_settle_ledger:')) {
          const parts = ref.split(':');
          const rst = parseInt(parts[parts.length - 1]);
          if (!isNaN(rst)) { directPaid[rst] = (directPaid[rst] || 0) + amt; continue; }
        }
        pool += amt;
      }
      for (const vw of truckVWs) {
        const bhada = parseFloat(vw.bhada || 0) || 0;
        const tt = (vw.trans_type || '').toLowerCase();
        const isSale = tt.includes('sale') || tt.includes('dispatch');
        const isPurchase = tt.includes('purchase') || tt.includes('receive');
        const ttype = isSale ? 'sale' : (isPurchase ? 'purchase' : 'other');
        let paid = Math.min(directPaid[vw.rst_no] || 0, bhada);
        const remaining = bhada - paid;
        if (remaining > 0 && pool > 0) { const take = Math.min(pool, remaining); paid += take; pool -= take; }
        let status;
        if (paid >= bhada && bhada > 0) status = 'settled';
        else if (paid > 0) status = 'partial';
        else status = 'pending';
        allTrips.push({
          rst_no: vw.rst_no, date: vw.date || '', vehicle_no: vno,
          trans_type: ttype, trans_type_raw: vw.trans_type || '',
          party_name: vw.party_name || '', farmer_name: vw.farmer_name || '',
          product: vw.product || '', tot_pkts: vw.tot_pkts || 0, net_wt: vw.net_wt || 0,
          bhada, paid_amount: Math.round(paid * 100) / 100,
          pending_amount: Math.round((bhada - paid) * 100) / 100, status,
        });
      }
    }
    let filtered = allTrips;
    if (filter_status && filter_status !== 'all') {
      filtered = filtered.filter(t => t.status === filter_status);
    }
    const tt = (trans_type || 'all').toLowerCase().trim();
    if (tt && tt !== 'all') filtered = filtered.filter(t => (t.trans_type || '') === tt);
    const s = (search || '').trim().toLowerCase();
    if (s) {
      filtered = filtered.filter(t => {
        const hay = `${t.vehicle_no || ''} ${t.party_name || ''} ${t.farmer_name || ''} ${t.rst_no || ''}`.toLowerCase();
        return hay.includes(s);
      });
    }
    filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || ((b.rst_no || 0) - (a.rst_no || 0)));
    const sm = {
      total_trips: filtered.length,
      sale_count: filtered.filter(t => t.trans_type === 'sale').length,
      purchase_count: filtered.filter(t => t.trans_type === 'purchase').length,
      total_bhada: Math.round(filtered.reduce((s2, t) => s2 + (t.bhada || 0), 0) * 100) / 100,
      total_paid: Math.round(filtered.reduce((s2, t) => s2 + (t.paid_amount || 0), 0) * 100) / 100,
      total_pending: Math.round(filtered.reduce((s2, t) => s2 + (t.pending_amount || 0), 0) * 100) / 100,
      settled_count: filtered.filter(t => t.status === 'settled').length,
      partial_count: filtered.filter(t => t.status === 'partial').length,
      pending_count: filtered.filter(t => t.status === 'pending').length,
    };
    return { trips: filtered, summary: sm, total_trucks: Object.keys(truckMap).length };
  }

  function _fmtIN(n) {
    const num = Number(n || 0);
    return num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function _flagFilterLabel(query) {
    const bits = [];
    if (query.filter_status && query.filter_status !== 'all') bits.push(`Status: ${query.filter_status}`);
    if (query.trans_type && query.trans_type !== 'all') bits.push(`Type: ${query.trans_type}`);
    if (query.search) bits.push(`Search: ${query.search}`);
    return bits.length ? bits.join(' · ') : 'All';
  }

  /** Filter the all-trucks payload to a single truck. Recomputes summary on filtered subset. */
  function _buildPerTripPayload(vehicleNo, query) {
    const data = _buildPerTripAllPayload(query);
    const vno = (vehicleNo || '').trim();
    const trips = data.trips.filter(t => t.vehicle_no === vno);
    const sm = {
      total_trips: trips.length,
      sale_count: trips.filter(t => t.trans_type === 'sale').length,
      purchase_count: trips.filter(t => t.trans_type === 'purchase').length,
      total_bhada: Math.round(trips.reduce((s2, t) => s2 + (t.bhada || 0), 0) * 100) / 100,
      total_paid: Math.round(trips.reduce((s2, t) => s2 + (t.paid_amount || 0), 0) * 100) / 100,
      total_pending: Math.round(trips.reduce((s2, t) => s2 + (t.pending_amount || 0), 0) * 100) / 100,
      settled_count: trips.filter(t => t.status === 'settled').length,
      partial_count: trips.filter(t => t.status === 'partial').length,
      pending_count: trips.filter(t => t.status === 'pending').length,
    };
    return { trips, summary: sm, vehicle_no: vno, total_trucks: 1 };
  }

  /** Render Per-Trip Bhada PDF — used by both all-trucks and single-truck endpoints.
   *  opts: { title, filenameBase, isAll, vehicleNo, query, fnameSuffix } */
  function _renderPerTripPdf(res, payload, opts) {
    const trips = payload.trips;
    const sm = payload.summary;
    const flt = _flagFilterLabel(opts.query);

    const br = database.data.branding || {};
    const company = br.company_name || 'NAVKAR AGRO';

    const fontDir = path.join(__dirname, '..', 'fonts');
    const hasFS = fs.existsSync(path.join(fontDir, 'FreeSans.ttf'));
    const doc = createPdfDoc({ size: 'A4', layout: 'landscape', margin: 25 }, database);
    if (hasFS) {
      doc.registerFont('ExFont', path.join(fontDir, 'FreeSans.ttf'));
      doc.registerFont('ExFontBold', path.join(fontDir, 'FreeSansBold.ttf'));
    }
    const efn = hasFS ? 'ExFont' : 'Helvetica';
    const efb = hasFS ? 'ExFontBold' : 'Helvetica-Bold';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `${opts.filenameBase}${opts.fnameSuffix || ''}.pdf`}`);
    doc.pipe(res);

    const PW = 792, LM = 25, TW = PW - 2 * LM;
    // ── Header ──
    doc.rect(LM, 18, TW, 3).fill('#f9a825');
    doc.rect(LM, 21, TW, 50).fill('#0d1b2a');
    doc.fontSize(18).font(efb).fillColor('#ffffff').text(company, LM, 28, { width: TW, align: 'center' });
    doc.fontSize(10).font(efn).fillColor('#7ec8e3').text(opts.title, LM, 50, { width: TW, align: 'center' });

    // Subtitle
    const subY = 75;
    doc.rect(LM, subY, TW, 18).fill('#e8edf5');
    doc.rect(LM, subY, 4, 18).fill('#1565c0');
    const subText = opts.isAll
      ? `KMS: ${opts.query.kms_year || 'All'}  ·  Season: ${opts.query.season || 'All'}  ·  Filter: ${flt}  ·  Trips: ${sm.total_trips}  ·  Trucks: ${payload.total_trucks}`
      : `KMS: ${opts.query.kms_year || 'All'}  ·  Season: ${opts.query.season || 'All'}  ·  Filter: ${flt}  ·  Trips: ${sm.total_trips}`;
    doc.fontSize(8).font(efn).fillColor('#1a237e').text(subText, LM + 12, subY + 5, { width: TW - 22, align: 'center' });

    // ── Trips Table ──
    let y = subY + 26;
    const headers = opts.isAll
      ? ['RST', 'Date', 'Truck No', 'Type', 'Party', 'Destination', 'Net Wt', 'Bhada', 'Paid', 'Pending', 'Status']
      : ['RST', 'Date', 'Type', 'Party', 'Destination', 'Net Wt', 'Bhada', 'Paid', 'Pending', 'Status'];
    const colW = opts.isAll
      ? [38, 60, 78, 50, 110, 110, 50, 60, 60, 60, 66]
      : [42, 70, 60, 140, 140, 60, 70, 70, 70, 80];
    const rightAlign = opts.isAll
      ? [false, false, false, false, false, false, true, true, true, true, false]
      : [false, false, false, false, false, true, true, true, true, false];

    const drawHeader = (yPos) => {
      doc.rect(LM, yPos, TW, 18).fill('#0d1b2a');
      doc.fontSize(8.5).font(efb).fillColor('#ffffff');
      let hx = LM + 4;
      headers.forEach((h, i) => {
        doc.text(h, hx, yPos + 6, { width: colW[i] - 6, align: rightAlign[i] ? 'right' : (i === headers.length - 1 ? 'center' : 'left') });
        hx += colW[i];
      });
      return yPos + 18;
    };
    y = drawHeader(y);

    if (trips.length === 0) {
      doc.fontSize(10).font(efn).fillColor('#9e9e9e').text('No trips found for the selected filters.', LM, y + 8, { width: TW, align: 'center' });
      y += 30;
    }

    doc.font(efn).fontSize(7.5);
    trips.forEach((t, idx) => {
      if (y > 470) { doc.addPage(); y = 25; y = drawHeader(y); doc.font(efn).fontSize(7.5); }
      const rowColor = idx % 2 === 0 ? '#ffffff' : '#f7f9fc';
      doc.rect(LM, y, TW, 14).fill(rowColor);

      // Status cell color
      const statusOffsetX = LM + colW.slice(0, -1).reduce((a, b) => a + b, 0);
      let stColor = '#ffcdd2', stText = '#b71c1c';
      if (t.status === 'settled') { stColor = '#c8e6c9'; stText = '#1b5e20'; }
      else if (t.status === 'partial') { stColor = '#ffe0b2'; stText = '#e65100'; }
      doc.rect(statusOffsetX, y, colW[colW.length - 1], 14).fill(stColor);

      // Subtle column separators
      let sepX = LM;
      colW.forEach((w) => { sepX += w; doc.lineWidth(0.2).strokeColor('#d5dbe5').moveTo(sepX, y).lineTo(sepX, y + 14).stroke(); });

      let x = LM + 4;
      const valsAll = [
        `#${t.rst_no}`,
        fmtDate(t.date),
        t.vehicle_no || '-',
        t.trans_type === 'sale' ? 'Sale' : (t.trans_type === 'purchase' ? 'Purchase' : (t.trans_type_raw || '-')),
        (t.party_name || '-').slice(0, 20),
        (t.farmer_name || '-').slice(0, 20),
        t.net_wt ? Number(t.net_wt).toLocaleString() : '-',
        `Rs.${_fmtIN(t.bhada)}`,
        t.paid_amount ? `Rs.${_fmtIN(t.paid_amount)}` : '-',
        t.pending_amount ? `Rs.${_fmtIN(t.pending_amount)}` : '-',
        t.status[0].toUpperCase() + t.status.slice(1),
      ];
      const vals = opts.isAll ? valsAll : [valsAll[0], valsAll[1], valsAll[3], valsAll[4], valsAll[5], valsAll[6], valsAll[7], valsAll[8], valsAll[9], valsAll[10]];

      vals.forEach((v, i) => {
        const isStatusCol = i === vals.length - 1;
        const isRstCol = i === 0;
        const isTruckCol = opts.isAll && i === 2;
        const isBhadaCol = opts.isAll ? i === 7 : i === 6;
        const isPendingCol = opts.isAll ? i === 9 : i === 8;
        if (isStatusCol) { doc.font(efb).fillColor(stText); }
        else if (isRstCol) { doc.font(efb).fillColor('#1a237e'); }
        else if (isTruckCol) { doc.font(efb).fillColor('#0277bd'); }
        else if (isBhadaCol) { doc.font(efb).fillColor('#e65100'); }
        else if (isPendingCol && t.pending_amount > 0) { doc.font(efb).fillColor('#b71c1c'); }
        else { doc.font(efn).fillColor('#212121'); }
        doc.text(String(v), x, y + 4, { width: colW[i] - 6, align: rightAlign[i] ? 'right' : (isStatusCol ? 'center' : 'left') });
        x += colW[i];
      });
      y += 14;
    });

    // ── KPI SUMMARY BANNER (BELOW the table) ──
    y += 8;
    if (y + 50 > doc.page.height - 40) { doc.addPage(); y = 30; }

    const tiles = [
      { lbl: 'TOTAL TRIPS',  val: String(sm.total_trips), sub: `Sale ${sm.sale_count} · Purchase ${sm.purchase_count}`, color: '#1a237e' },
      { lbl: 'TOTAL BHADA',  val: `Rs.${_fmtIN(sm.total_bhada)}`, sub: '', color: '#e65100' },
      { lbl: 'SETTLED',      val: `Rs.${_fmtIN(sm.total_paid)}`,  sub: `${sm.settled_count} trips`, color: '#1b5e20' },
      { lbl: 'PARTIAL',      val: `${sm.partial_count} trip(s)`,  sub: '', color: '#f57f17' },
      { lbl: 'PENDING',      val: `Rs.${_fmtIN(sm.total_pending)}`, sub: `${sm.pending_count} trips`, color: '#b71c1c' },
    ];
    const tileW = TW / tiles.length;
    const tileH = 50;
    tiles.forEach((tile, i) => {
      const tx = LM + i * tileW;
      // Tile background
      doc.rect(tx + 2, y, tileW - 4, tileH).fill(tile.color);
      // Label
      doc.fontSize(8).font(efb).fillColor('#ffffff').text(tile.lbl, tx + 2, y + 6, { width: tileW - 4, align: 'center' });
      // Value
      doc.fontSize(13).font(efb).fillColor('#ffffff').text(tile.val, tx + 2, y + 18, { width: tileW - 4, align: 'center' });
      // Sub
      if (tile.sub) doc.fontSize(7).font(efn).fillColor('#ffffffcc').text(tile.sub, tx + 2, y + 36, { width: tileW - 4, align: 'center' });
    });

    // Footer
    doc.fontSize(7).font(efn).fillColor('#9e9e9e');
    const footerLine = opts.isAll
      ? `Generated on ${new Date().toLocaleDateString('en-IN')}  ·  ${trips.length} trip(s) across ${payload.total_trucks} truck(s)  ·  Filter: ${flt}`
      : `Generated on ${new Date().toLocaleDateString('en-IN')}  ·  ${trips.length} trip(s) for ${opts.vehicleNo || ''}  ·  Filter: ${flt}`;
    doc.text(footerLine, LM, doc.page.height - 25, { width: TW, align: 'center' });

    doc.end();
  }

  /** Render Per-Trip Bhada Excel — professional layout with KPI banner below the table. */
  async function _renderPerTripExcel(res, payload, opts) {
    const ExcelJS = require('exceljs');
    const trips = payload.trips;
    const sm = payload.summary;
    const flt = _flagFilterLabel(opts.query);
    const br = database.data.branding || {};
    const company = br.company_name || 'NAVKAR AGRO';

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(opts.isAll ? 'Per-Trip Bhada (All)' : `Per-Trip ${(opts.vehicleNo || '').slice(0, 25)}`);
    ws.views = [{ showGridLines: false }];

    const NAVY = '0D1B2A';
    const LIGHT_GREY = 'F7F9FC';
    const BORDER_GREY = 'D5DBE5';
    const thinBorder = { style: 'thin', color: { argb: BORDER_GREY } };
    const fullBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    const headers = opts.isAll
      ? ['RST', 'Date', 'Truck No', 'Type', 'Party', 'Destination', 'Net Wt (KG)', 'Bhada', 'Paid', 'Pending', 'Status']
      : ['RST', 'Date', 'Type', 'Party', 'Destination', 'Net Wt (KG)', 'Bhada', 'Paid', 'Pending', 'Status'];
    const nCols = headers.length;
    const lastCol = String.fromCharCode(64 + nCols);

    // Row 1 — Branding banner
    ws.getRow(1).height = 32;
    ws.mergeCells(`A1:${lastCol}1`);
    const brand = ws.getCell('A1');
    brand.value = company;
    brand.font = { name: 'Inter', bold: true, size: 18, color: { argb: 'FFFFFF' } };
    brand.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    brand.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 2; c <= nCols; c++) {
      ws.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    }

    // Row 2 — Subtitle
    ws.getRow(2).height = 20;
    ws.mergeCells(`A2:${lastCol}2`);
    const subTitle = ws.getCell('A2');
    subTitle.value = opts.isAll ? 'Per-Trip Bhada Report — All Trucks' : `Per-Trip Bhada Report — ${opts.vehicleNo}`;
    subTitle.font = { name: 'Inter', size: 10, color: { argb: 'E0E0E0' } };
    subTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    subTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 2; c <= nCols; c++) {
      ws.getRow(2).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    }

    // Row 3 — Filter info strip
    ws.getRow(3).height = 22;
    ws.mergeCells(`A3:${lastCol}3`);
    const filterStrip = opts.isAll
      ? `KMS: ${opts.query.kms_year || 'All'}  |  Season: ${opts.query.season || 'All'}  |  Filter: ${flt}  |  Trips: ${sm.total_trips}  |  Trucks: ${payload.total_trucks}`
      : `KMS: ${opts.query.kms_year || 'All'}  |  Season: ${opts.query.season || 'All'}  |  Filter: ${flt}  |  Trips: ${sm.total_trips}`;
    const filterCell = ws.getCell('A3');
    filterCell.value = filterStrip;
    filterCell.font = { name: 'Inter', size: 10, italic: true, color: { argb: '455A64' } };
    filterCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EAF2FA' } };
    filterCell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 2; c <= nCols; c++) {
      ws.getRow(3).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EAF2FA' } };
    }

    // Row 5 — Table header
    const HEADER_ROW = 5;
    ws.getRow(HEADER_ROW).height = 26;
    headers.forEach((h, i) => {
      const c = ws.getRow(HEADER_ROW).getCell(i + 1);
      c.value = h;
      c.font = { name: 'Inter', bold: true, size: 10, color: { argb: 'FFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = fullBorder;
    });

    // Data rows
    const DATA_START = HEADER_ROW + 1;
    trips.forEach((t, idx) => {
      const row = ws.getRow(DATA_START + idx);
      const valsAll = [
        `#${t.rst_no}`, t.date || '',
        t.vehicle_no || '',
        t.trans_type === 'sale' ? 'Sale' : (t.trans_type === 'purchase' ? 'Purchase' : (t.trans_type_raw || '-')),
        t.party_name || '-', t.farmer_name || '-',
        Number(t.net_wt || 0),
        Number(t.bhada || 0), Number(t.paid_amount || 0), Number(t.pending_amount || 0),
        t.status[0].toUpperCase() + t.status.slice(1),
      ];
      const vals = opts.isAll ? valsAll : [valsAll[0], valsAll[1], valsAll[3], valsAll[4], valsAll[5], valsAll[6], valsAll[7], valsAll[8], valsAll[9], valsAll[10]];
      const altFill = idx % 2 === 1 ? { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GREY } } : null;

      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.border = fullBorder;
        if (altFill) cell.fill = altFill;

        const colName = headers[i];
        if (colName === 'RST') {
          cell.font = { name: 'Inter', bold: true, size: 10, color: { argb: '1A237E' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colName === 'Date') {
          cell.font = { name: 'Inter', size: 10, color: { argb: '212121' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colName === 'Truck No') {
          cell.font = { name: 'Inter', bold: true, size: 10, color: { argb: '0277BD' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colName === 'Type') {
          cell.font = { name: 'Inter', size: 10, color: { argb: '212121' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colName === 'Party' || colName === 'Destination') {
          cell.font = { name: 'Inter', size: 10, color: { argb: '212121' } };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if (colName === 'Net Wt (KG)') {
          cell.font = { name: 'Inter', size: 10, color: { argb: '212121' } };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
        } else if (colName === 'Bhada') {
          cell.font = { name: 'Inter', bold: true, size: 10, color: { argb: 'E65100' } };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '"₹"#,##0';
        } else if (colName === 'Paid') {
          cell.font = { name: 'Inter', size: 10, color: { argb: t.paid_amount ? '2E7D32' : '9E9E9E' } };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '"₹"#,##0;[Red]"-"';
        } else if (colName === 'Pending') {
          cell.font = { name: 'Inter', bold: !!t.pending_amount, size: 10, color: { argb: t.pending_amount ? 'B71C1C' : '9E9E9E' } };
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '"₹"#,##0;[Red]"-"';
        } else if (colName === 'Status') {
          let bg = 'FFCDD2', fg = 'B71C1C';
          if (t.status === 'settled') { bg = 'C8E6C9'; fg = '1B5E20'; }
          else if (t.status === 'partial') { bg = 'FFE0B2'; fg = 'E65100'; }
          cell.font = { name: 'Inter', bold: true, size: 10, color: { argb: fg } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    });

    let DATA_END = trips.length > 0 ? DATA_START + trips.length - 1 : DATA_START - 1;
    if (trips.length === 0) {
      ws.mergeCells(`A${DATA_START}:${lastCol}${DATA_START}`);
      const empty = ws.getCell(`A${DATA_START}`);
      empty.value = 'No trips found for the selected filters.';
      empty.font = { name: 'Inter', italic: true, size: 10, color: { argb: '9E9E9E' } };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      empty.border = fullBorder;
      DATA_END = DATA_START;
    }

    // Auto-filter + freeze panes
    ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: Math.max(DATA_END, HEADER_ROW), column: nCols } };
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: HEADER_ROW }];

    // ── KPI BANNER (BELOW the table) ──
    const BANNER_ROW1 = DATA_END + 2;
    const BANNER_ROW2 = BANNER_ROW1 + 1;
    ws.getRow(BANNER_ROW1).height = 18;
    ws.getRow(BANNER_ROW2).height = 26;

    // 5 KPI tiles, distributed across nCols columns
    const tiles = [
      { lbl: 'TOTAL TRIPS', val: String(sm.total_trips), color: '1A237E' },
      { lbl: 'TOTAL BHADA', val: `₹${_fmtIN(sm.total_bhada)}`, color: 'E65100' },
      { lbl: 'SETTLED', val: `₹${_fmtIN(sm.total_paid)}`, color: '1B5E20' },
      { lbl: 'PARTIAL', val: `${sm.partial_count} trip(s)`, color: 'F57F17' },
      { lbl: 'PENDING', val: `₹${_fmtIN(sm.total_pending)}`, color: 'B71C1C' },
    ];
    // Distribute columns evenly (with last tile picking up any remainder)
    const colsPerTile = Math.floor(nCols / tiles.length);
    const tileColRanges = [];
    let cursor = 1;
    for (let i = 0; i < tiles.length; i++) {
      const isLast = i === tiles.length - 1;
      const span = isLast ? (nCols - cursor + 1) : colsPerTile;
      tileColRanges.push({ start: cursor, end: cursor + span - 1 });
      cursor += span;
    }

    tiles.forEach((tile, idx) => {
      const range = tileColRanges[idx];
      const c1 = String.fromCharCode(64 + range.start);
      const c2 = String.fromCharCode(64 + range.end);

      ws.mergeCells(`${c1}${BANNER_ROW1}:${c2}${BANNER_ROW1}`);
      const lblCell = ws.getCell(`${c1}${BANNER_ROW1}`);
      lblCell.value = tile.lbl;
      lblCell.font = { name: 'Inter', bold: true, size: 9, color: { argb: 'FFFFFF' } };
      lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tile.color } };
      lblCell.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let c = range.start; c <= range.end; c++) {
        ws.getRow(BANNER_ROW1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tile.color } };
      }

      ws.mergeCells(`${c1}${BANNER_ROW2}:${c2}${BANNER_ROW2}`);
      const valCell = ws.getCell(`${c1}${BANNER_ROW2}`);
      valCell.value = tile.val;
      valCell.font = { name: 'Inter', bold: true, size: 14, color: { argb: 'FFFFFF' } };
      valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tile.color } };
      valCell.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let c = range.start; c <= range.end; c++) {
        ws.getRow(BANNER_ROW2).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tile.color } };
      }
    });

    // Composition strip
    const COMP_ROW = BANNER_ROW2 + 1;
    ws.getRow(COMP_ROW).height = 18;
    ws.mergeCells(`A${COMP_ROW}:${lastCol}${COMP_ROW}`);
    const compCell = ws.getCell(`A${COMP_ROW}`);
    compCell.value = `Composition: ${sm.sale_count} Sale  ·  ${sm.purchase_count} Purchase  ·  ${sm.settled_count} Settled  ·  ${sm.partial_count} Partial  ·  ${sm.pending_count} Pending`;
    compCell.font = { name: 'Inter', size: 10, italic: true, color: { argb: '455A64' } };
    compCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F4F8' } };
    compCell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 2; c <= nCols; c++) {
      ws.getRow(COMP_ROW).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F4F8' } };
    }

    // Footer
    const FOOTER_ROW = COMP_ROW + 2;
    ws.mergeCells(`A${FOOTER_ROW}:${lastCol}${FOOTER_ROW}`);
    const fCell = ws.getCell(`A${FOOTER_ROW}`);
    fCell.value = opts.isAll
      ? `Generated on ${new Date().toLocaleDateString('en-IN')}  ·  ${sm.total_trips} trip(s) across ${payload.total_trucks} truck(s)  ·  Filter: ${flt}`
      : `Generated on ${new Date().toLocaleDateString('en-IN')}  ·  ${sm.total_trips} trip(s) for ${opts.vehicleNo}  ·  Filter: ${flt}`;
    fCell.font = { name: 'Inter', size: 9, italic: true, color: { argb: '9E9E9E' } };
    fCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Column widths
    const widthsAll = [10, 12, 18, 11, 26, 26, 12, 14, 14, 14, 14];
    const widthsSingle = [10, 12, 11, 28, 28, 12, 14, 14, 14, 14];
    (opts.isAll ? widthsAll : widthsSingle).forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${req.query.filename || `${opts.filenameBase}${opts.fnameSuffix || ''}.xlsx`}`);
    // 🎯 v104.44.9 — Apply consolidated multi-record polish (auto-filter + freeze + no gridlines)
    try { applyConsolidatedExcelPolish(wb.worksheets[0]); } catch (_) {}
    await wb.xlsx.write(res);
    res.end();
  }

  /** Generate WhatsApp-shareable text for a single truck. */
  function _buildWhatsAppText(vehicleNo, query) {
    const filterStatus = (query.filter_status || 'pending').toLowerCase();
    const payload = _buildPerTripPayload(vehicleNo, { ...query, filter_status: filterStatus });
    const sm = payload.summary;
    const trips = payload.trips.slice(0, 10);

    const lines = [];
    lines.push(`🛻 *${vehicleNo}* — ${filterStatus === 'pending' ? 'Pending' : 'Per-Trip'} Bhada`);
    lines.push('');
    lines.push(`📊 Trips: ${sm.total_trips}  ·  Bhada: ₹${_fmtIN(sm.total_bhada)}`);
    lines.push(`✅ Paid: ₹${_fmtIN(sm.total_paid)}  ·  ⚠️ Pending: ₹${_fmtIN(sm.total_pending)}`);
    lines.push('');
    if (trips.length > 0) {
      lines.push('*Trip details:*');
      for (const t of trips) {
        const tag = t.trans_type === 'sale' ? '🟢' : '🔵';
        const stEmoji = t.status === 'settled' ? '✅' : (t.status === 'partial' ? '🟡' : '⚠️');
        const party = (t.party_name || t.farmer_name || '').slice(0, 22);
        lines.push(`${tag} RST #${t.rst_no} · ${t.date} · ${party} · ₹${_fmtIN(t.bhada)} ${stEmoji}`);
      }
    }
    if (payload.trips.length > 10) lines.push(`... +${payload.trips.length - 10} more`);
    lines.push('');
    lines.push(`_Total pending: ₹${_fmtIN(sm.total_pending)}_`);

    return { text: lines.join('\n'), vehicle_no: vehicleNo, summary: sm };
  }

  // ── Routes — All Trucks ──
  router.get('/api/truck-owner/per-trip-all/pdf', safeAsync(async (req, res) => {
    const payload = _buildPerTripAllPayload(req.query);
    const fnameSuffix = (req.query.filter_status && req.query.filter_status !== 'all') ? `_${req.query.filter_status}` : '';
    _renderPerTripPdf(res, payload, {
      title: 'Per-Trip Bhada — All Trucks',
      filenameBase: 'per_trip_bhada_all_trucks',
      fnameSuffix, isAll: true, query: req.query,
    });
  }));

  router.get('/api/truck-owner/per-trip-all/excel', safeAsync(async (req, res) => {
    const payload = _buildPerTripAllPayload(req.query);
    const fnameSuffix = (req.query.filter_status && req.query.filter_status !== 'all') ? `_${req.query.filter_status}` : '';
    await _renderPerTripExcel(res, payload, {
      filenameBase: 'per_trip_bhada_all_trucks',
      fnameSuffix, isAll: true, query: req.query,
    });
  }));

  // ── Routes — Single Truck (Node parity for Python /per-trip-pdf, /per-trip-excel, /whatsapp-text) ──
  router.get('/api/truck-owner/:vehicle_no/per-trip-pdf', safeAsync(async (req, res) => {
    const vno = (req.params.vehicle_no || '').trim();
    if (!vno) return res.status(400).json({ detail: 'vehicle_no required' });
    const payload = _buildPerTripPayload(vno, req.query);
    const safeVno = vno.replace(/[^a-zA-Z0-9_-]/g, '_');
    const titleKind = (req.query.filter_status === 'pending') ? 'Pending Bhada' : 'Per-Trip Bhada';
    const fnameSuffix = (req.query.filter_status && req.query.filter_status !== 'all') ? `_${req.query.filter_status}` : '';
    _renderPerTripPdf(res, payload, {
      title: `${titleKind} — ${vno}`,
      filenameBase: `${safeVno}_per_trip_bhada`,
      fnameSuffix, isAll: false, vehicleNo: vno, query: req.query,
    });
  }));

  router.get('/api/truck-owner/:vehicle_no/per-trip-excel', safeAsync(async (req, res) => {
    const vno = (req.params.vehicle_no || '').trim();
    if (!vno) return res.status(400).json({ detail: 'vehicle_no required' });
    const payload = _buildPerTripPayload(vno, req.query);
    const safeVno = vno.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fnameSuffix = (req.query.filter_status && req.query.filter_status !== 'all') ? `_${req.query.filter_status}` : '';
    await _renderPerTripExcel(res, payload, {
      filenameBase: `${safeVno}_per_trip_bhada`,
      fnameSuffix, isAll: false, vehicleNo: vno, query: req.query,
    });
  }));

  router.get('/api/truck-owner/:vehicle_no/whatsapp-text', safeAsync(async (req, res) => {
    const vno = (req.params.vehicle_no || '').trim();
    if (!vno) return res.status(400).json({ detail: 'vehicle_no required' });
    res.json(_buildWhatsAppText(vno, req.query));
  }));

  return router;
};
