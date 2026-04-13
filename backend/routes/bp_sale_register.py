from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from typing import Optional
from database import db
import uuid

router = APIRouter()

def fmt_date(d):
    if not d: return ""
    try:
        if "T" in str(d): d = str(d).split("T")[0]
        parts = str(d).split("-")
        if len(parts) == 3: return f"{parts[2]}/{parts[1]}/{parts[0]}"
    except: pass
    return str(d)


@router.get("/bp-sale-register")
async def get_bp_sales(product: str = "", kms_year: str = "", season: str = ""):
    query = {}
    if product: query["product"] = product
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    sales = await db.bp_sale_register.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return sales


@router.post("/bp-sale-register")
async def create_bp_sale(data: dict, username: str = "", role: str = ""):
    data["id"] = str(uuid.uuid4())[:12]
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]
    data["created_by"] = username

    nw = float(data.get("net_weight_kg", 0) or 0)
    rate = float(data.get("rate_per_qtl", 0) or 0)
    nw_qtl = round(nw / 100, 4)
    amount = round(nw_qtl * rate, 2)
    data["net_weight_qtl"] = nw_qtl
    data["amount"] = amount

    tax_amount = 0
    if data.get("gst_percent"):
        gst = float(data["gst_percent"] or 0)
        tax_amount = round(amount * gst / 100, 2)
    data["tax_amount"] = tax_amount
    data["total"] = round(amount + tax_amount, 2)

    cash = float(data.get("cash_paid", 0) or 0)
    diesel = float(data.get("diesel_paid", 0) or 0)
    advance = float(data.get("advance", 0) or 0)
    data["cash_paid"] = cash
    data["diesel_paid"] = diesel
    data["advance"] = advance
    data["balance"] = round(data["total"] - cash - diesel - advance, 2)

    await db.bp_sale_register.insert_one({**data})
    data.pop("_id", None)
    return data


@router.put("/bp-sale-register/{sale_id}")
async def update_bp_sale(sale_id: str, data: dict, username: str = "", role: str = ""):
    existing = await db.bp_sale_register.find_one({"id": sale_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Sale not found")

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = username

    nw = float(data.get("net_weight_kg", 0) or 0)
    rate = float(data.get("rate_per_qtl", 0) or 0)
    nw_qtl = round(nw / 100, 4)
    amount = round(nw_qtl * rate, 2)
    data["net_weight_qtl"] = nw_qtl
    data["amount"] = amount

    tax_amount = 0
    if data.get("gst_percent"):
        gst = float(data["gst_percent"] or 0)
        tax_amount = round(amount * gst / 100, 2)
    data["tax_amount"] = tax_amount
    data["total"] = round(amount + tax_amount, 2)

    cash = float(data.get("cash_paid", 0) or 0)
    diesel = float(data.get("diesel_paid", 0) or 0)
    advance = float(data.get("advance", 0) or 0)
    data["cash_paid"] = cash
    data["diesel_paid"] = diesel
    data["advance"] = advance
    data["balance"] = round(data["total"] - cash - diesel - advance, 2)

    data.pop("id", None)
    data.pop("_id", None)
    await db.bp_sale_register.update_one({"id": sale_id}, {"$set": data})
    return {"success": True}


@router.delete("/bp-sale-register/{sale_id}")
async def delete_bp_sale(sale_id: str, username: str = "", role: str = ""):
    result = await db.bp_sale_register.delete_one({"id": sale_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sale not found")
    return {"success": True}


@router.get("/bp-sale-register/suggestions/bill-from")
async def get_bill_from_suggestions():
    pipeline = [{"$group": {"_id": "$bill_from"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/suggestions/party-name")
async def get_party_suggestions():
    pipeline = [{"$group": {"_id": "$party_name"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/suggestions/destination")
async def get_destination_suggestions():
    pipeline = [{"$group": {"_id": "$destination"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]
