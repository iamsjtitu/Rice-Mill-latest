/**
 * Letter Pad — Company letterhead generator with optional AI assistant.
 * Mirrors /app/backend/routes/letter_pad.py (triple-backend parity).
 */
const express = require('express');
const { safeSync } = require('./safe_handler');
const { F: pdfF, registerFonts } = require('./pdf_helpers');
const PDFDocument = require('pdfkit');
const docx = require('docx');

module.exports = (database) => {
  const router = express.Router();

  // Helper: load combined letter context
  const loadCtx = () => {
    const settings = database.data.app_settings || {};
    const lp = (database.data.app_settings_extra || {}).letter_pad || {};
    const pick = (...opts) => opts.find(o => o && String(o).trim()) || '';
    return {
      company_name: pick(settings.company_name, 'NAVKAR AGRO'),
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
    const textFields = ['gstin', 'phone', 'phone_secondary', 'address', 'email', 'license_number', 'signature_name', 'signature_designation', 'ai_provider'];
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
    generate: 'You are a professional business letter writer. Write ONLY the BODY of a formal Indian business letter — never include the letterhead, sender\'s company name/address (those are pre-printed on the letterhead), date, ref number, To/recipient block, or signature (those are added separately). STRICT RULES: 1) NO preamble like "Here is your letter:" or "Sure, here\'s a letter". 2) NO sender\'s company info — the letterhead already contains the company name and address. 3) NO placeholders like "[Your Name]", "[Date]", "[Recipient]", "[Account No]". 4) Start directly with "Respected Sir/Madam," (or appropriate greeting). 5) End with "Thanking you." (NO "Yours faithfully" / signature). 6) Write in first person plural (we/our) for company correspondence. 7) Match the language requested. 150-300 words. Polite, direct, formal. 8) Output ONLY the letter body — nothing else.',
    improve: "You are a professional business letter editor. Rewrite the user's draft with improved grammar, tone, and professionalism. STRICT RULES: 1) Output ONLY the improved letter body — no preamble, no explanation. 2) NO placeholders like '[Your Name]'. 3) Preserve the user's intent and key facts (dates, amounts, names). 4) Don't add 'Yours faithfully' / signature — those are added separately. 5) Keep length similar. Same language as input.",
    translate: "You are a professional translator for Indian business letters. Translate between English, Hindi (Devanagari), and Odia. STRICT RULES: 1) Output ONLY the translation — no preamble, no explanation. 2) Preserve formal business tone and all factual details (numbers, dates, names). 3) Use natural, professional phrasing in the target language.",
  };

  async function callGemini(apiKey, sys, user) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      // Gemini 2.5 Flash: maxOutputTokens includes thinking tokens. Disable
      // thinking so the full budget is available for the actual letter body.
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Gemini error: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  async function callOpenAI(apiKey, sys, user) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        max_completion_tokens: 1024,
      }),
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
    try {
      const out = provider === 'gemini' ? await callGemini(ctx.gemini_key, SYSTEM_PROMPTS[mode], userPrompt) : await callOpenAI(ctx.openai_key, SYSTEM_PROMPTS[mode], userPrompt);
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
    doc.font(pdfF('bold')).fontSize(22).fillColor(RED).text(`\u0950 ${ctx.company_name}`, 0, top + 18, { align: 'center', width: pageW });
    let y = top + 48;
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
    const { ref_no, date, to_address, subject, references, body } = req.body || {};
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    registerFonts(doc);
    const fname = `letter_${(date || new Date().toISOString().slice(0, 10)).replace(/-/g, '')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    doc.pipe(res);
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
    doc.end();
  }));

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
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `\u0950 ${ctx.company_name}`, bold: true, size: 56, color: 'C0392B' })] }),
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

  return router;
};
