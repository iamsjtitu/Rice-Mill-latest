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
const { fmtDate, createPdfDoc, registerFonts, F, addPdfHeader } = require('./pdf_helpers');
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

  // ── Helper: Next RST number ──
  function getNextRst(kmsYear) {
    const weights = col('vehicle_weights');
    const filtered = kmsYear ? weights.filter(w => w.kms_year === kmsYear) : weights;
    if (filtered.length === 0) return 1;
    const maxRst = Math.max(...filtered.map(w => parseInt(w.rst_no, 10) || 0));
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

  function sendWaMessage(apiKey, phone, text, mediaUrl) {
    return new Promise((resolve) => {
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

        // Get branding from settings
        const branding = (col('app_settings') || []).find(s => s.setting_id === 'branding') || {};

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
          doc.font(F('normal')).fontSize(7.5).fillColor('#555').text(lbl1, LM + 3, ty, { width: colW - 6, lineBreak: false });
          doc.font(F('bold')).fontSize(8.5).fillColor('#000').text(String(val1).substring(0, 26), LM + colW + 3, ty, { width: colW - 6, lineBreak: false });
          doc.font(F('normal')).fontSize(7.5).fillColor('#555').text(lbl2, LM + 2 * colW + 3, ty, { width: colW - 6, lineBreak: false });
          doc.font(F('bold')).fontSize(8.5).fillColor('#000').text(String(val2).substring(0, 26), LM + 3 * colW + 3, ty, { width: colW - 6, lineBreak: false });
          y += rowH;
        }

        drawGridRow('RST No.', `#${rst}`, 'Date / दिनांक', fmtDate(entry.date || ''), true);
        drawGridRow('Vehicle / गाड़ी', entry.vehicle_no || '-', 'Trans Type', entry.trans_type || '-', false);
        drawGridRow('Party / पार्टी', entry.party_name || '-', 'Source/Mandi', entry.farmer_name || '-', true);
        drawGridRow('Product / माल', entry.product || '-', 'Bags / बोरे', bags ? String(bags) : '-', false);
        // Conditional rows
        if (gIssued || tpNo) drawGridRow('G.Issued', gIssued ? String(Math.round(gIssued)) : '-', 'TP No.', tpNo || '-', true);
        if (tpWt || remark) drawGridRow('TP Weight', tpWt ? `${tpWt} Q` : '-', 'Remark', remark || '-', false);

        y += 4;

        // ── Weight Bars + Compact Photos ──
        function drawWeightBar(label, wt, timeStr, frontKey, sideKey, bgColor) {
          doc.rect(LM, y, PW, 18).fill(bgColor);
          doc.font(F('bold')).fontSize(9).fillColor('#fff').text(label, LM + 4, y + 4, { width: PW * 0.35, lineBreak: false });
          doc.font(F('bold')).fontSize(10).fillColor('#fff').text(`${Number(wt).toLocaleString()} KG`, LM + PW * 0.35, y + 3, { width: PW * 0.3, align: 'center', lineBreak: false });
          doc.font(F('normal')).fontSize(7.5).fillColor('#ddd').text(`Time: ${fmtIST(timeStr)}`, LM + PW * 0.65, y + 5, { width: PW * 0.33, align: 'right', lineBreak: false });
          y += 18;

          const imgW = PW / 2 - 4;
          const imgH = 80;
          const frontB64 = loadImageB64(entry[frontKey] || '');
          const sideB64 = loadImageB64(entry[sideKey] || '');
          if (frontB64 || sideB64) {
            if (frontB64) { try { doc.image(Buffer.from(frontB64, 'base64'), LM, y + 1, { width: imgW, height: imgH, fit: [imgW, imgH] }); } catch(e) {} }
            if (sideB64) { try { doc.image(Buffer.from(sideB64, 'base64'), LM + imgW + 8, y + 1, { width: imgW, height: imgH, fit: [imgW, imgH] }); } catch(e) {} }
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
          doc.font(F('normal')).fontSize(5.5).fillColor(b.fg).text(b.label, bx + 2, y + 3, { width: boxW - 4, align: 'center' });
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
        hostname: 'api.360messenger.com', path: '/v2/sendGroup', method: 'POST',
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
        hostname: 'api.360messenger.com', path: '/v2/sendMessage', method: 'POST',
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
    let entries = col('entries');
    if (kmsYear) entries = entries.filter(e => e.kms_year === kmsYear);
    const linked = [...new Set(entries.map(e => parseInt(e.rst_no)).filter(n => !isNaN(n)))];
    res.json({ linked_rst: linked });
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

    const editable = ['vehicle_no', 'party_name', 'farmer_name', 'product', 'tot_pkts', 'cash_paid', 'diesel_paid', 'g_issued', 'tp_no', 'tp_weight', 'remark'];
    for (const f of editable) {
      if (f in req.body) {
        if (f === 'cash_paid' || f === 'diesel_paid' || f === 'tp_weight') {
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
      const rows = [
        ['RST No.', `#${rst}`, 'Date / \u0926\u093f\u0928\u093e\u0902\u0915', fmtDate(entry.date) || ''],
        ['Vehicle / \u0917\u093e\u0921\u093c\u0940', entry.vehicle_no || '', 'Trans Type', entry.trans_type || ''],
        ['Party / \u092a\u093e\u0930\u094d\u091f\u0940', entry.party_name || '', 'Source/Mandi', entry.farmer_name || ''],
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

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Vehicle Weight');
    let cr = 1;
    if (abParts.length > 0) {
      ws.mergeCells(`A${cr}:O${cr}`);
      ws.getCell(`A${cr}`).value = abParts.join('  |  ');
      ws.getCell(`A${cr}`).font = { bold: true, size: 10, color: { argb: '8B0000' } };
      ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
      cr++;
    }
    ws.mergeCells(`A${cr}:O${cr}`);
    ws.getCell(`A${cr}`).value = `${company} - Vehicle Weight / तौल पर्ची`;
    ws.getCell(`A${cr}`).font = { bold: true, size: 14, color: { argb: '1a1a2e' } };
    ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
    cr++;
    const belowAll = [tagline, ...blParts].filter(Boolean);
    if (belowAll.length > 0) {
      ws.mergeCells(`A${cr}:O${cr}`);
      ws.getCell(`A${cr}`).value = belowAll.join('  |  ');
      ws.getCell(`A${cr}`).font = { size: 9, italic: true, color: { argb: '555555' } };
      ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
      cr++;
    }
    ws.mergeCells(`A${cr}:O${cr}`);
    ws.getCell(`A${cr}`).value = `Date: ${fmtDate(req.query.date_from) || 'All'} to ${fmtDate(req.query.date_to) || 'All'} | Total: ${items.length}`;
    ws.getCell(`A${cr}`).font = { size: 9, color: { argb: '666666' } };
    ws.getCell(`A${cr}`).alignment = { horizontal: 'center' };
    cr++;

    const headers = ['RST', 'Date', 'Vehicle', 'Party', 'Mandi', 'Product', 'Trans Type', 'Bags', '1st Wt (KG)', '2nd Wt (KG)', 'Net Wt (KG)', 'TP Wt (Q)', 'G.Issued', 'Cash', 'Diesel'];
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
      [e.rst_no, fmtDate(e.date), e.vehicle_no, e.party_name, e.farmer_name, e.product, e.trans_type, e.tot_pkts, e.first_wt || 0, e.second_wt || 0, e.net_wt || 0, parseFloat(e.tp_weight || 0) || 0, e.g_issued || 0, e.cash_paid || 0, e.diesel_paid || 0].forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (i >= 8) cell.alignment = { horizontal: 'right' };
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
      const totVals = ['', '', '', '', '', '', 'TOTAL:', totBags, tot1st, tot2nd, totNet, totTp, totGIss, totCash, totDiesel];
      totVals.forEach((v, i) => {
        const cell = totRow.getCell(i + 1);
        cell.value = v;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1a1a2e' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (i >= 7) cell.alignment = { horizontal: 'right' };
      });
    }

    ws.columns.forEach((c, i) => { c.width = i === 4 ? 22 : 15; }); // Mandi column (index 4) wider
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=vehicle_weight.xlsx`);
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
    res.setHeader('Content-Disposition', `attachment; filename=vehicle_weight.pdf`);
    doc.pipe(res);

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
    doc.text(`Vehicle Weight Register`, LM + 12, subY + 4, { continued: false });
    doc.font(efn).fontSize(8).fillColor('#455a64').text(`Date: ${dateRange}  |  Records: ${items.length}`, LM, subY + 5, { width: TW - 10, align: 'right' });

    let y = subY + 24;

    // ── Table ──
    const headers = ['#', 'RST', 'Date', 'Vehicle', 'Party', 'Mandi', 'Product', 'Bags', '1st Wt', '2nd Wt', 'Net Wt', 'TP Wt', 'G.Iss', 'Cash', 'Diesel'];
    const colW = [22, 36, 55, 62, 68, 64, 55, 32, 52, 52, 52, 36, 36, 46, 46];
    const rightAlign = [false, true, false, false, false, false, false, true, true, true, true, true, true, true, true];

    // Column group colors for header: Info=navy, Weight=teal, Money=dark green
    const drawTableHeader = (yPos) => {
      // Info columns (#, RST, Date, Vehicle, Party, Mandi, Product, Bags) - Navy
      let infoW = colW.slice(0, 8).reduce((s,w) => s+w, 0);
      doc.rect(LM, yPos, infoW, 15).fill('#1a237e');
      // Weight columns (1st, 2nd, Net, TP Wt) - Teal
      let wtW = colW.slice(8, 12).reduce((s,w) => s+w, 0);
      doc.rect(LM + infoW, yPos, wtW, 15).fill('#004d40');
      // Money columns (G.Iss, Cash, Diesel) - Dark amber
      let monW = colW.slice(12, 15).reduce((s,w) => s+w, 0);
      doc.rect(LM + infoW + wtW, yPos, monW, 15).fill('#e65100');

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
    let totBags = 0, tot1st = 0, tot2nd = 0, totNet = 0, totTp = 0, totGiss = 0, totCash = 0, totDiesel = 0;
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

      totBags += bags; tot1st += first; tot2nd += second; totNet += net; totTp += tpWt; totGiss += gIss; totCash += cash; totDiesel += diesel;

      x = LM + 2;
      const vals = [
        idx + 1, e.rst_no, fmtDate(e.date), e.vehicle_no, e.party_name, e.farmer_name, e.product, bags || '-',
        first ? first.toLocaleString() : '-', second ? second.toLocaleString() : '-',
        net ? net.toLocaleString() : '-', tpWt > 0 ? tpWt : '-', gIss > 0 ? gIss.toLocaleString() : '-',
        cash ? cash.toLocaleString() : '-', diesel ? diesel.toLocaleString() : '-'
      ];

      vals.forEach((v, i) => {
        if (i === 0) { doc.font(efn).fillColor('#78909c'); } // # column gray
        else if (i === 1) { doc.font(efb).fillColor('#1a237e'); } // RST bold navy
        else if (i === 2) { doc.font(efn).fillColor('#37474f'); } // Date dark gray
        else if (i === 8) { doc.font(efn).fillColor('#0277bd'); } // 1st Wt blue
        else if (i === 9) { doc.font(efn).fillColor('#7b1fa2'); } // 2nd Wt purple
        else if (i === 10 && net > 0) { doc.font(efb).fillColor('#1b5e20'); } // Net Wt green bold
        else if (i === 11 && cash > 0) { doc.font(efb).fillColor('#2e7d32'); } // Cash green
        else if (i === 12 && diesel > 0) { doc.font(efb).fillColor('#e65100'); } // Diesel orange
        else { doc.font(efn).fillColor('#212121'); }
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
    const totVals = ['', '', '', '', '', '', 'TOTAL:', totBags.toLocaleString(),
      tot1st.toLocaleString(), tot2nd.toLocaleString(), totNet.toLocaleString(),
      totTp > 0 ? totTp.toFixed(1) : '-', totGiss > 0 ? totGiss.toLocaleString() : '-',
      totCash ? totCash.toLocaleString() : '-', totDiesel ? totDiesel.toLocaleString() : '-'];
    totVals.forEach((v, i) => {
      doc.text(String(v), x, y + 4, { width: colW[i] - 4, align: rightAlign[i] ? 'right' : (i === 6 ? 'right' : 'left') });
      x += colW[i];
    });
    doc.lineWidth(1).strokeColor('#2e7d32').moveTo(LM, y + 16).lineTo(LM + TW, y + 16).stroke();

    // ── Footer ──
    y += 26;
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

  return router;
};
