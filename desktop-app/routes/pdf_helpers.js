// Shared PDF helpers for PDFKit
function addPdfHeader(doc, title, branding) {
  branding = branding || {};
  doc.fontSize(18).font('Helvetica-Bold').text(branding.company_name || 'Mill Entry System', { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(branding.tagline || '', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(8).text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke('#1E3A5F');
  doc.moveDown(0.5);
}

function addPdfTable(doc, headers, rows, colWidths) {
  const startX = 40;
  const pageWidth = doc.page.width - 80;
  const totalW = colWidths.reduce((s, w) => s + w, 0);
  const scale = pageWidth / totalW;
  const widths = colWidths.map(w => w * scale);
  const rowH = 15;
  
  // Header
  let x = startX;
  doc.fontSize(7).font('Helvetica-Bold');
  const headerY = doc.y;
  doc.rect(startX, headerY - 2, pageWidth, 18).fill('#1E3A5F');
  headers.forEach((h, i) => {
    doc.fillColor('#FFFFFF').text(h, x + 2, headerY + 1, { width: widths[i] - 4, align: 'center', lineBreak: false, ellipsis: true });
    x += widths[i];
  });
  doc.y = headerY + 18;
  
  // Rows
  doc.font('Helvetica').fontSize(7).fillColor('#333333');
  rows.forEach((row, ri) => {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      doc.y = 40;
    }
    x = startX;
    const rowY = doc.y;
    if (ri % 2 === 0) doc.rect(startX, rowY - 1, pageWidth, rowH).fill('#F0F4F8').fillColor('#333333');
    else doc.fillColor('#333333');
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x + 2, rowY + 1, { width: widths[i] - 4, align: i === 0 ? 'left' : 'right', lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = rowY + rowH;
  });
}

module.exports = { addPdfHeader, addPdfTable };
