from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


# ===== Auth Models =====
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
    display_name: str = ""
    permissions: dict = {}

class PasswordChangeRequest(BaseModel):
    username: str
    current_password: str
    new_password: str


# ===== Branding =====
class BrandingSettings(BaseModel):
    company_name: str = "NAVKAR AGRO"
    tagline: str = "JOLKO, KESINGA - Mill Entry System"
    updated_by: str = ""
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class BrandingUpdateRequest(BaseModel):
    company_name: str
    tagline: str


# ===== Mill Entry Models =====
class MillEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    kms_year: str = ""
    season: str = ""
    truck_no: str = ""
    rst_no: str = ""
    tp_no: str = ""
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
    rst_no: str = ""
    tp_no: str = ""
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
    rst_no: Optional[str] = None
    tp_no: Optional[str] = None
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


# ===== Totals =====
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


# ===== Mandi Target Models =====
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


# ===== Milling Entry Models =====
class MillingEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    rice_type: str = "parboiled"
    paddy_input_qntl: float = 0
    rice_percent: float = 0
    bran_percent: float = 0
    kunda_percent: float = 0
    broken_percent: float = 0
    kanki_percent: float = 0
    husk_percent: float = 0
    rice_qntl: float = 0
    bran_qntl: float = 0
    kunda_qntl: float = 0
    broken_qntl: float = 0
    kanki_qntl: float = 0
    husk_qntl: float = 0
    frk_used_qntl: float = 0
    cmr_delivery_qntl: float = 0
    outturn_ratio: float = 0
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
    bran_percent: float = 0
    kunda_percent: float = 0
    broken_percent: float = 0
    kanki_percent: float = 0
    frk_used_qntl: float = 0
    kms_year: str = ""
    season: str = ""
    note: str = ""


# ===== FRK Purchase =====
class FrkPurchase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    party_name: str = ""
    quantity_qntl: float = 0
    rate_per_qntl: float = 0
    total_amount: float = 0
    note: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class FrkPurchaseCreate(BaseModel):
    date: str
    party_name: str = ""
    quantity_qntl: float = 0
    rate_per_qntl: float = 0
    note: str = ""
    kms_year: str = ""
    season: str = ""


# ===== By-Product Sales =====
class ByProductSale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    product: str
    quantity_qntl: float = 0
    rate_per_qntl: float = 0
    total_amount: float = 0
    buyer_name: str = ""
    note: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ByProductSaleCreate(BaseModel):
    date: str
    product: str
    quantity_qntl: float = 0
    rate_per_qntl: float = 0
    buyer_name: str = ""
    note: str = ""
    kms_year: str = ""
    season: str = ""


# ===== Payment Models =====
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
    source: str = "CMR"

class AgentPaymentStatus(BaseModel):
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
    round_off: float = 0


# ===== Utility Functions =====
def round_amount(val):
    """Round amount: >0.50 rounds up, <=0.50 rounds down"""
    n = float(val or 0)
    decimal = n - int(n) if n >= 0 else n - int(n)
    if abs(decimal) > 0.50:
        return int(n) + (1 if n >= 0 else -1)
    return int(n)


def fmt_date(d):
    """Convert YYYY-MM-DD to DD-MM-YYYY"""
    if not d:
        return ''
    p = str(d)[:10].split('-')
    return f"{p[2]}-{p[1]}-{p[0]}" if len(p) == 3 else str(d)


def calculate_auto_fields(data: dict) -> dict:
    kg = data.get('kg', 0) or 0
    gbw_cut = data.get('gbw_cut', 0) or 0
    disc_dust_poll = data.get('disc_dust_poll', 0) or 0
    plastic_bag = data.get('plastic_bag', 0) or 0
    cutting_percent = data.get('cutting_percent', 0) or 0
    moisture = data.get('moisture', 0) or 0
    p_pkt_cut = round(plastic_bag * 0.5, 2)
    data['p_pkt_cut'] = p_pkt_cut
    mill_w_kg = kg - gbw_cut
    mill_w_qntl = mill_w_kg / 100
    moisture_cut_percent = max(0, moisture - 17)
    moisture_cut_qntl = round((mill_w_qntl * moisture_cut_percent) / 100, 2)
    moisture_cut_kg = round(moisture_cut_qntl * 100, 2)
    data['moisture_cut'] = moisture_cut_kg
    data['moisture_cut_qntl'] = moisture_cut_qntl
    data['moisture_cut_percent'] = moisture_cut_percent
    cutting_qntl = round((mill_w_qntl * cutting_percent) / 100, 2)
    cutting_kg = round(cutting_qntl * 100, 2)
    data['cutting'] = cutting_kg
    data['cutting_qntl'] = cutting_qntl
    p_pkt_cut_qntl = p_pkt_cut / 100
    disc_dust_poll_qntl = disc_dust_poll / 100
    data['qntl'] = round(kg / 100, 2)
    data['mill_w'] = mill_w_kg
    final_w_qntl = mill_w_qntl - p_pkt_cut_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl
    data['final_w'] = round(final_w_qntl * 100, 2)
    return data

def can_edit_entry(entry: dict, username: str, role: str) -> tuple:
    if role == "admin":
        return True, "Admin access"
    if entry.get('created_by') != username:
        return False, "Aap sirf apni entry edit kar sakte hain"
    created_at = entry.get('created_at', '')
    if created_at:
        try:
            from datetime import timedelta
            created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            if (now - created_time) > timedelta(minutes=5):
                return False, "5 minute se zyada ho gaye, ab edit nahi ho sakta"
        except:
            pass
    return True, "Edit allowed"
