from fastapi import FastAPI, APIRouter, HTTPException
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
    cutting: float = 0
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
    cutting: float = 0
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
    cutting: Optional[float] = None
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
    total_cutting: float = 0
    total_wt: float = 0
    total_g_issued: float = 0
    total_disc_dust_poll: float = 0
    total_final_w: float = 0
    total_cash_paid: float = 0
    total_diesel_paid: float = 0
    total_fc: float = 0


def calculate_auto_fields(data: dict) -> dict:
    """Calculate automatic fields based on input data"""
    kg = data.get('kg', 0) or 0
    gbw_cut = data.get('gbw_cut', 0) or 0
    disc_dust_poll = data.get('disc_dust_poll', 0) or 0
    cutting = data.get('cutting', 0) or 0
    
    # Auto calculations
    data['qntl'] = round(kg / 100, 2)  # KG to Quintals
    data['mill_w'] = round(kg - gbw_cut, 2)  # Mill Weight
    data['final_w'] = round(kg - gbw_cut - disc_dust_poll - cutting, 2)  # Final Weight
    
    return data


# Add your routes to the router
@api_router.get("/")
async def root():
    return {"message": "Mill Entry API - Navkar Agro"}


@api_router.post("/entries", response_model=MillEntry)
async def create_entry(input: MillEntryCreate):
    entry_dict = input.model_dump()
    entry_dict = calculate_auto_fields(entry_dict)
    
    entry_obj = MillEntry(**entry_dict)
    doc = entry_obj.model_dump()
    
    await db.mill_entries.insert_one(doc)
    return entry_obj


@api_router.get("/entries", response_model=List[MillEntry])
async def get_entries():
    entries = await db.mill_entries.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
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
async def get_totals():
    pipeline = [
        {
            "$group": {
                "_id": None,
                "total_kg": {"$sum": "$kg"},
                "total_qntl": {"$sum": "$qntl"},
                "total_bag": {"$sum": "$bag"},
                "total_g_deposite": {"$sum": "$g_deposite"},
                "total_gbw_cut": {"$sum": "$gbw_cut"},
                "total_mill_w": {"$sum": "$mill_w"},
                "total_cutting": {"$sum": "$cutting"},
                "total_wt": {"$sum": "$total_wt"},
                "total_g_issued": {"$sum": "$g_issued"},
                "total_disc_dust_poll": {"$sum": "$disc_dust_poll"},
                "total_final_w": {"$sum": "$final_w"},
                "total_cash_paid": {"$sum": "$cash_paid"},
                "total_diesel_paid": {"$sum": "$diesel_paid"},
                "total_fc": {"$sum": "$fc"}
            }
        }
    ]
    
    result = await db.mill_entries.aggregate(pipeline).to_list(1)
    
    if result:
        totals = result[0]
        del totals['_id']
        return TotalsResponse(**totals)
    
    return TotalsResponse()


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
