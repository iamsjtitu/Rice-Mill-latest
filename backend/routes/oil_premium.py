from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from database import db
import uuid

router = APIRouter()

STANDARD_OIL = {"Raw": 22, "Boiled": 25}


@router.get("/oil-premium")
async def get_oil_premiums(kms_year: str = "", season: str = "", bran_type: str = ""):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if bran_type: query["bran_type"] = bran_type
    items = await db.oil_premium.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return items


@router.post("/oil-premium")
async def create_oil_premium(data: dict, username: str = "", role: str = ""):
    data["id"] = str(uuid.uuid4())[:12]
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]
    data["created_by"] = username

    bran_type = data.get("bran_type", "Boiled")
    standard = STANDARD_OIL.get(bran_type, 25)
    actual = float(data.get("actual_oil_pct", 0) or 0)
    rate = float(data.get("rate", 0) or 0)
    qty = float(data.get("qty_qtl", 0) or 0)

    data["standard_oil_pct"] = standard
    data["difference_pct"] = round(actual - standard, 4)
    data["premium_amount"] = round(rate * (actual - standard) * qty / standard, 2) if standard else 0

    await db.oil_premium.insert_one({**data})
    data.pop("_id", None)
    return data


@router.put("/oil-premium/{item_id}")
async def update_oil_premium(item_id: str, data: dict, username: str = "", role: str = ""):
    existing = await db.oil_premium.find_one({"id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = username

    bran_type = data.get("bran_type", "Boiled")
    standard = STANDARD_OIL.get(bran_type, 25)
    actual = float(data.get("actual_oil_pct", 0) or 0)
    rate = float(data.get("rate", 0) or 0)
    qty = float(data.get("qty_qtl", 0) or 0)

    data["standard_oil_pct"] = standard
    data["difference_pct"] = round(actual - standard, 4)
    data["premium_amount"] = round(rate * (actual - standard) * qty / standard, 2) if standard else 0

    data.pop("id", None)
    data.pop("_id", None)
    await db.oil_premium.update_one({"id": item_id}, {"$set": data})
    return {"success": True}


@router.delete("/oil-premium/{item_id}")
async def delete_oil_premium(item_id: str, username: str = "", role: str = ""):
    result = await db.oil_premium.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


@router.get("/oil-premium/lookup-sale")
async def lookup_sale(voucher_no: str = "", rst_no: str = "", kms_year: str = ""):
    """Lookup a Rice Bran sale by voucher_no or rst_no to auto-fill Oil Premium form."""
    if not voucher_no and not rst_no:
        raise HTTPException(status_code=400, detail="voucher_no or rst_no required")

    query = {"product": "Rice Bran"}
    if kms_year: query["kms_year"] = kms_year

    if voucher_no:
        query["voucher_no"] = voucher_no
    elif rst_no:
        query["rst_no"] = rst_no

    sale = await db.bp_sale_register.find_one(query, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale
