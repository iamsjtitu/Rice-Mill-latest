"""Vehicle Weight Entry - Weighbridge management for Rice Mill"""
from fastapi import APIRouter, HTTPException
from database import db
from datetime import datetime, timezone
import uuid
import logging
import io

router = APIRouter()
logger = logging.getLogger(__name__)


async def _next_rst(kms_year: str = ""):
    """Auto-increment RST number for current KMS year."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    last = await db["vehicle_weights"].find_one(query, sort=[("rst_no", -1)])
    return (last["rst_no"] + 1) if last else 1


@router.get("/vehicle-weight")
async def list_weights(kms_year: str = "", status: str = "", limit: int = 200):
    """List weight entries with optional filters."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if status:
        query["status"] = status
    cursor = db["vehicle_weights"].find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"entries": items, "count": len(items)}


@router.get("/vehicle-weight/pending")
async def pending_vehicles(kms_year: str = ""):
    """Get vehicles with only first weight (waiting for second weight)."""
    query = {"status": "pending"}
    if kms_year:
        query["kms_year"] = kms_year
    cursor = db["vehicle_weights"].find(query, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=100)
    return {"pending": items, "count": len(items)}


@router.get("/vehicle-weight/next-rst")
async def get_next_rst(kms_year: str = ""):
    """Get next RST number."""
    rst = await _next_rst(kms_year)
    return {"rst_no": rst}


@router.get("/vehicle-weight/by-rst/{rst_no}")
async def get_by_rst(rst_no: int, kms_year: str = ""):
    """Lookup vehicle weight entry by RST number - used by Entries form auto-fill."""
    query = {"rst_no": rst_no}
    if kms_year:
        query["kms_year"] = kms_year
    entry = await db["vehicle_weights"].find_one(query, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="RST not found in Vehicle Weight")
    return {"success": True, "entry": entry}


@router.post("/vehicle-weight")
async def create_weight_entry(data: dict):
    """Create new weight entry with first weight."""
    kms_year = data.get("kms_year", "")
    rst_no = await _next_rst(kms_year)

    entry = {
        "id": str(uuid.uuid4()),
        "rst_no": rst_no,
        "date": data.get("date", datetime.now().strftime("%Y-%m-%d")),
        "kms_year": kms_year,
        "vehicle_no": (data.get("vehicle_no", "") or "").strip().upper(),
        "party_name": (data.get("party_name", "") or "").strip(),
        "farmer_name": (data.get("farmer_name", "") or "").strip(),
        "product": data.get("product", "PADDY"),
        "trans_type": data.get("trans_type", "Receive(Pur)"),
        "j_pkts": int(data.get("j_pkts", 0) or 0),
        "p_pkts": int(data.get("p_pkts", 0) or 0),
        "tot_pkts": int(data.get("tot_pkts", 0) or 0),
        "first_wt": float(data.get("first_wt", 0) or 0),
        "first_wt_time": datetime.now(timezone.utc).isoformat(),
        "second_wt": 0,
        "second_wt_time": "",
        "net_wt": 0,
        "remark": data.get("remark", ""),
        "cash_paid": float(data.get("cash_paid", 0) or 0),
        "diesel_paid": float(data.get("diesel_paid", 0) or 0),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db["vehicle_weights"].insert_one(entry)
    entry.pop("_id", None)
    return {"success": True, "entry": entry, "message": f"RST #{rst_no} - First weight saved!"}


@router.put("/vehicle-weight/{entry_id}/second-weight")
async def update_second_weight(entry_id: str, data: dict):
    """Update second weight and calculate net weight."""
    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    second_wt = float(data.get("second_wt", 0) or 0)
    first_wt = entry["first_wt"]
    net_wt = abs(first_wt - second_wt)
    gross_wt = max(first_wt, second_wt)
    tare_wt = min(first_wt, second_wt)

    await db["vehicle_weights"].update_one(
        {"id": entry_id},
        {"$set": {
            "second_wt": second_wt,
            "second_wt_time": datetime.now(timezone.utc).isoformat(),
            "net_wt": net_wt,
            "gross_wt": gross_wt,
            "tare_wt": tare_wt,
            "status": "completed"
        }}
    )

    updated = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    return {"success": True, "entry": updated, "message": f"RST #{entry['rst_no']} - Net Wt: {net_wt} KG"}


@router.delete("/vehicle-weight/{entry_id}")
async def delete_weight_entry(entry_id: str):
    """Delete a weight entry."""
    result = await db["vehicle_weights"].delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"success": True, "message": "Entry deleted"}


@router.get("/vehicle-weight/{entry_id}/slip-pdf")
async def weight_slip_pdf(entry_id: str):
    """Generate weight slip PDF with proper company header."""
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    from fastapi.responses import StreamingResponse

    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    branding = await db["settings"].find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "JOLKO, KESINGA")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A5, leftMargin=10*mm, rightMargin=10*mm, topMargin=8*mm, bottomMargin=8*mm)

    styles = getSampleStyleSheet()
    s_company = ParagraphStyle('Company', parent=styles['Title'], fontSize=16, spaceAfter=1, alignment=TA_CENTER, textColor=colors.HexColor("#1a1a2e"))
    s_tagline = ParagraphStyle('Tagline', parent=styles['Normal'], fontSize=9, alignment=TA_CENTER, textColor=colors.gray, spaceAfter=2)
    s_slip_title = ParagraphStyle('SlipTitle', parent=styles['Normal'], fontSize=11, alignment=TA_CENTER, fontName='Helvetica-Bold', textColor=colors.HexColor("#333"), spaceAfter=4)
    s_label = ParagraphStyle('Label', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor("#666"))
    s_val = ParagraphStyle('Val', parent=styles['Normal'], fontSize=10, fontName='Helvetica-Bold')
    s_footer = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=7, alignment=TA_CENTER, textColor=colors.gray)

    elements = []

    # Company Header
    elements.append(Paragraph(company, s_company))
    elements.append(Paragraph(tagline, s_tagline))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1a1a2e"), spaceAfter=3, spaceBefore=2))
    elements.append(Paragraph("WEIGHT SLIP / वजन पर्ची", s_slip_title))

    # Details Grid
    date_str = entry.get("date", "")
    details = [
        ["RST No:", f"#{entry.get('rst_no', '')}", "Date:", date_str],
        ["Vehicle:", entry.get("vehicle_no", ""), "Trans:", entry.get("trans_type", "")],
        ["Party:", entry.get("party_name", ""), "Farmer:", entry.get("farmer_name", "")],
        ["Product:", entry.get("product", ""), "Bags:", str(entry.get("tot_pkts", 0))],
    ]
    dt = Table(details, colWidths=[18*mm, 42*mm, 18*mm, 42*mm])
    dt.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (1, 0), (1, 0), 11),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor("#555")),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor("#555")),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(dt)
    elements.append(Spacer(1, 4*mm))

    # Weight Table - Only Gross, Tare, Net
    first_wt = entry.get("first_wt", 0)
    second_wt = entry.get("second_wt", 0)
    net_wt = entry.get("net_wt", 0)
    gross_wt = entry.get("gross_wt", max(first_wt, second_wt))
    tare_wt = entry.get("tare_wt", min(first_wt, second_wt))

    wt_data = [
        ["", "Weight (KG)"],
        ["Gross Wt", f"{gross_wt:,.0f}"],
        ["Tare Wt", f"{tare_wt:,.0f}"],
        ["Net Wt", f"{net_wt:,.0f}"],
    ]
    wt = Table(wt_data, colWidths=[35*mm, 45*mm])
    wt.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 14),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#f0f0f0")),
        ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor("#fff")),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#d4edda")),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor("#155724")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CCC")),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(wt)
    elements.append(Spacer(1, 3*mm))

    # Cash / Diesel section
    cash = entry.get("cash_paid", 0)
    diesel = entry.get("diesel_paid", 0)
    if cash or diesel:
        pay_data = [["Cash Paid", f"{cash:,.0f}"], ["Diesel Paid", f"{diesel:,.0f}"]]
        pt = Table(pay_data, colWidths=[35*mm, 45*mm])
        pt.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor("#555")),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(pt)
        elements.append(Spacer(1, 3*mm))

    if entry.get("remark"):
        elements.append(Paragraph(f"<b>Remark:</b> {entry['remark']}", s_label))
        elements.append(Spacer(1, 3*mm))

    # Footer
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#ccc"), spaceAfter=2, spaceBefore=4))
    elements.append(Paragraph(f"{company} | Computer Generated Slip", s_footer))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=WeightSlip_RST{entry.get('rst_no','')}.pdf"})
