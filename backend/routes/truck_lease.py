from fastapi import APIRouter, HTTPException
from database import db
from datetime import datetime, timezone
from typing import Optional
from utils.date_format import fmt_date
import uuid

router = APIRouter()

def gen_id(): return str(uuid.uuid4())
def now_iso(): return datetime.now(timezone.utc).isoformat()

def get_months_between(start_date_str, end_date_str=None):
    """Generate list of YYYY-MM months from start to end (or current month)"""
    try:
        start = datetime.strptime(start_date_str[:7], "%Y-%m")
    except:
        return []
    end = datetime.now()
    if end_date_str:
        try: end = datetime.strptime(end_date_str[:7], "%Y-%m")
        except: pass
    months = []
    current = start
    while current <= end:
        months.append(current.strftime("%Y-%m"))
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    return months


# ========== TRUCK LEASES CRUD ==========

@router.get("/truck-leases")
async def get_truck_leases(kms_year: Optional[str] = None, season: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if status: query["status"] = status
    leases = await db.truck_leases.find(query, {"_id": 0}).to_list(500)
    return sorted(leases, key=lambda x: x.get("created_at", ""), reverse=True)


@router.post("/truck-leases")
async def create_truck_lease(data: dict):
    lease = {
        "id": gen_id(),
        "truck_no": (data.get("truck_no") or "").strip().upper(),
        "owner_name": (data.get("owner_name") or "").strip(),
        "monthly_rent": float(data.get("monthly_rent") or 0),
        "start_date": data.get("start_date", ""),
        "end_date": data.get("end_date", ""),
        "advance_deposit": float(data.get("advance_deposit") or 0),
        "status": "active",
        "kms_year": data.get("kms_year", ""),
        "season": data.get("season", ""),
        "created_by": data.get("created_by", ""),
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    if not lease["truck_no"]:
        raise HTTPException(status_code=400, detail="Truck number is required")
    if lease["monthly_rent"] <= 0:
        raise HTTPException(status_code=400, detail="Monthly rent must be > 0")
    # Check duplicate active lease for same truck
    existing = await db.truck_leases.find_one({"truck_no": lease["truck_no"], "status": "active"}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Truck {lease['truck_no']} already has an active lease")
    await db.truck_leases.insert_one(lease)
    lease.pop("_id", None)
    return lease


@router.put("/truck-leases/{lease_id}")
async def update_truck_lease(lease_id: str, data: dict):
    existing = await db.truck_leases.find_one({"id": lease_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Lease not found")
    updates = {}
    for field in ["truck_no", "owner_name", "monthly_rent", "start_date", "end_date", "advance_deposit", "status"]:
        if field in data:
            if field == "truck_no":
                updates[field] = (data[field] or "").strip().upper()
            elif field in ("monthly_rent", "advance_deposit"):
                updates[field] = float(data[field] or 0)
            else:
                updates[field] = data[field]
    updates["updated_at"] = now_iso()
    await db.truck_leases.update_one({"id": lease_id}, {"$set": updates})
    return {**existing, **updates}


@router.delete("/truck-leases/{lease_id}")
async def delete_truck_lease(lease_id: str):
    result = await db.truck_leases.find_one({"id": lease_id}, {"_id": 0})
    if not result:
        raise HTTPException(status_code=404, detail="Lease not found")
    await db.truck_leases.delete_one({"id": lease_id})
    # Also delete related payment records
    await db.truck_lease_payments.delete_many({"lease_id": lease_id})
    return {"message": "Lease deleted", "id": lease_id}


# ========== LEASE PAYMENT SUMMARY (monthly breakdown) ==========

@router.get("/truck-leases/{lease_id}/payments")
async def get_lease_payments(lease_id: str):
    lease = await db.truck_leases.find_one({"id": lease_id}, {"_id": 0})
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    
    months = get_months_between(lease.get("start_date", ""), lease.get("end_date", ""))
    payments = await db.truck_lease_payments.find({"lease_id": lease_id}, {"_id": 0}).to_list(5000)
    
    # Group payments by month
    month_paid = {}
    for p in payments:
        m = p.get("month", "")
        if m not in month_paid: month_paid[m] = 0
        month_paid[m] += p.get("amount", 0)
    
    monthly_records = []
    total_rent = 0
    total_paid = 0
    for m in months:
        rent = lease.get("monthly_rent", 0)
        paid = round(month_paid.get(m, 0), 2)
        balance = round(rent - paid, 2)
        status = "paid" if balance <= 0 else ("partial" if paid > 0 else "pending")
        monthly_records.append({"month": m, "rent": rent, "paid": paid, "balance": max(0, balance), "status": status})
        total_rent += rent
        total_paid += paid
    
    return {
        "lease": lease,
        "monthly_records": monthly_records,
        "total_rent": round(total_rent, 2),
        "total_paid": round(total_paid, 2),
        "total_balance": round(max(0, total_rent - total_paid), 2),
        "advance_deposit": lease.get("advance_deposit", 0)
    }


# ========== MAKE PAYMENT ==========

@router.post("/truck-leases/{lease_id}/pay")
async def make_lease_payment(lease_id: str, data: dict):
    lease = await db.truck_leases.find_one({"id": lease_id}, {"_id": 0})
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    
    amount = float(data.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be > 0")
    
    month = data.get("month", datetime.now().strftime("%Y-%m"))
    account = data.get("account", "cash")
    bank_name = data.get("bank_name", "")
    payment_date = data.get("payment_date", datetime.now().strftime("%Y-%m-%d"))
    notes = data.get("notes", "")
    
    payment_id = gen_id()
    payment = {
        "id": payment_id,
        "lease_id": lease_id,
        "truck_no": lease["truck_no"],
        "owner_name": lease.get("owner_name", ""),
        "month": month,
        "amount": amount,
        "account": account,
        "bank_name": bank_name,
        "payment_date": payment_date,
        "notes": notes,
        "kms_year": lease.get("kms_year", ""),
        "season": lease.get("season", ""),
        "created_at": now_iso()
    }
    await db.truck_lease_payments.insert_one(payment)
    payment.pop("_id", None)
    
    # Create Cash Book nikasi entry
    txn_id = gen_id()
    cash_txn = {
        "id": txn_id,
        "date": payment_date,
        "account": account,
        "txn_type": "nikasi",
        "category": f"Truck Lease - {lease['truck_no']}",
        "party_type": "Truck Lease",
        "description": f"Lease payment {month} - {lease.get('owner_name', '')}",
        "amount": amount,
        "reference": f"lease_pay:{lease_id[:8]}",
        "linked_payment_id": f"truck_lease:{lease_id}:{month}:{payment_id}",
        "bank_name": bank_name,
        "kms_year": lease.get("kms_year", ""),
        "season": lease.get("season", ""),
        "created_by": data.get("created_by", ""),
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.cash_transactions.insert_one(cash_txn)
    
    # Create auto-ledger entry (nikasi)
    ledger_entry = {
        "id": gen_id(),
        "date": payment_date,
        "account": "ledger",
        "txn_type": "nikasi",
        "category": f"Truck Lease - {lease['truck_no']}",
        "party_type": "Truck Lease",
        "description": f"Lease payment {month} - {lease.get('owner_name', '')}",
        "amount": amount,
        "reference": f"auto_ledger:{txn_id[:8]}",
        "kms_year": lease.get("kms_year", ""),
        "season": lease.get("season", ""),
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.cash_transactions.insert_one(ledger_entry)
    
    return {"payment": payment, "cash_txn_id": txn_id, "message": f"Payment of Rs.{amount} recorded for {month}"}


# ========== PAYMENT HISTORY ==========

@router.get("/truck-leases/{lease_id}/history")
async def get_lease_payment_history(lease_id: str):
    payments = await db.truck_lease_payments.find({"lease_id": lease_id}, {"_id": 0}).to_list(5000)
    return sorted(payments, key=lambda x: x.get("created_at", ""), reverse=True)


# ========== CHECK IF TRUCK IS LEASED ==========

@router.get("/truck-leases/check/{truck_no}")
async def check_truck_leased(truck_no: str):
    lease = await db.truck_leases.find_one(
        {"truck_no": truck_no.upper(), "status": "active"}, {"_id": 0}
    )
    return {"is_leased": bool(lease), "lease": lease}


# ========== ALL LEASES SUMMARY (for Balance Sheet) ==========

@router.get("/truck-leases/summary")
async def get_leases_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {"status": "active"}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    leases = await db.truck_leases.find(query, {"_id": 0}).to_list(500)
    
    summary = []
    total_rent = 0
    total_paid = 0
    for lease in leases:
        months = get_months_between(lease.get("start_date", ""), lease.get("end_date", ""))
        rent = len(months) * lease.get("monthly_rent", 0)
        payments = await db.truck_lease_payments.find({"lease_id": lease["id"]}, {"_id": 0, "amount": 1}).to_list(5000)
        paid = sum(p.get("amount", 0) for p in payments)
        balance = round(rent - paid, 2)
        summary.append({
            "truck_no": lease["truck_no"],
            "owner_name": lease.get("owner_name", ""),
            "total_months": len(months),
            "monthly_rent": lease.get("monthly_rent", 0),
            "total_rent": round(rent, 2),
            "total_paid": round(paid, 2),
            "balance": max(0, balance),
            "advance_deposit": lease.get("advance_deposit", 0)
        })
        total_rent += rent
        total_paid += paid
    
    return {"leases": summary, "total_rent": round(total_rent, 2), "total_paid": round(total_paid, 2), "total_balance": round(max(0, total_rent - total_paid), 2)}



# ========== PDF EXPORT ==========

@router.get("/truck-leases/export/pdf")
async def export_leases_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from fastapi.responses import StreamingResponse
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from utils.export_helpers import get_pdf_styles
    import io

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    leases = await db.truck_leases.find(query, {"_id": 0}).to_list(500)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=30, bottomMargin=30)
    styles = get_pdf_styles()
    elements = []

    from utils.export_helpers import get_pdf_table_style
    from utils.branding_helper import get_pdf_company_header_from_db
    elements.extend(await get_pdf_company_header_from_db())
    elements.append(Paragraph("Truck Lease Report", styles['Title']))
    if kms_year: elements.append(Paragraph(f"Year: {kms_year} | Season: {season or 'All'}", styles['Normal']))
    elements.append(Spacer(1, 12))

    header = ['Truck No.', 'Owner', 'Monthly Rent', 'Start', 'End', 'Advance', 'Status', 'Total Due', 'Paid', 'Balance']
    data = [header]
    grand_total = 0
    grand_paid = 0

    for lease in leases:
        months = get_months_between(lease.get("start_date", ""), lease.get("end_date", ""))
        total_rent = len(months) * lease.get("monthly_rent", 0)
        payments = await db.truck_lease_payments.find({"lease_id": lease["id"]}, {"_id": 0, "amount": 1}).to_list(5000)
        paid = sum(p.get("amount", 0) for p in payments)
        balance = round(total_rent - paid, 2)
        grand_total += total_rent
        grand_paid += paid
        data.append([
            lease.get("truck_no", ""), lease.get("owner_name", ""),
            f"Rs.{lease.get('monthly_rent', 0):,.0f}", fmt_date(lease.get("start_date", "")),
            fmt_date(lease.get("end_date", "")) or "Ongoing", f"Rs.{lease.get('advance_deposit', 0):,.0f}",
            lease.get("status", "").upper(),
            f"Rs.{total_rent:,.0f}", f"Rs.{paid:,.0f}", f"Rs.{max(0, balance):,.0f}"
        ])

    data.append(['', '', '', '', '', '', 'TOTAL', f"Rs.{grand_total:,.0f}", f"Rs.{grand_paid:,.0f}", f"Rs.{max(0, grand_total - grand_paid):,.0f}"])

    col_w = [65, 80, 70, 65, 65, 60, 45, 65, 60, 65]
    t = Table(data, colWidths=col_w)
    pdf_style = get_pdf_table_style(len(data))
    t.setStyle(TableStyle(pdf_style))
    elements.append(t)

    # ===== Beautiful single-line summary banner =====
    from utils.export_helpers import get_pdf_summary_banner, fmt_inr, STAT_COLORS
    bal = max(0, grand_total - grand_paid)
    active = sum(1 for l in leases if l.get('status', '').lower() == 'active')
    closed = len(leases) - active
    banner_stats = [
        {'label': 'TOTAL LEASES', 'value': str(len(leases)), 'color': STAT_COLORS['primary']},
        {'label': 'ACTIVE', 'value': str(active), 'color': STAT_COLORS['emerald']},
        {'label': 'CLOSED', 'value': str(closed), 'color': STAT_COLORS['orange']},
        {'label': 'TOTAL DUE', 'value': fmt_inr(grand_total), 'color': STAT_COLORS['gold']},
        {'label': 'PAID', 'value': fmt_inr(grand_paid), 'color': STAT_COLORS['green']},
        {'label': 'BALANCE', 'value': fmt_inr(bal), 'color': STAT_COLORS['red']},
    ]
    elements.append(Spacer(1, 6))
    banner = get_pdf_summary_banner(banner_stats, total_width=sum(col_w))
    if banner:
        elements.append(banner)

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=truck_lease_report.pdf"})


# ========== EXCEL EXPORT ==========

@router.get("/truck-leases/export/excel")
async def export_leases_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from fastapi.responses import StreamingResponse
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill
    import io

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    leases = await db.truck_leases.find(query, {"_id": 0}).to_list(500)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Truck Leases"

    from utils.export_helpers import style_excel_title, style_excel_header_row, style_excel_data_rows
    ncols = 11
    style_excel_title(ws, "Truck Lease Report", ncols)

    # Header at row 4
    headers = ['Truck No.', 'Owner', 'Monthly Rent', 'Start Date', 'End Date', 'Advance Deposit', 'Status', 'Total Months', 'Total Due', 'Total Paid', 'Balance']
    for c, h in enumerate(headers, 1):
        ws.cell(row=4, column=c, value=h)
    style_excel_header_row(ws, 4, ncols)

    row = 5
    for lease in leases:
        months = get_months_between(lease.get("start_date", ""), lease.get("end_date", ""))
        total_rent = len(months) * lease.get("monthly_rent", 0)
        payments = await db.truck_lease_payments.find({"lease_id": lease["id"]}, {"_id": 0, "amount": 1}).to_list(5000)
        paid = sum(p.get("amount", 0) for p in payments)
        balance = round(total_rent - paid, 2)
        ws.cell(row=row, column=1, value=lease.get("truck_no", ""))
        ws.cell(row=row, column=2, value=lease.get("owner_name", ""))
        ws.cell(row=row, column=3, value=lease.get("monthly_rent", 0))
        ws.cell(row=row, column=4, value=fmt_date(lease.get("start_date", "")))
        ws.cell(row=row, column=5, value=fmt_date(lease.get("end_date", "")) or "Ongoing")
        ws.cell(row=row, column=6, value=lease.get("advance_deposit", 0))
        ws.cell(row=row, column=7, value=lease.get("status", "").upper())
        ws.cell(row=row, column=8, value=len(months))
        ws.cell(row=row, column=9, value=total_rent)
        ws.cell(row=row, column=10, value=paid)
        ws.cell(row=row, column=11, value=max(0, balance))
        row += 1

    for c in range(1, 12):
        ws.column_dimensions[chr(64 + c)].width = 15

    style_excel_data_rows(ws, 5, row - 1, ncols)

    # ===== Beautiful single-line summary banner =====
    if leases:
        from utils.export_helpers import add_excel_summary_banner, fmt_inr
        # Aggregate from already-computed loop above is gone; recompute
        gt = gp = 0
        for ls in leases:
            mts = get_months_between(ls.get("start_date", ""), ls.get("end_date", ""))
            tr = len(mts) * ls.get("monthly_rent", 0)
            pmts = await db.truck_lease_payments.find({"lease_id": ls["id"]}, {"_id": 0, "amount": 1}).to_list(5000)
            gt += tr
            gp += sum(p.get("amount", 0) for p in pmts)
        active = sum(1 for ls in leases if ls.get('status', '').lower() == 'active')
        sum_stats = [
            {'label': 'Total Leases', 'value': str(len(leases))},
            {'label': 'Active', 'value': str(active)},
            {'label': 'Closed', 'value': str(len(leases) - active)},
            {'label': 'Total Due', 'value': fmt_inr(gt)},
            {'label': 'Paid', 'value': fmt_inr(gp)},
            {'label': 'Balance', 'value': fmt_inr(max(0, gt - gp))},
        ]
        add_excel_summary_banner(ws, row + 1, ncols, sum_stats)

    buf = io.BytesIO()
    # 🎯 v104.44.9 — Apply consolidated multi-record polish
    from utils.export_helpers import apply_consolidated_excel_polish
    apply_consolidated_excel_polish(ws)
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                           headers={"Content-Disposition": f"attachment; filename=truck_lease_report.xlsx"})
