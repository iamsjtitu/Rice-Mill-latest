/**
 * Shared Excel helpers for professional colorful styling
 */

const COLORS = {
  headerBg: 'FF1B4F72',
  headerText: 'FFFFFFFF',
  titleBg: 'FFFEF3C7',
  titleText: 'FF1B4F72',
  subtitleBg: 'FFFFF7ED',
  subtitleText: 'FFD97706',
  altRow1: 'FFF0F7FF',
  altRow2: 'FFFFFFFF',
  border: 'FFD0D5DD',
  headerBorder: 'FF0D3B66',
  // Amount colors
  amountPositive: 'FF16A34A',
  amountPositiveBg: 'FFDCFCE7',
  amountNegative: 'FFDC2626',
  amountNegativeBg: 'FFFEE2E2',
  // Status colors
  paidText: 'FF16A34A', paidBg: 'FFDCFCE7',
  pendingText: 'FFDC2626', pendingBg: 'FFFEE2E2',
  partialText: 'FFD97706', partialBg: 'FFFEF3C7',
  // Column type colors
  dateBg: 'FFEFF6FF',
  dateText: 'FF1E40AF',
  amountJamaBg: 'FFF0FDF4',
  amountNikasiBg: 'FFFFF1F2',
  balanceBg: 'FFFEFCE8',
};

function styleExcelHeader(sheet) {
  const headerRow = sheet.getRow(1);
  // Find actual header row (might be offset by title rows)
  let hRow = headerRow;
  for (let r = 1; r <= 5; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount > 3 && !row.getCell(1).isMerged) {
      hRow = row;
      break;
    }
  }
  
  hRow.font = { bold: true, size: 11, color: { argb: COLORS.headerText } };
  hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  hRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  hRow.height = 32;
  hRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.headerBorder } },
      bottom: { style: 'medium', color: { argb: COLORS.headerBorder } },
      left: { style: 'thin', color: { argb: COLORS.headerBorder } },
      right: { style: 'thin', color: { argb: COLORS.headerBorder } }
    };
  });
  
  sheet.columns.forEach(col => { col.width = Math.max(col.width || 14, 14); });
  sheet.pageSetup = { 
    paperSize: 9, orientation: 'landscape', fitToPage: true, 
    fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, 
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } 
  };
}

function styleExcelData(sheet, startRow) {
  const lastRow = sheet.rowCount;
  const colCount = sheet.columnCount;
  
  // Get header names to identify column types
  const headerRow = sheet.getRow(startRow - 1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum] = String(cell.value || '').toLowerCase();
  });
  
  for (let r = startRow; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const isEven = (r - startRow) % 2 === 0;
    row.height = 22;
    
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > colCount) return;
      
      const header = headers[colNumber] || '';
      const val = cell.value;
      
      // Default styling
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? COLORS.altRow1 : COLORS.altRow2 } };
      cell.border = {
        top: { style: 'hair', color: { argb: COLORS.border } },
        bottom: { style: 'hair', color: { argb: COLORS.border } },
        left: { style: 'hair', color: { argb: COLORS.border } },
        right: { style: 'hair', color: { argb: COLORS.border } }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { size: 10 };
      
      // Date columns - blue tint
      if (header.includes('date') || header.includes('tarikh')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dateBg } };
        cell.font = { size: 10, color: { argb: COLORS.dateText } };
      }
      
      // Jama/Credit columns - green tint
      if (header.includes('jama') || header.includes('credit') || header.includes('received') || header.includes('in')) {
        if (typeof val === 'number' && val > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.amountJamaBg } };
          cell.font = { bold: true, size: 10, color: { argb: COLORS.amountPositive } };
        }
      }
      
      // Nikasi/Debit columns - red tint
      if (header.includes('nikasi') || header.includes('debit') || header.includes('paid') || header.includes('out')) {
        if (typeof val === 'number' && val > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.amountNikasiBg } };
          cell.font = { bold: true, size: 10, color: { argb: COLORS.amountNegative } };
        }
      }
      
      // Balance column - yellow tint
      if (header.includes('balance') || header.includes('bal') || header.includes('bakaya')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.balanceBg } };
        cell.font = { bold: true, size: 10 };
        if (typeof val === 'number' && val < 0) {
          cell.font = { bold: true, size: 10, color: { argb: COLORS.amountNegative } };
        }
      }
      
      // Amount columns - bold
      if (header.includes('amount') || header.includes('total') || header.includes('gross') || header.includes('net') || header.includes('rent') || header.includes('rate')) {
        if (typeof val === 'number') {
          cell.font = { bold: true, size: 10 };
          cell.numFmt = '#,##0.00';
        }
      }
      
      // Status columns - colored badges
      const strVal = String(val || '');
      if (strVal === 'Paid' || strVal === 'paid') {
        cell.font = { bold: true, size: 10, color: { argb: COLORS.paidText } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paidBg } };
      } else if (strVal === 'Pending' || strVal === 'pending') {
        cell.font = { bold: true, size: 10, color: { argb: COLORS.pendingText } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.pendingBg } };
      } else if (strVal === 'Partial' || strVal === 'partial') {
        cell.font = { bold: true, size: 10, color: { argb: COLORS.partialText } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.partialBg } };
      }
    });
  }
  
  // Add total row styling if last row has 'TOTAL' or 'Total'
  const lastDataRow = sheet.getRow(lastRow);
  let hasTotal = false;
  lastDataRow.eachCell((cell) => {
    if (String(cell.value || '').toUpperCase().includes('TOTAL')) hasTotal = true;
  });
  if (hasTotal) {
    lastDataRow.font = { bold: true, size: 11 };
    lastDataRow.height = 26;
    lastDataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= colCount) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.border = {
          top: { style: 'medium', color: { argb: COLORS.headerBorder } },
          bottom: { style: 'medium', color: { argb: COLORS.headerBorder } },
          left: { style: 'thin', color: { argb: COLORS.border } },
          right: { style: 'thin', color: { argb: COLORS.border } }
        };
      }
    });
  }
}

function addExcelTitle(sheet, title, colCount, database) {
  const branding = database ? (database.getBranding ? database.getBranding() : {}) : {};
  const customFields = branding.custom_fields || [];
  
  // Build combined tagline with custom fields
  const taglineParts = [branding.tagline || ''];
  customFields.forEach(f => {
    if (f.label && f.value) taglineParts.push(`${f.label}: ${f.value}`);
  });
  const combinedTagline = taglineParts.filter(Boolean).join('  |  ');

  sheet.insertRow(1, []); sheet.insertRow(1, []); sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, colCount); 
  sheet.mergeCells(2, 1, 2, colCount); 
  sheet.mergeCells(3, 1, 3, colCount);
  
  const tc = sheet.getCell('A1'); 
  tc.value = branding.company_name || 'Mill Entry System';
  tc.font = { bold: true, size: 18, color: { argb: COLORS.titleText } }; 
  tc.alignment = { horizontal: 'center', vertical: 'middle' };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  sheet.getRow(1).height = 34;
  
  const sc = sheet.getCell('A2'); 
  sc.value = combinedTagline;
  sc.font = { size: 9, italic: true, color: { argb: 'FF555555' } }; 
  sc.alignment = { horizontal: 'center' };
  sheet.getRow(2).height = customFields.length > 0 ? 22 : 20;
  
  const dc = sheet.getCell('A3'); 
  dc.value = `${title} | ${new Date().toLocaleDateString('en-IN')}`;
  dc.font = { bold: true, size: 12, color: { argb: COLORS.subtitleText } }; 
  dc.alignment = { horizontal: 'center' };
  dc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtitleBg } };
  sheet.getRow(3).height = 26;
}

module.exports = { styleExcelHeader, styleExcelData, addExcelTitle, COLORS };
