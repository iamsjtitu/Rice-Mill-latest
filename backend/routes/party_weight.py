"""
v104.44.70 — Party Weight Register
Tracks weight recorded at party's own dharam kaata (independent of our mill scale).
Used for shortage/excess tracking per voucher.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ['MONGO_URL']
client = AsyncIOMotorClient(MONGO_URL)
db = client[os.environ['DB_NAME']]
router = APIRouter(tags=["party-weight"])


class PartyWeightEntry(BaseModel):
    id: Optional[str] = None
    product: str
    voucher_no: str
    date: str = ""
    party_name: str = ""
    vehicle_no: str = ""
    rst_no: str = ""
    our_net_weight_kg: float = 0
    party_net_weight_kg: float = 0
    shortage_kg: float = 0
    excess_kg: float = 0
    remark: str = ""
    kms_year: str = ""
    season: str = ""
    created_at: str = ""
    updated_at: str = ""
    created_by: str = ""


def _compute_diff(our_kg: float, party_kg: float) -> dict:
    """Positive diff → shortage (party got less), negative → excess."""
    diff = round(our_kg - party_kg, 2)
    return {
        "shortage_kg": max(0, diff),
        "excess_kg": abs(min(0, diff)),
    }


async def _fetch_sale_info(product: str, voucher_no: str, kms_year: str = "") -> Optional[dict]:
    """Look up sale entry in bp_sale_register or sale_vouchers (for Pvt Rice)."""
    voucher_no = (voucher_no or "").strip()
    if not voucher_no:
        return None
    # Try BP register first
    q = {"voucher_no": voucher_no}
    if product:
        q["product"] = product
    if kms_year:
        q["kms_year"] = kms_year
    s = await db.bp_sale_register.find_one(q, {"_id": 0})
    if s:
        return {
            "voucher_no": s.get("voucher_no", ""),
            "date": s.get("date", ""),
            "party_name": s.get("party_name", ""),
            "vehicle_no": s.get("vehicle_no", ""),
            "rst_no": s.get("rst_no", ""),
            "net_weight_kg": float(s.get("net_weight_kg", 0) or 0),
            "kms_year": s.get("kms_year", ""),
            "season": s.get("season", ""),
            "source": "bp_sale_register",
        }
    # Fallback to sale_vouchers (Pvt Rice / Govt Rice)
    q2 = {"voucher_no": voucher_no}
    if kms_year:
        q2["kms_year"] = kms_year
    sv = await db.sale_vouchers.find_one(q2, {"_id": 0})
    if sv:
        return {
            "voucher_no": sv.get("voucher_no", ""),
            "date": sv.get("date", ""),
            "party_name": sv.get("party_name", ""),
            "vehicle_no": sv.get("vehicle_no", ""),
            "rst_no": sv.get("rst_no", ""),
            "net_weight_kg": float(sv.get("net_weight_kg", 0) or 0),
            "kms_year": sv.get("kms_year", ""),
            "season": sv.get("season", ""),
            "source": "sale_vouchers",
        }
    return None


@router.get("/party-weight/lookup")
async def lookup_voucher(voucher_no: str, product: str = "", kms_year: str = ""):
    """Auto-fetch sale info for a voucher_no (used when user types in form)."""
    info = await _fetch_sale_info(product, voucher_no, kms_year)
    if not info:
        raise HTTPException(status_code=404, detail=f"Voucher #{voucher_no} not found")
    return info


@router.get("/party-weight")
async def list_party_weights(product: str = "", kms_year: str = "", season: str = "",
                              date_from: str = "", date_to: str = "", party_name: str = "",
                              voucher_no: str = ""):
    q = {}
    if product: q["product"] = product
    if kms_year: q["kms_year"] = kms_year
    if season: q["season"] = season
    if date_from: q.setdefault("date", {}).update({"$gte": date_from})
    if date_to: q.setdefault("date", {}).update({"$lte": date_to})
    if party_name: q["party_name"] = {"$regex": party_name, "$options": "i"}
    if voucher_no: q["voucher_no"] = {"$regex": voucher_no, "$options": "i"}
    items = await db.party_weights.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return items


@router.post("/party-weight")
async def create_party_weight(data: dict, username: str = "", role: str = ""):
    voucher_no = (data.get("voucher_no") or "").strip()
    product = (data.get("product") or "").strip()
    if not voucher_no:
        raise HTTPException(status_code=400, detail="Voucher No. required")
    if not product:
        raise HTTPException(status_code=400, detail="Product required")

    # Duplicate check per (product + voucher_no + kms_year)
    kms = data.get("kms_year", "")
    dup = await db.party_weights.find_one({"product": product, "voucher_no": voucher_no, "kms_year": kms}, {"_id": 0, "id": 1})
    if dup:
        raise HTTPException(status_code=400, detail=f"Party Weight entry for Voucher #{voucher_no} already exists")

    # Auto-enrich from sale record
    info = await _fetch_sale_info(product, voucher_no, kms)
    our_kg = float(data.get("our_net_weight_kg", 0) or (info and info.get("net_weight_kg", 0)) or 0)
    party_kg = float(data.get("party_net_weight_kg", 0) or 0)
    diff = _compute_diff(our_kg, party_kg)

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "product": product,
        "voucher_no": voucher_no,
        "date": data.get("date") or (info and info.get("date", "")) or "",
        "party_name": data.get("party_name") or (info and info.get("party_name", "")) or "",
        "vehicle_no": data.get("vehicle_no") or (info and info.get("vehicle_no", "")) or "",
        "rst_no": data.get("rst_no") or (info and info.get("rst_no", "")) or "",
        "our_net_weight_kg": our_kg,
        "party_net_weight_kg": party_kg,
        "shortage_kg": diff["shortage_kg"],
        "excess_kg": diff["excess_kg"],
        "remark": data.get("remark", ""),
        "kms_year": kms,
        "season": data.get("season", "") or (info and info.get("season", "")) or "",
        "created_at": now,
        "updated_at": now,
        "created_by": username,
    }
    await db.party_weights.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/party-weight/{entry_id}")
async def update_party_weight(entry_id: str, data: dict, username: str = "", role: str = ""):
    existing = await db.party_weights.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")

    our_kg = float(data.get("our_net_weight_kg", existing.get("our_net_weight_kg", 0)) or 0)
    party_kg = float(data.get("party_net_weight_kg", existing.get("party_net_weight_kg", 0)) or 0)
    diff = _compute_diff(our_kg, party_kg)

    updates = {
        "our_net_weight_kg": our_kg,
        "party_net_weight_kg": party_kg,
        "shortage_kg": diff["shortage_kg"],
        "excess_kg": diff["excess_kg"],
        "remark": data.get("remark", existing.get("remark", "")),
        "party_name": data.get("party_name", existing.get("party_name", "")),
        "date": data.get("date", existing.get("date", "")),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.party_weights.update_one({"id": entry_id}, {"$set": updates})
    merged = {**existing, **updates}
    merged.pop("_id", None)
    return merged


@router.delete("/party-weight/{entry_id}")
async def delete_party_weight(entry_id: str, username: str = "", role: str = ""):
    res = await db.party_weights.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": True}
