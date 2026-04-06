from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from database import db, USERS, print_pages
from models import *
from utils.date_format import fmt_date
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
    from reportlab.lib.pagesizes import A4
    from utils.export_helpers import get_pdf_styles; from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    show_stock = (not filter) or filter == "all" or filter == "stock"
    show_targets = (not filter) or filter != "stock"
    target_mandi = filter if filter and filter not in ("all", "stock") else None

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=15*mm, bottomMargin=15*mm)
    elements = []; styles = get_pdf_styles()
    pw = A4[0] - 30*mm  # page width minus margins

    from utils.branding_helper import get_pdf_company_header_from_db
    elements.extend(await get_pdf_company_header_from_db())
    company, tagline = await get_company_name()
    filter_label = "All" if not filter or filter == "all" else ("Stock Only" if filter == "stock" else filter)

    # Sub-header
    sub = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#475569'), alignment=TA_CENTER)
    elements.append(Paragraph(f"{tagline}", sub))
    elements.append(Paragraph(f"Dashboard Report | FY: {kms_year or 'All'} | Season: {season or 'All'} | Filter: {filter_label} | {datetime.now().strftime('%d-%m-%Y %H:%M')}", sub))
    elements.append(Spacer(1, 6*mm))

    sec = ParagraphStyle('Sec', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#1a365d'), spaceBefore=8, spaceAfter=4, borderWidth=0, borderPadding=0)
    hdr_bg = colors.HexColor('#1a365d')
    hdr_fg = colors.white
    tot_bg = colors.HexColor('#e2e8f0')

    # ---- STOCK SECTION ----
    if show_stock:
        elements.append(Paragraph("STOCK OVERVIEW", sec))

        # Paddy
        pipe = [{"$match": query}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
        mill_res = await db.mill_entries.aggregate(pipe).to_list(1)
        cmr_paddy = round((mill_res[0]["total"] / 100) if mill_res else 0, 2)

        pvt_query = dict(query)
        pvt_query["source"] = {"$ne": "agent_extra"}
        pvt_entries = await db.private_paddy.find(pvt_query, {"_id": 0, "qntl": 1, "bag": 1}).to_list(5000)
        pvt_paddy = round(sum(e.get("qntl", 0) - e.get("bag", 0) / 100 for e in pvt_entries), 2)

        milling_entries = await db.milling_entries.find(dict(query), {"_id": 0}).to_list(5000)
        paddy_used = round(sum(e.get("paddy_used", 0) for e in milling_entries), 2)
        rice_raw = round(sum(e.get("rice_produced", 0) for e in milling_entries if e.get("product_type") in ("raw", None)), 2)
        rice_usna = round(sum(e.get("rice_produced", 0) for e in milling_entries if e.get("product_type") == "usna"), 2)
        frk = round(sum(e.get("frk_produced", 0) or 0 for e in milling_entries), 2)
        byproduct = round(sum(e.get("byproduct_produced", 0) or 0 for e in milling_entries), 2)

        total_paddy_in = round(cmr_paddy + pvt_paddy, 2)
        paddy_avail = round(total_paddy_in - paddy_used, 2)

        # Gunny bags
        gunny_entries = await db.gunny_bags.find(dict(query), {"_id": 0}).to_list(5000)
        gunny_in = sum(e.get('quantity', 0) for e in gunny_entries if e.get('txn_type') == 'in')
        gunny_out = sum(e.get('quantity', 0) for e in gunny_entries if e.get('txn_type') == 'out')

        data = [
            ["Item", "Source", "IN", "OUT/Used", "Available", "Unit"],
            ["Paddy", "CMR (Mill Entry)", str(cmr_paddy), "-", "-", "Qntl"],
            ["Paddy", "Private Purchase", str(pvt_paddy), "-", "-", "Qntl"],
            ["Paddy Total", "", str(total_paddy_in), str(paddy_used), str(paddy_avail), "Qntl"],
            ["Rice (Raw)", "Milling", str(rice_raw), "-", str(rice_raw), "Qntl"],
            ["Rice (Usna)", "Milling", str(rice_usna), "-", str(rice_usna), "Qntl"],
            ["FRK", "Milling", str(frk), "-", str(frk), "Qntl"],
            ["By-Products", "Milling", str(byproduct), "-", str(byproduct), "Qntl"],
            ["Gunny Bags", "All Sources", str(gunny_in), str(gunny_out), str(gunny_in - gunny_out), "Bags"],
        ]
        cw = [30*mm, 30*mm, 25*mm, 25*mm, 30*mm, 18*mm]
        t = RLTable(data, colWidths=cw, repeatRows=1)
        st = [
            ('BACKGROUND', (0, 0), (-1, 0), hdr_bg), ('TEXTCOLOR', (0, 0), (-1, 0), hdr_fg),
            ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 3), (-1, 3), 'FreeSansBold'), ('BACKGROUND', (0, 3), (-1, 3), tot_bg),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]
        t.setStyle(TableStyle(st))
        elements.append(t)
        elements.append(Spacer(1, 6*mm))

    # ---- TARGETS SECTION ----
    if show_targets:
        elements.append(Paragraph(f"MANDI TARGETS{' - ' + target_mandi if target_mandi else ''}", sec))
        tq = {}
        if target_mandi: tq["mandi_name"] = target_mandi
        if kms_year: tq["kms_year"] = kms_year
        if season: tq["season"] = season
        targets = await db.mandi_targets.find(tq, {"_id": 0}).to_list(100)
        # Fallback: if no targets found with strict filter, try without kms/season
        if not targets and (kms_year or season):
            tq2 = {}
            if target_mandi: tq2["mandi_name"] = target_mandi
            targets = await db.mandi_targets.find(tq2, {"_id": 0}).to_list(100)

        if targets:
            data = [["Mandi", "Target (Q)", "Cut %", "Expected (Q)", "Achieved (Q)", "Pending (Q)", "Progress", "Agent Amt"]]
            tot = {"target": 0, "expected": 0, "achieved": 0, "pending": 0, "agent": 0}
            for t in targets:
                eq = {"mandi_name": t["mandi_name"]}
                if kms_year: eq["kms_year"] = kms_year
                if season: eq["season"] = season
                pipe = [{"$match": eq}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
                res = await db.mill_entries.aggregate(pipe).to_list(1)
                achieved = round(res[0]["total"] / 100, 2) if res else 0
                expected = t.get("expected_total", t["target_qntl"])
                pending = round(max(0, expected - achieved), 2)
                progress = round((achieved / expected * 100) if expected > 0 else 0, 1)
                cutting_q = round(t["target_qntl"] * t["cutting_percent"] / 100, 2)
                agent_amt = round((t["target_qntl"] * t.get("base_rate", 10)) + (cutting_q * t.get("cutting_rate", 5)), 2)

                tot["target"] += t["target_qntl"]; tot["expected"] += expected
                tot["achieved"] += achieved; tot["pending"] += pending; tot["agent"] += agent_amt

                data.append([t["mandi_name"], str(t["target_qntl"]), f"{t['cutting_percent']}%",
                    str(expected), str(achieved), str(pending), f"{progress}%", f"Rs.{agent_amt:,.0f}"])

            tot_prog = round((tot["achieved"] / tot["expected"] * 100) if tot["expected"] > 0 else 0, 1)
            data.append(["TOTAL", str(round(tot["target"], 2)), "-", str(round(tot["expected"], 2)),
                str(round(tot["achieved"], 2)), str(round(tot["pending"], 2)), f"{tot_prog}%", f"Rs.{tot['agent']:,.0f}"])

            cw = [25*mm, 20*mm, 14*mm, 22*mm, 22*mm, 22*mm, 18*mm, 22*mm]
            t = RLTable(data, colWidths=cw, repeatRows=1)
            st = [
                ('BACKGROUND', (0, 0), (-1, 0), hdr_bg), ('TEXTCOLOR', (0, 0), (-1, 0), hdr_fg),
                ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
                ('FONTNAME', (0, -1), (-1, -1), 'FreeSansBold'), ('BACKGROUND', (0, -1), (-1, -1), tot_bg),
                ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]
            for i, tgt in enumerate(targets, 1):
                prog_val = float(data[i][6].replace('%', ''))
                if prog_val >= 100:
                    st.append(('TEXTCOLOR', (6, i), (6, i), colors.HexColor('#059669')))
                elif prog_val < 50:
                    st.append(('TEXTCOLOR', (6, i), (6, i), colors.red))
            t.setStyle(TableStyle(st))
            elements.append(t)
        else:
            elements.append(Paragraph("Koi target set nahi hai", styles['Normal']))

    # Footer
    elements.append(Spacer(1, 10*mm))
    ft = ParagraphStyle('Ft', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#94a3b8'), alignment=TA_CENTER)
    elements.append(Paragraph(f"Generated by {company} Mill Entry System | {datetime.now().strftime('%d-%m-%Y %H:%M')}", ft))

    doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=dashboard_{filter_label}_{datetime.now().strftime('%Y%m%d')}.pdf"})


@router.get("/export/summary-report-pdf")
async def export_summary_report_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Export complete summary report - Stock + Targets + Truck + Agent Payments + Grand Total"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from utils.export_helpers import get_pdf_styles; from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
    pw = A4[0] - 24*mm
    elements = []; styles = get_pdf_styles()

    from utils.branding_helper import get_pdf_company_header_from_db
    elements.extend(await get_pdf_company_header_from_db())
    company, tagline = await get_company_name()
    hdr_bg = colors.HexColor('#1a365d')
    hdr_fg = colors.white
    tot_bg = colors.HexColor('#e2e8f0')
    amber_bg = colors.HexColor('#D97706')

    sec = ParagraphStyle('Sec', parent=styles['Heading2'], fontSize=11, textColor=colors.HexColor('#1a365d'), spaceBefore=8, spaceAfter=4)
    sub = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#475569'), alignment=TA_CENTER)
    ft = ParagraphStyle('Ft', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#94a3b8'), alignment=TA_CENTER)

    # ---- HEADER ----
    ht = Table([[Paragraph(f"<b>{company} - COMPLETE SUMMARY REPORT</b>", ParagraphStyle('H', parent=styles['Heading1'], fontSize=16, textColor=colors.white, alignment=TA_CENTER))]], colWidths=[pw])
    ht.setStyle(TableStyle([('FONTNAME', (0,0), (-1,-1), 'FreeSans'), ('BACKGROUND', (0, 0), (-1, -1), amber_bg), ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 10)]))
    elements.append(ht)
    elements.append(Paragraph(f"{tagline}", sub))
    elements.append(Paragraph(f"FY: {kms_year or 'All'} | Season: {season or 'All'} | {datetime.now().strftime('%d-%m-%Y %H:%M')}", sub))
    elements.append(Spacer(1, 5*mm))

    # ---- SECTION 1: STOCK ----
    elements.append(Paragraph("1. STOCK OVERVIEW", sec))

    pipe = [{"$match": query}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
    mill_res = await db.mill_entries.aggregate(pipe).to_list(1)
    cmr_paddy = round((mill_res[0]["total"] / 100) if mill_res else 0, 2)
    pvt_query_exp = dict(query)
    pvt_query_exp["source"] = {"$ne": "agent_extra"}
    pvt_entries = await db.private_paddy.find(pvt_query_exp, {"_id": 0, "qntl": 1, "bag": 1}).to_list(5000)
    pvt_paddy = round(sum(e.get("qntl", 0) - e.get("bag", 0) / 100 for e in pvt_entries), 2)
    milling_entries = await db.milling_entries.find(dict(query), {"_id": 0}).to_list(5000)
    paddy_used = round(sum(e.get("paddy_used", 0) for e in milling_entries), 2)
    rice_raw = round(sum(e.get("rice_produced", 0) for e in milling_entries if e.get("product_type") in ("raw", None)), 2)
    rice_usna = round(sum(e.get("rice_produced", 0) for e in milling_entries if e.get("product_type") == "usna"), 2)
    frk = round(sum(e.get("frk_produced", 0) or 0 for e in milling_entries), 2)
    gunny_e = await db.gunny_bags.find(dict(query), {"_id": 0}).to_list(5000)
    gunny_in = sum(e.get('quantity', 0) for e in gunny_e if e.get('txn_type') == 'in')
    gunny_out = sum(e.get('quantity', 0) for e in gunny_e if e.get('txn_type') == 'out')

    stock_data = [
        ["Item", "IN", "OUT/Used", "Available", "Unit"],
        ["Paddy (CMR)", str(cmr_paddy), "-", "-", "Qntl"],
        ["Paddy (Pvt)", str(pvt_paddy), "-", "-", "Qntl"],
        ["Total Paddy", str(round(cmr_paddy + pvt_paddy, 2)), str(paddy_used), str(round(cmr_paddy + pvt_paddy - paddy_used, 2)), "Qntl"],
        ["Rice (Raw)", str(rice_raw), "-", str(rice_raw), "Qntl"],
        ["Rice (Usna)", str(rice_usna), "-", str(rice_usna), "Qntl"],
        ["FRK", str(frk), "-", str(frk), "Qntl"],
        ["Gunny Bags", str(gunny_in), str(gunny_out), str(gunny_in - gunny_out), "Bags"],
    ]
    st = Table(stock_data, colWidths=[35*mm, 28*mm, 28*mm, 30*mm, 18*mm])
    st.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), hdr_bg), ('TEXTCOLOR', (0, 0), (-1, 0), hdr_fg),
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 3), (-1, 3), 'FreeSansBold'), ('BACKGROUND', (0, 3), (-1, 3), tot_bg),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(st)
    elements.append(Spacer(1, 5*mm))

    # ---- SECTION 2: MANDI TARGETS ----
    elements.append(Paragraph("2. MANDI TARGETS", sec))
    tq = {}
    if kms_year: tq["kms_year"] = kms_year
    if season: tq["season"] = season
    targets = await db.mandi_targets.find(tq, {"_id": 0}).to_list(100)
    # Fallback: if no targets found with strict filter, try without kms/season
    if not targets and (kms_year or season):
        targets = await db.mandi_targets.find({}, {"_id": 0}).to_list(100)
    if targets:
        tdata = [["Mandi", "Target (Q)", "Cut %", "Expected (Q)", "Achieved (Q)", "Pending (Q)", "Progress"]]
        tot = {"t": 0, "e": 0, "a": 0, "p": 0}
        for t in targets:
            eq = {"mandi_name": t["mandi_name"]}
            if kms_year: eq["kms_year"] = kms_year
            if season: eq["season"] = season
            pipe2 = [{"$match": eq}, {"$group": {"_id": None, "total": {"$sum": "$final_w"}}}]
            res = await db.mill_entries.aggregate(pipe2).to_list(1)
            a = round(res[0]["total"] / 100, 2) if res else 0
            e_val = t.get("expected_total", t["target_qntl"])
            p = round(max(0, e_val - a), 2)
            pr = round((a / e_val * 100) if e_val > 0 else 0, 1)
            tot["t"] += t["target_qntl"]; tot["e"] += e_val; tot["a"] += a; tot["p"] += p
            tdata.append([t["mandi_name"], str(t["target_qntl"]), f"{t['cutting_percent']}%", str(e_val), str(a), str(p), f"{pr}%"])
        tp = round((tot["a"] / tot["e"] * 100) if tot["e"] > 0 else 0, 1)
        tdata.append(["TOTAL", str(round(tot["t"], 2)), "-", str(round(tot["e"], 2)), str(round(tot["a"], 2)), str(round(tot["p"], 2)), f"{tp}%"])
        tt = Table(tdata, colWidths=[28*mm, 22*mm, 14*mm, 24*mm, 24*mm, 24*mm, 18*mm])
        tts = [
            ('BACKGROUND', (0, 0), (-1, 0), hdr_bg), ('TEXTCOLOR', (0, 0), (-1, 0), hdr_fg),
            ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, -1), (-1, -1), 'FreeSansBold'), ('BACKGROUND', (0, -1), (-1, -1), tot_bg),
            ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]
        for i in range(1, len(targets) + 1):
            pv = float(tdata[i][6].replace('%', ''))
            if pv >= 100: tts.append(('TEXTCOLOR', (6, i), (6, i), colors.HexColor('#059669')))
            elif pv < 50: tts.append(('TEXTCOLOR', (6, i), (6, i), colors.red))
        tt.setStyle(TableStyle(tts))
        elements.append(tt)
    else:
        elements.append(Paragraph("No targets set", styles['Normal']))
    elements.append(Spacer(1, 5*mm))

    # ---- SECTION 3: TRUCK PAYMENTS ----
    elements.append(Paragraph("3. TRUCK PAYMENTS", sec))
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    truck_total_net = truck_total_paid = truck_total_balance = 0
    truck_rows = []
    for entry in entries:
        eid = entry.get("id")
        pdoc = await db.truck_payments.find_one({"entry_id": eid}, {"_id": 0})
        rate = pdoc.get("rate_per_qntl", 32) if pdoc else 32
        paid = pdoc.get("paid_amount", 0) if pdoc else 0
        fq = round(entry.get("qntl", 0) - entry.get("bag", 0) / 100, 2)
        cash = entry.get("cash_paid", 0) or 0
        diesel = entry.get("diesel_paid", 0) or 0
        net = round(fq * rate - cash - diesel, 2)
        bal = round(max(0, net - paid), 2)
        truck_total_net += net; truck_total_paid += paid; truck_total_balance += bal
        truck_rows.append([fmt_date(entry.get("date", "")[:10]), entry.get("truck_no", "")[:12], entry.get("mandi_name", "")[:16],
            str(fq), f"Rs.{net:,.0f}", f"Rs.{paid:,.0f}", f"Rs.{bal:,.0f}",
            "Paid" if bal < 0.10 else "Pending"])

    if truck_rows:
        tdata = [["Date", "Truck", "Mandi", "QNTL", "Net", "Paid", "Balance", "Status"]] + truck_rows
        tdata.append(["TOTAL", "", "", "", f"Rs.{round(truck_total_net):,}", f"Rs.{round(truck_total_paid):,}", f"Rs.{round(truck_total_balance):,}", ""])
        tt = Table(tdata, colWidths=[20*mm, 22*mm, 22*mm, 16*mm, 22*mm, 20*mm, 22*mm, 16*mm])
        tts = [
            ('BACKGROUND', (0, 0), (-1, 0), hdr_bg), ('TEXTCOLOR', (0, 0), (-1, 0), hdr_fg),
            ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'), ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, -1), (-1, -1), 'FreeSansBold'), ('BACKGROUND', (0, -1), (-1, -1), tot_bg),
            ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]
        tt.setStyle(TableStyle(tts))
        elements.append(tt)
    else:
        elements.append(Paragraph("No truck entries", styles['Normal']))
    elements.append(Spacer(1, 5*mm))

    # ---- SECTION 4: AGENT PAYMENTS ----
    elements.append(Paragraph("4. AGENT/MANDI PAYMENTS", sec))
    agent_total_amt = agent_total_paid = agent_total_balance = 0
    agent_rows = []
    for t in targets:
        mandi = t["mandi_name"]
        cq = round(t["target_qntl"] * t["cutting_percent"] / 100, 2)
        br = t.get("base_rate", 10); cr = t.get("cutting_rate", 5)
        total_amt = round((t["target_qntl"] * br) + (cq * cr), 2)
        pdoc = await db.agent_payments.find_one({"mandi_name": mandi, "kms_year": t["kms_year"], "season": t["season"]}, {"_id": 0})
        paid = pdoc.get("paid_amount", 0) if pdoc else 0
        bal = round(max(0, total_amt - paid), 2)
        agent_total_amt += total_amt; agent_total_paid += paid; agent_total_balance += bal
        agent_rows.append([mandi, str(t["target_qntl"]), str(cq), f"Rs.{br}/Rs.{cr}", f"Rs.{total_amt:,.0f}", f"Rs.{paid:,.0f}", f"Rs.{bal:,.0f}",
            "Paid" if bal <= 0 else "Pending"])

    if agent_rows:
        adata = [["Mandi", "Target", "Cutting", "Rates", "Total", "Paid", "Balance", "Status"]] + agent_rows
        adata.append(["TOTAL", "", "", "", f"Rs.{round(agent_total_amt):,}", f"Rs.{round(agent_total_paid):,}", f"Rs.{round(agent_total_balance):,}", ""])
        at = Table(adata, colWidths=[25*mm, 18*mm, 16*mm, 24*mm, 22*mm, 20*mm, 22*mm, 16*mm])
        at.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), hdr_bg), ('TEXTCOLOR', (0, 0), (-1, 0), hdr_fg),
            ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'), ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, -1), (-1, -1), 'FreeSansBold'), ('BACKGROUND', (0, -1), (-1, -1), tot_bg),
            ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(at)
    else:
        elements.append(Paragraph("No agent payments", styles['Normal']))
    elements.append(Spacer(1, 5*mm))

    # ---- GRAND TOTAL ----
    elements.append(Paragraph("5. GRAND TOTAL", sec))
    ga = truck_total_net + agent_total_amt
    gp = truck_total_paid + agent_total_paid
    gb = truck_total_balance + agent_total_balance
    gdata = [
        ["Category", "Total Amount", "Paid", "Balance"],
        ["Truck Payments", f"Rs.{round(truck_total_net):,}", f"Rs.{round(truck_total_paid):,}", f"Rs.{round(truck_total_balance):,}"],
        ["Agent Payments", f"Rs.{round(agent_total_amt):,}", f"Rs.{round(agent_total_paid):,}", f"Rs.{round(agent_total_balance):,}"],
        ["GRAND TOTAL", f"Rs.{round(ga):,}", f"Rs.{round(gp):,}", f"Rs.{round(gb):,}"],
    ]
    gt = Table(gdata, colWidths=[40*mm, 35*mm, 35*mm, 35*mm])
    gt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), hdr_bg), ('TEXTCOLOR', (0, 0), (-1, 0), hdr_fg),
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'), ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('BACKGROUND', (0, -1), (-1, -1), amber_bg), ('TEXTCOLOR', (0, -1), (-1, -1), hdr_fg),
        ('FONTNAME', (0, -1), (-1, -1), 'FreeSansBold'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(gt)

    # Footer
    elements.append(Spacer(1, 10*mm))
    elements.append(Paragraph(f"Generated by {company} Mill Entry System | {datetime.now().strftime('%d-%m-%Y %H:%M')}", ft))

    doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=summary_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"})


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
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    
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
    ws['A1'] = f"TRUCK OWNER CONSOLIDATED PAYMENTS - {company_name} | FY: {kms_year or 'All'} | {season or 'All'}"
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
    from utils.export_helpers import get_pdf_styles; from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if season:
        query["season"] = season
    
    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    
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
    styles = get_pdf_styles()
    
    from utils.branding_helper import get_pdf_company_header_from_db
    elements.extend(await get_pdf_company_header_from_db())
    # Title
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#0891B2'), alignment=1)
    company_name, tagline = await get_company_name()
    elements.append(Paragraph(f"TRUCK OWNER CONSOLIDATED PAYMENTS - {company_name}", title_style))
    elements.append(Paragraph(f"FY: {kms_year or 'All'} | Season: {season or 'All'} | Generated: {datetime.now().strftime('%d-%m-%Y %H:%M')}", ParagraphStyle('Info', parent=styles['Normal'], fontSize=9, alignment=1, textColor=colors.gray)))
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
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSansBold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'FreeSans'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
        ('FONTNAME', (0, -1), (-1, -1), 'FreeSansBold'),
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


