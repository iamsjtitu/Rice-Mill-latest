// Shared PDF helpers for PDFKit - Professional Colorful Styled
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

function addPdfHeader(doc, title, branding, subtitle) {
  branding = branding || {};
  const companyName = branding.company_name || 'Mill Entry System';
  const tagline = branding.tagline || '';
  
  // Amber header bar
  const barY = doc.y;
  doc.rect(20, barY, doc.page.width - 40, 42).fill('#fffbeb');
  doc.rect(20, barY, doc.page.width - 40, 42).stroke('#f59e0b');
  doc.rect(20, barY, doc.page.width - 40, 3).fill('#f59e0b');
  
  doc.fontSize(16).font('Helvetica-Bold').fillColor(C.hdrBg)
    .text(companyName, 25, barY + 8, { align: 'center', width: doc.page.width - 50 });
  if (tagline) doc.fontSize(8).font('Helvetica').fillColor('#6b7280')
    .text(tagline, 25, barY + 26, { align: 'center', width: doc.page.width - 50 });
  
  doc.y = barY + 48;
  
  // Title bar - teal
  const titleY = doc.y;
  doc.rect(20, titleY, doc.page.width - 40, 22).fill('#0891b2');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
    .text(title, 25, titleY + 5, { align: 'center', width: doc.page.width - 50 });
  
  doc.y = titleY + 26;
  
  // Subtitle & date
  if (subtitle) doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text(subtitle, { align: 'center' });
  doc.fontSize(7).font('Helvetica').fillColor('#9ca3af')
    .text(`Generated: ${new Date().toLocaleDateString('en-IN')} | ${new Date().toLocaleTimeString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.4);
}

function addPdfTable(doc, headers, rows, colWidths, opts) {
  opts = opts || {};
  const fs = opts.fontSize || 7;
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

  // Header row with gradient effect
  let x = startX;
  doc.rect(x, y, actualTotalW, rowH + 2).fill(hdrBg);
  headers.forEach((h, i) => {
    doc.rect(x, y, widths[i], rowH + 2).stroke(hdrBg);
    doc.fillColor(hdrTextColor).font('Helvetica-Bold').fontSize(fs + 0.5)
      .text(String(h), x + 3, y + 4, { width: widths[i] - 6, height: rowH - 2, lineBreak: false });
    x += widths[i];
  });
  y += rowH + 2;

  // Data rows with colorful columns
  rows.forEach((row, ri) => {
    if (y + rowH > doc.page.height - margin) { doc.addPage(); y = margin; }
    x = startX;
    const isEven = ri % 2 === 0;
    const baseBg = isEven ? '#ffffff' : C.altRow;
    
    // Full row background
    doc.rect(x, y, actualTotalW, rowH).fill(baseBg);
    
    row.forEach((cell, ci) => {
      let cellBg = baseBg;
      let textColor = C.text;
      let fontWeight = 'Helvetica';
      const cellStr = String(cell ?? '');
      
      // Date columns - blue tint
      if (isDateCol[ci]) { cellBg = C.dateBg; textColor = C.dateText; }
      
      // Jama columns - green
      if (isJamaCol[ci] && cell && Number(cell) > 0) { cellBg = C.jamaBg; textColor = C.jamaText; fontWeight = 'Helvetica-Bold'; }
      
      // Nikasi columns - red
      if (isNikasiCol[ci] && cell && Number(cell) > 0) { cellBg = C.nikasiBg; textColor = C.nikasiText; fontWeight = 'Helvetica-Bold'; }
      
      // Balance columns - yellow
      if (isBalCol[ci]) { cellBg = C.balanceBg; textColor = C.balanceText; fontWeight = 'Helvetica-Bold'; }
      
      // Amount columns - bold
      if (isAmtCol[ci] && cell && !isNaN(Number(cell))) { fontWeight = 'Helvetica-Bold'; }
      
      // Status columns - colored
      if (isStatusCol[ci]) {
        if (cellStr.toLowerCase() === 'paid') { cellBg = C.paidBg; textColor = C.paidText; fontWeight = 'Helvetica-Bold'; }
        else if (cellStr.toLowerCase() === 'pending') { cellBg = C.pendingBg; textColor = C.pendingText; fontWeight = 'Helvetica-Bold'; }
        else if (cellStr.toLowerCase() === 'partial') { cellBg = C.partialBg; textColor = C.partialText; fontWeight = 'Helvetica-Bold'; }
      }
      
      doc.rect(x, y, widths[ci], rowH).fill(cellBg);
      doc.rect(x, y, widths[ci], rowH).stroke(C.border);
      doc.fillColor(textColor).font(fontWeight).fontSize(fs)
        .text(cellStr, x + 3, y + 3, { width: widths[ci] - 6, height: rowH - 2, lineBreak: false });
      x += widths[ci];
    });
    y += rowH;
  });
  doc.y = y + 6;
  doc.x = startX;
}

function addSummaryBox(doc, labels, values, colWidths, bgColor) {
  const fs = 7; const rowH = 18;
  let y = doc.y;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const startX = Math.max(25, (doc.page.width - totalW) / 2);
  if (y + rowH * 2 + 10 > doc.page.height - 25) { doc.addPage(); y = 25; }

  // Labels row
  let x = startX;
  doc.rect(x, y, totalW, rowH).fill(bgColor || C.blueBg);
  doc.rect(x, y, totalW, rowH).stroke(C.border);
  labels.forEach((l, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(fs + 1)
      .text(String(l), x + 3, y + 4, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
    x += colWidths[i];
  });
  y += rowH;

  // Values row
  x = startX;
  doc.rect(x, y, totalW, rowH).fill('#ffffff');
  doc.rect(x, y, totalW, rowH).stroke(C.border);
  values.forEach((v, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(fs + 1)
      .text(String(v ?? ''), x + 3, y + 4, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
    x += colWidths[i];
  });
  doc.y = y + rowH + 4;
  doc.x = startX;
}

function addTotalsRow(doc, values, colWidths, opts) {
  opts = opts || {};
  const fs = opts.fontSize || 7;
  const rowH = fs + 10;
  let y = doc.y;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const startX = opts.startX || Math.max(25, (doc.page.width - totalW) / 2);
  if (y + rowH > doc.page.height - 25) { doc.addPage(); y = 25; }
  
  let x = startX;
  // Amber total bar
  doc.rect(x, y, totalW, rowH).fill('#fef3c7');
  doc.rect(x, y, totalW, 2).fill('#f59e0b');
  values.forEach((v, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(fs + 1)
      .text(String(v ?? ''), x + 3, y + 4, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false });
    x += colWidths[i];
  });
  doc.y = y + rowH + 6;
}

function addSectionTitle(doc, title) {
  if (doc.y > doc.page.height - 60) doc.addPage();
  doc.moveDown(0.3);
  const titleY = doc.y;
  doc.rect(25, titleY, doc.page.width - 50, 18).fill('#f0f9ff');
  doc.rect(25, titleY, 3, 18).fill('#0891b2');
  doc.fontSize(10).font('Helvetica-Bold').fillColor(C.hdrBg)
    .text(title, 32, titleY + 3, { width: doc.page.width - 60 });
  doc.y = titleY + 22;
  doc.fillColor('black').font('Helvetica').fontSize(7);
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

module.exports = { addPdfHeader, addPdfTable, addSummaryBox, addTotalsRow, addSectionTitle, fmtAmt, fmtDate, C };
