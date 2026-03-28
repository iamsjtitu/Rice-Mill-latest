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

# ============ AUTH ENDPOINTS ============

@router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    username = request.username
    password = request.password
    
    # Check from database first (for changed passwords)
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    
    if user_doc:
        if user_doc.get("password") == password:
            return LoginResponse(
                success=True,
                username=username,
                role=user_doc.get("role"),
                message="Login successful"
            )
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Fallback to default users
    if username in USERS and USERS[username]["password"] == password:
        return LoginResponse(
            success=True,
            username=username,
            role=USERS[username]["role"],
            message="Login successful"
        )
    
    raise HTTPException(status_code=401, detail="Invalid username or password")


@router.get("/auth/verify")
async def verify_user(username: str, role: str):
    # Check from database first
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if user_doc and user_doc.get("role") == role:
        return {"valid": True, "username": username, "role": role}
    # Fallback to default users
    if username in USERS and USERS[username]["role"] == role:
        return {"valid": True, "username": username, "role": role}
    return {"valid": False}


@router.post("/auth/change-password")
async def change_password(request: PasswordChangeRequest):
    username = request.username
    current_password = request.current_password
    new_password = request.new_password
    
    # Check from database first
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    
    if user_doc:
        # User exists in database
        if user_doc.get("password") != current_password:
            raise HTTPException(status_code=401, detail="Current password galat hai")
        
        await db.users.update_one(
            {"username": username},
            {"$set": {"password": new_password}}
        )
        return {"success": True, "message": "Password changed successfully"}
    
    # Check default users
    if username in USERS:
        if USERS[username]["password"] != current_password:
            raise HTTPException(status_code=401, detail="Current password galat hai")
        
        # Create user in database with new password
        await db.users.insert_one({
            "username": username,
            "password": new_password,
            "role": USERS[username]["role"]
        })
        return {"success": True, "message": "Password changed successfully"}
    
    raise HTTPException(status_code=404, detail="User not found")


# ============ BRANDING SETTINGS ============

@router.get("/branding")
async def get_branding():
    """Get current branding settings with custom fields"""
    from utils.branding_helper import get_branding_data
    return await get_branding_data()


@router.put("/branding")
async def update_branding(data: dict, username: str = "", role: str = ""):
    """Update branding settings with custom fields (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin branding update kar sakta hai")

    custom_fields = data.get("custom_fields", [])
    # Validate custom fields (max 6)
    clean_fields = []
    for f in custom_fields[:6]:
        if f.get("label") and f.get("value"):
            clean_fields.append({
                "label": str(f["label"]).strip(),
                "value": str(f["value"]).strip(),
                "position": f.get("position", "center") if f.get("position") in ("left", "center", "right") else "center"
            })

    branding_data = {
        "company_name": data.get("company_name", "NAVKAR AGRO"),
        "tagline": data.get("tagline", ""),
        "custom_fields": clean_fields,
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.branding.update_one({}, {"$set": branding_data}, upsert=True)

    # Sync to db.settings for backward compatibility with PDF generators
    sync_data = {
        "key": "branding",
        "company_name": branding_data["company_name"],
        "tagline": branding_data["tagline"],
        "custom_fields": clean_fields,
    }
    # Also set legacy fields from custom_fields for old code
    for cf in clean_fields:
        lbl = cf["label"].lower().strip()
        if "gst" in lbl:
            sync_data["gstin"] = cf["value"]
        elif "phone" in lbl or "mobile" in lbl:
            sync_data["phone"] = cf["value"]
        elif "address" in lbl:
            sync_data["address"] = cf["value"]
    await db.settings.update_one({"key": "branding"}, {"$set": sync_data}, upsert=True)

    return {"success": True, "message": "Branding update ho gaya", "branding": branding_data}


# Helper function to get branding for exports
async def get_company_name():
    from utils.branding_helper import get_company_name as _gcn
    return await _gcn()




# ============ FY SETTINGS ============

def _get_default_kms():
    now = datetime.now()
    y = now.year
    return f"{y-1}-{y}" if now.month < 10 else f"{y}-{y+1}"

def _get_default_financial_year():
    now = datetime.now()
    y = now.year
    return f"{y-1}-{y}" if now.month < 4 else f"{y}-{y+1}"

@router.get("/fy-settings")
async def get_fy_settings():
    settings = await db.fy_settings.find_one({}, {"_id": 0})
    if not settings:
        settings = {
            "active_fy": _get_default_kms(),
            "season": "",
            "financial_year": _get_default_financial_year()
        }
    if "financial_year" not in settings:
        settings["financial_year"] = _get_default_financial_year()
    return settings

@router.put("/fy-settings")
async def update_fy_settings(data: dict):
    active_fy = data.get("active_fy", "")
    season = data.get("season", "")
    financial_year = data.get("financial_year", "")
    if not active_fy:
        raise HTTPException(status_code=400, detail="active_fy is required")
    doc = {
        "active_fy": active_fy,
        "season": season,
        "financial_year": financial_year,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.fy_settings.update_one({}, {"$set": doc}, upsert=True)
    return doc


# ============ OPENING STOCK BALANCE ============

STOCK_ITEMS = ["paddy", "rice_usna", "rice_raw", "bran", "kunda", "broken", "kanki", "husk", "frk"]

@router.get("/opening-stock")
async def get_opening_stock(kms_year: str = "", financial_year: str = ""):
    """Get opening stock balances for a given KMS/FY year"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    elif financial_year:
        query["financial_year"] = financial_year
    else:
        settings = await db.fy_settings.find_one({}, {"_id": 0})
        if settings:
            query["kms_year"] = settings.get("active_fy", "")
    
    doc = await db.opening_stock.find_one(query, {"_id": 0})
    if not doc:
        doc = {"kms_year": kms_year or "", "financial_year": financial_year or "", "stocks": {item: 0 for item in STOCK_ITEMS}}
    return doc

@router.put("/opening-stock")
async def save_opening_stock(data: dict, username: str = "", role: str = ""):
    """Save opening stock balances"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin opening stock set kar sakta hai")
    
    kms_year = data.get("kms_year", "")
    financial_year = data.get("financial_year", "")
    stocks = data.get("stocks", {})
    
    # Clean stocks - only allow known items, convert to float
    clean_stocks = {}
    for item in STOCK_ITEMS:
        val = stocks.get(item, 0)
        try:
            clean_stocks[item] = float(val) if val else 0
        except (ValueError, TypeError):
            clean_stocks[item] = 0
    
    doc = {
        "kms_year": kms_year,
        "financial_year": financial_year,
        "stocks": clean_stocks,
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    query = {"kms_year": kms_year} if kms_year else {"financial_year": financial_year}
    await db.opening_stock.update_one(query, {"$set": doc}, upsert=True)
    return {"success": True, "message": "Opening stock save ho gaya", "data": doc}


@router.post("/opening-stock/carry-forward")
async def carry_forward_stock(data: dict, username: str = "", role: str = ""):
    """Calculate closing stock of source KMS year and set as opening stock of target year."""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin carry-forward kar sakta hai")

    source_kms = data.get("source_kms_year", "")
    target_kms = data.get("target_kms_year", "")
    target_fy = data.get("target_financial_year", "")
    if not source_kms or not target_kms:
        raise HTTPException(status_code=400, detail="Source and target KMS years required")

    # Import the stock summary function
    from routes.purchase_vouchers import get_stock_summary
    summary = await get_stock_summary(kms_year=source_kms)
    items = summary.get("items", [])

    # Map closing stock to opening stock keys
    closing = {}
    name_to_key = {
        "Paddy": "paddy", "Rice (Usna)": "rice_usna", "Rice (Raw)": "rice_raw",
        "Bran": "bran", "Kunda": "kunda", "Broken": "broken",
        "Kanki": "kanki", "Husk": "husk", "Frk": "frk", "FRK": "frk"
    }
    for item in items:
        key = name_to_key.get(item["name"])
        if key:
            closing[key] = round(item.get("available", 0), 2)

    # Ensure all keys exist
    for k in STOCK_ITEMS:
        if k not in closing:
            closing[k] = 0

    doc = {
        "kms_year": target_kms,
        "financial_year": target_fy,
        "stocks": closing,
        "auto_carried": True,
        "carried_from": source_kms,
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.opening_stock.update_one({"kms_year": target_kms}, {"$set": doc}, upsert=True)
    return {"success": True, "message": f"Closing stock {source_kms} → Opening stock {target_kms} carry forward ho gaya", "data": doc}
