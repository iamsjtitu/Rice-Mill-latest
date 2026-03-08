from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime, timezone
from database import db
from pydantic import BaseModel, Field, ConfigDict
import uuid

router = APIRouter()

# ============ MODELS ============

class StaffMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    salary_type: str  # "weekly" or "monthly"
    salary_amount: float  # per day for weekly, per month for monthly
    active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AttendanceEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    staff_id: str
    staff_name: str = ""
    date: str
    status: str  # "present", "absent", "half_day", "holiday"
    kms_year: str = ""
    season: str = ""

class StaffAdvance(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    staff_id: str
    staff_name: str = ""
    amount: float
    date: str
    description: str = ""
    kms_year: str = ""
    season: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class StaffPayment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    staff_id: str
    staff_name: str = ""
    salary_type: str = ""
    salary_amount: float = 0
    period_from: str = ""
    period_to: str = ""
    total_days: int = 0
    days_worked: float = 0
    holidays: float = 0
    half_days: float = 0
    absents: int = 0
    gross_salary: float = 0
    advance_balance: float = 0
    advance_deducted: float = 0
    net_payment: float = 0
    date: str = ""
    kms_year: str = ""
    season: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============ STAFF CRUD ============

@router.get("/staff")
async def get_staff(active_only: bool = True):
    query = {"active": True} if active_only else {}
    staff = await db.staff.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return staff

@router.post("/staff")
async def add_staff(s: StaffMember):
    doc = s.model_dump()
    await db.staff.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, data: dict):
    existing = await db.staff.find_one({"id": staff_id})
    if not existing:
        raise HTTPException(404, "Staff not found")
    data.pop("id", None)
    data.pop("_id", None)
    await db.staff.update_one({"id": staff_id}, {"$set": data})
    updated = await db.staff.find_one({"id": staff_id}, {"_id": 0})
    return updated

@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str):
    await db.staff.update_one({"id": staff_id}, {"$set": {"active": False}})
    return {"message": "Staff deactivated"}


# ============ ATTENDANCE ============

@router.get("/staff/attendance")
async def get_attendance(staff_id: Optional[str] = None, date: Optional[str] = None,
                         date_from: Optional[str] = None, date_to: Optional[str] = None,
                         kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if staff_id: query["staff_id"] = staff_id
    if date: query["date"] = date
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if date_from or date_to:
        date_q = {}
        if date_from: date_q["$gte"] = date_from
        if date_to: date_q["$lte"] = date_to
        query["date"] = date_q
    return await db.staff_attendance.find(query, {"_id": 0}).sort("date", -1).to_list(10000)

@router.post("/staff/attendance")
async def mark_attendance(entry: AttendanceEntry):
    # Upsert - one entry per staff per date
    existing = await db.staff_attendance.find_one({"staff_id": entry.staff_id, "date": entry.date})
    doc = entry.model_dump()
    if existing:
        await db.staff_attendance.update_one(
            {"staff_id": entry.staff_id, "date": entry.date},
            {"$set": {"status": doc["status"], "kms_year": doc["kms_year"], "season": doc["season"]}}
        )
    else:
        await db.staff_attendance.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.post("/staff/attendance/bulk")
async def bulk_mark_attendance(data: dict):
    date = data.get("date", "")
    records = data.get("records", [])
    kms_year = data.get("kms_year", "")
    season = data.get("season", "")
    for r in records:
        existing = await db.staff_attendance.find_one({"staff_id": r["staff_id"], "date": date})
        if existing:
            await db.staff_attendance.update_one(
                {"staff_id": r["staff_id"], "date": date},
                {"$set": {"status": r["status"], "kms_year": kms_year, "season": season}}
            )
        else:
            doc = {
                "id": str(uuid.uuid4()), "staff_id": r["staff_id"],
                "staff_name": r.get("staff_name", ""), "date": date,
                "status": r["status"], "kms_year": kms_year, "season": season
            }
            await db.staff_attendance.insert_one(doc)
    return {"message": f"{len(records)} attendance records saved"}


# ============ ADVANCE ============

@router.get("/staff/advance")
async def get_advances(staff_id: Optional[str] = None, kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if staff_id: query["staff_id"] = staff_id
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    return await db.staff_advance.find(query, {"_id": 0}).sort("date", -1).to_list(5000)

@router.post("/staff/advance")
async def add_advance(adv: StaffAdvance):
    doc = adv.model_dump()
    await db.staff_advance.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.delete("/staff/advance/{adv_id}")
async def delete_advance(adv_id: str):
    result = await db.staff_advance.delete_one({"id": adv_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Advance not found")
    return {"message": "Advance deleted"}

@router.get("/staff/advance-balance/{staff_id}")
async def get_advance_balance(staff_id: str, kms_year: Optional[str] = None, season: Optional[str] = None):
    # Total advances given
    q = {"staff_id": staff_id}
    if kms_year: q["kms_year"] = kms_year
    if season: q["season"] = season
    advances = await db.staff_advance.find(q, {"_id": 0}).to_list(5000)
    total_advance = sum(a.get("amount", 0) for a in advances)

    # Total advance deducted from payments
    pq = {"staff_id": staff_id}
    if kms_year: pq["kms_year"] = kms_year
    if season: pq["season"] = season
    payments = await db.staff_payments.find(pq, {"_id": 0}).to_list(5000)
    total_deducted = sum(p.get("advance_deducted", 0) for p in payments)

    return {"total_advance": round(total_advance, 2), "total_deducted": round(total_deducted, 2),
            "balance": round(total_advance - total_deducted, 2)}


# ============ SALARY CALCULATION ============

@router.get("/staff/salary-calculate")
async def calculate_salary(staff_id: str, period_from: str, period_to: str,
                           kms_year: Optional[str] = None, season: Optional[str] = None):
    staff = await db.staff.find_one({"id": staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(404, "Staff not found")

    # Get attendance for period
    att_q = {"staff_id": staff_id, "date": {"$gte": period_from, "$lte": period_to}}
    attendance = await db.staff_attendance.find(att_q, {"_id": 0}).to_list(1000)

    present_days = sum(1 for a in attendance if a.get("status") == "present")
    half_days = sum(1 for a in attendance if a.get("status") == "half_day")
    holidays = sum(1 for a in attendance if a.get("status") == "holiday")
    absents = sum(1 for a in attendance if a.get("status") == "absent")
    days_worked = present_days + (half_days * 0.5) + holidays  # Holiday = paid leave

    # Calculate total days in period
    from datetime import datetime as dt
    d1 = dt.strptime(period_from, "%Y-%m-%d")
    d2 = dt.strptime(period_to, "%Y-%m-%d")
    total_days = (d2 - d1).days + 1

    # Calculate salary
    if staff["salary_type"] == "weekly":
        # Per day rate
        per_day = staff["salary_amount"]
        gross_salary = round(days_worked * per_day, 2)
    else:
        # Monthly: always /30
        per_day = staff["salary_amount"] / 30
        gross_salary = round(days_worked * per_day, 2)

    # Get advance balance
    adv_q = {"staff_id": staff_id}
    if kms_year: adv_q["kms_year"] = kms_year
    if season: adv_q["season"] = season
    advances = await db.staff_advance.find(adv_q, {"_id": 0}).to_list(5000)
    total_advance = sum(a.get("amount", 0) for a in advances)
    pq = {"staff_id": staff_id}
    if kms_year: pq["kms_year"] = kms_year
    if season: pq["season"] = season
    payments = await db.staff_payments.find(pq, {"_id": 0}).to_list(5000)
    total_deducted = sum(p.get("advance_deducted", 0) for p in payments)
    advance_balance = round(total_advance - total_deducted, 2)

    return {
        "staff": staff,
        "period_from": period_from, "period_to": period_to,
        "total_days": total_days,
        "present_days": present_days, "half_days": half_days,
        "holidays": holidays, "absents": absents,
        "days_worked": days_worked,
        "per_day_rate": round(per_day, 2),
        "gross_salary": gross_salary,
        "advance_balance": advance_balance,
        "attendance_details": sorted(attendance, key=lambda x: x.get("date", ""))
    }


# ============ PAYMENT (SETTLE SALARY) ============

@router.get("/staff/payments")
async def get_payments(staff_id: Optional[str] = None, kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if staff_id: query["staff_id"] = staff_id
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    return await db.staff_payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

@router.post("/staff/payments")
async def settle_salary(pay: StaffPayment):
    doc = pay.model_dump()
    doc["net_payment"] = round(doc["gross_salary"] - doc["advance_deducted"], 2)
    await db.staff_payments.insert_one(doc)
    doc.pop("_id", None)

    # Auto-create Cash Book Nikasi entry
    if doc["net_payment"] > 0:
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": doc["date"],
            "account": "cash",
            "txn_type": "nikasi",
            "category": "Staff Salary",
            "description": f"Salary: {doc['staff_name']} ({doc['period_from']} to {doc['period_to']})",
            "amount": round(doc["net_payment"], 2),
            "reference": f"staff_payment:{doc['id']}",
            "kms_year": doc.get("kms_year", ""),
            "season": doc.get("season", ""),
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cb_entry)
        cb_entry.pop("_id", None)
        doc["cash_book_entry"] = cb_entry

    return doc

@router.delete("/staff/payments/{payment_id}")
async def delete_payment(payment_id: str):
    payment = await db.staff_payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Payment not found")
    # Delete cash book entry too
    await db.cash_transactions.delete_one({"reference": f"staff_payment:{payment_id}"})
    await db.staff_payments.delete_one({"id": payment_id})
    return {"message": "Payment deleted and cash book entry removed"}
