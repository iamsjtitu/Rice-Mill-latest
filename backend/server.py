from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import StreamingResponse
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
    cutting_percent: float = 0  # Cutting percentage (5%, 5.26% etc)
    cutting: float = 0  # Auto calculated from percentage
    disc_dust_poll: float = 0
    final_w: float = 0  # Auto calculated
    g_issued: float = 0
    moisture: float = 0
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


def calculate_auto_fields(data: dict) -> dict:
    """Calculate automatic fields based on input data"""
    kg = data.get('kg', 0) or 0
    gbw_cut = data.get('gbw_cut', 0) or 0
    disc_dust_poll = data.get('disc_dust_poll', 0) or 0
    plastic_bag = data.get('plastic_bag', 0) or 0
    cutting_percent = data.get('cutting_percent', 0) or 0
    
    # P.Pkt cut calculation (0.5 kg per plastic bag)
    p_pkt_cut = round(plastic_bag * 0.5, 2)
    data['p_pkt_cut'] = p_pkt_cut
    
    # Weight after GBW cut for cutting calculation
    weight_for_cutting = kg - gbw_cut - p_pkt_cut
    
    # Cutting calculation based on percentage
    cutting = round((weight_for_cutting * cutting_percent) / 100, 2)
    data['cutting'] = cutting
    
    # Auto calculations
    data['qntl'] = round(kg / 100, 2)  # KG to Quintals
    data['mill_w'] = round(kg - gbw_cut, 2)  # Mill Weight
    data['final_w'] = round(kg - gbw_cut - p_pkt_cut - cutting - disc_dust_poll, 2)  # Final Weight
    
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
    if username in USERS and USERS[username]["role"] == role:
        return {"valid": True, "username": username, "role": role}
    return {"valid": False}


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
    """Export entries to CSV (Excel compatible)"""
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
    
    output = io.StringIO()
    
    headers = [
        "Date", "KMS Year", "Season", "Truck No", "Agent Name", "Mandi Name", 
        "KG", "QNTL", "BAG", "G.Deposite", "GBW Cut", "Mill W", 
        "P.Pkt (Bags)", "P.Pkt Cut", "Cutting %", "Final W", 
        "G.Issued", "Cash Paid", "Diesel Paid", "Remark"
    ]
    
    writer = csv.writer(output)
    writer.writerow(headers)
    
    for entry in entries:
        row = [
            entry.get('date', ''),
            entry.get('kms_year', ''),
            entry.get('season', ''),
            entry.get('truck_no', ''),
            entry.get('agent_name', ''),
            entry.get('mandi_name', ''),
            entry.get('kg', 0),
            entry.get('qntl', 0),
            entry.get('bag', 0),
            entry.get('g_deposite', 0),
            entry.get('gbw_cut', 0),
            entry.get('mill_w', 0),
            entry.get('plastic_bag', 0),
            entry.get('p_pkt_cut', 0),
            entry.get('cutting_percent', 0),
            entry.get('final_w', 0),
            entry.get('g_issued', 0),
            entry.get('cash_paid', 0),
            entry.get('diesel_paid', 0),
            entry.get('remark', '')
        ]
        writer.writerow(row)
    
    totals = await get_totals(truck_no, agent_name, mandi_name, kms_year, season)
    totals_row = [
        "TOTAL", "", "", "", "", "",
        totals.total_kg, totals.total_qntl, totals.total_bag, totals.total_g_deposite,
        totals.total_gbw_cut, totals.total_mill_w, "", totals.total_p_pkt_cut,
        "", totals.total_final_w, totals.total_g_issued,
        totals.total_cash_paid, totals.total_diesel_paid, ""
    ]
    writer.writerow(totals_row)
    
    output.seek(0)
    
    filename = f"mill_entries_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


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
