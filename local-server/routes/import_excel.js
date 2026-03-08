const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const ExcelJS = require('exceljs');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

module.exports = function(database) {

function calculateAutoFields(data) {
  const kg = data.kg || 0;
  const gbwCut = data.gbw_cut || 0;
  const plasticBag = data.plastic_bag || 0;
  const cuttingPercent = data.cutting_percent || 0;
  const moisture = data.moisture || 0;
  const discDustPoll = data.disc_dust_poll || 0;
  const pPktCut = +(plasticBag * 0.5).toFixed(2);
  data.p_pkt_cut = pPktCut;
  const millWKg = kg - gbwCut;
  const millWQntl = millWKg / 100;
  const moistureCutPercent = Math.max(0, moisture - 17);
  const moistureCutQntl = +((millWQntl * moistureCutPercent) / 100).toFixed(2);
  const moistureCutKg = +(moistureCutQntl * 100).toFixed(2);
  data.moisture_cut = moistureCutKg;
  data.moisture_cut_qntl = moistureCutQntl;
  data.moisture_cut_percent = moistureCutPercent;
  const cuttingQntl = +((millWQntl * cuttingPercent) / 100).toFixed(2);
  const cuttingKg = +(cuttingQntl * 100).toFixed(2);
  data.cutting = cuttingKg;
  data.cutting_qntl = cuttingQntl;
  const pPktCutQntl = pPktCut / 100;
  const discDustPollQntl = discDustPoll / 100;
  data.qntl = +(kg / 100).toFixed(2);
  data.mill_w = millWKg;
  const finalWQntl = millWQntl - pPktCutQntl - moistureCutQntl - cuttingQntl - discDustPollQntl;
  data.final_w = +(finalWQntl * 100).toFixed(2);
  return data;
}

function parseDate(val) {
  if (!val) return null;
  // Handle ExcelJS formula objects
  if (typeof val === 'object' && val !== null && 'result' in val) val = val.result;
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  if (!s || s === '-') return null;
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split(' ')[0].split('T')[0];
  // Try DD-MM-YYYY or DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  return null;
}

// Extract actual value from ExcelJS cell (handles formulas, rich text, etc.)
function getCellRawValue(cell) {
  const v = cell.value;
  if (v == null) return null;
  // ExcelJS formula cells: { formula: '...', result: value }
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)) {
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map(r => r.text || '').join('');
    if ('text' in v) return v.text;
    if ('hyperlink' in v) return v.text || v.hyperlink;
    return null;
  }
  return v;
}

function safeFloat(val) {
  if (val == null) return 0;
  // Handle ExcelJS formula objects directly
  if (typeof val === 'object' && val !== null && 'result' in val) val = val.result;
  if (val == null || String(val).trim() === '' || String(val).trim() === '-') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}
function safeInt(val) {
  if (val == null) return 0;
  // Handle ExcelJS formula objects directly
  if (typeof val === 'object' && val !== null && 'result' in val) val = val.result;
  if (val == null || String(val).trim() === '' || String(val).trim() === '-') return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}
function safeString(val) {
  if (val == null) return '';
  // Handle ExcelJS formula objects
  if (typeof val === 'object' && val !== null && 'result' in val) val = val.result;
  if (typeof val === 'object' && val !== null && 'richText' in val) return val.richText.map(r => r.text || '').join('');
  if (val == null) return '';
  return String(val).trim();
}

router.post('/api/entries/import-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ detail: 'File upload karein' });
    const kmsYear = req.body.kms_year || '';
    const season = req.body.season || '';
    const username = req.body.username || 'admin';
    const previewOnly = req.body.preview_only === 'true';

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ detail: 'Excel sheet nahi mili' });

    // Find header row
    let headerRow = null;
    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      for (let c = 1; c <= Math.min(5, ws.columnCount); c++) {
        const v = safeString(ws.getCell(r, c).value).toUpperCase();
        if (v === 'DATE') { headerRow = r; break; }
      }
      if (headerRow) break;
    }
    if (!headerRow) return res.status(400).json({ detail: "Header row nahi mila. 'DATE' column hona chahiye." });

    // Build column map
    const colMap = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = safeString(ws.getCell(headerRow, c).value).toUpperCase();
      if (v.includes('DATE')) colMap.date = c;
      else if (v.includes('TRUCK')) colMap.truck_no = c;
      else if (v.includes('AGENT')) colMap.agent_name = c;
      else if (v.includes('MANDI')) colMap.mandi_name = c;
      else if (v.includes('NETT') || v === 'KG') colMap.kg = c;
      else if (v === 'BAG') colMap.bag = c;
      else if (v.includes('DEPOSITE') || v.includes('G.DEP')) colMap.g_deposite = c;
      else if (v.includes('GBW')) colMap.gbw_cut = c;
      else if (v.includes('CUTTING') && !v.includes('QNTL')) colMap.cutting_percent = c;
      else if (v.includes('ISSUED')) colMap.g_issued = c;
      else if (v.includes('MOISTURE')) colMap.moisture = c;
      else if (v.includes('DISC') || v.includes('DUST')) colMap.disc_dust_poll = c;
      else if (v.includes('CASH')) colMap.cash_paid = c;
      else if (v.includes('DIESEL')) colMap.diesel_paid = c;
      else if (v.includes('REMARK')) colMap.remark = c;
    }

    const entries = [];
    let skipped = 0;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const dateStr = parseDate(getCellRawValue(ws.getCell(r, colMap.date || 1)));
      const truckVal = safeString(ws.getCell(r, colMap.truck_no || 2).value);
      if (!dateStr || !truckVal) { skipped++; continue; }

      let cuttingRaw = safeFloat(ws.getCell(r, colMap.cutting_percent || 10).value);
      const cuttingPct = (cuttingRaw > 0 && cuttingRaw < 1) ? cuttingRaw * 100 : cuttingRaw;

      entries.push({
        date: dateStr, kms_year: kmsYear, season: season, truck_no: truckVal,
        agent_name: safeString(ws.getCell(r, colMap.agent_name || 3).value),
        mandi_name: safeString(ws.getCell(r, colMap.mandi_name || 4).value),
        kg: safeFloat(ws.getCell(r, colMap.kg || 5).value),
        bag: safeInt(ws.getCell(r, colMap.bag || 6).value),
        g_deposite: safeFloat(ws.getCell(r, colMap.g_deposite || 7).value),
        gbw_cut: safeFloat(ws.getCell(r, colMap.gbw_cut || 8).value),
        cutting_percent: cuttingPct,
        g_issued: safeFloat(ws.getCell(r, colMap.g_issued || 12).value),
        moisture: safeFloat(ws.getCell(r, colMap.moisture || 13).value),
        disc_dust_poll: safeFloat(ws.getCell(r, colMap.disc_dust_poll || 14).value),
        cash_paid: safeFloat(ws.getCell(r, colMap.cash_paid || 16).value),
        diesel_paid: safeFloat(ws.getCell(r, colMap.diesel_paid || 17).value),
        remark: safeString(ws.getCell(r, colMap.remark || 18).value),
      });
    }

    if (previewOnly) {
      return res.json({ preview: true, count: entries.length, skipped, sample: entries.slice(0, 10), columns_detected: Object.keys(colMap) });
    }

    if (!database.data.mill_entries) database.data.mill_entries = [];
    if (!database.data.cash_transactions) database.data.cash_transactions = [];
    if (!database.data.diesel_accounts) database.data.diesel_accounts = [];

    // Find default pump
    let pumpName = 'Default Pump', pumpId = 'default';
    if (database.data.diesel_pumps) {
      const dp = database.data.diesel_pumps.find(p => p.is_default);
      if (dp) { pumpName = dp.name; pumpId = dp.id; }
    }

    let imported = 0, cashCount = 0, dieselCount = 0;
    for (const ed of entries) {
      const doc = calculateAutoFields({ ...ed, id: uuidv4(), created_by: username, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), rst_no: '', tp_no: '', plastic_bag: 0 });
      database.data.mill_entries.push(doc);

      if (doc.cash_paid > 0) {
        database.data.cash_transactions.push({
          id: uuidv4(), date: doc.date, account: 'cash', txn_type: 'nikasi', category: 'Cash Paid (Entry)',
          description: `Cash Paid: Truck ${doc.truck_no} - Agent ${doc.agent_name} - Rs.${doc.cash_paid}`,
          amount: +(doc.cash_paid).toFixed(2), reference: `entry_cash:${doc.id.slice(0,8)}`,
          kms_year: kmsYear, season, created_by: username, linked_entry_id: doc.id,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
        cashCount++;
      }
      if (doc.diesel_paid > 0) {
        database.data.diesel_accounts.push({
          id: uuidv4(), date: doc.date, pump_id: pumpId, pump_name: pumpName,
          truck_no: doc.truck_no, agent_name: doc.agent_name,
          amount: +(doc.diesel_paid).toFixed(2), txn_type: 'debit',
          description: `Diesel: Truck ${doc.truck_no} - Agent ${doc.agent_name}`,
          kms_year: kmsYear, season, created_by: username, linked_entry_id: doc.id,
          created_at: new Date().toISOString()
        });
        dieselCount++;
      }
      imported++;
    }
    database.save();
    res.json({ success: true, imported, skipped, cash_book_entries: cashCount, diesel_entries: dieselCount,
      message: `${imported} entries import ho gaye! Cash Book: ${cashCount}, Diesel: ${dieselCount}` });
  } catch (e) {
    res.status(500).json({ detail: e.message || 'Import failed' });
  }
});

  return router;
};
