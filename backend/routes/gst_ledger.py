from fastapi import APIRouter, HTTPException, Request
from database import db
from datetime import datetime, timezone
from typing import Optional
import uuid

router = APIRouter()

# ============ GST LEDGER & OPENING BALANCE ============

@router.get("/gst-ledger/opening-balance")
async def get_gst_opening_balance(kms_year: str):
    saved = await db.gst_opening_balances.find_one({"kms_year": kms_year}, {"_id": 0})
    if saved:
        return {"igst": saved.get("igst", 0), "sgst": saved.get("sgst", 0), "cgst": saved.get("cgst", 0), "kms_year": kms_year, "source": "manual"}
    return {"igst": 0, "sgst": 0, "cgst": 0, "kms_year": kms_year, "source": "none"}

@router.put("/gst-ledger/opening-balance")
async def save_gst_opening_balance(request: Request):
    data = await request.json()
    kms_year = data.get("kms_year")
    if not kms_year:
        raise HTTPException(status_code=400, detail="kms_year is required")
    doc = {
        "kms_year": kms_year,
        "igst": float(data.get("igst", 0)),
        "sgst": float(data.get("sgst", 0)),
        "cgst": float(data.get("cgst", 0)),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.gst_opening_balances.update_one({"kms_year": kms_year}, {"$set": doc}, upsert=True)
    return doc


@router.get("/gst-ledger")
async def get_gst_ledger(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Compute GST ledger from all vouchers (purchase = credit/add, sale = debit/minus)"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    # Get opening balance
    ob = {"igst": 0, "sgst": 0, "cgst": 0}
    if kms_year:
        saved_ob = await db.gst_opening_balances.find_one({"kms_year": kms_year}, {"_id": 0})
        if saved_ob:
            ob = {"igst": saved_ob.get("igst", 0), "sgst": saved_ob.get("sgst", 0), "cgst": saved_ob.get("cgst", 0)}

    entries = []

    # Purchase vouchers → GST credit (add)
    purchases = await db.purchase_vouchers.find(query, {"_id": 0}).sort("date", 1).to_list(5000)
    for p in purchases:
        cgst = p.get("cgst_amount", 0) or 0
        sgst = p.get("sgst_amount", 0) or 0
        igst = p.get("igst_amount", 0) or 0
        if cgst > 0 or sgst > 0 or igst > 0:
            entries.append({
                "date": p.get("date", ""), "type": "purchase", "voucher_type": "Purchase",
                "voucher_no": p.get("voucher_no", ""), "party": p.get("party_name", ""),
                "description": f"Purchase #{p.get('voucher_no','')} - {p.get('party_name','')}",
                "cgst": round(cgst, 2), "sgst": round(sgst, 2), "igst": round(igst, 2),
                "direction": "credit", "id": p.get("id", "")
            })

    # Gunny Bag purchases → GST credit (add)
    gunnys = await db.gunny_bags.find({**query, "txn_type": "in"}, {"_id": 0}).sort("date", 1).to_list(5000)
    for g in gunnys:
        cgst = g.get("cgst_amount", 0) or 0
        sgst = g.get("sgst_amount", 0) or 0
        igst = g.get("gst_amount", 0) or 0  # igst stored as gst_amount in gunny
        if g.get("gst_type") == "igst":
            igst = g.get("gst_amount", 0) or 0
            cgst = 0; sgst = 0
        elif g.get("gst_type") == "cgst_sgst":
            igst = 0
        if cgst > 0 or sgst > 0 or igst > 0:
            entries.append({
                "date": g.get("date", ""), "type": "purchase", "voucher_type": "Gunny Bag",
                "voucher_no": g.get("invoice_no", ""), "party": g.get("party_name", g.get("source", "")),
                "description": f"Gunny Bag - {g.get('party_name', g.get('source',''))}",
                "cgst": round(cgst, 2), "sgst": round(sgst, 2), "igst": round(igst, 2),
                "direction": "credit", "id": g.get("id", "")
            })

    # Sale vouchers → GST debit (minus)
    sales = await db.sale_vouchers.find(query, {"_id": 0}).sort("date", 1).to_list(5000)
    for s in sales:
        cgst = s.get("cgst_amount", 0) or 0
        sgst = s.get("sgst_amount", 0) or 0
        igst = s.get("igst_amount", 0) or 0
        if cgst > 0 or sgst > 0 or igst > 0:
            entries.append({
                "date": s.get("date", ""), "type": "sale", "voucher_type": "Sale",
                "voucher_no": s.get("voucher_no", ""), "party": s.get("party_name", ""),
                "description": f"Sale #{s.get('voucher_no','')} - {s.get('party_name','')}",
                "cgst": round(cgst, 2), "sgst": round(sgst, 2), "igst": round(igst, 2),
                "direction": "debit", "id": s.get("id", "")
            })

    # Sort all entries by date
    entries.sort(key=lambda x: x.get("date", ""))

    # Calculate running balance
    running_cgst = ob["cgst"]
    running_sgst = ob["sgst"]
    running_igst = ob["igst"]
    for e in entries:
        if e["direction"] == "credit":
            running_cgst += e["cgst"]; running_sgst += e["sgst"]; running_igst += e["igst"]
        else:
            running_cgst -= e["cgst"]; running_sgst -= e["sgst"]; running_igst -= e["igst"]
        e["running_cgst"] = round(running_cgst, 2)
        e["running_sgst"] = round(running_sgst, 2)
        e["running_igst"] = round(running_igst, 2)

    # Summary
    total_credit_cgst = round(sum(e["cgst"] for e in entries if e["direction"] == "credit"), 2)
    total_credit_sgst = round(sum(e["sgst"] for e in entries if e["direction"] == "credit"), 2)
    total_credit_igst = round(sum(e["igst"] for e in entries if e["direction"] == "credit"), 2)
    total_debit_cgst = round(sum(e["cgst"] for e in entries if e["direction"] == "debit"), 2)
    total_debit_sgst = round(sum(e["sgst"] for e in entries if e["direction"] == "debit"), 2)
    total_debit_igst = round(sum(e["igst"] for e in entries if e["direction"] == "debit"), 2)

    return {
        "opening_balance": ob,
        "entries": entries,
        "summary": {
            "credit": {"cgst": total_credit_cgst, "sgst": total_credit_sgst, "igst": total_credit_igst},
            "debit": {"cgst": total_debit_cgst, "sgst": total_debit_sgst, "igst": total_debit_igst},
            "balance": {
                "cgst": round(ob["cgst"] + total_credit_cgst - total_debit_cgst, 2),
                "sgst": round(ob["sgst"] + total_credit_sgst - total_debit_sgst, 2),
                "igst": round(ob["igst"] + total_credit_igst - total_debit_igst, 2),
            }
        },
        "total_entries": len(entries)
    }


@router.get("/govt-bags/stock")
async def get_govt_bags_stock(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get govt (free/new) bags stock summary"""
    query = {"bag_type": "new"}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    bags = await db.gunny_bags.find(query, {"_id": 0}).to_list(5000)
    bags_in = sum(b.get("quantity", 0) for b in bags if b.get("txn_type") == "in")
    bags_out = sum(b.get("quantity", 0) for b in bags if b.get("txn_type") == "out")
    return {"bags_in": bags_in, "bags_out": bags_out, "stock": bags_in - bags_out}
