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
  const PDFDocument = require('pdfkit');
  const getDailyReportData = require('./daily_report').__getDailyReportData;

  // If getDailyReportData is not exported, build it inline
  return new Promise((resolve, reject) => {
    try {
      const data = buildReportData(query);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const C = {
        hdrBg: '#1a365d', hdrText: '#ffffff', border: '#cbd5e1',
        altRow: '#f8fafc', blueBg: '#e0f2fe', greenBg: '#dcfce7',
        yellowBg: '#fef3c7', purpleBg: '#e0e7ff', orangeBg: '#fff7ed',
        staffBg: '#dbeafe', section: '#1a365d', sub: '#475569'
      };

      function fmtAmt(val) { return val === 0 ? '0' : val.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
      function fmtDate(d) { if (!d) return ''; const s = String(d).split('T')[0]; const p = s.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : s; }

      function drawTable(headers, rows, colWidths, opts) {
        opts = opts || {};
        const fs = opts.fontSize || 7;
        const hdrBg = opts.headerBg || C.hdrBg;
        const hdrTextColor = opts.headerTextColor || C.hdrText;
        let y = doc.y;
        const rowH = fs + 8;
        const totalW = colWidths.reduce((a,b) => a+b, 0);
        const startX = Math.max(25, (doc.page.width - totalW) / 2);

        if (y + rowH * (rows.length + 1) + 20 > doc.page.height - 25) { doc.addPage(); y = 25; }

        // Header
        doc.save().rect(startX, y, totalW, rowH).fill(hdrBg);
        let x = startX;
        headers.forEach((h, i) => {
          doc.font('Helvetica-Bold').fontSize(fs).fillColor(hdrTextColor)
            .text(h, x + 2, y + 3, { width: colWidths[i] - 4, align: opts.align && opts.align[i] || 'center' });
          x += colWidths[i];
        });
        doc.restore();
        y += rowH;

        // Rows
        rows.forEach((row, ri) => {
          if (y + rowH > doc.page.height - 25) { doc.addPage(); y = 25; }
          if (ri % 2 === 1) doc.save().rect(startX, y, totalW, rowH).fill(C.altRow).restore();
          // Grid
          doc.save().lineWidth(0.3).strokeColor(C.border);
          x = startX;
          for (let i = 0; i <= headers.length; i++) {
            doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
            x += (colWidths[i] || 0);
          }
          doc.moveTo(startX, y + rowH).lineTo(startX + totalW, y + rowH).stroke();
          doc.restore();

          x = startX;
          (Array.isArray(row) ? row : []).forEach((cell, ci) => {
            const isLast = opts.isTotal && ri === rows.length - 1;
            doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).fillColor('#1e293b')
              .text(String(cell || ''), x + 2, y + 3, { width: colWidths[ci] - 4, align: opts.align && opts.align[ci] || 'center' });
            x += colWidths[ci];
          });
          y += rowH;
        });
        doc.y = y + 4;
      }

      // Title
      doc.font('Helvetica-Bold').fontSize(18).fillColor(C.section)
        .text(`Detail Report - ${data.date}`, 25, 25);
      doc.font('Helvetica').fontSize(9).fillColor(C.sub)
        .text(`Mode: DETAILED | KMS Year: ${query.kms_year || 'All'} | Season: ${query.season || 'All'}`);
      doc.moveDown(0.5);

      // 1. Paddy Entries
      const p = data.paddy_entries;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.section).text(`1. Paddy Entries (${p.count})`);
      doc.moveDown(0.3);
      drawTable(
        ['Total Mill W (QNTL)', 'Total BAG', 'Final W. QNTL', 'Bag Deposite', 'Bag Issued'],
        [[(p.total_mill_w/100).toFixed(2), String(p.total_bags), (p.total_final_w/100).toFixed(2), String(p.total_g_deposite || 0), String(p.total_g_issued || 0)]],
        [100, 90, 100, 80, 80],
        { headerBg: C.blueBg, headerTextColor: '#1e293b' }
      );
      if (p.details && p.details.length > 0) {
        drawTable(
          ['Truck', 'Agent', 'Mandi', 'RST', 'TP', 'QNTL', 'Bags', 'Mill W', 'Final W', 'Cash', 'Diesel'],
          p.details.map(d => [d.truck_no||'', d.agent||'', d.mandi||'', d.rst_no||'', d.tp_no||'',
            (d.kg/100).toFixed(2), String(d.bags||0), (d.mill_w/100).toFixed(2), (d.final_w/100).toFixed(2),
            String(d.cash_paid||0), String(d.diesel_paid||0)]),
          [55, 45, 50, 30, 30, 38, 30, 42, 42, 42, 42],
          { fontSize: 6 }
        );
      }

      // 2. Milling
      const ml = data.milling;
      if (ml.count > 0) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(C.section).text(`2. Milling (${ml.count})`);
        doc.moveDown(0.3);
        drawTable(
          ['Paddy In (Q)', 'Rice Out (Q)', 'FRK Used (Q)'],
          [[String(ml.paddy_input_qntl), String(ml.rice_output_qntl), String(ml.frk_used_qntl)]],
          [170, 170, 170],
          { headerBg: C.yellowBg, headerTextColor: '#1e293b' }
        );
      }

      // 3. Cash Flow
      const cf = data.cash_flow;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.section).text('3. Cash Flow');
      doc.moveDown(0.3);
      drawTable(
        ['', 'Jama (Cr)', 'Nikasi (Dr)', 'Net'],
        [
          ['Cash', `Rs.${fmtAmt(cf.cash_jama)}`, `Rs.${fmtAmt(cf.cash_nikasi)}`, `Rs.${fmtAmt(cf.net_cash)}`],
          ['Bank', `Rs.${fmtAmt(cf.bank_jama)}`, `Rs.${fmtAmt(cf.bank_nikasi)}`, `Rs.${fmtAmt(cf.net_bank)}`]
        ],
        [80, 130, 130, 130],
        { headerBg: C.greenBg, headerTextColor: '#1e293b', align: ['left', 'right', 'right', 'right'] }
      );

      // 4. Cash Transactions
      const ct = data.cash_transactions || {};
      if (ct.count > 0) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(C.section).text(`4. Cash Transactions (${ct.count})`);
        doc.moveDown(0.3);
        drawTable(
          ['Total Jama', 'Total Nikasi', 'Balance'],
          [[`Rs.${fmtAmt(ct.total_jama)}`, `Rs.${fmtAmt(ct.total_nikasi)}`, `Rs.${fmtAmt(ct.total_jama - ct.total_nikasi)}`]],
          [170, 170, 170],
          { headerBg: C.yellowBg, headerTextColor: '#1e293b' }
        );
        if (ct.details && ct.details.length > 0) {
          drawTable(
            ['Date', 'Party Name', 'Type', 'Amount (Rs.)', 'Description'],
            ct.details.map(d => [fmtDate(d.date), d.party_name||d.category||'', d.txn_type==='jama'?'JAMA':'NIKASI', `Rs.${fmtAmt(d.amount||0)}`, d.description||'']),
            [60, 110, 50, 80, 200]
          );
        }
      }

      // 5. Payments
      const pay = data.payments;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(C.section).text('5. Payments');
      doc.moveDown(0.3);
      drawTable(
        ['MSP Received', 'Pvt Paddy Paid', 'Rice Sale Received'],
        [[`Rs.${fmtAmt(pay.msp_received)}`, `Rs.${fmtAmt(pay.pvt_paddy_paid)}`, `Rs.${fmtAmt(pay.rice_sale_received)}`]],
        [170, 170, 170],
        { headerBg: C.purpleBg, headerTextColor: '#1e293b' }
      );

      // 6. Staff
      const sa = data.staff_attendance || {};
      if (sa.total > 0) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(C.section).text(`6. Staff (${sa.total})`);
        doc.moveDown(0.3);
        drawTable(
          ['Present', 'Half Day', 'Absent', 'Holiday', 'Not Marked'],
          [[String(sa.present||0), String(sa.half_day||0), String(sa.absent||0), String(sa.holiday||0), String(sa.not_marked||0)]],
          [95, 95, 95, 95, 95],
          { headerBg: C.staffBg, headerTextColor: '#1e293b' }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Build report data (same as getDailyReportData in daily_report.js)
function buildReportData(query) {
  const { date, kms_year, season } = query;

  function filterFy(arr) {
    let r = arr.filter(e => e.date === date);
    if (kms_year) r = r.filter(e => e.kms_year === kms_year);
    if (season) r = r.filter(e => e.season === season);
    return r;
  }

  const entries = filterFy(col('entries'));
  const pvtPaddy = filterFy(col('private_paddy'));
  const riceSales = filterFy(col('rice_sales'));
  const milling = filterFy(col('milling_entries'));
  const cashTxns = filterFy(col('cash_transactions'));
  const staffAtt = col('staff_attendance').filter(s => s.date === date);

  // Paddy
  const totalBags = entries.reduce((s,e) => s + (parseInt(e.bags)||0), 0);
  const totalFinalW = entries.reduce((s,e) => s + (parseFloat(e.final_w)||parseFloat(e.kg)||0), 0);
  const totalMillW = entries.reduce((s,e) => s + (parseFloat(e.mill_w)||0), 0);
  const totalGDeposite = entries.reduce((s,e) => s + (parseInt(e.g_deposite)||0), 0);
  const totalGIssued = entries.reduce((s,e) => s + (parseInt(e.g_issued)||0), 0);

  // Cash flow
  const cashJama = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'jama').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
  const cashNikasi = cashTxns.filter(t => t.account === 'cash' && t.txn_type === 'nikasi').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
  const bankJama = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'jama').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
  const bankNikasi = cashTxns.filter(t => t.account === 'bank' && t.txn_type === 'nikasi').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);

  // Cash-only transactions
  const cashOnlyTxns = cashTxns.filter(t => t.account === 'cash');
  const cashOnlyJama = cashOnlyTxns.filter(t => t.txn_type === 'jama').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
  const cashOnlyNikasi = cashOnlyTxns.filter(t => t.txn_type === 'nikasi').reduce((s,t) => s + (parseFloat(t.amount)||0), 0);

  // Milling
  const paddyInput = milling.reduce((s,m) => s + (parseFloat(m.paddy_qntl)||0), 0);
  const riceOutput = milling.reduce((s,m) => s + (parseFloat(m.rice_qntl)||0), 0);
  const frkUsed = milling.reduce((s,m) => s + (parseFloat(m.frk_qntl)||0), 0);

  // Payments
  const mspReceived = entries.reduce((s,e) => s + (parseFloat(e.msp_paid)||0), 0);
  const pvtPaddyPaid = pvtPaddy.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);
  const riceSaleReceived = riceSales.reduce((s,e) => s + (parseFloat(e.amount)||0), 0);

  // Staff
  const present = staffAtt.filter(s => s.status === 'present').length;
  const halfDay = staffAtt.filter(s => s.status === 'half_day').length;
  const absent = staffAtt.filter(s => s.status === 'absent').length;
  const holiday = staffAtt.filter(s => s.status === 'holiday').length;
  const notMarked = staffAtt.filter(s => !s.status || s.status === 'not_marked').length;

  return {
    date,
    mode: 'detail',
    paddy_entries: {
      count: entries.length, total_bags: totalBags, total_final_w: totalFinalW,
      total_mill_w: totalMillW, total_g_deposite: totalGDeposite, total_g_issued: totalGIssued,
      details: entries.map(e => ({
        truck_no: e.truck_no, agent: e.agent, mandi: e.mandi, rst_no: e.rst_no, tp_no: e.tp_no,
        kg: parseFloat(e.kg)||0, bags: parseInt(e.bags)||0, mill_w: parseFloat(e.mill_w)||0,
        final_w: parseFloat(e.final_w)||parseFloat(e.kg)||0,
        cash_paid: parseFloat(e.cash_paid)||0, diesel_paid: parseFloat(e.diesel_paid)||0
      }))
    },
    milling: { count: milling.length, paddy_input_qntl: paddyInput, rice_output_qntl: riceOutput, frk_used_qntl: frkUsed },
    cash_flow: { cash_jama: cashJama, cash_nikasi: cashNikasi, net_cash: cashJama - cashNikasi, bank_jama: bankJama, bank_nikasi: bankNikasi, net_bank: bankJama - bankNikasi },
    cash_transactions: {
      count: cashOnlyTxns.length, total_jama: cashOnlyJama, total_nikasi: cashOnlyNikasi,
      details: cashOnlyTxns.map(t => ({ date: t.date, party_name: t.category, category: t.category, txn_type: t.txn_type, amount: parseFloat(t.amount)||0, description: t.description||'' }))
    },
    payments: { msp_received: mspReceived, pvt_paddy_paid: pvtPaddyPaid, rice_sale_received: riceSaleReceived },
    staff_attendance: { total: staffAtt.length, present, half_day: halfDay, absent, holiday, not_marked: notMarked }
  };
}

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
    pdfBuffer = await generateDetailReportPDF({ date: reportDate, kms_year: kmsYear, season: season, mode: 'detail' });
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
