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

# Default permissions per role
ROLE_PERMISSIONS = {
    "admin": {
        "can_edit": True, "can_delete": True, "can_export": True,
        "can_see_payments": True, "can_see_cashbook": True,
        "can_see_reports": True, "can_edit_settings": True,
        "can_manual_weight": True
    },
    "entry_operator": {
        "can_edit": True, "can_delete": False, "can_export": False,
        "can_see_payments": False, "can_see_cashbook": False,
        "can_see_reports": False, "can_edit_settings": False,
        "can_manual_weight": False
    },
    "accountant": {
        "can_edit": True, "can_delete": False, "can_export": True,
        "can_see_payments": True, "can_see_cashbook": True,
        "can_see_reports": True, "can_edit_settings": False,
        "can_manual_weight": False
    },
    "viewer": {
        "can_edit": False, "can_delete": False, "can_export": True,
        "can_see_payments": True, "can_see_cashbook": True,
        "can_see_reports": True, "can_edit_settings": False,
        "can_manual_weight": False
    },
    "staff": {
        "can_edit": False, "can_delete": False, "can_export": False,
        "can_see_payments": False, "can_see_cashbook": False,
        "can_see_reports": False, "can_edit_settings": False,
        "can_manual_weight": False
    },
}

def _get_permissions(user_doc):
    """Get merged permissions: role defaults + custom overrides"""
    role = user_doc.get("role", "viewer")
    defaults = ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["viewer"]).copy()
    custom = user_doc.get("permissions", {})
    defaults.update(custom)
    return defaults


@router.post("/auth/login")
async def login(request: LoginRequest):
    username = request.username
    password = request.password
    
    # Check from database first
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    
    if user_doc:
        if user_doc.get("active", True) is False:
            raise HTTPException(status_code=401, detail="Account deactivated hai. Admin se baat karo.")
        if user_doc.get("password") == password:
            perms = _get_permissions(user_doc)
            return {
                "success": True, "username": username,
                "role": user_doc.get("role", "staff"),
                "display_name": user_doc.get("display_name", username),
                "permissions": perms, "message": "Login successful"
            }
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Fallback to default users
    if username in USERS and USERS[username]["password"] == password:
        role = USERS[username]["role"]
        perms = ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["admin"]).copy()
        return {
            "success": True, "username": username,
            "role": role, "display_name": username,
            "permissions": perms, "message": "Login successful"
        }
    
    raise HTTPException(status_code=401, detail="Invalid username or password")


@router.get("/auth/verify")
async def verify_user(username: str, role: str):
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if user_doc and user_doc.get("role") == role:
        perms = _get_permissions(user_doc)
        return {"valid": True, "username": username, "role": role,
                "display_name": user_doc.get("display_name", username), "permissions": perms}
    if username in USERS and USERS[username]["role"] == role:
        perms = ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["admin"]).copy()
        return {"valid": True, "username": username, "role": role,
                "display_name": username, "permissions": perms}
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


# ============ USER MANAGEMENT (CRUD) ============

@router.get("/users")
async def list_users(username: str = "", role: str = ""):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin users dekh sakta hai")
    
    # Get DB users
    db_users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(500)
    
    # Ensure all DB users have an id field
    for u in db_users:
        if not u.get("id"):
            gen_id = f"default_{u['username']}" if u["username"] in USERS else str(uuid.uuid4())
            u["id"] = gen_id
            await db.users.update_one({"username": u["username"]}, {"$set": {"id": gen_id}})
    
    # Add default users if not in DB
    db_usernames = {u["username"] for u in db_users}
    for uname, udata in USERS.items():
        if uname not in db_usernames:
            db_users.append({
                "id": f"default_{uname}",
                "username": uname, "role": udata["role"],
                "display_name": uname, "active": True, "is_default": True,
                "permissions": ROLE_PERMISSIONS.get(udata["role"], {})
            })
    
    # Get staff list and mark which are linked
    staff_list = await db.staff.find({"active": {"$ne": False}}, {"_id": 0}).to_list(500)
    linked_staff_ids = {u.get("staff_id") for u in db_users if u.get("staff_id")}
    
    for u in db_users:
        u["permissions"] = _get_permissions(u)
    
    return {
        "users": db_users,
        "staff": [{"id": s["id"], "name": s["name"], "linked": s["id"] in linked_staff_ids} for s in staff_list]
    }


@router.post("/users")
async def create_user(data: dict, username: str = "", role: str = ""):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin user create kar sakta hai")
    
    new_username = data.get("username", "").strip().lower()
    password = data.get("password", "").strip()
    if not new_username or not password:
        raise HTTPException(status_code=400, detail="Username aur password zaruri hai")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password kam se kam 4 characters ka hona chahiye")
    
    # Check duplicate
    existing = await db.users.find_one({"username": new_username})
    if existing or new_username in USERS:
        raise HTTPException(status_code=400, detail="Ye username already exist karta hai")
    
    user_role = data.get("role", "viewer")
    permissions = data.get("permissions", {})
    
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": new_username,
        "password": password,
        "display_name": data.get("display_name", new_username),
        "role": user_role,
        "permissions": permissions,
        "staff_id": data.get("staff_id", ""),
        "active": True,
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    user_doc.pop("_id", None)
    user_doc.pop("password", None)
    user_doc["permissions"] = _get_permissions(user_doc)
    return {"success": True, "message": f"User '{new_username}' ban gaya", "user": user_doc}


@router.put("/users/{user_id}")
async def update_user(user_id: str, data: dict, username: str = "", role: str = ""):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin user update kar sakta hai")
    
    existing = await db.users.find_one({"id": user_id})
    if not existing and user_id.startswith("default_"):
        # Auto-create default user in DB for editing
        uname = user_id.replace("default_", "")
        if uname in USERS:
            default_doc = {
                "id": user_id, "username": uname, "password": USERS[uname]["password"],
                "display_name": uname, "role": USERS[uname]["role"],
                "permissions": {}, "staff_id": "", "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(default_doc)
            default_doc.pop("_id", None)
            existing = default_doc
    if not existing:
        raise HTTPException(status_code=404, detail="User nahi mila")
    
    update = {}
    if "display_name" in data: update["display_name"] = data["display_name"]
    if "role" in data: update["role"] = data["role"]
    if "permissions" in data: update["permissions"] = data["permissions"]
    if "active" in data: update["active"] = data["active"]
    if "staff_id" in data: update["staff_id"] = data["staff_id"]
    if "password" in data and data["password"].strip():
        if len(data["password"]) < 4:
            raise HTTPException(status_code=400, detail="Password kam se kam 4 characters")
        update["password"] = data["password"]
    
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user_id}, {"$set": update})
    
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    updated["permissions"] = _get_permissions(updated)
    return {"success": True, "message": "User update ho gaya", "user": updated}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, username: str = "", role: str = ""):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin user delete kar sakta hai")
    
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User nahi mila")
    if existing.get("username") == "admin":
        raise HTTPException(status_code=400, detail="Admin user delete nahi ho sakta")
    
    await db.users.update_one({"id": user_id}, {"$set": {"active": False, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"success": True, "message": "User deactivate ho gaya"}


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
    # Validate custom fields (max 6) - label is optional, value required
    clean_fields = []
    for f in custom_fields[:6]:
        val = str(f.get("value", "")).strip()
        if val:
            clean_fields.append({
                "label": str(f.get("label", "")).strip(),
                "value": val,
                "position": f.get("position", "center") if f.get("position") in ("left", "center", "right") else "center",
                "placement": f.get("placement", "below") if f.get("placement") in ("above", "below") else "below"
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
    """Get opening stock balances for a given FY year"""
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
    """Calculate closing stock of source FY year and set as opening stock of target year."""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin carry-forward kar sakta hai")

    source_kms = data.get("source_kms_year", "")
    target_kms = data.get("target_kms_year", "")
    target_fy = data.get("target_financial_year", "")
    if not source_kms or not target_kms:
        raise HTTPException(status_code=400, detail="Source and target FY years required")

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



# ============ AUDIT LOG ENDPOINTS ============

@router.get("/audit-log")
async def get_audit_log(username: str = "", role: str = "",
                        filter_user: str = "", filter_collection: str = "",
                        filter_date: str = "", record_id: str = "",
                        page: int = 1, page_size: int = 50):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin audit log dekh sakta hai")
    
    query = {}
    if filter_user:
        query["username"] = filter_user
    if filter_collection:
        query["collection"] = filter_collection
    if filter_date:
        query["timestamp"] = {"$gte": filter_date + "T00:00:00", "$lte": filter_date + "T23:59:59"}
    if record_id:
        query["record_id"] = record_id
    
    total = await db.audit_log.count_documents(query)
    skip = (page - 1) * page_size
    logs = await db.audit_log.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(page_size).to_list(page_size)
    
    return {"logs": logs, "total": total, "page": page, "page_size": page_size}


@router.get("/audit-log/record/{record_id}")
async def get_record_audit(record_id: str):
    logs = await db.audit_log.find({"record_id": record_id}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return {"logs": logs}
