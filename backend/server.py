from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import StreamingResponse, Response
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
    kms_year: str  # e.g., "2025-2026"
    season: str  # "Kharif" or "Rabi"
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MandiTargetCreate(BaseModel):
    mandi_name: str
    target_qntl: float
    cutting_percent: float = 5.0
    kms_year: str
    season: str


class MandiTargetUpdate(BaseModel):
    mandi_name: Optional[str] = None
    target_qntl: Optional[float] = None
    cutting_percent: Optional[float] = None
    kms_year: Optional[str] = None
    season: Optional[str] = None


class MandiTargetSummary(BaseModel):
    id: str  # Target ID for edit/delete
    mandi_name: str
    target_qntl: float
    cutting_percent: float
    expected_total: float
    achieved_qntl: float  # Sum of final_w for this mandi
    pending_qntl: float  # expected_total - achieved_qntl
    progress_percent: float  # (achieved / expected) * 100
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
    agent_name: str
    total_final_qntl: float
    rate_per_qntl: float
    total_amount: float
    paid_amount: float
    balance_amount: float
    status: str  # pending, partial, paid
    kms_year: str
    season: str
    total_entries: int


class SetRateRequest(BaseModel):
    rate_per_qntl: float


class MakePaymentRequest(BaseModel):
    amount: float
    note: str = ""


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
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
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
    season: Optional[str] = None
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
    ws['A1'] = f"NAVKAR AGRO - Mill Entries | KMS: {kms_year or 'All'} | {season or 'All Seasons'}"
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
    title_text = f"NAVKAR AGRO - Mill Entries | KMS: {kms_year or 'All'} | {season or 'All Seasons'}"
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
        
        summaries.append(MandiTargetSummary(
            id=target["id"],
            mandi_name=target["mandi_name"],
            target_qntl=target["target_qntl"],
            cutting_percent=target["cutting_percent"],
            expected_total=expected_total,
            achieved_qntl=achieved_qntl,
            pending_qntl=pending_qntl,
            progress_percent=progress_percent,
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
