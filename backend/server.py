from fastapi import FastAPI, APIRouter, HTTPException
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
from datetime import datetime, timezone
import io
import csv

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


# Define Models
class MillEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
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
    total_wt: float = 0
    g_issued: float = 0
    moisture: float = 0
    disc_dust_poll: float = 0
    final_w: float = 0  # Auto calculated
    cash_paid: float = 0
    diesel_paid: float = 0
    remark: str = ""
    fc: float = 0  # Final Cost
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MillEntryCreate(BaseModel):
    date: str
    truck_no: str = ""
    agent_name: str = ""
    mandi_name: str = ""
    kg: float = 0
    bag: int = 0
    g_deposite: float = 0
    gbw_cut: float = 0
    plastic_bag: int = 0
    cutting_percent: float = 0
    total_wt: float = 0
    g_issued: float = 0
    moisture: float = 0
    disc_dust_poll: float = 0
    cash_paid: float = 0
    diesel_paid: float = 0
    remark: str = ""
    fc: float = 0


class MillEntryUpdate(BaseModel):
    date: Optional[str] = None
    truck_no: Optional[str] = None
    agent_name: Optional[str] = None
    mandi_name: Optional[str] = None
    kg: Optional[float] = None
    bag: Optional[int] = None
    g_deposite: Optional[float] = None
    gbw_cut: Optional[float] = None
    plastic_bag: Optional[int] = None
    cutting_percent: Optional[float] = None
    total_wt: Optional[float] = None
    g_issued: Optional[float] = None
    moisture: Optional[float] = None
    disc_dust_poll: Optional[float] = None
    cash_paid: Optional[float] = None
    diesel_paid: Optional[float] = None
    remark: Optional[str] = None
    fc: Optional[float] = None


class TotalsResponse(BaseModel):
    total_kg: float = 0
    total_qntl: float = 0
    total_bag: int = 0
    total_g_deposite: float = 0
    total_gbw_cut: float = 0
    total_mill_w: float = 0
    total_p_pkt_cut: float = 0
    total_cutting: float = 0
    total_wt: float = 0
    total_g_issued: float = 0
    total_disc_dust_poll: float = 0
    total_final_w: float = 0
    total_cash_paid: float = 0
    total_diesel_paid: float = 0
    total_fc: float = 0


# Agent-Mandi Category Models
class AgentMandi(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_name: str
    mandi_names: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AgentMandiCreate(BaseModel):
    agent_name: str
    mandi_names: List[str] = []


def calculate_auto_fields(data: dict) -> dict:
    """Calculate automatic fields based on input data"""
    kg = data.get('kg', 0) or 0
    gbw_cut = data.get('gbw_cut', 0) or 0
    disc_dust_poll = data.get('disc_dust_poll', 0) or 0
    plastic_bag = data.get('plastic_bag', 0) or 0
    cutting_percent = data.get('cutting_percent', 0) or 0
    bag = data.get('bag', 0) or 0
    g_deposite = data.get('g_deposite', 0) or 0
    
    # P.Pkt cut calculation (0.5 kg per plastic bag)
    p_pkt_cut = round(plastic_bag * 0.5, 2)
    data['p_pkt_cut'] = p_pkt_cut
    
    # BAG cutting rate logic:
    # If G.Deposite is manually set (different from 0 and entered by user) → 0.50 kg/bag
    # If G.Deposite is empty or equals bag → 1 kg/bag
    # This is represented by GBW cut field
    
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


# Add your routes to the router
@api_router.get("/")
async def root():
    return {"message": "Mill Entry API - Navkar Agro"}


# ============ MILL ENTRIES CRUD ============

@api_router.post("/entries", response_model=MillEntry)
async def create_entry(input: MillEntryCreate):
    entry_dict = input.model_dump()
    entry_dict = calculate_auto_fields(entry_dict)
    
    entry_obj = MillEntry(**entry_dict)
    doc = entry_obj.model_dump()
    
    await db.mill_entries.insert_one(doc)
    return entry_obj


@api_router.get("/entries", response_model=List[MillEntry])
async def get_entries(
    truck_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None
):
    query = {}
    
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if agent_name:
        query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return entries


@api_router.get("/entries/{entry_id}", response_model=MillEntry)
async def get_entry(entry_id: str):
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@api_router.put("/entries/{entry_id}", response_model=MillEntry)
async def update_entry(entry_id: str, input: MillEntryUpdate):
    existing = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    
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
async def delete_entry(entry_id: str):
    result = await db.mill_entries.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Entry deleted successfully"}


@api_router.get("/totals", response_model=TotalsResponse)
async def get_totals(
    truck_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None
):
    match_query = {}
    
    if truck_no:
        match_query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if agent_name:
        match_query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        match_query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    
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
            "total_wt": {"$sum": "$total_wt"},
            "total_g_issued": {"$sum": "$g_issued"},
            "total_disc_dust_poll": {"$sum": "$disc_dust_poll"},
            "total_final_w": {"$sum": "$final_w"},
            "total_cash_paid": {"$sum": "$cash_paid"},
            "total_diesel_paid": {"$sum": "$diesel_paid"},
            "total_fc": {"$sum": "$fc"}
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
    """Get unique truck numbers for auto-suggest"""
    if len(q) < 1:
        trucks = await db.mill_entries.distinct("truck_no")
    else:
        trucks = await db.mill_entries.distinct("truck_no", {"truck_no": {"$regex": q, "$options": "i"}})
    
    return {"suggestions": [t for t in trucks if t]}


@api_router.get("/suggestions/agents")
async def get_agent_suggestions(q: str = ""):
    """Get unique agent names for auto-suggest"""
    if len(q) < 1:
        agents = await db.mill_entries.distinct("agent_name")
    else:
        agents = await db.mill_entries.distinct("agent_name", {"agent_name": {"$regex": q, "$options": "i"}})
    
    return {"suggestions": [a for a in agents if a]}


@api_router.get("/suggestions/mandis")
async def get_mandi_suggestions(q: str = "", agent_name: str = ""):
    """Get unique mandi names for auto-suggest, optionally filtered by agent"""
    query = {}
    if q:
        query["mandi_name"] = {"$regex": q, "$options": "i"}
    if agent_name:
        query["agent_name"] = agent_name
    
    mandis = await db.mill_entries.distinct("mandi_name", query if query else None)
    
    return {"suggestions": [m for m in mandis if m]}


# ============ AGENT-MANDI CATEGORY MANAGEMENT ============

@api_router.post("/agent-mandi", response_model=AgentMandi)
async def create_agent_mandi(input: AgentMandiCreate):
    # Check if agent already exists
    existing = await db.agent_mandis.find_one({"agent_name": input.agent_name}, {"_id": 0})
    if existing:
        # Update mandi list
        new_mandis = list(set(existing.get('mandi_names', []) + input.mandi_names))
        await db.agent_mandis.update_one(
            {"agent_name": input.agent_name},
            {"$set": {"mandi_names": new_mandis}}
        )
        updated = await db.agent_mandis.find_one({"agent_name": input.agent_name}, {"_id": 0})
        return AgentMandi(**updated)
    
    agent_mandi = AgentMandi(**input.model_dump())
    doc = agent_mandi.model_dump()
    await db.agent_mandis.insert_one(doc)
    return agent_mandi


@api_router.get("/agent-mandi", response_model=List[AgentMandi])
async def get_agent_mandis():
    agent_mandis = await db.agent_mandis.find({}, {"_id": 0}).to_list(100)
    return agent_mandis


@api_router.get("/agent-mandi/{agent_name}/mandis")
async def get_mandis_for_agent(agent_name: str):
    """Get mandi names for a specific agent"""
    agent = await db.agent_mandis.find_one({"agent_name": {"$regex": f"^{agent_name}$", "$options": "i"}}, {"_id": 0})
    if agent:
        return {"mandis": agent.get('mandi_names', [])}
    
    # Fallback: get from entries
    mandis = await db.mill_entries.distinct("mandi_name", {"agent_name": agent_name})
    return {"mandis": [m for m in mandis if m]}


@api_router.delete("/agent-mandi/{agent_id}")
async def delete_agent_mandi(agent_id: str):
    result = await db.agent_mandis.delete_one({"id": agent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent-Mandi not found")
    return {"message": "Agent-Mandi deleted successfully"}


# ============ EXPORT ENDPOINTS ============

@api_router.get("/export/excel")
async def export_excel(
    truck_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None
):
    """Export entries to CSV (Excel compatible)"""
    query = {}
    
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if agent_name:
        query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Create CSV
    output = io.StringIO()
    
    headers = [
        "Date", "Truck No", "Agent Name", "Mandi Name", "KG", "QNTL", 
        "BAG", "G.Deposite", "GBW Cut", "Mill W", "P.Pkt (Bags)", "P.Pkt Cut",
        "Cutting %", "Cutting", "Disc/Dust/Poll", "Final W", 
        "Cash Paid", "Diesel Paid", "F.C", "Remark"
    ]
    
    writer = csv.writer(output)
    writer.writerow(headers)
    
    for entry in entries:
        row = [
            entry.get('date', ''),
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
            entry.get('cutting', 0),
            entry.get('disc_dust_poll', 0),
            entry.get('final_w', 0),
            entry.get('cash_paid', 0),
            entry.get('diesel_paid', 0),
            entry.get('fc', 0),
            entry.get('remark', '')
        ]
        writer.writerow(row)
    
    # Add totals row
    totals = await get_totals(truck_no, agent_name, mandi_name)
    totals_row = [
        "TOTAL", "", "", "", 
        totals.total_kg, totals.total_qntl, totals.total_bag, totals.total_g_deposite,
        totals.total_gbw_cut, totals.total_mill_w, "", totals.total_p_pkt_cut,
        "", totals.total_cutting, totals.total_disc_dust_poll, totals.total_final_w,
        totals.total_cash_paid, totals.total_diesel_paid, totals.total_fc, ""
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
