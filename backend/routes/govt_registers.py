from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone
from database import db
from utils.date_format import fmt_date
import uuid, io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

router = APIRouter()

# ============ HELPER FUNCTIONS ============

thin_border = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin')
)
header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
header_font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
data_font = Font(name="Calibri", size=10)
total_fill = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")
total_font = Font(name="Calibri", bold=True, size=10)


async def get_company_name():
    branding = await db.branding.find_one({}, {"_id": 0})
    if branding:
        return branding.get("company_name", "NAVKAR AGRO"), branding.get("tagline", "")
    return "NAVKAR AGRO", ""


def style_govt_excel(ws, title, headers, data_rows, col_widths, company_name="", subtitle=""):
    """Apply professional government register styling to Excel worksheet."""
    # Title row
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    title_cell = ws.cell(row=1, column=1, value=company_name or title)
    title_cell.font = Font(name="Calibri", bold=True, size=14, color="1F4E79")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    # Subtitle row
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
    sub_cell = ws.cell(row=2, column=1, value=subtitle or title)
    sub_cell.font = Font(name="Calibri", bold=True, size=12, color="4472C4")
    sub_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 22

    # Header row (row 3)
    for ci, h in enumerate(headers, 1):
        cell = ws.cell(row=3, column=ci, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
    ws.row_dimensions[3].height = 30

    # Data rows
    for ri, row_data in enumerate(data_rows, 4):
        for ci, val in enumerate(row_data, 1):
            cell = ws.cell(row=ri, column=ci, value=val)
            cell.font = data_font
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center" if ci > 1 else "left", vertical="center")

    # Column widths
    for ci, w in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(ci)].width = w

    return ws


# ============ FORM A: Paddy Received from OSCSC ============

@router.get("/govt-registers/form-a")
async def get_form_a(kms_year: Optional[str] = None, season: Optional[str] = None,
                     date_from: Optional[str] = None, date_to: Optional[str] = None,
                     group_by: Optional[str] = "daily"):
    """Form A - Paddy stock register (from OSCSC/State Procuring Agency).
    group_by: daily (default) or weekly."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q

    # Get all mill entries grouped by date
    entries = await db.mill_entries.find(query, {"_id": 0, "date": 1, "final_w": 1, "kg": 1, "agent_name": 1, "mandi_name": 1, "bag": 1}).sort("date", 1).to_list(50000)

    # Get milling entries for the same period
    mill_query = {}
    if kms_year:
        mill_query["kms_year"] = kms_year
    if season:
        mill_query["season"] = season
    if date_q:
        mill_query["date"] = date_q
    milling_entries = await db.milling_entries.find(mill_query, {"_id": 0, "date": 1, "paddy_input_qntl": 1}).sort("date", 1).to_list(50000)

    # Group by date
    daily_received = {}
    for e in entries:
        d = e.get("date", "")
        if not d:
            continue
        if d not in daily_received:
            daily_received[d] = {"received_qntl": 0, "bags": 0, "count": 0}
        final_w = float(e.get("final_w", 0) or 0) / 100  # final_w is stored in KG, convert to QNTL
        if final_w == 0:
            final_w = float(e.get("kg", 0) or 0) / 100
        daily_received[d]["received_qntl"] += final_w
        daily_received[d]["bags"] += int(e.get("bag", 0) or 0)
        daily_received[d]["count"] += 1

    daily_milled = {}
    for m in milling_entries:
        d = m.get("date", "")
        if not d:
            continue
        if d not in daily_milled:
            daily_milled[d] = 0
        daily_milled[d] += float(m.get("paddy_input_qntl", 0) or 0)

    # Build daily register with running balance
    all_dates = sorted(set(list(daily_received.keys()) + list(daily_milled.keys())))
    rows = []
    opening_balance = 0
    total_received = 0
    total_milled = 0

    for d in all_dates:
        received = round(daily_received.get(d, {}).get("received_qntl", 0), 2)
        bags = daily_received.get(d, {}).get("bags", 0)
        count = daily_received.get(d, {}).get("count", 0)
        milled = round(daily_milled.get(d, 0), 2)
        total_paddy = round(opening_balance + received, 2)
        closing_balance = round(total_paddy - milled, 2)

        total_received += received
        total_milled += milled

        rows.append({
            "date": d,
            "opening_balance": round(opening_balance, 2),
            "received_qntl": received,
            "bags": bags,
            "entries_count": count,
            "total_paddy": total_paddy,
            "milled_qntl": milled,
            "closing_balance": closing_balance,
        })
        opening_balance = closing_balance

    # Weekly grouping if requested
    if group_by == "weekly" and rows:
        from datetime import datetime as _dt
        weekly_rows = []
        week_data = None
        for r in rows:
            try:
                dt = _dt.strptime(r["date"], "%Y-%m-%d")
                # Monday-based week
                week_start = dt - __import__('datetime').timedelta(days=dt.weekday())
                week_key = week_start.strftime("%Y-%m-%d")
            except:
                week_key = r["date"]
            if week_data is None or week_data["_week_key"] != week_key:
                if week_data:
                    weekly_rows.append(week_data)
                week_end = (week_start + __import__('datetime').timedelta(days=6)).strftime("%Y-%m-%d")
                week_data = {
                    "_week_key": week_key,
                    "date": f"{fmt_date(week_key)} to {fmt_date(week_end)}",
                    "date_from": week_key,
                    "date_to": week_end,
                    "opening_balance": r["opening_balance"],
                    "received_qntl": 0, "bags": 0, "entries_count": 0,
                    "total_paddy": 0, "milled_qntl": 0, "closing_balance": 0,
                }
            week_data["received_qntl"] = round(week_data["received_qntl"] + r["received_qntl"], 2)
            week_data["bags"] += r["bags"]
            week_data["entries_count"] += r["entries_count"]
            week_data["milled_qntl"] = round(week_data["milled_qntl"] + r["milled_qntl"], 2)
            week_data["total_paddy"] = round(week_data["opening_balance"] + week_data["received_qntl"], 2)
            week_data["closing_balance"] = round(week_data["total_paddy"] - week_data["milled_qntl"], 2)
        if week_data:
            weekly_rows.append(week_data)
        # Clean internal keys
        for wr in weekly_rows:
            wr.pop("_week_key", None)
        rows = weekly_rows

    return {
        "rows": rows,
        "summary": {
            "total_received": round(total_received, 2),
            "total_milled": round(total_milled, 2),
            "final_balance": round(opening_balance, 2),
            "total_days": len(rows)
        }
    }


@router.get("/govt-registers/form-a/excel")
async def export_form_a_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                               date_from: Optional[str] = None, date_to: Optional[str] = None,
                               group_by: Optional[str] = "daily"):
    data = await get_form_a(kms_year, season, date_from, date_to, group_by)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "Form A"

    headers = ["Date", "Opening Bal (Qtl)", "Paddy Received (Qtl)", "Bags", "Total Paddy (Qtl)", "Paddy Milled (Qtl)", "Closing Bal (Qtl)"]
    col_widths = [28 if group_by == "weekly" else 14, 18, 20, 10, 18, 20, 18]
    data_rows = []
    for r in data["rows"]:
        date_val = r["date"] if group_by == "weekly" else fmt_date(r["date"])
        data_rows.append([
            date_val, r["opening_balance"], r["received_qntl"],
            r["bags"], r["total_paddy"], r["milled_qntl"], r["closing_balance"]
        ])

    # Total row
    s = data["summary"]
    data_rows.append(["TOTAL", "", s["total_received"], "", "", s["total_milled"], s["final_balance"]])

    style_govt_excel(ws, "Form A - Paddy Stock Register", headers, data_rows, col_widths,
                     company, f"Form A - Paddy Received from State Procuring Agency | {kms_year or 'All'} {season or ''}")

    # Bold total row
    total_row_num = len(data_rows) + 3
    for ci in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row_num, column=ci)
        cell.font = total_font
        cell.fill = total_fill

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"Form_A_Paddy_Register_{kms_year or 'all'}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


# ============ FORM B: CMR Produced and Delivered ============

@router.get("/govt-registers/form-b")
async def get_form_b(kms_year: Optional[str] = None, season: Optional[str] = None,
                     date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Form B - CMR produced and delivered to OSCSC/State Agency."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q

    # Milling entries = CMR production
    milling = await db.milling_entries.find(query, {"_id": 0, "date": 1, "cmr_delivery_qntl": 1, "rice_qntl": 1,
                                                     "rice_type": 1, "outturn_ratio": 1, "paddy_input_qntl": 1}).sort("date", 1).to_list(50000)

    # Sale book = CMR delivery
    sale_entries = await db.salebook.find(query, {"_id": 0, "date": 1, "items": 1, "party_name": 1}).sort("date", 1).to_list(50000)

    daily_produced = {}
    for m in milling:
        d = m.get("date", "")
        if not d:
            continue
        if d not in daily_produced:
            daily_produced[d] = {"cmr_qntl": 0, "paddy_qntl": 0}
        daily_produced[d]["cmr_qntl"] += float(m.get("cmr_delivery_qntl", 0) or m.get("rice_qntl", 0) or 0)
        daily_produced[d]["paddy_qntl"] += float(m.get("paddy_input_qntl", 0) or 0)

    daily_delivered = {}
    for s in sale_entries:
        d = s.get("date", "")
        if not d:
            continue
        if d not in daily_delivered:
            daily_delivered[d] = {"delivered_qntl": 0, "parties": []}
        total_qty = sum(float(it.get("quantity", 0) or 0) for it in s.get("items", []))
        daily_delivered[d]["delivered_qntl"] += total_qty / 100  # KG to QNTL
        party = s.get("party_name", "")
        if party and party not in daily_delivered[d]["parties"]:
            daily_delivered[d]["parties"].append(party)

    all_dates = sorted(set(list(daily_produced.keys()) + list(daily_delivered.keys())))
    rows = []
    opening_balance = 0
    total_produced = 0
    total_delivered = 0

    for d in all_dates:
        produced = round(daily_produced.get(d, {}).get("cmr_qntl", 0), 2)
        delivered = round(daily_delivered.get(d, {}).get("delivered_qntl", 0), 2)
        parties = daily_delivered.get(d, {}).get("parties", [])
        total_rice = round(opening_balance + produced, 2)
        closing = round(total_rice - delivered, 2)

        total_produced += produced
        total_delivered += delivered

        rows.append({
            "date": d,
            "opening_balance": round(opening_balance, 2),
            "cmr_produced": produced,
            "total_rice": total_rice,
            "cmr_delivered": delivered,
            "closing_balance": closing,
            "delivered_to": ", ".join(parties) if parties else "-",
        })
        opening_balance = closing

    return {
        "rows": rows,
        "summary": {
            "total_produced": round(total_produced, 2),
            "total_delivered": round(total_delivered, 2),
            "final_balance": round(opening_balance, 2),
        }
    }


@router.get("/govt-registers/form-b/excel")
async def export_form_b_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                               date_from: Optional[str] = None, date_to: Optional[str] = None):
    data = await get_form_b(kms_year, season, date_from, date_to)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "Form B"

    headers = ["Date", "Opening Bal (Qtl)", "CMR Produced (Qtl)", "Total Rice (Qtl)", "CMR Delivered (Qtl)", "Closing Bal (Qtl)", "Delivered To"]
    col_widths = [14, 18, 20, 18, 20, 18, 30]
    data_rows = []
    for r in data["rows"]:
        data_rows.append([
            fmt_date(r["date"]), r["opening_balance"], r["cmr_produced"],
            r["total_rice"], r["cmr_delivered"], r["closing_balance"], r["delivered_to"]
        ])
    s = data["summary"]
    data_rows.append(["TOTAL", "", s["total_produced"], "", s["total_delivered"], s["final_balance"], ""])

    style_govt_excel(ws, "Form B - CMR Register", headers, data_rows, col_widths,
                     company, f"Form B - Custom Milled Rice Produced & Delivered | {kms_year or 'All'} {season or ''}")

    total_row_num = len(data_rows) + 3
    for ci in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row_num, column=ci)
        cell.font = total_font
        cell.fill = total_fill

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"Form_B_CMR_Register_{kms_year or 'all'}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


# ============ FORM E: Miller's Own Paddy ============

@router.get("/govt-registers/form-e")
async def get_form_e(kms_year: Optional[str] = None, season: Optional[str] = None,
                     date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Form E - Miller's own paddy purchases, milling and stock."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q

    # Private paddy purchases
    purchases = await db.private_paddy.find(query, {"_id": 0, "date": 1, "party_name": 1,
                                                     "kg": 1, "bag": 1, "rate_per_qntl": 1, "amount": 1}).sort("date", 1).to_list(50000)

    daily_data = {}
    for p in purchases:
        d = p.get("date", "")
        if not d:
            continue
        if d not in daily_data:
            daily_data[d] = {"purchased_qntl": 0, "bags": 0, "parties": [], "amount": 0}
        kg = float(p.get("kg", 0) or 0)
        daily_data[d]["purchased_qntl"] += kg / 100
        daily_data[d]["bags"] += int(p.get("bag", 0) or 0)
        daily_data[d]["amount"] += float(p.get("amount", 0) or 0)
        party = p.get("party_name", "")
        if party and party not in daily_data[d]["parties"]:
            daily_data[d]["parties"].append(party)

    all_dates = sorted(daily_data.keys())
    rows = []
    opening_balance = 0
    total_purchased = 0

    for d in all_dates:
        purchased = round(daily_data[d]["purchased_qntl"], 2)
        bags = daily_data[d]["bags"]
        parties = daily_data[d]["parties"]
        amount = round(daily_data[d]["amount"], 2)
        total = round(opening_balance + purchased, 2)

        total_purchased += purchased
        rows.append({
            "date": d,
            "opening_balance": round(opening_balance, 2),
            "purchased_qntl": purchased,
            "bags": bags,
            "total": total,
            "closing_balance": total,
            "parties": ", ".join(parties) if parties else "-",
            "amount": amount,
        })
        opening_balance = total

    return {
        "rows": rows,
        "summary": {
            "total_purchased": round(total_purchased, 2),
            "final_balance": round(opening_balance, 2),
        }
    }


@router.get("/govt-registers/form-e/excel")
async def export_form_e_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                               date_from: Optional[str] = None, date_to: Optional[str] = None):
    data = await get_form_e(kms_year, season, date_from, date_to)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "Form E"

    headers = ["Date", "Opening Bal (Qtl)", "Paddy Purchased (Qtl)", "Bags", "Total (Qtl)", "Closing Bal (Qtl)", "Party Name", "Amount (Rs)"]
    col_widths = [14, 18, 22, 10, 15, 18, 28, 16]
    data_rows = []
    for r in data["rows"]:
        data_rows.append([
            fmt_date(r["date"]), r["opening_balance"], r["purchased_qntl"],
            r["bags"], r["total"], r["closing_balance"], r["parties"], r["amount"]
        ])
    s = data["summary"]
    data_rows.append(["TOTAL", "", s["total_purchased"], "", "", s["final_balance"], "", ""])

    style_govt_excel(ws, "Form E - Miller's Own Paddy", headers, data_rows, col_widths,
                     company, f"Form E - Miller's Own Paddy Purchase & Stock | {kms_year or 'All'} {season or ''}")

    total_row_num = len(data_rows) + 3
    for ci in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row_num, column=ci)
        cell.font = total_font
        cell.fill = total_fill

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=Form_E_Miller_Paddy_{kms_year or 'all'}.xlsx"})


# ============ FORM F: Miller's Own Rice Sale ============

@router.get("/govt-registers/form-f")
async def get_form_f(kms_year: Optional[str] = None, season: Optional[str] = None,
                     date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Form F - Miller's own rice produced and sold."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q

    # Private rice sales
    sales = await db.private_rice_sales.find(query, {"_id": 0, "date": 1, "party_name": 1,
                                                      "quantity_qntl": 1, "rate": 1, "amount": 1}).sort("date", 1).to_list(50000)

    # Also get from salebook (private sales)
    sale_vouchers = await db.salebook.find(query, {"_id": 0, "date": 1, "party_name": 1, "items": 1, "total": 1}).sort("date", 1).to_list(50000)

    daily_data = {}
    for s in sales:
        d = s.get("date", "")
        if not d:
            continue
        if d not in daily_data:
            daily_data[d] = {"sold_qntl": 0, "parties": [], "amount": 0}
        daily_data[d]["sold_qntl"] += float(s.get("quantity_qntl", 0) or 0)
        daily_data[d]["amount"] += float(s.get("amount", 0) or 0)
        party = s.get("party_name", "")
        if party and party not in daily_data[d]["parties"]:
            daily_data[d]["parties"].append(party)

    for sv in sale_vouchers:
        d = sv.get("date", "")
        if not d:
            continue
        if d not in daily_data:
            daily_data[d] = {"sold_qntl": 0, "parties": [], "amount": 0}
        total_qty = sum(float(it.get("quantity", 0) or 0) for it in sv.get("items", []))
        daily_data[d]["sold_qntl"] += total_qty / 100
        daily_data[d]["amount"] += float(sv.get("total", 0) or 0)
        party = sv.get("party_name", "")
        if party and party not in daily_data[d]["parties"]:
            daily_data[d]["parties"].append(party)

    all_dates = sorted(daily_data.keys())
    rows = []
    total_sold = 0

    for d in all_dates:
        sold = round(daily_data[d]["sold_qntl"], 2)
        parties = daily_data[d]["parties"]
        amount = round(daily_data[d]["amount"], 2)
        total_sold += sold
        rows.append({
            "date": d,
            "sold_qntl": sold,
            "parties": ", ".join(parties) if parties else "-",
            "amount": amount,
        })

    return {
        "rows": rows,
        "summary": {"total_sold": round(total_sold, 2)}
    }


@router.get("/govt-registers/form-f/excel")
async def export_form_f_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                               date_from: Optional[str] = None, date_to: Optional[str] = None):
    data = await get_form_f(kms_year, season, date_from, date_to)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "Form F"

    headers = ["Date", "Rice Sold (Qtl)", "Party Name", "Amount (Rs)"]
    col_widths = [14, 20, 30, 18]
    data_rows = []
    for r in data["rows"]:
        data_rows.append([fmt_date(r["date"]), r["sold_qntl"], r["parties"], r["amount"]])
    data_rows.append(["TOTAL", data["summary"]["total_sold"], "", ""])

    style_govt_excel(ws, "Form F - Miller's Own Rice Sale", headers, data_rows, col_widths,
                     company, f"Form F - Miller's Own Rice Produced & Sold | {kms_year or 'All'} {season or ''}")

    total_row_num = len(data_rows) + 3
    for ci in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row_num, column=ci)
        cell.font = total_font
        cell.fill = total_fill

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=Form_F_Miller_Rice_{kms_year or 'all'}.xlsx"})


# ============ FRK BLENDING REGISTER ============

@router.get("/govt-registers/frk")
async def get_frk_entries(kms_year: Optional[str] = None, season: Optional[str] = None,
                          date_from: Optional[str] = None, date_to: Optional[str] = None):
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q
    entries = await db.frk_register.find(query, {"_id": 0}).sort("date", 1).to_list(50000)
    return entries


@router.post("/govt-registers/frk")
async def create_frk_entry(data: dict, username: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "date": data.get("date", ""),
        "kms_year": data.get("kms_year", ""),
        "season": data.get("season", ""),
        "batch_no": data.get("batch_no", ""),
        "supplier": data.get("supplier", ""),
        "opening_balance": float(data.get("opening_balance", 0) or 0),
        "received_qty": float(data.get("received_qty", 0) or 0),
        "issued_for_blending": float(data.get("issued_for_blending", 0) or 0),
        "closing_balance": float(data.get("opening_balance", 0) or 0) + float(data.get("received_qty", 0) or 0) - float(data.get("issued_for_blending", 0) or 0),
        "rice_blended_qty": float(data.get("rice_blended_qty", 0) or 0),
        "blend_ratio": data.get("blend_ratio", "1:100"),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    doc["total"] = round(doc["opening_balance"] + doc["received_qty"], 2)
    doc["closing_balance"] = round(doc["total"] - doc["issued_for_blending"], 2)
    await db.frk_register.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/govt-registers/frk/{entry_id}")
async def update_frk_entry(entry_id: str, data: dict, username: str = ""):
    existing = await db.frk_register.find_one({"id": entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="FRK entry not found")
    update_data = {
        "date": data.get("date", existing.get("date", "")),
        "batch_no": data.get("batch_no", existing.get("batch_no", "")),
        "supplier": data.get("supplier", existing.get("supplier", "")),
        "opening_balance": float(data.get("opening_balance", existing.get("opening_balance", 0)) or 0),
        "received_qty": float(data.get("received_qty", existing.get("received_qty", 0)) or 0),
        "issued_for_blending": float(data.get("issued_for_blending", existing.get("issued_for_blending", 0)) or 0),
        "rice_blended_qty": float(data.get("rice_blended_qty", existing.get("rice_blended_qty", 0)) or 0),
        "blend_ratio": data.get("blend_ratio", existing.get("blend_ratio", "1:100")),
        "remark": data.get("remark", existing.get("remark", "")),
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    update_data["total"] = round(update_data["opening_balance"] + update_data["received_qty"], 2)
    update_data["closing_balance"] = round(update_data["total"] - update_data["issued_for_blending"], 2)
    await db.frk_register.update_one({"id": entry_id}, {"$set": update_data})
    return {"success": True}


@router.delete("/govt-registers/frk/{entry_id}")
async def delete_frk_entry(entry_id: str, username: str = "", role: str = ""):
    result = await db.frk_register.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="FRK entry not found")
    return {"success": True}


@router.get("/govt-registers/frk/excel")
async def export_frk_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                            date_from: Optional[str] = None, date_to: Optional[str] = None):
    entries = await get_frk_entries(kms_year, season, date_from, date_to)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "FRK Register"

    headers = ["Date", "Batch No", "Supplier", "Opening Bal (Kg)", "Received (Kg)", "Total (Kg)", "Issued for Blending (Kg)", "Closing Bal (Kg)", "Rice Blended (Qtl)", "Ratio", "Remarks"]
    col_widths = [14, 16, 22, 18, 15, 15, 22, 18, 18, 10, 20]
    data_rows = []
    for e in entries:
        data_rows.append([
            fmt_date(e.get("date", "")), e.get("batch_no", ""), e.get("supplier", ""),
            e.get("opening_balance", 0), e.get("received_qty", 0), e.get("total", 0),
            e.get("issued_for_blending", 0), e.get("closing_balance", 0),
            e.get("rice_blended_qty", 0), e.get("blend_ratio", ""), e.get("remark", "")
        ])

    style_govt_excel(ws, "FRK Blending Register", headers, data_rows, col_widths,
                     company, f"Fortified Rice Kernel (FRK) Blending Register | {kms_year or 'All'} {season or ''}")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=FRK_Register_{kms_year or 'all'}.xlsx"})


# ============ GUNNY BAG REGISTER ============

@router.get("/govt-registers/gunny-bags")
async def get_gunny_bag_entries(kms_year: Optional[str] = None, season: Optional[str] = None,
                                 date_from: Optional[str] = None, date_to: Optional[str] = None):
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q
    entries = await db.gunny_bag_register.find(query, {"_id": 0}).sort("date", 1).to_list(50000)
    return entries


@router.post("/govt-registers/gunny-bags")
async def create_gunny_bag_entry(data: dict, username: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "date": data.get("date", ""),
        "kms_year": data.get("kms_year", ""),
        "season": data.get("season", ""),
        "bag_type": data.get("bag_type", "new"),  # new, old, plastic
        "source": data.get("source", ""),  # OSCSC, Purchase, Return
        "opening_balance": int(data.get("opening_balance", 0) or 0),
        "received": int(data.get("received", 0) or 0),
        "used_for_rice": int(data.get("used_for_rice", 0) or 0),
        "used_for_paddy": int(data.get("used_for_paddy", 0) or 0),
        "damaged": int(data.get("damaged", 0) or 0),
        "returned": int(data.get("returned", 0) or 0),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    total_in = doc["opening_balance"] + doc["received"]
    total_out = doc["used_for_rice"] + doc["used_for_paddy"] + doc["damaged"] + doc["returned"]
    doc["closing_balance"] = total_in - total_out
    await db.gunny_bag_register.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/govt-registers/gunny-bags/{entry_id}")
async def update_gunny_bag_entry(entry_id: str, data: dict, username: str = ""):
    existing = await db.gunny_bag_register.find_one({"id": entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Gunny bag entry not found")
    update_data = {
        "date": data.get("date", existing.get("date", "")),
        "bag_type": data.get("bag_type", existing.get("bag_type", "new")),
        "source": data.get("source", existing.get("source", "")),
        "opening_balance": int(data.get("opening_balance", existing.get("opening_balance", 0)) or 0),
        "received": int(data.get("received", existing.get("received", 0)) or 0),
        "used_for_rice": int(data.get("used_for_rice", existing.get("used_for_rice", 0)) or 0),
        "used_for_paddy": int(data.get("used_for_paddy", existing.get("used_for_paddy", 0)) or 0),
        "damaged": int(data.get("damaged", existing.get("damaged", 0)) or 0),
        "returned": int(data.get("returned", existing.get("returned", 0)) or 0),
        "remark": data.get("remark", existing.get("remark", "")),
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    total_in = update_data["opening_balance"] + update_data["received"]
    total_out = update_data["used_for_rice"] + update_data["used_for_paddy"] + update_data["damaged"] + update_data["returned"]
    update_data["closing_balance"] = total_in - total_out
    await db.gunny_bag_register.update_one({"id": entry_id}, {"$set": update_data})
    return {"success": True}


@router.delete("/govt-registers/gunny-bags/{entry_id}")
async def delete_gunny_bag_entry(entry_id: str, username: str = "", role: str = ""):
    result = await db.gunny_bag_register.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gunny bag entry not found")
    return {"success": True}


@router.get("/govt-registers/gunny-bags/excel")
async def export_gunny_bags_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                                    date_from: Optional[str] = None, date_to: Optional[str] = None):
    entries = await get_gunny_bag_entries(kms_year, season, date_from, date_to)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "Gunny Bag Register"

    headers = ["Date", "Bag Type", "Source", "Opening Bal", "Received", "Used (Rice)", "Used (Paddy)", "Damaged", "Returned", "Closing Bal", "Remarks"]
    col_widths = [14, 14, 18, 14, 12, 14, 14, 12, 12, 14, 20]
    data_rows = []
    for e in entries:
        data_rows.append([
            fmt_date(e.get("date", "")), e.get("bag_type", ""), e.get("source", ""),
            e.get("opening_balance", 0), e.get("received", 0),
            e.get("used_for_rice", 0), e.get("used_for_paddy", 0),
            e.get("damaged", 0), e.get("returned", 0),
            e.get("closing_balance", 0), e.get("remark", "")
        ])

    style_govt_excel(ws, "Gunny Bag Stock Register", headers, data_rows, col_widths,
                     company, f"Gunny Bag Stock Register | {kms_year or 'All'} {season or ''}")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=Gunny_Bag_Register_{kms_year or 'all'}.xlsx"})


# ============ TRANSIT PASS REGISTER (Auto-generated from Mill Entries) ============

@router.get("/govt-registers/transit-pass")
async def get_transit_pass_register(kms_year: Optional[str] = None, season: Optional[str] = None,
                                     date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Transit Pass Register - auto-generated from mill_entries where tp_no exists."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q

    # Only entries with TP number
    query["tp_no"] = {"$ne": "", "$exists": True}

    entries = await db.mill_entries.find(query, {
        "_id": 0, "date": 1, "tp_no": 1, "truck_no": 1, "agent_name": 1,
        "mandi_name": 1, "kg": 1, "bag": 1, "final_w": 1, "rst_no": 1,
        "tp_weight": 1, "remark": 1, "created_at": 1
    }).sort("date", 1).to_list(50000)

    rows = []
    total_qty = 0
    total_bags = 0
    total_tp_weight = 0
    for e in entries:
        tp_no = str(e.get("tp_no", "")).strip()
        if not tp_no:
            continue
        final_w = float(e.get("final_w", 0) or 0) / 100  # final_w stored in KG, convert to QNTL
        if final_w == 0:
            final_w = float(e.get("kg", 0) or 0) / 100
        bags = int(e.get("bag", 0) or 0)
        tp_wt = round(float(e.get("tp_weight", 0) or 0), 2)
        total_qty += final_w
        total_bags += bags
        total_tp_weight += tp_wt
        rows.append({
            "date": e.get("date", ""),
            "tp_no": tp_no,
            "rst_no": str(e.get("rst_no", "")),
            "truck_no": e.get("truck_no", ""),
            "agent_name": e.get("agent_name", ""),
            "mandi_name": e.get("mandi_name", ""),
            "qty_qntl": round(final_w, 2),
            "tp_weight": tp_wt,
            "bags": bags,
            "status": "Accepted",
            "remark": e.get("remark", ""),
        })

    return {
        "rows": rows,
        "summary": {
            "total_entries": len(rows),
            "total_qty": round(total_qty, 2),
            "total_tp_weight": round(total_tp_weight, 2),
            "total_bags": total_bags,
        }
    }


@router.get("/govt-registers/transit-pass/excel")
async def export_transit_pass_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                                     date_from: Optional[str] = None, date_to: Optional[str] = None):
    data = await get_transit_pass_register(kms_year, season, date_from, date_to)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "Transit Pass"

    headers = ["Date", "TP No.", "RST No.", "Vehicle No.", "Agent/Society", "Mandi/PPC", "Qty (Qtl)", "TP Weight", "Bags", "Status", "Remarks"]
    col_widths = [14, 14, 12, 16, 22, 20, 14, 14, 10, 12, 20]
    data_rows = []
    for r in data["rows"]:
        data_rows.append([
            fmt_date(r["date"]), r["tp_no"], r["rst_no"], r["truck_no"],
            r["agent_name"], r["mandi_name"], r["qty_qntl"], r["tp_weight"],
            r["bags"], r["status"], r["remark"]
        ])
    s = data["summary"]
    data_rows.append(["TOTAL", f'{s["total_entries"]} entries', "", "", "", "", s["total_qty"], "", s["total_bags"], "", ""])

    style_govt_excel(ws, "Transit Pass Register", headers, data_rows, col_widths,
                     company, f"Transit Pass-cum-Acceptance Register | {kms_year or 'All'} {season or ''}")

    total_row_num = len(data_rows) + 3
    for ci in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row_num, column=ci)
        cell.font = total_font
        cell.fill = total_fill

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=Transit_Pass_Register_{kms_year or 'all'}.xlsx"})


# ============ CMR DELIVERY TRACKER WITH OTR ============

@router.get("/govt-registers/cmr-delivery")
async def get_cmr_deliveries(kms_year: Optional[str] = None, season: Optional[str] = None,
                              date_from: Optional[str] = None, date_to: Optional[str] = None):
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    date_q = {}
    if date_from:
        date_q["$gte"] = date_from
    if date_to:
        date_q["$lte"] = date_to
    if date_q:
        query["date"] = date_q

    entries = await db.cmr_deliveries.find(query, {"_id": 0}).sort("date", 1).to_list(50000)

    # Get total paddy received for OTR calculation
    paddy_query = {}
    if kms_year:
        paddy_query["kms_year"] = kms_year
    if season:
        paddy_query["season"] = season
    paddy_pipeline = [
        {"$match": paddy_query},
        {"$group": {"_id": None, "total_paddy": {"$sum": "$final_w"}}}
    ]
    paddy_result = await db.mill_entries.aggregate(paddy_pipeline).to_list(1)
    total_paddy = (paddy_result[0]["total_paddy"] if paddy_result else 0) / 100  # final_w is KG, convert to QNTL

    total_cmr = sum(float(e.get("cmr_qty", 0) or 0) for e in entries)
    otr = round((total_cmr / total_paddy * 100), 2) if total_paddy > 0 else 0

    return {
        "entries": entries,
        "summary": {
            "total_cmr_delivered": round(total_cmr, 2),
            "total_paddy_received": round(total_paddy, 2),
            "outturn_ratio": otr,
            "total_deliveries": len(entries),
            "total_bags": sum(int(e.get("bags", 0) or 0) for e in entries),
        }
    }


@router.post("/govt-registers/cmr-delivery")
async def create_cmr_delivery(data: dict, username: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "date": data.get("date", ""),
        "kms_year": data.get("kms_year", ""),
        "season": data.get("season", ""),
        "delivery_no": data.get("delivery_no", ""),
        "rrc_depot": data.get("rrc_depot", ""),
        "rice_type": data.get("rice_type", "Parboiled"),
        "cmr_qty": float(data.get("cmr_qty", 0) or 0),
        "bags": int(data.get("bags", 0) or 0),
        "vehicle_no": data.get("vehicle_no", ""),
        "driver_name": data.get("driver_name", ""),
        "fortified": data.get("fortified", True),
        "gate_pass_no": data.get("gate_pass_no", ""),
        "quality_grade": data.get("quality_grade", "FAQ"),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cmr_deliveries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/govt-registers/cmr-delivery/{entry_id}")
async def update_cmr_delivery(entry_id: str, data: dict, username: str = ""):
    existing = await db.cmr_deliveries.find_one({"id": entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="CMR delivery not found")
    update_data = {
        "date": data.get("date", existing.get("date", "")),
        "delivery_no": data.get("delivery_no", existing.get("delivery_no", "")),
        "rrc_depot": data.get("rrc_depot", existing.get("rrc_depot", "")),
        "rice_type": data.get("rice_type", existing.get("rice_type", "")),
        "cmr_qty": float(data.get("cmr_qty", existing.get("cmr_qty", 0)) or 0),
        "bags": int(data.get("bags", existing.get("bags", 0)) or 0),
        "vehicle_no": data.get("vehicle_no", existing.get("vehicle_no", "")),
        "driver_name": data.get("driver_name", existing.get("driver_name", "")),
        "fortified": data.get("fortified", existing.get("fortified", True)),
        "gate_pass_no": data.get("gate_pass_no", existing.get("gate_pass_no", "")),
        "quality_grade": data.get("quality_grade", existing.get("quality_grade", "")),
        "remark": data.get("remark", existing.get("remark", "")),
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cmr_deliveries.update_one({"id": entry_id}, {"$set": update_data})
    return {"success": True}


@router.delete("/govt-registers/cmr-delivery/{entry_id}")
async def delete_cmr_delivery(entry_id: str, username: str = "", role: str = ""):
    result = await db.cmr_deliveries.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="CMR delivery not found")
    return {"success": True}


@router.get("/govt-registers/cmr-delivery/excel")
async def export_cmr_delivery_excel(kms_year: Optional[str] = None, season: Optional[str] = None,
                                     date_from: Optional[str] = None, date_to: Optional[str] = None):
    data = await get_cmr_deliveries(kms_year, season, date_from, date_to)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "CMR Delivery"

    headers = ["Date", "Delivery No.", "RRC/Depot", "Rice Type", "CMR Qty (Qtl)", "Bags", "Vehicle No.", "Fortified", "Grade", "Remarks"]
    col_widths = [14, 16, 22, 16, 18, 10, 16, 12, 10, 20]
    data_rows = []
    for e in data["entries"]:
        data_rows.append([
            fmt_date(e.get("date", "")), e.get("delivery_no", ""), e.get("rrc_depot", ""),
            e.get("rice_type", ""), e.get("cmr_qty", 0), e.get("bags", 0),
            e.get("vehicle_no", ""), "Yes (+F)" if e.get("fortified") else "No",
            e.get("quality_grade", ""), e.get("remark", "")
        ])
    s = data["summary"]
    data_rows.append(["TOTAL", f'{s["total_deliveries"]} deliveries', "", "", s["total_cmr_delivered"], s["total_bags"], "", "", f'OTR: {s["outturn_ratio"]}%', ""])

    style_govt_excel(ws, "CMR Delivery Tracker", headers, data_rows, col_widths,
                     company, f"CMR Delivery Register with OTR | {kms_year or 'All'} {season or ''} | OTR: {s['outturn_ratio']}%")

    total_row_num = len(data_rows) + 3
    for ci in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row_num, column=ci)
        cell.font = total_font
        cell.fill = total_fill

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=CMR_Delivery_{kms_year or 'all'}.xlsx"})


# ============ SECURITY DEPOSIT MANAGEMENT ============

@router.get("/govt-registers/security-deposit")
async def get_security_deposits(kms_year: Optional[str] = None):
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    entries = await db.security_deposits.find(query, {"_id": 0}).sort("issue_date", -1).to_list(50000)
    # Auto-check expiry status
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for e in entries:
        if e.get("status") == "active" and e.get("expiry_date", "") < today and e.get("expiry_date", ""):
            e["status"] = "expired"
    total_amount = sum(float(e.get("amount", 0) or 0) for e in entries if e.get("status") in ("active", None))
    return {
        "entries": entries,
        "summary": {
            "total_deposits": len(entries),
            "active_count": sum(1 for e in entries if e.get("status") == "active"),
            "total_active_amount": round(total_amount, 2),
            "released_count": sum(1 for e in entries if e.get("status") == "released"),
            "expired_count": sum(1 for e in entries if e.get("status") == "expired"),
        }
    }


@router.post("/govt-registers/security-deposit")
async def create_security_deposit(data: dict, username: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "kms_year": data.get("kms_year", ""),
        "bg_number": data.get("bg_number", ""),
        "bank_name": data.get("bank_name", ""),
        "amount": float(data.get("amount", 0) or 0),
        "sd_ratio": data.get("sd_ratio", "1:6"),
        "milling_capacity_mt": float(data.get("milling_capacity_mt", 0) or 0),
        "issue_date": data.get("issue_date", ""),
        "expiry_date": data.get("expiry_date", ""),
        "status": data.get("status", "active"),
        "miller_type": data.get("miller_type", "regular"),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.security_deposits.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/govt-registers/security-deposit/{entry_id}")
async def update_security_deposit(entry_id: str, data: dict, username: str = ""):
    existing = await db.security_deposits.find_one({"id": entry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Security deposit not found")
    update_data = {
        "bg_number": data.get("bg_number", existing.get("bg_number", "")),
        "bank_name": data.get("bank_name", existing.get("bank_name", "")),
        "amount": float(data.get("amount", existing.get("amount", 0)) or 0),
        "sd_ratio": data.get("sd_ratio", existing.get("sd_ratio", "")),
        "milling_capacity_mt": float(data.get("milling_capacity_mt", existing.get("milling_capacity_mt", 0)) or 0),
        "issue_date": data.get("issue_date", existing.get("issue_date", "")),
        "expiry_date": data.get("expiry_date", existing.get("expiry_date", "")),
        "status": data.get("status", existing.get("status", "")),
        "miller_type": data.get("miller_type", existing.get("miller_type", "")),
        "remark": data.get("remark", existing.get("remark", "")),
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.security_deposits.update_one({"id": entry_id}, {"$set": update_data})
    return {"success": True}


@router.delete("/govt-registers/security-deposit/{entry_id}")
async def delete_security_deposit(entry_id: str, username: str = "", role: str = ""):
    result = await db.security_deposits.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Security deposit not found")
    return {"success": True}


@router.get("/govt-registers/security-deposit/excel")
async def export_security_deposit_excel(kms_year: Optional[str] = None):
    data = await get_security_deposits(kms_year)
    company, _ = await get_company_name()
    wb = Workbook()
    ws = wb.active
    ws.title = "Security Deposit"

    headers = ["BG Number", "Bank Name", "Amount (Rs)", "SD Ratio", "Capacity (MT)", "Issue Date", "Expiry Date", "Status", "Miller Type", "Remarks"]
    col_widths = [18, 24, 18, 12, 16, 14, 14, 14, 16, 20]
    data_rows = []
    for e in data["entries"]:
        data_rows.append([
            e.get("bg_number", ""), e.get("bank_name", ""), e.get("amount", 0),
            e.get("sd_ratio", ""), e.get("milling_capacity_mt", 0),
            fmt_date(e.get("issue_date", "")), fmt_date(e.get("expiry_date", "")),
            (e.get("status", "") or "").upper(), e.get("miller_type", ""), e.get("remark", "")
        ])
    s = data["summary"]
    data_rows.append([f'{s["total_deposits"]} total', "", s["total_active_amount"], "", "", "", "", f'Active: {s["active_count"]}', "", ""])

    style_govt_excel(ws, "Security Deposit Register", headers, data_rows, col_widths,
                     company, f"Security Deposit (Bank Guarantee) Register | {kms_year or 'All'}")

    total_row_num = len(data_rows) + 3
    for ci in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row_num, column=ci)
        cell.font = total_font
        cell.fill = total_fill

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=Security_Deposit_{kms_year or 'all'}.xlsx"})
