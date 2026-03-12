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

@router.get("/dashboard/monthly-trend")
async def get_monthly_trend(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Get monthly totals for trend chart"""
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
            "$addFields": {
                "month": {"$substr": ["$date", 0, 7]}  # Extract YYYY-MM
            }
        },
        {
            "$group": {
                "_id": "$month",
                "total_qntl": {"$sum": "$qntl"},
                "total_final_w_kg": {"$sum": "$final_w"},
                "total_entries": {"$sum": 1},
                "total_bag": {"$sum": "$bag"}
            }
        },
        {"$sort": {"_id": 1}}
    ])
    
    results = await db.mill_entries.aggregate(pipeline).to_list(12)
    
    monthly_data = []
    for r in results:
        if r["_id"]:
            monthly_data.append({
                "month": r["_id"],
                "total_qntl": round(r["total_qntl"], 2),
                "total_final_w": round(r["total_final_w_kg"] / 100, 2),
                "total_entries": r["total_entries"],
                "total_bag": r["total_bag"]
            })
    
    return {"monthly_data": monthly_data}


@router.get("/export/dashboard-pdf")
async def export_dashboard_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, filter: Optional[str] = None):
    """Export Dashboard PDF with optional filter (all, stock, or mandi_name)"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.enums import TA_CENTER, TA_LEFT

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    show_stock = (not filter) or filter == "all" or filter == "stock"
    show_targets = (not filter) or filter != "stock"
    target_mandi = filter if filter and filter not in ("all", "stock") else None

    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    elements = []; styles = getSampleStyleSheet()

    title_style = ParagraphStyle('DashTitle', parent=styles['Heading1'], fontSize=16, textColor=colors.white, alignment=TA_CENTER)
    section_style = ParagraphStyle('DashSection', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#D97706'), alignment=TA_LEFT, spaceBefore=10, spaceAfter=5)
    normal = styles['Normal']

    # Title
    filter_label = "All" if not filter or filter == "all" else filter.title()
    title_data = [[Paragraph(f"<b>NAVKAR AGRO - Dashboard Report ({filter_label})</b>", title_style)]]
    title_table = RLTable(title_data, colWidths=[page_width - 20*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(title_table)
    sub_style = ParagraphStyle('DashSub', parent=normal, fontSize=10, textColor=colors.HexColor('#475569'), alignment=TA_CENTER)
    elements.append(Paragraph(f"KMS: {kms_year or 'All'} | Season: {season or 'All'} | Filter: {filter_label} | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}", sub_style))
    elements.append(Spacer(1, 8*mm))

    # STOCK SECTION
    if show_stock:
        elements.append(Paragraph("STOCK OVERVIEW", section_style))

        # Paddy Stock
        pipe_paddy_in = [{"$match": query}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
        mill_res = await db.mill_entries.aggregate(pipe_paddy_in).to_list(1)
        cmr_paddy = round((mill_res[0]["total"] / 100) if mill_res else 0, 2)

        pvt_paddy_q = dict(query)
        pvt_paddy_entries = await db.private_paddy.find(pvt_paddy_q, {"_id": 0}).to_list(5000)
        pvt_paddy = round(sum(e.get("net_weight", 0) for e in pvt_paddy_entries) / 100, 2)

        milling_q = dict(query)
        milling_entries = await db.milling_entries.find(milling_q, {"_id": 0}).to_list(5000)
        paddy_used = round(sum(e.get("paddy_used", 0) for e in milling_entries), 2)

        total_paddy_in = round(cmr_paddy + pvt_paddy, 2)
        paddy_avail = round(total_paddy_in - paddy_used, 2)

        # Rice stock
        rice_produced = round(sum(e.get("rice_produced", 0) for e in milling_entries), 2)

        stock_data = [
            ["Item", "In (Qntl)", "Used/Out (Qntl)", "Available (Qntl)"],
            ["Paddy (CMR)", str(cmr_paddy), "-", "-"],
            ["Paddy (Pvt)", str(pvt_paddy), "-", "-"],
            ["Total Paddy", str(total_paddy_in), str(paddy_used), str(paddy_avail)],
            ["Rice (Milling)", str(rice_produced), "-", "-"],
        ]
        stock_table = RLTable(stock_data, colWidths=[50*mm, 40*mm, 40*mm, 40*mm])
        stock_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 3), (-1, 3), 'Helvetica-Bold'), ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor('#f0f0f0')),
        ]))
        elements.append(stock_table)
        elements.append(Spacer(1, 8*mm))

    # TARGETS SECTION
    if show_targets:
        elements.append(Paragraph(f"MANDI TARGETS{' - ' + target_mandi if target_mandi else ''}", section_style))

        tq = dict(query)
        if target_mandi: tq["mandi_name"] = target_mandi
        targets = await db.mandi_targets.find(tq, {"_id": 0}).to_list(100)

        if targets:
            target_headers = ["Mandi", "Target QNTL", "Cut %", "Expected", "Achieved", "Pending", "Progress"]
            target_data = [target_headers]
            total_target = total_expected = total_achieved = total_pending = 0

            for t in targets:
                entry_q = {"mandi_name": t["mandi_name"]}
                if kms_year: entry_q["kms_year"] = kms_year
                if season: entry_q["season"] = season
                pipe = [{"$match": entry_q}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
                res = await db.mill_entries.aggregate(pipe).to_list(1)
                achieved = round(res[0]["total"] / 100, 2) if res else 0
                expected = t.get("expected_total", t["target_qntl"])
                pending = round(max(0, expected - achieved), 2)
                progress = round((achieved / expected * 100) if expected > 0 else 0, 1)

                total_target += t["target_qntl"]
                total_expected += expected
                total_achieved += achieved
                total_pending += pending

                target_data.append([t["mandi_name"], str(t["target_qntl"]), f"{t['cutting_percent']}%", str(expected), str(achieved), str(pending), f"{progress}%"])

            # Totals row
            total_progress = round((total_achieved / total_expected * 100) if total_expected > 0 else 0, 1)
            target_data.append(["TOTAL", str(round(total_target, 2)), "-", str(round(total_expected, 2)), str(round(total_achieved, 2)), str(round(total_pending, 2)), f"{total_progress}%"])

            target_table = RLTable(target_data, colWidths=[40*mm, 30*mm, 18*mm, 30*mm, 30*mm, 30*mm, 22*mm])
            st = [
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'), ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0f0f0')),
            ]
            # Highlight progress > 100% in green, < 50% in red
            for i, t2 in enumerate(targets, 1):
                prog_str = target_data[i][6]
                prog_val = float(prog_str.replace('%',''))
                if prog_val >= 100:
                    st.append(('TEXTCOLOR', (6, i), (6, i), colors.HexColor('#059669')))
                elif prog_val < 50:
                    st.append(('TEXTCOLOR', (6, i), (6, i), colors.red))

            target_table.setStyle(TableStyle(st))
            elements.append(target_table)
        else:
            elements.append(Paragraph("Koi target set nahi hai", normal))

    doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=dashboard_{filter_label}_{datetime.now().strftime('%Y%m%d')}.pdf"})


@router.get("/export/summary-report-pdf")
async def export_summary_report_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Export complete summary report - Truck Payments + Agent Payments + Targets"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, textColor=colors.white, alignment=TA_CENTER)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#D97706'), alignment=TA_LEFT, spaceBefore=10, spaceAfter=5)
    
    # Main Title
    title_data = [[Paragraph("<b>NAVKAR AGRO - COMPLETE SUMMARY REPORT</b>", title_style)]]
    title_table = Table(title_data, colWidths=[page_width - 20*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D97706')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(title_table)
    
    # Subtitle
    sub_style = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#475569'), alignment=TA_CENTER)
    elements.append(Paragraph(f"KMS Year: {kms_year or 'All'} | Season: {season or 'All'} | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}", sub_style))
    elements.append(Spacer(1, 10*mm))
    
    # ============ SECTION 1: MANDI TARGETS ============
    elements.append(Paragraph("MANDI TARGETS", section_style))
    
    targets = await db.mandi_targets.find(query, {"_id": 0}).to_list(100)
    if targets:
        target_headers = ["Mandi", "Target QNTL", "Cut %", "Expected", "Achieved", "Pending", "Progress"]
        target_data = [target_headers]
        
        for t in targets:
            entry_q = {"mandi_name": t["mandi_name"], "kms_year": t["kms_year"], "season": t["season"]}
            pipe = [{"$match": entry_q}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
            res = await db.mill_entries.aggregate(pipe).to_list(1)
            achieved = round(res[0]["total"] / 100, 2) if res else 0
            expected = t["expected_total"]
            pending = round(max(0, expected - achieved), 2)
            progress = round((achieved / expected * 100) if expected > 0 else 0, 1)
            
            target_data.append([
                t["mandi_name"],
                str(t["target_qntl"]),
                f"{t['cutting_percent']}%",
                str(expected),
                str(achieved),
                str(pending),
                f"{progress}%"
            ])
        
        target_table = Table(target_data, colWidths=[35*mm, 25*mm, 18*mm, 25*mm, 25*mm, 25*mm, 22*mm])
        target_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ]))
        elements.append(target_table)
    else:
        elements.append(Paragraph("No targets set", styles['Normal']))
    
    elements.append(Spacer(1, 8*mm))
    
    # ============ SECTION 2: TRUCK PAYMENTS SUMMARY ============
    elements.append(Paragraph("TRUCK PAYMENTS (BHADA)", section_style))
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    truck_total_net = 0
    truck_total_paid = 0
    truck_total_balance = 0
    truck_data_rows = []
    
    for entry in entries:
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        cash = entry.get("cash_paid", 0) or 0
        diesel = entry.get("diesel_paid", 0) or 0
        gross = round(final_qntl * rate, 2)
        net = round(gross - cash - diesel, 2)
        balance = round(max(0, net - paid), 2)
        status = "Paid" if balance < 0.10 else "Pending"
        
        truck_total_net += net
        truck_total_paid += paid
        truck_total_balance += balance
        
        truck_data_rows.append([
            entry.get("date", "")[:10],
            entry.get("truck_no", "")[:12],
            entry.get("mandi_name", "")[:12],
            f"{final_qntl}",
            f"Rs.{net}",
            f"Rs.{paid}",
            f"Rs.{balance}",
            status
        ])
    
    if truck_data_rows:
        truck_headers = ["Date", "Truck No", "Mandi", "QNTL", "Net Amt", "Paid", "Balance", "Status"]
        truck_table_data = [truck_headers] + truck_data_rows
        truck_table_data.append(["TOTAL", "", "", "", f"Rs.{round(truck_total_net, 2)}", f"Rs.{round(truck_total_paid, 2)}", f"Rs.{round(truck_total_balance, 2)}", ""])
        
        truck_table = Table(truck_table_data, colWidths=[20*mm, 25*mm, 25*mm, 18*mm, 25*mm, 22*mm, 22*mm, 18*mm])
        truck_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))
        elements.append(truck_table)
    
    elements.append(Spacer(1, 8*mm))
    
    # ============ SECTION 3: AGENT PAYMENTS SUMMARY ============
    elements.append(Paragraph("AGENT/MANDI PAYMENTS", section_style))
    
    agent_total_amt = 0
    agent_total_paid = 0
    agent_total_balance = 0
    agent_data_rows = []
    
    for target in targets:
        mandi = target["mandi_name"]
        target_qntl = target["target_qntl"]
        cutting_qntl = round(target_qntl * target["cutting_percent"] / 100, 2)
        base_rate = target.get("base_rate", 10)
        cutting_rate = target.get("cutting_rate", 5)
        total_amt = round((target_qntl * base_rate) + (cutting_qntl * cutting_rate), 2)
        
        payment_doc = await db.agent_payments.find_one({"mandi_name": mandi, "kms_year": target["kms_year"], "season": target["season"]}, {"_id": 0})
        paid = payment_doc.get("paid_amount", 0) if payment_doc else 0
        balance = round(max(0, total_amt - paid), 2)
        status = "Paid" if balance <= 0 else "Pending"
        
        agent_total_amt += total_amt
        agent_total_paid += paid
        agent_total_balance += balance
        
        agent_data_rows.append([
            mandi,
            f"{target_qntl}",
            f"{cutting_qntl}",
            f"Rs.{base_rate}/Rs.{cutting_rate}",
            f"Rs.{total_amt}",
            f"Rs.{paid}",
            f"Rs.{balance}",
            status
        ])
    
    if agent_data_rows:
        agent_headers = ["Mandi", "Target", "Cutting", "Rates", "Total Amt", "Paid", "Balance", "Status"]
        agent_table_data = [agent_headers] + agent_data_rows
        agent_table_data.append(["TOTAL", "", "", "", f"Rs.{round(agent_total_amt, 2)}", f"Rs.{round(agent_total_paid, 2)}", f"Rs.{round(agent_total_balance, 2)}", ""])
        
        agent_table = Table(agent_table_data, colWidths=[30*mm, 20*mm, 20*mm, 30*mm, 25*mm, 22*mm, 22*mm, 18*mm])
        agent_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]))
        elements.append(agent_table)
    
    elements.append(Spacer(1, 8*mm))
    
    # ============ GRAND TOTAL ============
    elements.append(Paragraph("GRAND TOTAL", section_style))
    
    grand_total_amt = truck_total_net + agent_total_amt
    grand_total_paid = truck_total_paid + agent_total_paid
    grand_total_balance = truck_total_balance + agent_total_balance
    
    grand_data = [
        ["", "Total Amount", "Paid", "Balance"],
        ["Truck Payments", f"Rs.{round(truck_total_net, 2)}", f"Rs.{round(truck_total_paid, 2)}", f"Rs.{round(truck_total_balance, 2)}"],
        ["Agent Payments", f"Rs.{round(agent_total_amt, 2)}", f"Rs.{round(agent_total_paid, 2)}", f"Rs.{round(agent_total_balance, 2)}"],
        ["GRAND TOTAL", f"Rs.{round(grand_total_amt, 2)}", f"Rs.{round(grand_total_paid, 2)}", f"Rs.{round(grand_total_balance, 2)}"]
    ]
    
    grand_table = Table(grand_data, colWidths=[50*mm, 40*mm, 40*mm, 40*mm])
    grand_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#D97706')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(grand_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"summary_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/truck-owner-excel")
async def export_truck_owner_excel(
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck owner consolidated payments to Excel"""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Group by truck_no
    truck_data = {}
    for entry in entries:
        truck_no = entry.get("truck_no", "Unknown")
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        
        if truck_no not in truck_data:
            truck_data[truck_no] = {
                "truck_no": truck_no,
                "trips": 0,
                "total_qntl": 0,
                "total_gross": 0,
                "total_deductions": 0,
                "total_net": 0,
                "total_paid": 0,
                "total_balance": 0
            }
        
        truck_data[truck_no]["trips"] += 1
        truck_data[truck_no]["total_qntl"] += final_qntl
        truck_data[truck_no]["total_gross"] += gross_amount
        truck_data[truck_no]["total_deductions"] += deductions
        truck_data[truck_no]["total_net"] += net_amount
        truck_data[truck_no]["total_paid"] += paid_amount
        truck_data[truck_no]["total_balance"] += balance
    
    consolidated = list(truck_data.values())
    
    # Create Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Truck Owner Payments"
    
    # Styles
    header_fill = PatternFill(start_color="0891B2", end_color="0891B2", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    total_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    
    # Title
    ws.merge_cells('A1:I1')
    company_name, tagline = await get_company_name()
    ws['A1'] = f"TRUCK OWNER CONSOLIDATED PAYMENTS - {company_name} | KMS: {kms_year or 'All'} | {season or 'All'}"
    ws['A1'].font = Font(bold=True, size=14, color="0891B2")
    ws['A1'].alignment = Alignment(horizontal='center')
    
    ws.merge_cells('A2:I2')
    ws['A2'] = "Ek truck ke saare trips ka combined payment"
    ws['A2'].font = Font(size=10, color="666666")
    ws['A2'].alignment = Alignment(horizontal='center')
    
    # Headers
    headers = ["Truck No", "Total Trips", "Total QNTL", "Gross Amount", "Deductions", "Net Payable", "Paid", "Balance", "Status"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    grand_net = 0
    grand_paid = 0
    grand_balance = 0
    
    for row_idx, t in enumerate(consolidated, 5):
        status = "Paid" if t["total_balance"] < 0.10 else ("Partial" if t["total_paid"] > 0 else "Pending")
        
        ws.cell(row=row_idx, column=1, value=t["truck_no"]).font = Font(bold=True, size=11)
        ws.cell(row=row_idx, column=2, value=t["trips"]).alignment = Alignment(horizontal='center')
        ws.cell(row=row_idx, column=3, value=round(t["total_qntl"], 2))
        ws.cell(row=row_idx, column=4, value=round(t["total_gross"], 2))
        ws.cell(row=row_idx, column=5, value=round(t["total_deductions"], 2))
        ws.cell(row=row_idx, column=6, value=round(t["total_net"], 2)).font = Font(bold=True)
        ws.cell(row=row_idx, column=7, value=round(t["total_paid"], 2))
        ws.cell(row=row_idx, column=8, value=round(t["total_balance"], 2)).font = Font(bold=True, color="DC2626" if t["total_balance"] > 0 else "059669")
        ws.cell(row=row_idx, column=9, value=status)
        
        grand_net += t["total_net"]
        grand_paid += t["total_paid"]
        grand_balance += t["total_balance"]
    
    # Grand Total row
    total_row = len(consolidated) + 5
    ws.cell(row=total_row, column=1, value="GRAND TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=2, value=len(consolidated)).alignment = Alignment(horizontal='center')
    ws.cell(row=total_row, column=6, value=round(grand_net, 2)).font = Font(bold=True)
    ws.cell(row=total_row, column=7, value=round(grand_paid, 2)).font = Font(bold=True, color="059669")
    ws.cell(row=total_row, column=8, value=round(grand_balance, 2)).font = Font(bold=True, color="DC2626")
    
    for col in range(1, 10):
        ws.cell(row=total_row, column=col).fill = total_fill
    
    # Column widths
    widths = [15, 12, 12, 14, 12, 14, 12, 12, 10]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"truck_owner_consolidated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/truck-owner-pdf")
async def export_truck_owner_pdf(
    kms_year: Optional[str] = None,
    season: Optional[str] = None
):
    """Export truck owner consolidated payments to PDF"""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Group by truck_no
    truck_data = {}
    for entry in entries:
        truck_no = entry.get("truck_no", "Unknown")
        entry_id = entry.get("id")
        payment_doc = await db.truck_payments.find_one({"entry_id": entry_id}, {"_id": 0})
        
        rate = payment_doc.get("rate_per_qntl", 32) if payment_doc else 32
        paid_amount = payment_doc.get("paid_amount", 0) if payment_doc else 0
        
        final_qntl = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        cash_taken = entry.get("cash_paid", 0) or 0
        diesel_taken = entry.get("diesel_paid", 0) or 0
        
        gross_amount = round(final_qntl * rate, 2)
        deductions = cash_taken + diesel_taken
        net_amount = round(gross_amount - deductions, 2)
        balance = round(max(0, net_amount - paid_amount), 2)
        
        if truck_no not in truck_data:
            truck_data[truck_no] = {
                "truck_no": truck_no,
                "trips": 0,
                "total_qntl": 0,
                "total_gross": 0,
                "total_deductions": 0,
                "total_net": 0,
                "total_paid": 0,
                "total_balance": 0
            }
        
        truck_data[truck_no]["trips"] += 1
        truck_data[truck_no]["total_qntl"] += final_qntl
        truck_data[truck_no]["total_gross"] += gross_amount
        truck_data[truck_no]["total_deductions"] += deductions
        truck_data[truck_no]["total_net"] += net_amount
        truck_data[truck_no]["total_paid"] += paid_amount
        truck_data[truck_no]["total_balance"] += balance
    
    consolidated = list(truck_data.values())
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), topMargin=30, bottomMargin=30)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#0891B2'), alignment=1)
    company_name, tagline = await get_company_name()
    elements.append(Paragraph(f"TRUCK OWNER CONSOLIDATED PAYMENTS - {company_name}", title_style))
    elements.append(Paragraph(f"{company_name} - {tagline}", ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=10, alignment=1)))
    elements.append(Paragraph(f"KMS Year: {kms_year or 'All'} | Season: {season or 'All'} | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}", ParagraphStyle('Info', parent=styles['Normal'], fontSize=9, alignment=1, textColor=colors.gray)))
    elements.append(Spacer(1, 20))
    
    # Table
    table_data = [["Truck No", "Trips", "Total QNTL", "Gross", "Deductions", "Net Payable", "Paid", "Balance", "Status"]]
    
    grand_net = 0
    grand_paid = 0
    grand_balance = 0
    
    for t in consolidated:
        status = "PAID" if t["total_balance"] < 0.10 else ("PARTIAL" if t["total_paid"] > 0 else "PENDING")
        table_data.append([
            t["truck_no"],
            str(t["trips"]),
            f"{t['total_qntl']:.2f}",
            f"Rs.{t['total_gross']:.0f}",
            f"Rs.{t['total_deductions']:.0f}",
            f"Rs.{t['total_net']:.0f}",
            f"Rs.{t['total_paid']:.0f}",
            f"Rs.{t['total_balance']:.0f}",
            status
        ])
        grand_net += t["total_net"]
        grand_paid += t["total_paid"]
        grand_balance += t["total_balance"]
    
    # Grand Total
    table_data.append([
        "GRAND TOTAL",
        str(len(consolidated)),
        "",
        "",
        "",
        f"Rs.{grand_net:.0f}",
        f"Rs.{grand_paid:.0f}",
        f"Rs.{grand_balance:.0f}",
        ""
    ])
    
    table = Table(table_data, colWidths=[80, 50, 70, 70, 70, 80, 70, 70, 60])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0891B2')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(table)
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"truck_owner_consolidated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


