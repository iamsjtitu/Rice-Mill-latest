// Shared PDF helpers for PDFKit - Professional Styled
const C = {
  hdrBg: '#1a365d', hdrText: '#ffffff', border: '#cbd5e1',
  altRow: '#f8fafc', text: '#1e293b',
  blueBg: '#e0f2fe', greenBg: '#dcfce7', yellowBg: '#fef3c7',
  purpleBg: '#e0e7ff', orangeBg: '#fff7ed', redBg: '#fee2e2'
};

function addPdfHeader(doc, title, branding, subtitle) {
  branding = branding || {};
  doc.fontSize(16).font('Helvetica-Bold').fillColor(C.hdrBg)
    .text(branding.company_name || 'Mill Entry System', { align: 'center' });
  if (branding.tagline) doc.fontSize(8).font('Helvetica').fillColor('grey').text(branding.tagline, { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(13).font('Helvetica-Bold').fillColor(C.hdrBg).text(title, { align: 'center' });
  if (subtitle) doc.fontSize(8).font('Helvetica').fillColor('grey').text(subtitle, { align: 'center' });
  doc.fontSize(7.5).font('Helvetica').fillColor('grey').text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.2);
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(25, doc.y).lineTo(doc.page.width - 25, doc.y).stroke();
  doc.moveDown(0.4);
}

function addPdfTable(doc, headers, rows, colWidths, opts) {
  opts = opts || {};
  const fs = opts.fontSize || 7;
  const hdrBg = opts.headerBg || C.hdrBg;
  const hdrTextColor = opts.headerTextColor || C.hdrText;
  const margin = opts.margin || 25;
  let y = doc.y;
  const rowH = fs + 8;

  // Auto-scale widths to fit page
  const pageWidth = doc.page.width - margin * 2;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const scale = totalW > pageWidth ? pageWidth / totalW : 1;
  const widths = colWidths.map(w => Math.floor(w * scale));
  const actualTotalW = widths.reduce((a, b) => a + b, 0);
  // Center the table on page
  const startX = opts.startX || Math.max(margin, (doc.page.width - actualTotalW) / 2);

  // Page check
  if (y + rowH * Math.min(rows.length + 1, 5) + 20 > doc.page.height - margin) { doc.addPage(); y = margin; }

  // Header row
  let x = startX;
  doc.rect(x, y, actualTotalW, rowH).fill(hdrBg);
  headers.forEach((h, i) => {
    doc.rect(x, y, widths[i], rowH).stroke(C.border);
    doc.fillColor(hdrTextColor).font('Helvetica-Bold').fontSize(fs + 0.5)
      .text(String(h), x + 3, y + 3, { width: widths[i] - 6, height: rowH - 2, lineBreak: false });
    x += widths[i];
  });
  y += rowH;

  // Data rows
  rows.forEach((row, ri) => {
    if (y + rowH > doc.page.height - margin) { doc.addPage(); y = margin; }
    x = startX;
    const bgColor = ri % 2 === 0 ? '#ffffff' : C.altRow;
    doc.rect(x, y, actualTotalW, rowH).fill(bgColor);
    row.forEach((cell, ci) => {
      doc.rect(x, y, widths[ci], rowH).stroke(C.border);
      doc.fillColor(C.text).font('Helvetica').fontSize(fs)
        .text(String(cell ?? ''), x + 3, y + 3, { width: widths[ci] - 6, height: rowH - 2, lineBreak: false });
      x += widths[ci];
    });
    y += rowH;
  });
  doc.y = y + 6;
  doc.x = startX;
}

function addSummaryBox(doc, labels, values, colWidths, bgColor) {
  const fs = 7; const rowH = 16;
  let y = doc.y;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const startX = Math.max(25, (doc.page.width - totalW) / 2);
  if (y + rowH * 2 + 10 > doc.page.height - 25) { doc.addPage(); y = 25; }

  // Labels
  let x = startX;
  doc.rect(x, y, totalW, rowH).fill(bgColor || C.blueBg);
  labels.forEach((l, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(fs + 0.5)
      .text(String(l), x + 3, y + 3, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
    x += colWidths[i];
  });
  y += rowH;

  // Values
  x = startX;
  doc.rect(x, y, totalW, rowH).fill('#ffffff');
  values.forEach((v, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor(C.text).font('Helvetica').fontSize(fs)
      .text(String(v ?? ''), x + 3, y + 3, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false, align: 'center' });
    x += colWidths[i];
  });
  doc.y = y + rowH + 2;
  doc.x = startX;
}

function addTotalsRow(doc, values, colWidths, opts) {
  opts = opts || {};
  const fs = opts.fontSize || 7;
  const rowH = fs + 8;
  let y = doc.y;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const startX = opts.startX || Math.max(25, (doc.page.width - totalW) / 2);
  let x = startX;
  doc.rect(x, y, totalW, rowH).fill(C.blueBg);
  values.forEach((v, i) => {
    doc.rect(x, y, colWidths[i], rowH).stroke(C.border);
    doc.fillColor(C.text).font('Helvetica-Bold').fontSize(fs + 0.5)
      .text(String(v ?? ''), x + 3, y + 3, { width: colWidths[i] - 6, height: rowH - 2, lineBreak: false });
    x += colWidths[i];
  });
  doc.y = y + rowH + 6;
}

function addSectionTitle(doc, title) {
  if (doc.y > doc.page.height - 60) doc.addPage();
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(C.hdrBg).text(title, { align: 'center' });
  doc.moveDown(0.15);
  doc.fillColor('black').font('Helvetica').fontSize(7);
}

function fmtAmt(n) {
  return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

module.exports = { addPdfHeader, addPdfTable, addSummaryBox, addTotalsRow, addSectionTitle, fmtAmt, C };
