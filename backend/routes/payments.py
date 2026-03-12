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

async def _find_truck_entry(entry_id):
    """Find entry from mill_entries, private_paddy, or rice_sales - return (entry, source, final_qntl)"""
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if entry:
        fq = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        return entry, "cmr", fq
    entry = await db.private_paddy.find_one({"id": entry_id}, {"_id": 0})
    if entry:
        return entry, "pvt", round(entry.get("final_qntl", 0), 2)
    entry = await db.rice_sales.find_one({"id": entry_id}, {"_id": 0})
    if entry:
        return entry, "rice_sale", round(entry.get("quantity_qntl", 0), 2)
    return None, None, 0

# ============ TRUCK PAYMENT ENDPOINTS ============

@router.get("/truck-payments", response_model=List[TruckPaymentStatus])
async def get_truck_payments(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all truck payments with their status"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(1000)
    
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
        
        # Status: pending if nothing paid, paid if balance ~0, partial otherwise
        if paid_amount == 0:
            status = "pending"
        elif balance < 0.10:
            status = "paid"
        elif paid_amount > 0:
            status = "partial"
        else:
            status = "pending"
        
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
    
    # Also include Pvt Paddy entries with truck_no (cash + diesel go to truck)
    pvt_query = dict(query)
    pvt_paddy = await db.private_paddy.find(pvt_query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(1000)
    for p in pvt_paddy:
        truck_no = p.get("truck_no", "")
        if not truck_no:
            continue
        cash_paid = float(p.get("cash_paid", 0) or 0)
        diesel_paid = float(p.get("diesel_paid", 0) or 0)
        deductions = round(cash_paid + diesel_paid, 2)
        party = p.get("party_name", "")
        mandi = p.get("mandi_name", "")
        party_label = f"{party} - {mandi}" if party and mandi else party
        final_qntl = round(p.get("final_qntl", 0), 2)
        # Check if rate/payment exists in truck_payments
        tp = await db.truck_payments.find_one({"entry_id": p["id"]}, {"_id": 0})
        rate = tp.get("rate_per_qntl", 0) if tp else 0
        extra_paid = tp.get("paid_amount", 0) if tp else 0
        tp_status = tp.get("status", "") if tp else ""
        gross = round(final_qntl * rate, 2) if rate > 0 else 0
        net = round(gross - deductions, 2) if gross > 0 else 0
        total_paid = round(deductions + extra_paid, 2)
        balance = round(net - extra_paid, 2) if gross > 0 else 0
        status = tp_status if tp_status else ("paid" if (gross > 0 and balance <= 0) else ("partial" if extra_paid > 0 else "pending"))
        payments.append(TruckPaymentStatus(
            entry_id=p.get("id", ""),
            truck_no=truck_no,
            date=p.get("date", ""),
            total_qntl=final_qntl,
            total_bag=int(p.get("bag", 0)),
            final_qntl=final_qntl,
            cash_taken=cash_paid,
            diesel_taken=diesel_paid,
            rate_per_qntl=rate,
            gross_amount=gross,
            deductions=deductions,
            net_amount=net,
            paid_amount=total_paid,
            balance_amount=balance,
            status=status,
            kms_year=p.get("kms_year", ""),
            season=p.get("season", ""),
            agent_name=p.get("agent_name", ""),
            mandi_name=party_label,
            source="Pvt Paddy"
        ))

    # Also include Rice Sale entries with truck_no (cash + diesel go to truck)
    rice_query = dict(query)
    rice_sales = await db.rice_sales.find(rice_query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(1000)
    for r in rice_sales:
        truck_no = r.get("truck_no", "")
        if not truck_no:
            continue
        cash_paid = float(r.get("cash_paid", 0) or 0)
        diesel_paid = float(r.get("diesel_paid", 0) or 0)
        if cash_paid == 0 and diesel_paid == 0:
            continue
        deductions = round(cash_paid + diesel_paid, 2)
        party = r.get("party_name", "")
        qty = r.get("quantity_qntl", 0) or 0
        tp = await db.truck_payments.find_one({"entry_id": r["id"]}, {"_id": 0})
        rate = tp.get("rate_per_qntl", 0) if tp else 0
        extra_paid = tp.get("paid_amount", 0) if tp else 0
        tp_status = tp.get("status", "") if tp else ""
        gross = round(qty * rate, 2) if rate > 0 else 0
        net = round(gross - deductions, 2) if gross > 0 else 0
        balance = round(net - extra_paid, 2) if gross > 0 else 0
        status = tp_status if tp_status else ("paid" if (gross > 0 and balance <= 0) else ("partial" if extra_paid > 0 else "pending"))
        payments.append(TruckPaymentStatus(
            entry_id=r.get("id", ""),
            truck_no=truck_no,
            date=r.get("date", ""),
            total_qntl=qty,
            total_bag=int(r.get("bags", 0)),
            final_qntl=qty,
            cash_taken=cash_paid,
            diesel_taken=diesel_paid,
            rate_per_qntl=rate,
            gross_amount=gross,
            deductions=deductions,
            net_amount=net,
            paid_amount=round(deductions + extra_paid, 2),
            balance_amount=max(0, balance),
            status=status,
            kms_year=r.get("kms_year", ""),
            season=r.get("season", ""),
            agent_name="",
            mandi_name=party,
            source="Rice Sale"
        ))

    # Also include Sale Book vouchers with truck_no
    sb_query = dict(query)
    sale_vouchers = await db.sale_vouchers.find(sb_query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(1000)
    for sv in sale_vouchers:
        truck_no = sv.get("truck_no", "")
        if not truck_no:
            continue
        cash_paid = float(sv.get("cash_paid", 0) or 0)
        diesel_paid = float(sv.get("diesel_paid", 0) or 0)
        if cash_paid == 0 and diesel_paid == 0:
            continue
        deductions = round(cash_paid + diesel_paid, 2)
        party = sv.get("party_name", "")
        items_str = ', '.join(i.get('item_name', '') for i in sv.get('items', []))
        inv = sv.get("invoice_no", "")
        label = f"Sale #{sv.get('voucher_no', '')} - {party}"
        if inv: label += f" ({inv})"
        payments.append(TruckPaymentStatus(
            entry_id=sv.get("id", ""),
            truck_no=truck_no,
            date=sv.get("date", ""),
            total_qntl=0,
            total_bag=0,
            final_qntl=0,
            cash_taken=cash_paid,
            diesel_taken=diesel_paid,
            rate_per_qntl=0,
            gross_amount=deductions,
            deductions=deductions,
            net_amount=0,
            paid_amount=deductions,
            balance_amount=0,
            status="paid",
            kms_year=sv.get("kms_year", ""),
            season=sv.get("season", ""),
            agent_name="",
            mandi_name=label,
            source="Sale Book"
        ))

    # Sort by date descending (newest first)
    payments.sort(key=lambda x: x.date, reverse=True)
    return payments


@router.put("/truck-payments/{entry_id}/rate")
async def set_truck_rate(entry_id: str, request: SetRateRequest, username: str = "", role: str = ""):
    """Set rate for a specific truck entry - auto-updates all entries with same truck_no + mandi_name"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin rate set kar sakta hai")
    
    entry, source, final_qntl = await _find_truck_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    truck_no = entry.get("truck_no", "")
    mandi_name = entry.get("mandi_name", "")
    updated_count = 0
    
    if source == "pvt":
        # For pvt paddy, just set rate on this single entry
        await db.truck_payments.update_one(
            {"entry_id": entry_id},
            {"$set": {"entry_id": entry_id, "rate_per_qntl": request.rate_per_qntl, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        updated_count = 1
    elif truck_no and mandi_name:
        # Find all entries with same truck_no + mandi_name
        matching = await db.mill_entries.find(
            {"truck_no": truck_no, "mandi_name": {"$regex": f"^{mandi_name}$", "$options": "i"}}, {"_id": 0}
        ).to_list(None)
        for m in matching:
            await db.truck_payments.update_one(
                {"entry_id": m["id"]},
                {"$set": {"entry_id": m["id"], "rate_per_qntl": request.rate_per_qntl, "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True
            )
            # Update Jama ledger entry with new rate
            final_qntl = round(m.get("qntl", 0) - m.get("bag", 0) / 100, 2)
            if final_qntl > 0:
                new_gross = round(final_qntl * request.rate_per_qntl, 2)
                cash_taken = float(m.get("cash_paid", 0) or 0)
                diesel_taken = float(m.get("diesel_paid", 0) or 0)
                deductions = cash_taken + diesel_taken
                await db.cash_transactions.update_one(
                    {"linked_entry_id": m["id"], "reference": {"$regex": "^truck_entry:"}},
                    {"$set": {
                        "amount": new_gross,
                        "description": f"Truck Entry: {truck_no} - {final_qntl}Q @ Rs.{request.rate_per_qntl}" + (f" (Ded: Rs.{deductions})" if deductions > 0 else ""),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
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
    
    entry, source, final_qntl = await _find_truck_entry(entry_id)
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
            "category": truck_no,
            "party_type": "Truck",
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

        # Ledger Nikasi - reduce truck outstanding
        ledger_entry = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "ledger",
            "txn_type": "nikasi",
            "category": truck_no,
            "party_type": "Truck",
            "description": f"Truck Payment: {truck_no} - Rs.{request.amount}",
            "amount": round(request.amount, 2),
            "reference": f"truck_pay_ledger:{entry_id[:8]}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"truck_ledger:{entry_id}:{uuid.uuid4().hex[:6]}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(ledger_entry)
    
    return {"success": True, "message": f"Rs.{request.amount} payment recorded", "total_paid": new_paid}


@router.post("/truck-payments/{entry_id}/mark-paid")
async def mark_truck_paid(entry_id: str, username: str = "", role: str = ""):
    """Mark truck payment as fully paid"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin paid mark kar sakta hai")
    
    entry, source, final_qntl = await _find_truck_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
    
    cash_taken = float(entry.get("cash_paid", 0) or 0)
    diesel_taken = float(entry.get("diesel_paid", 0) or 0)
    net_amount = round((final_qntl * rate) - cash_taken - diesel_taken, 2)
    
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
            "category": truck_no,
            "party_type": "Truck",
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

        # Ledger Nikasi - reduce truck outstanding
        ledger_entry = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "ledger",
            "txn_type": "nikasi",
            "category": truck_no,
            "party_type": "Truck",
            "description": f"Truck Payment: {truck_no} (Full - Mark Paid)",
            "amount": round(net_amount, 2),
            "reference": f"truck_markpaid_ledger:{entry_id}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"truck_ledger_markpaid:{entry_id}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(ledger_entry)
    
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
    
    # Auto-create Cash Book entries
    if request.amount > 0:
        # JAMA (Ledger) - Agent Commission (what we owe) - create once, update if needed
        # Calculate total_amount from mandi_targets
        target = await db.mandi_targets.find_one({"mandi_name": mandi_name, "kms_year": kms_year, "season": season}, {"_id": 0})
        if target:
            base_rate = target.get("base_rate", 0)
            cutting_rate = target.get("cutting_rate", 5)
            entries_for_mandi = await db.mill_entries.find(
                {"mandi_name": {"$regex": f"^{mandi_name}$", "$options": "i"}, "kms_year": kms_year},
                {"_id": 0, "qntl": 1, "bag": 1}
            ).to_list(None)
            achieved_qntl = round(sum(e.get("qntl", 0) - e.get("bag", 0) / 100 for e in entries_for_mandi), 2)
            target_qntl = target.get("target_qntl", 0)
            cutting_percent = target.get("cutting_percent", 0)
            cutting_qntl = round(achieved_qntl * cutting_percent / 100, 2) if cutting_percent > 0 else 0
            total_amount = round((target_qntl * base_rate) + (cutting_qntl * cutting_rate), 2)
            
            linked_id = f"agent_jama:{mandi_name}:{kms_year}:{season}"
            existing_jama = await db.cash_transactions.find_one({"linked_payment_id": linked_id}, {"_id": 0})
            if not existing_jama and total_amount > 0:
                jama_entry = {
                    "id": str(uuid.uuid4()),
                    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "account": "ledger", "txn_type": "jama",
                    "category": mandi_name, "party_type": "Agent",
                    "description": f"Agent Commission: {mandi_name} @ Rs.{base_rate}",
                    "amount": round(total_amount, 2),
                    "reference": f"agent_comm:{mandi_name[:10]}",
                    "kms_year": kms_year, "season": season,
                    "created_by": username or "system",
                    "linked_payment_id": linked_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                await db.cash_transactions.insert_one(jama_entry)
            elif existing_jama and total_amount > 0:
                await db.cash_transactions.update_one(
                    {"linked_payment_id": linked_id},
                    {"$set": {"amount": round(total_amount, 2),
                              "description": f"Agent Commission: {mandi_name} @ Rs.{base_rate}",
                              "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
        
        # NIKASI (Cash) - Agent Payment
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "category": mandi_name,
            "party_type": "Agent",
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

        # NIKASI (Ledger) - Reduce agent outstanding in party ledger
        ledger_nikasi = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "ledger",
            "txn_type": "nikasi",
            "category": mandi_name,
            "party_type": "Agent",
            "description": f"Agent Payment: {mandi_name} - Rs.{request.amount}",
            "amount": round(request.amount, 2),
            "reference": f"agent_pay_ledger:{mandi_name[:10]}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"agent_ledger_pay:{mandi_name}:{kms_year}:{season}:{uuid.uuid4().hex[:6]}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(ledger_nikasi)
    
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
    
    # Auto-create Cash Book entries for agent mark-paid
    if total_amount > 0:
        # JAMA (Ledger) - Agent Commission entry
        entries_for_mandi = await db.mill_entries.find(
            {"mandi_name": {"$regex": f"^{mandi_name}$", "$options": "i"}, "kms_year": kms_year},
            {"_id": 0, "qntl": 1, "bag": 1}
        ).to_list(None)
        achieved_qntl = round(sum(e.get("qntl", 0) - e.get("bag", 0) / 100 for e in entries_for_mandi), 2)
        cutting_qntl = round(achieved_qntl * target.get("cutting_percent", 0) / 100, 2) if target.get("cutting_percent", 0) > 0 else 0

        linked_jama_id = f"agent_jama:{mandi_name}:{kms_year}:{season}"
        existing_jama = await db.cash_transactions.find_one({"linked_payment_id": linked_jama_id}, {"_id": 0})
        if not existing_jama:
            jama_entry = {
                "id": str(uuid.uuid4()),
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "account": "ledger", "txn_type": "jama",
                "category": mandi_name, "party_type": "Agent",
                "description": f"Agent Commission: {mandi_name} @ Rs.{base_rate}",
                "amount": round(total_amount, 2),
                "reference": f"agent_comm:{mandi_name[:10]}",
                "kms_year": kms_year, "season": season,
                "created_by": username or "system",
                "linked_payment_id": linked_jama_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.cash_transactions.insert_one(jama_entry)
        elif existing_jama:
            await db.cash_transactions.update_one(
                {"linked_payment_id": linked_jama_id},
                {"$set": {"amount": round(total_amount, 2),
                          "description": f"Agent Commission: {mandi_name} @ Rs.{base_rate}",
                          "updated_at": datetime.now(timezone.utc).isoformat()}}
            )

        # NIKASI (Cash) - Agent Payment
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "cash",
            "txn_type": "nikasi",
            "category": mandi_name,
            "party_type": "Agent",
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

        # NIKASI (Ledger) - Reduce agent outstanding in party ledger
        ledger_nikasi = {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "account": "ledger",
            "txn_type": "nikasi",
            "category": mandi_name,
            "party_type": "Agent",
            "description": f"Agent Payment: {mandi_name} (Full - Mark Paid)",
            "amount": round(total_amount, 2),
            "reference": f"agent_markpaid_ledger:{mandi_name[:10]}",
            "kms_year": kms_year,
            "season": season,
            "created_by": username or "system",
            "linked_payment_id": f"agent_ledger_markpaid:{mandi_name}:{kms_year}:{season}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(ledger_nikasi)
    
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
    
    # Also find the truck_no for this entry and clean up owner-level cash entries
    entry, source, _ = await _find_truck_entry(entry_id)
    if entry:
        truck_no = entry.get("truck_no", "")
        kms_year = entry.get("kms_year", "")
        season = entry.get("season", "")
        if truck_no:
            # Delete owner-level cash entries (they'll be recreated when user marks paid again)
            await db.cash_transactions.delete_many({
                "linked_payment_id": {"$regex": f"^truck_owner:{truck_no}:"}
            })
    
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
    
    # Delete linked cash book entries for this agent (both nikasi and jama)
    await db.cash_transactions.delete_many({"linked_payment_id": f"agent:{mandi_name}:{kms_year}:{season}"})
    await db.cash_transactions.delete_many({"linked_payment_id": f"agent_jama:{mandi_name}:{kms_year}:{season}"})
    
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



# ===== TRUCK OWNER CONSOLIDATED PAYMENT ENDPOINTS =====

@router.post("/truck-owner/{truck_no}/pay")
async def pay_truck_owner(truck_no: str, request: Request, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Make partial payment to truck owner - distributes across all trips"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin payment kar sakta hai")
    
    body = await request.json()
    amount = float(body.get("amount", 0))
    note = body.get("note", "")
    payment_mode = body.get("payment_mode", "cash")
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount 0 se zyada hona chahiye")
    
    # Get all entries for this truck
    query = {"truck_no": truck_no}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.mill_entries.find(query, {"_id": 0}).to_list(None)
    if not entries:
        raise HTTPException(status_code=404, detail="Is truck ke entries nahi mile")
    
    # Distribute payment across unpaid trips (oldest first)
    remaining = amount
    for entry in sorted(entries, key=lambda e: e.get("date", "")):
        if remaining <= 0:
            break
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        rate = payment_doc.get("rate_per_qntl", 0) if payment_doc else 0
        paid_so_far = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        cash_taken = float(entry.get("cash_paid", 0) or 0)
        diesel_taken = float(entry.get("diesel_paid", 0) or 0)
        gross = round(final_qntl * rate, 2)
        net = round(gross - cash_taken - diesel_taken, 2)
        trip_balance = max(0, round(net - paid_so_far, 2))
        
        if trip_balance <= 0:
            continue
        
        allot = min(remaining, trip_balance)
        new_paid = round(paid_so_far + allot, 2)
        new_balance = max(0, round(net - new_paid, 2))
        
        history = payment_doc.get("payments_history", []) if payment_doc else []
        history.append({
            "amount": allot, "date": datetime.now(timezone.utc).isoformat(),
            "note": f"Owner Payment: {note}" if note else "Owner Payment",
            "by": username, "payment_mode": payment_mode
        })
        
        if new_balance < 0.10:
            status = "paid"
        elif new_paid > 0:
            status = "partial"
        else:
            status = "pending"
        
        await db.truck_payments.update_one(
            {"entry_id": entry_id},
            {"$set": {
                "entry_id": entry_id, "paid_amount": new_paid,
                "payments_history": history, "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        remaining = round(remaining - allot, 2)
    
    # Create cash book entry (Cash/Bank Nikasi)
    txn_id = f"txn_{datetime.now().strftime('%Y%m%d%H%M%S')}_{truck_no}"
    cash_txn = {
        "id": txn_id,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "account": payment_mode,
        "txn_type": "nikasi",
        "category": truck_no,
        "party_type": "Truck",
        "description": f"Truck Owner Payment: {truck_no}" + (f" - {note}" if note else ""),
        "amount": amount,
        "reference": f"truck_owner:{truck_no}",
        "linked_payment_id": f"truck_owner:{truck_no}:{kms_year}:{season}",
        "kms_year": kms_year,
        "season": season,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.cash_transactions.insert_one(cash_txn)

    # Ledger Nikasi - reduce truck outstanding
    ledger_txn = {
        "id": f"txn_ledger_{datetime.now().strftime('%Y%m%d%H%M%S')}_{truck_no}",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "account": "ledger",
        "txn_type": "nikasi",
        "category": truck_no,
        "party_type": "Truck",
        "description": f"Truck Owner Payment: {truck_no}" + (f" - {note}" if note else ""),
        "amount": amount,
        "reference": f"truck_owner_ledger:{truck_no}",
        "linked_payment_id": f"truck_owner_ledger:{truck_no}:{kms_year}:{season}:{uuid.uuid4().hex[:6]}",
        "kms_year": kms_year,
        "season": season,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.cash_transactions.insert_one(ledger_txn)
    
    # Store owner payment history
    owner_doc = await db.truck_owner_payments.find_one({"truck_no": truck_no, "kms_year": kms_year, "season": season})
    owner_history = owner_doc.get("payments_history", []) if owner_doc else []
    owner_history.append({
        "amount": amount, "date": datetime.now(timezone.utc).isoformat(),
        "note": note, "by": username, "payment_mode": payment_mode
    })
    await db.truck_owner_payments.update_one(
        {"truck_no": truck_no, "kms_year": kms_year, "season": season},
        {"$set": {"payments_history": owner_history, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    return {"success": True, "message": f"₹{amount:,.0f} payment ho gaya! ({round(amount - remaining, 0)} distributed)"}


@router.post("/truck-owner/{truck_no}/mark-paid")
async def mark_truck_owner_paid(truck_no: str, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Mark all trips for a truck as fully paid"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin mark paid kar sakta hai")
    
    query = {"truck_no": truck_no}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.mill_entries.find(query, {"_id": 0}).to_list(None)
    if not entries:
        raise HTTPException(status_code=404, detail="Entries nahi mile")
    
    total_marked = 0
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        rate = payment_doc.get("rate_per_qntl", 0) if payment_doc else 0
        paid_so_far = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        gross = round(final_qntl * rate, 2)
        deductions = float(entry.get("cash_paid", 0) or 0) + float(entry.get("diesel_paid", 0) or 0)
        net = round(gross - deductions, 2)
        
        if paid_so_far >= net and net > 0:
            continue  # Already paid
        
        trip_balance = max(0, round(net - paid_so_far, 2))
        total_marked += trip_balance
        
        history = payment_doc.get("payments_history", []) if payment_doc else []
        history.append({
            "amount": trip_balance, "date": datetime.now(timezone.utc).isoformat(),
            "note": "Owner Mark Paid (Full)", "by": username
        })
        
        await db.truck_payments.update_one(
            {"entry_id": entry_id},
            {"$set": {
                "entry_id": entry_id, "paid_amount": net,
                "payments_history": history, "status": "paid",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
    
    if total_marked > 0:
        # Cash book nikasi
        txn_id = f"txn_{datetime.now().strftime('%Y%m%d%H%M%S')}_{truck_no}_full"
        await db.cash_transactions.insert_one({
            "id": txn_id, "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "cash", "txn_type": "nikasi",
            "category": truck_no, "party_type": "Truck",
            "description": f"Truck Owner Full Payment: {truck_no}",
            "amount": total_marked,
            "reference": f"truck_owner:{truck_no}",
            "linked_payment_id": f"truck_owner:{truck_no}:{kms_year}:{season}",
            "kms_year": kms_year, "season": season,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Ledger Nikasi - reduce truck outstanding
        await db.cash_transactions.insert_one({
            "id": f"txn_ledger_{datetime.now().strftime('%Y%m%d%H%M%S')}_{truck_no}_full",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "account": "ledger", "txn_type": "nikasi",
            "category": truck_no, "party_type": "Truck",
            "description": f"Truck Owner Full Payment: {truck_no}",
            "amount": total_marked,
            "reference": f"truck_owner_ledger:{truck_no}",
            "linked_payment_id": f"truck_owner_ledger_markpaid:{truck_no}:{kms_year}:{season}",
            "kms_year": kms_year, "season": season,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    return {"success": True, "message": f"Sab trips paid! ₹{total_marked:,.0f} mark paid kiya"}


@router.post("/truck-owner/{truck_no}/undo-paid")
async def undo_truck_owner_paid(truck_no: str, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Undo all payments for a truck owner - resets all trips"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin undo kar sakta hai")
    
    query = {"truck_no": truck_no}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.mill_entries.find(query, {"_id": 0}).to_list(None)
    
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        if payment_doc:
            history = payment_doc.get("payments_history", [])
            history.append({
                "amount": -payment_doc.get("paid_amount", 0),
                "date": datetime.now(timezone.utc).isoformat(),
                "note": "UNDO - Owner payment reversed", "by": username
            })
            await db.truck_payments.update_one(
                {"entry_id": entry_id},
                {"$set": {"paid_amount": 0, "payments_history": history, "status": "pending", "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        # Also delete individual linked entries
        await db.cash_transactions.delete_many({"linked_payment_id": f"truck:{entry_id}"})
    
    # Delete owner-level cash transactions
    await db.cash_transactions.delete_many({"linked_payment_id": f"truck_owner:{truck_no}:{kms_year}:{season}"})
    
    return {"success": True, "message": f"{truck_no} ke saare payments undo ho gaye"}


@router.get("/truck-owner/{truck_no}/history")
async def get_truck_owner_history(truck_no: str, kms_year: str = "", season: str = ""):
    """Get consolidated payment history for a truck owner"""
    owner_doc = await db.truck_owner_payments.find_one(
        {"truck_no": truck_no, "kms_year": kms_year, "season": season}, {"_id": 0}
    )
    
    # Also get individual trip payments
    query = {"truck_no": truck_no}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.mill_entries.find(query, {"_id": 0, "id": 1}).to_list(None)
    
    all_history = []
    if owner_doc:
        for h in owner_doc.get("payments_history", []):
            all_history.append({**h, "source": "owner"})
    
    for entry in entries:
        payment_doc = await db.truck_payments.find_one({"entry_id": entry["id"]}, {"_id": 0})
        if payment_doc:
            for h in payment_doc.get("payments_history", []):
                if "Owner" not in h.get("note", ""):
                    all_history.append({**h, "source": "trip", "entry_id": entry["id"]})
    
    all_history.sort(key=lambda x: x.get("date", ""), reverse=True)
    return {"history": all_history}


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


