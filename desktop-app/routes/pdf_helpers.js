// Shared PDF helpers for PDFKit - Professional Colorful Styled
const path = require('path');
const fs = require('fs');

const C = {
  hdrBg: '#1a365d', hdrText: '#ffffff', border: '#cbd5e1',
  altRow: '#f0f7ff', text: '#1e293b',
  blueBg: '#e0f2fe', greenBg: '#dcfce7', yellowBg: '#fef3c7',
  purpleBg: '#e0e7ff', orangeBg: '#fff7ed', redBg: '#fee2e2',
  // Status colors
  paidText: '#059669', paidBg: '#d1fae5',
  pendingText: '#dc2626', pendingBg: '#fee2e2',
  partialText: '#d97706', partialBg: '#fef3c7',
  // Column colors
  jamaBg: '#f0fdf4', jamaText: '#059669',
  nikasiBg: '#fff1f2', nikasiText: '#dc2626',
  balanceBg: '#fefce8', balanceText: '#92400e',
  dateBg: '#eff6ff', dateText: '#1e40af',
};

// Font paths - try bundled fonts first, fallback to system Helvetica
const FONT_DIR = path.join(__dirname, '..', 'fonts');
const HAS_FREESANS = fs.existsSync(path.join(FONT_DIR, 'FreeSans.ttf'));

function registerFonts(doc) {
  if (HAS_FREESANS) {
    doc.registerFont('AppFont', path.join(FONT_DIR, 'FreeSans.ttf'));
    doc.registerFont('AppFontBold', path.join(FONT_DIR, 'FreeSansBold.ttf'));
    if (fs.existsSync(path.join(FONT_DIR, 'FreeSansOblique.ttf')))
      doc.registerFont('AppFontOblique', path.join(FONT_DIR, 'FreeSansOblique.ttf'));
  }
}

function F(weight) {
  if (!HAS_FREESANS) return weight === 'bold' ? 'Helvetica-Bold' : (weight === 'oblique' ? 'Helvetica-Oblique' : 'Helvetica');
  return weight === 'bold' ? 'AppFontBold' : (weight === 'oblique' ? 'AppFontOblique' : 'AppFont');
}

/**
 * Draw watermark on the current page of a pdfkit document.
 * Text watermark rendered as vector glyph paths (non-selectable, no text artifacts).
 */
function drawWatermark(doc, settings) {
  if (!settings || !settings.enabled) return;
  const savedY = doc.y;
  const savedX = doc.x;
  doc.save();
  const opacity = Math.max(0.02, Math.min(0.20, parseFloat(settings.opacity || 0.06)));
  doc.opacity(opacity);

  const wType = settings.type || 'text';
  const w = doc.page.width;
  const h = doc.page.height;

  if (wType === 'text') {
    const text = settings.text || '';
    if (text) {
      const fontSize = parseInt(settings.font_size || 52);
      const rotation = parseInt(settings.rotation || 45);
      doc.fontSize(fontSize).font(F('bold')).fillColor('#9ca3af');
      const tw = doc.widthOfString(text);
      const stepX = Math.max(tw * 1.1, 200);
      const stepY = Math.max(fontSize * 2.5, 150);
      // Tile watermark as vector glyph paths (non-selectable text)
      const font = doc._font;
      const canUseGlyphs = font && font.font && font.font.layout && font.font.unitsPerEm;
      for (let y = -h * 0.3; y < h * 1.3; y += stepY) {
        for (let x = -w * 0.3; x < w * 1.3; x += stepX) {
          doc.save();
          doc.translate(x, y);
          doc.rotate(-rotation, { origin: [0, 0] });
          if (canUseGlyphs) {
            try {
              const run = font.font.layout(text);
              const scale = fontSize / font.font.unitsPerEm;
              const yPos = -fontSize / 2 + fontSize * 0.8;
              doc.save();
              doc.translate(-tw / 2, yPos);
              doc.scale(scale, -scale);
              for (let i = 0; i < run.glyphs.length; i++) {
                const glyph = run.glyphs[i];
                const pos = run.positions[i];
                if (glyph.path) {
                  doc.save();
                  doc.translate(pos.xOffset, pos.yOffset);
                  doc.path(glyph.path.toSVG()).fill('#9ca3af');
                  doc.restore();
                }
                doc.translate(pos.xAdvance, pos.yAdvance);
              }
              doc.restore();
            } catch(e) {
              doc.text(text, -tw / 2, -fontSize / 2, { lineBreak: false });
            }
          } else {
            doc.text(text, -tw / 2, -fontSize / 2, { lineBreak: false });
          }
          doc.restore();
        }
      }
    }
  } else if (wType === 'image') {
    const imgPath = settings.image_path || '';
    if (imgPath) {
      try {
        const fs = require('fs');
        if (fs.existsSync(imgPath)) {
          const imgW = 150, imgH = 150;
          for (let y = 0; y < h; y += 250) {
            for (let x = 0; x < w; x += 250) {
              doc.image(imgPath, x, y, { width: imgW, height: imgH });
            }
          }
        }
      } catch (e) { /* skip if image not found */ }
    }
  }

  doc.restore();
  doc.y = savedY;
  doc.x = savedX;
}

function addPdfHeader(doc, title, branding, subtitle) {
  registerFonts(doc);
  branding = branding || {};
  const companyName = branding.company_name || 'Mill Entry System';
  const tagline = branding.tagline || '';
  const customFields = branding.custom_fields || [];
  
  // Amber header bar
  const barY = doc.y;
  // Custom fields ABOVE company name
  const aboveFields = customFields.filter(f => f.placement === 'above');
  const belowFields = customFields.filter(f => (f.placement || 'below') === 'below');
  const totalFieldRows = (aboveFields.length > 0 ? 1 : 0) + (belowFields.length > 0 ? 1 : 0);
  const barH = 42 + totalFieldRows * 12;
  doc.rect(20, barY, doc.page.width - 40, barH).fill('#fffbeb');
  doc.rect(20, barY, doc.page.width - 40, barH).stroke('#f59e0b');
  doc.rect(20, barY, doc.page.width - 40, 3).fill('#f59e0b');
  
  let curY = barY + 4;
  
  // Above fields
  if (aboveFields.length > 0) {
    const pageW = doc.page.width - 50;
    const fmtField = f => f.label ? `${f.label}: ${f.value}` : f.value;
    const left = aboveFields.filter(f => f.position === 'left').map(fmtField).join('  ');
    const center = aboveFields.filter(f => f.position === 'center').map(fmtField).join('  ');
    const right = aboveFields.filter(f => f.position === 'right').map(fmtField).join('  ');
    doc.fontSize(7).font(F('normal')).fillColor('#374151');
    if (left) doc.text(left, 25, curY, { align: 'left', width: pageW / 3 });
    if (center) doc.text(center, 25 + pageW / 3, curY, { align: 'center', width: pageW / 3 });
    if (right) doc.text(right, 25 + (pageW * 2 / 3), curY, { align: 'right', width: pageW / 3 });
    curY += 12;
  }
  
  doc.fontSize(16).font(F('bold')).fillColor(C.hdrBg)
    .text(companyName, 25, curY, { align: 'center', width: doc.page.width - 50 });
  curY += 18;
  if (tagline) { doc.fontSize(8).font(F('normal')).fillColor('#6b7280')
    .text(tagline, 25, curY, { align: 'center', width: doc.page.width - 50 }); curY += 10; }
  
  // Below fields (default)
  if (belowFields.length > 0) {
    const pageW = doc.page.width - 50;
    const fmtField = f => f.label ? `${f.label}: ${f.value}` : f.value;
    const left = belowFields.filter(f => f.position === 'left').map(fmtField).join('  ');
    const center = belowFields.filter(f => f.position === 'center').map(fmtField).join('  ');
    const right = belowFields.filter(f => f.position === 'right').map(fmtField).join('  ');
    doc.fontSize(7).font(F('normal')).fillColor('#374151');
    if (left) doc.text(left, 25, curY, { align: 'left', width: pageW / 3 });
    if (center) doc.text(center, 25 + pageW / 3, curY, { align: 'center', width: pageW / 3 });
    if (right) doc.text(right, 25 + (pageW * 2 / 3), curY, { align: 'right', width: pageW / 3 });
  }
  
  doc.y = barY + barH + 4;
  
  // Title bar - teal
  const titleY = doc.y;
  doc.rect(20, titleY, doc.page.width - 40, 22).fill('#0891b2');
  doc.fontSize(11).font(F('bold')).fillColor('#ffffff')
    .text(title, 25, titleY + 5, { align: 'center', width: doc.page.width - 50 });
  
  doc.y = titleY + 26;
  
  // Subtitle & date
  if (subtitle) doc.fontSize(8).font(F('normal')).fillColor('#6b7280').text(subtitle, { align: 'center' });
  doc.fontSize(7).font(F('normal')).fillColor('#9ca3af')
    .text(`Generated: ${new Date().toLocaleDateString('en-IN')} | ${new Date().toLocaleTimeString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.4);

  // Setup watermark: draw on first page + auto-draw on subsequent pages
  const wm = branding._watermark;
  if (wm && wm.enabled) {
    drawWatermark(doc, wm);
    doc.on('pageAdded', () => drawWatermark(doc, wm));
  }
}

function addPdfTable(doc, headers, rows, colWidths, opts) {
  registerFonts(doc);
  opts = opts || {};
  const fs = opts.fontSize || 7;
  const pad = opts.cellPad || 2;
  const hdrBg = opts.headerBg || C.hdrBg;
  const hdrTextColor = opts.headerTextColor || C.hdrText;
  const margin = opts.margin || 25;
  let y = doc.y;
  const rowH = fs + 9;

  // Auto-scale widths to fit page
  const pageWidth = doc.page.width - margin * 2;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const scale = totalW > pageWidth ? pageWidth / totalW : 1;
  const widths = colWidths.map(w => Math.floor(w * scale));
  const actualTotalW = widths.reduce((a, b) => a + b, 0);
  const startX = opts.startX || Math.max(margin, (doc.page.width - actualTotalW) / 2);

  // Identify column types from headers
  const headerLower = headers.map(h => String(h).toLowerCase());
  const isDateCol = headerLower.map(h => h.includes('date') || h.includes('tarikh'));
  const isJamaCol = headerLower.map(h => h.includes('jama') || h.includes('credit') || h.includes('received'));
  const isNikasiCol = headerLower.map(h => h.includes('nikasi') || h.includes('debit') || h.includes('paid'));
  const isBalCol = headerLower.map(h => h.includes('balance') || h.includes('bal') || h.includes('bakaya'));
  const isStatusCol = headerLower.map(h => h.includes('status'));
  const isAmtCol = headerLower.map(h => h.includes('amount') || h.includes('total') || h.includes('gross') || h.includes('net') || h.includes('rent') || h.includes('rate'));

  // Page check
  if (y + rowH * Math.min(rows.length + 1, 5) + 20 > doc.page.height - margin) { doc.addPage(); y = margin; }

  // Header row
  let x = startX;
  doc.rect(x, y, actualTotalW, rowH + 2).fill(hdrBg);
  headers.forEach((h, i) => {
    doc.rect(x, y, widths[i], rowH + 2).stroke(hdrBg);
    doc.fillColor(hdrTextColor).font(F('bold')).fontSize(fs + 0.5)
      .text(String(h), x + pad, y + pad + 1, { width: widths[i] - pad*2, height: rowH - 2, lineBreak: false });
    x += widths[i];
  });
  y += rowH + 2;

  // Data rows
  rows.forEach((row, ri) => {
    if (y + rowH > doc.page.height - margin) { doc.addPage(); y = margin; }
    x = startX;
    const isEven = ri % 2 === 0;
    const baseBg = isEven ? '#ffffff' : C.altRow;
    
    doc.rect(x, y, actualTotalW, rowH).fill(baseBg);
    
    row.forEach((cell, ci) => {
      let cellBg = baseBg;
      let textColor = C.text;
      let fontWeight = 'normal';
      const cellStr = String(cell ?? '');
      
      if (isDateCol[ci]) { cellBg = C.dateBg; textColor = C.dateText; }
      if (isJamaCol[ci] && cell && Number(cell) > 0) { cellBg = C.jamaBg; textColor = C.jamaText; fontWeight = 'bold'; }
      if (isNikasiCol[ci] && cell && Number(cell) > 0) { cellBg = C.nikasiBg; textColor = C.nikasiText; fontWeight = 'bold'; }
      if (isBalCol[ci]) { cellBg = C.balanceBg; textColor = C.balanceText; fontWeight = 'bold'; }
      if (isAmtCol[ci] && cell && !isNaN(Number(cell))) { fontWeight = 'bold'; }
      if (isStatusCol[ci]) {
        if (cellStr.toLowerCase() === 'paid') { cellBg = C.paidBg; textColor = C.paidText; fontWeight = 'bold'; }
        else if (cellStr.toLowerCase() === 'pending') { cellBg = C.pendingBg; textColor = C.pendingText; fontWeight = 'bold'; }
        else if (cellStr.toLowerCase() === 'partial') { cellBg = C.partialBg; textColor = C.partialText; fontWeight = 'bold'; }
      }
      
      doc.rect(x, y, widths[ci], rowH).fill(cellBg);
      doc.rect(x, y, widths[ci], rowH).stroke(C.border);
      doc.fillColor(textColor).font(F(fontWeight)).fontSize(fs)
        .text(cellStr, x + pad, y + pad, { width: widths[ci] - pad*2, height: rowH - 2, lineBreak: false });
      x += widths[ci];
    });
    y += rowH;
  });
  doc.y = y + 6;
  doc.x = startX;
}

function addSummaryBox(doc, labels, values, colWidths, bgColor) {
  registerFonts(doc);
  const fs = 7; const rowH = 18;
  let y = doc.y;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const startX = Math.max(25, (doc.page.width - totalW) / 2);
  if (y + rowH * 2 + 10 > doc.page.height - 25) { doc.addPage(); y = 25; }

  let x = startX;
  doc.rect(x, y, totalW, rowH).fill(bgColor || C.blueBg);
  doc.rect(x, y, totalW, rowH).stroke(C.border);
  labels.forEach((l, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor(C.text).font(F('bold')).fontSize(fs + 1)
      .text(String(l), x + 3, y + 4, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
    x += colWidths[i];
  });
  y += rowH;

  x = startX;
  doc.rect(x, y, totalW, rowH).fill('#ffffff');
  doc.rect(x, y, totalW, rowH).stroke(C.border);
  values.forEach((v, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor(C.text).font(F('bold')).fontSize(fs + 1)
      .text(String(v ?? ''), x + 3, y + 4, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
    x += colWidths[i];
  });
  doc.y = y + rowH + 4;
  doc.x = startX;
}

function addTotalsRow(doc, values, colWidths, opts) {
  registerFonts(doc);
  opts = opts || {};
  const fs = opts.fontSize || 7;
  const rowH = fs + 10;
  let y = doc.y;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const scale = totalW > (doc.page.width - 50) ? (doc.page.width - 50) / totalW : 1;
  const widths = colWidths.map(w => Math.floor(w * scale));
  const actualTotalW = widths.reduce((a, b) => a + b, 0);
  const startX = opts.startX || Math.max(25, (doc.page.width - actualTotalW) / 2);
  if (y + rowH > doc.page.height - 25) { doc.addPage(); y = 25; }
  
  let x = startX;
  doc.rect(x, y, actualTotalW, rowH).fill('#fef3c7');
  doc.rect(x, y, actualTotalW, 2).fill('#f59e0b');
  values.forEach((v, i) => {
    doc.rect(x, y, widths[i], rowH).stroke(C.border);
    doc.fillColor('#92400e').font(F('bold')).fontSize(fs + 1)
      .text(String(v ?? ''), x + 2, y + 3, { width: widths[i] - 4, height: rowH - 2, lineBreak: false });
    x += widths[i];
  });
  doc.y = y + rowH + 6;
}

function addSectionTitle(doc, title) {
  registerFonts(doc);
  if (doc.y > doc.page.height - 60) doc.addPage();
  doc.moveDown(0.3);
  const titleY = doc.y;
  doc.rect(25, titleY, doc.page.width - 50, 18).fill('#f0f9ff');
  doc.rect(25, titleY, 3, 18).fill('#0891b2');
  doc.fontSize(10).font(F('bold')).fillColor(C.hdrBg)
    .text(title, 32, titleY + 3, { width: doc.page.width - 60 });
  doc.y = titleY + 22;
  doc.fillColor('black').font(F('normal')).fontSize(7);
}

function fmtAmt(n) {
  return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '';
  const s = String(d).split('T')[0];
  const parts = s.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return s;
}

/**
 * Buffer PDF and send as complete response. Prevents ERR_STREAM_WRITE_AFTER_END.
 * Usage: Replace `doc.pipe(res); ... doc.end();` with `safePdfPipe(doc, res, filename);`
 * Call this AFTER all doc content is added, INSTEAD of doc.end().
 */
function safePdfPipe(doc, res, filename) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      if (filename) res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
      resolve();
    });
    doc.on('error', err => {
      console.error('PDF generation error:', err);
      if (!res.headersSent) res.status(500).json({ detail: 'PDF generation failed' });
      reject(err);
    });
    doc.end();
  });
}

/**
 * Create a PDFDocument with watermark auto-attached.
 * Use this instead of `new PDFDocument(...)` in routes that don't use addPdfHeader.
 * @param {object} opts - PDFDocument options (size, layout, margin, etc.)
 * @param {object} database - database object with data.app_settings (optional)
 * @returns {PDFDocument}
 */
function createPdfDoc(opts = {}, database = null) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument(opts);
  registerFonts(doc);
  let wm = null;
  if (database && database.data) {
    wm = (database.data.app_settings || []).find(s => s.setting_id === 'watermark');
  } else if (database && database._watermark) {
    wm = database._watermark;
  }
  if (wm && wm.enabled) {
    drawWatermark(doc, wm);
    doc.on('pageAdded', () => drawWatermark(doc, wm));
  }
  return doc;
}

// ============================================================================
// LIGHT-THEME SUMMARY BANNER (PDFKit + ExcelJS)
// ============================================================================
// Light cream bg + gold accent + per-stat colored value text.
// stats: [{ lbl: 'TOTAL ENTRIES', val: '42', color: '#1E293B' }, ...]

const STAT_COLORS = {
  primary: '#1E293B',  // slate-900
  green:   '#15803D',  // emerald-700
  red:     '#B91C1C',  // red-700
  gold:    '#B45309',  // amber-700
  orange:  '#C2410C',  // orange-700
  blue:    '#1D4ED8',  // blue-700
  emerald: '#047857',  // emerald-700
  purple:  '#7E22CE',  // purple-700
  teal:    '#0F766E',  // teal-700
  pink:    '#BE185D',  // pink-700
};

function fmtInr(n) {
  const num = Number(n) || 0;
  if (Math.abs(num - Math.trunc(num)) < 0.005) {
    return 'Rs. ' + Math.trunc(num).toLocaleString('en-IN');
  }
  return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Draw light-themed summary banner (PDFKit) at given (x, y). Returns new y after the banner.
 * @param {PDFDocument} doc
 * @param {{ lbl: string, val: string, color?: string }[]} stats
 * @param {number} x        - left X
 * @param {number} y        - top Y
 * @param {number} totalW   - total width
 */
function drawSummaryBanner(doc, stats, x, y, totalW) {
  if (!stats || stats.length === 0) return y;
  const summaryH = 30;
  // Light cream bg
  doc.rect(x, y, totalW, summaryH).fill('#FFFBEB');
  // Gold accent stripe at top + lighter gold below
  doc.rect(x, y, totalW, 2).fill('#F59E0B');
  doc.rect(x, y + 2, totalW, 1).fill('#FCD34D');

  const cellW = totalW / stats.length;
  stats.forEach((s, i) => {
    const cx = x + i * cellW;
    if (i > 0) doc.moveTo(cx, y + 8).lineTo(cx, y + summaryH - 4).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    // Label (slate-500 muted small caps)
    doc.fontSize(6).fillColor('#64748B').text(s.lbl, cx + 4, y + 7, { width: cellW - 8, align: 'center', characterSpacing: 0.4 });
    // Value (vibrant darker shade)
    doc.fontSize(9).fillColor(s.color || '#1E293B').text(s.val, cx + 4, y + 16, { width: cellW - 8, align: 'center' });
  });
  return y + summaryH;
}

/**
 * Add light-themed summary banner to ExcelJS worksheet at the given row.
 * @param {Worksheet} ws
 * @param {number} rowNum    - row index (1-based)
 * @param {number} ncols     - number of columns to merge across
 * @param {{ lbl: string, val: string }[]} stats
 */
function addExcelSummaryBanner(ws, rowNum, ncols, stats) {
  if (!stats || stats.length === 0) return;
  const text = '📊  ' + stats.map(s => `${s.lbl}: ${s.val}`).join('  •  ');
  ws.mergeCells(rowNum, 1, rowNum, ncols);
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: 'FF1E293B' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = {
    top: { style: 'medium', color: { argb: 'FFF59E0B' } },
    bottom: { style: 'thin', color: { argb: 'FFFCD34D' } },
    left: { style: 'thin', color: { argb: 'FFFDE68A' } },
    right: { style: 'thin', color: { argb: 'FFFDE68A' } },
  };
  ws.getRow(rowNum).height = 28;
}

module.exports = { addPdfHeader, addPdfTable, addSummaryBox, addTotalsRow, addSectionTitle, fmtAmt, fmtDate, C, registerFonts, F, safePdfPipe, drawWatermark, createPdfDoc, drawSummaryBanner, addExcelSummaryBanner, STAT_COLORS, fmtInr };
