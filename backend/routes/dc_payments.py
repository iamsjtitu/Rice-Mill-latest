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

# ============ DC (DELIVERY CHALLAN) MANAGEMENT ============

class DCEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dc_number: str
    date: str
    quantity_qntl: float = 0
    rice_type: str = "parboiled"  # parboiled / raw
    godown_name: str = ""
    deadline: str = ""
    notes: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DCDelivery(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dc_id: str
    date: str
    quantity_qntl: float = 0
    vehicle_no: str = ""
    driver_name: str = ""
    slip_no: str = ""
    godown_name: str = ""
    notes: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@router.post("/dc-entries")
async def add_dc_entry(dc: DCEntry, username: str = ""):
    d = dc.model_dump()
    d['created_by'] = username
    d['quantity_qntl'] = round(d['quantity_qntl'], 2)
    await db.dc_entries.insert_one(d)
    d.pop('_id', None)
    return d


@router.get("/dc-entries")
async def get_dc_entries(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.dc_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    # Attach delivery summary to each DC
    for e in entries:
        deliveries = await db.dc_deliveries.find({"dc_id": e["id"]}, {"_id": 0}).to_list(500)
        delivered = round(sum(d.get("quantity_qntl", 0) for d in deliveries), 2)
        e["delivered_qntl"] = delivered
        e["pending_qntl"] = round(e["quantity_qntl"] - delivered, 2)
        e["delivery_count"] = len(deliveries)
        e["status"] = "completed" if delivered >= e["quantity_qntl"] else ("partial" if delivered > 0 else "pending")
    return entries


@router.put("/dc-entries/{dc_id}")
async def update_dc_entry(dc_id: str, dc: DCEntry):
    d = dc.model_dump()
    d['quantity_qntl'] = round(d['quantity_qntl'], 2)
    d.pop('id', None)
    result = await db.dc_entries.update_one({"id": dc_id}, {"$set": d})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="DC not found")
    updated = await db.dc_entries.find_one({"id": dc_id}, {"_id": 0})
    return updated


@router.delete("/dc-entries/{dc_id}")
async def delete_dc_entry(dc_id: str):
    result = await db.dc_entries.delete_one({"id": dc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="DC not found")
    await db.dc_deliveries.delete_many({"dc_id": dc_id})
    return {"message": "DC and its deliveries deleted", "id": dc_id}


@router.post("/dc-deliveries")
async def add_dc_delivery(delivery: DCDelivery, username: str = ""):
    d = delivery.model_dump()
    d['created_by'] = username
    d['quantity_qntl'] = round(d['quantity_qntl'], 2)
    dc = await db.dc_entries.find_one({"id": d["dc_id"]}, {"_id": 0})
    if not dc:
        raise HTTPException(status_code=404, detail="DC not found")
    await db.dc_deliveries.insert_one(d)
    d.pop('_id', None)
    return d


@router.get("/dc-deliveries")
async def get_dc_deliveries(dc_id: Optional[str] = None, kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if dc_id: query["dc_id"] = dc_id
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    return await db.dc_deliveries.find(query, {"_id": 0}).sort("date", -1).to_list(2000)


@router.delete("/dc-deliveries/{delivery_id}")
async def delete_dc_delivery(delivery_id: str):
    result = await db.dc_deliveries.delete_one({"id": delivery_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Delivery not found")
    return {"message": "Delivery deleted", "id": delivery_id}


@router.get("/dc-summary")
async def get_dc_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    dcs = await db.dc_entries.find(query, {"_id": 0}).to_list(1000)
    total_allotted = round(sum(d.get("quantity_qntl", 0) for d in dcs), 2)
    all_deliveries = await db.dc_deliveries.find(query, {"_id": 0}).to_list(5000)
    total_delivered = round(sum(d.get("quantity_qntl", 0) for d in all_deliveries), 2)
    completed = 0; partial = 0; pending_count = 0
    for dc in dcs:
        deld = sum(d.get("quantity_qntl", 0) for d in all_deliveries if d.get("dc_id") == dc["id"])
        if deld >= dc["quantity_qntl"]: completed += 1
        elif deld > 0: partial += 1
        else: pending_count += 1
    return {
        "total_dc": len(dcs), "total_allotted_qntl": total_allotted,
        "total_delivered_qntl": total_delivered, "total_pending_qntl": round(total_allotted - total_delivered, 2),
        "completed": completed, "partial": partial, "pending": pending_count,
        "total_deliveries": len(all_deliveries)
    }


@router.get("/dc-entries/excel")
async def export_dc_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    dcs = await db.dc_entries.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    all_deliveries = await db.dc_deliveries.find(query, {"_id": 0}).to_list(5000)
    wb = Workbook(); ws = wb.active; ws.title = "DC Register"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    ws.merge_cells('A1:I1'); ws['A1'] = "DC (Delivery Challan) Register"; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    headers = ['DC No', 'Date', 'Rice Type', 'Allotted (Q)', 'Delivered (Q)', 'Pending (Q)', 'Status', 'Deadline', 'Godown']
    for col, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb; c.alignment = Alignment(horizontal='center')
    row = 4
    for dc in dcs:
        deld = round(sum(d.get("quantity_qntl", 0) for d in all_deliveries if d.get("dc_id") == dc["id"]), 2)
        pend = round(dc["quantity_qntl"] - deld, 2)
        status = "Completed" if deld >= dc["quantity_qntl"] else ("Partial" if deld > 0 else "Pending")
        for col, v in enumerate([dc.get("dc_number",""), dc.get("date",""), (dc.get("rice_type","")).capitalize(), dc["quantity_qntl"], deld, pend, status, dc.get("deadline",""), dc.get("godown_name","")], 1):
            c = ws.cell(row=row, column=col, value=v); c.border = tb
            if col in [4,5,6]: c.alignment = Alignment(horizontal='right'); c.number_format = '#,##0.00'
        row += 1
    total_allot = round(sum(d["quantity_qntl"] for d in dcs), 2)
    total_del = round(sum(d.get("quantity_qntl",0) for d in all_deliveries), 2)
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=4, value=total_allot).font = Font(bold=True)
    ws.cell(row=row, column=5, value=total_del).font = Font(bold=True)
    ws.cell(row=row, column=6, value=round(total_allot-total_del, 2)).font = Font(bold=True)
    # Delivery detail sheet
    ws2 = wb.create_sheet("Deliveries")
    dheaders = ['DC No', 'Date', 'Qty (Q)', 'Vehicle', 'Driver', 'Slip No', 'Godown', 'Note']
    for col, h in enumerate(dheaders, 1):
        c = ws2.cell(row=1, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    dc_map = {d["id"]: d.get("dc_number","") for d in dcs}
    for i, dl in enumerate(sorted(all_deliveries, key=lambda x: x.get("date","")), 2):
        for col, v in enumerate([dc_map.get(dl.get("dc_id",""),""), dl.get("date",""), dl.get("quantity_qntl",0), dl.get("vehicle_no",""), dl.get("driver_name",""), dl.get("slip_no",""), dl.get("godown_name",""), dl.get("notes","")], 1):
            ws2.cell(row=i, column=col, value=v).border = tb
    for letter in ['A','B','C','D','E','F','G','H','I']:
        ws.column_dimensions[letter].width = 15; ws2.column_dimensions[letter].width = 15
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=dc_register_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/dc-entries/pdf")
async def export_dc_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    dcs = await db.dc_entries.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    all_deliveries = await db.dc_deliveries.find(query, {"_id": 0}).to_list(5000)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("DC (Delivery Challan) Register", styles['Title'])); elements.append(Spacer(1, 12))
    data = [['DC No','Date','Type','Allotted(Q)','Delivered(Q)','Pending(Q)','Status','Deadline','Godown']]
    ta = td = 0
    for dc in dcs:
        deld = round(sum(d.get("quantity_qntl",0) for d in all_deliveries if d.get("dc_id")==dc["id"]),2)
        pend = round(dc["quantity_qntl"]-deld,2); ta += dc["quantity_qntl"]; td += deld
        status = "Done" if deld >= dc["quantity_qntl"] else ("Partial" if deld > 0 else "Pending")
        data.append([dc.get("dc_number",""), dc.get("date",""), (dc.get("rice_type","")).capitalize()[:5], dc["quantity_qntl"], deld, pend, status, dc.get("deadline",""), dc.get("godown_name","")[:12]])
    data.append(['TOTAL','','', round(ta,2), round(td,2), round(ta-td,2), '','',''])
    table = RLTable(data, colWidths=[55,55,40,55,55,50,40,55,60], repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1a365d')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),7),('ALIGN',(3,0),(5,-1),'RIGHT'),('GRID',(0,0),(-1,-1),0.5,colors.grey),
        ('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#f0f0f0')),('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold')]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=dc_register_{datetime.now().strftime('%Y%m%d')}.pdf"})


# ============ MSP PAYMENT TRACKING ============

class MSPPayment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    dc_id: str = ""  # optional link to DC
    amount: float = 0
    quantity_qntl: float = 0
    rate_per_qntl: float = 0
    payment_mode: str = ""  # NEFT/RTGS/Cheque/Cash
    reference: str = ""  # UTR/Cheque number
    bank_name: str = ""
    notes: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@router.post("/msp-payments")
async def add_msp_payment(pay: MSPPayment, username: str = ""):
    d = pay.model_dump()
    d['created_by'] = username
    d['amount'] = round(d['amount'], 2)
    d['quantity_qntl'] = round(d['quantity_qntl'], 2)
    d['rate_per_qntl'] = round(d['rate_per_qntl'], 2)
    await db.msp_payments.insert_one(d)
    d.pop('_id', None)
    # Auto-create Cash Book Jama entry (MSP payment received from govt)
    if d['amount'] > 0:
        cb_entry = {
            "id": str(uuid.uuid4()),
            "date": d["date"],
            "account": "bank",
            "txn_type": "jama",
            "category": "MSP Payment",
            "description": f"MSP Payment: {d.get('quantity_qntl', 0)}Q @ Rs.{d.get('rate_per_qntl', 0)}/Q",
            "amount": round(d['amount'], 2),
            "reference": f"msp:{d['id'][:8]}",
            "kms_year": d.get("kms_year", ""),
            "season": d.get("season", ""),
            "created_by": username or "system",
            "linked_payment_id": f"msp:{d['id']}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.cash_transactions.insert_one(cb_entry)
        cb_entry.pop("_id", None)
    return d


@router.get("/msp-payments")
async def get_msp_payments(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    payments = await db.msp_payments.find(query, {"_id": 0}).sort("date", -1).to_list(2000)
    # Attach DC number
    dc_ids = list(set(p.get("dc_id","") for p in payments if p.get("dc_id")))
    dcs = {}
    if dc_ids:
        dc_docs = await db.dc_entries.find({"id": {"$in": dc_ids}}, {"_id": 0, "id": 1, "dc_number": 1}).to_list(500)
        dcs = {d["id"]: d.get("dc_number","") for d in dc_docs}
    for p in payments:
        p["dc_number"] = dcs.get(p.get("dc_id",""), "")
    return payments


@router.delete("/msp-payments/{payment_id}")
async def delete_msp_payment(payment_id: str):
    result = await db.msp_payments.delete_one({"id": payment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    # Delete linked cash book entry
    await db.cash_transactions.delete_many({"linked_payment_id": f"msp:{payment_id}"})
    return {"message": "Payment deleted", "id": payment_id}


@router.get("/msp-payments/summary")
async def get_msp_payment_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    payments = await db.msp_payments.find(query, {"_id": 0}).to_list(5000)
    dcs = await db.dc_entries.find(query, {"_id": 0}).to_list(1000)
    all_deliveries = await db.dc_deliveries.find(query, {"_id": 0}).to_list(5000)
    total_delivered = round(sum(d.get("quantity_qntl",0) for d in all_deliveries), 2)
    total_paid_amount = round(sum(p.get("amount",0) for p in payments), 2)
    total_paid_qty = round(sum(p.get("quantity_qntl",0) for p in payments), 2)
    avg_rate = round(total_paid_amount / total_paid_qty, 2) if total_paid_qty > 0 else 0
    return {
        "total_payments": len(payments), "total_paid_amount": total_paid_amount,
        "total_paid_qty": total_paid_qty, "avg_rate": avg_rate,
        "total_delivered_qntl": total_delivered,
        "pending_payment_qty": round(total_delivered - total_paid_qty, 2),
    }


@router.get("/msp-payments/excel")
async def export_msp_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    payments = await db.msp_payments.find(query, {"_id": 0}).sort("date", 1).to_list(5000)
    dc_ids = list(set(p.get("dc_id","") for p in payments if p.get("dc_id")))
    dcs = {}
    if dc_ids:
        dc_docs = await db.dc_entries.find({"id": {"$in": dc_ids}}, {"_id": 0}).to_list(500)
        dcs = {d["id"]: d.get("dc_number","") for d in dc_docs}
    wb = Workbook(); ws = wb.active; ws.title = "MSP Payments"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    ws.merge_cells('A1:H1'); ws['A1'] = "MSP Payment Register"; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    headers = ['Date','DC No','Qty (Q)','Rate (₹/Q)','Amount (₹)','Mode','Reference','Bank']
    for col, h in enumerate(headers, 1):
        c = ws.cell(row=3, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    row = 4
    for p in payments:
        for col, v in enumerate([p.get("date",""), dcs.get(p.get("dc_id",""),""), p.get("quantity_qntl",0), p.get("rate_per_qntl",0), p.get("amount",0), p.get("payment_mode",""), p.get("reference",""), p.get("bank_name","")], 1):
            c = ws.cell(row=row, column=col, value=v); c.border = tb
            if col in [3,4,5]: c.alignment = Alignment(horizontal='right'); c.number_format = '#,##0.00'
        row += 1
    ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=row, column=3, value=round(sum(p.get("quantity_qntl",0) for p in payments),2)).font = Font(bold=True)
    ws.cell(row=row, column=5, value=round(sum(p.get("amount",0) for p in payments),2)).font = Font(bold=True)
    for letter in ['A','B','C','D','E','F','G','H']: ws.column_dimensions[letter].width = 15
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=msp_payments_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/msp-payments/pdf")
async def export_msp_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    payments = await db.msp_payments.find(query, {"_id": 0}).sort("date", 1).to_list(5000)
    dc_ids = list(set(p.get("dc_id","") for p in payments if p.get("dc_id")))
    dcs = {}
    if dc_ids:
        dc_docs = await db.dc_entries.find({"id": {"$in": dc_ids}}, {"_id": 0}).to_list(500)
        dcs = {d["id"]: d.get("dc_number","") for d in dc_docs}
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("MSP Payment Register", styles['Title'])); elements.append(Spacer(1, 12))
    data = [['Date','DC No','Qty(Q)','Rate(₹/Q)','Amount(₹)','Mode','Reference','Bank']]
    tq = ta = 0
    for p in payments:
        tq += p.get("quantity_qntl",0); ta += p.get("amount",0)
        data.append([p.get("date",""), dcs.get(p.get("dc_id",""),""), p.get("quantity_qntl",0), p.get("rate_per_qntl",0), p.get("amount",0), p.get("payment_mode",""), p.get("reference","")[:15], p.get("bank_name","")[:12]])
    data.append(['TOTAL','',round(tq,2),'',round(ta,2),'','',''])
    table = RLTable(data, colWidths=[55,55,50,50,60,45,70,60], repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1a365d')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),7),('ALIGN',(2,0),(4,-1),'RIGHT'),('GRID',(0,0),(-1,-1),0.5,colors.grey),
        ('BACKGROUND',(0,-1),(-1,-1),colors.HexColor('#f0f0f0')),('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold')]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=msp_payments_{datetime.now().strftime('%Y%m%d')}.pdf"})


# ============ GUNNY BAG TRACKING ============

class GunnyBagEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    bag_type: str = "new"  # new (govt free) / old (market purchase)
    txn_type: str = "in"   # in / out
    quantity: int = 0
    source: str = ""       # where from / where to
    rate: float = 0        # rate per bag (for old/purchased)
    amount: float = 0
    reference: str = ""
    notes: str = ""
    kms_year: str = ""
    season: str = ""
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@router.post("/gunny-bags")
async def add_gunny_bag_entry(entry: GunnyBagEntry, username: str = ""):
    d = entry.model_dump()
    d['created_by'] = username
    d['amount'] = round(d.get('quantity', 0) * d.get('rate', 0), 2)
    await db.gunny_bags.insert_one(d)
    d.pop('_id', None)
    return d


@router.get("/gunny-bags")
async def get_gunny_bag_entries(kms_year: Optional[str] = None, season: Optional[str] = None, bag_type: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if bag_type: query["bag_type"] = bag_type
    return await db.gunny_bags.find(query, {"_id": 0}).sort("date", -1).to_list(5000)


@router.delete("/gunny-bags/{entry_id}")
async def delete_gunny_bag_entry(entry_id: str):
    result = await db.gunny_bags.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Deleted", "id": entry_id}


@router.put("/gunny-bags/{entry_id}")
async def update_gunny_bag_entry(entry_id: str, entry: GunnyBagEntry, username: str = ""):
    existing = await db.gunny_bags.find_one({"id": entry_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entry not found")
    d = entry.model_dump()
    d["id"] = entry_id  # preserve original id
    d["amount"] = round(d.get("quantity", 0) * d.get("rate", 0), 2)
    d["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.gunny_bags.update_one({"id": entry_id}, {"$set": d})
    updated = await db.gunny_bags.find_one({"id": entry_id}, {"_id": 0})
    return updated


@router.get("/gunny-bags/summary")
async def get_gunny_bag_summary(kms_year: Optional[str] = None, season: Optional[str] = None):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.gunny_bags.find(query, {"_id": 0}).to_list(10000)
    # Manual gunny bag transactions (new=govt, old=market)
    result = {}
    for bt in ["new", "old"]:
        items = [e for e in entries if e.get("bag_type") == bt]
        total_in = sum(e.get("quantity",0) for e in items if e.get("txn_type") == "in")
        total_out = sum(e.get("quantity",0) for e in items if e.get("txn_type") == "out")
        total_cost = round(sum(e.get("amount",0) for e in items if e.get("txn_type") == "in"), 2)
        result[bt] = {"total_in": total_in, "total_out": total_out, "balance": total_in - total_out, "total_cost": total_cost}
    # Paddy-received bags from truck entries (auto-calculated)
    paddy_entries = await db.mill_entries.find(query, {"_id": 0, "bag": 1, "plastic_bag": 1}).to_list(10000)
    paddy_bags = sum(e.get("bag", 0) for e in paddy_entries)
    paddy_ppkt = sum(e.get("plastic_bag", 0) for e in paddy_entries)
    result["paddy_bags"] = {"total": paddy_bags, "label": "Paddy Receive Bags"}
    result["ppkt"] = {"total": paddy_ppkt, "label": "P.Pkt (Plastic Bags)"}
    # G.Issued is now auto-deducted from Old Bags via linked gunny_bags entries (no separate "Govt Issued" display)
    # Grand total: old bags + paddy bags + P.Pkt (govt bags NOT included)
    result["grand_total"] = result["old"]["balance"] + paddy_bags + paddy_ppkt
    return result


@router.get("/gunny-bags/excel")
async def export_gunny_bags_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.gunny_bags.find(query, {"_id": 0}).sort("date", 1).to_list(10000)
    summary = await get_gunny_bag_summary(kms_year=kms_year, season=season)
    wb = Workbook(); ws = wb.active; ws.title = "Gunny Bags"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    ws.merge_cells('A1:H1'); ws['A1'] = "Gunny Bag Register / बोरी रजिस्टर"; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    # Summary
    ws.cell(row=3, column=1, value="Summary").font = Font(bold=True, size=11)
    for col, h in enumerate(['Type', 'In', 'Out', 'Balance', 'Cost (₹)'], 1):
        c = ws.cell(row=4, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    for i, (bt, label) in enumerate([("new","New (Govt)"),("old","Old (Market)")], 5):
        s = summary.get(bt, {})
        for col, v in enumerate([label, s.get("total_in",0), s.get("total_out",0), s.get("balance",0), s.get("total_cost",0)], 1):
            c = ws.cell(row=i, column=col, value=v); c.border = tb
    # Paddy receive bags
    ws.cell(row=7, column=1, value="Paddy Receive Bags").border = tb
    ws.cell(row=7, column=4, value=summary.get("paddy_bags",{}).get("total",0)).border = tb
    ws.cell(row=8, column=1, value="P.Pkt (Plastic)").border = tb
    ws.cell(row=8, column=4, value=summary.get("ppkt",{}).get("total",0)).border = tb
    ws.cell(row=9, column=1, value="G.Issued (Old Bags Out)").border = tb
    ws.cell(row=9, column=4, value=summary.get("old",{}).get("total_out",0)).border = tb
    ws.cell(row=10, column=1, value="Total (Excl Govt)").font = Font(bold=True)
    ws.cell(row=10, column=4, value=summary.get("grand_total",0)).font = Font(bold=True)
    # Transactions
    row = 12
    ws.cell(row=row, column=1, value="Transactions").font = Font(bold=True, size=11); row += 1
    for col, h in enumerate(['Date','Type','In/Out','Qty','Source/To','Rate','Amount (₹)','Reference'], 1):
        c = ws.cell(row=row, column=col, value=h); c.fill = hf; c.font = hfont; c.border = tb
    row += 1
    for e in entries:
        for col, v in enumerate([e.get("date",""), "New" if e.get("bag_type")=="new" else "Old", "In" if e.get("txn_type")=="in" else "Out", e.get("quantity",0), e.get("source",""), e.get("rate",0), e.get("amount",0), e.get("reference","")], 1):
            ws.cell(row=row, column=col, value=v).border = tb
        row += 1
    for letter in ['A','B','C','D','E','F','G','H']: ws.column_dimensions[letter].width = 15
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=gunny_bags_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/gunny-bags/pdf")
async def export_gunny_bags_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    entries = await db.gunny_bags.find(query, {"_id": 0}).sort("date", 1).to_list(10000)
    summary = await get_gunny_bag_summary(kms_year=kms_year, season=season)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("Gunny Bag Register", styles['Title'])); elements.append(Spacer(1, 10))
    # Summary
    sdata = [['Type','In','Out','Balance','Cost(₹)']]
    for bt, label in [("new","New(Govt)"),("old","Old(Market)")]:
        s = summary.get(bt, {})
        sdata.append([label, s.get("total_in",0), s.get("total_out",0), s.get("balance",0), s.get("total_cost",0)])
    st = RLTable(sdata, colWidths=[70,50,50,50,60])
    st.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1a365d')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),8),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold')]))
    elements.append(st); elements.append(Spacer(1, 12))
    # Transactions
    elements.append(Paragraph("Transactions", styles['Heading2'])); elements.append(Spacer(1, 6))
    data = [['Date','Type','In/Out','Qty','Source/To','Rate','Amount(₹)','Ref']]
    for e in entries:
        data.append([e.get("date",""), "New" if e.get("bag_type")=="new" else "Old", "In" if e.get("txn_type")=="in" else "Out", e.get("quantity",0), e.get("source","")[:18], e.get("rate",0), e.get("amount",0), e.get("reference","")[:12]])
    table = RLTable(data, colWidths=[55,40,35,35,80,40,50,55], repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1a365d')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),7),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold')]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=gunny_bags_{datetime.now().strftime('%Y%m%d')}.pdf"})


