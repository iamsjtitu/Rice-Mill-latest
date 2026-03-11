const fs = require('fs');
const path = require('path');

let _config = null;
function loadConfig() {
    if (!_config) _config = JSON.parse(fs.readFileSync(path.join(__dirname, 'report_config.json')));
    return _config;
}

function getColumns(reportName, subkey) {
    subkey = subkey || 'columns';
    return loadConfig()[reportName][subkey];
}

function fmtVal(value, type) {
    if (type === 'qntl') return Math.round((value || 0) / 100 * 100) / 100;
    if (type === 'integer') return Math.round(value || 0);
    if (type === 'number') return value || 0;
    return value || '';
}

function getEntryRow(entry, columns) {
    return columns.map(col => fmtVal(entry[col.field], col.type));
}

function getTotalRow(totals, columns) {
    return columns.map(col => col.show_total && col.total_key ? fmtVal(totals[col.total_key], col.type) : null);
}

function getExcelHeaders(columns) { return columns.map(c => c.header); }
function getPdfHeaders(columns) { return columns.map(c => c.pdf_header); }
function getExcelWidths(columns) { return columns.map(c => c.width_excel); }
function getPdfWidthsMm(columns) { return columns.map(c => c.width_pdf_mm); }
function colCount(columns) { return columns.length; }

function getTotalKeys(columns) {
    return columns.filter(c => c.show_total && c.total_key).map(c => c.total_key);
}

module.exports = { getColumns, fmtVal, getEntryRow, getTotalRow, getExcelHeaders, getPdfHeaders, getExcelWidths, getPdfWidthsMm, colCount, getTotalKeys };
