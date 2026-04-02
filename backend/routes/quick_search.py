from fastapi import APIRouter, Query
from database import db
from typing import Optional
import re

router = APIRouter()


@router.get("/quick-search")
async def quick_search(q: str = Query(..., min_length=1), limit: int = Query(5, ge=1, le=20)):
    """Search across all collections. Returns grouped results."""
    if not q or len(q.strip()) < 1:
        return {"results": [], "total": 0}

    q = q.strip()
    rgx = {"$regex": re.escape(q), "$options": "i"}
    results = []

    # 1. Mill Entries
    entries_cur = db["mill_entries"].find(
        {"$or": [
            {"truck_no": rgx}, {"agent_name": rgx}, {"mandi_name": rgx},
            {"rst_no": rgx}, {"tp_no": rgx}
        ]},
        {"_id": 0, "id": 1, "date": 1, "truck_no": 1, "agent_name": 1, "mandi_name": 1, "rst_no": 1, "kg": 1, "qntl": 1}
    ).sort("created_at", -1).limit(limit)
    async for e in entries_cur:
        results.append({
            "id": e.get("id"), "type": "entry", "tab": "entries",
            "title": f"Truck: {e.get('truck_no', '')}",
            "subtitle": f"{e.get('agent_name', '')} - {e.get('mandi_name', '')} | {e.get('kg', 0)} kg",
            "date": e.get("date", ""), "data": e
        })

    # 2. Cash Transactions
    cash_cur = db["cash_transactions"].find(
        {"$or": [{"category": rgx}, {"description": rgx}, {"party_type": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "category": 1, "description": 1, "amount": 1, "txn_type": 1, "account": 1}
    ).sort("created_at", -1).limit(limit)
    async for t in cash_cur:
        txn_label = "Jama" if t.get("txn_type") == "jama" else "Nikasi"
        results.append({
            "id": t.get("id"), "type": "cash_transaction", "tab": "cashbook",
            "title": f"{t.get('category', '')} ({txn_label})",
            "subtitle": f"Rs.{t.get('amount', 0):,.0f} | {t.get('description', '')[:60]}",
            "date": t.get("date", ""), "data": t
        })

    # 3. Private Paddy
    pvt_cur = db["private_paddy"].find(
        {"$or": [{"party_name": rgx}, {"mandi_name": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "party_name": 1, "mandi_name": 1, "total_amount": 1, "balance": 1}
    ).sort("created_at", -1).limit(limit)
    async for p in pvt_cur:
        results.append({
            "id": p.get("id"), "type": "private_paddy", "tab": "payments",
            "title": f"Private: {p.get('party_name', '')}",
            "subtitle": f"{p.get('mandi_name', '')} | Total: Rs.{p.get('total_amount', 0):,.0f}",
            "date": p.get("date", ""), "data": p
        })

    # 4. Sale Vouchers
    sale_cur = db["sale_vouchers"].find(
        {"$or": [{"party_name": rgx}, {"voucher_no": rgx}, {"truck_no": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "party_name": 1, "voucher_no": 1, "total": 1}
    ).sort("created_at", -1).limit(limit)
    async for s in sale_cur:
        results.append({
            "id": s.get("id"), "type": "sale_voucher", "tab": "vouchers",
            "title": f"Sale: {s.get('party_name', '')}",
            "subtitle": f"Voucher #{s.get('voucher_no', '')} | Rs.{s.get('total', 0):,.0f}",
            "date": s.get("date", ""), "data": s
        })

    # 5. Purchase Vouchers
    pur_cur = db["purchase_vouchers"].find(
        {"$or": [{"party_name": rgx}, {"voucher_no": rgx}, {"truck_no": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "party_name": 1, "voucher_no": 1, "total": 1}
    ).sort("created_at", -1).limit(limit)
    async for pv in pur_cur:
        results.append({
            "id": pv.get("id"), "type": "purchase_voucher", "tab": "vouchers",
            "title": f"Purchase: {pv.get('party_name', '')}",
            "subtitle": f"Voucher #{pv.get('voucher_no', '')} | Rs.{pv.get('total', 0):,.0f}",
            "date": pv.get("date", ""), "data": pv
        })

    # 6. DC Entries
    dc_cur = db["dc_entries"].find(
        {"$or": [{"party_name": rgx}, {"vehicle_no": rgx}, {"lot_no": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "party_name": 1, "vehicle_no": 1, "lot_no": 1, "paddy_type": 1}
    ).sort("created_at", -1).limit(limit)
    async for dc in dc_cur:
        results.append({
            "id": dc.get("id"), "type": "dc_entry", "tab": "dctracker",
            "title": f"DC: {dc.get('party_name', '')}",
            "subtitle": f"Vehicle: {dc.get('vehicle_no', '')} | Lot: {dc.get('lot_no', '')}",
            "date": dc.get("date", ""), "data": dc
        })

    # 7. Staff
    staff_cur = db["staff"].find(
        {"$or": [{"name": rgx}, {"phone": rgx}, {"role": rgx}]},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "role": 1, "salary": 1}
    ).limit(limit)
    async for st in staff_cur:
        results.append({
            "id": st.get("id"), "type": "staff", "tab": "staff",
            "title": f"Staff: {st.get('name', '')}",
            "subtitle": f"{st.get('role', '')} | Rs.{st.get('salary', 0):,.0f}",
            "date": "", "data": st
        })

    # 8. Milling Entries
    mill_cur = db["milling_entries"].find(
        {"$or": [{"rice_type": rgx}, {"note": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "rice_type": 1, "paddy_input_qntl": 1, "rice_qntl": 1, "outturn_ratio": 1}
    ).sort("created_at", -1).limit(limit)
    async for ml in mill_cur:
        results.append({
            "id": ml.get("id"), "type": "milling", "tab": "milling",
            "title": f"Milling: {ml.get('rice_type', '')}",
            "subtitle": f"Paddy: {ml.get('paddy_input_qntl', 0)}Q | Rice: {ml.get('rice_qntl', 0)}Q | OT: {ml.get('outturn_ratio', 0)}%",
            "date": ml.get("date", ""), "data": ml
        })

    # 9. Diesel Accounts
    diesel_cur = db["diesel_accounts"].find(
        {"$or": [{"truck_no": rgx}, {"pump_name": rgx}, {"description": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "truck_no": 1, "pump_name": 1, "amount": 1}
    ).sort("created_at", -1).limit(limit)
    async for d in diesel_cur:
        results.append({
            "id": d.get("id"), "type": "diesel", "tab": "cashbook",
            "title": f"Diesel: {d.get('truck_no', '')}",
            "subtitle": f"{d.get('pump_name', '')} | Rs.{d.get('amount', 0):,.0f}",
            "date": d.get("date", ""), "data": d
        })

    # 10. Mill Parts Stock
    parts_cur = db["mill_parts_stock"].find(
        {"$or": [{"part_name": rgx}, {"party_name": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "part_name": 1, "party_name": 1, "total_amount": 1, "quantity": 1}
    ).sort("created_at", -1).limit(limit)
    async for mp in parts_cur:
        results.append({
            "id": mp.get("id"), "type": "mill_part", "tab": "mill-parts",
            "title": f"Part: {mp.get('part_name', '')}",
            "subtitle": f"{mp.get('party_name', '')} | Rs.{mp.get('total_amount', 0):,.0f}",
            "date": mp.get("date", ""), "data": mp
        })

    # 11. Hemali Payments
    hemali_cur = db["hemali_payments"].find(
        {"$or": [{"sardar_name": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "sardar_name": 1, "total": 1, "status": 1}
    ).sort("created_at", -1).limit(limit)
    async for h in hemali_cur:
        results.append({
            "id": h.get("id"), "type": "hemali", "tab": "hemali",
            "title": f"Hemali: {h.get('sardar_name', '')}",
            "subtitle": f"Rs.{h.get('total', 0):,.0f} | {h.get('status', '')}",
            "date": h.get("date", ""), "data": h
        })

    # 12. Rice Sales
    rice_cur = db["rice_sales"].find(
        {"$or": [{"buyer_name": rgx}, {"party_name": rgx}]},
        {"_id": 0, "id": 1, "date": 1, "buyer_name": 1, "party_name": 1, "total_amount": 1}
    ).sort("created_at", -1).limit(limit)
    async for rs in rice_cur:
        results.append({
            "id": rs.get("id"), "type": "rice_sale", "tab": "payments",
            "title": f"Rice Sale: {rs.get('buyer_name', '') or rs.get('party_name', '')}",
            "subtitle": f"Rs.{rs.get('total_amount', 0):,.0f}",
            "date": rs.get("date", ""), "data": rs
        })

    # 13. Truck Leases
    lease_cur = db["truck_leases"].find(
        {"$or": [{"truck_no": rgx}, {"owner_name": rgx}]},
        {"_id": 0, "id": 1, "truck_no": 1, "owner_name": 1, "monthly_rent": 1}
    ).limit(limit)
    async for tl in lease_cur:
        results.append({
            "id": tl.get("id"), "type": "truck_lease", "tab": "payments",
            "title": f"Lease: {tl.get('truck_no', '')}",
            "subtitle": f"Owner: {tl.get('owner_name', '')} | Rent: Rs.{tl.get('monthly_rent', 0):,.0f}",
            "date": "", "data": tl
        })

    return {"results": results, "total": len(results), "query": q}
