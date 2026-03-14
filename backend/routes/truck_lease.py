from fastapi import APIRouter, HTTPException
from database import db
from datetime import datetime, timezone
from typing import Optional
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
