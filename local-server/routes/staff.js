const express = require('express');
const { safeAsync, safeSync } = require('./safe_handler');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { fmtDate, registerFonts, F , safePdfPipe} = require('./pdf_helpers');

module.exports = function(database) {

function col(name) {
  if (!database.data[name]) database.data[name] = [];
  return database.data[name];
}

// ============ STAFF CRUD ============
router.post('/api/staff', safeSync(async (req, res) => {
  const d = req.body;
  const name = (d.name || '').trim();
  if (!name) return res.status(400).json({ detail: 'Staff name required' });
  const staff = {
    id: uuidv4(), name, salary_type: d.salary_type || 'monthly',
    salary_amount: parseFloat(d.salary_amount) || 0, active: true,
    created_at: new Date().toISOString()
  };
  col('staff').push(staff); database.save(); res.json(staff);
}));

router.get('/api/staff', safeSync(async (req, res) => {
  let list = col('staff');
  if (req.query.active === 'true') list = list.filter(s => s.active !== false);
  res.json(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
}));

router.put('/api/staff/:id', safeSync(async (req, res) => {
  const list = col('staff');
  const idx = list.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: 'Not found' });
  list[idx] = { ...list[idx], ...req.body, updated_at: new Date().toISOString() };
  database.save(); res.json(list[idx]);
}));

router.delete('/api/staff/:id', safeSync(async (req, res) => {
  const list = col('staff');
  const len = list.length;
  database.data.staff = list.filter(s => s.id !== req.params.id);
  if (database.data.staff.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
}));

// ============ ATTENDANCE ============
router.post('/api/staff/attendance', safeSync(async (req, res) => {
  const d = req.body;
  const att = col('staff_attendance');
  // Remove existing for same staff+date
  database.data.staff_attendance = att.filter(a => !(a.staff_id === d.staff_id && a.date === d.date));
  const entry = {
    id: uuidv4(), staff_id: d.staff_id, staff_name: d.staff_name || '', date: d.date,
    status: d.status || 'present', kms_year: d.kms_year || '', season: d.season || ''
  };
  database.data.staff_attendance.push(entry); database.save(); res.json(entry);
}));

router.post('/api/staff/attendance/bulk', safeSync(async (req, res) => {
  const date = req.body.date || '';
  const records = req.body.records || req.body.items || [];
  const kms_year = req.body.kms_year || '';
  const season = req.body.season || '';
  const results = [];
  for (const d of records) {
    const att = col('staff_attendance');
    const staffId = d.staff_id;
    const staffName = d.staff_name || '';
    const status = d.status || 'present';
    database.data.staff_attendance = att.filter(a => !(a.staff_id === staffId && a.date === date));
    const entry = {
      id: uuidv4(), staff_id: staffId, staff_name: staffName, date: date,
      status: status, kms_year: kms_year, season: season
    };
    database.data.staff_attendance.push(entry);
    results.push(entry);
  }
  database.save(); res.json({ message: `${results.length} attendance records saved` });
}));

router.get('/api/staff/attendance', safeSync(async (req, res) => {
  let list = col('staff_attendance');
  if (req.query.date) list = list.filter(a => a.date === req.query.date);
  if (req.query.staff_id) list = list.filter(a => a.staff_id === req.query.staff_id);
  if (req.query.kms_year) list = list.filter(a => a.kms_year === req.query.kms_year);
  if (req.query.date_from) list = list.filter(a => a.date >= req.query.date_from);
  if (req.query.date_to) list = list.filter(a => a.date <= req.query.date_to);
  res.json(list);
}));

// ============ STAFF ADVANCES ============
router.post('/api/staff/advance', safeSync(async (req, res) => {
  const d = req.body;
  const adv = {
    id: uuidv4(), staff_id: d.staff_id, staff_name: d.staff_name || '',
    amount: parseFloat(d.amount) || 0, date: d.date || '',
    description: d.description || '', kms_year: d.kms_year || '', season: d.season || '',
    created_at: new Date().toISOString()
  };
  col('staff_advances').push(adv);
  const staffName = adv.staff_name || 'Staff';
  const now = new Date().toISOString();
  // Cash Book Nikasi entry (cash going out)
  col('cash_transactions').push({
    id: uuidv4(), date: adv.date, account: 'cash', txn_type: 'nikasi',
    category: staffName, party_type: 'Staff',
    description: `Staff Advance: ${staffName} - ${adv.description}`,
    amount: adv.amount, reference: `staff_advance:${adv.id}`,
    kms_year: adv.kms_year, season: adv.season,
    created_by: d.created_by || '', linked_payment_id: adv.id,
    created_at: now, updated_at: now
  });
  // Ledger Jama entry (staff owes us the advance)
  col('cash_transactions').push({
    id: uuidv4(), date: adv.date, account: 'ledger', txn_type: 'jama',
    category: staffName, party_type: 'Staff',
    description: `Staff Advance: ${staffName} - ${adv.description}`,
    amount: adv.amount, reference: `staff_advance_ledger:${adv.id}`,
    kms_year: adv.kms_year, season: adv.season,
    created_by: d.created_by || '', linked_payment_id: adv.id,
    created_at: now, updated_at: now
  });
  database.save(); res.json(adv);
}));

router.get('/api/staff/advance', safeSync(async (req, res) => {
  let list = col('staff_advances');
  if (req.query.staff_id) list = list.filter(a => a.staff_id === req.query.staff_id);
  if (req.query.kms_year) list = list.filter(a => a.kms_year === req.query.kms_year);
  res.json(list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at||'').localeCompare(a.created_at||'')));
}));

router.delete('/api/staff/advance/:id', safeSync(async (req, res) => {
  const list = col('staff_advances');
  const adv = list.find(a => a.id === req.params.id);
  if (!adv) return res.status(404).json({ detail: 'Not found' });
  database.data.staff_advances = list.filter(a => a.id !== req.params.id);
  // Remove linked cash transaction + ledger entry
  database.data.cash_transactions = col('cash_transactions').filter(t =>
    t.linked_payment_id !== req.params.id &&
    t.reference !== `staff_advance:${req.params.id}` &&
    t.reference !== `staff_advance_ledger:${req.params.id}`
  );
  database.save(); res.json({ message: 'Deleted', id: req.params.id });
}));

// ============ STAFF ADVANCE BALANCE ============
router.get('/api/staff/advance-balance/:staffId', safeSync(async (req, res) => {
  const { kms_year, season } = req.query;
  let advances = col('staff_advances').filter(a => a.staff_id === req.params.staffId);
  if (kms_year) advances = advances.filter(a => a.kms_year === kms_year);
  if (season) advances = advances.filter(a => a.season === season);
  const totalAdvance = +(advances.reduce((s, a) => s + (a.amount || 0), 0).toFixed(2));

  let payments = col('staff_payments').filter(p => p.staff_id === req.params.staffId);
  if (kms_year) payments = payments.filter(p => p.kms_year === kms_year);
  if (season) payments = payments.filter(p => p.season === season);
  const totalDeducted = +(payments.reduce((s, p) => s + (p.advance_deducted || 0), 0).toFixed(2));

  // Opening balance from previous FY
  let openingBalance = 0;
  if (kms_year) {
    const fyParts = kms_year.split('-');
    if (fyParts.length === 2) {
      const prevFy = `${parseInt(fyParts[0])-1}-${parseInt(fyParts[1])-1}`;
      let prevAdv = col('staff_advances').filter(a => a.staff_id === req.params.staffId && a.kms_year === prevFy);
      if (season) prevAdv = prevAdv.filter(a => a.season === season);
      const prevTotalAdv = prevAdv.reduce((s, a) => s + (a.amount || 0), 0);
      let prevPay = col('staff_payments').filter(p => p.staff_id === req.params.staffId && p.kms_year === prevFy);
      if (season) prevPay = prevPay.filter(p => p.season === season);
      const prevTotalDed = prevPay.reduce((s, p) => s + (p.advance_deducted || 0), 0);
      openingBalance = Math.round((prevTotalAdv - prevTotalDed) * 100) / 100;
    }
  }

  res.json({ opening_balance: openingBalance, total_advance: totalAdvance, total_deducted: totalDeducted, balance: +(openingBalance + totalAdvance - totalDeducted).toFixed(2) });
}));


// ============ STAFF SALARY CALCULATION ============
router.get('/api/staff/salary-calculate', safeSync(async (req, res) => {
  const { staff_id, period_from, period_to, kms_year, season } = req.query;
  const from_date = period_from || req.query.from_date;
  const to_date = period_to || req.query.to_date;
  const staff = col('staff').find(s => s.id === staff_id);
  if (!staff) return res.status(404).json({ detail: 'Staff not found' });

  let att = col('staff_attendance').filter(a => a.staff_id === staff_id);
  if (from_date) att = att.filter(a => a.date >= from_date);
  if (to_date) att = att.filter(a => a.date <= to_date);

  let presentDays = 0, halfDays = 0, holidays = 0, absentDays = 0;
  for (const a of att) {
    if (a.status === 'present') presentDays++;
    else if (a.status === 'half_day') halfDays++;
    else if (a.status === 'holiday') holidays++;
    else if (a.status === 'absent') absentDays++;
  }
  const daysWorked = presentDays + holidays + halfDays * 0.5;

  // Calculate total days in period
  let totalDays = att.length;
  if (from_date && to_date) {
    const d1 = new Date(from_date);
    const d2 = new Date(to_date);
    totalDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  }

  let perDay = staff.salary_amount;
  if (staff.salary_type === 'monthly') perDay = staff.salary_amount / 30;
  const grossSalary = Math.round(daysWorked * perDay);

  let advances = col('staff_advances').filter(a => a.staff_id === staff_id);
  if (kms_year) advances = advances.filter(a => a.kms_year === kms_year);
  if (season) advances = advances.filter(a => a.season === season);
  const totalAdvances = advances.reduce((s, a) => s + (a.amount || 0), 0);

  let payments = col('staff_payments').filter(p => p.staff_id === staff_id);
  if (kms_year) payments = payments.filter(p => p.kms_year === kms_year);
  if (season) payments = payments.filter(p => p.season === season);
  const totalDeducted = payments.reduce((s, p) => s + (p.advance_deducted || 0), 0);

  // Opening advance balance from previous FY
  let advOpening = 0;
  if (kms_year) {
    const fyParts = kms_year.split('-');
    if (fyParts.length === 2) {
      const prevFy = `${parseInt(fyParts[0])-1}-${parseInt(fyParts[1])-1}`;
      let prevAdv = col('staff_advances').filter(a => a.staff_id === staff_id && a.kms_year === prevFy);
      if (season) prevAdv = prevAdv.filter(a => a.season === season);
      const prevTotalAdv = prevAdv.reduce((s, a) => s + (a.amount || 0), 0);
      let prevPay = col('staff_payments').filter(p => p.staff_id === staff_id && p.kms_year === prevFy);
      if (season) prevPay = prevPay.filter(p => p.season === season);
      const prevTotalDed = prevPay.reduce((s, p) => s + (p.advance_deducted || 0), 0);
      advOpening = Math.round((prevTotalAdv - prevTotalDed) * 100) / 100;
    }
  }
  const advanceBalance = Math.round((advOpening + totalAdvances - totalDeducted) * 100) / 100;

  res.json({
    staff: staff,
    period_from: from_date || '', period_to: to_date || '',
    total_days: totalDays,
    present_days: presentDays, half_days: halfDays,
    holidays: holidays, absents: absentDays,
    days_worked: daysWorked,
    per_day_rate: Math.round(perDay * 100) / 100,
    gross_salary: grossSalary,
    advance_balance: advanceBalance,
    attendance_details: att.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  });
}));

// ============ STAFF PAYMENTS ============
router.post('/api/staff/payments', safeSync(async (req, res) => {
  const d = req.body;
  const payment = {
    id: uuidv4(), staff_id: d.staff_id, staff_name: d.staff_name || '',
    salary_type: d.salary_type || '', from_date: d.from_date || '', to_date: d.to_date || '',
    total_days: d.total_days || 0, days_worked: d.days_worked || 0,
    gross_salary: parseFloat(d.gross_salary) || 0, advance_deducted: parseFloat(d.advance_deducted) || 0,
    net_payment: parseFloat(d.net_payment) || 0, kms_year: d.kms_year || '', season: d.season || '',
    date: d.date || new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString()
  };
  col('staff_payments').push(payment);
  // Cash Book Nikasi entry
  if (payment.net_payment > 0) {
    col('cash_transactions').push({
      id: uuidv4(), date: payment.date, account: 'cash', txn_type: 'nikasi',
      category: 'Staff Salary',
      description: `Salary: ${payment.staff_name} (${payment.from_date} to ${payment.to_date})`,
      amount: payment.net_payment, reference: `staff_payment:${payment.id}`,
      kms_year: payment.kms_year, season: payment.season,
      created_by: d.created_by || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
  }
  database.save(); res.json(payment);
}));

router.get('/api/staff/payments', safeSync(async (req, res) => {
  let list = col('staff_payments');
  if (req.query.staff_id) list = list.filter(p => p.staff_id === req.query.staff_id);
  if (req.query.kms_year) list = list.filter(p => p.kms_year === req.query.kms_year);
  res.json(list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
}));

router.delete('/api/staff/payments/:id', safeSync(async (req, res) => {
  const list = col('staff_payments');
  const payment = list.find(p => p.id === req.params.id);
  if (!payment) return res.status(404).json({ detail: 'Not found' });
  database.data.staff_payments = list.filter(p => p.id !== req.params.id);
  database.data.cash_transactions = col('cash_transactions').filter(t => t.reference !== `staff_payment:${req.params.id}`);
  database.save(); res.json({ message: 'Deleted', id: req.params.id });
}));

// ============ ATTENDANCE EXPORT (PDF) ============
router.get('/api/staff/export/attendance', safeSync(async (req, res) => {
  const { date_from, date_to, fmt } = req.query;
  if (!date_from || !date_to) return res.status(400).json({ detail: 'date_from and date_to required' });

  const staffList = col('staff').filter(s => s.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const attList = col('staff_attendance').filter(a => a.date >= date_from && a.date <= date_to);
  const attMap = {};
  for (const a of attList) {
    if (!attMap[a.staff_id]) attMap[a.staff_id] = {};
    attMap[a.staff_id][a.date] = a.status;
  }

  // Generate dates array
  const dates = [];
  let d = new Date(date_from);
  const end = new Date(date_to);
  while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }

  const statusShort = { present: 'P', absent: 'A', half_day: 'H', holiday: 'CH' };

  if (fmt === 'pdf') {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 10 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=staff_attendance_${date_from}_to_${date_to}.pdf`);
    // PDF will be sent via safePdfPipe

    // Calculate table dimensions for centering
    const colW = Math.min(70, Math.max(45, (800 - 45) / Math.max(staffList.length, 1)));
    const tableW = 45 + (staffList.length * colW);
    const pageW = doc.page.width;
    const tableStartX = Math.max(10, (pageW - tableW) / 2);

    doc.fontSize(9).font(F('bold')).fillColor('#1a365d')
       .text(`Staff Attendance: ${date_from} to ${date_to}`, { align: 'center' });

    // Table
    const headers = ['Date', ...staffList.map(s => s.name)];
    let y = 25;
    const rowH = Math.min(14, Math.max(10, 540 / (dates.length + 6)));

    // Header
    doc.fontSize(5.5).font(F('bold')).fillColor('white');
    doc.rect(tableStartX, y, 45, rowH).fill('#1a365d');
    doc.fillColor('white').text('Date', tableStartX + 2, y + 2, { width: 41 });
    let x = tableStartX + 45;
    for (const s of staffList) {
      doc.rect(x, y, colW, rowH).fill('#1a365d');
      doc.fillColor('white').text(s.name, x + 2, y + 2, { width: colW - 4 });
      x += colW;
    }
    y += rowH;

    // Data rows
    const staffTotals = {};
    staffList.forEach(s => { staffTotals[s.id] = { P: 0, A: 0, H: 0, CH: 0 }; });
    const bgMap = { P: '#bbf7d0', A: '#fecaca', H: '#fde68a', CH: '#bfdbfe' };
    const txMap = { P: '#14532d', A: '#7f1d1d', H: '#78350f', CH: '#1e3a8a' };

    for (const dt of dates) {
      x = tableStartX;
      doc.font(F('bold')).fillColor('black').fontSize(5.5);
      doc.text(fmtDate(dt), x + 2, y + 2, { width: 41 });
      x = tableStartX + 45;
      for (const s of staffList) {
        const st = (attMap[s.id] || {})[dt] || '-';
        const val = statusShort[st] || '-';
        if (bgMap[val]) {
          doc.rect(x, y, colW, rowH).fill(bgMap[val]);
          doc.fillColor(txMap[val]).font(F('bold'));
        } else {
          doc.fillColor('black').font(F('normal'));
        }
        doc.fontSize(5.5).text(val, x + 2, y + 2, { width: colW - 4 });
        if (staffTotals[s.id] && staffTotals[s.id][val] !== undefined) staffTotals[s.id][val]++;
        x += colW;
      }
      y += rowH;
      if (y > 570) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 }); y = 10; }
    }

    // Summary rows
    for (const label of ['P', 'H', 'CH', 'A', 'Total']) {
      x = tableStartX;
      doc.rect(x, y, 45, rowH).fill('#e0e7ff');
      doc.fillColor('black').font(F('bold')).fontSize(5.5).text(label, x + 2, y + 2, { width: 41 });
      x = tableStartX + 45;
      for (const s of staffList) {
        doc.rect(x, y, colW, rowH).fill('#e0e7ff');
        let val;
        if (label === 'Total') {
          const t = staffTotals[s.id];
          val = String(t.P + t.CH + t.H * 0.5);
        } else {
          val = String(staffTotals[s.id][label] || 0);
        }
        doc.fillColor('black').font(F('bold')).fontSize(5.5).text(val, x + 2, y + 2, { width: colW - 4 });
        x += colW;
      }
      y += rowH;
    }

    // ---- PAGE 2: MONTHLY SUMMARY ----
    const monthNames = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' };
    const monthlyData = {};
    for (const dt of dates) {
      const mk = dt.slice(0, 7);
      if (!monthlyData[mk]) {
        monthlyData[mk] = {};
        staffList.forEach(s => { monthlyData[mk][s.id] = { P: 0, A: 0, H: 0, CH: 0 }; });
      }
      for (const s of staffList) {
        const st = (attMap[s.id] || {})[dt] || '-';
        const val = statusShort[st] || '-';
        if (monthlyData[mk] && monthlyData[mk][s.id] && monthlyData[mk][s.id][val] !== undefined) monthlyData[mk][s.id][val]++;
      }
    }
    const sortedMonths = Object.keys(monthlyData).sort();

    doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 });
    doc.fontSize(12).font(F('bold')).fillColor('#1a365d')
       .text('Monthly Summary / Masik Saransh', { align: 'center' });

    const msHeaders = ['Staff', 'Sal.Type', 'Rate', ...sortedMonths.map(m => `${monthNames[m.slice(5,7)] || m.slice(5,7)} ${m.slice(0,4)}`), 'Total Days', 'Est. Salary'];
    const msCols = msHeaders.length;
    const msColW = Math.max(50, Math.min(80, 800 / Math.max(msCols, 1)));
    const msColWidths = [70, 45, 45, ...Array(sortedMonths.length).fill(msColW), 50, 65];
    const totalMsW = msColWidths.reduce((a, b) => a + b, 0);
    const msScale = totalMsW > 800 ? 800 / totalMsW : 1;
    const scaledMsW = msColWidths.map(w => w * msScale);
    const actualMsW = scaledMsW.reduce((a, b) => a + b, 0);
    const msStartX = Math.max(10, (doc.page.width - actualMsW) / 2);

    let msY = 28;
    const msRowH = 12;

    // Header row
    let msX = msStartX;
    for (let i = 0; i < msHeaders.length; i++) {
      doc.rect(msX, msY, scaledMsW[i], msRowH).fill('#065f46');
      doc.fillColor('white').font(F('bold')).fontSize(5.5)
         .text(msHeaders[i], msX + 2, msY + 2, { width: scaledMsW[i] - 4 });
      msX += scaledMsW[i];
    }
    msY += msRowH;

    // Data rows - staff summary
    for (const s of staffList) {
      msX = msStartX;
      const salType = s.salary_type === 'monthly' ? 'Monthly' : 'Daily';
      const salAmt = s.salary_amount || 0;
      const perDay = s.salary_type === 'monthly' ? salAmt / 30 : salAmt;
      const vals = [s.name, salType, String(salAmt)];
      let grand = 0;
      for (const mk of sortedMonths) {
        const md = monthlyData[mk][s.id];
        const worked = md.P + md.CH + md.H * 0.5;
        grand += worked;
        vals.push(worked.toFixed(1));
      }
      const estSalary = Math.round(grand * perDay);
      vals.push(grand.toFixed(1));
      vals.push(`Rs.${estSalary.toLocaleString('en-IN')}`);

      for (let i = 0; i < vals.length; i++) {
        const isLastTwo = i >= vals.length - 2;
        const bgColor = i === vals.length - 2 ? '#d1fae5' : i === vals.length - 1 ? '#fef3c7' : (staffList.indexOf(s) % 2 === 0 ? '#f0fdf4' : '#ffffff');
        doc.rect(msX, msY, scaledMsW[i], msRowH).fill(bgColor);
        const txtColor = i === vals.length - 1 ? '#92400e' : '#000000';
        doc.fillColor(txtColor).font(isLastTwo || i === 0 ? F('bold') : F('normal')).fontSize(5.5)
           .text(vals[i], msX + 2, msY + 2, { width: scaledMsW[i] - 4 });
        msX += scaledMsW[i];
      }
      msY += msRowH;
      if (msY > 560) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 }); msY = 10; }
    }

    // Breakdown (P/A/H/CH)
    msY += 4;
    msX = msStartX;
    const breakdownW = scaledMsW.reduce((a, b) => a + b, 0);
    doc.rect(msX, msY, breakdownW, msRowH).fill('#fef3c7');
    doc.fillColor('#78350f').font(F('bold')).fontSize(6.5)
       .text('Breakdown (P / A / H / CH)', msX + 2, msY + 2, { width: breakdownW - 4 });
    msY += msRowH;

    for (const s of staffList) {
      msX = msStartX;
      const perDay = s.salary_type === 'monthly' ? (s.salary_amount || 0) / 30 : (s.salary_amount || 0);
      const vals = [s.name, '', ''];
      let grandSal = 0;
      for (const mk of sortedMonths) {
        const md = monthlyData[mk][s.id];
        vals.push(`${md.P}/${md.A}/${md.H}/${md.CH}`);
        grandSal += (md.P + md.CH + md.H * 0.5) * perDay;
      }
      vals.push('');
      vals.push(`Rs.${Math.round(grandSal).toLocaleString('en-IN')}`);
      for (let i = 0; i < vals.length; i++) {
        doc.rect(msX, msY, scaledMsW[i], msRowH).fill('#ffffff');
        doc.fillColor('#000000').font(i === 0 ? F('bold') : F('normal')).fontSize(5.5)
           .text(vals[i], msX + 2, msY + 2, { width: scaledMsW[i] - 4 });
        msX += scaledMsW[i];
      }
      msY += msRowH;
      if (msY > 560) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 }); msY = 10; }
    }

    // Month-wise Estimated Salary
    msY += 4;
    msX = msStartX;
    doc.rect(msX, msY, breakdownW, msRowH).fill('#dbeafe');
    doc.fillColor('#1e3a8a').font(F('bold')).fontSize(6.5)
       .text('Month-wise Estimated Salary / Mahine Ka Anumanit Vetan', msX + 2, msY + 2, { width: breakdownW - 4 });
    msY += msRowH;

    for (const s of staffList) {
      msX = msStartX;
      const perDay = s.salary_type === 'monthly' ? (s.salary_amount || 0) / 30 : (s.salary_amount || 0);
      const vals = [s.name, '', ''];
      let grandSal = 0;
      for (const mk of sortedMonths) {
        const md = monthlyData[mk][s.id];
        const worked = md.P + md.CH + md.H * 0.5;
        const mSal = Math.round(worked * perDay);
        grandSal += mSal;
        vals.push(`Rs.${mSal.toLocaleString('en-IN')}`);
      }
      vals.push('');
      vals.push(`Rs.${Math.round(grandSal).toLocaleString('en-IN')}`);
      for (let i = 0; i < vals.length; i++) {
        const bgColor = i === vals.length - 1 ? '#fef3c7' : '#ffffff';
        doc.rect(msX, msY, scaledMsW[i], msRowH).fill(bgColor);
        const txtColor = i === vals.length - 1 ? '#92400e' : '#000000';
        doc.fillColor(txtColor).font(i === 0 || i === vals.length - 1 ? F('bold') : F('normal')).fontSize(5.5)
           .text(vals[i], msX + 2, msY + 2, { width: scaledMsW[i] - 4 });
        msX += scaledMsW[i];
      }
      msY += msRowH;
      if (msY > 560) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 }); msY = 10; }
    }

    await safePdfPipe(doc, res);
  } else {
    // Excel export
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');
    const hdrFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } };
    const hdrFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };

    ws.mergeCells(1, 1, 1, 1 + staffList.length);
    ws.getCell('A1').value = `Staff Attendance: ${date_from} to ${date_to}`;
    ws.getCell('A1').font = { bold: true, size: 12 };

    // Headers
    const hdrRow = ws.getRow(3);
    hdrRow.getCell(1).value = 'Date';
    hdrRow.getCell(1).fill = hdrFill; hdrRow.getCell(1).font = hdrFont;
    staffList.forEach((s, i) => {
      const c = hdrRow.getCell(i + 2);
      c.value = s.name; c.fill = hdrFill; c.font = hdrFont; c.alignment = { horizontal: 'center' };
    });

    const bgFill = { P: 'FFbbf7d0', A: 'FFfecaca', H: 'FFfde68a', CH: 'FFbfdbfe' };
    const txFill = { P: 'FF14532d', A: 'FF7f1d1d', H: 'FF78350f', CH: 'FF1e3a8a' };
    const staffTotals = {};
    staffList.forEach(s => { staffTotals[s.id] = { P: 0, A: 0, H: 0, CH: 0 }; });

    let rowNum = 4;
    for (const dt of dates) {
      const r = ws.getRow(rowNum);
      r.getCell(1).value = dt.slice(5); r.getCell(1).font = { bold: true, size: 9 };
      staffList.forEach((s, i) => {
        const st = (attMap[s.id] || {})[dt] || '-';
        const val = statusShort[st] || '-';
        const c = r.getCell(i + 2);
        c.value = val; c.alignment = { horizontal: 'center' };
        if (bgFill[val]) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill[val] } };
          c.font = { bold: true, color: { argb: txFill[val] }, size: 9 };
        }
        if (staffTotals[s.id] && staffTotals[s.id][val] !== undefined) staffTotals[s.id][val]++;
      });
      rowNum++;
    }

    // Summary rows
    const summFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe0e7ff' } };
    for (const label of ['P', 'H', 'CH', 'A', 'Total']) {
      const r = ws.getRow(rowNum);
      r.getCell(1).value = label; r.getCell(1).font = { bold: true }; r.getCell(1).fill = summFill;
      staffList.forEach((s, i) => {
        const c = r.getCell(i + 2);
        if (label === 'Total') {
          const t = staffTotals[s.id];
          c.value = t.P + t.CH + t.H * 0.5;
        } else {
          c.value = staffTotals[s.id][label] || 0;
        }
        c.fill = summFill; c.font = { bold: true }; c.alignment = { horizontal: 'center' };
      });
      rowNum++;
    }

    // Monthly Summary sheet
    const monthNames = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' };
    const monthlyData = {};
    for (const dt of dates) {
      const mk = dt.slice(0, 7);
      if (!monthlyData[mk]) {
        monthlyData[mk] = {};
        staffList.forEach(s => { monthlyData[mk][s.id] = { P: 0, A: 0, H: 0, CH: 0 }; });
      }
      for (const s of staffList) {
        const st = (attMap[s.id] || {})[dt] || '-';
        const val = statusShort[st] || '-';
        if (monthlyData[mk][s.id][val] !== undefined) monthlyData[mk][s.id][val]++;
      }
    }
    const sortedMonths = Object.keys(monthlyData).sort();

    const ws2 = wb.addWorksheet('Monthly Summary');
    ws2.mergeCells(1, 1, 1, 4 + sortedMonths.length);
    ws2.getCell('A1').value = `Monthly Summary (${date_from} to ${date_to})`;
    ws2.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF065f46' } };

    const msHdrs = ['Staff', 'Sal.Type', 'Rate', ...sortedMonths.map(m => `${monthNames[m.slice(5,7)] || m.slice(5,7)} ${m.slice(0,4)}`), 'Total Days', 'Est. Salary'];
    const msHdrRow = ws2.getRow(3);
    msHdrs.forEach((h, i) => {
      const c = msHdrRow.getCell(i + 1);
      c.value = h; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065f46' } };
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }; c.alignment = { horizontal: 'center' };
    });

    let msRow = 4;
    for (const s of staffList) {
      const r = ws2.getRow(msRow);
      r.getCell(1).value = s.name; r.getCell(1).font = { bold: true, size: 9 };
      r.getCell(2).value = s.salary_type === 'monthly' ? 'Monthly' : 'Daily'; r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(3).value = s.salary_amount; r.getCell(3).alignment = { horizontal: 'center' };
      let grand = 0;
      sortedMonths.forEach((mk, mi) => {
        const md = monthlyData[mk][s.id];
        const worked = md.P + md.CH + md.H * 0.5;
        grand += worked;
        r.getCell(4 + mi).value = worked; r.getCell(4 + mi).alignment = { horizontal: 'center' };
      });
      const perDay = s.salary_type === 'monthly' ? s.salary_amount / 30 : s.salary_amount;
      const estSalary = Math.round(grand * perDay);
      r.getCell(4 + sortedMonths.length).value = grand;
      r.getCell(4 + sortedMonths.length).font = { bold: true };
      r.getCell(4 + sortedMonths.length).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFd1fae5' } };
      r.getCell(5 + sortedMonths.length).value = estSalary;
      r.getCell(5 + sortedMonths.length).font = { bold: true, color: { argb: 'FF92400e' } };
      r.getCell(5 + sortedMonths.length).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } };
      r.getCell(5 + sortedMonths.length).numFmt = '#,##0';
      msRow++;
    }

    ws.getColumn(1).width = 8;
    for (let i = 2; i <= staffList.length + 1; i++) ws.getColumn(i).width = 10;
    ws2.getColumn(1).width = 14;
    ws2.getColumn(2).width = 8; ws2.getColumn(3).width = 8;
    for (let i = 4; i <= msHdrs.length; i++) ws2.getColumn(i).width = 12;

    // ---- Breakdown (P/A/H/CH) section in Monthly Summary ----
    msRow += 1; // blank row
    const breakdownHdrRow = ws2.getRow(msRow);
    ws2.mergeCells(msRow, 1, msRow, msHdrs.length);
    breakdownHdrRow.getCell(1).value = 'Breakdown (P / A / H / CH)';
    breakdownHdrRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } };
    breakdownHdrRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF78350f' } };
    msRow++;

    for (const s of staffList) {
      const r = ws2.getRow(msRow);
      r.getCell(1).value = s.name; r.getCell(1).font = { bold: true, size: 9 };
      sortedMonths.forEach((mk, mi) => {
        const md = monthlyData[mk][s.id];
        const c = r.getCell(4 + mi);
        c.value = `${md.P} / ${md.A} / ${md.H} / ${md.CH}`;
        c.alignment = { horizontal: 'center' }; c.font = { size: 8 };
      });
      msRow++;
    }

    // ---- Month-wise Estimated Salary section ----
    msRow += 1; // blank row
    const salaryHdrRow = ws2.getRow(msRow);
    ws2.mergeCells(msRow, 1, msRow, msHdrs.length);
    salaryHdrRow.getCell(1).value = 'Month-wise Estimated Salary / Mahine Ka Anumanit Vetan';
    salaryHdrRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdbeafe' } };
    salaryHdrRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF1e3a8a' } };
    msRow++;

    for (const s of staffList) {
      const r = ws2.getRow(msRow);
      r.getCell(1).value = s.name; r.getCell(1).font = { bold: true, size: 9 };
      const perDay = s.salary_type === 'monthly' ? s.salary_amount / 30 : s.salary_amount;
      let grandSal = 0;
      sortedMonths.forEach((mk, mi) => {
        const md = monthlyData[mk][s.id];
        const worked = md.P + md.CH + md.H * 0.5;
        const mSal = Math.round(worked * perDay);
        grandSal += mSal;
        const c = r.getCell(4 + mi);
        c.value = mSal; c.alignment = { horizontal: 'center' }; c.font = { size: 9 }; c.numFmt = '#,##0';
      });
      // Grand total salary in last column
      const esCell = r.getCell(5 + sortedMonths.length);
      esCell.value = Math.round(grandSal);
      esCell.font = { bold: true, color: { argb: 'FF92400e' } };
      esCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } };
      esCell.alignment = { horizontal: 'center' }; esCell.numFmt = '#,##0';
      msRow++;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=staff_attendance_${date_from}_to_${date_to}.xlsx`);
    wb.xlsx.write(res).then(() => res.end());
  }
}));

// ============ STAFF PAYMENTS EXPORT (PDF & Excel) ============
router.get('/api/staff/export/payments', safeAsync(async (req, res) => {
  const { fmt, kms_year, season } = req.query;
  let list = col('staff_payments');
  if (kms_year) list = list.filter(p => p.kms_year === kms_year);
  if (season) list = list.filter(p => p.season === season);

  if (fmt === 'pdf') {
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHdr, addPdfTable, fmtAmt, fmtDate, C, registerFonts, F , safePdfPipe} = require('./pdf_helpers');
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      registerFonts(doc);
    res.setHeader('Content-Disposition', `attachment; filename=staff_payments.pdf`);
    // PDF will be sent via safePdfPipe

    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHdr(doc, 'Staff Payment Report', branding, kms_year ? `${kms_year} | ${season || ''}` : '');

    const headers = ['Staff', 'Period', 'Days Worked', 'Gross Salary', 'Adv. Deducted', 'Net Payment', 'Date'];
    const rows = list.map(p => [
      p.staff_name || '', `${fmtDate(p.period_from || p.from_date)} to ${fmtDate(p.period_to || p.to_date)}`,
      String(p.days_worked || 0), `Rs.${fmtAmt(p.gross_salary || 0)}`,
      `Rs.${fmtAmt(p.advance_deducted || 0)}`, `Rs.${fmtAmt(p.net_payment || 0)}`,
      fmtDate(p.date || (p.created_at || '').split('T')[0])
    ]);
    addPdfTable(doc, headers, rows, [90, 100, 60, 80, 80, 80, 65]);

    // Totals
    const totalGross = list.reduce((s, p) => s + (p.gross_salary || 0), 0);
    const totalAdv = list.reduce((s, p) => s + (p.advance_deducted || 0), 0);
    const totalNet = list.reduce((s, p) => s + (p.net_payment || 0), 0);
    doc.moveDown(0.3);
    doc.fontSize(9).font(F('bold')).fillColor(C.hdrBg)
      .text(`Total Gross: Rs.${fmtAmt(totalGross)}  |  Adv. Deducted: Rs.${fmtAmt(totalAdv)}  |  Net Paid: Rs.${fmtAmt(totalNet)}`, { align: 'center' });
    await safePdfPipe(doc, res);
  } else {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Staff Payments');
    const hdrStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }, alignment: { horizontal: 'center' } };

    ws.mergeCells('A1:G1'); ws.getCell('A1').value = 'Staff Payment Report'; ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };

    ['Staff', 'Period', 'Days Worked', 'Gross Salary', 'Adv. Deducted', 'Net Payment', 'Date'].forEach((h, i) => { const c = ws.getCell(3, i+1); c.value = h; Object.assign(c, hdrStyle); });
    list.forEach((p, i) => {
      [p.staff_name || '', `${p.period_from || p.from_date || ''} to ${p.period_to || p.to_date || ''}`,
       p.days_worked || 0, p.gross_salary || 0, p.advance_deducted || 0, p.net_payment || 0,
       p.date || (p.created_at || '').split('T')[0] || ''
      ].forEach((v, j) => { ws.getCell(i+4, j+1).value = v; });
    });

    // Totals
    const r = list.length + 4;
    ws.getCell(r, 1).value = 'TOTAL'; ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 4).value = list.reduce((s, p) => s + (p.gross_salary || 0), 0); ws.getCell(r, 4).font = { bold: true };
    ws.getCell(r, 5).value = list.reduce((s, p) => s + (p.advance_deducted || 0), 0); ws.getCell(r, 5).font = { bold: true };
    ws.getCell(r, 6).value = list.reduce((s, p) => s + (p.net_payment || 0), 0); ws.getCell(r, 6).font = { bold: true };

    for (let i = 1; i <= 7; i++) ws.getColumn(i).width = 18;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=staff_payments.xlsx`);
    await wb.xlsx.write(res); res.end();
  }
}));

// ============ ADVANCE LEDGER EXCEL EXPORT ============
router.post('/api/staff/advance-ledger/export', safeAsync(async (req, res) => {
  const { ledger, staff_name, kms_year, season } = req.body;
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Advance Ledger');
  const hdrStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a365d' } }, alignment: { horizontal: 'center' } };

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = `Advance Ledger - ${staff_name || 'All Staff'}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ['#', 'Date', 'Staff', 'Description', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs.)'].forEach((h, i) => {
    const c = ws.getCell(3, i + 1); c.value = h; Object.assign(c, hdrStyle);
  });

  (ledger || []).forEach((l, i) => {
    const d = l.date || '';
    const parts = d.split('-');
    const fDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : d;
    [i + 1, fDate, l.staff_name, l.description, l.debit > 0 ? l.debit : '', l.credit > 0 ? l.credit : '', l.balance].forEach((v, j) => {
      ws.getCell(i + 4, j + 1).value = v;
    });
  });

  // Totals
  const r = (ledger || []).length + 4;
  ws.getCell(r, 1).value = 'TOTAL'; ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 5).value = (ledger || []).reduce((s, l) => s + (l.debit || 0), 0); ws.getCell(r, 5).font = { bold: true };
  ws.getCell(r, 6).value = (ledger || []).reduce((s, l) => s + (l.credit || 0), 0); ws.getCell(r, 6).font = { bold: true };
  ws.getCell(r, 7).value = (ledger || []).length > 0 ? ledger[ledger.length - 1].balance : 0; ws.getCell(r, 7).font = { bold: true };

  [5, 12, 16, 30, 14, 14, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=advance_ledger_${staff_name || 'all'}.xlsx`);
  await wb.xlsx.write(res); res.end();
}));

  return router;
};
