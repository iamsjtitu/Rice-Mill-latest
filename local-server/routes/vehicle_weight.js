/**
 * Vehicle Weight Routes - Desktop App (Electron/Express)
 * Mirrors: /app/backend/routes/vehicle_weight.py
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');
const { safeAsync } = require('./safe_handler');
const router = express.Router();

module.exports = function(database) {

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
    let text = `*Weight Slip #${rst}*\n` +
      `Vehicle: ${entry.vehicle_no || ''}\n` +
      `Party: ${entry.party_name || ''}\n` +
      `Product: ${entry.product || ''}\n` +
      `Gross: ${Number(entry.gross_wt || entry.first_wt || 0).toLocaleString()} KG\n` +
      `Tare: ${Number(entry.tare_wt || entry.second_wt || 0).toLocaleString()} KG\n` +
      `*Net: ${Number(entry.net_wt || 0).toLocaleString()} KG*\n`;
    const cash = entry.cash_paid || 0;
    const diesel = entry.diesel_paid || 0;
    if (cash > 0) text += `Cash Paid: ${Number(cash).toLocaleString()}\n`;
    if (diesel > 0) text += `Diesel Paid: ${Number(diesel).toLocaleString()}\n`;
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

  // POST /api/vehicle-weight/auto-notify - Auto send weight + camera images
  router.post('/api/vehicle-weight/auto-notify', safeAsync(async (req, res) => {
    const entryId = req.body.entry_id || '';
    const frontImageB64 = req.body.front_image || '';
    const sideImageB64 = req.body.side_image || '';

    const weights = col('vehicle_weights');
    const entry = weights.find(w => w.id === entryId);
    if (!entry) return res.status(404).json({ detail: 'Entry not found' });

    const text = buildWeightText(entry);
    const rst = entry.rst_no || '?';
    const results = { whatsapp: [], telegram: [] };
    const frontBytes = frontImageB64 ? Buffer.from(frontImageB64, 'base64') : null;
    const sideBytes = sideImageB64 ? Buffer.from(sideImageB64, 'base64') : null;

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

    // ── Telegram ──
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
        // Send photos
        if (frontBytes) {
          const r = await sendPhotoToAll(botToken, chatIds, frontBytes, `Front View - RST #${rst}`, `front_rst${rst}.jpg`);
          results.telegram.push(...r);
        }
        if (sideBytes) {
          const r = await sendPhotoToAll(botToken, chatIds, sideBytes, `Side View - RST #${rst}`, `side_rst${rst}.jpg`);
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

  // GET /api/vehicle-weight/:entry_id/slip-pdf - Generate A5 weight slip PDF
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

    // A5 size: 420 x 595 points
    const doc = new PDFDocument({ size: 'A5', margin: 28 });
    const buffers = [];
    doc.on('data', c => buffers.push(c));
    doc.on('end', () => {
      const pdfBuf = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=WeightSlip_RST${entry.rst_no || ''}.pdf`);
      res.send(pdfBuf);
    });

    // Register fonts if available
    const fontDir = path.join(__dirname, '..', 'fonts');
    const hasFreeSans = fs.existsSync(path.join(fontDir, 'FreeSans.ttf'));
    if (hasFreeSans) {
      doc.registerFont('AppFont', path.join(fontDir, 'FreeSans.ttf'));
      doc.registerFont('AppFontBold', path.join(fontDir, 'FreeSansBold.ttf'));
    }
    const fontNormal = hasFreeSans ? 'AppFont' : 'Helvetica';
    const fontBold = hasFreeSans ? 'AppFontBold' : 'Helvetica-Bold';

    const pw = doc.page.width - 56; // page width minus margins

    // ── Company Header ──
    doc.font(fontBold).fontSize(16).fillColor('#1a1a2e').text(company, { align: 'center' });
    doc.font(fontNormal).fontSize(9).fillColor('gray').text(tagline, { align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(28, doc.y).lineTo(doc.page.width - 28, doc.y).strokeColor('#1a1a2e').lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    doc.font(fontBold).fontSize(11).fillColor('#333').text('WEIGHT SLIP', { align: 'center' });
    doc.moveDown(0.5);

    // ── Details Grid ──
    const detailsY = doc.y;
    const col1x = 30, col2x = 80, col3x = 220, col4x = 270;
    const lineH = 16;
    const details = [
      ['RST No:', `#${entry.rst_no || ''}`, 'Date:', entry.date || ''],
      ['Vehicle:', entry.vehicle_no || '', 'Trans:', entry.trans_type || ''],
      ['Party:', entry.party_name || '', 'Farmer:', entry.farmer_name || ''],
      ['Product:', entry.product || '', 'Bags:', String(entry.tot_pkts || 0)],
    ];
    details.forEach((row, i) => {
      const y = detailsY + i * lineH;
      doc.font(fontBold).fontSize(9).fillColor('#555').text(row[0], col1x, y, { width: 48 });
      doc.font(row[0] === 'RST No:' ? fontBold : fontNormal).fontSize(row[0] === 'RST No:' ? 11 : 9).fillColor('#000').text(row[1], col2x, y, { width: 130 });
      doc.font(fontBold).fontSize(9).fillColor('#555').text(row[2], col3x, y, { width: 48 });
      doc.font(fontNormal).fontSize(9).fillColor('#000').text(row[3], col4x, y, { width: 120 });
    });
    doc.y = detailsY + details.length * lineH + 10;

    // ── Weight Table ──
    const firstWt = entry.first_wt || 0;
    const secondWt = entry.second_wt || 0;
    const netWt = entry.net_wt || 0;
    const grossWt = entry.gross_wt || Math.max(firstWt, secondWt);
    const tareWt = entry.tare_wt || Math.min(firstWt, secondWt);

    const tableX = 80, colW1 = 100, colW2 = 130;
    const rowH = 22;
    let ty = doc.y;

    // Header row
    doc.rect(tableX, ty, colW1 + colW2, rowH).fill('#1a1a2e');
    doc.font(fontBold).fontSize(10).fillColor('#fff').text('', tableX + 5, ty + 5, { width: colW1 - 10 });
    doc.text('Weight (KG)', tableX + colW1 + 5, ty + 5, { width: colW2 - 10, align: 'right' });
    ty += rowH;

    // Gross row
    doc.rect(tableX, ty, colW1 + colW2, rowH).fill('#f0f0f0');
    doc.font(fontNormal).fontSize(11).fillColor('#000').text('Gross Wt', tableX + 5, ty + 5, { width: colW1 - 10 });
    doc.text(Number(grossWt).toLocaleString(), tableX + colW1 + 5, ty + 5, { width: colW2 - 10, align: 'right' });
    ty += rowH;

    // Tare row
    doc.rect(tableX, ty, colW1 + colW2, rowH).fill('#fff');
    doc.font(fontNormal).fontSize(11).fillColor('#000').text('Tare Wt', tableX + 5, ty + 5, { width: colW1 - 10 });
    doc.text(Number(tareWt).toLocaleString(), tableX + colW1 + 5, ty + 5, { width: colW2 - 10, align: 'right' });
    ty += rowH;

    // Net row
    doc.rect(tableX, ty, colW1 + colW2, rowH).fill('#d4edda');
    doc.font(fontBold).fontSize(14).fillColor('#155724').text('Net Wt', tableX + 5, ty + 3, { width: colW1 - 10 });
    doc.text(Number(netWt).toLocaleString(), tableX + colW1 + 5, ty + 3, { width: colW2 - 10, align: 'right' });
    ty += rowH;

    // Grid lines
    doc.strokeColor('#CCC').lineWidth(0.5);
    for (let i = 0; i <= 4; i++) {
      doc.moveTo(tableX, doc.y - (4 - i) * rowH + (ty - doc.y)).lineTo(tableX + colW1 + colW2, doc.y - (4 - i) * rowH + (ty - doc.y));
    }
    doc.y = ty + 8;

    // ── Cash / Diesel ──
    const cash = entry.cash_paid || 0;
    const diesel = entry.diesel_paid || 0;
    if (cash || diesel) {
      doc.font(fontBold).fontSize(10).fillColor('#555').text(`Cash Paid: ${Number(cash).toLocaleString()}`, tableX, doc.y);
      doc.text(`Diesel Paid: ${Number(diesel).toLocaleString()}`, tableX, doc.y);
      doc.moveDown(0.5);
    }

    // Remark
    if (entry.remark) {
      doc.font(fontBold).fontSize(9).fillColor('#555').text(`Remark: `, { continued: true });
      doc.font(fontNormal).text(entry.remark);
      doc.moveDown(0.3);
    }

    // ── Footer ──
    doc.moveDown(1);
    doc.moveTo(28, doc.y).lineTo(doc.page.width - 28, doc.y).strokeColor('#ccc').lineWidth(0.5).stroke();
    doc.moveDown(0.3);
    doc.font(fontNormal).fontSize(7).fillColor('gray').text(`${company} | Computer Generated Slip`, { align: 'center' });

    doc.end();
  }));

  return router;
};
