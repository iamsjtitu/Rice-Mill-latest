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

async def get_company_name():
    settings = await db.settings.find_one({"type": "company"}, {"_id": 0})
    if settings:
        return settings.get("company_name", "Mill Entry System"), settings.get("tagline", "")
    return "Mill Entry System", ""

# ============ TRUCK PAYMENT ENDPOINTS ============

@router.get("/truck-payments", response_model=List[TruckPaymentStatus])
async def get_truck_payments(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all truck payments with their status"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    payments = []
    for entry in entries:
        entry_id = entry.get("id")
        
        # Get payment record if exists
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        # Default rate 32, or from payment doc
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(net_amount - paid_amount, 2)
        
        # Use tolerance for floating-point precision (₹0.10 tolerance)
        status = "paid" if balance < 0.10 else ("partial" if paid_amount > 0 else "pending")
        
        payments.append(TruckPaymentStatus(
            entry_id=entry_id,
            truck_no=entry.get("truck_no", ""),
            date=entry.get("date", ""),
            total_qntl=round(entry.get("qntl", 0), 2),
            total_bag=entry.get("bag", 0),
            final_qntl=final_qntl,
            cash_taken=cash_taken,
            diesel_taken=diesel_taken,
            rate_per_qntl=rate,
            gross_amount=gross_amount,
            deductions=deductions,
            net_amount=net_amount,
            paid_amount=paid_amount,
            balance_amount=max(0, balance),
            status=status,
            kms_year=entry.get("kms_year", ""),
            season=entry.get("season", ""),
            agent_name=entry.get("agent_name", ""),
            mandi_name=entry.get("mandi_name", "")
        ))
    
    return payments


@router.put("/truck-payments/{entry_id}/rate")
async def set_truck_rate(entry_id: str, request: SetRateRequest, username: str = "", role: str = ""):
    """Set rate for a specific truck entry - auto-updates all entries with same truck_no + mandi_name"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin rate set kar sakta hai")
    
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    truck_no = entry.get("truck_no", "")
    mandi_name = entry.get("mandi_name", "")
    updated_count = 1
    
    if truck_no and mandi_name:
        # Find all entries with same truck_no + mandi_name
        matching = await db.mill_entries.find(
            {"truck_no": truck_no, "mandi_name": {"$regex": f"^{mandi_name}$", "$options": "i"}}, {"_id": 0, "id": 1}
        ).to_list(None)
        for m in matching:
            await db.truck_payments.update_one(
                {"entry_id": m["id"]},
                {"$set": {"entry_id": m["id"], "rate_per_qntl": request.rate_per_qntl, "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True
            )
        updated_count = len(matching)
    else:
        await db.truck_payments.update_one(
            {"entry_id": entry_id},
            {"$set": {"entry_id": entry_id, "rate_per_qntl": request.rate_per_qntl, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
    
    return {"success": True, "message": f"Rate ₹{request.rate_per_qntl}/QNTL set for {updated_count} entries", "updated_count": updated_count, "truck_no": truck_no, "mandi_name": mandi_name}


@router.post("/truck-payments/{entry_id}/pay")
async def make_truck_payment(entry_id: str, request: MakePaymentRequest, username: str = "", role: str = ""):
    """Record a payment for truck (partial or full)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin payment kar sakta hai")
    
    # Check entry exists
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Get or create payment record
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    current_paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    
    new_paid = current_paid + request.amount
    payments_history.append({
        "amount": request.amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": request.note,
        "by": username
    })
    
    await db.truck_payments.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "entry_id": entry_id,
            "paid_amount": new_paid,
            "payments_history": payments_history,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Auto-create Cash Book Nikasi entry for truck payment
    if request.amount > 0:
        truck_no = entry.get("truck_no", "")
        kms_year = entry.get("kms_year", "")
        season = entry.get("season", "")
        pay_id = str(uuid.uuid4())
        cb_entry = {
            "id": pay_id,
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "category": "Truck Payment",
            "description": f"Truck Payment: {truck_no} - Rs.{request.amount}",
            "amount": round(request.amount, 2),
            "reference": f"truck_pay:{entry_id[:8]}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"truck:{entry_id}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cb_entry)
    
    return {"success": True, "message": f"Rs.{request.amount} payment recorded", "total_paid": new_paid}


@router.post("/truck-payments/{entry_id}/mark-paid")
async def mark_truck_paid(entry_id: str, username: str = "", role: str = ""):
    """Mark truck payment as fully paid"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin paid mark kar sakta hai")
    
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
    
    final_qntl = entry.get("qntl", 0) - entry.get("bag", 0) / 100
    cash_taken = entry.get("cash_paid", 0) or 0
    diesel_taken = entry.get("diesel_paid", 0) or 0
    net_amount = (final_qntl * rate) - cash_taken - diesel_taken
    
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    payments_history.append({
        "amount": net_amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "Full payment - marked as paid",
        "by": username
    })
    
    await db.truck_payments.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "entry_id": entry_id,
            "paid_amount": net_amount,
            "payments_history": payments_history,
            "status": "paid",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Auto-create Cash Book Nikasi entry
    if net_amount > 0:
        kms_year = entry.get("kms_year", "")
        season = entry.get("season", "")
        truck_no = entry.get("truck_no", "")
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "category": "Truck Payment",
            "description": f"Truck Payment: {truck_no} (Full - Mark Paid)",
            "amount": round(net_amount, 2),
            "reference": f"truck_markpaid:{entry_id}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"truck:{entry_id}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cb_entry)
    
    return {"success": True, "message": "Truck payment cleared"}


# ============ AGENT PAYMENT ENDPOINTS ============

@router.get("/agent-payments", response_model=List[AgentPaymentStatus])
async def get_agent_payments(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all agent payments based on mandi targets (not achieved)"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    # Get all mandi targets
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    
    payments = []
    for target in targets:
        mandi_name = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_percent = target["cutting_percent"]
        cutting_qntl = round(target_qntl * cutting_percent / 100, 2)
        expected_total = target["expected_total"]
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        
        # Calculate amounts
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_amount = round(target_amount + cutting_amount, 2)
        
        # Get achieved for this mandi (case-insensitive)
        entry_query = {
            "mandi_name": {"$regex": f"^{mandi_name}$", "$options": "i"},
            "kms_year": target["kms_year"],
            "season": target["season"]
        }
        pipeline = [
            {"$match": entry_query},
            {"$group": {
                "_id": None, 
                "total_final_w": {"$sum": "$final_w"},
                "agent_name": {"$first": "$agent_name"}
            }}
        ]
        result = await db.mill_entries.aggregate(pipeline).to_list(1)
        achieved_kg = result[0]["total_final_w"] if result else 0
        achieved_qntl = round(achieved_kg / 100, 2)
        agent_name = result[0]["agent_name"] if result else mandi_name
        
        is_target_complete = achieved_qntl >= expected_total
        
        # Get payment record
        payment_doc = await db.agent_payments.find_one({
            "mandi_name": mandi_name,
            "kms_year": target["kms_year"],
            "season": target["season"]
        }, {"_id": 0})
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        balance = round(total_amount - paid_amount, 2)
        status = "paid" if balance <= 0 else ("partial" if paid_amount > 0 else "pending")
        
        payments.append(AgentPaymentStatus(
            mandi_name=mandi_name,
            agent_name=agent_name,
            target_qntl=target_qntl,
            cutting_percent=cutting_percent,
            cutting_qntl=cutting_qntl,
            base_rate=base_rate,
            cutting_rate=cutting_rate,
            target_amount=target_amount,
            cutting_amount=cutting_amount,
            total_amount=total_amount,
            achieved_qntl=achieved_qntl,
            is_target_complete=is_target_complete,
            paid_amount=paid_amount,
            balance_amount=max(0, balance),
            status=status,
            kms_year=target["kms_year"],
            season=target["season"]
        ))
    
    return payments


@router.post("/agent-payments/{mandi_name}/pay")
async def make_agent_payment(mandi_name: str, request: MakePaymentRequest, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Record a payment for agent/mandi (partial or full)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin payment kar sakta hai")
    
    # Get or create payment record
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    current_paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    
    new_paid = current_paid + request.amount
    payments_history.append({
        "amount": request.amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": request.note,
        "by": username
    })
    
    await db.agent_payments.update_one(
        {"mandi_name": mandi_name, "kms_year": kms_year, "season": season},
        {"$set": {
            "mandi_name": mandi_name,
            "kms_year": kms_year,
            "season": season,
            "paid_amount": new_paid,
            "payments_history": payments_history,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Auto-create Cash Book Nikasi entry for agent payment
    if request.amount > 0:
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "category": "Agent Payment",
            "description": f"Agent Payment: {mandi_name} - Rs.{request.amount}",
            "amount": round(request.amount, 2),
            "reference": f"agent_pay:{mandi_name[:10]}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"agent:{mandi_name}:{kms_year}:{season}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cb_entry)
    
    return {"success": True, "message": f"Rs.{request.amount} payment recorded", "total_paid": new_paid}


@router.post("/agent-payments/{mandi_name}/mark-paid")
async def mark_agent_paid(mandi_name: str, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Mark agent/mandi payment as fully paid"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin paid mark kar sakta hai")
    
    # Get target for this mandi
    target = await db.mandi_targets.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    if not target:
        raise HTTPException(status_code=404, detail="Mandi target not found")
    
    # Calculate total amount based on target
    target_qntl = target["target_qntl"]
    cutting_qntl = target_qntl * target["cutting_percent"] / 100
    base_rate = target.get("base_rate", 10)
    cutting_rate = target.get("cutting_rate", 5)
    total_amount = (target_qntl * base_rate) + (cutting_qntl * cutting_rate)
    
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    payments_history.append({
        "amount": total_amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "Full payment - marked as paid",
        "by": username
    })
    
    await db.agent_payments.update_one(
        {"mandi_name": mandi_name, "kms_year": kms_year, "season": season},
        {"$set": {
            "mandi_name": mandi_name,
            "kms_year": kms_year,
            "season": season,
            "paid_amount": total_amount,
            "payments_history": payments_history,
            "status": "paid",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    # Auto-create Cash Book Nikasi entry for agent mark-paid
    if total_amount > 0:
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "category": "Agent Payment",
            "description": f"Agent Payment: {mandi_name} (Full - Mark Paid)",
            "amount": round(total_amount, 2),
            "reference": f"agent_markpaid:{mandi_name[:10]}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"agent:{mandi_name}:{kms_year}:{season}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cb_entry)
    
    return {"success": True, "message": "Agent/Mandi payment cleared"}


@router.post("/truck-payments/{entry_id}/undo-paid")
async def undo_truck_paid(entry_id: str, username: str = "", role: str = ""):
    """Undo paid status - reset payment to 0 (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin undo kar sakta hai")
    
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    if not payment_doc:
        raise HTTPException(status_code=404, detail="Payment record not found")
    
    payments_history = payment_doc.get("payments_history", [])
    payments_history.append({
        "amount": -payment_doc.get("paid_amount", 0),
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "UNDO - Payment reversed",
        "by": username
    })
    
    await db.truck_payments.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "paid_amount": 0,
            "payments_history": payments_history,
            "status": "pending",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Delete linked cash book entries for this truck
    await db.cash_transactions.delete_many({"linked_payment_id": f"truck:{entry_id}"})
    
    return {"success": True, "message": "Payment undo ho gaya - status reset to pending"}


@router.post("/agent-payments/{mandi_name}/undo-paid")
async def undo_agent_paid(mandi_name: str, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Undo paid status - reset agent payment to 0 (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin undo kar sakta hai")
    
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    if not payment_doc:
        raise HTTPException(status_code=404, detail="Payment record not found")
    
    payments_history = payment_doc.get("payments_history", [])
    payments_history.append({
        "amount": -payment_doc.get("paid_amount", 0),
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "UNDO - Payment reversed",
        "by": username
    })
    
    await db.agent_payments.update_one(
        {"mandi_name": mandi_name, "kms_year": kms_year, "season": season},
        {"$set": {
            "paid_amount": 0,
            "payments_history": payments_history,
            "status": "pending",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Delete linked cash book entries for this agent
    await db.cash_transactions.delete_many({"linked_payment_id": f"agent:{mandi_name}:{kms_year}:{season}"})
    
    return {"success": True, "message": "Payment undo ho gaya - status reset to pending"}


@router.get("/truck-payments/{entry_id}/history")
async def get_truck_payment_history(entry_id: str):
    """Get payment history for a truck entry"""
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    if not payment_doc:
        return {"history": [], "total_paid": 0}
    
    return {
        "history": payment_doc.get("payments_history", []),
        "total_paid": payment_doc.get("paid_amount", 0)
    }


@router.get("/agent-payments/{mandi_name}/history")
async def get_agent_payment_history(mandi_name: str, kms_year: str = "", season: str = ""):
    """Get payment history for an agent/mandi"""
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    if not payment_doc:
        return {"history": [], "total_paid": 0}
    
    return {
        "history": payment_doc.get("payments_history", []),
        "total_paid": payment_doc.get("paid_amount", 0)
    }


@router.get("/export/agent-payments-excel")
async def export_agent_payments_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Export agent/mandi payments to styled Excel file"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    
    payments_data = []
    total_amount_sum = 0
    total_paid_sum = 0
    total_balance_sum = 0
    
    for target in targets:
        mandi_name = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_amount = round(target_amount + cutting_amount, 2)
        
        # Get achieved
        entry_query = {"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}
        pipeline = [{"$match": entry_query}, {"$group": {"_id": None, "total_final_w": {"$sum": "$final_w"}, "agent_name": {"$first": "$agent_name"}}}]
        result = await db.mill_entries.aggregate(pipeline).to_list(1)
        achieved_qntl = round(result[0]["total_final_w"] / 100, 2) if result else 0
        agent_name = result[0]["agent_name"] if result else mandi_name
        
        # Get payment
        payment_doc = await db.agent_payments.find_one({"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}, {"_id": 0})
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        balance = round(max(0, total_amount - paid_amount), 2)
        status = "Paid" if balance <= 0 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_amount_sum += total_amount
        total_paid_sum += paid_amount
        total_balance_sum += balance
        
        payments_data.append({
            "mandi_name": mandi_name,
            "agent_name": agent_name,
            "target_qntl": target_qntl,
            "cutting_qntl": cutting_qntl,
            "base_rate": base_rate,
            "cutting_rate": cutting_rate,
            "target_amount": target_amount,
            "cutting_amount": cutting_amount,
            "total_amount": total_amount,
            "achieved_qntl": achieved_qntl,
            "paid": paid_amount,
            "balance": balance,
            "status": status
        })
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Agent Payments"
    
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    total_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    paid_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    pending_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    ws.merge_cells('A1:M1')
    company_name, tagline = await get_company_name()
    ws['A1'] = f"AGENT/MANDI PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}"
    ws['A1'].font = Font(bold=True, size=14, color="D97706")
    ws['A1'].alignment = Alignment(horizontal='center')
    
    headers = ["Mandi", "Agent", "Target QNTL", "Cutting QNTL", "Base Rate", "Cut Rate", "Target Amt", "Cut Amt", "Total Amt", "Achieved", "Paid", "Balance", "Status"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
    
    for row_idx, p in enumerate(payments_data, 4):
        ws.cell(row=row_idx, column=1, value=p["mandi_name"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=2, value=p["agent_name"])
        ws.cell(row=row_idx, column=3, value=p["target_qntl"])
        ws.cell(row=row_idx, column=4, value=p["cutting_qntl"])
        ws.cell(row=row_idx, column=5, value=f"₹{p['base_rate']}")
        ws.cell(row=row_idx, column=6, value=f"₹{p['cutting_rate']}")
        ws.cell(row=row_idx, column=7, value=p["target_amount"])
        ws.cell(row=row_idx, column=8, value=p["cutting_amount"])
        ws.cell(row=row_idx, column=9, value=p["total_amount"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=10, value=p["achieved_qntl"])
        ws.cell(row=row_idx, column=11, value=p["paid"])
        ws.cell(row=row_idx, column=12, value=p["balance"]).font = Font(bold=True, color="DC2626" if p["balance"] > 0 else "059669")
        status_cell = ws.cell(row=row_idx, column=13, value=p["status"])
        if p["status"] == "Paid":
            status_cell.fill = paid_fill
        elif p["status"] == "Pending":
            status_cell.fill = pending_fill
    
    total_row = len(payments_data) + 4
    ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=9, value=round(total_amount_sum, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=11, value=round(total_paid_sum, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=12, value=round(total_balance_sum, 2)).font = Font(bold=True, color="DC2626")
    for col in range(1, 14):
        ws.cell(row=total_row, column=col).fill = total_fill
    
    col_widths = [14, 12, 12, 12, 10, 10, 12, 10, 12, 10, 10, 12, 10]
    for i, width in enumerate(col_widths, 1):
        ws.column_dimensions[chr(64 + i)].width = width
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"agent_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/agent-payments-pdf")
async def export_agent_payments_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Export agent/mandi payments to PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib.enums import TA_CENTER
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    
    payments_data = []
    total_amount_sum = 0
    total_paid_sum = 0
    total_balance_sum = 0
    
    for target in targets:
        mandi_name = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_amount = round(target_amount + cutting_amount, 2)
        
        entry_query = {"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}
        pipeline = [{"$match": entry_query}, {"$group": {"_id": None, "total_final_w": {"$sum": "$final_w"}, "agent_name": {"$first": "$agent_name"}}}]
        result = await db.mill_entries.aggregate(pipeline).to_list(1)
        achieved_qntl = round(result[0]["total_final_w"] / 100, 2) if result else 0
        
        payment_doc = await db.agent_payments.find_one({"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}, {"_id": 0})
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        balance = round(max(0, total_amount - paid_amount), 2)
        status = "Paid" if balance <= 0 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_amount_sum += total_amount
        total_paid_sum += paid_amount
        total_balance_sum += balance
        
        payments_data.append([
            mandi_name[:12],
            f"{target_qntl}",
            f"{cutting_qntl}",
            f"Rs.{base_rate}+Rs.{cutting_rate}",
            f"Rs.{total_amount}",
            f"{achieved_qntl}",
            f"Rs.{paid_amount}",
            f"Rs.{balance}",
            status
        ])
    
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.white, alignment=TA_CENTER)
    company_name, tagline = await get_company_name()
    title_data = [[Paragraph(f"<b>AGENT/MANDI PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}</b>", title_style)]]
    title_table = Table(title_data, colWidths=[page_width - 20*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(title_table)
    elements.append(Table([[""]], colWidths=[page_width], rowHeights=[5*mm]))
    
    headers = ["Mandi", "Target", "Cutting", "Rates", "Total Amt", "Achieved", "Paid", "Balance", "Status"]
    table_data = [headers] + payments_data
    table_data.append(["TOTAL", "", "", "", f"Rs.{round(total_amount_sum, 2)}", "", f"Rs.{round(total_paid_sum, 2)}", f"Rs.{round(total_balance_sum, 2)}", ""])
    
    col_widths = [30*mm, 20*mm, 18*mm, 25*mm, 25*mm, 20*mm, 22*mm, 22*mm, 18*mm]
    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F8FAFC')))
        if payments_data[i-1][-1] == "Paid":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#D1FAE5')))
        elif payments_data[i-1][-1] == "Pending":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#FEE2E2')))
    
    main_table.setStyle(TableStyle(style_commands))
    elements.append(main_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"agent_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


