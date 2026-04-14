from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from typing import Optional
from database import db
import uuid

router = APIRouter()


@router.get("/paddy-release")
async def get_paddy_releases(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    items = await db.paddy_release.find(query, {"_id": 0}).sort("date", 1).to_list(10000)
    return items


@router.post("/paddy-release")
async def create_paddy_release(data: dict, username: str = ""):
    data["id"] = str(uuid.uuid4())[:12]
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]
    data["created_by"] = username
    data["qty_qtl"] = float(data.get("qty_qtl", 0) or 0)
    data["used_qtl"] = 0
    await db.paddy_release.insert_one({**data})
    data.pop("_id", None)
    return data


@router.put("/paddy-release/{item_id}")
async def update_paddy_release(item_id: str, data: dict, username: str = ""):
    existing = await db.paddy_release.find_one({"id": item_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = username
    data["qty_qtl"] = float(data.get("qty_qtl", 0) or 0)
    data.pop("id", None)
    data.pop("_id", None)
    await db.paddy_release.update_one({"id": item_id}, {"$set": data})
    return {"success": True}


@router.delete("/paddy-release/{item_id}")
async def delete_paddy_release(item_id: str, username: str = ""):
    result = await db.paddy_release.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


@router.get("/paddy-release/stock")
async def get_paddy_release_stock(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get total released paddy and how much has been used in milling."""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    releases = await db.paddy_release.find(query, {"_id": 0}).to_list(10000)
    total_released = sum(r.get("qty_qtl", 0) for r in releases)

    milling_entries = await db.milling_entries.find(query, {"_id": 0, "paddy_input_qntl": 1}).to_list(10000)
    total_milled = sum(e.get("paddy_input_qntl", 0) for e in milling_entries)

    return {
        "total_released": round(total_released, 2),
        "total_milled": round(total_milled, 2),
        "available_for_milling": round(total_released - total_milled, 2),
        "releases": releases,
    }
