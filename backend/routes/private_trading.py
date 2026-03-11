from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from database import db, USERS, print_pages
from models import *
import uuid
import io
import csv
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from utils.report_helper import get_columns, get_entry_row, get_total_row, get_excel_headers, get_pdf_headers, get_excel_widths, get_pdf_widths_mm, col_count

router = APIRouter()

# ============ PRIVATE TRADING: Paddy Purchase & Rice Sale ============

@router.post("/private-paddy")
async def create_private_paddy(data: dict, username: str = "", role: str = ""):
    def _f(v): return float(v) if v not in (None, "") else 0
    def _i(v): return int(float(v)) if v not in (None, "") else 0
    doc = {
        "id": str(uuid.uuid4()), "date": data.get("date", ""),
        "kms_year": data.get("kms_year", ""), "season": data.get("season", ""),
        "party_name": data.get("party_name", ""), "truck_no": data.get("truck_no", ""),
        "rst_no": data.get("rst_no", ""), "agent_name": data.get("agent_name", ""),
        "mandi_name": data.get("mandi_name", ""),
        "kg": _f(data.get("kg", 0)), "bag": _i(data.get("bag", 0)),
        "rate_per_qntl": _f(data.get("rate_per_qntl", 0)),
        "g_deposite": _f(data.get("g_deposite", 0)),
        "gbw_cut": _f(data.get("gbw_cut", 0)),
        "plastic_bag": _i(data.get("plastic_bag", 0)),
        "moisture": _f(data.get("moisture", 0)),
        "cutting_percent": _f(data.get("cutting_percent", 0)),
        "disc_dust_poll": _f(data.get("disc_dust_poll", 0)),
        "g_issued": _i(data.get("g_issued", 0)),
        "cash_paid": _f(data.get("cash_paid", 0)),
        "diesel_paid": _f(data.get("diesel_paid", 0)),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # Auto calculations
    doc["qntl"] = round(doc["kg"] / 100, 2) if doc["kg"] else 0
    doc["gbw_cut"] = _f(data.get("gbw_cut", 0)) or round(doc["bag"] * 1.0, 2)
    doc["mill_w"] = round(doc["kg"] - doc["gbw_cut"], 2)
    doc["p_pkt_cut"] = round(doc["plastic_bag"] * 0.5, 2)
    moist_pct = max(0, doc["moisture"] - 17) if doc["moisture"] > 17 else 0
    doc["moisture_cut_percent"] = round(moist_pct, 2)
    doc["moisture_cut"] = round(doc["mill_w"] * moist_pct / 100, 2)
    after_moisture = doc["mill_w"] - doc["moisture_cut"]
    doc["cutting"] = round(after_moisture * doc["cutting_percent"] / 100, 2)
    doc["final_w"] = round(after_moisture - doc["cutting"] - doc["p_pkt_cut"] - doc["disc_dust_poll"], 2)
    doc["final_qntl"] = round(doc["final_w"] / 100, 2)
    doc["total_amount"] = round(doc["final_qntl"] * doc["rate_per_qntl"], 2)
    doc["paid_amount"] = float(data.get("paid_amount", 0))
    doc["balance"] = round(doc["total_amount"] - doc["paid_amount"], 2)
    await db.private_paddy.insert_one(doc)
    doc.pop("_id", None)
    # Auto gunny bag entries
    await _create_gunny_entries_for_pvt_paddy(doc, username)
    # Auto cash book + diesel entries
    await _create_cashbook_diesel_for_pvt_paddy(doc, username)
    return doc


async def _create_gunny_entries_for_pvt_paddy(doc, username=""):
    """Auto-create gunny bag entries for bag (IN) and g_issued (OUT) in a pvt paddy entry."""
    entry_id = doc["id"]
    party = doc.get("party_name", "")
    agent = doc.get("agent_name", "")
    mandi = doc.get("mandi_name", "")
    source = f"Pvt: {party}" if party else "Pvt Paddy"
    if agent and mandi:
        source = f"Pvt: {agent} - {mandi}"
    truck = doc.get("truck_no", "")
    base = {
        "bag_type": "old", "rate": 0, "amount": 0, "notes": "Auto from Pvt Paddy",
        "kms_year": doc.get("kms_year", ""), "season": doc.get("season", ""),
        "created_by": username or "system", "linked_entry_id": entry_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    bag_in = int(float(doc.get("bag", 0) or 0))
    if bag_in > 0:
        entry = {**base, "id": str(uuid.uuid4()), "date": doc.get("date", ""),
                 "txn_type": "in", "quantity": bag_in, "source": source, "reference": truck}
        await db.gunny_bags.insert_one(entry)
    g_issued = int(float(doc.get("g_issued", 0) or 0))
    if g_issued > 0:
        entry = {**base, "id": str(uuid.uuid4()), "date": doc.get("date", ""),
                 "txn_type": "out", "quantity": g_issued, "source": source, "reference": truck}
        await db.gunny_bags.insert_one(entry)


async def _create_cashbook_diesel_for_pvt_paddy(doc, username=""):
    """Auto-create cash book nikasi for cash_paid and diesel account entry for diesel_paid."""
    entry_id = doc["id"]
    party = doc.get("party_name", "")
    mandi = doc.get("mandi_name", "")
    party_label = f"{party} - {mandi}" if party and mandi else party or "Pvt Paddy"
    date = doc.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    base_fields = {
        "kms_year": doc.get("kms_year", ""), "season": doc.get("season", ""),
        "created_by": username or "system", "linked_entry_id": entry_id,
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()
    }
    cash_paid = float(doc.get("cash_paid", 0) or 0)
    if cash_paid > 0:
        # Cash Book nikasi
        await db.cash_transactions.insert_one({
            "id": str(uuid.uuid4()), "date": date,
            "account": "cash", "txn_type": "nikasi",
            "category": party_label, "party_type": "Pvt Paddy Purchase",
            "description": f"Pvt Paddy Cash Advance: {party_label} - Rs.{cash_paid}",
            "amount": round(cash_paid, 2), "reference": f"pvt_paddy_cash:{entry_id[:8]}",
            **base_fields
        })
    diesel_paid = float(doc.get("diesel_paid", 0) or 0)
    if diesel_paid > 0:
        # Diesel Account entry
        default_pump = await db.diesel_pumps.find_one({"is_default": True}, {"_id": 0})
        pump_name = default_pump["name"] if default_pump else "Default Pump"
        pump_id = default_pump["id"] if default_pump else "default"
        await db.diesel_accounts.insert_one({
            "id": str(uuid.uuid4()), "date": date,
            "pump_id": pump_id, "pump_name": pump_name,
            "truck_no": doc.get("truck_no", ""), "agent_name": doc.get("agent_name", ""),
            "mandi_name": mandi, "amount": round(diesel_paid, 2), "txn_type": "debit",
            "description": f"Pvt Paddy Diesel: {party_label}",
            **base_fields
        })



@router.post("/private-paddy/migrate-cashbook")
async def migrate_pvt_paddy_cashbook():
    """One-time migration: create cash book + diesel entries for existing pvt paddy entries that don't have them."""
    entries = await db.private_paddy.find({}, {"_id": 0}).to_list(10000)
    migrated = 0
    for doc in entries:
        cash_paid = float(doc.get("cash_paid", 0) or 0)
        diesel_paid = float(doc.get("diesel_paid", 0) or 0)
        if cash_paid <= 0 and diesel_paid <= 0:
            continue
        existing = await db.cash_transactions.find_one({"linked_entry_id": doc["id"], "reference": {"$regex": "^pvt_paddy"}})
        if existing:
            continue
        await _create_cashbook_diesel_for_pvt_paddy(doc, "migration")
        migrated += 1
    return {"message": f"Migrated {migrated} entries", "total_checked": len(entries)}


@router.get("/private-paddy")
async def get_private_paddy(kms_year: Optional[str] = None, season: Optional[str] = None, party_name: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    items = await db.private_paddy.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    return items

@router.put("/private-paddy/{item_id}")
async def update_private_paddy(item_id: str, data: dict, username: str = ""):
    existing = await db.private_paddy.find_one({"id": item_id})
    if not existing: raise HTTPException(status_code=404, detail="Not found")
    update_data = {k: v for k, v in data.items() if v is not None}
    for f in ["kg", "rate_per_qntl", "g_deposite", "gbw_cut", "moisture", "cutting_percent", "disc_dust_poll", "paid_amount", "cash_paid", "diesel_paid", "advance_paid"]:
        if f in update_data: update_data[f] = float(update_data[f] or 0)
    for f in ["bag", "plastic_bag", "g_issued"]:
        if f in update_data: update_data[f] = int(float(update_data[f] or 0))
    merged = {**existing, **update_data}
    merged["qntl"] = round(merged["kg"] / 100, 2) if merged["kg"] else 0
    merged["mill_w"] = round(merged["kg"] - merged["gbw_cut"], 2)
    merged["p_pkt_cut"] = round(merged["plastic_bag"] * 0.5, 2)
    moist_pct = max(0, merged["moisture"] - 17) if merged["moisture"] > 17 else 0
    merged["moisture_cut_percent"] = round(moist_pct, 2)
    merged["moisture_cut"] = round(merged["mill_w"] * moist_pct / 100, 2)
    after_moisture = merged["mill_w"] - merged["moisture_cut"]
    merged["cutting"] = round(after_moisture * merged["cutting_percent"] / 100, 2)
    merged["final_w"] = round(after_moisture - merged["cutting"] - merged["p_pkt_cut"] - merged["disc_dust_poll"], 2)
    merged["final_qntl"] = round(merged["final_w"] / 100, 2)
    merged["total_amount"] = round(merged["final_qntl"] * merged["rate_per_qntl"], 2)
    merged["balance"] = round(merged["total_amount"] - merged.get("paid_amount", 0), 2)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged.pop("_id", None)
    await db.private_paddy.update_one({"id": item_id}, {"$set": merged})
    # Re-create gunny bag entries
    await db.gunny_bags.delete_many({"linked_entry_id": item_id})
    await _create_gunny_entries_for_pvt_paddy(merged, username)
    # Re-create cash book + diesel entries
    await db.cash_transactions.delete_many({"linked_entry_id": item_id, "reference": {"$regex": "^pvt_paddy"}})
    await db.diesel_accounts.delete_many({"linked_entry_id": item_id})
    await _create_cashbook_diesel_for_pvt_paddy(merged, username)
    return merged

@router.delete("/private-paddy/{item_id}")
async def delete_private_paddy(item_id: str):
    result = await db.private_paddy.delete_one({"id": item_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Not found")
    await db.gunny_bags.delete_many({"linked_entry_id": item_id})
    await db.cash_transactions.delete_many({"linked_entry_id": item_id, "reference": {"$regex": "^pvt_paddy"}})
    await db.diesel_accounts.delete_many({"linked_entry_id": item_id})
    return {"message": "Deleted", "id": item_id}

# --- Rice Sale ---
@router.post("/rice-sales")
async def create_rice_sale(data: dict, username: str = "", role: str = ""):
    qty = float(data.get("quantity_qntl", 0))
    rate = float(data.get("rate_per_qntl", 0))
    total = round(qty * rate, 2)
    paid = float(data.get("paid_amount", 0))
    doc = {
        "id": str(uuid.uuid4()), "date": data.get("date", ""),
        "kms_year": data.get("kms_year", ""), "season": data.get("season", ""),
        "party_name": data.get("party_name", ""), "rice_type": data.get("rice_type", ""),
        "quantity_qntl": qty, "rate_per_qntl": rate, "total_amount": total,
        "bags": int(data.get("bags", 0)), "truck_no": data.get("truck_no", ""),
        "paid_amount": paid, "balance": round(total - paid, 2),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rice_sales.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/rice-sales")
async def get_rice_sales(kms_year: Optional[str] = None, season: Optional[str] = None, party_name: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    items = await db.rice_sales.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    return items

@router.put("/rice-sales/{item_id}")
async def update_rice_sale(item_id: str, data: dict):
    existing = await db.rice_sales.find_one({"id": item_id})
    if not existing: raise HTTPException(status_code=404, detail="Not found")
    update_data = {k: v for k, v in data.items() if v is not None}
    for f in ["quantity_qntl", "rate_per_qntl", "paid_amount", "bags"]:
        if f in update_data: update_data[f] = float(update_data[f]) if f != "bags" else int(update_data[f])
    merged = {**existing, **update_data}
    merged["total_amount"] = round(merged["quantity_qntl"] * merged["rate_per_qntl"], 2)
    merged["balance"] = round(merged["total_amount"] - merged.get("paid_amount", 0), 2)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged.pop("_id", None)
    await db.rice_sales.update_one({"id": item_id}, {"$set": merged})
    return merged

@router.delete("/rice-sales/{item_id}")
async def delete_rice_sale(item_id: str):
    result = await db.rice_sales.delete_one({"id": item_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted", "id": item_id}

# --- Private Payments (for both paddy purchase & rice sale parties) ---
@router.post("/private-payments")
async def create_private_payment(data: dict, username: str = "", role: str = ""):
    doc = {
        "id": str(uuid.uuid4()), "date": data.get("date", ""),
        "kms_year": data.get("kms_year", ""), "season": data.get("season", ""),
        "party_name": data.get("party_name", ""), "payment_type": data.get("payment_type", ""),
        "ref_type": data.get("ref_type", ""),  # "paddy_purchase" or "rice_sale"
        "ref_id": data.get("ref_id", ""),
        "amount": float(data.get("amount", 0)),
        "mode": data.get("mode", "cash"),  # cash/bank/cheque
        "reference": data.get("reference", ""),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.private_payments.insert_one(doc)
    # Update balance on the referenced entry
    if doc["ref_type"] == "paddy_purchase" and doc["ref_id"]:
        entry = await db.private_paddy.find_one({"id": doc["ref_id"]})
        if entry:
            new_paid = round(entry.get("paid_amount", 0) + doc["amount"], 2)
            await db.private_paddy.update_one({"id": doc["ref_id"]}, {"$set": {"paid_amount": new_paid, "balance": round(entry.get("total_amount", 0) - new_paid, 2)}})
    elif doc["ref_type"] == "rice_sale" and doc["ref_id"]:
        entry = await db.rice_sales.find_one({"id": doc["ref_id"]})
        if entry:
            new_paid = round(entry.get("paid_amount", 0) + doc["amount"], 2)
            await db.rice_sales.update_one({"id": doc["ref_id"]}, {"$set": {"paid_amount": new_paid, "balance": round(entry.get("total_amount", 0) - new_paid, 2)}})
    # Auto-create Cash Book entry
    account = "bank" if doc["mode"] == "bank" else "cash"
    if doc["ref_type"] == "paddy_purchase":
        cb_txn = {
            "id": str(uuid.uuid4()), "date": doc["date"], "account": account, "txn_type": "nikasi",
            "category": "Pvt Paddy Payment", "description": f"Paddy Payment: {doc['party_name']}", "amount": doc["amount"],
            "reference": doc["reference"] or doc["id"][:8], "kms_year": doc["kms_year"], "season": doc["season"],
            "created_by": username, "linked_payment_id": doc["id"],
            "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        cb_txn = {
            "id": str(uuid.uuid4()), "date": doc["date"], "account": account, "txn_type": "jama",
            "category": "Rice Sale Payment", "description": f"Rice Payment Received: {doc['party_name']}", "amount": doc["amount"],
            "reference": doc["reference"] or doc["id"][:8], "kms_year": doc["kms_year"], "season": doc["season"],
            "created_by": username, "linked_payment_id": doc["id"],
            "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    await db.cash_transactions.insert_one(cb_txn)
    doc.pop("_id", None)
    return doc

@router.get("/private-payments")
async def get_private_payments(party_name: Optional[str] = None, ref_type: Optional[str] = None, ref_id: Optional[str] = None, kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if ref_type: query["ref_type"] = ref_type
    if ref_id: query["ref_id"] = ref_id
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    items = await db.private_payments.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    return items

@router.delete("/private-payments/{pay_id}")
async def delete_private_payment(pay_id: str):
    pay = await db.private_payments.find_one({"id": pay_id})
    if not pay: raise HTTPException(status_code=404, detail="Not found")
    # Reverse the payment from the referenced entry
    if pay.get("ref_type") == "paddy_purchase" and pay.get("ref_id"):
        entry = await db.private_paddy.find_one({"id": pay["ref_id"]})
        if entry:
            new_paid = round(max(0, entry.get("paid_amount", 0) - pay["amount"]), 2)
            await db.private_paddy.update_one({"id": pay["ref_id"]}, {"$set": {"paid_amount": new_paid, "balance": round(entry.get("total_amount", 0) - new_paid, 2)}})
    elif pay.get("ref_type") == "rice_sale" and pay.get("ref_id"):
        entry = await db.rice_sales.find_one({"id": pay["ref_id"]})
        if entry:
            new_paid = round(max(0, entry.get("paid_amount", 0) - pay["amount"]), 2)
            await db.rice_sales.update_one({"id": pay["ref_id"]}, {"$set": {"paid_amount": new_paid, "balance": round(entry.get("total_amount", 0) - new_paid, 2)}})
    # Delete linked Cash Book entry
    await db.cash_transactions.delete_many({"linked_payment_id": pay_id})
    await db.private_payments.delete_one({"id": pay_id})
    return {"message": "Deleted", "id": pay_id}


# ============ EXPORT: Private Paddy PDF/Excel ============

@router.get("/private-paddy/excel")
async def export_private_paddy_excel(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    items = await db.private_paddy.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    if search:
        s = search.lower()
        items = [i for i in items if s in (i.get("party_name","")).lower() or s in (i.get("mandi_name","")).lower() or s in (i.get("agent_name","")).lower()]
    # Normalize fields for agent_extra entries
    for item in items:
        if not item.get("final_qntl") and item.get("quantity_qntl"):
            item["final_qntl"] = item["quantity_qntl"]
        if not item.get("balance"):
            item["balance"] = round((item.get("total_amount", 0) or 0) - (item.get("paid_amount", 0) or 0), 2)

    cols = get_columns("private_paddy_report")
    ncols = col_count(cols)
    headers = get_excel_headers(cols)
    widths = get_excel_widths(cols)

    wb = Workbook(); ws = wb.active; ws.title = "Pvt Paddy Purchase"
    hf = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=9)
    tf = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))

    title = "Private Paddy Purchase"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14, color="D97706"); ws['A1'].alignment = Alignment(horizontal='center')

    # Headers row 3
    for col_idx, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=col_idx, value=h)
        c.fill = hf; c.font = hfont; c.alignment = Alignment(horizontal='center'); c.border = tb

    row = 4
    totals = {"total_kg": 0, "total_final_qntl": 0, "total_amount": 0, "total_paid": 0, "total_balance": 0, "total_g_issued": 0, "total_cash": 0, "total_diesel": 0}
    for item in items:
        vals = get_entry_row(item, cols)
        for col_idx, v in enumerate(vals, 1):
            c = ws.cell(row=row, column=col_idx, value=v)
            c.border = tb
            if cols[col_idx-1]["align"] == "right": c.alignment = Alignment(horizontal='right')
        totals["total_kg"] += item.get("kg", 0) or 0
        totals["total_final_qntl"] += item.get("final_qntl", 0) or 0
        totals["total_amount"] += item.get("total_amount", 0) or 0
        totals["total_paid"] += item.get("paid_amount", 0) or 0
        totals["total_balance"] += item.get("balance", 0) or 0
        totals["total_g_issued"] += item.get("g_issued", 0) or 0
        totals["total_cash"] += item.get("cash_paid", 0) or 0
        totals["total_diesel"] += item.get("diesel_paid", 0) or 0
        row += 1

    # Totals row
    for k in totals: totals[k] = round(totals[k], 2)
    total_vals = get_total_row(totals, cols)
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=1).fill = tf; ws.cell(row=row, column=1).border = tb
    for col_idx, val in enumerate(total_vals, 1):
        if val is not None:
            c = ws.cell(row=row, column=col_idx, value=val)
            c.fill = tf; c.font = Font(bold=True); c.border = tb; c.alignment = Alignment(horizontal='right')

    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=pvt_paddy_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/private-paddy/pdf")
async def export_private_paddy_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    from io import BytesIO

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    items = await db.private_paddy.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    if search:
        s = search.lower()
        items = [i for i in items if s in (i.get("party_name","")).lower() or s in (i.get("mandi_name","")).lower() or s in (i.get("agent_name","")).lower()]
    for item in items:
        if not item.get("final_qntl") and item.get("quantity_qntl"):
            item["final_qntl"] = item["quantity_qntl"]
        if not item.get("balance"):
            item["balance"] = round((item.get("total_amount", 0) or 0) - (item.get("paid_amount", 0) or 0), 2)

    cols = get_columns("private_paddy_report")
    ncols = col_count(cols)
    headers = get_pdf_headers(cols)
    col_widths = [w*mm for w in get_pdf_widths_mm(cols)]

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=8*mm, rightMargin=8*mm, topMargin=10*mm, bottomMargin=10*mm)
    elements = []; styles = getSampleStyleSheet()

    title = "Private Paddy Purchase"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.HexColor('#D97706'), alignment=TA_CENTER)
    elements.append(Paragraph(title, title_style)); elements.append(Spacer(1, 8))

    table_data = [headers]
    totals = {"total_kg": 0, "total_final_qntl": 0, "total_amount": 0, "total_paid": 0, "total_balance": 0, "total_g_issued": 0, "total_cash": 0, "total_diesel": 0}
    for item in items:
        table_data.append([str(v) for v in get_entry_row(item, cols)])
        totals["total_kg"] += item.get("kg", 0) or 0
        totals["total_final_qntl"] += item.get("final_qntl", 0) or 0
        totals["total_amount"] += item.get("total_amount", 0) or 0
        totals["total_paid"] += item.get("paid_amount", 0) or 0
        totals["total_balance"] += item.get("balance", 0) or 0
        totals["total_g_issued"] += item.get("g_issued", 0) or 0
        totals["total_cash"] += item.get("cash_paid", 0) or 0
        totals["total_diesel"] += item.get("diesel_paid", 0) or 0
    for k in totals: totals[k] = round(totals[k], 2)
    total_vals = get_total_row(totals, cols)
    total_row = []
    for i, val in enumerate(total_vals):
        if i == 0: total_row.append("TOTAL")
        elif val is not None: total_row.append(str(val))
        else: total_row.append("")
    table_data.append(total_row)

    first_right = next((i for i, c in enumerate(cols) if c["align"] == "right"), 2)
    tbl = RLTable(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ALIGN', (first_right, 1), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0: style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F1F5F9')))
    tbl.setStyle(TableStyle(style_cmds))
    elements.append(tbl)
    doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=pvt_paddy_{datetime.now().strftime('%Y%m%d')}.pdf"})


@router.get("/rice-sales/excel")
async def export_rice_sales_excel(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    items = await db.rice_sales.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    if search:
        s = search.lower()
        items = [i for i in items if s in (i.get("party_name","")).lower()]
    for item in items:
        if not item.get("balance"):
            item["balance"] = round((item.get("total_amount", 0) or 0) - (item.get("paid_amount", 0) or 0), 2)

    cols = get_columns("rice_sales_report")
    ncols = col_count(cols)
    headers = get_excel_headers(cols)
    widths = get_excel_widths(cols)

    wb = Workbook(); ws = wb.active; ws.title = "Rice Sales"
    hf = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=9)
    tf = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))

    title = "Rice Sales Report"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14, color="065F46"); ws['A1'].alignment = Alignment(horizontal='center')

    for col_idx, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=col_idx, value=h)
        c.fill = hf; c.font = hfont; c.alignment = Alignment(horizontal='center'); c.border = tb

    row = 4
    totals = {"total_qntl": 0, "total_amount": 0, "total_paid": 0, "total_balance": 0}
    for item in items:
        vals = get_entry_row(item, cols)
        for col_idx, v in enumerate(vals, 1):
            c = ws.cell(row=row, column=col_idx, value=v)
            c.border = tb
            if cols[col_idx-1]["align"] == "right": c.alignment = Alignment(horizontal='right')
        totals["total_qntl"] += item.get("quantity_qntl", 0) or 0
        totals["total_amount"] += item.get("total_amount", 0) or 0
        totals["total_paid"] += item.get("paid_amount", 0) or 0
        totals["total_balance"] += item.get("balance", 0) or 0
        row += 1

    for k in totals: totals[k] = round(totals[k], 2)
    total_vals = get_total_row(totals, cols)
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=1).fill = tf; ws.cell(row=row, column=1).border = tb
    for col_idx, val in enumerate(total_vals, 1):
        if val is not None:
            c = ws.cell(row=row, column=col_idx, value=val)
            c.fill = tf; c.font = Font(bold=True); c.border = tb; c.alignment = Alignment(horizontal='right')

    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=rice_sales_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/rice-sales/pdf")
async def export_rice_sales_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    from io import BytesIO

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    items = await db.rice_sales.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(5000)
    if search:
        s = search.lower()
        items = [i for i in items if s in (i.get("party_name","")).lower()]
    for item in items:
        if not item.get("balance"):
            item["balance"] = round((item.get("total_amount", 0) or 0) - (item.get("paid_amount", 0) or 0), 2)

    cols = get_columns("rice_sales_report")
    ncols = col_count(cols)
    headers = get_pdf_headers(cols)
    col_widths = [w*mm for w in get_pdf_widths_mm(cols)]

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=8*mm, rightMargin=8*mm, topMargin=10*mm, bottomMargin=10*mm)
    elements = []; styles = getSampleStyleSheet()

    title = "Rice Sales Report"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.HexColor('#065F46'), alignment=TA_CENTER)
    elements.append(Paragraph(title, title_style)); elements.append(Spacer(1, 8))

    table_data = [headers]
    totals = {"total_qntl": 0, "total_amount": 0, "total_paid": 0, "total_balance": 0}
    for item in items:
        table_data.append([str(v) for v in get_entry_row(item, cols)])
        totals["total_qntl"] += item.get("quantity_qntl", 0) or 0
        totals["total_amount"] += item.get("total_amount", 0) or 0
        totals["total_paid"] += item.get("paid_amount", 0) or 0
        totals["total_balance"] += item.get("balance", 0) or 0
    for k in totals: totals[k] = round(totals[k], 2)
    total_vals = get_total_row(totals, cols)
    total_row = []
    for i, val in enumerate(total_vals):
        if i == 0: total_row.append("TOTAL")
        elif val is not None: total_row.append(str(val))
        else: total_row.append("")
    table_data.append(total_row)

    first_right = next((i for i, c in enumerate(cols) if c["align"] == "right"), 2)
    tbl = RLTable(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#065F46')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ALIGN', (first_right, 1), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D1FAE5')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0: style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F1F5F9')))
    tbl.setStyle(TableStyle(style_cmds))
    elements.append(tbl)
    doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=rice_sales_{datetime.now().strftime('%Y%m%d')}.pdf"})




# ============ PARTY SUMMARY ============

async def _get_party_summary(kms_year=None, season=None, date_from=None, date_to=None, search=None):
    """Aggregate party-wise summary from both private_paddy and rice_sales"""
    paddy_q = {}
    rice_q = {}
    if kms_year:
        paddy_q["kms_year"] = kms_year
        rice_q["kms_year"] = kms_year
    if season:
        paddy_q["season"] = season
        rice_q["season"] = season
    if date_from or date_to:
        dq = {}
        if date_from: dq["$gte"] = date_from
        if date_to: dq["$lte"] = date_to
        paddy_q["date"] = dq
        rice_q["date"] = dq

    paddy_items = await db.private_paddy.find(paddy_q, {"_id": 0}).to_list(5000)
    rice_items = await db.rice_sales.find(rice_q, {"_id": 0}).to_list(5000)

    party_map = {}

    for p in paddy_items:
        name = p.get("party_name", "Unknown")
        if name not in party_map:
            party_map[name] = {
                "party_name": name,
                "mandi_name": p.get("mandi_name", ""),
                "agent_name": p.get("agent_name", ""),
                "purchase_amount": 0, "purchase_paid": 0, "purchase_balance": 0,
                "sale_amount": 0, "sale_received": 0, "sale_balance": 0,
                "net_balance": 0,
            }
        pm = party_map[name]
        pm["purchase_amount"] += p.get("total_amount", 0) or 0
        pm["purchase_paid"] += p.get("paid_amount", 0) or 0
        if not pm["mandi_name"] and p.get("mandi_name"):
            pm["mandi_name"] = p["mandi_name"]
        if not pm["agent_name"] and p.get("agent_name"):
            pm["agent_name"] = p["agent_name"]

    for r in rice_items:
        name = r.get("party_name", "Unknown")
        if name not in party_map:
            party_map[name] = {
                "party_name": name,
                "mandi_name": "", "agent_name": "",
                "purchase_amount": 0, "purchase_paid": 0, "purchase_balance": 0,
                "sale_amount": 0, "sale_received": 0, "sale_balance": 0,
                "net_balance": 0,
            }
        pm = party_map[name]
        pm["sale_amount"] += r.get("total_amount", 0) or 0
        pm["sale_received"] += r.get("paid_amount", 0) or 0

    result = []
    for pm in party_map.values():
        pm["purchase_amount"] = round(pm["purchase_amount"], 2)
        pm["purchase_paid"] = round(pm["purchase_paid"], 2)
        pm["purchase_balance"] = round(pm["purchase_amount"] - pm["purchase_paid"], 2)
        pm["sale_amount"] = round(pm["sale_amount"], 2)
        pm["sale_received"] = round(pm["sale_received"], 2)
        pm["sale_balance"] = round(pm["sale_amount"] - pm["sale_received"], 2)
        pm["net_balance"] = round(pm["purchase_balance"] - pm["sale_balance"], 2)
        result.append(pm)

    if search:
        s = search.lower()
        result = [r for r in result if s in r["party_name"].lower() or s in r["mandi_name"].lower() or s in r["agent_name"].lower()]

    result.sort(key=lambda x: abs(x["net_balance"]), reverse=True)

    totals = {
        "total_purchase": round(sum(r["purchase_amount"] for r in result), 2),
        "total_purchase_paid": round(sum(r["purchase_paid"] for r in result), 2),
        "total_purchase_balance": round(sum(r["purchase_balance"] for r in result), 2),
        "total_sale": round(sum(r["sale_amount"] for r in result), 2),
        "total_sale_received": round(sum(r["sale_received"] for r in result), 2),
        "total_sale_balance": round(sum(r["sale_balance"] for r in result), 2),
        "total_net_balance": round(sum(r["net_balance"] for r in result), 2),
    }
    return {"parties": result, "totals": totals}


@router.get("/private-trading/party-summary")
async def get_party_summary(kms_year: Optional[str] = None, season: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, search: Optional[str] = None):
    return await _get_party_summary(kms_year, season, date_from, date_to, search)


@router.get("/private-trading/party-summary/excel")
async def export_party_summary_excel(kms_year: Optional[str] = None, season: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, search: Optional[str] = None):
    from io import BytesIO
    data = await _get_party_summary(kms_year, season, date_from, date_to, search)
    cols = get_columns("party_summary_report")
    ncols = col_count(cols)
    headers = get_excel_headers(cols)
    widths = get_excel_widths(cols)

    wb = Workbook(); ws = wb.active; ws.title = "Party Summary"
    hf = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=9)
    tf = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))

    title = "Party-wise Summary (Pvt Trading)"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14, color="D97706"); ws['A1'].alignment = Alignment(horizontal='center')

    for col_idx, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=col_idx, value=h)
        c.fill = hf; c.font = hfont; c.alignment = Alignment(horizontal='center'); c.border = tb

    row = 4
    for party in data["parties"]:
        vals = get_entry_row(party, cols)
        for col_idx, v in enumerate(vals, 1):
            c = ws.cell(row=row, column=col_idx, value=v)
            c.border = tb
            if cols[col_idx-1]["align"] == "right": c.alignment = Alignment(horizontal='right')
        row += 1

    total_vals = get_total_row(data["totals"], cols)
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=1).fill = tf; ws.cell(row=row, column=1).border = tb
    for col_idx, val in enumerate(total_vals, 1):
        if val is not None:
            c = ws.cell(row=row, column=col_idx, value=val)
            c.fill = tf; c.font = Font(bold=True); c.border = tb; c.alignment = Alignment(horizontal='right')

    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=party_summary_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/private-trading/party-summary/pdf")
async def export_party_summary_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, search: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    from io import BytesIO

    data = await _get_party_summary(kms_year, season, date_from, date_to, search)
    cols = get_columns("party_summary_report")
    headers = get_pdf_headers(cols)
    col_widths = [w*mm for w in get_pdf_widths_mm(cols)]

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=8*mm, rightMargin=8*mm, topMargin=10*mm, bottomMargin=10*mm)
    elements = []; styles = getSampleStyleSheet()

    title = "Party-wise Summary (Pvt Trading)"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.HexColor('#D97706'), alignment=TA_CENTER)
    elements.append(Paragraph(title, title_style)); elements.append(Spacer(1, 8))

    table_data = [headers]
    for party in data["parties"]:
        table_data.append([str(v) for v in get_entry_row(party, cols)])

    total_vals = get_total_row(data["totals"], cols)
    total_row = []
    for i, val in enumerate(total_vals):
        if i == 0: total_row.append("TOTAL")
        elif val is not None: total_row.append(str(val))
        else: total_row.append("")
    table_data.append(total_row)

    first_right = next((i for i, c in enumerate(cols) if c["align"] == "right"), 3)
    tbl = RLTable(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ALIGN', (first_right, 1), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0: style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F1F5F9')))
    tbl.setStyle(TableStyle(style_cmds))
    elements.append(tbl)
    doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=party_summary_{datetime.now().strftime('%Y%m%d')}.pdf"})
