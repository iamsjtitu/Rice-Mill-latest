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

function fmtDate(d) {
    if (!d) return '';
    const s = String(d).split('T')[0];
    const parts = s.split('-');
    if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return s;
}

function fmtVal(value, type) {
    if (type === 'date') return fmtDate(value);
    if (type === 'qntl') return +(((parseFloat(value) || 0) / 100).toFixed(2));
    if (type === 'integer') return Math.round(parseFloat(value) || 0);
    if (type === 'number') return +((parseFloat(value) || 0).toFixed(2));
    return value || '';
}

function getEntryRow(entry, columns) {
    return columns.map(col => fmtVal(entry[col.field], col.type));
}

function getTotalRow(totals, columns) {
    return columns.map(col => {
        if (col.show_total && col.total_key) {
            const val = totals[col.total_key];
            return fmtVal(val, col.type);
        }
        return '';
    });
}

function getExcelHeaders(columns) { return columns.map(c => c.header); }
function getPdfHeaders(columns) { return columns.map(c => c.pdf_header); }
function getExcelWidths(columns) { return columns.map(c => c.width_excel); }
function getPdfWidthsMm(columns) { return columns.map(c => c.width_pdf_mm); }
function colCount(columns) { return columns.length; }

function getTotalKeys(columns) {
    return columns.filter(c => c.show_total && c.total_key).map(c => c.total_key);
}

/**
 * Date Format Validator - Startup health check
 * Validates fmtDate utility and checks report_config date column types.
 * Call on app startup to detect date format issues early.
 */
function validateDateFormats() {
    const results = { fmtDate_tests: [], config_checks: [], status: 'healthy' };

    // 1. Test fmtDate with known inputs
    const tests = [
        ['2026-04-01', '01-04-2026'],
        ['2025-12-31', '31-12-2025'],
        ['2025-01-15', '15-01-2025'],
        ['', ''],
        [null, ''],
        ['01-04-2026', '01-04-2026'],  // already formatted
        ['2026-04-01T10:30:00', '01-04-2026'],  // ISO datetime
    ];
    for (const [input, expected] of tests) {
        const actual = fmtDate(input);
        const pass = actual === expected;
        results.fmtDate_tests.push({ input, expected, actual, status: pass ? 'PASS' : 'FAIL' });
        if (!pass) results.status = 'unhealthy';
    }

    // 2. Check report_config.json - all 'date' field columns should have type 'date'
    try {
        const cfg = loadConfig();
        for (const [reportName, reportDef] of Object.entries(cfg)) {
            const cols = reportDef.columns || [];
            for (const col of cols) {
                if (col.field === 'date' && col.type !== 'date') {
                    results.config_checks.push({ report: reportName, field: col.field, type: col.type, status: 'WARN', message: `Column type is '${col.type}' instead of 'date'` });
                    results.status = 'warning';
                }
            }
        }
        if (results.config_checks.length === 0) {
            results.config_checks.push({ status: 'OK', message: 'All date columns have type=date in report_config.json' });
        }
    } catch (e) {
        results.config_checks.push({ status: 'ERROR', message: e.message });
    }

    return results;
}

/**
 * Run on startup - logs warnings to console
 */
function runStartupDateCheck() {
    try {
        const report = validateDateFormats();
        const failedTests = report.fmtDate_tests.filter(t => t.status === 'FAIL');
        if (failedTests.length > 0) {
            console.error('[DATE VALIDATOR] fmtDate() FAILED:', JSON.stringify(failedTests));
        } else {
            console.log('[DATE VALIDATOR] fmtDate() OK - all test cases passed');
        }
        const configWarns = report.config_checks.filter(c => c.status === 'WARN');
        if (configWarns.length > 0) {
            console.warn('[DATE VALIDATOR] Config warnings:', JSON.stringify(configWarns));
        }
    } catch (e) {
        console.error('[DATE VALIDATOR] Startup check error:', e.message);
    }
}

module.exports = { getColumns, fmtVal, fmtDate, getEntryRow, getTotalRow, getExcelHeaders, getPdfHeaders, getExcelWidths, getPdfWidthsMm, colCount, getTotalKeys, validateDateFormats, runStartupDateCheck };
