/**
 * Letter Pad — Company letterhead generator with optional AI assistant.
 * Mirrors /app/backend/routes/letter_pad.py (triple-backend parity).
 */
const express = require('express');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { safeSync } = require('./safe_handler');
const { F: pdfF, registerFonts } = require('./pdf_helpers');
const PDFDocument = require('pdfkit');
const docx = require('docx');
const { LETTER_PAD_TEMPLATES, getTemplates, getTemplateById } = require('./letter_pad_templates');

module.exports = (database) => {
  const router = express.Router();

  // Helper: load combined letter context
  const loadCtx = () => {
    const settings = database.data.app_settings || {};
    const lp = (database.data.app_settings_extra || {}).letter_pad || {};
    const pick = (...opts) => opts.find(o => o && String(o).trim()) || '';
    return {
      company_name: pick(settings.company_name, 'NAVKAR AGRO'),
      header_text: pick(lp.header_text),
      address: pick(lp.address, settings.address, 'Laitara Road, Jolko - 766012, Dist. Kalahandi (Odisha)'),
      email: pick(lp.email, settings.email),
      phone: pick(lp.phone, settings.phone),
      phone_secondary: pick(lp.phone_secondary, settings.phone_secondary),
      gstin: pick(lp.gstin, settings.gstin),
      license_number: pick(lp.license_number, settings.mill_code),
      logo: settings.logo || '',
      signature_name: pick(lp.signature_name, 'Aditya Jain'),
      signature_designation: pick(lp.signature_designation, 'Proprietor'),
      ai_enabled: !!lp.ai_enabled,
      gemini_key: lp.gemini_key || '',
      openai_key: lp.openai_key || '',
      ai_provider: lp.ai_provider || 'gemini',
    };
  };

  const settingsResponse = () => {
    const lp = (database.data.app_settings_extra || {}).letter_pad || {};
    return {
      gstin: lp.gstin || '',
      phone: lp.phone || '',
      phone_secondary: lp.phone_secondary || '',
      address: lp.address || '',
      email: lp.email || '',
      license_number: lp.license_number || '',
      header_text: lp.header_text || '',
      signature_name: lp.signature_name || '',
      signature_designation: lp.signature_designation || '',
      ai_enabled: !!lp.ai_enabled,
      has_gemini_key: !!lp.gemini_key,
      has_openai_key: !!lp.openai_key,
      ai_provider: lp.ai_provider || 'gemini',
    };
  };

  // ========== Settings ==========
  router.get('/api/letter-pad/settings', safeSync(async (req, res) => {
    res.json(settingsResponse());
  }));

  router.put('/api/letter-pad/settings', safeSync(async (req, res) => {
    if (!database.data.app_settings_extra) database.data.app_settings_extra = {};
    if (!database.data.app_settings_extra.letter_pad) database.data.app_settings_extra.letter_pad = {};
    const lp = database.data.app_settings_extra.letter_pad;
    const b = req.body || {};
    const textFields = ['gstin', 'phone', 'phone_secondary', 'address', 'email', 'license_number', 'header_text', 'signature_name', 'signature_designation', 'ai_provider'];
    textFields.forEach(f => {
      if (b[f] !== undefined) lp[f] = String(b[f] || '').trim();
    });
    if (b.ai_enabled !== undefined) lp.ai_enabled = !!b.ai_enabled;
    if (b.gemini_key) lp.gemini_key = String(b.gemini_key).trim();
    if (b.openai_key) lp.openai_key = String(b.openai_key).trim();
    if (b.clear_gemini_key) lp.gemini_key = '';
    if (b.clear_openai_key) lp.openai_key = '';
    lp.updated_at = new Date().toISOString();
    database.save();
    res.json(settingsResponse());
  }));

  // ========== AI proxy ==========
  const SYSTEM_PROMPTS = {
    generate: 'You are a professional business letter writer. Generate a complete formal Indian business letter and return STRICT JSON output with three keys.\n\nOUTPUT FORMAT (return ONLY this JSON, no markdown fences, no preamble):\n{\n  "to_address": "<recipient name and address, multi-line with \\n>",\n  "subject": "<concise subject line, 5-12 words>",\n  "body": "<full letter body starting with greeting, ending with Thanking you.>"\n}\n\nSTRICT RULES for the body:\n1) NO sender info (already on letterhead). 2) NO placeholders like [Your Name]. 3) Start with "Respected Sir/Madam,". 4) End with "Thanking you." 5) Use first person plural (we/our). 6) 150-300 words.\n\nSTRICT RULES for to_address: Standard Indian business format, multi-line with \\n. Example: "The Branch Manager,\\nState Bank of India,\\n[Branch Name],\\n[City]". Match the language requested for ALL three fields. Return PURE JSON only.',
    improve: "You are a professional business letter editor. Rewrite the user's draft with improved grammar, tone, and professionalism. STRICT RULES: 1) Output ONLY the improved letter body — no preamble, no explanation. 2) NO placeholders like '[Your Name]'. 3) Preserve the user's intent and key facts (dates, amounts, names). 4) Don't add 'Yours faithfully' / signature — those are added separately. 5) Keep length similar. Same language as input.",
    translate: "You are a professional translator for Indian business letters. Translate between English, Hindi (Devanagari), and Odia. STRICT RULES: 1) Output ONLY the translation — no preamble, no explanation. 2) Preserve formal business tone and all factual details (numbers, dates, names). 3) Use natural, professional phrasing in the target language.",
  };

  async function callGemini(apiKey, sys, user, jsonMode) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const genConfig = { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } };
    if (jsonMode) genConfig.responseMimeType = 'application/json';
    const body = {
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: genConfig,
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Gemini error: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  async function callOpenAI(apiKey, sys, user, jsonMode) {
    const reqBody = {
      model: 'gpt-5-mini',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      max_completion_tokens: 1500,
    };
    if (jsonMode) reqBody.response_format = { type: 'json_object' };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    if (!r.ok) throw new Error(`OpenAI error: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  router.post('/api/letter-pad/ai', safeSync(async (req, res) => {
    const { mode, text, target_lang } = req.body || {};
    if (!SYSTEM_PROMPTS[mode]) return res.status(400).json({ detail: 'Invalid mode' });
    if (!text || !String(text).trim()) return res.status(400).json({ detail: 'Text/prompt required' });
    const ctx = loadCtx();
    if (!ctx.ai_enabled) return res.status(400).json({ detail: 'AI is disabled. Settings → Letter Pad → enable kare.' });
    let provider = ctx.ai_provider;
    if (provider === 'gemini' && !ctx.gemini_key) provider = ctx.openai_key ? 'openai' : null;
    else if (provider === 'openai' && !ctx.openai_key) provider = ctx.gemini_key ? 'gemini' : null;
    if (!provider) return res.status(400).json({ detail: 'No API key configured' });
    let userPrompt = String(text).trim();
    if (mode === 'translate') userPrompt = `Translate the following to ${target_lang || 'English'}:\n\n${userPrompt}`;
    const jsonMode = (mode === 'generate');
    try {
      const out = provider === 'gemini'
        ? await callGemini(ctx.gemini_key, SYSTEM_PROMPTS[mode], userPrompt, jsonMode)
        : await callOpenAI(ctx.openai_key, SYSTEM_PROMPTS[mode], userPrompt, jsonMode);
      if (jsonMode) {
        const clean = String(out).trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        try {
          const parsed = JSON.parse(clean);
          return res.json({
            result: (parsed.body || '').trim(),
            subject: (parsed.subject || '').trim(),
            to_address: (parsed.to_address || '').trim(),
            provider,
            structured: true,
          });
        } catch (_) {
          return res.json({ result: clean, subject: '', to_address: '', provider, structured: false });
        }
      }
      res.json({ result: out, provider });
    } catch (e) {
      res.status(502).json({ detail: e.message || 'AI call failed' });
    }
  }));

  // ========== PDF letterhead ==========
  function drawLetterhead(doc, ctx, pageW) {
    const RED = '#C0392B';
    const DARK = '#1f2937';
    const MUTED = '#475569';
    const top = 38;
    if (ctx.gstin) {
      doc.font(pdfF('bold')).fontSize(9).fillColor(DARK).text(`GSTIN: ${ctx.gstin}`, 40, top);
    }
    const phones = [];
    if (ctx.phone) phones.push(ctx.phone);
    if (ctx.phone_secondary) phones.push(ctx.phone_secondary);
    phones.forEach((p, i) => {
      doc.font(pdfF('bold')).fontSize(9).fillColor(DARK).text(`Mob. ${p}`, pageW - 200, top + i * 11, { width: 160, align: 'right' });
    });
    // Optional header text (slogan) ABOVE company name
    let companyY = top + 18;
    if (ctx.header_text) {
      doc.font(pdfF('normal')).fontSize(11).fillColor(MUTED).text(ctx.header_text, 0, top + 4, { align: 'center', width: pageW });
      companyY = top + 22;
    }
    doc.font(pdfF('bold')).fontSize(22).fillColor(RED).text(ctx.company_name, 0, companyY, { align: 'center', width: pageW });
    let y = companyY + 30;
    if (ctx.address) {
      doc.font(pdfF('normal')).fontSize(10).fillColor(MUTED).text(ctx.address, 0, y, { align: 'center', width: pageW });
      y += 13;
    }
    if (ctx.email) {
      doc.font(pdfF('normal')).fontSize(10).fillColor(MUTED).text(`Email: ${ctx.email}`, 0, y, { align: 'center', width: pageW });
      y += 13;
    }
    y += 4;
    doc.moveTo(40, y).lineTo(pageW - 40, y).strokeColor(RED).lineWidth(1.5).stroke();
    y += 4;
    if (ctx.license_number) {
      doc.font(pdfF('normal')).fontSize(8).fillColor(MUTED).text(`License No: ${ctx.license_number}`, 0, y, { align: 'center', width: pageW });
      y += 11;
    }
    return y + 8;
  }

  router.post('/api/letter-pad/pdf', safeSync(async (req, res) => {
    const ctx = loadCtx();
    const dateStr = (req.body || {}).date || new Date().toISOString().slice(0, 10);
    const fname = `letter_${dateStr.replace(/-/g, '')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    const doc = renderLetterPdf(ctx, req.body || {});
    doc.pipe(res);
    doc.end();
  }));

  // Render letter into a PDFDocument stream (re-used by /pdf and /whatsapp).
  function renderLetterPdf(ctx, payload) {
    const { ref_no, date, to_address, subject, references, body } = payload;
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    registerFonts(doc);
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    let y = drawLetterhead(doc, ctx, pageW);
    y += 6;
    doc.font(pdfF('normal')).fontSize(10).fillColor('#1f2937')
      .text(`Ref. No.: ${ref_no || '_____________'}`, 40, y);
    doc.text(`Date: ${date || new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`, pageW - 200, y, { width: 160, align: 'right' });
    y += 30;
    if (to_address && String(to_address).trim()) {
      doc.font(pdfF('bold')).fontSize(10).text('To,', 40, y);
      y += 14;
      String(to_address).split('\n').forEach(line => {
        doc.font(pdfF('normal')).fontSize(10).text(line.slice(0, 95), 50, y);
        y += 13;
      });
      y += 8;
    }
    if (subject && String(subject).trim()) {
      doc.font(pdfF('bold')).fontSize(11).fillColor('#1f2937').text(`Subject: ${subject}`, 40, y);
      y += 18;
    }
    if (references && String(references).trim()) {
      doc.font(pdfF('bold')).fontSize(10).text('Reference:', 40, y);
      y += 13;
      String(references).split('\n').forEach(line => {
        doc.font(pdfF('normal')).fontSize(10).text(line.slice(0, 100), 50, y);
        y += 13;
      });
      y += 6;
    }
    if (body && String(body).trim()) {
      doc.font(pdfF('normal')).fontSize(11).fillColor('#1f2937')
        .text(String(body), 40, y, { width: pageW - 80, align: 'justify', lineGap: 3 });
      y = doc.y + 20;
    }
    const sigY = Math.max(y, pageH - 130);
    doc.font(pdfF('normal')).fontSize(11).fillColor('#1f2937')
      .text('Yours faithfully,', 0, sigY, { width: pageW - 40, align: 'right' });
    doc.font(pdfF('bold')).fontSize(12)
      .text(ctx.signature_name, 0, sigY + 50, { width: pageW - 40, align: 'right' });
    doc.font(pdfF('normal')).fontSize(10).fillColor('#475569')
      .text(ctx.signature_designation, 0, sigY + 64, { width: pageW - 40, align: 'right' });
    doc.text(`M/s ${ctx.company_name}`, 0, sigY + 78, { width: pageW - 40, align: 'right' });
    return doc;
  }

  // Render to Buffer (for uploads/WhatsApp).
  function renderLetterPdfBuffer(ctx, payload) {
    return new Promise((resolve, reject) => {
      const doc = renderLetterPdf(ctx, payload);
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  // ========== DOCX letterhead ==========
  router.post('/api/letter-pad/docx', safeSync(async (req, res) => {
    const ctx = loadCtx();
    const { ref_no, date, to_address, subject, references, body } = req.body || {};
    const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType } = docx;

    const dateStr = date || new Date().toLocaleDateString('en-GB').replace(/\//g, '-');

    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: ctx.gstin ? `GSTIN: ${ctx.gstin}` : '', size: 18 })] })],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: ctx.phone ? `Mob. ${ctx.phone}` : '', size: 18 })] }),
              new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: ctx.phone_secondary ? `Mob. ${ctx.phone_secondary}` : '', size: 18 })] }),
            ],
          }),
        ],
      })],
    });

    const childrenSec = [
      headerTable,
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ctx.company_name, bold: true, size: 56, color: 'C0392B' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ctx.address || '', size: 20, color: '475569' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ctx.email ? `Email: ${ctx.email}` : '', size: 20, color: '475569' })] }),
      new Paragraph({ border: { bottom: { color: 'C0392B', space: 1, style: BorderStyle.SINGLE, size: 12 } }, children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [] }),
    ];

    // Ref + Date row
    childrenSec.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
      rows: [new TableRow({
        children: [
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: `Ref. No.: ${ref_no || '_____________'}`, size: 20 })] })] }),
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Date: ${dateStr}`, size: 20 })] })] }),
        ],
      })],
    }));
    childrenSec.push(new Paragraph({ children: [] }));

    // To
    if (to_address && String(to_address).trim()) {
      childrenSec.push(new Paragraph({ children: [new TextRun({ text: 'To,', bold: true, size: 22 })] }));
      String(to_address).split('\n').forEach(line => {
        childrenSec.push(new Paragraph({ indent: { left: 280 }, children: [new TextRun({ text: line, size: 20 })] }));
      });
    }
    // Subject
    if (subject && String(subject).trim()) {
      childrenSec.push(new Paragraph({ children: [new TextRun({ text: `Subject: ${subject}`, bold: true, size: 22 })] }));
    }
    // References
    if (references && String(references).trim()) {
      childrenSec.push(new Paragraph({ children: [new TextRun({ text: 'Reference:', bold: true, size: 20 })] }));
      String(references).split('\n').forEach(line => {
        childrenSec.push(new Paragraph({ indent: { left: 280 }, children: [new TextRun({ text: line, size: 20 })] }));
      });
    }
    // Body
    if (body && String(body).trim()) {
      String(body).split('\n\n').forEach(para => {
        const lines = para.split('\n');
        childrenSec.push(new Paragraph({
          spacing: { after: 160 },
          children: lines.map((l, i) => new TextRun({ text: l, size: 22, break: i > 0 ? 1 : 0 })),
        }));
      });
    }
    // Signature
    childrenSec.push(new Paragraph({ children: [] }));
    childrenSec.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Yours faithfully,', size: 22 })] }));
    childrenSec.push(new Paragraph({ children: [] }));
    childrenSec.push(new Paragraph({ children: [] }));
    childrenSec.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: ctx.signature_name, bold: true, size: 24 })] }));
    childrenSec.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: ctx.signature_designation, size: 20 })] }));
    childrenSec.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `M/s ${ctx.company_name}`, size: 20 })] }));

    const document = new Document({
      styles: { default: { document: { run: { font: 'Inter', size: 22 } } } },
      sections: [{
        properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children: childrenSec,
      }],
    });

    const buffer = await Packer.toBuffer(document);
    const fname = `letter_${dateStr.replace(/-/g, '')}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buffer);
  }));

  // ========== DRAFTS (CRUD) ==========
  function draftsCol() {
    if (!Array.isArray(database.data.letter_drafts)) database.data.letter_drafts = [];
    return database.data.letter_drafts;
  }

  router.get('/api/letter-pad/drafts', safeSync(async (req, res) => {
    const list = draftsCol().slice().sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    res.json(list);
  }));

  router.post('/api/letter-pad/drafts', safeSync(async (req, res) => {
    const b = req.body || {};
    const body = String(b.body || '').trim();
    const subject = String(b.subject || '').trim();
    if (!body && !subject) return res.status(400).json({ detail: 'Khaali draft save nahi ho sakti — kuch text type karein' });
    const now = new Date().toISOString();
    const title = (String(b.title || '').trim() || subject.slice(0, 60) || 'Untitled Draft');
    const doc = {
      id: uuidv4(),
      title,
      ref_no: b.ref_no || '',
      date: b.date || '',
      to_address: b.to_address || '',
      subject: b.subject || '',
      references: b.references || '',
      body: b.body || '',
      created_at: now,
      updated_at: now,
    };
    draftsCol().push(doc);
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json(doc);
  }));

  router.put('/api/letter-pad/drafts/:id', safeSync(async (req, res) => {
    const list = draftsCol();
    const idx = list.findIndex(d => d.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Draft not found' });
    const cur = list[idx];
    const b = req.body || {};
    ['title', 'ref_no', 'date', 'to_address', 'subject', 'references', 'body'].forEach(f => {
      if (b[f] !== undefined) cur[f] = b[f] || '';
    });
    cur.updated_at = new Date().toISOString();
    list[idx] = cur;
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json(cur);
  }));

  router.delete('/api/letter-pad/drafts/:id', safeSync(async (req, res) => {
    const list = draftsCol();
    const idx = list.findIndex(d => d.id === req.params.id);
    if (idx < 0) return res.status(404).json({ detail: 'Draft not found' });
    list.splice(idx, 1);
    if (database.saveImmediate) database.saveImmediate(); else database.save();
    res.json({ success: true });
  }));

  // ========== TEMPLATES ==========
  router.get('/api/letter-pad/templates', safeSync(async (req, res) => {
    res.json(getTemplates());
  }));

  router.get('/api/letter-pad/templates/:id', safeSync(async (req, res) => {
    const t = getTemplateById(req.params.id);
    if (!t) return res.status(404).json({ detail: 'Template not found' });
    res.json(t);
  }));

  // ========== WHATSAPP SHARE ==========
  function getWaSettings() {
    const s = (database.data.app_settings || []).find(x => x.setting_id === 'whatsapp_config');
    return s || { api_key: '', country_code: '91', default_numbers: [], group_id: '', default_group_id: '' };
  }

  function cleanPhone(phone, countryCode = '91') {
    phone = String(phone || '').trim().replace(/[\s\-+]/g, '');
    if (phone.startsWith('0')) phone = phone.substring(1);
    if (!phone.startsWith(countryCode)) phone = countryCode + phone;
    return phone;
  }

  function uploadPdfBufferToTmpFiles(pdfBuffer, fileName) {
    return new Promise((resolve) => {
      if (!pdfBuffer || pdfBuffer.length < 100) return resolve('');
      const boundary = '----FormBoundary' + Date.now();
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([Buffer.from(header), pdfBuffer, Buffer.from(footer)]);
      const opts = {
        hostname: 'tmpfiles.org', path: '/api/v1/upload', method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      };
      const r = https.request(opts, (rr) => {
        let data = '';
        rr.on('data', c => data += c);
        rr.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.status === 'success' && result.data && result.data.url) {
              resolve(result.data.url.replace('http://tmpfiles.org/', 'https://tmpfiles.org/dl/'));
            } else resolve('');
          } catch (_) { resolve(''); }
        });
      });
      r.on('error', () => resolve(''));
      r.write(body);
      r.end();
    });
  }

  function sendWaMessage(apiKey, phone, text, mediaUrl) {
    return new Promise((resolve) => {
      const postData = `phonenumber=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}${mediaUrl ? '&url=' + encodeURIComponent(mediaUrl) : ''}`;
      const options = {
        hostname: 'api.360messenger.com', path: '/v2/sendMessage', method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
      };
      const r = https.request(options, (rr) => {
        let data = '';
        rr.on('data', c => data += c);
        rr.on('end', () => {
          try {
            const result = JSON.parse(data);
            const ok = result.success || rr.statusCode === 201;
            resolve({ success: ok, error: ok ? '' : (result.error || result.message || `HTTP ${rr.statusCode}`) });
          } catch (e) { resolve({ success: false, error: data || e.message }); }
        });
      });
      r.on('error', e => resolve({ success: false, error: e.message }));
      r.write(postData);
      r.end();
    });
  }

  function sendWaGroup(apiKey, groupId, text, mediaUrl) {
    return new Promise((resolve) => {
      const postData = JSON.stringify({ groupId, text, url: mediaUrl || undefined });
      const options = {
        hostname: 'api.360messenger.com', path: '/v2/sendGroup', method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      };
      const r = https.request(options, (rr) => {
        let data = '';
        rr.on('data', c => data += c);
        rr.on('end', () => {
          try {
            const result = JSON.parse(data);
            const ok = result.success || rr.statusCode === 201;
            resolve({ success: ok, error: ok ? '' : (result.error || result.message || `HTTP ${rr.statusCode}`) });
          } catch (e) { resolve({ success: false, error: data || e.message }); }
        });
      });
      r.on('error', e => resolve({ success: false, error: e.message }));
      r.write(postData);
      r.end();
    });
  }

  router.post('/api/letter-pad/whatsapp', safeSync(async (req, res) => {
    const { letter, mode, phone, group_id, caption } = req.body || {};
    if (!letter || !String(letter.body || '').trim()) {
      return res.status(400).json({ detail: 'Letter body khaali hai' });
    }
    const wa = getWaSettings();
    if (!wa.api_key) return res.status(400).json({ detail: 'WhatsApp API key set nahi hai. Settings → WhatsApp mein 360Messenger key dale.' });

    const ctx = loadCtx();
    let pdfBuf;
    try {
      pdfBuf = await renderLetterPdfBuffer(ctx, letter);
    } catch (e) {
      return res.status(500).json({ detail: 'PDF generation fail: ' + e.message });
    }
    const fname = `letter_${(letter.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '')}.pdf`;
    const publicPdfUrl = await uploadPdfBufferToTmpFiles(pdfBuf, fname);
    if (!publicPdfUrl) return res.status(502).json({ detail: 'PDF upload (tmpfiles.org) fail. Internet check karein.' });

    const company = ctx.company_name || 'Mill Entry System';
    const subject = String(letter.subject || '').trim();
    const note = String(caption || '').trim();
    let cap = `*${company}*`;
    if (subject) cap += `\nSubject: ${subject}`;
    cap += note ? `\n${note}` : '\nPlease find attached letter.';
    cap += `\n\n— ${company}`;

    const m = String(mode || 'default').toLowerCase();
    const results = [];
    if (m === 'phone') {
      if (!phone) return res.status(400).json({ detail: 'Phone number daalein' });
      const r = await sendWaMessage(wa.api_key, cleanPhone(phone, wa.country_code || '91'), cap, publicPdfUrl);
      results.push({ target: phone, success: r.success, error: r.error });
    } else if (m === 'group') {
      const gid = String(group_id || '').trim() || wa.default_group_id || wa.group_id;
      if (!gid) return res.status(400).json({ detail: 'Group ID daalein ya default group set karein' });
      const r = await sendWaGroup(wa.api_key, gid, cap, publicPdfUrl);
      results.push({ target: 'group', success: r.success, error: r.error });
    } else {
      let nums = wa.default_numbers || [];
      if (typeof nums === 'string') nums = nums.split(',').map(n => n.trim()).filter(Boolean);
      if (!Array.isArray(nums) || !nums.length) return res.status(400).json({ detail: 'Default numbers set nahi hai. Settings → WhatsApp mein numbers SAVE karein, ya phone/group choose karein.' });
      for (const n of nums) {
        const r = await sendWaMessage(wa.api_key, cleanPhone(n, wa.country_code || '91'), cap, publicPdfUrl);
        results.push({ target: n, success: r.success, error: r.error });
      }
    }
    const ok = results.filter(r => r.success).length;
    res.json({
      success: ok > 0,
      message: `Letter ${ok}/${results.length} target(s) pe bhej diya!`,
      details: results,
      pdf_url: publicPdfUrl,
    });
  }));

  return router;
};
