from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
from typing import Optional
from database import db
import uuid

router = APIRouter()

def fmt_date(d):
    if not d: return ""
    try:
        if "T" in str(d): d = str(d).split("T")[0]
        parts = str(d).split("-")
        if len(parts) == 3: return f"{parts[2]}/{parts[1]}/{parts[0]}"
    except: pass
    return str(d)


async def _get_default_pump():
    pump = await db.diesel_accounts.find_one({}, {"_id": 0, "pump_name": 1}, sort=[("_id", -1)])
    return pump.get("pump_name", "Diesel Pump") if pump else "Diesel Pump"


async def _create_bp_ledger_entries(d, doc_id, username):
    """Create all accounting entries for a by-product sale"""
    party = (d.get('party_name') or '').strip()
    cash = d.get('cash_paid', 0) or 0
    diesel = d.get('diesel_paid', 0) or 0
    advance = d.get('advance', 0) or 0
    total = d.get('total', 0) or 0
    vehicle = (d.get('vehicle_no') or '').strip()
    product = d.get('product', 'By-Product')
    vno = d.get('voucher_no', '') or doc_id[:8]
    now_iso = datetime.now(timezone.utc).isoformat()
    base = {"kms_year": d.get('kms_year', ''), "season": d.get('season', ''), "created_by": username, "created_at": now_iso, "updated_at": now_iso}
    entries = []

    # 1. Party Ledger NIKASI: sale amount (humne maal diya - party owes us)
    # Split-billing: 2 alag ledger entries — `{party} (PKA)` + `{party} (KCA)`
    # Non-split: single ledger under `{party}`
    is_split = bool(d.get("split_billing"))
    if party and total > 0:
        if is_split:
            billed_amt = float(d.get("billed_amount", 0) or 0)
            tax_amt = float(d.get("tax_amount", 0) or 0)
            kaccha_amt = float(d.get("kaccha_amount", 0) or 0)
            pakka_total = round(billed_amt + tax_amt, 2)
            if pakka_total > 0:
                entries.append({
                    "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
                    "amount": pakka_total, "category": f"{party} (PKA)", "party_type": "BP Sale",
                    "description": f"{product} Sale #{vno} - Pakka (GST Bill)",
                    "reference": f"bp_sale_pka:{doc_id}", **base
                })
            if kaccha_amt > 0:
                entries.append({
                    "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
                    "amount": round(kaccha_amt, 2), "category": f"{party} (KCA)", "party_type": "BP Sale",
                    "description": f"{product} Sale #{vno} - Kaccha (Slip)",
                    "reference": f"bp_sale_ka:{doc_id}", **base
                })
        else:
            entries.append({
                "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
                "amount": total, "category": party, "party_type": "BP Sale",
                "description": f"{product} Sale #{vno}",
                "reference": f"bp_sale:{doc_id}", **base
            })

    # 2. Advance from party: Party Ledger NIKASI (party ka baki kam hua) + Cash JAMA
    # Split-billing me advance hamesha Kaccha sub-ledger me jata hai (cash advance)
    if advance > 0 and party:
        adv_party = f"{party} (KCA)" if is_split else party
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": advance, "category": adv_party, "party_type": "BP Sale",
            "description": f"Advance received - {product} #{vno}",
            "reference": f"bp_sale_adv:{doc_id}", **base
        })
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "cash", "txn_type": "jama",
            "amount": advance, "category": adv_party, "party_type": "BP Sale",
            "description": f"Advance received - {product} #{vno}",
            "reference": f"bp_sale_adv_cash:{doc_id}", **base
        })

    # 3. Cash paid to truck → Cash NIKASI
    if cash > 0:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "cash", "txn_type": "nikasi",
            "amount": cash, "category": vehicle or party, "party_type": "Truck" if vehicle else "BP Sale",
            "description": f"Truck cash - {product} #{vno}",
            "reference": f"bp_sale_cash:{doc_id}", **base
        })

    # 4. Diesel → Diesel Pump Ledger JAMA (humne pump se kharida) + diesel_accounts
    if diesel > 0:
        pump_name = await _get_default_pump()
        pump_doc = await db.diesel_accounts.find_one({"pump_name": pump_name}, {"_id": 0, "pump_id": 1})
        pump_id = pump_doc.get("pump_id", "") if pump_doc else ""
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "jama",
            "amount": diesel, "category": pump_name, "party_type": "Diesel",
            "description": f"Diesel for truck - {product} #{vno} - {party}",
            "reference": f"bp_sale_diesel:{doc_id}", **base
        })
        diesel_entry = {
            "id": str(uuid.uuid4()), "date": d.get('date', ''),
            "pump_id": pump_id, "pump_name": pump_name,
            "truck_no": vehicle, "agent_name": party,
            "amount": diesel, "txn_type": "debit",
            "description": f"Diesel for {product} #{vno} - {party}",
            "reference": f"bp_sale_diesel:{doc_id}", **base
        }
        await db.diesel_accounts.insert_one({**diesel_entry})

    # 5. Truck cash+diesel → Truck Ledger NIKASI
    if cash > 0 and vehicle:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": cash, "category": vehicle, "party_type": "Truck",
            "description": f"Truck cash deduction - {product} #{vno}",
            "reference": f"bp_truck_cash:{doc_id}", **base
        })
    if diesel > 0 and vehicle:
        entries.append({
            "id": str(uuid.uuid4()), "date": d.get('date', ''), "account": "ledger", "txn_type": "nikasi",
            "amount": diesel, "category": vehicle, "party_type": "Truck",
            "description": f"Truck diesel deduction - {product} #{vno}",
            "reference": f"bp_truck_diesel:{doc_id}", **base
        })

    # Truck payments entry
    truck_total = cash + diesel
    if truck_total > 0 and vehicle:
        truck_entry = {
            "entry_id": doc_id, "truck_no": vehicle, "date": d.get('date', ''),
            "cash_taken": cash, "diesel_taken": diesel,
            "gross_amount": 0, "deductions": truck_total,
            "net_amount": 0, "paid_amount": 0,
            "balance_amount": 0, "status": "pending",
            "source": "BP Sale", "description": f"{product} #{vno} - {party}",
            "reference": f"bp_sale_truck:{doc_id}", **base
        }
        await db.truck_payments.insert_one({**truck_entry})

    for entry in entries:
        await db.cash_transactions.insert_one({**entry})

    # Local party accounts: debit (party owes us)
    # Split-billing: 2 separate sub-ledgers — `{party} (PKA)` + `{party} (KCA)`
    # Non-split: single ledger under `{party}`
    if party and total > 0:
        if is_split:
            billed_amt = float(d.get("billed_amount", 0) or 0)
            tax_amt = float(d.get("tax_amount", 0) or 0)
            kaccha_amt = float(d.get("kaccha_amount", 0) or 0)
            pakka_total = round(billed_amt + tax_amt, 2)
            if pakka_total > 0:
                await db.local_party_accounts.insert_one({
                    "id": str(uuid.uuid4()), "date": d.get('date', ''),
                    "party_name": f"{party} (PKA)", "txn_type": "debit",
                    "amount": pakka_total,
                    "description": f"{product} Sale #{vno} - Pakka (GST Bill)",
                    "source_type": "bp_sale_pka", "reference": f"bp_sale_pka:{doc_id}",
                    "kms_year": d.get('kms_year', ''), "season": d.get('season', ''),
                    "created_by": username, "created_at": now_iso
                })
            if kaccha_amt > 0:
                await db.local_party_accounts.insert_one({
                    "id": str(uuid.uuid4()), "date": d.get('date', ''),
                    "party_name": f"{party} (KCA)", "txn_type": "debit",
                    "amount": round(kaccha_amt, 2),
                    "description": f"{product} Sale #{vno} - Kaccha (Slip)",
                    "source_type": "bp_sale_ka", "reference": f"bp_sale_ka:{doc_id}",
                    "kms_year": d.get('kms_year', ''), "season": d.get('season', ''),
                    "created_by": username, "created_at": now_iso
                })
        else:
            await db.local_party_accounts.insert_one({
                "id": str(uuid.uuid4()), "date": d.get('date', ''),
                "party_name": party, "txn_type": "debit",
                "amount": total, "description": f"{product} Sale #{vno}",
                "source_type": "bp_sale", "reference": f"bp_sale:{doc_id}",
                "kms_year": d.get('kms_year', ''), "season": d.get('season', ''),
                "created_by": username, "created_at": now_iso
            })
    if advance > 0 and party:
        # Advance always goes to Kaccha sub-ledger when split (cash advance), else to main
        adv_party = f"{party} (KCA)" if is_split else party
        lp_adv = {
            "id": str(uuid.uuid4()), "date": d.get('date', ''),
            "party_name": adv_party, "txn_type": "payment",
            "amount": advance, "description": f"Advance received - {product} #{vno}",
            "source_type": "bp_sale_advance", "reference": f"bp_sale_adv:{doc_id}",
            "kms_year": d.get('kms_year', ''), "season": d.get('season', ''),
            "created_by": username, "created_at": now_iso
        }
        await db.local_party_accounts.insert_one({**lp_adv})


async def _delete_bp_ledger_entries(doc_id):
    """Remove all accounting entries linked to a bp sale"""
    await db.cash_transactions.delete_many({"reference": {"$regex": f"bp_sale.*:{doc_id}"}})
    await db.cash_transactions.delete_many({"reference": {"$regex": f"bp_truck.*:{doc_id}"}})
    await db.truck_payments.delete_many({"reference": {"$regex": f"bp_sale.*:{doc_id}"}})
    await db.diesel_accounts.delete_many({"reference": {"$regex": f"bp_sale.*:{doc_id}"}})
    await db.local_party_accounts.delete_many({"reference": {"$regex": f"bp_sale.*:{doc_id}"}})
    await db.local_party_accounts.delete_many({"reference": {"$regex": f"bp_sale_adv:{doc_id}"}})


@router.get("/bp-sale-register")
async def get_bp_sales(product: str = "", kms_year: str = "", season: str = ""):
    query = {}
    if product: query["product"] = product
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    sales = await db.bp_sale_register.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return sales


def _compute_amounts_and_tax(data: dict) -> None:
    """Mutates data with computed fields. Matches desktop/local-server split-billing logic exactly.
    Note: `sauda_amount` is informational only — never used in any calculation.
    """
    rate = float(data.get("rate_per_qtl", 0) or 0)
    raw_kaccha_rate = data.get("kaccha_rate_per_qtl")
    kaccha_rate = (float(raw_kaccha_rate) if raw_kaccha_rate not in (None, "", 0, "0") else rate)
    is_split = bool(data.get("split_billing"))

    if is_split:
        billed_kg = float(data.get("billed_weight_kg", 0) or 0)
        kaccha_kg = float(data.get("kaccha_weight_kg", 0) or 0)
        billed_qtl = round(billed_kg / 100, 4)
        kaccha_qtl = round(kaccha_kg / 100, 4)
        billed_amt = round(billed_qtl * rate, 2)
        kaccha_amt = round(kaccha_qtl * kaccha_rate, 2)
        data["net_weight_kg"] = round(billed_kg + kaccha_kg, 3)  # sum for physical dispatch
        data["net_weight_qtl"] = round(billed_qtl + kaccha_qtl, 4)
        data["billed_weight_qtl"] = billed_qtl
        data["kaccha_weight_qtl"] = kaccha_qtl
        data["billed_amount"] = billed_amt
        data["kaccha_amount"] = kaccha_amt
        data["kaccha_rate_per_qtl"] = kaccha_rate
        data["amount"] = billed_amt  # GST-taxable portion (kept under same key for register compat)
        gst_pct = float(data.get("gst_percent") or 0)
        tax_amt = round(billed_amt * gst_pct / 100, 2) if gst_pct else 0
        data["tax_amount"] = tax_amt
        data["total"] = round(billed_amt + tax_amt + kaccha_amt, 2)
    else:
        nw = float(data.get("net_weight_kg", 0) or 0)
        nw_qtl = round(nw / 100, 4)
        amount = round(nw_qtl * rate, 2)
        data["net_weight_qtl"] = nw_qtl
        data["amount"] = amount
        # Clear split fields if toggled off (or never on)
        data["billed_weight_kg"] = 0
        data["billed_weight_qtl"] = 0
        data["billed_amount"] = 0
        data["kaccha_weight_kg"] = 0
        data["kaccha_weight_qtl"] = 0
        data["kaccha_amount"] = 0
        data["kaccha_rate_per_qtl"] = 0
        gst_pct = float(data.get("gst_percent") or 0)
        tax_amt = round(amount * gst_pct / 100, 2) if gst_pct else 0
        data["tax_amount"] = tax_amt
        data["total"] = round(amount + tax_amt, 2)


@router.post("/bp-sale-register")
async def create_bp_sale(data: dict, username: str = "", role: str = ""):
    data["id"] = str(uuid.uuid4())[:12]
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_at"] = data["created_at"]
    data["created_by"] = username

    # Auto-generate voucher_no if empty (format: S-001, S-002, ...).
    # User-entered voucher_no preserved as-is.
    if not (data.get("voucher_no") or "").strip():
        import re
        max_n = 0
        cursor = db.bp_sale_register.find({"voucher_no": {"$regex": r"^S-\d+$"}}, {"_id": 0, "voucher_no": 1})
        async for doc in cursor:
            m = re.match(r"^S-(\d+)$", doc.get("voucher_no") or "")
            if m:
                n = int(m.group(1))
                if n > max_n:
                    max_n = n
        data["voucher_no"] = f"S-{max_n + 1:03d}"

    _compute_amounts_and_tax(data)

    cash = float(data.get("cash_paid", 0) or 0)
    diesel = float(data.get("diesel_paid", 0) or 0)
    advance = float(data.get("advance", 0) or 0)
    data["cash_paid"] = cash
    data["diesel_paid"] = diesel
    data["advance"] = advance
    data["balance"] = round(data["total"] - advance, 2)

    await db.bp_sale_register.insert_one({**data})
    data.pop("_id", None)
    await _create_bp_ledger_entries(data, data["id"], username)
    return data


@router.put("/bp-sale-register/{sale_id}")
async def update_bp_sale(sale_id: str, data: dict, username: str = "", role: str = ""):
    from services.edit_lock import check_edit_lock
    existing = await db.bp_sale_register.find_one({"id": sale_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Sale not found")
    existing_clean = {k: v for k, v in existing.items() if k != "_id"}
    can_edit, message = await check_edit_lock(existing_clean, username, role)
    if not can_edit:
        raise HTTPException(status_code=403, detail=message)

    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = username

    _compute_amounts_and_tax(data)

    cash = float(data.get("cash_paid", 0) or 0)
    diesel = float(data.get("diesel_paid", 0) or 0)
    advance = float(data.get("advance", 0) or 0)
    data["cash_paid"] = cash
    data["diesel_paid"] = diesel
    data["advance"] = advance
    data["balance"] = round(data["total"] - advance, 2)

    data.pop("id", None)
    data.pop("_id", None)
    await db.bp_sale_register.update_one({"id": sale_id}, {"$set": data})
    # Re-create accounting entries
    await _delete_bp_ledger_entries(sale_id)
    data["id"] = sale_id
    await _create_bp_ledger_entries(data, sale_id, username)
    return {"success": True}


@router.delete("/bp-sale-register/{sale_id}")
async def delete_bp_sale(sale_id: str, username: str = "", role: str = ""):
    from services.edit_lock import check_edit_lock
    existing = await db.bp_sale_register.find_one({"id": sale_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Sale not found")
    can_edit, message = await check_edit_lock(existing, username, role)
    if not can_edit:
        raise HTTPException(status_code=403, detail=message)
    await db.bp_sale_register.delete_one({"id": sale_id})
    await _delete_bp_ledger_entries(sale_id)
    return {"success": True}


@router.get("/bp-sale-register/suggestions/bill-from")
async def get_bill_from_suggestions():
    pipeline = [{"$group": {"_id": "$bill_from"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/next-voucher-no")
async def next_bp_voucher_no():
    """Generate next sequential voucher number in `S-001` format.
    Scans all existing BP sale voucher_no values matching `^S-\\d+$`,
    takes the max numeric suffix, returns MAX+1 zero-padded to 3 digits.
    Non-S-prefixed custom voucher numbers are preserved and ignored.
    """
    import re
    cursor = db.bp_sale_register.find({"voucher_no": {"$regex": r"^S-\d+$"}}, {"_id": 0, "voucher_no": 1})
    max_n = 0
    async for doc in cursor:
        m = re.match(r"^S-(\d+)$", doc.get("voucher_no") or "")
        if m:
            n = int(m.group(1))
            if n > max_n:
                max_n = n
    return {"voucher_no": f"S-{max_n + 1:03d}"}


@router.get("/bp-sale-register/suggestions/party-name")
async def get_party_suggestions():
    pipeline = [{"$group": {"_id": "$party_name"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/suggestions/destination")
async def get_destination_suggestions():
    pipeline = [{"$group": {"_id": "$destination"}}, {"$sort": {"_id": 1}}]
    results = await db.bp_sale_register.aggregate(pipeline).to_list(500)
    return [r["_id"] for r in results if r["_id"]]


@router.get("/bp-sale-register/export/excel")
async def export_bp_sales_excel(product: str = "", kms_year: str = "", season: str = "",
    date_from: str = "", date_to: str = "", billing_date_from: str = "", billing_date_to: str = "",
    rst_no: str = "", vehicle_no: str = "", bill_from: str = "", party_name: str = "", destination: str = ""):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter
    from fastapi.responses import Response
    from utils.export_helpers import COLORS

    query = {}
    if product: query["product"] = product
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if rst_no: query["rst_no"] = {"$regex": rst_no, "$options": "i"}
    if vehicle_no: query["vehicle_no"] = {"$regex": vehicle_no, "$options": "i"}
    if bill_from: query["bill_from"] = {"$regex": bill_from, "$options": "i"}
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if destination: query["destination"] = {"$regex": destination, "$options": "i"}
    if date_from or date_to:
        query["date"] = {}
        if date_from: query["date"]["$gte"] = date_from
        if date_to: query["date"]["$lte"] = date_to
    if billing_date_from or billing_date_to:
        query["billing_date"] = {}
        if billing_date_from: query["billing_date"]["$gte"] = billing_date_from
        if billing_date_to: query["billing_date"]["$lte"] = billing_date_to
    sales = await db.bp_sale_register.find(query, {"_id": 0}).sort("date", 1).to_list(10000)

    # Fetch oil premium data for Rice Bran
    oil_map = {}
    if product == "Rice Bran":
        op_query = {}
        if kms_year: op_query["kms_year"] = kms_year
        if season: op_query["season"] = season
        op_items = await db.oil_premium.find(op_query, {"_id": 0}).to_list(10000)
        for op in op_items:
            key = op.get("voucher_no") or op.get("rst_no") or ""
            if key: oil_map[key] = op
    has_oil = bool(oil_map) and any(oil_map.get(s.get('voucher_no') or '') or oil_map.get(s.get('rst_no') or '') for s in sales)

    # Branding
    branding = await db.branding.find_one({}, {"_id": 0}) or {}
    company = branding.get("company_name", "Rice Mill")
    address = branding.get("address", "")
    phone = branding.get("phone", "")

    wb = Workbook(); ws = wb.active
    ws.title = f"{product or 'By-Product'} Sales"

    thin = Side(style='thin', color='000000')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    alt_fill = PatternFill(start_color="D6E4F0", end_color="D6E4F0", fill_type="solid")
    total_fill = PatternFill(start_color="2E75B6", end_color="2E75B6", fill_type="solid")

    title = f"{product or 'By-Product'} Sale Register"
    if kms_year: title += f" - FY {kms_year}"
    if season: title += f" ({season})"

    # Detect which optional columns have any data across ALL sales
    has_bill_no = any(s.get('bill_number') for s in sales)
    has_billing_date = any(s.get('billing_date') for s in sales)
    has_rst = any(s.get('rst_no') for s in sales)
    has_vehicle = any(s.get('vehicle_no') for s in sales)
    has_bill_from = any(s.get('bill_from') for s in sales)
    has_dest = any(s.get('destination') for s in sales)
    has_bags = any(s.get('bags', 0) for s in sales)
    has_tax = any(s.get('tax_amount', 0) for s in sales)
    has_cash = any(s.get('cash_paid', 0) for s in sales)
    has_diesel = any(s.get('diesel_paid', 0) for s in sales)
    has_adv = any(s.get('advance', 0) for s in sales)
    has_remark = any(s.get('remark') for s in sales)

    # Build dynamic headers and column config
    cols = [('V.No', 8, 'voucher_no')]
    cols.append(('Date', 10, 'date'))
    if has_bill_no: cols.append(('Bill No', 10, 'bill_number'))
    if has_billing_date: cols.append(('Billing Date', 10, 'billing_date'))
    if has_rst: cols.append(('RST No', 8, 'rst_no'))
    if has_vehicle: cols.append(('Vehicle No', 12, 'vehicle_no'))
    if has_bill_from: cols.append(('Bill From', 14, 'bill_from'))
    cols.append(('Party Name', 16, 'party_name'))
    if has_dest: cols.append(('Destination', 14, 'destination'))
    cols.append(('N/W (Kg)', 10, 'net_weight_kg'))
    cols.append(('N/W (Qtl)', 9, 'net_weight_qtl'))
    if has_bags: cols.append(('Bags', 7, 'bags'))
    cols.append(('Rate/Qtl', 9, 'rate_per_qtl'))
    cols.append(('Amount', 12, 'amount'))
    if has_tax: cols.append(('Tax', 9, 'tax_amount'))
    cols.append(('Total', 12, 'total'))
    if has_cash: cols.append(('Cash', 10, 'cash_paid'))
    if has_diesel: cols.append(('Diesel', 10, 'diesel_paid'))
    if has_adv: cols.append(('Advance', 10, 'advance'))
    cols.append(('Balance', 12, 'balance'))
    if has_oil:
        cols.append(('Oil%', 8, 'oil_pct'))
        cols.append(('Diff%', 8, 'oil_diff'))
        cols.append(('Premium', 12, 'oil_premium'))
    if has_remark: cols.append(('Remark', 16, 'remark'))

    headers = [c[0] for c in cols]
    widths = [c[1] for c in cols]
    keys = [c[2] for c in cols]
    ncols = len(headers)

    row = 5
    # Merge header rows to match ncols
    last_col_letter = get_column_letter(ncols)
    ws.merge_cells(f'A1:{last_col_letter}1')
    c1 = ws.cell(row=1, column=1, value=company.upper())
    c1.font = Font(bold=True, size=14, color="1F4E79"); c1.alignment = Alignment(horizontal='center')
    if address:
        ws.merge_cells(f'A2:{last_col_letter}2')
        c2 = ws.cell(row=2, column=1, value=f"{address}  |  {phone}")
        c2.font = Font(size=9, color="666666"); c2.alignment = Alignment(horizontal='center')
    ws.merge_cells(f'A3:{last_col_letter}3')
    c3 = ws.cell(row=3, column=1, value=title)
    c3.font = Font(bold=True, size=12, color="FFFFFF")
    c3.fill = PatternFill(start_color="2E75B6", end_color="2E75B6", fill_type="solid")
    c3.alignment = Alignment(horizontal='center')

    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col_idx, value=h)
        cell.font = Font(bold=True, size=9, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        cell.border = border

    # Data rows
    t_nw = t_bags = t_amount = t_tax = t_total = t_cash = t_diesel = t_adv = t_bal = t_oil_premium = 0
    for idx, s in enumerate(sales):
        r = row + 1 + idx
        fill = alt_fill if idx % 2 == 0 else None
        t_nw += s.get('net_weight_kg', 0); t_bags += s.get('bags', 0)
        t_amount += s.get('amount', 0); t_tax += s.get('tax_amount', 0); t_total += s.get('total', 0)
        t_cash += s.get('cash_paid', 0); t_diesel += s.get('diesel_paid', 0)
        t_adv += s.get('advance', 0); t_bal += s.get('balance', 0)
        op = oil_map.get(s.get('voucher_no') or '') or oil_map.get(s.get('rst_no') or '')
        if op: t_oil_premium += op.get('premium_amount', 0)
        for col_idx, key in enumerate(keys, 1):
            if key == 'voucher_no': val = s.get('voucher_no', '') or ''
            elif key == 'date': val = fmt_date(s.get('date', ''))
            elif key == 'billing_date': val = fmt_date(s.get('billing_date', ''))
            elif key == 'net_weight_qtl': val = round(s.get('net_weight_qtl', 0), 2)
            elif key == 'oil_pct': val = op.get('actual_oil_pct', '') if op else ''
            elif key == 'oil_diff': val = round(op.get('difference_pct', 0), 2) if op else ''
            elif key == 'oil_premium': val = round(op.get('premium_amount', 0), 2) if op else ''
            else: val = s.get(key, 0) if key in ('net_weight_kg','bags','rate_per_qtl','amount','tax_amount','total','cash_paid','diesel_paid','advance','balance') else s.get(key, '')
            cell = ws.cell(row=r, column=col_idx, value=val)
            cell.font = Font(size=9)
            cell.border = border
            if fill: cell.fill = fill
            if key in ('net_weight_kg','net_weight_qtl','bags','rate_per_qtl','amount','tax_amount','total','cash_paid','diesel_paid','advance','balance','oil_pct','oil_diff','oil_premium'):
                cell.alignment = Alignment(horizontal='right')
            if key in ('amount','tax_amount','total','cash_paid','diesel_paid','advance','balance','oil_premium'):
                cell.number_format = '#,##0.00'
            if key == 'oil_premium' and op and (op.get('premium_amount', 0) or 0) < 0:
                cell.font = Font(size=9, color="FF0000")

    # Total row
    tr = row + 1 + len(sales)
    for col_idx in range(1, ncols + 1):
        cell = ws.cell(row=tr, column=col_idx)
        cell.border = border; cell.fill = total_fill; cell.font = Font(bold=True, size=9, color="FFFFFF")
    # Set total values in correct columns
    for col_idx, key in enumerate(keys, 1):
        if key == 'date': ws.cell(row=tr, column=col_idx, value="TOTAL")
        elif key == 'net_weight_kg': ws.cell(row=tr, column=col_idx, value=round(t_nw, 2)).alignment = Alignment(horizontal='right')
        elif key == 'net_weight_qtl': ws.cell(row=tr, column=col_idx, value=round(t_nw/100, 2)).alignment = Alignment(horizontal='right')
        elif key == 'bags': ws.cell(row=tr, column=col_idx, value=t_bags).alignment = Alignment(horizontal='right')
        elif key == 'amount': ws.cell(row=tr, column=col_idx, value=round(t_amount, 2)).alignment = Alignment(horizontal='right')
        elif key == 'tax_amount': ws.cell(row=tr, column=col_idx, value=round(t_tax, 2)).alignment = Alignment(horizontal='right')
        elif key == 'total': ws.cell(row=tr, column=col_idx, value=round(t_total, 2)).alignment = Alignment(horizontal='right')
        elif key == 'cash_paid': ws.cell(row=tr, column=col_idx, value=round(t_cash, 2)).alignment = Alignment(horizontal='right')
        elif key == 'diesel_paid': ws.cell(row=tr, column=col_idx, value=round(t_diesel, 2)).alignment = Alignment(horizontal='right')
        elif key == 'advance': ws.cell(row=tr, column=col_idx, value=round(t_adv, 2)).alignment = Alignment(horizontal='right')
        elif key == 'balance': ws.cell(row=tr, column=col_idx, value=round(t_bal, 2)).alignment = Alignment(horizontal='right')
        elif key == 'oil_premium':
            c = ws.cell(row=tr, column=col_idx, value=round(t_oil_premium, 2))
            c.alignment = Alignment(horizontal='right')
            c.number_format = '#,##0.00'

    # Column widths
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    # 🎯 v104.44.9 — Apply consolidated polish (BP sale register)
    from utils.export_helpers import apply_consolidated_excel_polish
    apply_consolidated_excel_polish(ws)

    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    fn = f"{(product or 'byproduct').lower().replace(' ','_')}_sale_register_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return Response(content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fn}"})


@router.get("/bp-sale-register/export/pdf")
async def export_bp_sales_pdf(product: str = "", kms_year: str = "", season: str = "",
    date_from: str = "", date_to: str = "", billing_date_from: str = "", billing_date_to: str = "",
    rst_no: str = "", vehicle_no: str = "", bill_from: str = "", party_name: str = "", destination: str = ""):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from fastapi.responses import Response

    query = {}
    if product: query["product"] = product
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if rst_no: query["rst_no"] = {"$regex": rst_no, "$options": "i"}
    if vehicle_no: query["vehicle_no"] = {"$regex": vehicle_no, "$options": "i"}
    if bill_from: query["bill_from"] = {"$regex": bill_from, "$options": "i"}
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if destination: query["destination"] = {"$regex": destination, "$options": "i"}
    if date_from or date_to:
        query["date"] = {}
        if date_from: query["date"]["$gte"] = date_from
        if date_to: query["date"]["$lte"] = date_to
    if billing_date_from or billing_date_to:
        query["billing_date"] = {}
        if billing_date_from: query["billing_date"]["$gte"] = billing_date_from
        if billing_date_to: query["billing_date"]["$lte"] = billing_date_to
    sales = await db.bp_sale_register.find(query, {"_id": 0}).sort("date", 1).to_list(10000)

    # Fetch oil premium data for Rice Bran
    oil_map_pdf = {}
    if product == "Rice Bran":
        op_q = {}
        if kms_year: op_q["kms_year"] = kms_year
        if season: op_q["season"] = season
        op_list = await db.oil_premium.find(op_q, {"_id": 0}).to_list(10000)
        for op in op_list:
            key = op.get("voucher_no") or op.get("rst_no") or ""
            if key: oil_map_pdf[key] = op
    has_oil_pdf = bool(oil_map_pdf) and any(oil_map_pdf.get(s.get('voucher_no') or '') or oil_map_pdf.get(s.get('rst_no') or '') for s in sales)

    branding = await db.branding.find_one({}, {"_id": 0}) or {}

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=12, rightMargin=12, topMargin=15, bottomMargin=15)
    elements = []
    styles = getSampleStyleSheet()

    # Use shared branded header (company + address + phone + custom_fields like proprietor, GST, etc.)
    from utils.export_helpers import get_pdf_company_header
    elements.extend(get_pdf_company_header(branding))

    # Title
    title = f"{product or 'By-Product'} Sale Register"
    if kms_year: title += f" - FY {kms_year}"
    if season: title += f" ({season})"
    title_style = ParagraphStyle('RegTitle', parent=styles['Heading2'], fontSize=9,
        textColor=colors.white, backColor=colors.HexColor('#2E75B6'), spaceAfter=4, alignment=1,
        borderPadding=(2, 2, 2, 2))
    elements.append(Paragraph(title, title_style))
    elements.append(Spacer(1, 3))

    # Detect which optional columns have data
    has_bill_no = any(s.get('bill_number') for s in sales)
    has_rst = any(s.get('rst_no') for s in sales)
    has_vehicle = any(s.get('vehicle_no') for s in sales)
    has_bill_from = any(s.get('bill_from') for s in sales)
    has_dest = any(s.get('destination') for s in sales)
    has_bags = any(s.get('bags', 0) for s in sales)
    has_tax = any(s.get('tax_amount', 0) for s in sales)
    has_cash = any(s.get('cash_paid', 0) for s in sales)
    has_diesel = any(s.get('diesel_paid', 0) for s in sales)
    has_adv = any(s.get('advance', 0) for s in sales)

    # Build dynamic columns: (header, width, key)
    pdf_cols = [('V.No', 28, 'voucher_no'), ('Date', 42, 'date')]
    if has_bill_no: pdf_cols.append(('Bill No', 40, 'bill_number'))
    if has_rst: pdf_cols.append(('RST', 28, 'rst_no'))
    if has_vehicle: pdf_cols.append(('Vehicle', 48, 'vehicle_no'))
    if has_bill_from: pdf_cols.append(('Bill From', 55, 'bill_from'))
    pdf_cols.append(('Party', 65, 'party_name'))
    if has_dest: pdf_cols.append(('Destination', 50, 'destination'))
    pdf_cols.append(('N/W(Kg)', 40, 'net_weight_kg'))
    if has_bags: pdf_cols.append(('Bags', 28, 'bags'))
    pdf_cols.append(('Rate/Q', 38, 'rate_per_qtl'))
    pdf_cols.append(('Amount', 50, 'amount'))
    if has_tax: pdf_cols.append(('Tax', 35, 'tax_amount'))
    pdf_cols.append(('Total', 50, 'total'))
    if has_cash: pdf_cols.append(('Cash', 38, 'cash_paid'))
    if has_diesel: pdf_cols.append(('Diesel', 38, 'diesel_paid'))
    if has_adv: pdf_cols.append(('Adv', 32, 'advance'))
    pdf_cols.append(('Balance', 48, 'balance'))
    if has_oil_pdf:
        pdf_cols.append(('Oil%', 30, 'oil_pct'))
        pdf_cols.append(('Diff%', 30, 'oil_diff'))
        pdf_cols.append(('Premium', 45, 'oil_premium'))

    headers = [c[0] for c in pdf_cols]
    col_widths = [c[1] for c in pdf_cols]
    col_keys = [c[2] for c in pdf_cols]

    # Auto-fit: scale columns to fit A4 landscape (842pt - 24pt margins = 818pt)
    usable_width = 818
    total_w = sum(col_widths)
    if total_w > usable_width:
        scale = usable_width / total_w
        col_widths = [round(w * scale) for w in col_widths]

    data = [headers]
    t_nw = t_bags = t_amt = t_tax = t_total = t_cash = t_diesel = t_adv = t_bal = t_oil_prem_pdf = 0
    for idx, s in enumerate(sales):
        t_nw += s.get('net_weight_kg', 0); t_bags += s.get('bags', 0)
        t_amt += s.get('amount', 0); t_tax += s.get('tax_amount', 0); t_total += s.get('total', 0)
        t_cash += s.get('cash_paid', 0); t_diesel += s.get('diesel_paid', 0)
        t_adv += s.get('advance', 0); t_bal += s.get('balance', 0)
        op = oil_map_pdf.get(s.get('voucher_no') or '') or oil_map_pdf.get(s.get('rst_no') or '')
        if op: t_oil_prem_pdf += op.get('premium_amount', 0)
        row_data = []
        for key in col_keys:
            if key == 'voucher_no': row_data.append(s.get('voucher_no', '') or '')
            elif key == 'date': row_data.append(fmt_date(s.get('date', '')))
            elif key == 'party_name': row_data.append((s.get('party_name', '') or '')[:16])
            elif key == 'bill_from': row_data.append((s.get('bill_from', '') or '')[:14])
            elif key == 'destination': row_data.append((s.get('destination', '') or '')[:12])
            elif key in ('amount', 'tax_amount', 'total', 'balance'): row_data.append(f"{s.get(key, 0):,.0f}")
            elif key == 'oil_pct': row_data.append(f"{op.get('actual_oil_pct', '')}%" if op else '')
            elif key == 'oil_diff':
                if op:
                    d = op.get('difference_pct', 0)
                    row_data.append(f"{'+' if d > 0 else ''}{d:.2f}%")
                else: row_data.append('')
            elif key == 'oil_premium': row_data.append(f"{op.get('premium_amount', 0):,.0f}" if op else '')
            else: row_data.append(s.get(key, 0) if key in ('net_weight_kg','bags','rate_per_qtl','cash_paid','diesel_paid','advance') else s.get(key, ''))
        data.append(row_data)

    # Total row
    total_row = []
    for key in col_keys:
        if key == 'date': total_row.append('TOTAL')
        elif key == 'net_weight_kg': total_row.append(round(t_nw, 0))
        elif key == 'bags': total_row.append(t_bags)
        elif key == 'amount': total_row.append(f"{t_amt:,.0f}")
        elif key == 'tax_amount': total_row.append(f"{t_tax:,.0f}")
        elif key == 'total': total_row.append(f"{t_total:,.0f}")
        elif key == 'cash_paid': total_row.append(round(t_cash, 0))
        elif key == 'diesel_paid': total_row.append(round(t_diesel, 0))
        elif key == 'advance': total_row.append(round(t_adv, 0))
        elif key == 'balance': total_row.append(f"{t_bal:,.0f}")
        elif key == 'oil_premium': total_row.append(f"{t_oil_prem_pdf:,.0f}")
        else: total_row.append('')
    data.append(total_row)

    table = RLTable(data, colWidths=col_widths, repeatRows=1)

    # Find first numeric column index for right-align
    first_num = next((i for i, k in enumerate(col_keys) if k in ('net_weight_kg','bags','rate_per_qtl','amount','tax_amount','total','cash_paid','diesel_paid','advance','balance')), len(col_keys))

    nrows = len(data)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E79')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 6),
        ('FONTSIZE', (0, 1), (-1, -1), 6),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (first_num, 1), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CCCCCC')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#EBF1F8')]),
        ('BACKGROUND', (0, nrows - 1), (-1, nrows - 1), colors.HexColor('#2E75B6')),
        ('TEXTCOLOR', (0, nrows - 1), (-1, nrows - 1), colors.white),
        ('FONTNAME', (0, nrows - 1), (-1, nrows - 1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]
    table.setStyle(TableStyle(style_cmds))
    elements.append(table)

    # Payment summary footer - only show non-zero
    pay_parts = []
    if t_cash > 0: pay_parts.append(f"Cash: <font color='green'>{t_cash:,.0f}</font>")
    if t_diesel > 0: pay_parts.append(f"Diesel: <font color='#FF6600'>{t_diesel:,.0f}</font>")
    if t_adv > 0: pay_parts.append(f"Advance: <font color='#0066CC'>{t_adv:,.0f}</font>")
    pay_parts.append(f"<b>Balance: <font color='red'>{t_bal:,.0f}</font></b>")
    if pay_parts:
        elements.append(Spacer(1, 8))
        pay_style = ParagraphStyle('PaySummary', parent=styles['Normal'], fontSize=8,
            textColor=colors.HexColor('#1F4E79'))
        elements.append(Paragraph(f"<b>Payment Summary:</b>  {'  |  '.join(pay_parts)}", pay_style))

    # Generated date
    elements.append(Spacer(1, 4))
    gen_style = ParagraphStyle('Gen', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#999999'))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}", gen_style))

    doc.build(elements)
    buffer.seek(0)
    fn = f"{(product or 'byproduct').lower().replace(' ','_')}_sale_register_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fn}"})
