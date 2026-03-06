"""
Pydantic models/schemas for Mill Entry System
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


# ============ USER MODELS ============

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


# ============ MILL ENTRY MODELS ============

class MillEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    kms_year: str = ""
    season: str = ""
    truck_no: str = ""
    agent_name: str = ""
    mandi_name: str = ""
    kg: float = 0
    qntl: float = 0
    bag: int = 0
    g_deposite: float = 0
    gbw_cut: float = 0
    mill_w: float = 0
    plastic_bag: int = 0
    p_pkt_cut: float = 0
    moisture: float = 0
    moisture_cut: float = 0
    moisture_cut_percent: float = 0
    cutting_percent: float = 0
    cutting: float = 0
    disc_dust_poll: float = 0
    final_w: float = 0
    g_issued: float = 0
    cash_paid: float = 0
    diesel_paid: float = 0
    remark: str = ""
    created_by: str = ""
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


# ============ MANDI TARGET MODELS ============

class MandiTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mandi_name: str
    target_qntl: float
    cutting_percent: float
    expected_total: float = 0
    base_rate: float = 10.0
    cutting_rate: float = 5.0
    kms_year: str
    season: str
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


class MandiTargetSummary(BaseModel):
    id: str
    mandi_name: str
    target_qntl: float
    cutting_percent: float
    expected_total: float
    achieved_qntl: float
    pending_qntl: float
    progress_percent: float
    base_rate: float
    cutting_rate: float
    target_amount: float
    cutting_qntl: float
    cutting_amount: float
    total_agent_amount: float
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
    gross_amount: float
    deductions: float
    net_amount: float
    paid_amount: float
    balance_amount: float
    status: str
    kms_year: str
    season: str
    agent_name: str
    mandi_name: str


class AgentPaymentStatus(BaseModel):
    """Agent payment based on Mandi Target"""
    mandi_name: str
    agent_name: str
    target_qntl: float
    cutting_percent: float
    cutting_qntl: float
    base_rate: float
    cutting_rate: float
    target_amount: float
    cutting_amount: float
    total_amount: float
    achieved_qntl: float
    is_target_complete: bool
    paid_amount: float
    balance_amount: float
    status: str
    kms_year: str
    season: str


class SetRateRequest(BaseModel):
    rate_per_qntl: float


class MakePaymentRequest(BaseModel):
    amount: float
    note: str = ""
