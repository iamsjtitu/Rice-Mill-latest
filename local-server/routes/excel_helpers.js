/**
 * Shared Excel helpers for professional styling
 */

function styleExcelHeader(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0D3B66' } },
      bottom: { style: 'thin', color: { argb: 'FF0D3B66' } },
      left: { style: 'thin', color: { argb: 'FF0D3B66' } },
      right: { style: 'thin', color: { argb: 'FF0D3B66' } }
    };
  });
  sheet.columns.forEach(col => { col.width = Math.max(col.width || 14, 14); });
  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
}

function styleExcelData(sheet, startRow) {
  const lastRow = sheet.rowCount;
  const colCount = sheet.columnCount;
  for (let r = startRow; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const isEven = (r - startRow) % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= colCount) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F7FF' : 'FFFFFFFF' } };
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          left: { style: 'hair', color: { argb: 'FFD0D5DD' } },
          right: { style: 'hair', color: { argb: 'FFD0D5DD' } }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { size: 10 };
      }
    });
    row.eachCell((cell) => {
      if (cell.value === 'Paid') {
        cell.font = { bold: true, size: 10, color: { argb: 'FF16A34A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      } else if (cell.value === 'Pending') {
        cell.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      } else if (cell.value === 'Partial') {
        cell.font = { bold: true, size: 10, color: { argb: 'FFD97706' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      }
    });
  }
}

function addExcelTitle(sheet, title, colCount, database) {
  const branding = database ? database.getBranding() : { company_name: 'Mill Entry', tagline: '' };
  sheet.insertRow(1, []); sheet.insertRow(1, []); sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, colCount); sheet.mergeCells(2, 1, 2, colCount); sheet.mergeCells(3, 1, 3, colCount);
  const tc = sheet.getCell('A1'); tc.value = branding.company_name;
  tc.font = { bold: true, size: 18, color: { argb: 'FF1B4F72' } }; tc.alignment = { horizontal: 'center', vertical: 'middle' };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  sheet.getRow(1).height = 32;
  const sc = sheet.getCell('A2'); sc.value = branding.tagline;
  sc.font = { size: 10, italic: true, color: { argb: 'FF666666' } }; sc.alignment = { horizontal: 'center' };
  const dc = sheet.getCell('A3'); dc.value = `${title} | ${new Date().toLocaleDateString('en-IN')}`;
  dc.font = { bold: true, size: 12, color: { argb: 'FFD97706' } }; dc.alignment = { horizontal: 'center' };
  dc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
  sheet.getRow(3).height = 24;
}

module.exports = { styleExcelHeader, styleExcelData, addExcelTitle };
