from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from datetime import datetime, timezone
from database import db
from models import *
import uuid

router = APIRouter()

# ============ DIESEL PUMPS MANAGEMENT ============

@router.get("/diesel-pumps")
async def get_diesel_pumps():
    pumps = await db.diesel_pumps.find({}, {"_id": 0}).to_list(100)
    return pumps

@router.post("/diesel-pumps")
async def add_diesel_pump(request: Request):
    data = await request.json()
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Pump name required")
    existing = await db.diesel_pumps.find_one({"name": name})
    if existing:
        raise HTTPException(status_code=400, detail="Pump already exists")
    pump = {
        "id": str(uuid.uuid4()),
        "name": name,
        "is_default": data.get("is_default", False),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    # If setting as default, unset others
    if pump["is_default"]:
        await db.diesel_pumps.update_many({}, {"$set": {"is_default": False}})
    await db.diesel_pumps.insert_one(pump)
    pump.pop("_id", None)
    return pump

@router.put("/diesel-pumps/{pump_id}/set-default")
async def set_default_pump(pump_id: str):
    pump = await db.diesel_pumps.find_one({"id": pump_id})
    if not pump:
        raise HTTPException(status_code=404, detail="Pump not found")
    await db.diesel_pumps.update_many({}, {"$set": {"is_default": False}})
    await db.diesel_pumps.update_one({"id": pump_id}, {"$set": {"is_default": True}})
    return {"message": "Default pump set", "pump_id": pump_id}

@router.delete("/diesel-pumps/{pump_id}")
async def delete_diesel_pump(pump_id: str):
    result = await db.diesel_pumps.delete_one({"id": pump_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pump not found")
    return {"message": "Pump deleted"}

# ============ DIESEL ACCOUNT TRANSACTIONS ============

@router.get("/diesel-accounts")
async def get_diesel_accounts(pump_id: Optional[str] = None, kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if pump_id: query["pump_id"] = pump_id
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    txns = await db.diesel_accounts.find(query, {"_id": 0}).sort("date", -1).to_list(5000)
    return txns

@router.get("/diesel-accounts/summary")
async def get_diesel_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    txns = await db.diesel_accounts.find(query, {"_id": 0}).to_list(5000)
    pumps = await db.diesel_pumps.find({}, {"_id": 0}).to_list(100)
    
    pump_summaries = []
    for pump in pumps:
        pid = pump["id"]
        pump_txns = [t for t in txns if t.get("pump_id") == pid]
        total_diesel = sum(t["amount"] for t in pump_txns if t.get("txn_type") == "debit")
        total_paid = sum(t["amount"] for t in pump_txns if t.get("txn_type") == "payment")
        balance = round(total_diesel - total_paid, 2)
        pump_summaries.append({
            "pump_id": pid, "pump_name": pump["name"], "is_default": pump.get("is_default", False),
            "total_diesel": round(total_diesel, 2), "total_paid": round(total_paid, 2), "balance": balance,
            "txn_count": len([t for t in pump_txns if t.get("txn_type") == "debit"])
        })
    
    grand_diesel = sum(p["total_diesel"] for p in pump_summaries)
    grand_paid = sum(p["total_paid"] for p in pump_summaries)
    return {
        "pumps": pump_summaries,
        "grand_total_diesel": round(grand_diesel, 2),
        "grand_total_paid": round(grand_paid, 2),
        "grand_balance": round(grand_diesel - grand_paid, 2)
    }

# ============ DIESEL PAYMENT / SETTLEMENT ============

@router.post("/diesel-accounts/pay")
async def make_diesel_payment(request: Request, username: str = "", role: str = ""):
    data = await request.json()
    pump_id = data.get("pump_id")
    amount = float(data.get("amount", 0))
    if not pump_id or amount <= 0:
        raise HTTPException(status_code=400, detail="pump_id and amount > 0 required")
    
    pump = await db.diesel_pumps.find_one({"id": pump_id}, {"_id": 0})
    if not pump:
        raise HTTPException(status_code=404, detail="Pump not found")
    
    kms_year = data.get("kms_year", "")
    season = data.get("season", "")
    date = data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    notes = data.get("notes", "")
    
    # Create payment transaction in diesel account
    pay_txn = {
        "id": str(uuid.uuid4()), "date": date,
        "pump_id": pump_id, "pump_name": pump["name"],
        "truck_no": "", "agent_name": "",
        "amount": round(amount, 2), "txn_type": "payment",
        "description": f"Payment to {pump['name']}" + (f" - {notes}" if notes else ""),
        "kms_year": kms_year, "season": season,
        "created_by": username or "system",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.diesel_accounts.insert_one(pay_txn)
    
    # Auto create Cash Book entry (Nikasi)
    cb = {
        "id": str(uuid.uuid4()), "date": date,
        "account": "cash", "txn_type": "nikasi", "category": "Diesel Payment",
        "description": f"Diesel Payment: {pump['name']} - Rs.{amount}" + (f" ({notes})" if notes else ""),
        "amount": round(amount, 2), "reference": f"diesel_pay:{pay_txn['id'][:8]}",
        "kms_year": kms_year, "season": season,
        "created_by": username or "system",
        "linked_diesel_payment_id": pay_txn["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.cash_transactions.insert_one(cb)
    
    return {"success": True, "message": f"Rs.{amount} payment to {pump['name']} recorded", "txn_id": pay_txn["id"]}

@router.delete("/diesel-accounts/{txn_id}")
async def delete_diesel_transaction(txn_id: str):
    txn = await db.diesel_accounts.find_one({"id": txn_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If it was a payment, also delete linked cash book entry
    if txn.get("txn_type") == "payment":
        await db.cash_transactions.delete_many({"linked_diesel_payment_id": txn_id})
    
    await db.diesel_accounts.delete_one({"id": txn_id})
    return {"message": "Deleted", "id": txn_id}
