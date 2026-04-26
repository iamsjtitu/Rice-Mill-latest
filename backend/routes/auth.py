from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from database import db, USERS, print_pages
from models import LoginRequest, PasswordChangeRequest, round_amount
import uuid, io, csv, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from utils import export_helpers as _eh_default_font  # noqa: F401
from openpyxl.utils import get_column_letter

router = APIRouter()

# ============ AUTH ENDPOINTS ============

# Default permissions per role
ROLE_PERMISSIONS = {
    "admin": {
        "can_edit": True, "can_delete": True, "can_export": True,
        "can_see_payments": True, "can_see_cashbook": True,
        "can_see_reports": True, "can_edit_settings": True,
        "can_manual_weight": True, "can_edit_rst": True, "can_change_date": True
    },
    "entry_operator": {
        "can_edit": True, "can_delete": False, "can_export": False,
        "can_see_payments": False, "can_see_cashbook": False,
        "can_see_reports": False, "can_edit_settings": False,
        "can_manual_weight": False, "can_edit_rst": False, "can_change_date": False
    },
    "accountant": {
        "can_edit": True, "can_delete": False, "can_export": True,
        "can_see_payments": True, "can_see_cashbook": True,
        "can_see_reports": True, "can_edit_settings": False,
        "can_manual_weight": False, "can_edit_rst": False, "can_change_date": False
    },
    "viewer": {
        "can_edit": False, "can_delete": False, "can_export": True,
        "can_see_payments": True, "can_see_cashbook": True,
        "can_see_reports": True, "can_edit_settings": False,
        "can_manual_weight": False, "can_edit_rst": False, "can_change_date": False
    },
    "staff": {
        "can_edit": False, "can_delete": False, "can_export": False,
        "can_see_payments": False, "can_see_cashbook": False,
        "can_see_reports": False, "can_edit_settings": False,
        "can_manual_weight": False, "can_edit_rst": False, "can_change_date": False
    },
}

def _get_permissions(user_doc):
    """Get merged permissions: role defaults + custom overrides"""
    role = user_doc.get("role", "viewer")
    defaults = ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["viewer"]).copy()
    custom = user_doc.get("permissions", {})
    defaults.update(custom)
    # Admin role: core permissions are always true
    if role == "admin":
        defaults["can_edit"] = True
        defaults["can_delete"] = True
        defaults["can_edit_settings"] = True
    return defaults


@router.post("/auth/login")
async def login(request: LoginRequest):
    username = request.username
    password = request.password
    
    # SECURITY: Seed default users into DB on first login attempt.
    # After seeding, login uses ONLY DB users — no USERS dict backdoor that
    # could revert custom passwords. Fixes "admin password resets" bug.
    for uname, udata in USERS.items():
        existing = await db.users.find_one({"username": uname}, {"_id": 0, "password": 1})
        if not existing:
            await db.users.insert_one({
                "id": f"default_{uname}",
                "username": uname,
                "password": udata["password"],
                "role": udata["role"],
                "display_name": uname,
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })

    # Check from database
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

    # Validate new password strength (min 6 chars)
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Naya password kam se kam 6 characters ka hona chahiye")

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


# ============ PASSWORD RECOVERY: Recovery Code + WhatsApp OTP ============
# Stored on user record:
#   recovery_code_hash    -> SHA256 hex of the plaintext code
#   recovery_code_set_at  -> ISO timestamp
#   recovery_whatsapp     -> phone number for WhatsApp OTP
#   reset_otp_hash        -> SHA256 of current 6-digit OTP
#   reset_otp_expires_at  -> ISO timestamp (10 min)
#   reset_otp_attempts    -> int (max 5)

import hashlib
import secrets

def _hash_secret(s: str) -> str:
    return hashlib.sha256(s.strip().encode("utf-8")).hexdigest()

def _generate_recovery_code() -> str:
    # 16 chars in 4-4-4-4 format, uppercase alphanumeric (excl. confusing chars)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I,O,0,1
    chars = "".join(secrets.choice(alphabet) for _ in range(16))
    return f"{chars[0:4]}-{chars[4:8]}-{chars[8:12]}-{chars[12:16]}"

def _generate_otp() -> str:
    return f"{secrets.randbelow(1000000):06d}"

def _mask_phone(phone: str) -> str:
    if not phone:
        return ""
    p = "".join(c for c in phone if c.isdigit())
    if len(p) < 4:
        return "*" * len(p)
    return "*" * (len(p) - 4) + p[-4:]


@router.post("/auth/recovery-code/generate")
async def generate_recovery_code(data: dict):
    """Admin-only. Generates a new recovery code, stores its hash, returns plaintext ONCE."""
    username = (data.get("username") or "").strip()
    current_password = data.get("current_password") or ""
    if not username or not current_password:
        raise HTTPException(status_code=400, detail="Username aur current password zaruri hai")

    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_doc.get("password") != current_password:
        raise HTTPException(status_code=401, detail="Current password galat hai")
    if user_doc.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin recovery code generate kar sakta hai")

    code = _generate_recovery_code()
    await db.users.update_one(
        {"username": username},
        {"$set": {
            "recovery_code_hash": _hash_secret(code),
            "recovery_code_set_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"success": True, "code": code, "message": "Recovery code generated. Save it safely — it will not be shown again."}


@router.get("/auth/recovery-code/status")
async def recovery_code_status(username: str = "", role: str = ""):
    """Returns whether a recovery code exists and when it was set (no plaintext)."""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin")
    user_doc = await db.users.find_one({"username": username}, {"_id": 0, "recovery_code_hash": 1, "recovery_code_set_at": 1})
    if not user_doc:
        return {"has_code": False, "set_at": ""}
    return {
        "has_code": bool(user_doc.get("recovery_code_hash")),
        "set_at": user_doc.get("recovery_code_set_at", "") or "",
    }


@router.put("/auth/recovery-whatsapp")
async def set_recovery_whatsapp(data: dict):
    """Admin-only. Stores WhatsApp number for OTP-based password reset."""
    username = (data.get("username") or "").strip()
    current_password = data.get("current_password") or ""
    whatsapp = (data.get("whatsapp") or "").strip()

    if not username or not current_password:
        raise HTTPException(status_code=400, detail="Username aur current password zaruri hai")

    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_doc.get("password") != current_password:
        raise HTTPException(status_code=401, detail="Current password galat hai")
    if user_doc.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin")

    # Basic phone validation: 10 digits min after cleaning
    cleaned = "".join(c for c in whatsapp if c.isdigit())
    if whatsapp and len(cleaned) < 10:
        raise HTTPException(status_code=400, detail="WhatsApp number invalid hai")

    await db.users.update_one(
        {"username": username},
        {"$set": {"recovery_whatsapp": whatsapp}}
    )
    return {"success": True, "whatsapp": whatsapp, "masked": _mask_phone(whatsapp)}


@router.get("/auth/recovery-whatsapp")
async def get_recovery_whatsapp(username: str = "", role: str = ""):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin")
    user_doc = await db.users.find_one({"username": username}, {"_id": 0, "recovery_whatsapp": 1})
    wa = (user_doc or {}).get("recovery_whatsapp", "") or ""
    return {"whatsapp": wa, "masked": _mask_phone(wa), "has_number": bool(wa)}


@router.post("/auth/forgot-password/send-otp")
async def send_password_reset_otp(data: dict):
    """Public endpoint. Sends a 6-digit OTP to the user's registered recovery WhatsApp."""
    username = (data.get("username") or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username zaruri hai")

    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not user_doc:
        # Don't leak which usernames exist
        raise HTTPException(status_code=404, detail="Is username ke liye recovery WhatsApp set nahi hai")
    wa_number = (user_doc.get("recovery_whatsapp") or "").strip()
    if not wa_number:
        raise HTTPException(status_code=404, detail="Is account ke liye recovery WhatsApp set nahi hai. Pehle Settings → Account Recovery se number add karein.")

    # Rate limit: do not send another OTP within 60 sec
    last_sent_iso = user_doc.get("reset_otp_sent_at") or ""
    if last_sent_iso:
        try:
            last_sent = datetime.fromisoformat(last_sent_iso)
            if (datetime.now(timezone.utc) - last_sent).total_seconds() < 60:
                wait_s = 60 - int((datetime.now(timezone.utc) - last_sent).total_seconds())
                raise HTTPException(status_code=429, detail=f"Thoda ruko - {wait_s}s baad dobara try karein")
        except HTTPException:
            raise
        except Exception:
            pass

    otp = _generate_otp()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    await db.users.update_one(
        {"username": username},
        {"$set": {
            "reset_otp_hash": _hash_secret(otp),
            "reset_otp_expires_at": expires,
            "reset_otp_attempts": 0,
            "reset_otp_sent_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Send via 360Messenger (uses existing WhatsApp settings)
    from routes.whatsapp import _send_wa_message
    text = (
        f"Mill Entry System - Password Reset OTP\n\n"
        f"Aapka OTP hai: {otp}\n\n"
        f"Ye OTP 10 minutes ke liye valid hai. Kisi ke saath share na karein.\n"
        f"Agar aapne reset request nahi kiya hai toh is message ko ignore karein."
    )
    result = await _send_wa_message(wa_number, text)
    if not result.get("success"):
        # Don't reveal exact internals
        raise HTTPException(status_code=500, detail=f"OTP bhejne mein error: {result.get('error', 'WhatsApp send failed')}")

    return {"success": True, "masked_phone": _mask_phone(wa_number), "message": f"OTP bhej diya {_mask_phone(wa_number)} pe. 10 minutes ke andar enter karein."}


@router.post("/auth/forgot-password/verify-otp")
async def verify_password_reset_otp(data: dict):
    """Public endpoint. Verifies OTP and resets password."""
    username = (data.get("username") or "").strip()
    otp = (data.get("otp") or "").strip()
    new_password = data.get("new_password") or ""

    if not username or not otp or not new_password:
        raise HTTPException(status_code=400, detail="Username, OTP aur naya password zaruri hai")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Naya password kam se kam 6 characters ka hona chahiye")

    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not user_doc or not user_doc.get("reset_otp_hash"):
        raise HTTPException(status_code=400, detail="Is account ke liye OTP request nahi mila. Pehle 'Send OTP' karein.")

    expires_iso = user_doc.get("reset_otp_expires_at") or ""
    try:
        expires = datetime.fromisoformat(expires_iso) if expires_iso else None
    except Exception:
        expires = None
    if not expires or datetime.now(timezone.utc) > expires:
        await db.users.update_one({"username": username}, {"$unset": {"reset_otp_hash": "", "reset_otp_expires_at": "", "reset_otp_attempts": ""}})
        raise HTTPException(status_code=400, detail="OTP expire ho gaya. Naya OTP request karein.")

    attempts = int(user_doc.get("reset_otp_attempts") or 0)
    if attempts >= 5:
        await db.users.update_one({"username": username}, {"$unset": {"reset_otp_hash": "", "reset_otp_expires_at": "", "reset_otp_attempts": ""}})
        raise HTTPException(status_code=429, detail="Bahut zyada galat OTP attempts. Naya OTP request karein.")

    if user_doc.get("reset_otp_hash") != _hash_secret(otp):
        await db.users.update_one({"username": username}, {"$inc": {"reset_otp_attempts": 1}})
        raise HTTPException(status_code=401, detail=f"OTP galat hai. {4 - attempts} attempts bache hain.")

    # Success — reset password and clear OTP fields
    await db.users.update_one(
        {"username": username},
        {"$set": {"password": new_password},
         "$unset": {"reset_otp_hash": "", "reset_otp_expires_at": "", "reset_otp_attempts": "", "reset_otp_sent_at": ""}}
    )
    return {"success": True, "message": "Password reset ho gaya! Ab new password se login karein."}


@router.post("/auth/forgot-password/recovery-code")
async def reset_password_via_recovery_code(data: dict):
    """Public endpoint. Resets password using one-time recovery code."""
    username = (data.get("username") or "").strip()
    code = (data.get("code") or "").strip().upper()
    new_password = data.get("new_password") or ""

    if not username or not code or not new_password:
        raise HTTPException(status_code=400, detail="Username, recovery code aur naya password zaruri hai")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Naya password kam se kam 6 characters ka hona chahiye")

    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if not user_doc or not user_doc.get("recovery_code_hash"):
        raise HTTPException(status_code=404, detail="Is account ke liye recovery code set nahi hai")

    if user_doc.get("recovery_code_hash") != _hash_secret(code):
        raise HTTPException(status_code=401, detail="Recovery code galat hai")

    # Success — reset password and INVALIDATE the recovery code (one-time use)
    await db.users.update_one(
        {"username": username},
        {"$set": {"password": new_password},
         "$unset": {"recovery_code_hash": "", "recovery_code_set_at": ""}}
    )
    return {"success": True, "message": "Password reset ho gaya! Naya recovery code Settings se generate karein.", "code_invalidated": True}


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
        "mill_code": data.get("mill_code", ""),
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
        "mill_code": branding_data["mill_code"],
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


# ===== WATERMARK SETTINGS =====

@router.get("/settings/watermark")
async def get_watermark_settings():
    """Get PDF watermark settings"""
    doc = await db.app_settings.find_one({"setting_id": "watermark"}, {"_id": 0})
    return doc or {"setting_id": "watermark", "enabled": False, "type": "text", "text": "", "image_path": "", "opacity": 0.06}


@router.put("/settings/watermark")
async def update_watermark_settings(data: dict, username: str = "", role: str = ""):
    """Update PDF watermark settings (Admin only)"""
    if role and role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin watermark settings update kar sakta hai")

    settings = {
        "setting_id": "watermark",
        "enabled": bool(data.get("enabled", False)),
        "type": data.get("type", "text"),
        "text": str(data.get("text", "")).strip(),
        "image_path": str(data.get("image_path", "")).strip(),
        "opacity": max(0.02, min(0.20, float(data.get("opacity", 0.06)))),
        "font_size": max(20, min(120, int(data.get("font_size", 52)))),
        "rotation": max(0, min(90, int(data.get("rotation", 45)))),
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.app_settings.update_one(
        {"setting_id": "watermark"}, {"$set": settings}, upsert=True
    )

    # Refresh cache
    from utils.watermark_helper import load_watermark_settings
    await load_watermark_settings()

    return {"success": True, "message": "Watermark settings update ho gaya", "settings": settings}


@router.post("/settings/watermark/upload")
async def upload_watermark_image(file: UploadFile = File(...)):
    """Upload watermark image"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Sirf image file upload karein")

    upload_dir = "/app/backend/uploads/watermark"
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename)[1] or ".png"
    save_path = os.path.join(upload_dir, f"watermark{ext}")

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    # Update settings with image path
    await db.app_settings.update_one(
        {"setting_id": "watermark"},
        {"$set": {"image_path": save_path, "type": "image"}},
        upsert=True
    )

    from utils.watermark_helper import load_watermark_settings
    await load_watermark_settings()

    return {"success": True, "image_path": save_path}


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

STOCK_ITEMS_BASE = ["paddy", "rice_usna", "rice_raw", "frk"]

async def get_stock_items_list():
    """Get dynamic stock items list (base + dynamic by-products)."""
    cats = await db.byproduct_categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    bp_ids = [c["id"] for c in cats] if cats else ["bran", "kunda", "broken", "rejection_rice", "pin_broken_rice", "poll", "husk"]
    return STOCK_ITEMS_BASE[:3] + bp_ids + [STOCK_ITEMS_BASE[3]]  # paddy, rice_usna, rice_raw, [bp...], frk

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
    
    stock_items = await get_stock_items_list()
    doc = await db.opening_stock.find_one(query, {"_id": 0})
    if not doc:
        doc = {"kms_year": kms_year or "", "financial_year": financial_year or "", "stocks": {item: 0 for item in stock_items}}
    else:
        # Ensure all dynamic items exist
        for item in stock_items:
            if item not in doc.get("stocks", {}):
                doc["stocks"][item] = 0
    return doc

@router.put("/opening-stock")
async def save_opening_stock(data: dict, username: str = "", role: str = ""):
    """Save opening stock balances"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin opening stock set kar sakta hai")
    
    kms_year = data.get("kms_year", "")
    financial_year = data.get("financial_year", "")
    stocks = data.get("stocks", {})
    stock_items = await get_stock_items_list()
    
    # Clean stocks - allow all known + dynamic items
    clean_stocks = {}
    all_keys = set(stock_items) | set(stocks.keys())
    for item in all_keys:
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
    # Dynamic mapping: build from categories
    bp_cats = await db.byproduct_categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    name_to_key = {
        "Paddy": "paddy", "Rice (Usna)": "rice_usna", "Rice (Raw)": "rice_raw",
        "Frk": "frk", "FRK": "frk"
    }
    # Add dynamic by-product mappings
    for cat in (bp_cats or []):
        display = cat.get("name", cat["id"].title())
        name_to_key[display] = cat["id"]
        name_to_key[cat["id"].title()] = cat["id"]
    for item in items:
        key = name_to_key.get(item["name"])
        if key:
            closing[key] = round(item.get("available", 0), 2)

    # Ensure all keys exist
    stock_keys = await get_stock_items_list()
    for k in stock_keys:
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


@router.delete("/audit-log/clear")
async def clear_audit_log(username: str = "", role: str = "", days: int = 0):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin audit log clear kar sakta hai")
    if days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = await db.audit_log.delete_many({"timestamp": {"$lt": cutoff}})
        return {"deleted": result.deleted_count, "message": f"{days} din se purane {result.deleted_count} logs delete ho gaye"}
    else:
        result = await db.audit_log.delete_many({})
        return {"deleted": result.deleted_count, "message": f"Sab {result.deleted_count} audit logs clear ho gaye"}


# ============ GOVT USEFUL LINKS ============
@router.get("/govt-links")
async def get_govt_links():
    setting = await db.app_settings.find_one({"setting_id": "govt_links"}, {"_id": 0})
    return setting.get("value", []) if setting else []

@router.put("/govt-links")
async def save_govt_links(request: Request):
    links = await request.json()
    if not isinstance(links, list):
        links = []
    for i, link in enumerate(links):
        if not link.get("id"):
            link["id"] = str(uuid.uuid4())
        link["order"] = i
    await db.app_settings.update_one(
        {"setting_id": "govt_links"},
        {"$set": {"setting_id": "govt_links", "value": links, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"success": True, "count": len(links)}

@router.post("/govt-links")
async def save_govt_links_post(request: Request):
    links = await request.json()
    if not isinstance(links, list):
        links = []
    for i, link in enumerate(links):
        if not link.get("id"):
            link["id"] = str(uuid.uuid4())
        link["order"] = i
    await db.app_settings.update_one(
        {"setting_id": "govt_links"},
        {"$set": {"setting_id": "govt_links", "value": links, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"success": True, "count": len(links)}


# ============ VERIFICATION METER SETTINGS (FCI Weekly Verification Report) ============
@router.get("/settings/verification-meter")
async def get_verification_meter_settings():
    """Persisted Last Metre Reading + Last Verification Date for FCI Weekly Verification Report."""
    doc = await db.app_settings.find_one({"setting_id": "verification_meter"}, {"_id": 0})
    if not doc:
        return {"last_meter_reading": 0, "last_verification_date": "", "units_per_qtl": 6.0, "rice_recovery": 0.67,
                "electricity_kw": 0, "electricity_kv": 0, "milling_capacity_mt": 0, "variety": "Boiled",
                "whatsapp_number": "", "whatsapp_group_link": ""}
    return {
        "last_meter_reading": float(doc.get("last_meter_reading", 0) or 0),
        "last_verification_date": doc.get("last_verification_date", "") or "",
        "units_per_qtl": float(doc.get("units_per_qtl", 6.0) or 6.0),
        "rice_recovery": float(doc.get("rice_recovery", 0.67) or 0.67),
        "electricity_kw": float(doc.get("electricity_kw", 0) or 0),
        "electricity_kv": float(doc.get("electricity_kv", 0) or 0),
        "milling_capacity_mt": float(doc.get("milling_capacity_mt", 0) or 0),
        "variety": doc.get("variety", "Boiled") or "Boiled",
        "whatsapp_number": doc.get("whatsapp_number", "") or "",
        "whatsapp_group_link": doc.get("whatsapp_group_link", "") or "",
    }

@router.put("/settings/verification-meter")
async def update_verification_meter_settings(data: dict):
    """Save Last Metre Reading + Last Verification Date (auto-roll for next week)."""
    payload = {
        "setting_id": "verification_meter",
        "last_meter_reading": float(data.get("last_meter_reading", 0) or 0),
        "last_verification_date": str(data.get("last_verification_date", "") or ""),
        "units_per_qtl": float(data.get("units_per_qtl", 6.0) or 6.0),
        "rice_recovery": float(data.get("rice_recovery", 0.67) or 0.67),
        "electricity_kw": float(data.get("electricity_kw", 0) or 0),
        "electricity_kv": float(data.get("electricity_kv", 0) or 0),
        "milling_capacity_mt": float(data.get("milling_capacity_mt", 0) or 0),
        "variety": str(data.get("variety", "Boiled") or "Boiled"),
        "whatsapp_number": str(data.get("whatsapp_number", "") or "").strip(),
        "whatsapp_group_link": str(data.get("whatsapp_group_link", "") or "").strip(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.app_settings.update_one(
        {"setting_id": "verification_meter"}, {"$set": payload}, upsert=True
    )
    return {"success": True, **{k: v for k, v in payload.items() if k != "setting_id"}}

