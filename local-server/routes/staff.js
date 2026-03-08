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
  const items = req.body.items || [];
  const results = [];
  for (const d of items) {
    const att = col('staff_attendance');
    database.data.staff_attendance = att.filter(a => !(a.staff_id === d.staff_id && a.date === d.date));
    const entry = {
      id: uuidv4(), staff_id: d.staff_id, staff_name: d.staff_name || '', date: d.date,
      status: d.status || 'present', kms_year: d.kms_year || '', season: d.season || ''
    };
    database.data.staff_attendance.push(entry);
    results.push(entry);
  }
  database.save(); res.json(results);
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
  const { staff_id, from_date, to_date, kms_year } = req.query;
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
  const totalDays = att.length;
  const daysWorked = presentDays + holidays + halfDays * 0.5;

  let perDay = staff.salary_amount;
  if (staff.salary_type === 'monthly') perDay = staff.salary_amount / 30;
  const grossSalary = Math.round(daysWorked * perDay);

  let advances = col('staff_advances').filter(a => a.staff_id === staff_id);
  if (kms_year) advances = advances.filter(a => a.kms_year === kms_year);
  if (from_date) advances = advances.filter(a => a.date >= from_date);
  if (to_date) advances = advances.filter(a => a.date <= to_date);

  // Check already paid in this period
  let payments = col('staff_payments').filter(p => p.staff_id === staff_id);
  if (from_date) payments = payments.filter(p => p.from_date >= from_date || p.to_date >= from_date);

  const totalAdvances = advances.reduce((s, a) => s + (a.amount || 0), 0);
  const alreadyPaid = payments.reduce((s, p) => s + (p.net_payment || 0), 0);
  const netPayment = Math.max(0, grossSalary - totalAdvances);

  res.json({
    staff_id: staff.id, staff_name: staff.name, salary_type: staff.salary_type,
    salary_amount: staff.salary_amount, per_day: Math.round(perDay * 100) / 100,
    from_date: from_date || '', to_date: to_date || '', total_days: totalDays,
    present: presentDays, half_day: halfDays, holiday: holidays, absent: absentDays,
    days_worked: daysWorked, gross_salary: grossSalary, total_advances: totalAdvances,
    already_paid: alreadyPaid, net_payment: netPayment
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

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a365d')
       .text(`Staff Attendance: ${date_from} to ${date_to}`, 10, 10);

    // Table
    const colW = Math.min(70, Math.max(45, (800 - 45) / Math.max(staffList.length, 1)));
    const headers = ['Date', ...staffList.map(s => s.name)];
    let y = 25;
    const rowH = Math.min(14, Math.max(10, 540 / (dates.length + 6)));

    // Header
    doc.fontSize(5.5).font('Helvetica-Bold').fillColor('white');
    doc.rect(10, y, 45, rowH).fill('#1a365d');
    doc.fillColor('white').text('Date', 12, y + 2, { width: 41 });
    let x = 55;
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
      x = 10;
      doc.font('Helvetica-Bold').fillColor('black').fontSize(5.5);
      doc.text(dt.slice(5), x + 2, y + 2, { width: 41 });
      x = 55;
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
      x = 10;
      doc.rect(x, y, 45, rowH).fill('#e0e7ff');
      doc.fillColor('black').font('Helvetica-Bold').fontSize(5.5).text(label, x + 2, y + 2, { width: 41 });
      x = 55;
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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=staff_attendance_${date_from}_to_${date_to}.xlsx`);
    wb.xlsx.write(res).then(() => res.end());
  }
});

// ============ STAFF PAYMENTS EXPORT (Excel) ============
router.get('/api/staff/export/payments', async (req, res) => {
  const ExcelJS = require('exceljs');
  const list = col('staff_payments');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Staff Payments');
  ws.addRow(['Staff', 'Period', 'Days Worked', 'Gross Salary', 'Advance', 'Net Payment', 'Date']);
  ws.getRow(1).font = { bold: true };
  for (const p of list) {
    ws.addRow([p.staff_name, `${p.from_date} to ${p.to_date}`, p.days_worked, p.gross_salary, p.advance_deducted, p.net_payment, p.created_at?.split('T')[0] || '']);
  }
  for (let i = 1; i <= 7; i++) ws.getColumn(i).width = 16;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=staff_payments.xlsx');
  await wb.xlsx.write(res); res.end();
});

  return router;
};
