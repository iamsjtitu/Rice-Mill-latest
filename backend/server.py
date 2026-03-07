from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import StreamingResponse, Response, HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import io
import csv
from openpyxl import Workbook
from openpyxl.styles import Font, Fill, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Print page storage (server-side print for Electron compatibility)
print_pages = {}

@api_router.post("/print")
async def create_print_page(request: Request):
    data = await request.json()
    import uuid as _uuid
    page_id = str(_uuid.uuid4())
    print_pages[page_id] = data.get('html', '')
    return {"id": page_id, "url": f"/api/print/{page_id}"}

@api_router.get("/print/{page_id}")
async def get_print_page(page_id: str):
    html = print_pages.pop(page_id, None)
    if not html:
        return HTMLResponse("<h1>Page expired. Please try again.</h1>", status_code=404)
    return HTMLResponse(html)

# Security
security = HTTPBasic()

# Default credentials (in production, store hashed in DB)
USERS = {
    "admin": {"password": "admin123", "role": "admin"},
    "staff": {"password": "staff123", "role": "staff"}
}


# User Models
class User(BaseModel):
    username: str
    role: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    username: str
    role: str
    message: str


class PasswordChangeRequest(BaseModel):
    username: str
    current_password: str
    new_password: str


# Define Models
class MillEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    kms_year: str = ""  # e.g., "2025-2026"
    season: str = ""  # "Kharif" or "Rabi"
    truck_no: str = ""
    rst_no: str = ""  # RST Number
    tp_no: str = ""   # TP Number
    agent_name: str = ""
    mandi_name: str = ""
    kg: float = 0
    qntl: float = 0  # Auto calculated: kg / 100
    bag: int = 0
    g_deposite: float = 0
    gbw_cut: float = 0
    mill_w: float = 0  # Auto calculated: kg - gbw_cut
    plastic_bag: int = 0  # P.Pkt - Plastic packet count
    p_pkt_cut: float = 0  # Auto calculated: plastic_bag * 0.5
    moisture: float = 0  # Moisture percentage
    moisture_cut: float = 0  # Auto calculated moisture cut
    moisture_cut_percent: float = 0  # Moisture cut percentage (moisture - 17 if > 17)
    cutting_percent: float = 0  # Cutting percentage (5%, 5.26% etc)
    cutting: float = 0  # Auto calculated from percentage
    disc_dust_poll: float = 0
    final_w: float = 0  # Auto calculated
    g_issued: float = 0
    cash_paid: float = 0
    diesel_paid: float = 0
    remark: str = ""
    created_by: str = ""  # Username who created
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MillEntryCreate(BaseModel):
    date: str
    kms_year: str = ""
    season: str = ""
    truck_no: str = ""
    rst_no: str = ""  # RST Number
    tp_no: str = ""   # TP Number
    agent_name: str = ""
    mandi_name: str = ""
    kg: float = 0
    bag: int = 0
    g_deposite: float = 0
    gbw_cut: float = 0
    plastic_bag: int = 0
    cutting_percent: float = 0
    disc_dust_poll: float = 0
    g_issued: float = 0
    moisture: float = 0
    cash_paid: float = 0
    diesel_paid: float = 0
    remark: str = ""


class MillEntryUpdate(BaseModel):
    date: Optional[str] = None
    kms_year: Optional[str] = None
    season: Optional[str] = None
    truck_no: Optional[str] = None
    rst_no: Optional[str] = None  # RST Number
    tp_no: Optional[str] = None   # TP Number
    agent_name: Optional[str] = None
    mandi_name: Optional[str] = None
    kg: Optional[float] = None
    bag: Optional[int] = None
    g_deposite: Optional[float] = None
    gbw_cut: Optional[float] = None
    plastic_bag: Optional[int] = None
    cutting_percent: Optional[float] = None
    disc_dust_poll: Optional[float] = None
    g_issued: Optional[float] = None
    moisture: Optional[float] = None
    cash_paid: Optional[float] = None
    diesel_paid: Optional[float] = None
    remark: Optional[str] = None


class TotalsResponse(BaseModel):
    total_kg: float = 0
    total_qntl: float = 0
    total_bag: int = 0
    total_g_deposite: float = 0
    total_gbw_cut: float = 0
    total_mill_w: float = 0
    total_p_pkt_cut: float = 0
    total_cutting: float = 0
    total_disc_dust_poll: float = 0
    total_final_w: float = 0
    total_g_issued: float = 0
    total_cash_paid: float = 0
    total_diesel_paid: float = 0


# Mandi Target Models
class MandiTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mandi_name: str
    target_qntl: float  # Base target in QNTL
    cutting_percent: float  # Expected cutting % (5%, 5.26% etc)
    expected_total: float = 0  # Auto: target_qntl + (target_qntl * cutting_percent / 100)
    base_rate: float = 10.0  # Rate per QNTL for target (e.g., ₹10)
    cutting_rate: float = 5.0  # Rate per QNTL for cutting excess (e.g., ₹5)
    kms_year: str  # e.g., "2025-2026"
    season: str  # "Kharif" or "Rabi"
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MandiTargetCreate(BaseModel):
    mandi_name: str
    target_qntl: float
    cutting_percent: float = 5.0
    base_rate: float = 10.0
    cutting_rate: float = 5.0
    kms_year: str
    season: str


class MandiTargetUpdate(BaseModel):
    mandi_name: Optional[str] = None
    target_qntl: Optional[float] = None
    cutting_percent: Optional[float] = None
    base_rate: Optional[float] = None
    cutting_rate: Optional[float] = None
    kms_year: Optional[str] = None
    season: Optional[str] = None


# ============ MILLING ENTRY MODELS ============
class MillingEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    rice_type: str = "parboiled"  # "parboiled" or "raw"
    paddy_input_qntl: float = 0
    
    # Output percentages (user enters)
    rice_percent: float = 0
    frk_percent: float = 0
    bran_percent: float = 0
    kunda_percent: float = 0
    broken_percent: float = 0
    kanki_percent: float = 0
    husk_percent: float = 0  # auto-calculated as remainder
    
    # Auto-calculated QNTL
    rice_qntl: float = 0
    frk_qntl: float = 0
    bran_qntl: float = 0
    kunda_qntl: float = 0
    broken_qntl: float = 0
    kanki_qntl: float = 0
    husk_qntl: float = 0
    
    # CMR
    cmr_delivery_qntl: float = 0  # rice + frk
    outturn_ratio: float = 0      # (rice + frk) / paddy * 100
    
    # Meta
    kms_year: str = ""
    season: str = ""
    note: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MillingEntryCreate(BaseModel):
    date: str
    rice_type: str = "parboiled"
    paddy_input_qntl: float = 0
    rice_percent: float = 0
    frk_percent: float = 0
    bran_percent: float = 0
    kunda_percent: float = 0
    broken_percent: float = 0
    kanki_percent: float = 0
    kms_year: str = ""
    season: str = ""
    note: str = ""


class MandiTargetSummary(BaseModel):
    id: str  # Target ID for edit/delete
    mandi_name: str
    target_qntl: float
    cutting_percent: float
    expected_total: float
    achieved_qntl: float  # Sum of final_w for this mandi
    pending_qntl: float  # expected_total - achieved_qntl
    progress_percent: float  # (achieved / expected) * 100
    base_rate: float
    cutting_rate: float
    target_amount: float  # target_qntl × base_rate
    cutting_qntl: float  # cutting excess QNTL
    cutting_amount: float  # cutting_qntl × cutting_rate
    total_agent_amount: float  # target_amount + cutting_amount
    kms_year: str
    season: str


# ============ PAYMENT MODELS ============

class PaymentRecord(BaseModel):
    amount: float
    date: str
    note: str = ""


class TruckPaymentStatus(BaseModel):
    entry_id: str
    truck_no: str
    date: str
    total_qntl: float
    total_bag: int
    final_qntl: float
    cash_taken: float
    diesel_taken: float
    rate_per_qntl: float
    gross_amount: float  # final_qntl × rate
    deductions: float  # cash + diesel
    net_amount: float  # gross - deductions
    paid_amount: float
    balance_amount: float
    status: str  # pending, partial, paid
    kms_year: str
    season: str
    agent_name: str
    mandi_name: str


class AgentPaymentStatus(BaseModel):
    """Agent payment based on Mandi Target (not achieved)"""
    mandi_name: str
    agent_name: str
    target_qntl: float
    cutting_percent: float
    cutting_qntl: float  # target × cutting%
    base_rate: float
    cutting_rate: float
    target_amount: float  # target_qntl × base_rate
    cutting_amount: float  # cutting_qntl × cutting_rate
    total_amount: float  # target_amount + cutting_amount
    achieved_qntl: float  # Actual achieved for reference
    is_target_complete: bool  # achieved >= expected_total
    paid_amount: float
    balance_amount: float
    status: str  # pending, partial, paid
    kms_year: str
    season: str


class SetRateRequest(BaseModel):
    rate_per_qntl: float


class MakePaymentRequest(BaseModel):
    amount: float
    note: str = ""


# Branding Settings Model
class BrandingSettings(BaseModel):
    company_name: str = "NAVKAR AGRO"
    tagline: str = "JOLKO, KESINGA - Mill Entry System"
    updated_by: str = ""
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BrandingUpdateRequest(BaseModel):
    company_name: str
    tagline: str


def calculate_auto_fields(data: dict) -> dict:
    """Calculate automatic fields based on input data"""
    kg = data.get('kg', 0) or 0
    gbw_cut = data.get('gbw_cut', 0) or 0
    disc_dust_poll = data.get('disc_dust_poll', 0) or 0
    plastic_bag = data.get('plastic_bag', 0) or 0
    cutting_percent = data.get('cutting_percent', 0) or 0
    moisture = data.get('moisture', 0) or 0
    
    # P.Pkt cut calculation (0.5 kg per plastic bag)
    p_pkt_cut = round(plastic_bag * 0.5, 2)
    data['p_pkt_cut'] = p_pkt_cut
    
    # Mill W in KG and QNTL
    mill_w_kg = kg - gbw_cut
    mill_w_qntl = mill_w_kg / 100
    
    # Moisture cut: 17% tak no cut, uske upar (moisture - 17)% cut from Mill W QNTL
    moisture_cut_percent = max(0, moisture - 17)
    moisture_cut_qntl = round((mill_w_qntl * moisture_cut_percent) / 100, 2)
    moisture_cut_kg = round(moisture_cut_qntl * 100, 2)
    data['moisture_cut'] = moisture_cut_kg
    data['moisture_cut_qntl'] = moisture_cut_qntl
    data['moisture_cut_percent'] = moisture_cut_percent
    
    # Cutting from Mill W QNTL
    cutting_qntl = round((mill_w_qntl * cutting_percent) / 100, 2)
    cutting_kg = round(cutting_qntl * 100, 2)
    data['cutting'] = cutting_kg
    data['cutting_qntl'] = cutting_qntl
    
    # P.Pkt cut in QNTL
    p_pkt_cut_qntl = p_pkt_cut / 100
    
    # Disc/Dust/Poll in QNTL
    disc_dust_poll_qntl = disc_dust_poll / 100
    
    # Auto calculations
    data['qntl'] = round(kg / 100, 2)  # KG to Quintals
    data['mill_w'] = mill_w_kg  # Mill Weight in KG (stored)
    
    # Final W = Mill W QNTL - P.Pkt QNTL - Moisture Cut QNTL - Cutting QNTL - Disc/Dust QNTL
    final_w_qntl = mill_w_qntl - p_pkt_cut_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl
    data['final_w'] = round(final_w_qntl * 100, 2)  # Store in KG for compatibility
    
    return data


def can_edit_entry(entry: dict, username: str, role: str) -> tuple:
    """Check if user can edit/delete entry"""
    if role == "admin":
        return True, "Admin access"
    
    # Staff can only edit their own entries within 5 minutes
    if entry.get('created_by') != username:
        return False, "Aap sirf apni entry edit kar sakte hain"
    
    created_at = entry.get('created_at', '')
    if created_at:
        try:
            created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            time_diff = now - created_time
            
            if time_diff > timedelta(minutes=5):
                return False, "5 minute se zyada ho gaye, ab edit nahi ho sakta"
        except:
            pass
    
    return True, "Edit allowed"


# ============ AUTH ENDPOINTS ============

@api_router.post("/auth/login", response_model=LoginResponse)
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


@api_router.get("/auth/verify")
async def verify_user(username: str, role: str):
    # Check from database first
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    if user_doc and user_doc.get("role") == role:
        return {"valid": True, "username": username, "role": role}
    # Fallback to default users
    if username in USERS and USERS[username]["role"] == role:
        return {"valid": True, "username": username, "role": role}
    return {"valid": False}


@api_router.post("/auth/change-password")
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

@api_router.get("/branding")
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


@api_router.put("/branding")
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


# ============ MILL ENTRIES CRUD ============

@api_router.get("/")
async def root():
    return {"message": "Mill Entry API - Navkar Agro"}


@api_router.post("/entries", response_model=MillEntry)
async def create_entry(input: MillEntryCreate, username: str = "", role: str = ""):
    entry_dict = input.model_dump()
    entry_dict = calculate_auto_fields(entry_dict)
    entry_dict['created_by'] = username
    
    entry_obj = MillEntry(**entry_dict)
    doc = entry_obj.model_dump()
    
    await db.mill_entries.insert_one(doc)
    return entry_obj


@api_router.get("/entries", response_model=List[MillEntry])
async def get_entries(
    truck_no: Optional[str] = None,
    rst_no: Optional[str] = None,
    tp_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    query = {}
    
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if rst_no:
        query["rst_no"] = {"$regex": rst_no, "$options": "i"}
    if tp_no:
        query["tp_no"] = {"$regex": tp_no, "$options": "i"}
    if agent_name:
        query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    # Date range filter
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        if date_query:
            query["date"] = date_query
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return entries


@api_router.get("/entries/{entry_id}", response_model=MillEntry)
async def get_entry(entry_id: str):
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@api_router.put("/entries/{entry_id}", response_model=MillEntry)
async def update_entry(entry_id: str, input: MillEntryUpdate, username: str = "", role: str = ""):
    existing = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Check permission
    can_edit, message = can_edit_entry(existing, username, role)
    if not can_edit:
        raise HTTPException(status_code=403, detail=message)
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    
    # Merge existing data with updates
    merged_data = {**existing, **update_data}
    merged_data = calculate_auto_fields(merged_data)
    merged_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.mill_entries.update_one(
        {"id": entry_id},
        {"$set": merged_data}
    )
    
    updated = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    return updated


@api_router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: str, username: str = "", role: str = ""):
    existing = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Check permission
    can_edit, message = can_edit_entry(existing, username, role)
    if not can_edit:
        raise HTTPException(status_code=403, detail=message)
    
    result = await db.mill_entries.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Entry deleted successfully"}


@api_router.get("/totals", response_model=TotalsResponse)
async def get_totals(
    truck_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    match_query = {}
    
    if truck_no:
        match_query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if agent_name:
        match_query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        match_query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    if kms_year:
        match_query["kms_year"] = kms_year
    if season:
        match_query["season"] = season
    
    # Date range filter
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        if date_query:
            match_query["date"] = date_query
    
    pipeline = []
    if match_query:
        pipeline.append({"$match": match_query})
    
    pipeline.append({
        "$group": {
            "_id": None,
            "total_kg": {"$sum": "$kg"},
            "total_qntl": {"$sum": "$qntl"},
            "total_bag": {"$sum": "$bag"},
            "total_g_deposite": {"$sum": "$g_deposite"},
            "total_gbw_cut": {"$sum": "$gbw_cut"},
            "total_mill_w": {"$sum": "$mill_w"},
            "total_p_pkt_cut": {"$sum": "$p_pkt_cut"},
            "total_cutting": {"$sum": "$cutting"},
            "total_disc_dust_poll": {"$sum": "$disc_dust_poll"},
            "total_final_w": {"$sum": "$final_w"},
            "total_g_issued": {"$sum": "$g_issued"},
            "total_cash_paid": {"$sum": "$cash_paid"},
            "total_diesel_paid": {"$sum": "$diesel_paid"}
        }
    })
    
    result = await db.mill_entries.aggregate(pipeline).to_list(1)
    
    if result:
        totals = result[0]
        del totals['_id']
        return TotalsResponse(**totals)
    
    return TotalsResponse()


# ============ AUTO-SUGGEST ENDPOINTS ============

@api_router.get("/suggestions/trucks")
async def get_truck_suggestions(q: str = ""):
    if len(q) < 1:
        trucks = await db.mill_entries.distinct("truck_no")
    else:
        trucks = await db.mill_entries.distinct("truck_no", {"truck_no": {"$regex": q, "$options": "i"}})
    return {"suggestions": [t for t in trucks if t]}


@api_router.get("/suggestions/agents")
async def get_agent_suggestions(q: str = ""):
    if len(q) < 1:
        agents = await db.mill_entries.distinct("agent_name")
    else:
        agents = await db.mill_entries.distinct("agent_name", {"agent_name": {"$regex": q, "$options": "i"}})
    return {"suggestions": [a for a in agents if a]}


@api_router.get("/suggestions/mandis")
async def get_mandi_suggestions(q: str = "", agent_name: str = ""):
    query = {}
    if q:
        query["mandi_name"] = {"$regex": q, "$options": "i"}
    if agent_name:
        query["agent_name"] = agent_name
    
    mandis = await db.mill_entries.distinct("mandi_name", query if query else None)
    return {"suggestions": [m for m in mandis if m]}


@api_router.get("/suggestions/kms_years")
async def get_kms_year_suggestions():
    years = await db.mill_entries.distinct("kms_year")
    return {"suggestions": [y for y in years if y]}


# ============ EXPORT ENDPOINTS ============

@api_router.get("/export/excel")
async def export_excel(
    truck_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export entries to styled Excel file"""
    query = {}
    
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if agent_name:
        query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Create workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Mill Entries"
    
    # Styles
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=9)
    
    title_fill = PatternFill(start_color="D97706", end_color="D97706", fill_type="solid")
    title_font = Font(bold=True, color="FFFFFF", size=14)
    
    total_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    total_font = Font(bold=True, size=9)
    
    qntl_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    final_fill = PatternFill(start_color="FDE68A", end_color="FDE68A", fill_type="solid")
    gunny_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
    cash_fill = PatternFill(start_color="FCE7F3", end_color="FCE7F3", fill_type="solid")
    
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    center_align = Alignment(horizontal='center', vertical='center')
    right_align = Alignment(horizontal='right', vertical='center')
    
    # Title
    ws.merge_cells('A1:Q1')
    company_name, tagline = await get_company_name()
    ws['A1'] = f"{company_name} - Mill Entries | KMS: {kms_year or 'All'} | {season or 'All Seasons'}"
    ws['A1'].fill = title_fill
    ws['A1'].font = title_font
    ws['A1'].alignment = center_align
    ws.row_dimensions[1].height = 30
    
    # Date row
    ws.merge_cells('A2:Q2')
    ws['A2'] = f"Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}"
    ws['A2'].alignment = center_align
    ws.row_dimensions[2].height = 20
    
    # Headers
    headers = [
        "Date", "Truck No", "Agent", "Mandi", "QNTL", "BAG", "G.Dep",
        "GBW Cut", "Mill W", "Moist%", "M.Cut", "Cut%", 
        "D/D/P", "Final W", "G.Issued", "Cash", "Diesel"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = thin_border
        cell.alignment = center_align
    ws.row_dimensions[3].height = 22
    
    # Data rows
    row_num = 4
    alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    
    for idx, entry in enumerate(entries):
        row_data = [
            entry.get('date', ''),
            entry.get('truck_no', ''),
            entry.get('agent_name', ''),
            entry.get('mandi_name', ''),
            round(entry.get('qntl', 0), 2),
            entry.get('bag', 0),
            entry.get('g_deposite', 0),
            round(entry.get('gbw_cut', 0), 2),
            round(entry.get('mill_w', 0) / 100, 2),
            entry.get('moisture', 0),
            round(entry.get('moisture_cut', 0) / 100, 2) if entry.get('moisture_cut') else 0,
            entry.get('cutting_percent', 0),
            entry.get('disc_dust_poll', 0),
            round(entry.get('final_w', 0) / 100, 2),
            entry.get('g_issued', 0),
            entry.get('cash_paid', 0),
            entry.get('diesel_paid', 0)
        ]
        
        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_num, column=col, value=value)
            cell.border = thin_border
            
            if idx % 2 == 1:
                cell.fill = alt_fill
            
            # Special column colors
            if col == 5:  # QNTL
                cell.fill = qntl_fill
                cell.alignment = right_align
            elif col == 7:  # G.Deposite
                cell.fill = gunny_fill
                cell.alignment = right_align
            elif col == 14:  # Final W
                cell.fill = final_fill
                cell.font = Font(bold=True)
                cell.alignment = right_align
            elif col == 16:  # Cash
                cell.fill = cash_fill
                cell.alignment = right_align
            elif col == 17:  # Diesel
                cell.fill = cash_fill
                cell.alignment = right_align
            elif col in [6, 8, 9, 10, 11, 12, 13, 15]:
                cell.alignment = right_align
        
        row_num += 1
    
    # Totals row
    totals = await get_totals(truck_no, agent_name, mandi_name, kms_year, season)
    totals_data = [
        "TOTAL", "", "", "",
        round(totals.total_qntl, 2),
        totals.total_bag,
        totals.total_g_deposite,
        round(totals.total_gbw_cut, 2),
        round(totals.total_mill_w / 100, 2),
        "-",
        "-",
        "-",
        totals.total_disc_dust_poll,
        round(totals.total_final_w / 100, 2),
        totals.total_g_issued,
        totals.total_cash_paid,
        totals.total_diesel_paid
    ]
    
    for col, value in enumerate(totals_data, 1):
        cell = ws.cell(row=row_num, column=col, value=value)
        cell.fill = total_fill
        cell.font = total_font
        cell.border = thin_border
        if col >= 5:
            cell.alignment = right_align
    
    # Column widths
    col_widths = [10, 12, 12, 12, 8, 6, 6, 8, 8, 6, 6, 6, 6, 8, 8, 8, 8]
    for i, width in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = width
    
    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"mill_entries_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/pdf")
async def export_pdf(
    truck_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export entries to styled PDF file (A4 Landscape)"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    
    query = {}
    
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if agent_name:
        query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    totals = await get_totals(truck_no, agent_name, mandi_name, kms_year, season)
    
    # Create PDF buffer
    buffer = io.BytesIO()
    
    # A4 Landscape
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=8*mm,
        rightMargin=8*mm,
        topMargin=8*mm,
        bottomMargin=8*mm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=14,
        textColor=colors.white,
        alignment=TA_CENTER,
        spaceAfter=2*mm
    )
    
    # Subtitle style
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#475569'),
        alignment=TA_CENTER,
        spaceAfter=3*mm
    )
    
    # Title table with orange background
    company_name, tagline = await get_company_name()
    title_text = f"{company_name} - Mill Entries | KMS: {kms_year or 'All'} | {season or 'All Seasons'}"
    title_data = [[Paragraph(f"<b>{title_text}</b>", title_style)]]
    title_table = Table(title_data, colWidths=[page_width - 16*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(title_table)
    
    # Date
    date_text = f"Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}"
    elements.append(Paragraph(date_text, subtitle_style))
    
    # Table headers
    headers = [
        "Date", "Truck No", "Agent", "Mandi", "QNTL", "BAG", "G.Dep",
        "GBW Cut", "Mill W", "Moist%", "M.Cut", "Cut%", 
        "D/D/P", "Final W", "G.Issued", "Cash", "Diesel"
    ]
    
    # Build data rows
    table_data = [headers]
    
    for entry in entries:
        row = [
            entry.get('date', '')[:10] if entry.get('date') else '',
            entry.get('truck_no', '')[:10] if entry.get('truck_no') else '',
            entry.get('agent_name', '')[:10] if entry.get('agent_name') else '',
            entry.get('mandi_name', '')[:10] if entry.get('mandi_name') else '',
            f"{entry.get('qntl', 0):.2f}",
            str(entry.get('bag', 0)),
            str(entry.get('g_deposite', 0)),
            f"{entry.get('gbw_cut', 0):.1f}",
            f"{entry.get('mill_w', 0) / 100:.2f}",
            f"{entry.get('moisture', 0):.0f}",
            f"{(entry.get('moisture_cut', 0) / 100):.2f}" if entry.get('moisture_cut') else "0",
            f"{entry.get('cutting_percent', 0):.1f}",
            str(entry.get('disc_dust_poll', 0)),
            f"{entry.get('final_w', 0) / 100:.2f}",
            str(entry.get('g_issued', 0)),
            str(entry.get('cash_paid', 0)),
            str(entry.get('diesel_paid', 0))
        ]
        table_data.append(row)
    
    # Totals row
    totals_row = [
        "TOTAL", "", "", "",
        f"{totals.total_qntl:.2f}",
        str(totals.total_bag),
        str(int(totals.total_g_deposite)),
        f"{totals.total_gbw_cut:.1f}",
        f"{totals.total_mill_w / 100:.2f}",
        "-",
        "-",
        "-",
        str(int(totals.total_disc_dust_poll)),
        f"{totals.total_final_w / 100:.2f}",
        str(int(totals.total_g_issued)),
        str(int(totals.total_cash_paid)),
        str(int(totals.total_diesel_paid))
    ]
    table_data.append(totals_row)
    
    # Column widths (total ~265mm for A4 landscape with margins)
    col_widths = [14*mm, 16*mm, 16*mm, 16*mm, 12*mm, 10*mm, 10*mm, 12*mm, 12*mm, 
                  10*mm, 10*mm, 10*mm, 10*mm, 14*mm, 14*mm, 12*mm, 12*mm]
    
    # Create table
    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    # Define colors
    header_bg = colors.HexColor('#1E293B')
    alt_row_bg = colors.HexColor('#F8FAFC')
    qntl_bg = colors.HexColor('#D1FAE5')
    gunny_bg = colors.HexColor('#DBEAFE')
    final_bg = colors.HexColor('#FDE68A')
    cash_bg = colors.HexColor('#FCE7F3')
    total_bg = colors.HexColor('#FEF3C7')
    
    # Table styles
    style_commands = [
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 6),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # All cells
        ('FONTSIZE', (0, 1), (-1, -1), 6),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        
        # Right align numeric columns
        ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),
        
        # Totals row (last row)
        ('BACKGROUND', (0, -1), (-1, -1), total_bg),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 6),
    ]
    
    # Add alternating row colors for data rows
    for i in range(1, len(table_data) - 1):  # Exclude header and totals
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), alt_row_bg))
    
    # Highlight special columns for all data rows
    for i in range(1, len(table_data) - 1):
        style_commands.append(('BACKGROUND', (4, i), (4, i), qntl_bg))  # QNTL
        style_commands.append(('BACKGROUND', (6, i), (6, i), gunny_bg))  # G.Dep
        style_commands.append(('BACKGROUND', (13, i), (13, i), final_bg))  # Final W
        style_commands.append(('BACKGROUND', (15, i), (16, i), cash_bg))  # Cash, Diesel
    
    # Bold Final W column
    style_commands.append(('FONTNAME', (13, 1), (13, -1), 'Helvetica-Bold'))
    
    main_table.setStyle(TableStyle(style_commands))
    elements.append(main_table)
    
    # Build PDF
    doc.build(elements)
    
    buffer.seek(0)
    filename = f"mill_entries_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/truck-payments-excel")
async def export_truck_payments_excel(
    truck_no: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck payments to styled Excel file"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Build payment data
    payments_data = []
    total_net = 0
    total_paid = 0
    total_balance = 0
    
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        status = "Paid" if balance < 0.10 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_net += net_amount
        total_paid += paid_amount
        total_balance += balance
        
        payments_data.append({
            "date": entry.get("date", ""),
            "truck_no": entry.get("truck_no", ""),
            "mandi_name": entry.get("mandi_name", ""),
            "final_qntl": final_qntl,
            "rate": rate,
            "gross": gross_amount,
            "cash": cash_taken,
            "diesel": diesel_taken,
            "deductions": deductions,
            "net": net_amount,
            "paid": paid_amount,
            "balance": balance,
            "status": status
        })
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Truck Payments"
    
    # Styles
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    total_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    paid_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    pending_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    # Title
    ws.merge_cells('A1:M1')
    company_name, tagline = await get_company_name()
    ws['A1'] = f"TRUCK PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}"
    ws['A1'].font = Font(bold=True, size=14, color="D97706")
    ws['A1'].alignment = Alignment(horizontal='center')
    
    # Headers
    headers = ["Date", "Truck No", "Mandi", "Final QNTL", "Rate", "Gross", "Cash", "Diesel", "Deductions", "Net Amount", "Paid", "Balance", "Status"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    for row_idx, p in enumerate(payments_data, 4):
        ws.cell(row=row_idx, column=1, value=p["date"])
        ws.cell(row=row_idx, column=2, value=p["truck_no"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=3, value=p["mandi_name"])
        ws.cell(row=row_idx, column=4, value=p["final_qntl"])
        ws.cell(row=row_idx, column=5, value=f"₹{p['rate']}")
        ws.cell(row=row_idx, column=6, value=p["gross"])
        ws.cell(row=row_idx, column=7, value=p["cash"])
        ws.cell(row=row_idx, column=8, value=p["diesel"])
        ws.cell(row=row_idx, column=9, value=p["deductions"])
        ws.cell(row=row_idx, column=10, value=p["net"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=11, value=p["paid"])
        ws.cell(row=row_idx, column=12, value=p["balance"]).font = Font(bold=True, color="DC2626" if p["balance"] > 0 else "059669")
        status_cell = ws.cell(row=row_idx, column=13, value=p["status"])
        if p["status"] == "Paid":
            status_cell.fill = paid_fill
        elif p["status"] == "Pending":
            status_cell.fill = pending_fill
    
    # Totals row
    total_row = len(payments_data) + 4
    ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=10, value=round(total_net, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=11, value=round(total_paid, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=12, value=round(total_balance, 2)).font = Font(bold=True, color="DC2626")
    for col in range(1, 14):
        ws.cell(row=total_row, column=col).fill = total_fill
    
    # Column widths
    col_widths = [12, 14, 14, 12, 8, 10, 8, 8, 10, 12, 10, 12, 10]
    for i, width in enumerate(col_widths, 1):
        ws.column_dimensions[chr(64 + i)].width = width
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"truck_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/truck-payments-pdf")
async def export_truck_payments_pdf(
    truck_no: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck payments to PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib.enums import TA_CENTER
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Build payment data
    payments_data = []
    total_net = 0
    total_paid = 0
    total_balance = 0
    
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        status = "Paid" if balance < 0.10 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_net += net_amount
        total_paid += paid_amount
        total_balance += balance
        
        payments_data.append([
            entry.get("date", "")[:10],
            entry.get("truck_no", "")[:12],
            entry.get("mandi_name", "")[:12],
            f"{final_qntl}",
            f"Rs.{rate}",
            f"Rs.{gross_amount}",
            f"-Rs.{deductions}",
            f"Rs.{net_amount}",
            f"Rs.{paid_amount}",
            f"Rs.{balance}",
            status
        ])
    
    # Create PDF
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.white, alignment=TA_CENTER)
    company_name, tagline = await get_company_name()
    title_data = [[Paragraph(f"<b>TRUCK PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}</b>", title_style)]]
    title_table = Table(title_data, colWidths=[page_width - 20*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(title_table)
    elements.append(Table([[""]], colWidths=[page_width], rowHeights=[5*mm]))
    
    # Headers
    headers = ["Date", "Truck No", "Mandi", "QNTL", "Rate", "Gross", "Deduct", "Net", "Paid", "Balance", "Status"]
    table_data = [headers] + payments_data
    
    # Totals
    table_data.append(["TOTAL", "", "", "", "", "", "", f"Rs.{round(total_net, 2)}", f"Rs.{round(total_paid, 2)}", f"Rs.{round(total_balance, 2)}", ""])
    
    col_widths = [18*mm, 22*mm, 22*mm, 14*mm, 12*mm, 16*mm, 16*mm, 18*mm, 16*mm, 18*mm, 14*mm]
    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    
    # Alternating rows and status colors
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F8FAFC')))
        if payments_data[i-1][-1] == "Paid":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#D1FAE5')))
        elif payments_data[i-1][-1] == "Pending":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#FEE2E2')))
    
    main_table.setStyle(TableStyle(style_commands))
    elements.append(main_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"truck_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.post("/entries/bulk-delete")
async def bulk_delete_entries(entry_ids: List[str], username: str = "", role: str = ""):
    """Bulk delete entries"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can bulk delete")
    
    result = await db.mill_entries.delete_many({"id": {"$in": entry_ids}})
    return {"message": f"{result.deleted_count} entries deleted successfully", "deleted_count": result.deleted_count}


# ============ MANDI TARGET ENDPOINTS ============

@api_router.get("/mandi-targets", response_model=List[MandiTarget])
async def get_mandi_targets(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all mandi targets"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).sort("mandi_name", 1).to_list(100)
    return targets


@api_router.post("/mandi-targets", response_model=MandiTarget)
async def create_mandi_target(input: MandiTargetCreate, username: str = "", role: str = ""):
    """Create a new mandi target (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin target set kar sakta hai")
    
    # Check if target already exists for this mandi + kms_year + season
    existing = await db.mandi_targets.find_one({
        "mandi_name": input.mandi_name,
        "kms_year": input.kms_year,
        "season": input.season
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=400, detail=f"{input.mandi_name} ka target already set hai is KMS Year aur Season ke liye")
    
    # Calculate expected total
    expected_total = round(input.target_qntl + (input.target_qntl * input.cutting_percent / 100), 2)
    
    target_obj = MandiTarget(
        mandi_name=input.mandi_name,
        target_qntl=input.target_qntl,
        cutting_percent=input.cutting_percent,
        expected_total=expected_total,
        base_rate=input.base_rate,
        cutting_rate=input.cutting_rate,
        kms_year=input.kms_year,
        season=input.season,
        created_by=username
    )
    
    doc = target_obj.model_dump()
    await db.mandi_targets.insert_one(doc)
    return target_obj


@api_router.put("/mandi-targets/{target_id}", response_model=MandiTarget)
async def update_mandi_target(target_id: str, input: MandiTargetUpdate, username: str = "", role: str = ""):
    """Update a mandi target (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin target update kar sakta hai")
    
    existing = await db.mandi_targets.find_one({"id": target_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Target not found")
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    merged = {**existing, **update_data}
    
    # Recalculate expected total
    merged["expected_total"] = round(merged["target_qntl"] + (merged["target_qntl"] * merged["cutting_percent"] / 100), 2)
    
    await db.mandi_targets.update_one({"id": target_id}, {"$set": merged})
    updated = await db.mandi_targets.find_one({"id": target_id}, {"_id": 0})
    return updated


@api_router.delete("/mandi-targets/{target_id}")
async def delete_mandi_target(target_id: str, username: str = "", role: str = ""):
    """Delete a mandi target (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin target delete kar sakta hai")
    
    result = await db.mandi_targets.delete_one({"id": target_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"message": "Target deleted successfully"}


@api_router.get("/mandi-targets/summary", response_model=List[MandiTargetSummary])
async def get_mandi_target_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get mandi target vs achieved summary for dashboard"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    
    summaries = []
    for target in targets:
        # Get achieved sum for this mandi
        entry_query = {
            "mandi_name": target["mandi_name"],
            "kms_year": target["kms_year"],
            "season": target["season"]
        }
        
        pipeline = [
            {"$match": entry_query},
            {"$group": {"_id": None, "total_final_w": {"$sum": "$final_w"}}}
        ]
        
        result = await db.mill_entries.aggregate(pipeline).to_list(1)
        achieved_kg = result[0]["total_final_w"] if result else 0
        achieved_qntl = round(achieved_kg / 100, 2)
        
        expected_total = target["expected_total"]
        pending_qntl = round(max(0, expected_total - achieved_qntl), 2)
        progress_percent = round((achieved_qntl / expected_total * 100) if expected_total > 0 else 0, 1)
        
        # Calculate agent payment amounts
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_agent_amount = round(target_amount + cutting_amount, 2)
        
        summaries.append(MandiTargetSummary(
            id=target["id"],
            mandi_name=target["mandi_name"],
            target_qntl=target_qntl,
            cutting_percent=target["cutting_percent"],
            expected_total=expected_total,
            achieved_qntl=achieved_qntl,
            pending_qntl=pending_qntl,
            progress_percent=progress_percent,
            base_rate=base_rate,
            cutting_rate=cutting_rate,
            target_amount=target_amount,
            cutting_qntl=cutting_qntl,
            cutting_amount=cutting_amount,
            total_agent_amount=total_agent_amount,
            kms_year=target["kms_year"],
            season=target["season"]
        ))
    
    return summaries


# ============ DASHBOARD ENDPOINTS ============

@api_router.get("/dashboard/agent-totals")
async def get_agent_totals(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get agent-wise totals for bar chart"""
    match_query = {}
    if kms_year:
        match_query["kms_year"] = kms_year
    if season:
        match_query["season"] = season
    
    pipeline = []
    if match_query:
        pipeline.append({"$match": match_query})
    
    pipeline.extend([
        {
            "$group": {
                "_id": "$agent_name",
                "total_qntl": {"$sum": "$qntl"},
                "total_final_w_kg": {"$sum": "$final_w"},
                "total_entries": {"$sum": 1},
                "total_bag": {"$sum": "$bag"}
            }
        },
        {"$sort": {"total_final_w_kg": -1}}
    ])
    
    results = await db.mill_entries.aggregate(pipeline).to_list(50)
    
    agent_totals = []
    for r in results:
        if r["_id"]:  # Skip empty agent names
            agent_totals.append({
                "agent_name": r["_id"],
                "total_qntl": round(r["total_qntl"], 2),
                "total_final_w": round(r["total_final_w_kg"] / 100, 2),
                "total_entries": r["total_entries"],
                "total_bag": r["total_bag"]
            })
    
    return {"agent_totals": agent_totals}


@api_router.get("/dashboard/date-range-totals")
async def get_date_range_totals(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Get totals for a date range (for date filter reporting)"""
    match_query = {}
    
    if start_date and end_date:
        match_query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        match_query["date"] = {"$gte": start_date}
    elif end_date:
        match_query["date"] = {"$lte": end_date}
    
    if kms_year:
        match_query["kms_year"] = kms_year
    if season:
        match_query["season"] = season
    
    pipeline = []
    if match_query:
        pipeline.append({"$match": match_query})
    
    pipeline.append({
        "$group": {
            "_id": None,
            "total_kg": {"$sum": "$kg"},
            "total_qntl": {"$sum": "$qntl"},
            "total_bag": {"$sum": "$bag"},
            "total_final_w": {"$sum": "$final_w"},
            "total_entries": {"$sum": 1}
        }
    })
    
    result = await db.mill_entries.aggregate(pipeline).to_list(1)
    
    if result:
        data = result[0]
        return {
            "total_kg": round(data["total_kg"], 2),
            "total_qntl": round(data["total_qntl"], 2),
            "total_bag": data["total_bag"],
            "total_final_w": round(data["total_final_w"] / 100, 2),
            "total_entries": data["total_entries"],
            "start_date": start_date,
            "end_date": end_date
        }
    
    return {
        "total_kg": 0,
        "total_qntl": 0,
        "total_bag": 0,
        "total_final_w": 0,
        "total_entries": 0,
        "start_date": start_date,
        "end_date": end_date
    }


# ============ TRUCK PAYMENT ENDPOINTS ============

@api_router.get("/truck-payments", response_model=List[TruckPaymentStatus])
async def get_truck_payments(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all truck payments with their status"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    payments = []
    for entry in entries:
        entry_id = entry.get("id")
        
        # Get payment record if exists
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        # Default rate 32, or from payment doc
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(net_amount - paid_amount, 2)
        
        # Use tolerance for floating-point precision (₹0.10 tolerance)
        status = "paid" if balance < 0.10 else ("partial" if paid_amount > 0 else "pending")
        
        payments.append(TruckPaymentStatus(
            entry_id=entry_id,
            truck_no=entry.get("truck_no", ""),
            date=entry.get("date", ""),
            total_qntl=round(entry.get("qntl", 0), 2),
            total_bag=entry.get("bag", 0),
            final_qntl=final_qntl,
            cash_taken=cash_taken,
            diesel_taken=diesel_taken,
            rate_per_qntl=rate,
            gross_amount=gross_amount,
            deductions=deductions,
            net_amount=net_amount,
            paid_amount=paid_amount,
            balance_amount=max(0, balance),
            status=status,
            kms_year=entry.get("kms_year", ""),
            season=entry.get("season", ""),
            agent_name=entry.get("agent_name", ""),
            mandi_name=entry.get("mandi_name", "")
        ))
    
    return payments


@api_router.put("/truck-payments/{entry_id}/rate")
async def set_truck_rate(entry_id: str, request: SetRateRequest, username: str = "", role: str = ""):
    """Set rate for a specific truck entry - auto-updates all entries with same truck_no + mandi_name"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin rate set kar sakta hai")
    
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    truck_no = entry.get("truck_no", "")
    mandi_name = entry.get("mandi_name", "")
    updated_count = 1
    
    if truck_no and mandi_name:
        # Find all entries with same truck_no + mandi_name
        matching = await db.mill_entries.find(
            {"truck_no": truck_no, "mandi_name": mandi_name}, {"_id": 0, "id": 1}
        ).to_list(None)
        for m in matching:
            await db.truck_payments.update_one(
                {"entry_id": m["id"]},
                {"$set": {"entry_id": m["id"], "rate_per_qntl": request.rate_per_qntl, "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True
            )
        updated_count = len(matching)
    else:
        await db.truck_payments.update_one(
            {"entry_id": entry_id},
            {"$set": {"entry_id": entry_id, "rate_per_qntl": request.rate_per_qntl, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
    
    return {"success": True, "message": f"Rate ₹{request.rate_per_qntl}/QNTL set for {updated_count} entries", "updated_count": updated_count, "truck_no": truck_no, "mandi_name": mandi_name}


@api_router.post("/truck-payments/{entry_id}/pay")
async def make_truck_payment(entry_id: str, request: MakePaymentRequest, username: str = "", role: str = ""):
    """Record a payment for truck (partial or full)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin payment kar sakta hai")
    
    # Check entry exists
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    # Get or create payment record
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    current_paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    
    new_paid = current_paid + request.amount
    payments_history.append({
        "amount": request.amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": request.note,
        "by": username
    })
    
    await db.truck_payments.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "entry_id": entry_id,
            "paid_amount": new_paid,
            "payments_history": payments_history,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"success": True, "message": f"₹{request.amount} payment recorded", "total_paid": new_paid}


@api_router.post("/truck-payments/{entry_id}/mark-paid")
async def mark_truck_paid(entry_id: str, username: str = "", role: str = ""):
    """Mark truck payment as fully paid"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin paid mark kar sakta hai")
    
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
    
    final_qntl = entry.get("final_w", 0) / 100
    cash_taken = entry.get("cash_paid", 0) or 0
    diesel_taken = entry.get("diesel_paid", 0) or 0
    net_amount = (final_qntl * rate) - cash_taken - diesel_taken
    
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    payments_history.append({
        "amount": net_amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "Full payment - marked as paid",
        "by": username
    })
    
    await db.truck_payments.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "entry_id": entry_id,
            "paid_amount": net_amount,
            "payments_history": payments_history,
            "status": "paid",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"success": True, "message": "Truck payment cleared"}


# ============ AGENT PAYMENT ENDPOINTS ============

@api_router.get("/agent-payments", response_model=List[AgentPaymentStatus])
async def get_agent_payments(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all agent payments based on mandi targets (not achieved)"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    # Get all mandi targets
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    
    payments = []
    for target in targets:
        mandi_name = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_percent = target["cutting_percent"]
        cutting_qntl = round(target_qntl * cutting_percent / 100, 2)
        expected_total = target["expected_total"]
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        
        # Calculate amounts
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_amount = round(target_amount + cutting_amount, 2)
        
        # Get achieved for this mandi
        entry_query = {
            "mandi_name": mandi_name,
            "kms_year": target["kms_year"],
            "season": target["season"]
        }
        pipeline = [
            {"$match": entry_query},
            {"$group": {
                "_id": None, 
                "total_final_w": {"$sum": "$final_w"},
                "agent_name": {"$first": "$agent_name"}
            }}
        ]
        result = await db.mill_entries.aggregate(pipeline).to_list(1)
        achieved_kg = result[0]["total_final_w"] if result else 0
        achieved_qntl = round(achieved_kg / 100, 2)
        agent_name = result[0]["agent_name"] if result else mandi_name
        
        is_target_complete = achieved_qntl >= expected_total
        
        # Get payment record
        payment_doc = await db.agent_payments.find_one({
            "mandi_name": mandi_name,
            "kms_year": target["kms_year"],
            "season": target["season"]
        }, {"_id": 0})
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        balance = round(total_amount - paid_amount, 2)
        status = "paid" if balance <= 0 else ("partial" if paid_amount > 0 else "pending")
        
        payments.append(AgentPaymentStatus(
            mandi_name=mandi_name,
            agent_name=agent_name,
            target_qntl=target_qntl,
            cutting_percent=cutting_percent,
            cutting_qntl=cutting_qntl,
            base_rate=base_rate,
            cutting_rate=cutting_rate,
            target_amount=target_amount,
            cutting_amount=cutting_amount,
            total_amount=total_amount,
            achieved_qntl=achieved_qntl,
            is_target_complete=is_target_complete,
            paid_amount=paid_amount,
            balance_amount=max(0, balance),
            status=status,
            kms_year=target["kms_year"],
            season=target["season"]
        ))
    
    return payments


@api_router.post("/agent-payments/{mandi_name}/pay")
async def make_agent_payment(mandi_name: str, request: MakePaymentRequest, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Record a payment for agent/mandi (partial or full)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin payment kar sakta hai")
    
    # Get or create payment record
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    current_paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    
    new_paid = current_paid + request.amount
    payments_history.append({
        "amount": request.amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": request.note,
        "by": username
    })
    
    await db.agent_payments.update_one(
        {"mandi_name": mandi_name, "kms_year": kms_year, "season": season},
        {"$set": {
            "mandi_name": mandi_name,
            "kms_year": kms_year,
            "season": season,
            "paid_amount": new_paid,
            "payments_history": payments_history,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"success": True, "message": f"₹{request.amount} payment recorded", "total_paid": new_paid}


@api_router.post("/agent-payments/{mandi_name}/mark-paid")
async def mark_agent_paid(mandi_name: str, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Mark agent/mandi payment as fully paid"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin paid mark kar sakta hai")
    
    # Get target for this mandi
    target = await db.mandi_targets.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    if not target:
        raise HTTPException(status_code=404, detail="Mandi target not found")
    
    # Calculate total amount based on target
    target_qntl = target["target_qntl"]
    cutting_qntl = target_qntl * target["cutting_percent"] / 100
    base_rate = target.get("base_rate", 10)
    cutting_rate = target.get("cutting_rate", 5)
    total_amount = (target_qntl * base_rate) + (cutting_qntl * cutting_rate)
    
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    payments_history = payment_doc.get("payments_history", []) if payment_doc else []
    payments_history.append({
        "amount": total_amount,
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "Full payment - marked as paid",
        "by": username
    })
    
    await db.agent_payments.update_one(
        {"mandi_name": mandi_name, "kms_year": kms_year, "season": season},
        {"$set": {
            "mandi_name": mandi_name,
            "kms_year": kms_year,
            "season": season,
            "paid_amount": total_amount,
            "payments_history": payments_history,
            "status": "paid",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"success": True, "message": "Agent/Mandi payment cleared"}


@api_router.post("/truck-payments/{entry_id}/undo-paid")
async def undo_truck_paid(entry_id: str, username: str = "", role: str = ""):
    """Undo paid status - reset payment to 0 (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin undo kar sakta hai")
    
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    if not payment_doc:
        raise HTTPException(status_code=404, detail="Payment record not found")
    
    payments_history = payment_doc.get("payments_history", [])
    payments_history.append({
        "amount": -payment_doc.get("paid_amount", 0),
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "UNDO - Payment reversed",
        "by": username
    })
    
    await db.truck_payments.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "paid_amount": 0,
            "payments_history": payments_history,
            "status": "pending",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "Payment undo ho gaya - status reset to pending"}


@api_router.post("/agent-payments/{mandi_name}/undo-paid")
async def undo_agent_paid(mandi_name: str, kms_year: str = "", season: str = "", username: str = "", role: str = ""):
    """Undo paid status - reset agent payment to 0 (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin undo kar sakta hai")
    
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    if not payment_doc:
        raise HTTPException(status_code=404, detail="Payment record not found")
    
    payments_history = payment_doc.get("payments_history", [])
    payments_history.append({
        "amount": -payment_doc.get("paid_amount", 0),
        "date": datetime.now(timezone.utc).isoformat(),
        "note": "UNDO - Payment reversed",
        "by": username
    })
    
    await db.agent_payments.update_one(
        {"mandi_name": mandi_name, "kms_year": kms_year, "season": season},
        {"$set": {
            "paid_amount": 0,
            "payments_history": payments_history,
            "status": "pending",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "message": "Payment undo ho gaya - status reset to pending"}


@api_router.get("/truck-payments/{entry_id}/history")
async def get_truck_payment_history(entry_id: str):
    """Get payment history for a truck entry"""
    payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
    if not payment_doc:
        return {"history": [], "total_paid": 0}
    
    return {
        "history": payment_doc.get("payments_history", []),
        "total_paid": payment_doc.get("paid_amount", 0)
    }


@api_router.get("/agent-payments/{mandi_name}/history")
async def get_agent_payment_history(mandi_name: str, kms_year: str = "", season: str = ""):
    """Get payment history for an agent/mandi"""
    payment_doc = await db.agent_payments.find_one({
        "mandi_name": mandi_name,
        "kms_year": kms_year,
        "season": season
    }, {"_id": 0})
    
    if not payment_doc:
        return {"history": [], "total_paid": 0}
    
    return {
        "history": payment_doc.get("payments_history", []),
        "total_paid": payment_doc.get("paid_amount", 0)
    }


@api_router.get("/export/agent-payments-excel")
async def export_agent_payments_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Export agent/mandi payments to styled Excel file"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    
    payments_data = []
    total_amount_sum = 0
    total_paid_sum = 0
    total_balance_sum = 0
    
    for target in targets:
        mandi_name = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_amount = round(target_amount + cutting_amount, 2)
        
        # Get achieved
        entry_query = {"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}
        pipeline = [{"$match": entry_query}, {"$group": {"_id": None, "total_final_w": {"$sum": "$final_w"}, "agent_name": {"$first": "$agent_name"}}}]
        result = await db.mill_entries.aggregate(pipeline).to_list(1)
        achieved_qntl = round(result[0]["total_final_w"] / 100, 2) if result else 0
        agent_name = result[0]["agent_name"] if result else mandi_name
        
        # Get payment
        payment_doc = await db.agent_payments.find_one({"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}, {"_id": 0})
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        balance = round(max(0, total_amount - paid_amount), 2)
        status = "Paid" if balance <= 0 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_amount_sum += total_amount
        total_paid_sum += paid_amount
        total_balance_sum += balance
        
        payments_data.append({
            "mandi_name": mandi_name,
            "agent_name": agent_name,
            "target_qntl": target_qntl,
            "cutting_qntl": cutting_qntl,
            "base_rate": base_rate,
            "cutting_rate": cutting_rate,
            "target_amount": target_amount,
            "cutting_amount": cutting_amount,
            "total_amount": total_amount,
            "achieved_qntl": achieved_qntl,
            "paid": paid_amount,
            "balance": balance,
            "status": status
        })
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Agent Payments"
    
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    total_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    paid_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    pending_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    ws.merge_cells('A1:M1')
    company_name, tagline = await get_company_name()
    ws['A1'] = f"AGENT/MANDI PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}"
    ws['A1'].font = Font(bold=True, size=14, color="D97706")
    ws['A1'].alignment = Alignment(horizontal='center')
    
    headers = ["Mandi", "Agent", "Target QNTL", "Cutting QNTL", "Base Rate", "Cut Rate", "Target Amt", "Cut Amt", "Total Amt", "Achieved", "Paid", "Balance", "Status"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
    
    for row_idx, p in enumerate(payments_data, 4):
        ws.cell(row=row_idx, column=1, value=p["mandi_name"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=2, value=p["agent_name"])
        ws.cell(row=row_idx, column=3, value=p["target_qntl"])
        ws.cell(row=row_idx, column=4, value=p["cutting_qntl"])
        ws.cell(row=row_idx, column=5, value=f"₹{p['base_rate']}")
        ws.cell(row=row_idx, column=6, value=f"₹{p['cutting_rate']}")
        ws.cell(row=row_idx, column=7, value=p["target_amount"])
        ws.cell(row=row_idx, column=8, value=p["cutting_amount"])
        ws.cell(row=row_idx, column=9, value=p["total_amount"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=10, value=p["achieved_qntl"])
        ws.cell(row=row_idx, column=11, value=p["paid"])
        ws.cell(row=row_idx, column=12, value=p["balance"]).font = Font(bold=True, color="DC2626" if p["balance"] > 0 else "059669")
        status_cell = ws.cell(row=row_idx, column=13, value=p["status"])
        if p["status"] == "Paid":
            status_cell.fill = paid_fill
        elif p["status"] == "Pending":
            status_cell.fill = pending_fill
    
    total_row = len(payments_data) + 4
    ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=9, value=round(total_amount_sum, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=11, value=round(total_paid_sum, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=12, value=round(total_balance_sum, 2)).font = Font(bold=True, color="DC2626")
    for col in range(1, 14):
        ws.cell(row=total_row, column=col).fill = total_fill
    
    col_widths = [14, 12, 12, 12, 10, 10, 12, 10, 12, 10, 10, 12, 10]
    for i, width in enumerate(col_widths, 1):
        ws.column_dimensions[chr(64 + i)].width = width
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"agent_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/agent-payments-pdf")
async def export_agent_payments_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Export agent/mandi payments to PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib.enums import TA_CENTER
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    
    payments_data = []
    total_amount_sum = 0
    total_paid_sum = 0
    total_balance_sum = 0
    
    for target in targets:
        mandi_name = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_amount = round(target_amount + cutting_amount, 2)
        
        entry_query = {"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}
        pipeline = [{"$match": entry_query}, {"$group": {"_id": None, "total_final_w": {"$sum": "$final_w"}, "agent_name": {"$first": "$agent_name"}}}]
        result = await db.mill_entries.aggregate(pipeline).to_list(1)
        achieved_qntl = round(result[0]["total_final_w"] / 100, 2) if result else 0
        
        payment_doc = await db.agent_payments.find_one({"mandi_name": mandi_name, "kms_year": target["kms_year"], "season": target["season"]}, {"_id": 0})
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        balance = round(max(0, total_amount - paid_amount), 2)
        status = "Paid" if balance <= 0 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_amount_sum += total_amount
        total_paid_sum += paid_amount
        total_balance_sum += balance
        
        payments_data.append([
            mandi_name[:12],
            f"{target_qntl}",
            f"{cutting_qntl}",
            f"Rs.{base_rate}+Rs.{cutting_rate}",
            f"Rs.{total_amount}",
            f"{achieved_qntl}",
            f"Rs.{paid_amount}",
            f"Rs.{balance}",
            status
        ])
    
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.white, alignment=TA_CENTER)
    company_name, tagline = await get_company_name()
    title_data = [[Paragraph(f"<b>AGENT/MANDI PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}</b>", title_style)]]
    title_table = Table(title_data, colWidths=[page_width - 20*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(title_table)
    elements.append(Table([[""]], colWidths=[page_width], rowHeights=[5*mm]))
    
    headers = ["Mandi", "Target", "Cutting", "Rates", "Total Amt", "Achieved", "Paid", "Balance", "Status"]
    table_data = [headers] + payments_data
    table_data.append(["TOTAL", "", "", "", f"Rs.{round(total_amount_sum, 2)}", "", f"Rs.{round(total_paid_sum, 2)}", f"Rs.{round(total_balance_sum, 2)}", ""])
    
    col_widths = [30*mm, 20*mm, 18*mm, 25*mm, 25*mm, 20*mm, 22*mm, 22*mm, 18*mm]
    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F8FAFC')))
        if payments_data[i-1][-1] == "Paid":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#D1FAE5')))
        elif payments_data[i-1][-1] == "Pending":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#FEE2E2')))
    
    main_table.setStyle(TableStyle(style_commands))
    elements.append(main_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"agent_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/dashboard/monthly-trend")
async def get_monthly_trend(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get monthly totals for trend chart"""
    match_query = {}
    if kms_year:
        match_query["kms_year"] = kms_year
    if season:
        match_query["season"] = season
    
    pipeline = []
    if match_query:
        pipeline.append({"$match": match_query})
    
    pipeline.extend([
        {
            "$addFields": {
                "month": {"$substr": ["$date", 0, 7]}  # Extract YYYY-MM
            }
        },
        {
            "$group": {
                "_id": "$month",
                "total_qntl": {"$sum": "$qntl"},
                "total_final_w_kg": {"$sum": "$final_w"},
                "total_entries": {"$sum": 1},
                "total_bag": {"$sum": "$bag"}
            }
        },
        {"$sort": {"_id": 1}}
    ])
    
    results = await db.mill_entries.aggregate(pipeline).to_list(12)
    
    monthly_data = []
    for r in results:
        if r["_id"]:
            monthly_data.append({
                "month": r["_id"],
                "total_qntl": round(r["total_qntl"], 2),
                "total_final_w": round(r["total_final_w_kg"] / 100, 2),
                "total_entries": r["total_entries"],
                "total_bag": r["total_bag"]
            })
    
    return {"monthly_data": monthly_data}


@api_router.get("/export/summary-report-pdf")
async def export_summary_report_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Export complete summary report - Truck Payments + Agent Payments + Targets"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, textColor=colors.white, alignment=TA_CENTER)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#D97706'), alignment=TA_LEFT, spaceBefore=10, spaceAfter=5)
    
    # Main Title
    title_data = [[Paragraph("<b>NAVKAR AGRO - COMPLETE SUMMARY REPORT</b>", title_style)]]
    title_table = Table(title_data, colWidths=[page_width - 20*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(title_table)
    
    # Subtitle
    sub_style = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#475569'), alignment=TA_CENTER)
    elements.append(Paragraph(f"KMS Year: {kms_year or 'All'} | Season: {season or 'All'} | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}", sub_style))
    elements.append(Spacer(1, 10*mm))
    
    # ============ SECTION 1: MANDI TARGETS ============
    elements.append(Paragraph("MANDI TARGETS", section_style))
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    if targets:
        target_headers = ["Mandi", "Target QNTL", "Cut %", "Expected", "Achieved", "Pending", "Progress"]
        target_data = [target_headers]
        
        for t in targets:
            entry_q = {"mandi_name": t["mandi_name"], "kms_year": t["kms_year"], "season": t["season"]}
            pipe = [{"$match": entry_q}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
            res = await db.mill_entries.aggregate(pipe).to_list(1)
            achieved = round(res[0]["total"] / 100, 2) if res else 0
            expected = t["expected_total"]
            pending = round(max(0, expected - achieved), 2)
            progress = round((achieved / expected * 100) if expected > 0 else 0, 1)
            
            target_data.append([
                t["mandi_name"],
                str(t["target_qntl"]),
                f"{t['cutting_percent']}%",
                str(expected),
                str(achieved),
                str(pending),
                f"{progress}%"
            ])
        
        target_table = Table(target_data, colWidths=[35*mm, 25*mm, 18*mm, 25*mm, 25*mm, 25*mm, 22*mm])
        target_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ]))
        elements.append(target_table)
    else:
        elements.append(Paragraph("No targets set", styles['Normal']))
    
    elements.append(Spacer(1, 8*mm))
    
    # ============ SECTION 2: TRUCK PAYMENTS SUMMARY ============
    elements.append(Paragraph("TRUCK PAYMENTS (BHADA)", section_style))
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    truck_total_net = 0
    truck_total_paid = 0
    truck_total_balance = 0
    truck_data_rows = []
    
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash = entry.get("cash_paid", 0) or 0
        diesel = entry.get("diesel_paid", 0) or 0
        gross = round(final_qntl * rate, 2)
        net = round(gross - cash - diesel, 2)
        balance = round(max(0, net - paid), 2)
        status = "Paid" if balance < 0.10 else "Pending"
        
        truck_total_net += net
        truck_total_paid += paid
        truck_total_balance += balance
        
        truck_data_rows.append([
            entry.get("date", "")[:10],
            entry.get("truck_no", "")[:12],
            entry.get("mandi_name", "")[:12],
            f"{final_qntl}",
            f"Rs.{net}",
            f"Rs.{paid}",
            f"Rs.{balance}",
            status
        ])
    
    if truck_data_rows:
        truck_headers = ["Date", "Truck No", "Mandi", "QNTL", "Net Amt", "Paid", "Balance", "Status"]
        truck_table_data = [truck_headers] + truck_data_rows
        truck_table_data.append(["TOTAL", "", "", "", f"Rs.{round(truck_total_net, 2)}", f"Rs.{round(truck_total_paid, 2)}", f"Rs.{round(truck_total_balance, 2)}", ""])
        
        truck_table = Table(truck_table_data, colWidths=[20*mm, 25*mm, 25*mm, 18*mm, 25*mm, 22*mm, 22*mm, 18*mm])
        truck_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))
        elements.append(truck_table)
    
    elements.append(Spacer(1, 8*mm))
    
    # ============ SECTION 3: AGENT PAYMENTS SUMMARY ============
    elements.append(Paragraph("AGENT/MANDI PAYMENTS", section_style))
    
    agent_total_amt = 0
    agent_total_paid = 0
    agent_total_balance = 0
    agent_data_rows = []
    
    for target in targets:
        mandi = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        total_amt = round((target_qntl * base_rate) + (cutting_qntl * cutting_rate), 2)
        
        payment_doc = await db.agent_payments.find_one({"mandi_name": mandi, "kms_year": target["kms_year"], "season": target["season"]}, {"_id": 0})
        paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
        balance = round(max(0, total_amt - paid), 2)
        status = "Paid" if balance <= 0 else "Pending"
        
        agent_total_amt += total_amt
        agent_total_paid += paid
        agent_total_balance += balance
        
        agent_data_rows.append([
            mandi,
            f"{target_qntl}",
            f"{cutting_qntl}",
            f"Rs.{base_rate}/Rs.{cutting_rate}",
            f"Rs.{total_amt}",
            f"Rs.{paid}",
            f"Rs.{balance}",
            status
        ])
    
    if agent_data_rows:
        agent_headers = ["Mandi", "Target", "Cutting", "Rates", "Total Amt", "Paid", "Balance", "Status"]
        agent_table_data = [agent_headers] + agent_data_rows
        agent_table_data.append(["TOTAL", "", "", "", f"Rs.{round(agent_total_amt, 2)}", f"Rs.{round(agent_total_paid, 2)}", f"Rs.{round(agent_total_balance, 2)}", ""])
        
        agent_table = Table(agent_table_data, colWidths=[30*mm, 20*mm, 20*mm, 30*mm, 25*mm, 22*mm, 22*mm, 18*mm])
        agent_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))
        elements.append(agent_table)
    
    elements.append(Spacer(1, 8*mm))
    
    # ============ GRAND TOTAL ============
    elements.append(Paragraph("GRAND TOTAL", section_style))
    
    grand_total_amt = truck_total_net + agent_total_amt
    grand_total_paid = truck_total_paid + agent_total_paid
    grand_total_balance = truck_total_balance + agent_total_balance
    
    grand_data = [
        ["", "Total Amount", "Paid", "Balance"],
        ["Truck Payments", f"Rs.{round(truck_total_net, 2)}", f"Rs.{round(truck_total_paid, 2)}", f"Rs.{round(truck_total_balance, 2)}"],
        ["Agent Payments", f"Rs.{round(agent_total_amt, 2)}", f"Rs.{round(agent_total_paid, 2)}", f"Rs.{round(agent_total_balance, 2)}"],
        ["GRAND TOTAL", f"Rs.{round(grand_total_amt, 2)}", f"Rs.{round(grand_total_paid, 2)}", f"Rs.{round(grand_total_balance, 2)}"]
    ]
    
    grand_table = Table(grand_data, colWidths=[50*mm, 40*mm, 40*mm, 40*mm])
    grand_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D97706')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(grand_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"summary_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/truck-owner-excel")
async def export_truck_owner_excel(
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck owner consolidated payments to Excel"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Group by truck_no
    truck_data = {}
    for entry in entries:
        truck_no = entry.get("truck_no", "Unknown")
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        
        if truck_no not in truck_data:
            truck_data[truck_no] = {
                "truck_no": truck_no,
                "trips": 0,
                "total_qntl": 0,
                "total_gross": 0,
                "total_deductions": 0,
                "total_net": 0,
                "total_paid": 0,
                "total_balance": 0
            }
        
        truck_data[truck_no]["trips"] += 1
        truck_data[truck_no]["total_qntl"] += final_qntl
        truck_data[truck_no]["total_gross"] += gross_amount
        truck_data[truck_no]["total_deductions"] += deductions
        truck_data[truck_no]["total_net"] += net_amount
        truck_data[truck_no]["total_paid"] += paid_amount
        truck_data[truck_no]["total_balance"] += balance
    
    consolidated = list(truck_data.values())
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Truck Owner Payments"
    
    # Styles
    header_fill = PatternFill(start_color="0891B2", end_color="0891B2", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    total_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    
    # Title
    ws.merge_cells('A1:I1')
    company_name, tagline = await get_company_name()
    ws['A1'] = f"TRUCK OWNER CONSOLIDATED PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}"
    ws['A1'].font = Font(bold=True, size=14, color="0891B2")
    ws['A1'].alignment = Alignment(horizontal='center')
    
    ws.merge_cells('A2:I2')
    ws['A2'] = "Ek truck ke saare trips ka combined payment"
    ws['A2'].font = Font(size=10, color="666666")
    ws['A2'].alignment = Alignment(horizontal='center')
    
    # Headers
    headers = ["Truck No", "Total Trips", "Total QNTL", "Gross Amount", "Deductions", "Net Payable", "Paid", "Balance", "Status"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    grand_net = 0
    grand_paid = 0
    grand_balance = 0
    
    for row_idx, t in enumerate(consolidated, 5):
        status = "Paid" if t["total_balance"] < 0.10 else ("Partial" if t["total_paid"] > 0 else "Pending")
        
        ws.cell(row=row_idx, column=1, value=t["truck_no"]).font = Font(bold=True, size=11)
        ws.cell(row=row_idx, column=2, value=t["trips"]).alignment = Alignment(horizontal='center')
        ws.cell(row=row_idx, column=3, value=round(t["total_qntl"], 2))
        ws.cell(row=row_idx, column=4, value=round(t["total_gross"], 2))
        ws.cell(row=row_idx, column=5, value=round(t["total_deductions"], 2))
        ws.cell(row=row_idx, column=6, value=round(t["total_net"], 2)).font = Font(bold=True)
        ws.cell(row=row_idx, column=7, value=round(t["total_paid"], 2))
        ws.cell(row=row_idx, column=8, value=round(t["total_balance"], 2)).font = Font(bold=True, color="DC2626" if t["total_balance"] > 0 else "059669")
        ws.cell(row=row_idx, column=9, value=status)
        
        grand_net += t["total_net"]
        grand_paid += t["total_paid"]
        grand_balance += t["total_balance"]
    
    # Grand Total row
    total_row = len(consolidated) + 5
    ws.cell(row=total_row, column=1, value="GRAND TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=2, value=len(consolidated)).alignment = Alignment(horizontal='center')
    ws.cell(row=total_row, column=6, value=round(grand_net, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=7, value=round(grand_paid, 2)).font = Font(bold=True, color="059669")
    ws.cell(row=total_row, column=8, value=round(grand_balance, 2)).font = Font(bold=True, color="DC2626")
    
    for col in range(1, 10):
        ws.cell(row=total_row, column=col).fill = total_fill
    
    # Column widths
    widths = [15, 12, 12, 14, 12, 14, 12, 12, 10]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"truck_owner_consolidated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/export/truck-owner-pdf")
async def export_truck_owner_pdf(
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck owner consolidated payments to PDF"""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Group by truck_no
    truck_data = {}
    for entry in entries:
        truck_no = entry.get("truck_no", "Unknown")
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        
        if truck_no not in truck_data:
            truck_data[truck_no] = {
                "truck_no": truck_no,
                "trips": 0,
                "total_qntl": 0,
                "total_gross": 0,
                "total_deductions": 0,
                "total_net": 0,
                "total_paid": 0,
                "total_balance": 0
            }
        
        truck_data[truck_no]["trips"] += 1
        truck_data[truck_no]["total_qntl"] += final_qntl
        truck_data[truck_no]["total_gross"] += gross_amount
        truck_data[truck_no]["total_deductions"] += deductions
        truck_data[truck_no]["total_net"] += net_amount
        truck_data[truck_no]["total_paid"] += paid_amount
        truck_data[truck_no]["total_balance"] += balance
    
    consolidated = list(truck_data.values())
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), topMargin=30, bottomMargin=30)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#0891B2'), alignment=1)
    company_name, tagline = await get_company_name()
    elements.append(Paragraph(f"TRUCK OWNER CONSOLIDATED PAYMENTS - {company_name}", title_style))
    elements.append(Paragraph(f"{company_name} - {tagline}", ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, alignment=1)))
    elements.append(Paragraph(f"KMS Year: {kms_year or 'All'} | Season: {season or 'All'} | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}", ParagraphStyle('Info', parent=styles['Normal'], fontSize=9, alignment=1, textColor=colors.gray)))
    elements.append(Spacer(1, 20))
    
    # Table
    table_data = [["Truck No", "Trips", "Total QNTL", "Gross", "Deductions", "Net Payable", "Paid", "Balance", "Status"]]
    
    grand_net = 0
    grand_paid = 0
    grand_balance = 0
    
    for t in consolidated:
        status = "PAID" if t["total_balance"] < 0.10 else ("PARTIAL" if t["total_paid"] > 0 else "PENDING")
        table_data.append([
            t["truck_no"],
            str(t["trips"]),
            f"{t['total_qntl']:.2f}",
            f"Rs.{t['total_gross']:.0f}",
            f"Rs.{t['total_deductions']:.0f}",
            f"Rs.{t['total_net']:.0f}",
            f"Rs.{t['total_paid']:.0f}",
            f"Rs.{t['total_balance']:.0f}",
            status
        ])
        grand_net += t["total_net"]
        grand_paid += t["total_paid"]
        grand_balance += t["total_balance"]
    
    # Grand Total
    table_data.append([
        "GRAND TOTAL",
        str(len(consolidated)),
        "",
        "",
        "",
        f"Rs.{grand_net:.0f}",
        f"Rs.{grand_paid:.0f}",
        f"Rs.{grand_balance:.0f}",
        ""
    ])
    
    table = Table(table_data, colWidths=[80, 50, 70, 70, 70, 80, 70, 70, 60])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0891B2')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"truck_owner_consolidated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============ MILLING ENTRY CRUD APIs ============

def calculate_milling_fields(data: dict) -> dict:
    """Auto-calculate QNTL values from percentages and paddy input"""
    paddy = data.get('paddy_input_qntl', 0) or 0
    
    rice_pct = data.get('rice_percent', 0) or 0
    frk_pct = data.get('frk_percent', 0) or 0
    bran_pct = data.get('bran_percent', 0) or 0
    kunda_pct = data.get('kunda_percent', 0) or 0
    broken_pct = data.get('broken_percent', 0) or 0
    kanki_pct = data.get('kanki_percent', 0) or 0
    
    # Husk = remainder
    used_pct = rice_pct + frk_pct + bran_pct + kunda_pct + broken_pct + kanki_pct
    husk_pct = max(0, 100 - used_pct)
    
    data['husk_percent'] = round(husk_pct, 2)
    data['rice_qntl'] = round(paddy * rice_pct / 100, 2)
    data['frk_qntl'] = round(paddy * frk_pct / 100, 2)
    data['bran_qntl'] = round(paddy * bran_pct / 100, 2)
    data['kunda_qntl'] = round(paddy * kunda_pct / 100, 2)
    data['broken_qntl'] = round(paddy * broken_pct / 100, 2)
    data['kanki_qntl'] = round(paddy * kanki_pct / 100, 2)
    data['husk_qntl'] = round(paddy * husk_pct / 100, 2)
    
    # CMR delivery = rice + frk
    data['cmr_delivery_qntl'] = round(data['rice_qntl'] + data['frk_qntl'], 2)
    # Outturn ratio
    data['outturn_ratio'] = round((rice_pct + frk_pct), 2) if paddy > 0 else 0
    
    return data


@api_router.post("/milling-entries")
async def create_milling_entry(input: MillingEntryCreate, username: str = "", role: str = ""):
    entry_dict = input.model_dump()
    entry_dict = calculate_milling_fields(entry_dict)
    entry_dict['created_by'] = username
    entry_obj = MillingEntry(**entry_dict)
    doc = entry_obj.model_dump()
    await db.milling_entries.insert_one(doc)
    doc.pop('_id', None)
    return doc


@api_router.get("/milling-entries")
async def get_milling_entries(
    rice_type: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    query = {}
    if rice_type:
        query["rice_type"] = rice_type
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        if date_query:
            query["date"] = date_query
    
    entries = await db.milling_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return entries


@api_router.get("/milling-entries/{entry_id}")
async def get_milling_entry(entry_id: str):
    entry = await db.milling_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Milling entry not found")
    return entry


@api_router.put("/milling-entries/{entry_id}")
async def update_milling_entry(entry_id: str, input: MillingEntryCreate, username: str = "", role: str = ""):
    existing = await db.milling_entries.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milling entry not found")
    
    update_dict = input.model_dump()
    update_dict = calculate_milling_fields(update_dict)
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.milling_entries.update_one({"id": entry_id}, {"$set": update_dict})
    updated = await db.milling_entries.find_one({"id": entry_id}, {"_id": 0})
    return updated


@api_router.delete("/milling-entries/{entry_id}")
async def delete_milling_entry(entry_id: str, username: str = "", role: str = ""):
    existing = await db.milling_entries.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milling entry not found")
    await db.milling_entries.delete_one({"id": entry_id})
    return {"message": "Milling entry deleted", "id": entry_id}


@api_router.get("/milling-summary")
async def get_milling_summary(
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.milling_entries.find(query, {"_id": 0}).to_list(1000)
    
    total_paddy = sum(e.get('paddy_input_qntl', 0) for e in entries)
    total_rice = sum(e.get('rice_qntl', 0) for e in entries)
    total_frk = sum(e.get('frk_qntl', 0) for e in entries)
    total_bran = sum(e.get('bran_qntl', 0) for e in entries)
    total_kunda = sum(e.get('kunda_qntl', 0) for e in entries)
    total_broken = sum(e.get('broken_qntl', 0) for e in entries)
    total_kanki = sum(e.get('kanki_qntl', 0) for e in entries)
    total_husk = sum(e.get('husk_qntl', 0) for e in entries)
    total_cmr = sum(e.get('cmr_delivery_qntl', 0) for e in entries)
    
    avg_outturn = round((total_rice + total_frk) / total_paddy * 100, 2) if total_paddy > 0 else 0
    
    # Breakdown by rice_type
    parboiled = [e for e in entries if e.get('rice_type') == 'parboiled']
    raw = [e for e in entries if e.get('rice_type') == 'raw']
    
    def type_summary(elist):
        tp = sum(e.get('paddy_input_qntl', 0) for e in elist)
        tr = sum(e.get('rice_qntl', 0) for e in elist)
        tf = sum(e.get('frk_qntl', 0) for e in elist)
        return {
            "count": len(elist),
            "total_paddy_qntl": round(tp, 2),
            "total_rice_qntl": round(tr, 2),
            "total_frk_qntl": round(tf, 2),
            "total_cmr_qntl": round(tr + tf, 2),
            "avg_outturn": round((tr + tf) / tp * 100, 2) if tp > 0 else 0
        }
    
    return {
        "total_entries": len(entries),
        "total_paddy_qntl": round(total_paddy, 2),
        "total_rice_qntl": round(total_rice, 2),
        "total_frk_qntl": round(total_frk, 2),
        "total_bran_qntl": round(total_bran, 2),
        "total_kunda_qntl": round(total_kunda, 2),
        "total_broken_qntl": round(total_broken, 2),
        "total_kanki_qntl": round(total_kanki, 2),
        "total_husk_qntl": round(total_husk, 2),
        "total_cmr_qntl": round(total_cmr, 2),
        "avg_outturn_ratio": avg_outturn,
        "parboiled": type_summary(parboiled),
        "raw": type_summary(raw)
    }


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
