from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import io
from typing import Optional
from datetime import datetime, timezone
from database import db
from pydantic import BaseModel, Field, ConfigDict
import uuid

router = APIRouter()

# ============ MODELS ============

class StaffMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    salary_type: str  # "weekly" or "monthly"
    salary_amount: float  # per day for weekly, per month for monthly
    active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AttendanceEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    staff_id: str
    staff_name: str = ""
    date: str
    status: str  # "present", "absent", "half_day", "holiday"
    kms_year: str = ""
    season: str = ""

class StaffAdvance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    staff_id: str
    staff_name: str = ""
    amount: float
    date: str
    description: str = ""
    kms_year: str = ""
    season: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class StaffPayment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    staff_id: str
    staff_name: str = ""
    salary_type: str = ""
    salary_amount: float = 0
    period_from: str = ""
    period_to: str = ""
    total_days: int = 0
    days_worked: float = 0
    holidays: float = 0
    half_days: float = 0
    absents: int = 0
    gross_salary: float = 0
    advance_balance: float = 0
    advance_deducted: float = 0
    net_payment: float = 0
    date: str = ""
    kms_year: str = ""
    season: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============ STAFF CRUD ============

@router.get("/staff")
async def get_staff(active_only: bool = True):
    query = {"active": True} if active_only else {}
    staff = await db.staff.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return staff

@router.post("/staff")
async def add_staff(s: StaffMember):
    doc = s.model_dump()
    await db.staff.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, data: dict):
    existing = await db.staff.find_one({"id": staff_id})
    if not existing:
        raise HTTPException(404, "Staff not found")
    data.pop("id", None)
    data.pop("_id", None)
    await db.staff.update_one({"id": staff_id}, {"$set": data})
    updated = await db.staff.find_one({"id": staff_id}, {"_id": 0})
    return updated

@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str):
    await db.staff.update_one({"id": staff_id}, {"$set": {"active": False}})
    return {"message": "Staff deactivated"}


# ============ ATTENDANCE ============

@router.get("/staff/attendance")
async def get_attendance(staff_id: Optional[str] = None, date: Optional[str] = None,
                         date_from: Optional[str] = None, date_to: Optional[str] = None,
                         kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if staff_id: query["staff_id"] = staff_id
    if date: query["date"] = date
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if date_from or date_to:
        date_q = {}
        if date_from: date_q["$gte"] = date_from
        if date_to: date_q["$lte"] = date_to
        query["date"] = date_q
    return await db.staff_attendance.find(query, {"_id": 0}).sort("date", -1).to_list(10000)

@router.post("/staff/attendance")
async def mark_attendance(entry: AttendanceEntry):
    # Upsert - one entry per staff per date
    existing = await db.staff_attendance.find_one({"staff_id": entry.staff_id, "date": entry.date})
    doc = entry.model_dump()
    if existing:
        await db.staff_attendance.update_one(
            {"staff_id": entry.staff_id, "date": entry.date},
            {"$set": {"status": doc["status"], "kms_year": doc["kms_year"], "season": doc["season"]}}
        )
    else:
        await db.staff_attendance.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.post("/staff/attendance/bulk")
async def bulk_mark_attendance(data: dict):
    date = data.get("date", "")
    records = data.get("records", [])
    kms_year = data.get("kms_year", "")
    season = data.get("season", "")
    for r in records:
        existing = await db.staff_attendance.find_one({"staff_id": r["staff_id"], "date": date})
        if existing:
            await db.staff_attendance.update_one(
                {"staff_id": r["staff_id"], "date": date},
                {"$set": {"status": r["status"], "kms_year": kms_year, "season": season}}
            )
        else:
            doc = {
                "id": str(uuid.uuid4()), "staff_id": r["staff_id"],
                "staff_name": r.get("staff_name", ""), "date": date,
                "status": r["status"], "kms_year": kms_year, "season": season
            }
            await db.staff_attendance.insert_one(doc)
    return {"message": f"{len(records)} attendance records saved"}


# ============ ADVANCE ============

@router.get("/staff/advance")
async def get_advances(staff_id: Optional[str] = None, kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if staff_id: query["staff_id"] = staff_id
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    return await db.staff_advance.find(query, {"_id": 0}).sort("date", -1).to_list(5000)

@router.post("/staff/advance")
async def add_advance(adv: StaffAdvance):
    doc = adv.model_dump()
    await db.staff_advance.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.delete("/staff/advance/{adv_id}")
async def delete_advance(adv_id: str):
    result = await db.staff_advance.delete_one({"id": adv_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Advance not found")
    return {"message": "Advance deleted"}

@router.get("/staff/advance-balance/{staff_id}")
async def get_advance_balance(staff_id: str, kms_year: Optional[str] = None, season: Optional[str] = None):
    # Total advances given
    q = {"staff_id": staff_id}
    if kms_year: q["kms_year"] = kms_year
    if season: q["season"] = season
    advances = await db.staff_advance.find(q, {"_id": 0}).to_list(5000)
    total_advance = sum(a.get("amount", 0) for a in advances)

    # Total advance deducted from payments
    pq = {"staff_id": staff_id}
    if kms_year: pq["kms_year"] = kms_year
    if season: pq["season"] = season
    payments = await db.staff_payments.find(pq, {"_id": 0}).to_list(5000)
    total_deducted = sum(p.get("advance_deducted", 0) for p in payments)

    return {"total_advance": round(total_advance, 2), "total_deducted": round(total_deducted, 2),
            "balance": round(total_advance - total_deducted, 2)}


# ============ SALARY CALCULATION ============

@router.get("/staff/salary-calculate")
async def calculate_salary(staff_id: str, period_from: str, period_to: str,
                           kms_year: Optional[str] = None, season: Optional[str] = None):
    staff = await db.staff.find_one({"id": staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff not found")

    # Get attendance for period
    att_q = {"staff_id": staff_id, "date": {"$gte": period_from, "$lte": period_to}}
    attendance = await db.staff_attendance.find(att_q, {"_id": 0}).to_list(1000)

    present_days = sum(1 for a in attendance if a.get("status") == "present")
    half_days = sum(1 for a in attendance if a.get("status") == "half_day")
    holidays = sum(1 for a in attendance if a.get("status") == "holiday")
    absents = sum(1 for a in attendance if a.get("status") == "absent")
    days_worked = present_days + (half_days * 0.5) + holidays  # Holiday = paid leave

    # Calculate total days in period
    from datetime import datetime as dt
    d1 = dt.strptime(period_from, "%Y-%m-%d")
    d2 = dt.strptime(period_to, "%Y-%m-%d")
    total_days = (d2 - d1).days + 1

    # Calculate salary
    if staff["salary_type"] == "weekly":
        # Per day rate
        per_day = staff["salary_amount"]
        gross_salary = round(days_worked * per_day, 2)
    else:
        # Monthly: always /30
        per_day = staff["salary_amount"] / 30
        gross_salary = round(days_worked * per_day, 2)

    # Get advance balance
    adv_q = {"staff_id": staff_id}
    if kms_year: adv_q["kms_year"] = kms_year
    if season: adv_q["season"] = season
    advances = await db.staff_advance.find(adv_q, {"_id": 0}).to_list(5000)
    total_advance = sum(a.get("amount", 0) for a in advances)
    pq = {"staff_id": staff_id}
    if kms_year: pq["kms_year"] = kms_year
    if season: pq["season"] = season
    payments = await db.staff_payments.find(pq, {"_id": 0}).to_list(5000)
    total_deducted = sum(p.get("advance_deducted", 0) for p in payments)
    advance_balance = round(total_advance - total_deducted, 2)

    return {
        "staff": staff,
        "period_from": period_from, "period_to": period_to,
        "total_days": total_days,
        "present_days": present_days, "half_days": half_days,
        "holidays": holidays, "absents": absents,
        "days_worked": days_worked,
        "per_day_rate": round(per_day, 2),
        "gross_salary": gross_salary,
        "advance_balance": advance_balance,
        "attendance_details": sorted(attendance, key=lambda x: x.get("date", ""))
    }


# ============ PAYMENT (SETTLE SALARY) ============

@router.get("/staff/payments")
async def get_payments(staff_id: Optional[str] = None, kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if staff_id: query["staff_id"] = staff_id
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    return await db.staff_payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

@router.post("/staff/payments")
async def settle_salary(pay: StaffPayment):
    doc = pay.model_dump()
    doc["net_payment"] = round(doc["gross_salary"] - doc["advance_deducted"], 2)
    await db.staff_payments.insert_one(doc)
    doc.pop("_id", None)

    # Auto-create Cash Book Nikasi entry
    if doc["net_payment"] > 0:
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": doc["date"],
            "account": "cash",
            "txn_type": "nikasi",
            "category": "Staff Salary",
            "description": f"Salary: {doc['staff_name']} ({doc['period_from']} to {doc['period_to']})",
            "amount": round(doc["net_payment"], 2),
            "reference": f"staff_payment:{doc['id']}",
            "kms_year": doc.get("kms_year", ""),
            "season": doc.get("season", ""),
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cb_entry)
        cb_entry.pop("_id", None)
        doc["cash_book_entry"] = cb_entry

    return doc

@router.delete("/staff/payments/{payment_id}")
async def delete_payment(payment_id: str):
    payment = await db.staff_payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Payment not found")
    # Delete cash book entry too
    await db.cash_transactions.delete_one({"reference": f"staff_payment:{payment_id}"})
    await db.staff_payments.delete_one({"id": payment_id})
    return {"message": "Payment deleted and cash book entry removed"}



# ============ EXPORT: ATTENDANCE REPORT ============

@router.get("/staff/export/attendance")
async def export_attendance(date_from: str, date_to: str, fmt: str = "excel",
                            kms_year: Optional[str] = None, season: Optional[str] = None):
    staff_list = await db.staff.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(500)
    att_q = {"date": {"$gte": date_from, "$lte": date_to}}
    attendance = await db.staff_attendance.find(att_q, {"_id": 0}).to_list(10000)

    # Build date range
    from datetime import datetime as dt, timedelta
    d1 = dt.strptime(date_from, "%Y-%m-%d")
    d2 = dt.strptime(date_to, "%Y-%m-%d")
    dates = []
    cur = d1
    while cur <= d2:
        dates.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)

    # Map: staff_id -> date -> status
    att_map = {}
    for a in attendance:
        att_map.setdefault(a["staff_id"], {})[a["date"]] = a["status"]

    status_short = {"present": "P", "absent": "A", "half_day": "H", "holiday": "CH"}

    if fmt == "pdf":
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=15, rightMargin=15, topMargin=15, bottomMargin=15)
        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph(f"Staff Attendance Report: {date_from} to {date_to}", ParagraphStyle('t', parent=styles['Title'], fontSize=14, textColor=colors.HexColor('#1a365d'))))
        elements.append(Spacer(1, 8))

        # Build table
        headers = ["Staff"] + [d[-5:] for d in dates] + ["P", "H", "CH", "A", "Total"]
        rows = [headers]
        for s in staff_list:
            row = [s["name"]]
            p_cnt = h_cnt = ch_cnt = a_cnt = 0
            for d in dates:
                st = att_map.get(s["id"], {}).get(d, "-")
                row.append(status_short.get(st, "-"))
                if st == "present": p_cnt += 1
                elif st == "half_day": h_cnt += 1
                elif st == "holiday": ch_cnt += 1
                elif st == "absent": a_cnt += 1
            total = p_cnt + ch_cnt + (h_cnt * 0.5)
            row += [str(p_cnt), str(h_cnt), str(ch_cnt), str(a_cnt), str(total)]
            rows.append(row)

        n_cols = len(headers)
        col_w = max(18, min(30, 780 // n_cols))
        col_widths = [80] + [col_w] * (n_cols - 6) + [25, 25, 25, 25, 35]

        t = RTable(rows, colWidths=col_widths, repeatRows=1)
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]
        # Color code statuses
        for ri in range(1, len(rows)):
            for ci in range(1, n_cols - 5):
                val = rows[ri][ci]
                if val == "P": style_cmds.append(('TEXTCOLOR', (ci, ri), (ci, ri), colors.HexColor('#166534')))
                elif val == "A": style_cmds.append(('TEXTCOLOR', (ci, ri), (ci, ri), colors.HexColor('#991b1b')))
                elif val == "H": style_cmds.append(('TEXTCOLOR', (ci, ri), (ci, ri), colors.HexColor('#b45309')))
                elif val == "CH": style_cmds.append(('TEXTCOLOR', (ci, ri), (ci, ri), colors.HexColor('#1d4ed8')))
            if ri % 2 == 0:
                style_cmds.append(('BACKGROUND', (0, ri), (-1, ri), colors.HexColor('#f5f5f5')))
        t.setStyle(TableStyle(style_cmds))
        elements.append(t)

        doc.build(elements)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=staff_attendance_{date_from}_to_{date_to}.pdf"})

    else:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        wb = Workbook()
        ws = wb.active
        ws.title = "Attendance"
        hdr_fill = PatternFill(start_color='1a365d', end_color='1a365d', fill_type='solid')
        hdr_font = Font(bold=True, color='FFFFFF', size=8)
        tb = Border(left=Side(style='thin', color='cbd5e1'), right=Side(style='thin', color='cbd5e1'),
                    top=Side(style='thin', color='cbd5e1'), bottom=Side(style='thin', color='cbd5e1'))
        green_font = Font(color='166534', size=8, bold=True)
        red_font = Font(color='991b1b', size=8, bold=True)
        amber_font = Font(color='b45309', size=8, bold=True)
        blue_font = Font(color='1d4ed8', size=8, bold=True)

        ws.merge_cells('A1:F1')
        ws['A1'] = f"Staff Attendance: {date_from} to {date_to}"
        ws['A1'].font = Font(bold=True, size=12, color='1a365d')

        headers = ["Staff"] + [d[-5:] for d in dates] + ["P", "H", "CH", "A", "Total"]
        for i, h in enumerate(headers, 1):
            c = ws.cell(row=3, column=i, value=h)
            c.fill = hdr_fill; c.font = hdr_font; c.border = tb; c.alignment = Alignment(horizontal='center')

        row_num = 4
        for s in staff_list:
            ws.cell(row=row_num, column=1, value=s["name"]).border = tb
            p_cnt = h_cnt = ch_cnt = a_cnt = 0
            for di, d in enumerate(dates):
                st = att_map.get(s["id"], {}).get(d, "-")
                val = status_short.get(st, "-")
                c = ws.cell(row=row_num, column=2+di, value=val)
                c.border = tb; c.alignment = Alignment(horizontal='center')
                if val == "P": c.font = green_font
                elif val == "A": c.font = red_font
                elif val == "H": c.font = amber_font
                elif val == "CH": c.font = blue_font
                if st == "present": p_cnt += 1
                elif st == "half_day": h_cnt += 1
                elif st == "holiday": ch_cnt += 1
                elif st == "absent": a_cnt += 1
            base_col = 2 + len(dates)
            for ci, v in enumerate([p_cnt, h_cnt, ch_cnt, a_cnt, p_cnt + ch_cnt + (h_cnt * 0.5)]):
                c = ws.cell(row=row_num, column=base_col+ci, value=v)
                c.border = tb; c.alignment = Alignment(horizontal='center'); c.font = Font(bold=True, size=8)
            row_num += 1

        ws.column_dimensions['A'].width = 16
        for i in range(2, 2+len(dates)+5):
            ws.column_dimensions[chr(64+i) if i <= 26 else 'A' + chr(64+i-26)].width = 6

        buf = io.BytesIO()
        wb.save(buf); buf.seek(0)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=staff_attendance_{date_from}_to_{date_to}.xlsx"})


# ============ EXPORT: PAYMENT REPORT ============

@router.get("/staff/export/payments")
async def export_payments(fmt: str = "excel", kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    payments = await db.staff_payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

    if fmt == "pdf":
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=20, rightMargin=20, topMargin=15, bottomMargin=15)
        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph(f"Staff Payment Report", ParagraphStyle('t', parent=styles['Title'], fontSize=14, textColor=colors.HexColor('#1a365d'))))
        elements.append(Spacer(1, 8))

        headers = ['Date', 'Staff', 'Period', 'Days Worked', 'Gross', 'Adv Deduct', 'Net Paid']
        rows = [headers]
        total_gross = total_adv = total_net = 0
        for p in payments:
            rows.append([p.get("date",""), p.get("staff_name",""),
                f"{p.get('period_from','')} to {p.get('period_to','')}",
                str(p.get("days_worked",0)),
                f"Rs.{p.get('gross_salary',0):,.0f}",
                f"Rs.{p.get('advance_deducted',0):,.0f}",
                f"Rs.{p.get('net_payment',0):,.0f}"])
            total_gross += p.get("gross_salary", 0)
            total_adv += p.get("advance_deducted", 0)
            total_net += p.get("net_payment", 0)
        rows.append(["", "", "TOTAL", "", f"Rs.{total_gross:,.0f}", f"Rs.{total_adv:,.0f}", f"Rs.{total_net:,.0f}"])

        t = RTable(rows, colWidths=[65, 80, 130, 55, 75, 75, 75], repeatRows=1)
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd5e1')),
            ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e0e7ff')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]
        for i in range(1, len(rows)-1):
            if i % 2 == 0:
                style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f5f5f5')))
        t.setStyle(TableStyle(style_cmds))
        elements.append(t)

        doc.build(elements)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=staff_payments.pdf"})

    else:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        wb = Workbook()
        ws = wb.active; ws.title = "Staff Payments"
        hdr_fill = PatternFill(start_color='1a365d', end_color='1a365d', fill_type='solid')
        hdr_font = Font(bold=True, color='FFFFFF', size=9)
        tb = Border(left=Side(style='thin', color='cbd5e1'), right=Side(style='thin', color='cbd5e1'),
                    top=Side(style='thin', color='cbd5e1'), bottom=Side(style='thin', color='cbd5e1'))

        ws.merge_cells('A1:G1')
        ws['A1'] = "Staff Payment Report"
        ws['A1'].font = Font(bold=True, size=12, color='1a365d')

        headers = ['Date', 'Staff', 'Period', 'Days', 'Gross', 'Adv Deducted', 'Net Paid']
        for i, h in enumerate(headers, 1):
            c = ws.cell(row=3, column=i, value=h)
            c.fill = hdr_fill; c.font = hdr_font; c.border = tb; c.alignment = Alignment(horizontal='center')

        row_n = 4
        total_gross = total_adv = total_net = 0
        for p in payments:
            vals = [p.get("date",""), p.get("staff_name",""),
                f"{p.get('period_from','')} to {p.get('period_to','')}",
                p.get("days_worked",0), p.get("gross_salary",0),
                p.get("advance_deducted",0), p.get("net_payment",0)]
            for i, v in enumerate(vals, 1):
                c = ws.cell(row=row_n, column=i, value=v)
                c.border = tb; c.font = Font(size=9)
            total_gross += p.get("gross_salary", 0)
            total_adv += p.get("advance_deducted", 0)
            total_net += p.get("net_payment", 0)
            row_n += 1
        # Total row
        ws.cell(row=row_n, column=3, value="TOTAL").font = Font(bold=True, size=9)
        for ci, v in enumerate([total_gross, total_adv, total_net], 5):
            c = ws.cell(row=row_n, column=ci, value=v)
            c.font = Font(bold=True, size=9); c.border = tb

        for w, col in [(12,'A'),(16,'B'),(24,'C'),(8,'D'),(12,'E'),(12,'F'),(12,'G')]:
            ws.column_dimensions[col].width = w

        buf = io.BytesIO(); wb.save(buf); buf.seek(0)
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=staff_payments.xlsx"})