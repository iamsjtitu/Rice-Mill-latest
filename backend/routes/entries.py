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


async def get_company_name():
    branding = await db.branding.find_one({}, {"_id": 0})
    if branding:
        return branding.get("company_name", "NAVKAR AGRO"), branding.get("tagline", "")
    return "NAVKAR AGRO", "JOLKO, KESINGA"

# ============ MILL ENTRIES CRUD ============

@router.get("/")
async def root():
    return {"message": "Mill Entry API - Navkar Agro"}


@router.post("/entries", response_model=MillEntry)
async def create_entry(input: MillEntryCreate, username: str = "", role: str = ""):
    entry_dict = input.model_dump()
    entry_dict = calculate_auto_fields(entry_dict)
    entry_dict['created_by'] = username
    
    entry_obj = MillEntry(**entry_dict)
    doc = entry_obj.model_dump()
    
    await db.mill_entries.insert_one(doc)
    
    # Auto-create gunny bag "out" entry for Old Bags (Market) when g_issued > 0
    g_issued = doc.get("g_issued", 0)
    if g_issued and g_issued > 0:
        gunny_doc = {
            "id": str(uuid.uuid4()),
            "date": doc.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
            "bag_type": "old",
            "txn_type": "out",
            "quantity": int(g_issued),
            "rate": 0,
            "amount": 0,
            "source": f"{doc.get('agent_name', '')} | {doc.get('mandi_name', '')} | {doc.get('truck_no', '')}".strip(" |"),
            "reference": f"Auto: Entry {doc['id']}",
            "notes": f"G.Issued - Agent: {doc.get('agent_name','')}, Mandi: {doc.get('mandi_name','')}, Truck: {doc.get('truck_no','')}",
            "kms_year": doc.get("kms_year", ""),
            "season": doc.get("season", ""),
            "created_by": username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "linked_entry_id": doc["id"]
        }
        await db.gunny_bags.insert_one(gunny_doc)
    
    return entry_obj


@router.get("/entries", response_model=List[MillEntry])
async def get_entries(
    truck_no: Optional[str] = None,
    rst_no: Optional[str] = None,
    tp_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    query = {}
    
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    if rst_no:
        query["rst_no"] = {"$regex": rst_no, "$options": "i"}
    if tp_no:
        query["tp_no"] = {"$regex": tp_no, "$options": "i"}
    if agent_name:
        query["agent_name"] = {"$regex": agent_name, "$options": "i"}
    if mandi_name:
        query["mandi_name"] = {"$regex": mandi_name, "$options": "i"}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    # Date range filter
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        if date_query:
            query["date"] = date_query
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return entries


@router.get("/entries/{entry_id}", response_model=MillEntry)
async def get_entry(entry_id: str):
    entry = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@router.put("/entries/{entry_id}", response_model=MillEntry)
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
    
    # Update linked gunny bag entry for g_issued
    new_g_issued = int(merged_data.get("g_issued", 0) or 0)
    # Remove old linked gunny bag entry
    await db.gunny_bags.delete_many({"linked_entry_id": entry_id})
    # Create new one if g_issued > 0
    if new_g_issued > 0:
        gunny_doc = {
            "id": str(uuid.uuid4()),
            "date": merged_data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
            "bag_type": "old",
            "txn_type": "out",
            "quantity": new_g_issued,
            "rate": 0,
            "amount": 0,
            "source": f"{merged_data.get('agent_name', '')} | {merged_data.get('mandi_name', '')} | {merged_data.get('truck_no', '')}".strip(" |"),
            "reference": f"Auto: Entry {entry_id}",
            "notes": f"G.Issued - Agent: {merged_data.get('agent_name','')}, Mandi: {merged_data.get('mandi_name','')}, Truck: {merged_data.get('truck_no','')}",
            "kms_year": merged_data.get("kms_year", ""),
            "season": merged_data.get("season", ""),
            "created_by": username,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "linked_entry_id": entry_id
        }
        await db.gunny_bags.insert_one(gunny_doc)
    
    updated = await db.mill_entries.find_one({"id": entry_id}, {"_id": 0})
    return updated


@router.delete("/entries/{entry_id}")
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
    
    # Remove linked gunny bag entry
    await db.gunny_bags.delete_many({"linked_entry_id": entry_id})
    
    return {"message": "Entry deleted successfully"}


@router.get("/totals", response_model=TotalsResponse)
async def get_totals(
    truck_no: Optional[str] = None,
    agent_name: Optional[str] = None,
    mandi_name: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
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
    
    # Date range filter
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        if date_query:
            match_query["date"] = date_query
    
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

@router.get("/suggestions/trucks")
async def get_truck_suggestions(q: str = ""):
    if len(q) < 1:
        trucks = await db.mill_entries.distinct("truck_no")
    else:
        trucks = await db.mill_entries.distinct("truck_no", {"truck_no": {"$regex": q, "$options": "i"}})
    return {"suggestions": [t for t in trucks if t]}


@router.get("/suggestions/agents")
async def get_agent_suggestions(q: str = ""):
    if len(q) < 1:
        agents = await db.mill_entries.distinct("agent_name")
    else:
        agents = await db.mill_entries.distinct("agent_name", {"agent_name": {"$regex": q, "$options": "i"}})
    return {"suggestions": [a for a in agents if a]}


@router.get("/suggestions/mandis")
async def get_mandi_suggestions(q: str = "", agent_name: str = ""):
    query = {}
    if q:
        query["mandi_name"] = {"$regex": q, "$options": "i"}
    if agent_name:
        query["agent_name"] = agent_name
    
    mandis = await db.mill_entries.distinct("mandi_name", query if query else None)
    return {"suggestions": [m for m in mandis if m]}


@router.get("/suggestions/kms_years")
async def get_kms_year_suggestions():
    years = await db.mill_entries.distinct("kms_year")
    return {"suggestions": [y for y in years if y]}


# ============ EXPORT ENDPOINTS ============

@router.get("/export/excel")
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
    company_name, tagline = await get_company_name()
    ws['A1'] = f"{company_name} - Mill Entries | KMS: {kms_year or 'All'} | {season or 'All Seasons'}"
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


@router.get("/export/pdf")
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
    company_name, tagline = await get_company_name()
    title_text = f"{company_name} - Mill Entries | KMS: {kms_year or 'All'} | {season or 'All Seasons'}"
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


@router.get("/export/truck-payments-excel")
async def export_truck_payments_excel(
    truck_no: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck payments to styled Excel file"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Build payment data
    payments_data = []
    total_net = 0
    total_paid = 0
    total_balance = 0
    
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        status = "Paid" if balance < 0.10 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_net += net_amount
        total_paid += paid_amount
        total_balance += balance
        
        payments_data.append({
            "date": entry.get("date", ""),
            "truck_no": entry.get("truck_no", ""),
            "mandi_name": entry.get("mandi_name", ""),
            "final_qntl": final_qntl,
            "rate": rate,
            "gross": gross_amount,
            "cash": cash_taken,
            "diesel": diesel_taken,
            "deductions": deductions,
            "net": net_amount,
            "paid": paid_amount,
            "balance": balance,
            "status": status
        })
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Truck Payments"
    
    # Styles
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    total_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    paid_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    pending_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    # Title
    ws.merge_cells('A1:M1')
    company_name, tagline = await get_company_name()
    ws['A1'] = f"TRUCK PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}"
    ws['A1'].font = Font(bold=True, size=14, color="D97706")
    ws['A1'].alignment = Alignment(horizontal='center')
    
    # Headers
    headers = ["Date", "Truck No", "Mandi", "Final QNTL", "Rate", "Gross", "Cash", "Diesel", "Deductions", "Net Amount", "Paid", "Balance", "Status"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    for row_idx, p in enumerate(payments_data, 4):
        ws.cell(row=row_idx, column=1, value=p["date"])
        ws.cell(row=row_idx, column=2, value=p["truck_no"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=3, value=p["mandi_name"])
        ws.cell(row=row_idx, column=4, value=p["final_qntl"])
        ws.cell(row=row_idx, column=5, value=f"₹{p['rate']}")
        ws.cell(row=row_idx, column=6, value=p["gross"])
        ws.cell(row=row_idx, column=7, value=p["cash"])
        ws.cell(row=row_idx, column=8, value=p["diesel"])
        ws.cell(row=row_idx, column=9, value=p["deductions"])
        ws.cell(row=row_idx, column=10, value=p["net"]).font = Font(bold=True)
        ws.cell(row=row_idx, column=11, value=p["paid"])
        ws.cell(row=row_idx, column=12, value=p["balance"]).font = Font(bold=True, color="DC2626" if p["balance"] > 0 else "059669")
        status_cell = ws.cell(row=row_idx, column=13, value=p["status"])
        if p["status"] == "Paid":
            status_cell.fill = paid_fill
        elif p["status"] == "Pending":
            status_cell.fill = pending_fill
    
    # Totals row
    total_row = len(payments_data) + 4
    ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=10, value=round(total_net, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=11, value=round(total_paid, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=12, value=round(total_balance, 2)).font = Font(bold=True, color="DC2626")
    for col in range(1, 14):
        ws.cell(row=total_row, column=col).fill = total_fill
    
    # Column widths
    col_widths = [12, 14, 14, 12, 8, 10, 8, 8, 10, 12, 10, 12, 10]
    for i, width in enumerate(col_widths, 1):
        ws.column_dimensions[chr(64 + i)].width = width
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"truck_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/truck-payments-pdf")
async def export_truck_payments_pdf(
    truck_no: Optional[str] = None,
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck payments to PDF"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
    from reportlab.lib.enums import TA_CENTER
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    if truck_no:
        query["truck_no"] = {"$regex": truck_no, "$options": "i"}
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Build payment data
    payments_data = []
    total_net = 0
    total_paid = 0
    total_balance = 0
    
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("final_w", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        status = "Paid" if balance < 0.10 else ("Partial" if paid_amount > 0 else "Pending")
        
        total_net += net_amount
        total_paid += paid_amount
        total_balance += balance
        
        payments_data.append([
            entry.get("date", "")[:10],
            entry.get("truck_no", "")[:12],
            entry.get("mandi_name", "")[:12],
            f"{final_qntl}",
            f"Rs.{rate}",
            f"Rs.{gross_amount}",
            f"-Rs.{deductions}",
            f"Rs.{net_amount}",
            f"Rs.{paid_amount}",
            f"Rs.{balance}",
            status
        ])
    
    # Create PDF
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.white, alignment=TA_CENTER)
    company_name, tagline = await get_company_name()
    title_data = [[Paragraph(f"<b>TRUCK PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}</b>", title_style)]]
    title_table = Table(title_data, colWidths=[page_width - 20*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(title_table)
    elements.append(Table([[""]], colWidths=[page_width], rowHeights=[5*mm]))
    
    # Headers
    headers = ["Date", "Truck No", "Mandi", "QNTL", "Rate", "Gross", "Deduct", "Net", "Paid", "Balance", "Status"]
    table_data = [headers] + payments_data
    
    # Totals
    table_data.append(["TOTAL", "", "", "", "", "", "", f"Rs.{round(total_net, 2)}", f"Rs.{round(total_paid, 2)}", f"Rs.{round(total_balance, 2)}", ""])
    
    col_widths = [18*mm, 22*mm, 22*mm, 14*mm, 12*mm, 16*mm, 16*mm, 18*mm, 16*mm, 18*mm, 14*mm]
    main_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    
    # Alternating rows and status colors
    for i in range(1, len(table_data) - 1):
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F8FAFC')))
        if payments_data[i-1][-1] == "Paid":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#D1FAE5')))
        elif payments_data[i-1][-1] == "Pending":
            style_commands.append(('BACKGROUND', (-1, i), (-1, i), colors.HexColor('#FEE2E2')))
    
    main_table.setStyle(TableStyle(style_commands))
    elements.append(main_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"truck_payments_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/entries/bulk-delete")
async def bulk_delete_entries(entry_ids: List[str], username: str = "", role: str = ""):
    """Bulk delete entries"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can bulk delete")
    
    result = await db.mill_entries.delete_many({"id": {"$in": entry_ids}})
    return {"message": f"{result.deleted_count} entries deleted successfully", "deleted_count": result.deleted_count}


# ============ MANDI TARGET ENDPOINTS ============

@router.get("/mandi-targets", response_model=List[MandiTarget])
async def get_mandi_targets(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get all mandi targets"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).sort("mandi_name", 1).to_list(100)
    return targets


@router.post("/mandi-targets", response_model=MandiTarget)
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
        base_rate=input.base_rate,
        cutting_rate=input.cutting_rate,
        kms_year=input.kms_year,
        season=input.season,
        created_by=username
    )
    
    doc = target_obj.model_dump()
    await db.mandi_targets.insert_one(doc)
    return target_obj


@router.put("/mandi-targets/{target_id}", response_model=MandiTarget)
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


@router.delete("/mandi-targets/{target_id}")
async def delete_mandi_target(target_id: str, username: str = "", role: str = ""):
    """Delete a mandi target (Admin only)"""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin target delete kar sakta hai")
    
    result = await db.mandi_targets.delete_one({"id": target_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"message": "Target deleted successfully"}


@router.get("/mandi-targets/summary", response_model=List[MandiTargetSummary])
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
        
        # Calculate agent payment amounts
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        target_amount = round(target_qntl * base_rate, 2)
        cutting_amount = round(cutting_qntl * cutting_rate, 2)
        total_agent_amount = round(target_amount + cutting_amount, 2)
        
        summaries.append(MandiTargetSummary(
            id=target["id"],
            mandi_name=target["mandi_name"],
            target_qntl=target_qntl,
            cutting_percent=target["cutting_percent"],
            expected_total=expected_total,
            achieved_qntl=achieved_qntl,
            pending_qntl=pending_qntl,
            progress_percent=progress_percent,
            base_rate=base_rate,
            cutting_rate=cutting_rate,
            target_amount=target_amount,
            cutting_qntl=cutting_qntl,
            cutting_amount=cutting_amount,
            total_agent_amount=total_agent_amount,
            kms_year=target["kms_year"],
            season=target["season"]
        ))
    
    return summaries


# ============ DASHBOARD ENDPOINTS ============

@router.get("/dashboard/agent-totals")
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


@router.get("/dashboard/date-range-totals")
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


