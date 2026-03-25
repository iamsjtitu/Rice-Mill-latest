from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone
from database import db
from pydantic import BaseModel, Field, ConfigDict
import uuid
import io

router = APIRouter()


# ============ MODELS ============

class HemaliItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    rate: float
    unit: str = "bag"
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============ HEMALI ITEMS (Rate Config) ============

@router.get("/hemali/items")
async def get_hemali_items():
    items = await db.hemali_items.find({"is_active": {"$ne": False}}, {"_id": 0}).to_list(500)
    return items


@router.post("/hemali/items")
async def add_hemali_item(request: Request):
    data = await request.json()
    name = (data.get("name") or "").strip()
    rate = data.get("rate")
    if not name or rate is None:
        raise HTTPException(status_code=400, detail="Name aur rate required")
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "rate": float(rate),
        "unit": data.get("unit", "bag"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.hemali_items.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/hemali/items/{item_id}")
async def update_hemali_item(item_id: str, request: Request):
    data = await request.json()
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "name" in data:
        update["name"] = data["name"]
    if "rate" in data:
        update["rate"] = float(data["rate"])
    if "unit" in data:
        update["unit"] = data["unit"]
    result = await db.hemali_items.update_one({"id": item_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    item = await db.hemali_items.find_one({"id": item_id}, {"_id": 0})
    return item


@router.delete("/hemali/items/{item_id}")
async def delete_hemali_item(item_id: str):
    result = await db.hemali_items.update_one({"id": item_id}, {"$set": {"is_active": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deactivated"}


# ============ ADVANCE BALANCE ============

async def get_advance_balance(sardar_name: str, kms_year: str = "", season: str = ""):
    query = {"sardar_name": sardar_name, "status": "paid"}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    payments = await db.hemali_payments.find(query, {"_id": 0, "new_advance": 1, "advance_deducted": 1}).to_list(10000)
    advance = 0
    for p in payments:
        advance += (p.get("new_advance") or 0) - (p.get("advance_deducted") or 0)
    return round(advance * 100) / 100


@router.get("/hemali/advance")
async def get_hemali_advance(sardar_name: str = "", kms_year: str = "", season: str = ""):
    if not sardar_name:
        return {"advance": 0}
    advance = await get_advance_balance(sardar_name, kms_year, season)
    return {"advance": advance, "sardar_name": sardar_name}


# ============ HEMALI PAYMENTS ============

@router.get("/hemali/payments")
async def get_hemali_payments(
    kms_year: str = "", season: str = "",
    from_date: str = "", to_date: str = "",
    sardar_name: str = ""
):
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if sardar_name:
        query["sardar_name"] = sardar_name
    if from_date or to_date:
        date_q = {}
        if from_date:
            date_q["$gte"] = from_date
        if to_date:
            date_q["$lte"] = to_date
        query["date"] = date_q

    payments = await db.hemali_payments.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    return payments


@router.post("/hemali/payments")
async def create_hemali_payment(request: Request):
    d = await request.json()
    sardar_name = (d.get("sardar_name") or "").strip()
    if not sardar_name:
        raise HTTPException(status_code=400, detail="Sardar name required")
    items = d.get("items") or []
    if not items:
        raise HTTPException(status_code=400, detail="Items select karein")

    total = round(sum((float(i.get("quantity") or 0)) * (float(i.get("rate") or 0)) for i in items), 2)
    kms_year = d.get("kms_year", "")
    season = d.get("season", "")
    prev_advance = await get_advance_balance(sardar_name, kms_year, season)
    advance_deducted = min(prev_advance, total)
    amount_payable = round(total - advance_deducted, 2)
    amount_paid = float(d.get("amount_paid") or amount_payable)
    new_advance = round(max(0, amount_paid - amount_payable), 2)

    now = datetime.now(timezone.utc).isoformat()
    payment_id = str(uuid.uuid4())
    created_by = d.get("created_by", "")

    payment = {
        "id": payment_id,
        "sardar_name": sardar_name,
        "date": d.get("date", now.split("T")[0]),
        "items": [
            {
                "item_name": i.get("item_name", ""),
                "rate": float(i.get("rate") or 0),
                "quantity": float(i.get("quantity") or 0),
                "amount": round(float(i.get("quantity") or 0) * float(i.get("rate") or 0), 2),
            }
            for i in items
        ],
        "total": total,
        "advance_before": prev_advance,
        "advance_deducted": advance_deducted,
        "amount_payable": amount_payable,
        "amount_paid": amount_paid,
        "new_advance": new_advance,
        "status": "unpaid",
        "kms_year": kms_year,
        "season": season,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }
    await db.hemali_payments.insert_one(payment)
    payment.pop("_id", None)

    # Create local_party_accounts debit entry on creation (so party is visible)
    items_desc = ", ".join(f"{i['item_name']} x{i['quantity']}" for i in payment["items"])
    await db.local_party_accounts.insert_one({
        "id": str(uuid.uuid4()),
        "date": payment["date"],
        "party_name": "Hemali Payment",
        "txn_type": "debit",
        "amount": total,
        "description": f"{sardar_name} - {items_desc} | Total: Rs.{total:.0f}",
        "reference": f"hemali_debit:{payment_id}",
        "source_type": "hemali",
        "kms_year": kms_year,
        "season": season,
        "created_by": created_by,
        "created_at": now,
    })

    return payment


async def _create_cash_entries(p, round_off=0):
    """Create cash book + ledger + local party entries for a paid hemali payment."""
    now = datetime.now(timezone.utc).isoformat()
    pid = p["id"]
    sardar = p["sardar_name"]
    items_desc = ", ".join(f"{i['item_name']} x{i['quantity']}" for i in p.get("items", []))
    total_settled = round(p.get("amount_paid", 0) + round_off, 2)
    base = {
        "kms_year": p.get("kms_year", ""), "season": p.get("season", ""),
        "created_by": p.get("created_by", ""), "created_at": now, "updated_at": now,
    }

    # 1. Cash Book: Nikasi (cash going out) - actual cash amount
    await db.cash_transactions.insert_one({
        "id": str(uuid.uuid4()), "date": p["date"], "account": "cash", "txn_type": "nikasi",
        "amount": p["amount_paid"], "category": "Hemali Payment", "party_type": "Hemali",
        "description": f"Hemali: {sardar} - {items_desc}",
        "reference": f"hemali_payment:{pid}", **base,
    })

    # 2. Ledger: Jama (work amount) - shows in Party Ledger tab
    await db.cash_transactions.insert_one({
        "id": str(uuid.uuid4()), "date": p["date"], "account": "ledger", "txn_type": "jama",
        "amount": p.get("total", 0), "category": "Hemali Payment", "party_type": "Hemali",
        "description": f"{sardar} - {items_desc} | Total: Rs.{p.get('total',0):.0f}",
        "reference": f"hemali_work:{pid}", **base,
    })

    # 3. Ledger: Nikasi (payment) - includes round off for correct balance
    adv_info = ""
    if p.get("advance_deducted", 0) > 0:
        adv_info += f" | Adv Deducted: Rs.{p['advance_deducted']:.0f}"
    if p.get("new_advance", 0) > 0:
        adv_info += f" | New Advance: Rs.{p['new_advance']:.0f}"
    await db.cash_transactions.insert_one({
        "id": str(uuid.uuid4()), "date": p["date"], "account": "ledger", "txn_type": "nikasi",
        "amount": total_settled, "category": "Hemali Payment", "party_type": "Hemali",
        "description": f"{sardar} - Paid Rs.{total_settled:.0f}{adv_info}" + (f" (Cash: {p.get('amount_paid',0):.0f}, RoundOff: {round_off})" if round_off else ""),
        "reference": f"hemali_paid:{pid}", **base,
    })

    # 4. Local Party: payment entry with total (includes round off)
    await db.local_party_accounts.update_one(
        {"reference": f"hemali_debit:{pid}"},
        {"$set": {
            "amount": p.get("total", 0),
            "description": f"{sardar} - {items_desc} | Total: Rs.{p.get('total',0):.0f}",
        }}
    )
    await db.local_party_accounts.insert_one({
        "id": str(uuid.uuid4()), "date": p["date"],
        "party_name": "Hemali Payment", "txn_type": "payment",
        "amount": total_settled,
        "description": f"{sardar} - Paid Rs.{total_settled:.0f}{adv_info}",
        "reference": f"hemali_paid:{pid}", "source_type": "hemali",
        **{k: base[k] for k in ("kms_year", "season", "created_by", "created_at")},
    })


async def _remove_cash_entries(payment_id):
    """Remove cashbook + ledger + local party PAYMENT entries (undo). Keeps debit entry."""
    await db.cash_transactions.delete_many({
        "reference": {"$in": [
            f"hemali_payment:{payment_id}",
            f"hemali_work:{payment_id}",
            f"hemali_paid:{payment_id}",
        ]}
    })
    # Only remove payment entry, keep debit (it was created on payment creation)
    await db.local_party_accounts.delete_many({
        "reference": f"hemali_paid:{payment_id}"
    })


# ============ MARK PAID ============

@router.put("/hemali/payments/{payment_id}/mark-paid")
async def mark_hemali_paid(payment_id: str, request: Request):
    p = await db.hemali_payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Payment already paid")

    d = await request.json() if request.headers.get("content-type") == "application/json" else {}
    amount_paid = float(d.get("amount_paid") or p.get("amount_paid") or p.get("amount_payable", 0))
    new_advance = round(max(0, amount_paid - p.get("amount_payable", 0)), 2)
    round_off = float(d.get("round_off") or 0)

    await db.hemali_payments.update_one(
        {"id": payment_id},
        {"$set": {
            "status": "paid",
            "amount_paid": amount_paid,
            "new_advance": new_advance,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.hemali_payments.find_one({"id": payment_id}, {"_id": 0})
    await _create_cash_entries(updated, round_off=round_off)

    return {"message": "Payment marked as paid", "id": payment_id, "amount_paid": amount_paid, "new_advance": new_advance}


# ============ UNDO PAYMENT ============

@router.put("/hemali/payments/{payment_id}/undo")
async def undo_hemali_payment(payment_id: str):
    p = await db.hemali_payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.get("status") != "paid":
        raise HTTPException(status_code=400, detail="Payment already unpaid")

    await db.hemali_payments.update_one(
        {"id": payment_id},
        {"$set": {"status": "unpaid", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await _remove_cash_entries(payment_id)
    return {"message": "Payment undone", "id": payment_id}


@router.put("/hemali/payments/{payment_id}")
async def update_hemali_payment(payment_id: str, request: Request):
    """Edit an unpaid hemali payment (items, sardar, date etc.)"""
    p = await db.hemali_payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Paid payment edit nahi ho sakti. Pehle undo karein.")

    d = await request.json()
    sardar_name = (d.get("sardar_name") or p.get("sardar_name", "")).strip()
    items = d.get("items") or p.get("items", [])
    date_val = d.get("date") or p.get("date", "")
    kms_year = d.get("kms_year") or p.get("kms_year", "")
    season = d.get("season") or p.get("season", "")

    total = round(sum((float(i.get("quantity") or 0)) * (float(i.get("rate") or 0)) for i in items), 2)
    prev_advance = await get_advance_balance(sardar_name, kms_year, season)
    advance_deducted = min(prev_advance, total)
    amount_payable = round(total - advance_deducted, 2)
    amount_paid = float(d.get("amount_paid") or amount_payable)
    new_advance = round(max(0, amount_paid - amount_payable), 2)

    update_doc = {
        "sardar_name": sardar_name,
        "date": date_val,
        "items": [
            {
                "item_name": i.get("item_name", ""),
                "rate": float(i.get("rate") or 0),
                "quantity": float(i.get("quantity") or 0),
                "amount": round(float(i.get("quantity") or 0) * float(i.get("rate") or 0), 2),
            }
            for i in items
        ],
        "total": total,
        "advance_before": prev_advance,
        "advance_deducted": advance_deducted,
        "amount_payable": amount_payable,
        "amount_paid": amount_paid,
        "new_advance": new_advance,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.hemali_payments.update_one({"id": payment_id}, {"$set": update_doc})
    updated = await db.hemali_payments.find_one({"id": payment_id}, {"_id": 0})
    return updated


@router.delete("/hemali/payments/{payment_id}")
async def delete_hemali_payment(payment_id: str):
    p = await db.hemali_payments.find_one({"id": payment_id})
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    await _remove_cash_entries(payment_id)
    # Also remove debit entry (delete = full removal)
    await db.local_party_accounts.delete_many({"reference": f"hemali_debit:{payment_id}"})
    await db.hemali_payments.delete_one({"id": payment_id})
    return {"message": "Deleted", "id": payment_id}


# ============ SARDAR LIST ============

@router.get("/hemali/sardars")
async def get_hemali_sardars():
    pipeline = [
        {"$match": {"sardar_name": {"$ne": None}}},
        {"$group": {"_id": "$sardar_name"}},
        {"$sort": {"_id": 1}},
    ]
    results = await db.hemali_payments.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


# ============ MONTHLY SUMMARY ============

@router.get("/hemali/monthly-summary")
async def hemali_monthly_summary(kms_year: str = "", season: str = "", sardar_name: str = "", month: str = ""):
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if sardar_name:
        query["sardar_name"] = sardar_name
    if month:
        query["date"] = {"$regex": f"^{month}"}

    payments = await db.hemali_payments.find(query, {"_id": 0}).to_list(50000)

    # Group by sardar -> month
    sardars = {}
    for p in payments:
        sn = p.get("sardar_name", "Unknown")
        date_str = p.get("date", "")
        month_key = date_str[:7] if len(date_str) >= 7 else "Unknown"  # YYYY-MM

        if sn not in sardars:
            sardars[sn] = {"sardar_name": sn, "months": {}, "grand_total_work": 0, "grand_total_paid": 0, "grand_total_advance_given": 0, "grand_total_advance_deducted": 0}

        if month_key not in sardars[sn]["months"]:
            sardars[sn]["months"][month_key] = {
                "month": month_key,
                "total_payments": 0, "paid_payments": 0, "unpaid_payments": 0,
                "total_work": 0, "total_paid": 0,
                "advance_given": 0, "advance_deducted": 0,
                "items_breakdown": {},
            }

        m = sardars[sn]["months"][month_key]
        m["total_payments"] += 1
        is_paid = p.get("status") == "paid"
        if is_paid:
            m["paid_payments"] += 1
            m["total_work"] += p.get("total", 0)
            m["total_paid"] += p.get("amount_paid", 0)
            m["advance_given"] += p.get("new_advance", 0)
            m["advance_deducted"] += p.get("advance_deducted", 0)
            sardars[sn]["grand_total_work"] += p.get("total", 0)
            sardars[sn]["grand_total_paid"] += p.get("amount_paid", 0)
            sardars[sn]["grand_total_advance_given"] += p.get("new_advance", 0)
            sardars[sn]["grand_total_advance_deducted"] += p.get("advance_deducted", 0)
        else:
            m["unpaid_payments"] += 1

        # Items breakdown
        for item in p.get("items", []):
            iname = item.get("item_name", "")
            if iname not in m["items_breakdown"]:
                m["items_breakdown"][iname] = {"quantity": 0, "amount": 0}
            m["items_breakdown"][iname]["quantity"] += item.get("quantity", 0)
            m["items_breakdown"][iname]["amount"] += item.get("amount", 0)

    # Convert months dict to sorted list
    result = []
    for sn, data in sorted(sardars.items()):
        months_list = sorted(data["months"].values(), key=lambda x: x["month"], reverse=True)
        for m in months_list:
            m["total_work"] = round(m["total_work"], 2)
            m["total_paid"] = round(m["total_paid"], 2)
            m["advance_given"] = round(m["advance_given"], 2)
            m["advance_deducted"] = round(m["advance_deducted"], 2)
        # Current advance balance
        current_advance = 0
        for p in payments:
            if p.get("sardar_name") == sn and p.get("status") == "paid":
                current_advance += (p.get("new_advance") or 0) - (p.get("advance_deducted") or 0)

        result.append({
            "sardar_name": sn,
            "months": months_list,
            "grand_total_work": round(data["grand_total_work"], 2),
            "grand_total_paid": round(data["grand_total_paid"], 2),
            "grand_total_advance_given": round(data["grand_total_advance_given"], 2),
            "grand_total_advance_deducted": round(data["grand_total_advance_deducted"], 2),
            "current_advance_balance": round(current_advance, 2),
        })

    return result


@router.get("/hemali/monthly-summary/pdf")
async def hemali_monthly_summary_pdf(kms_year: str = "", season: str = "", sardar_name: str = "", month: str = ""):
    data = await hemali_monthly_summary(kms_year=kms_year, season=season, sardar_name=sardar_name, month=month)

    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer
    from utils.export_helpers import get_pdf_styles; from reportlab.lib.styles import ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=20, rightMargin=20, topMargin=15, bottomMargin=15)
    styles = get_pdf_styles()
    elements = []
    from utils.export_helpers import get_pdf_company_header
    elements.extend(get_pdf_company_header())
    elements.append(Paragraph("Hemali Monthly Summary", ParagraphStyle("t", parent=styles["Title"], fontSize=14, textColor=colors.HexColor("#1a365d"))))
    elements.append(Spacer(1, 8))

    for sardar in data:
        elements.append(Paragraph(f"Sardar: {sardar['sardar_name']}  |  Current Advance: Rs.{sardar['current_advance_balance']:,.2f}", ParagraphStyle("s", parent=styles["Heading3"], fontSize=10, textColor=colors.HexColor("#d97706"))))
        headers = ["Month", "Payments", "Total Work", "Total Paid", "Adv Given", "Adv Deducted"]
        rows = [headers]
        for m in sardar["months"]:
            rows.append([m["month"], f"{m['paid_payments']}/{m['total_payments']}", f"Rs.{m['total_work']:,.2f}", f"Rs.{m['total_paid']:,.2f}", f"Rs.{m['advance_given']:,.2f}", f"Rs.{m['advance_deducted']:,.2f}"])
        rows.append(["TOTAL", "", f"Rs.{sardar['grand_total_work']:,.2f}", f"Rs.{sardar['grand_total_paid']:,.2f}", f"Rs.{sardar['grand_total_advance_given']:,.2f}", f"Rs.{sardar['grand_total_advance_deducted']:,.2f}"])
        from utils.export_helpers import get_pdf_table_style
        t = RTable(rows, colWidths=[80, 60, 90, 90, 90, 90], repeatRows=1)
        cols_info = [{'header': h} for h in headers]
        style_cmds = get_pdf_table_style(len(rows), cols_info)
        style_cmds.append(("ALIGN", (1, 0), (-1, -1), "RIGHT"))
        t.setStyle(TableStyle(style_cmds))
        elements.append(t)
        elements.append(Spacer(1, 12))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=hemali_monthly_summary.pdf"})


@router.get("/hemali/monthly-summary/excel")
async def hemali_monthly_summary_excel(kms_year: str = "", season: str = "", sardar_name: str = "", month: str = ""):
    data = await hemali_monthly_summary(kms_year=kms_year, season=season, sardar_name=sardar_name, month=month)

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = Workbook()
    ws = wb.active
    ws.title = "Monthly Summary"
    from utils.export_helpers import (style_excel_title, style_excel_header_row,
        style_excel_data_rows, style_excel_total_row, COLORS, BORDER_THIN)

    ncols = 6
    style_excel_title(ws, "Hemali Monthly Summary / हेमाली मासिक", ncols)
    row_n = 4

    for sardar in data:
        ws.cell(row=row_n, column=1, value=f"Sardar: {sardar['sardar_name']}").font = Font(bold=True, size=10, color=COLORS['subtitle_text'])
        ws.cell(row=row_n, column=5, value=f"Current Advance: Rs.{sardar['current_advance_balance']}").font = Font(bold=True, size=9)
        row_n += 1
        headers_list = ["Month", "Payments", "Total Work", "Total Paid", "Adv Given", "Adv Deducted"]
        for ci, h in enumerate(headers_list, 1):
            ws.cell(row=row_n, column=ci, value=h)
        style_excel_header_row(ws, row_n, ncols)
        row_n += 1
        data_start = row_n
        for m in sardar["months"]:
            vals = [m["month"], f"{m['paid_payments']}/{m['total_payments']}", m["total_work"], m["total_paid"], m["advance_given"], m["advance_deducted"]]
            for ci, v in enumerate(vals, 1):
                ws.cell(row=row_n, column=ci, value=v)
            row_n += 1
        if sardar["months"]:
            style_excel_data_rows(ws, data_start, row_n - 1, ncols, headers_list)
        ws.cell(row=row_n, column=1, value="TOTAL")
        ws.cell(row=row_n, column=3, value=sardar["grand_total_work"])
        ws.cell(row=row_n, column=4, value=sardar["grand_total_paid"])
        style_excel_total_row(ws, row_n, ncols)
        row_n += 2

    for w, col_letter in [(12, "A"), (10, "B"), (14, "C"), (14, "D"), (14, "E"), (14, "F")]:
        ws.column_dimensions[col_letter].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=hemali_monthly_summary.xlsx"})


# ============ PRINT RECEIPT ============

@router.get("/hemali/payments/{payment_id}/print")
async def print_hemali_receipt(payment_id: str):
    p = await db.hemali_payments.find_one({"id": payment_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    from reportlab.lib.pagesizes import A5
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer, HRFlowable
    from utils.export_helpers import get_pdf_styles; from reportlab.lib.styles import ParagraphStyle

    def fmt_d(d):
        if not d: return ''
        parts = str(d).split('-')
        return f"{parts[2]}-{parts[1]}-{parts[0]}" if len(parts) == 3 else d

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A5, leftMargin=25, rightMargin=25, topMargin=20, bottomMargin=20)
    styles = get_pdf_styles()
    elements = []
    orange = colors.HexColor("#d97706")
    dark = colors.HexColor("#1a365d")
    red_c = colors.HexColor("#dc2626")
    green_c = colors.HexColor("#16a34a")
    grey_c = colors.HexColor("#6b7280")

    # Header: Company branding from helper
    from utils.export_helpers import get_pdf_company_header
    elements.extend(get_pdf_company_header())

    # Title
    elements.append(Paragraph("HEMALI PAYMENT RECEIPT", ParagraphStyle("title", parent=styles["Heading2"], fontSize=13, textColor=dark, alignment=1, spaceAfter=10)))

    # Info fields (2-column)
    label_s = ParagraphStyle("lbl", parent=styles["Normal"], fontSize=7, textColor=grey_c)
    val_s = ParagraphStyle("val", parent=styles["Normal"], fontSize=10, textColor=dark, fontName="Helvetica-Bold")
    info_data = [
        [Paragraph("RECEIPT DATE", label_s), Paragraph("SARDAR NAME", label_s)],
        [Paragraph(fmt_d(p.get("date", "")), val_s), Paragraph(p.get("sardar_name", ""), val_s)],
    ]
    info_t = RTable(info_data, colWidths=[155, 155])
    info_t.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    elements.append(info_t)
    elements.append(Spacer(1, 8))

    # Items table
    items_rows = [["Item", "Qty", "Rate", "Amount"]]
    for i in p.get("items", []):
        items_rows.append([
            i.get("item_name", ""),
            str(int(i.get("quantity", 0))),
            f"Rs. {i.get('rate', 0)}",
            f"Rs. {i.get('amount', 0):,.0f}"
        ])

    it = RTable(items_rows, colWidths=[110, 55, 60, 85], repeatRows=1)
    it.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(it)
    elements.append(Spacer(1, 10))

    # Calculation summary
    calc_label = ParagraphStyle("cl", parent=styles["Normal"], fontSize=9, textColor=dark)
    calc_val = ParagraphStyle("cv", parent=styles["Normal"], fontSize=9, textColor=dark, alignment=2, fontName="Helvetica-Bold")
    calc_red = ParagraphStyle("cr", parent=styles["Normal"], fontSize=9, textColor=red_c, alignment=2, fontName="Helvetica-Bold")
    calc_green = ParagraphStyle("cg", parent=styles["Normal"], fontSize=9, textColor=green_c, alignment=2, fontName="Helvetica-Bold")
    calc_red_l = ParagraphStyle("crl", parent=styles["Normal"], fontSize=9, textColor=red_c)
    calc_bold_l = ParagraphStyle("cbl", parent=styles["Normal"], fontSize=11, textColor=dark, fontName="Helvetica-Bold")
    calc_bold_v = ParagraphStyle("cbv", parent=styles["Normal"], fontSize=11, textColor=dark, alignment=2, fontName="Helvetica-Bold")

    calc_rows = [
        [Paragraph("Gross Amount", calc_label), Paragraph(f"Rs. {p.get('total', 0):,.0f}", calc_val)],
    ]
    if p.get("advance_deducted", 0) > 0:
        calc_rows.append([Paragraph("Advance Deducted", calc_red_l), Paragraph(f"- Rs. {p.get('advance_deducted', 0):,.0f}", calc_red)])

    ct = RTable(calc_rows, colWidths=[200, 110])
    ct.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    elements.append(ct)

    # Orange separator
    elements.append(HRFlowable(width="100%", thickness=1, color=orange, spaceBefore=4, spaceAfter=4))

    # Net amount (bold)
    net_rows = [
        [Paragraph("Net Amount", calc_bold_l), Paragraph(f"Rs. {p.get('amount_payable', 0):,.0f}", calc_bold_v)],
        [Paragraph("Amount Paid", calc_label), Paragraph(f"Rs. {p.get('amount_paid', 0):,.0f}", calc_green)],
    ]
    if p.get("new_advance", 0) > 0:
        net_rows.append([Paragraph("New Advance", calc_label), Paragraph(f"Rs. {p.get('new_advance', 0):,.0f}", calc_val)])

    nt = RTable(net_rows, colWidths=[200, 110])
    nt.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    elements.append(nt)
    elements.append(Spacer(1, 12))

    # Status
    status_text = "PAID" if p.get("status") == "paid" else "UNPAID"
    status_color = green_c if p.get("status") == "paid" else red_c
    elements.append(Paragraph(status_text, ParagraphStyle("st", parent=styles["Normal"], fontSize=10, textColor=status_color, alignment=1, fontName="Helvetica-Bold", spaceAfter=20)))

    # Signature lines
    sig_rows = [[
        Paragraph("Sardar Signature", ParagraphStyle("sig", parent=styles["Normal"], fontSize=7, textColor=grey_c)),
        Paragraph("Authorized Signature", ParagraphStyle("sig2", parent=styles["Normal"], fontSize=7, textColor=grey_c, alignment=2)),
    ]]
    sig_t = RTable(sig_rows, colWidths=[155, 155])
    sig_t.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ("LINEABOVE", (0, 0), (0, 0), 0.5, grey_c), ("LINEABOVE", (1, 0), (1, 0), 0.5, grey_c), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    elements.append(sig_t)
    elements.append(Spacer(1, 8))

    # Footer
    elements.append(Paragraph("This is a computer generated receipt", ParagraphStyle("ft", parent=styles["Normal"], fontSize=6, textColor=grey_c, alignment=1)))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=hemali_receipt_{payment_id[:8]}.pdf"})


# ============ PDF EXPORT ============

@router.get("/hemali/export/pdf")
async def export_hemali_pdf(
    kms_year: str = "", season: str = "",
    from_date: str = "", to_date: str = "",
    sardar_name: str = ""
):
    query = {"status": "paid"}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if sardar_name:
        query["sardar_name"] = sardar_name
    if from_date or to_date:
        date_q = {}
        if from_date:
            date_q["$gte"] = from_date
        if to_date:
            date_q["$lte"] = to_date
        query["date"] = date_q

    payments = await db.hemali_payments.find(query, {"_id": 0}).sort("date", 1).to_list(10000)

    def fmt_d(d):
        if not d: return ''
        parts = str(d).split('-')
        return f"{parts[2]}-{parts[1]}-{parts[0]}" if len(parts) == 3 else d

    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer
    from utils.export_helpers import get_pdf_styles; from reportlab.lib.styles import ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=20, rightMargin=20, topMargin=15, bottomMargin=15)
    styles = get_pdf_styles()
    elements = []

    from utils.export_helpers import get_pdf_company_header
    elements.extend(get_pdf_company_header())
    elements.append(Paragraph("Hemali Payment Report", ParagraphStyle("t", parent=styles["Title"], fontSize=14, textColor=colors.HexColor("#1a365d"))))
    meta_parts = []
    if kms_year:
        meta_parts.append(f"FY: {kms_year}")
    if from_date or to_date:
        meta_parts.append(f"{from_date or ''} to {to_date or ''}")
    if sardar_name:
        meta_parts.append(f"Sardar: {sardar_name}")
    if meta_parts:
        elements.append(Paragraph(" | ".join(meta_parts), ParagraphStyle("m", parent=styles["Normal"], fontSize=8, textColor=colors.grey)))
    elements.append(Spacer(1, 8))

    headers = ["#", "Date", "Sardar", "Items", "Total", "Adv Deduct", "Payable", "Paid", "New Adv"]
    rows = [headers]
    grand_total = grand_paid = 0
    for idx, p in enumerate(payments, 1):
        items_str = ", ".join(f"{i.get('item_name','')} x{i.get('quantity',0)}" for i in p.get("items", []))
        rows.append([
            str(idx), fmt_d(p.get("date", "")), p.get("sardar_name", ""), items_str,
            f"Rs.{p.get('total',0):,.2f}", f"Rs.{p.get('advance_deducted',0):,.2f}",
            f"Rs.{p.get('amount_payable',0):,.2f}", f"Rs.{p.get('amount_paid',0):,.2f}",
            f"Rs.{p.get('new_advance',0):,.2f}",
        ])
        grand_total += p.get("total", 0)
        grand_paid += p.get("amount_paid", 0)
    rows.append(["", "", "TOTAL", "", f"Rs.{grand_total:,.2f}", "", "", f"Rs.{grand_paid:,.2f}", ""])

    from utils.export_helpers import get_pdf_table_style
    
    t = RTable(rows, colWidths=[25, 60, 70, 200, 65, 65, 65, 65, 65], repeatRows=1)
    cols_info = [{'header': h} for h in headers]
    style_cmds = get_pdf_table_style(len(rows), cols_info)
    style_cmds.extend([
        ("ALIGN", (4, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ])
    t.setStyle(TableStyle(style_cmds))
    elements.append(t)

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=hemali_payments.pdf"},
    )


# ============ EXCEL EXPORT ============

@router.get("/hemali/export/excel")
async def export_hemali_excel(
    kms_year: str = "", season: str = "",
    from_date: str = "", to_date: str = "",
    sardar_name: str = ""
):
    query = {"status": "paid"}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if sardar_name:
        query["sardar_name"] = sardar_name
    if from_date or to_date:
        date_q = {}
        if from_date:
            date_q["$gte"] = from_date
        if to_date:
            date_q["$lte"] = to_date
        query["date"] = date_q

    payments = await db.hemali_payments.find(query, {"_id": 0}).sort("date", 1).to_list(10000)

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    wb = Workbook()
    ws = wb.active
    ws.title = "Hemali Payments"
    from utils.export_helpers import (style_excel_title, style_excel_header_row,
        style_excel_data_rows, style_excel_total_row, COLORS)

    ncols = 9
    style_excel_title(ws, "Hemali Payment Report / हेमाली भुगतान", ncols)

    headers = ["#", "Date", "Sardar", "Items", "Total", "Adv Deducted", "Payable", "Paid", "New Advance"]
    for i, h in enumerate(headers, 1):
        ws.cell(row=4, column=i, value=h)
    style_excel_header_row(ws, 4, ncols)

    data_start = 5; row_n = data_start
    grand_total = grand_paid = 0
    for idx, p in enumerate(payments, 1):
        items_str = ", ".join(f"{i.get('item_name','')} x{i.get('quantity',0)}" for i in p.get("items", []))
        vals = [idx, p.get("date", ""), p.get("sardar_name", ""), items_str,
                p.get("total", 0), p.get("advance_deducted", 0), p.get("amount_payable", 0),
                p.get("amount_paid", 0), p.get("new_advance", 0)]
        for ci, v in enumerate(vals, 1):
            ws.cell(row=row_n, column=ci, value=v)
        grand_total += p.get("total", 0)
        grand_paid += p.get("amount_paid", 0)
        row_n += 1

    if payments:
        style_excel_data_rows(ws, data_start, row_n - 1, ncols, headers)

    ws.cell(row=row_n, column=3, value="TOTAL")
    ws.cell(row=row_n, column=5, value=grand_total)
    ws.cell(row=row_n, column=8, value=grand_paid)
    style_excel_total_row(ws, row_n, ncols)

    for w, col_letter in [(5, "A"), (12, "B"), (16, "C"), (35, "D"), (12, "E"), (14, "F"), (12, "G"), (12, "H"), (14, "I")]:
        ws.column_dimensions[col_letter].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=hemali_payments.xlsx"},
    )
