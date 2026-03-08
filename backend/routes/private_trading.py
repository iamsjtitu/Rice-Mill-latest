from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from database import db, USERS, print_pages
from models import *
import uuid, io, csv
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

router = APIRouter()

# ============ PRIVATE TRADING: Paddy Purchase & Rice Sale ============

@router.post("/private-paddy")
async def create_private_paddy(data: dict, username: str = "", role: str = ""):
    doc = {
        "id": str(uuid.uuid4()), "date": data.get("date", ""),
        "kms_year": data.get("kms_year", ""), "season": data.get("season", ""),
        "party_name": data.get("party_name", ""), "truck_no": data.get("truck_no", ""),
        "rst_no": data.get("rst_no", ""), "agent_name": data.get("agent_name", ""),
        "mandi_name": data.get("mandi_name", ""),
        "kg": float(data.get("kg", 0)), "bag": int(data.get("bag", 0)),
        "rate_per_qntl": float(data.get("rate_per_qntl", 0)),
        "g_deposite": float(data.get("g_deposite", 0)),
        "gbw_cut": float(data.get("gbw_cut", 0)),
        "plastic_bag": int(data.get("plastic_bag", 0)),
        "moisture": float(data.get("moisture", 0)),
        "cutting_percent": float(data.get("cutting_percent", 0)),
        "disc_dust_poll": float(data.get("disc_dust_poll", 0)),
        "remark": data.get("remark", ""),
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # Auto calculations
    doc["qntl"] = round(doc["kg"] / 100, 2) if doc["kg"] else 0
    doc["gbw_cut"] = float(data.get("gbw_cut", 0)) or round(doc["bag"] * 1.0, 2)
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
    return doc

@router.get("/private-paddy")
async def get_private_paddy(kms_year: Optional[str] = None, season: Optional[str] = None, party_name: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    items = await db.private_paddy.find(query, {"_id": 0}).sort("date", -1).to_list(5000)
    return items

@router.put("/private-paddy/{item_id}")
async def update_private_paddy(item_id: str, data: dict):
    existing = await db.private_paddy.find_one({"id": item_id})
    if not existing: raise HTTPException(status_code=404, detail="Not found")
    update_data = {k: v for k, v in data.items() if v is not None}
    for f in ["kg", "bag", "rate_per_qntl", "g_deposite", "gbw_cut", "plastic_bag", "moisture", "cutting_percent", "disc_dust_poll", "paid_amount"]:
        if f in update_data: update_data[f] = float(update_data[f]) if f != "bag" and f != "plastic_bag" else int(update_data[f])
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
    return merged

@router.delete("/private-paddy/{item_id}")
async def delete_private_paddy(item_id: str):
    result = await db.private_paddy.delete_one({"id": item_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Not found")
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
    items = await db.rice_sales.find(query, {"_id": 0}).sort("date", -1).to_list(5000)
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
    items = await db.private_payments.find(query, {"_id": 0}).sort("date", -1).to_list(5000)
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


