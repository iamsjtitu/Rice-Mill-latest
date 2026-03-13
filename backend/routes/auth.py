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
    """Get current branding settings"""
    branding = await db.branding.find_one({}, {"_id": 0})
    if not branding:
        # Return default branding
        return {
            "company_name": "NAVKAR AGRO",
            "tagline": "JOLKO, KESINGA - Mill Entry System"
        }
    return branding


@router.put("/branding")
async def update_branding(request: BrandingUpdateRequest, username: str = "", role: str = ""):
    """Update branding settings (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin branding update kar sakta hai")
    
    branding_data = {
        "company_name": request.company_name,
        "tagline": request.tagline,
        "updated_by": username,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.branding.update_one(
        {},
        {"$set": branding_data},
        upsert=True
    )
    
    return {"success": True, "message": "Branding update ho gaya", "branding": branding_data}


# Helper function to get branding for exports
async def get_company_name():
    branding = await db.branding.find_one({}, {"_id": 0})
    if branding:
        return branding.get("company_name", "NAVKAR AGRO"), branding.get("tagline", "")
    return "NAVKAR AGRO", "JOLKO, KESINGA"




# ============ FY SETTINGS ============

@router.get("/fy-settings")
async def get_fy_settings():
    settings = await db.fy_settings.find_one({}, {"_id": 0})
    if not settings:
        now = datetime.now()
        y = now.year
        default_fy = f"{y-1}-{y}" if now.month < 10 else f"{y}-{y+1}"
        settings = {"active_fy": default_fy, "season": ""}
    return settings

@router.put("/fy-settings")
async def update_fy_settings(data: dict):
    active_fy = data.get("active_fy", "")
    season = data.get("season", "")
    if not active_fy:
        raise HTTPException(status_code=400, detail="active_fy is required")
    doc = {"active_fy": active_fy, "season": season, "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.fy_settings.update_one({}, {"$set": doc}, upsert=True)
    return doc
