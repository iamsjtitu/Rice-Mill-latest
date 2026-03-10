const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = function(database) {

function col(name) {
  if (!database.data[name]) database.data[name] = [];
  return database.data[name];
}

// ============ STAFF CRUD ============
router.post('/api/staff', (req, res) => {
  const d = req.body;
  const name = (d.name || '').trim();
  if (!name) return res.status(400).json({ detail: 'Staff name required' });
  const staff = {
    id: uuidv4(), name, salary_type: d.salary_type || 'monthly',
    salary_amount: parseFloat(d.salary_amount) || 0, active: true,
    created_at: new Date().toISOString()
  };
  col('staff').push(staff); database.save(); res.json(staff);
});

router.get('/api/staff', (req, res) => {
  let list = col('staff');
  if (req.query.active === 'true') list = list.filter(s => s.active !== false);
  res.json(list.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
});

router.put('/api/staff/:id', (req, res) => {
  const list = col('staff');
  const idx = list.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: 'Not found' });
  list[idx] = { ...list[idx], ...req.body, updated_at: new Date().toISOString() };
  database.save(); res.json(list[idx]);
});

router.delete('/api/staff/:id', (req, res) => {
  const list = col('staff');
  const len = list.length;
  database.data.staff = list.filter(s => s.id !== req.params.id);
  if (database.data.staff.length < len) { database.save(); return res.json({ message: 'Deleted', id: req.params.id }); }
  res.status(404).json({ detail: 'Not found' });
});

// ============ ATTENDANCE ============
router.post('/api/staff/attendance', (req, res) => {
  const d = req.body;
  const att = col('staff_attendance');
  // Remove existing for same staff+date
  database.data.staff_attendance = att.filter(a => !(a.staff_id === d.staff_id && a.date === d.date));
  const entry = {
    id: uuidv4(), staff_id: d.staff_id, staff_name: d.staff_name || '', date: d.date,
    status: d.status || 'present', kms_year: d.kms_year || '', season: d.season || ''
  };
  database.data.staff_attendance.push(entry); database.save(); res.json(entry);
});

router.post('/api/staff/attendance/bulk', (req, res) => {
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
});

router.get('/api/staff/attendance', (req, res) => {
  let list = col('staff_attendance');
  if (req.query.date) list = list.filter(a => a.date === req.query.date);
  if (req.query.staff_id) list = list.filter(a => a.staff_id === req.query.staff_id);
  if (req.query.kms_year) list = list.filter(a => a.kms_year === req.query.kms_year);
  if (req.query.date_from) list = list.filter(a => a.date >= req.query.date_from);
  if (req.query.date_to) list = list.filter(a => a.date <= req.query.date_to);
  res.json(list);
});

// ============ STAFF ADVANCES ============
router.post('/api/staff/advance', (req, res) => {
  const d = req.body;
  const adv = {
    id: uuidv4(), staff_id: d.staff_id, staff_name: d.staff_name || '',
    amount: parseFloat(d.amount) || 0, date: d.date || '',
    description: d.description || '', kms_year: d.kms_year || '', season: d.season || '',
    created_at: new Date().toISOString()
  };
  col('staff_advances').push(adv);
  // Also add to cash book as nikasi
  col('cash_transactions').push({
    id: uuidv4(), date: adv.date, account: 'cash', txn_type: 'nikasi',
    category: 'Staff Advance', description: `Advance: ${adv.staff_name} - ${adv.description}`,
    amount: adv.amount, reference: adv.id, kms_year: adv.kms_year, season: adv.season,
    party_name: adv.staff_name, created_by: d.created_by || '', created_at: new Date().toISOString()
  });
  database.save(); res.json(adv);
});

router.get('/api/staff/advance', (req, res) => {
  let list = col('staff_advances');
  if (req.query.staff_id) list = list.filter(a => a.staff_id === req.query.staff_id);
  if (req.query.kms_year) list = list.filter(a => a.kms_year === req.query.kms_year);
  res.json(list.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
});

router.delete('/api/staff/advance/:id', (req, res) => {
  const list = col('staff_advances');
  const adv = list.find(a => a.id === req.params.id);
  if (!adv) return res.status(404).json({ detail: 'Not found' });
  database.data.staff_advances = list.filter(a => a.id !== req.params.id);
  // Remove linked cash transaction
  database.data.cash_transactions = col('cash_transactions').filter(t => t.reference !== req.params.id);
  database.save(); res.json({ message: 'Deleted', id: req.params.id });
});

// ============ STAFF ADVANCE BALANCE ============
router.get('/api/staff/advance-balance/:staffId', (req, res) => {
  const { kms_year, season } = req.query;
  let advances = col('staff_advances').filter(a => a.staff_id === req.params.staffId);
  if (kms_year) advances = advances.filter(a => a.kms_year === kms_year);
  if (season) advances = advances.filter(a => a.season === season);
  const totalAdvance = +(advances.reduce((s, a) => s + (a.amount || 0), 0).toFixed(2));

  let payments = col('staff_payments').filter(p => p.staff_id === req.params.staffId);
  if (kms_year) payments = payments.filter(p => p.kms_year === kms_year);
  if (season) payments = payments.filter(p => p.season === season);
  const totalDeducted = +(payments.reduce((s, p) => s + (p.advance_deducted || 0), 0).toFixed(2));

  res.json({ total_advance: totalAdvance, total_deducted: totalDeducted, balance: +(totalAdvance - totalDeducted).toFixed(2) });
});


// ============ STAFF SALARY CALCULATION ============
router.get('/api/staff/salary-calculate', (req, res) => {
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
  const advanceBalance = Math.round((totalAdvances - totalDeducted) * 100) / 100;

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
});

// ============ STAFF PAYMENTS ============
router.post('/api/staff/payments', (req, res) => {
  const d = req.body;
  const payment = {
    id: uuidv4(), staff_id: d.staff_id, staff_name: d.staff_name || '',
    salary_type: d.salary_type || '', from_date: d.from_date || '', to_date: d.to_date || '',
    total_days: d.total_days || 0, days_worked: d.days_worked || 0,
    gross_salary: parseFloat(d.gross_salary) || 0, advance_deducted: parseFloat(d.advance_deducted) || 0,
    net_payment: parseFloat(d.net_payment) || 0, kms_year: d.kms_year || '', season: d.season || '',
    created_at: new Date().toISOString()
  };
  col('staff_payments').push(payment);
  // Also add to cash book
  col('cash_transactions').push({
    id: uuidv4(), date: new Date().toISOString().split('T')[0], account: 'cash', txn_type: 'nikasi',
    category: 'Staff Salary', description: `Salary: ${payment.staff_name} (${payment.from_date} to ${payment.to_date})`,
    amount: payment.net_payment, reference: payment.id, kms_year: payment.kms_year, season: payment.season,
    party_name: payment.staff_name, created_by: d.created_by || '', created_at: new Date().toISOString()
  });
  database.save(); res.json(payment);
});

router.get('/api/staff/payments', (req, res) => {
  let list = col('staff_payments');
  if (req.query.staff_id) list = list.filter(p => p.staff_id === req.query.staff_id);
  if (req.query.kms_year) list = list.filter(p => p.kms_year === req.query.kms_year);
  res.json(list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
});

router.delete('/api/staff/payments/:id', (req, res) => {
  const list = col('staff_payments');
  const payment = list.find(p => p.id === req.params.id);
  if (!payment) return res.status(404).json({ detail: 'Not found' });
  database.data.staff_payments = list.filter(p => p.id !== req.params.id);
  database.data.cash_transactions = col('cash_transactions').filter(t => t.reference !== req.params.id);
  database.save(); res.json({ message: 'Deleted', id: req.params.id });
});

// ============ ATTENDANCE EXPORT (PDF) ============
router.get('/api/staff/export/attendance', (req, res) => {
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=staff_attendance_${date_from}_to_${date_to}.pdf`);
    doc.pipe(res);

    // Calculate table dimensions for centering
    const colW = Math.min(70, Math.max(45, (800 - 45) / Math.max(staffList.length, 1)));
    const tableW = 45 + (staffList.length * colW);
    const pageW = doc.page.width;
    const tableStartX = Math.max(10, (pageW - tableW) / 2);

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a365d')
       .text(`Staff Attendance: ${date_from} to ${date_to}`, { align: 'center' });

    // Table
    const headers = ['Date', ...staffList.map(s => s.name)];
    let y = 25;
    const rowH = Math.min(14, Math.max(10, 540 / (dates.length + 6)));

    // Header
    doc.fontSize(5.5).font('Helvetica-Bold').fillColor('white');
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
      doc.font('Helvetica-Bold').fillColor('black').fontSize(5.5);
      doc.text(dt.slice(5), x + 2, y + 2, { width: 41 });
      x = tableStartX + 45;
      for (const s of staffList) {
        const st = (attMap[s.id] || {})[dt] || '-';
        const val = statusShort[st] || '-';
        if (bgMap[val]) {
          doc.rect(x, y, colW, rowH).fill(bgMap[val]);
          doc.fillColor(txMap[val]).font('Helvetica-Bold');
        } else {
          doc.fillColor('black').font('Helvetica');
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
      doc.fillColor('black').font('Helvetica-Bold').fontSize(5.5).text(label, x + 2, y + 2, { width: 41 });
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
        doc.fillColor('black').font('Helvetica-Bold').fontSize(5.5).text(val, x + 2, y + 2, { width: colW - 4 });
        x += colW;
      }
      y += rowH;
    }

    // ---- PAGE 2: MONTHLY SUMMARY ----
    const monthNames2 = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun','07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' };
    const monthlyData2 = {};
    for (const dt of dates) {
      const mk = dt.slice(0, 7);
      if (!monthlyData2[mk]) {
        monthlyData2[mk] = {};
        staffList.forEach(s => { monthlyData2[mk][s.id] = { P: 0, A: 0, H: 0, CH: 0 }; });
      }
      for (const s of staffList) {
        const st = (attMap[s.id] || {})[dt] || '-';
        const val = statusShort[st] || '-';
        if (monthlyData2[mk] && monthlyData2[mk][s.id] && monthlyData2[mk][s.id][val] !== undefined) monthlyData2[mk][s.id][val]++;
      }
    }
    const sortedMonths2 = Object.keys(monthlyData2).sort();

    doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 });
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a365d')
       .text('Monthly Summary / Masik Saransh', { align: 'center' });

    const msHeaders2 = ['Staff', 'Sal.Type', 'Rate', ...sortedMonths2.map(m => `${monthNames2[m.slice(5,7)] || m.slice(5,7)} ${m.slice(0,4)}`), 'Total Days', 'Est. Salary'];
    const msCols2 = msHeaders2.length;
    const msColW2 = Math.max(50, Math.min(80, 800 / Math.max(msCols2, 1)));
    const msColWidths2 = [70, 45, 45, ...Array(sortedMonths2.length).fill(msColW2), 50, 65];
    const totalMsW2 = msColWidths2.reduce((a, b) => a + b, 0);
    const msScale2 = totalMsW2 > 800 ? 800 / totalMsW2 : 1;
    const scaledMsW2 = msColWidths2.map(w => w * msScale2);
    const actualMsW2 = scaledMsW2.reduce((a, b) => a + b, 0);
    const msStartX2 = Math.max(10, (doc.page.width - actualMsW2) / 2);

    let msY2 = 28;
    const msRowH2 = 12;

    // Header row
    let msX2 = msStartX2;
    for (let i = 0; i < msHeaders2.length; i++) {
      doc.rect(msX2, msY2, scaledMsW2[i], msRowH2).fill('#065f46');
      doc.fillColor('white').font('Helvetica-Bold').fontSize(5.5)
         .text(msHeaders2[i], msX2 + 2, msY2 + 2, { width: scaledMsW2[i] - 4 });
      msX2 += scaledMsW2[i];
    }
    msY2 += msRowH2;

    // Data rows - staff summary
    for (const s of staffList) {
      msX2 = msStartX2;
      const salType = s.salary_type === 'monthly' ? 'Monthly' : 'Daily';
      const salAmt = s.salary_amount || 0;
      const perDay = s.salary_type === 'monthly' ? salAmt / 30 : salAmt;
      const vals = [s.name, salType, String(salAmt)];
      let grand = 0;
      for (const mk of sortedMonths2) {
        const md = monthlyData2[mk][s.id];
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
        doc.rect(msX2, msY2, scaledMsW2[i], msRowH2).fill(bgColor);
        const txtColor = i === vals.length - 1 ? '#92400e' : '#000000';
        doc.fillColor(txtColor).font(isLastTwo || i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(5.5)
           .text(vals[i], msX2 + 2, msY2 + 2, { width: scaledMsW2[i] - 4 });
        msX2 += scaledMsW2[i];
      }
      msY2 += msRowH2;
      if (msY2 > 560) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 }); msY2 = 10; }
    }

    // Breakdown (P/A/H/CH)
    msY2 += 4;
    msX2 = msStartX2;
    const breakdownW2 = scaledMsW2.reduce((a, b) => a + b, 0);
    doc.rect(msX2, msY2, breakdownW2, msRowH2).fill('#fef3c7');
    doc.fillColor('#78350f').font('Helvetica-Bold').fontSize(6.5)
       .text('Breakdown (P / A / H / CH)', msX2 + 2, msY2 + 2, { width: breakdownW2 - 4 });
    msY2 += msRowH2;

    for (const s of staffList) {
      msX2 = msStartX2;
      const perDay = s.salary_type === 'monthly' ? (s.salary_amount || 0) / 30 : (s.salary_amount || 0);
      const vals = [s.name, '', ''];
      let grandSal = 0;
      for (const mk of sortedMonths2) {
        const md = monthlyData2[mk][s.id];
        vals.push(`${md.P}/${md.A}/${md.H}/${md.CH}`);
        grandSal += (md.P + md.CH + md.H * 0.5) * perDay;
      }
      vals.push('');
      vals.push(`Rs.${Math.round(grandSal).toLocaleString('en-IN')}`);
      for (let i = 0; i < vals.length; i++) {
        doc.rect(msX2, msY2, scaledMsW2[i], msRowH2).fill('#ffffff');
        doc.fillColor('#000000').font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(5.5)
           .text(vals[i], msX2 + 2, msY2 + 2, { width: scaledMsW2[i] - 4 });
        msX2 += scaledMsW2[i];
      }
      msY2 += msRowH2;
      if (msY2 > 560) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 }); msY2 = 10; }
    }

    // Month-wise Estimated Salary
    msY2 += 4;
    msX2 = msStartX2;
    doc.rect(msX2, msY2, breakdownW2, msRowH2).fill('#dbeafe');
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(6.5)
       .text('Month-wise Estimated Salary / Mahine Ka Anumanit Vetan', msX2 + 2, msY2 + 2, { width: breakdownW2 - 4 });
    msY2 += msRowH2;

    for (const s of staffList) {
      msX2 = msStartX2;
      const perDay = s.salary_type === 'monthly' ? (s.salary_amount || 0) / 30 : (s.salary_amount || 0);
      const vals = [s.name, '', ''];
      let grandSal = 0;
      for (const mk of sortedMonths2) {
        const md = monthlyData2[mk][s.id];
        const worked = md.P + md.CH + md.H * 0.5;
        const mSal = Math.round(worked * perDay);
        grandSal += mSal;
        vals.push(`Rs.${mSal.toLocaleString('en-IN')}`);
      }
      vals.push('');
      vals.push(`Rs.${Math.round(grandSal).toLocaleString('en-IN')}`);
      for (let i = 0; i < vals.length; i++) {
        const bgColor = i === vals.length - 1 ? '#fef3c7' : '#ffffff';
        doc.rect(msX2, msY2, scaledMsW2[i], msRowH2).fill(bgColor);
        const txtColor = i === vals.length - 1 ? '#92400e' : '#000000';
        doc.fillColor(txtColor).font(i === 0 || i === vals.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(5.5)
           .text(vals[i], msX2 + 2, msY2 + 2, { width: scaledMsW2[i] - 4 });
        msX2 += scaledMsW2[i];
      }
      msY2 += msRowH2;
      if (msY2 > 560) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 10 }); msY2 = 10; }
    }

    doc.end();
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
});

// ============ STAFF PAYMENTS EXPORT (PDF & Excel) ============
router.get('/api/staff/export/payments', async (req, res) => {
  const { fmt, kms_year, season } = req.query;
  let list = col('staff_payments');
  if (kms_year) list = list.filter(p => p.kms_year === kms_year);
  if (season) list = list.filter(p => p.season === season);

  if (fmt === 'pdf') {
    const PDFDocument = require('pdfkit');
    const { addPdfHeader: _addPdfHdr, addPdfTable, fmtAmt, C } = require('./pdf_helpers');
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=staff_payments.pdf');
    doc.pipe(res);

    const branding = database.getBranding ? database.getBranding() : { company_name: 'Mill Entry System', tagline: '' };
    _addPdfHdr(doc, 'Staff Payment Report', branding, kms_year ? `${kms_year} | ${season || ''}` : '');

    const headers = ['Staff', 'Period', 'Days Worked', 'Gross Salary', 'Adv. Deducted', 'Net Payment', 'Date'];
    const rows = list.map(p => [
      p.staff_name || '', `${p.period_from || p.from_date || ''} to ${p.period_to || p.to_date || ''}`,
      String(p.days_worked || 0), `Rs.${fmtAmt(p.gross_salary || 0)}`,
      `Rs.${fmtAmt(p.advance_deducted || 0)}`, `Rs.${fmtAmt(p.net_payment || 0)}`,
      p.date || (p.created_at || '').split('T')[0] || ''
    ]);
    addPdfTable(doc, headers, rows, [90, 100, 60, 80, 80, 80, 65]);

    const totalGross = list.reduce((s, p) => s + (p.gross_salary || 0), 0);
    const totalAdv = list.reduce((s, p) => s + (p.advance_deducted || 0), 0);
    const totalNet = list.reduce((s, p) => s + (p.net_payment || 0), 0);
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C.hdrBg)
      .text(`Total Gross: Rs.${fmtAmt(totalGross)}  |  Adv. Deducted: Rs.${fmtAmt(totalAdv)}  |  Net Paid: Rs.${fmtAmt(totalNet)}`, { align: 'center' });
    doc.end();
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

    const r = list.length + 4;
    ws.getCell(r, 1).value = 'TOTAL'; ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 4).value = list.reduce((s, p) => s + (p.gross_salary || 0), 0); ws.getCell(r, 4).font = { bold: true };
    ws.getCell(r, 5).value = list.reduce((s, p) => s + (p.advance_deducted || 0), 0); ws.getCell(r, 5).font = { bold: true };
    ws.getCell(r, 6).value = list.reduce((s, p) => s + (p.net_payment || 0), 0); ws.getCell(r, 6).font = { bold: true };

    for (let i = 1; i <= 7; i++) ws.getColumn(i).width = 18;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=staff_payments.xlsx');
    await wb.xlsx.write(res); res.end();
  }
});

  return router;
};
