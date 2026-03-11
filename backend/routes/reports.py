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
from utils.report_helper import get_columns, get_entry_row, get_total_row, get_excel_headers, get_pdf_headers, get_excel_widths, get_pdf_widths_mm, col_count

router = APIRouter()

# ============ PHASE 4: REPORTING ============

@router.get("/reports/cmr-vs-dc")
async def report_cmr_vs_dc(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Compare milling output (CMR) vs DC allotment and deliveries"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    # Milling data
    milling = await db.milling_entries.find(query, {"_id": 0}).to_list(5000)
    total_paddy_milled = round(sum(e.get("paddy_input_qntl", 0) for e in milling), 2)
    total_rice_produced = round(sum(e.get("rice_qntl", 0) for e in milling), 2)
    total_frk_used = round(sum(e.get("frk_used_qntl", 0) for e in milling), 2)
    total_cmr = round(sum(e.get("cmr_delivery_qntl", 0) for e in milling), 2)
    avg_outturn = round(total_cmr / total_paddy_milled * 100, 2) if total_paddy_milled > 0 else 0
    # DC data
    dcs = await db.dc_entries.find(query, {"_id": 0}).to_list(1000)
    deliveries = await db.dc_deliveries.find(query, {"_id": 0}).to_list(5000)
    total_dc_allotted = round(sum(d.get("quantity_qntl", 0) for d in dcs), 2)
    total_dc_delivered = round(sum(d.get("quantity_qntl", 0) for d in deliveries), 2)
    total_dc_pending = round(total_dc_allotted - total_dc_delivered, 2)
    # Comparison
    cmr_surplus = round(total_cmr - total_dc_allotted, 2)
    delivery_gap = round(total_cmr - total_dc_delivered, 2)  # CMR ready but not delivered
    # By-product revenue
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(5000)
    bp_revenue = round(sum(s.get("total_amount", 0) for s in bp_sales), 2)
    return {
        "milling": {"total_paddy_milled": total_paddy_milled, "total_rice_produced": total_rice_produced, "total_frk_used": total_frk_used, "total_cmr_ready": total_cmr, "avg_outturn_pct": avg_outturn, "milling_count": len(milling)},
        "dc": {"total_allotted": total_dc_allotted, "total_delivered": total_dc_delivered, "total_pending": total_dc_pending, "dc_count": len(dcs), "delivery_count": len(deliveries)},
        "comparison": {"cmr_vs_dc_allotted": cmr_surplus, "cmr_vs_dc_delivered": delivery_gap},
        "byproduct_revenue": bp_revenue
    }


@router.get("/reports/season-pnl")
async def report_season_pnl(kms_year: Optional[str] = None, season: Optional[str] = None):
    """Season-wise Profit & Loss summary"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    # Income
    msp_payments = await db.msp_payments.find(query, {"_id": 0}).to_list(5000)
    msp_income = round(sum(p.get("amount", 0) for p in msp_payments), 2)
    bp_sales = await db.byproduct_sales.find(query, {"_id": 0}).to_list(5000)
    bp_income = round(sum(s.get("total_amount", 0) for s in bp_sales), 2)
    # Expenses
    frk_purchases = await db.frk_purchases.find(query, {"_id": 0}).to_list(5000)
    frk_cost = round(sum(p.get("total_amount", 0) for p in frk_purchases), 2)
    gunny_bags = await db.gunny_bags.find(query, {"_id": 0}).to_list(5000)
    gunny_cost = round(sum(g.get("amount", 0) for g in gunny_bags if g.get("txn_type") == "in"), 2)
    cash_txns = await db.cash_transactions.find(query, {"_id": 0}).to_list(10000)
    cash_expenses = round(sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "nikasi"), 2)
    cash_income_other = round(sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "jama"), 2)
    # Truck/Agent payments from mill entries
    entries = await db.mill_entries.find(query, {"_id": 0}).to_list(10000)
    truck_payments = round(sum(e.get("tp_paid", 0) for e in entries), 2)
    agent_payments = round(sum(e.get("agent_paid", 0) for e in entries), 2)
    total_income = round(msp_income + bp_income + cash_income_other, 2)
    total_expenses = round(frk_cost + gunny_cost + cash_expenses + truck_payments + agent_payments, 2)
    net_pnl = round(total_income - total_expenses, 2)
    return {
        "income": {"msp_payments": msp_income, "byproduct_sales": bp_income, "cash_book_jama": cash_income_other, "total": total_income},
        "expenses": {"frk_purchases": frk_cost, "gunny_bags": gunny_cost, "cash_book_nikasi": cash_expenses, "truck_payments": truck_payments, "agent_payments": agent_payments, "total": total_expenses},
        "net_pnl": net_pnl, "profit": net_pnl >= 0
    }


@router.get("/reports/cmr-vs-dc/excel")
async def export_cmr_vs_dc_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    data = await report_cmr_vs_dc(kms_year=kms_year, season=season)
    wb = Workbook(); ws = wb.active; ws.title = "CMR vs DC"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    title = "CMR vs DC Report"
    if kms_year: title += f" - KMS {kms_year}"
    ws.merge_cells('A1:D1'); ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    # Milling
    ws.cell(row=3, column=1, value="MILLING OUTPUT").font = Font(bold=True, size=11, color="2563eb")
    items = [("Paddy Milled (Q)", data["milling"]["total_paddy_milled"]), ("Rice Produced (Q)", data["milling"]["total_rice_produced"]),
             ("FRK Used (Q)", data["milling"]["total_frk_used"]), ("CMR Ready (Q)", data["milling"]["total_cmr_ready"]),
             ("Avg Outturn %", data["milling"]["avg_outturn_pct"]), ("Milling Count", data["milling"]["milling_count"])]
    for i, (label, val) in enumerate(items, 4):
        ws.cell(row=i, column=1, value=label).border = tb
        c = ws.cell(row=i, column=2, value=val); c.border = tb; c.alignment = Alignment(horizontal='right')
    # DC
    row = 11
    ws.cell(row=row, column=1, value="DC ALLOTMENT & DELIVERY").font = Font(bold=True, size=11, color="16a34a")
    items2 = [("DC Allotted (Q)", data["dc"]["total_allotted"]), ("DC Delivered (Q)", data["dc"]["total_delivered"]),
              ("DC Pending (Q)", data["dc"]["total_pending"]), ("Total DCs", data["dc"]["dc_count"]), ("Total Deliveries", data["dc"]["delivery_count"])]
    for i, (label, val) in enumerate(items2, row+1):
        ws.cell(row=i, column=1, value=label).border = tb
        c = ws.cell(row=i, column=2, value=val); c.border = tb; c.alignment = Alignment(horizontal='right')
    # Comparison
    row = 18
    ws.cell(row=row, column=1, value="COMPARISON").font = Font(bold=True, size=11, color="d97706")
    ws.cell(row=row+1, column=1, value="CMR vs DC Allotted").border = tb
    ws.cell(row=row+1, column=2, value=data["comparison"]["cmr_vs_dc_allotted"]).border = tb
    ws.cell(row=row+2, column=1, value="CMR vs DC Delivered").border = tb
    ws.cell(row=row+2, column=2, value=data["comparison"]["cmr_vs_dc_delivered"]).border = tb
    ws.cell(row=row+3, column=1, value="By-Product Revenue (₹)").border = tb
    ws.cell(row=row+3, column=2, value=data["byproduct_revenue"]).border = tb
    for letter in ['A','B','C','D']: ws.column_dimensions[letter].width = 22
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cmr_vs_dc_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/reports/cmr-vs-dc/pdf")
async def export_cmr_vs_dc_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    data = await report_cmr_vs_dc(kms_year=kms_year, season=season)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=40, rightMargin=40, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("CMR vs DC Report", styles['Title'])); elements.append(Spacer(1, 12))
    rows = [['Metric', 'Value'],
        ['--- MILLING ---', ''], ['Paddy Milled (Q)', data['milling']['total_paddy_milled']], ['Rice Produced (Q)', data['milling']['total_rice_produced']],
        ['FRK Used (Q)', data['milling']['total_frk_used']], ['CMR Ready (Q)', data['milling']['total_cmr_ready']], ['Outturn %', data['milling']['avg_outturn_pct']],
        ['--- DC ---', ''], ['DC Allotted (Q)', data['dc']['total_allotted']], ['DC Delivered (Q)', data['dc']['total_delivered']], ['DC Pending (Q)', data['dc']['total_pending']],
        ['--- COMPARISON ---', ''], ['CMR vs DC Allotted', data['comparison']['cmr_vs_dc_allotted']], ['CMR vs DC Delivered', data['comparison']['cmr_vs_dc_delivered']],
        ['By-Product Revenue', f"₹{data['byproduct_revenue']}"]]
    table = RLTable(rows, colWidths=[200, 150])
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1a365d')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),9),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('ALIGN',(1,0),(1,-1),'RIGHT')]))
    elements.append(table); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=cmr_vs_dc_{datetime.now().strftime('%Y%m%d')}.pdf"})


@router.get("/reports/season-pnl/excel")
async def export_season_pnl_excel(kms_year: Optional[str] = None, season: Optional[str] = None):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    data = await report_season_pnl(kms_year=kms_year, season=season)
    wb = Workbook(); ws = wb.active; ws.title = "Season P&L"
    hf = PatternFill(start_color="1a365d", end_color="1a365d", fill_type="solid")
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    title = "Season P&L Report"
    if kms_year: title += f" - KMS {kms_year}"
    ws.merge_cells('A1:C1'); ws['A1'] = title; ws['A1'].font = Font(bold=True, size=14); ws['A1'].alignment = Alignment(horizontal='center')
    row = 3
    ws.cell(row=row, column=1, value="INCOME").font = Font(bold=True, size=11, color="16a34a")
    for label, val in [("MSP Payments", data["income"]["msp_payments"]), ("By-Product Sales", data["income"]["byproduct_sales"]),
                        ("Cash Book Jama", data["income"]["cash_book_jama"]), ("TOTAL INCOME", data["income"]["total"])]:
        row += 1
        ws.cell(row=row, column=1, value=label).border = tb
        c = ws.cell(row=row, column=2, value=val); c.border = tb; c.number_format = '#,##0.00'
        if label.startswith("TOTAL"): ws.cell(row=row, column=1).font = Font(bold=True); c.font = Font(bold=True)
    row += 2
    ws.cell(row=row, column=1, value="EXPENSES").font = Font(bold=True, size=11, color="dc2626")
    for label, val in [("FRK Purchases", data["expenses"]["frk_purchases"]), ("Gunny Bags", data["expenses"]["gunny_bags"]),
                        ("Cash Book Nikasi", data["expenses"]["cash_book_nikasi"]), ("Truck Payments", data["expenses"]["truck_payments"]),
                        ("Agent Payments", data["expenses"]["agent_payments"]), ("TOTAL EXPENSES", data["expenses"]["total"])]:
        row += 1
        ws.cell(row=row, column=1, value=label).border = tb
        c = ws.cell(row=row, column=2, value=val); c.border = tb; c.number_format = '#,##0.00'
        if label.startswith("TOTAL"): ws.cell(row=row, column=1).font = Font(bold=True); c.font = Font(bold=True)
    row += 2
    pnl_label = "NET PROFIT" if data["profit"] else "NET LOSS"
    ws.cell(row=row, column=1, value=pnl_label).font = Font(bold=True, size=12, color="16a34a" if data["profit"] else "dc2626")
    ws.cell(row=row, column=2, value=data["net_pnl"]).font = Font(bold=True, size=12)
    ws.cell(row=row, column=2).number_format = '#,##0.00'
    for letter in ['A','B','C']: ws.column_dimensions[letter].width = 22
    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=season_pnl_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/reports/season-pnl/pdf")
async def export_season_pnl_pdf(kms_year: Optional[str] = None, season: Optional[str] = None):
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib import colors
    from io import BytesIO
    data = await report_season_pnl(kms_year=kms_year, season=season)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=40, rightMargin=40, topMargin=30, bottomMargin=30)
    elements = []; styles = getSampleStyleSheet()
    elements.append(Paragraph("Season P&L Report", styles['Title'])); elements.append(Spacer(1, 12))
    # Income
    elements.append(Paragraph("INCOME", styles['Heading2'])); elements.append(Spacer(1, 4))
    idata = [['Source', 'Amount (₹)'], ['MSP Payments', data['income']['msp_payments']], ['By-Product Sales', data['income']['byproduct_sales']],
             ['Cash Book Jama', data['income']['cash_book_jama']], ['TOTAL', data['income']['total']]]
    it = RLTable(idata, colWidths=[200, 120])
    it.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#166534')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),9),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('ALIGN',(1,0),(1,-1),'RIGHT')]))
    elements.append(it); elements.append(Spacer(1, 12))
    # Expenses
    elements.append(Paragraph("EXPENSES", styles['Heading2'])); elements.append(Spacer(1, 4))
    edata = [['Category', 'Amount (₹)'], ['FRK Purchases', data['expenses']['frk_purchases']], ['Gunny Bags', data['expenses']['gunny_bags']],
             ['Cash Book Nikasi', data['expenses']['cash_book_nikasi']], ['Truck Payments', data['expenses']['truck_payments']],
             ['Agent Payments', data['expenses']['agent_payments']], ['TOTAL', data['expenses']['total']]]
    et = RLTable(edata, colWidths=[200, 120])
    et.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#991b1b')),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,-1),9),('GRID',(0,0),(-1,-1),0.5,colors.grey),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('ALIGN',(1,0),(1,-1),'RIGHT')]))
    elements.append(et); elements.append(Spacer(1, 15))
    # Net P&L
    pnl_color = colors.HexColor('#166534') if data['profit'] else colors.HexColor('#991b1b')
    pdata = [['NET ' + ('PROFIT' if data['profit'] else 'LOSS'), f"₹{data['net_pnl']}"]]
    pt = RLTable(pdata, colWidths=[200, 120])
    pt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pnl_color),('TEXTCOLOR',(0,0),(-1,0),colors.white),
        ('FONTSIZE',(0,0),(-1,0),14),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('ALIGN',(1,0),(1,0),'RIGHT')]))
    elements.append(pt); doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=season_pnl_{datetime.now().strftime('%Y%m%d')}.pdf"})




# ============ AGENT & MANDI WISE REPORT ============

@router.get("/reports/agent-mandi-wise")
async def report_agent_mandi_wise(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Agent & Mandi wise report with individual trip entries"""
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if season: query["season"] = season
    if date_from or date_to:
        date_q = {}
        if date_from: date_q["$gte"] = date_from
        if date_to: date_q["$lte"] = date_to
        query["date"] = date_q

    entries = await db.mill_entries.find(query, {"_id": 0}).sort("date", -1).to_list(5000)

    if search:
        s = search.lower()
        entries = [e for e in entries if s in (e.get("mandi_name","")).lower() or s in (e.get("agent_name","")).lower()]

    # Group by mandi_name
    mandi_map = {}
    for e in entries:
        mn = e.get("mandi_name", "Unknown")
        if mn not in mandi_map:
            mandi_map[mn] = {"mandi_name": mn, "agent_name": e.get("agent_name", ""), "entries": [], "totals": {
                "total_qntl": 0, "total_bag": 0, "total_g_deposite": 0, "total_gbw_cut": 0,
                "total_plastic_bag": 0, "total_p_pkt_cut": 0, "total_mill_w": 0,
                "total_moisture_cut": 0, "total_final_w": 0,
                "total_g_issued": 0, "total_cash_paid": 0, "total_diesel_paid": 0,
                "total_disc_dust_poll": 0, "entry_count": 0
            }}
        t = mandi_map[mn]["totals"]
        t["total_qntl"] += e.get("qntl", 0)
        t["total_bag"] += e.get("bag", 0)
        t["total_g_deposite"] += e.get("g_deposite", 0)
        t["total_gbw_cut"] += e.get("gbw_cut", 0) or 0
        t["total_plastic_bag"] += e.get("plastic_bag", 0) or 0
        t["total_p_pkt_cut"] += e.get("p_pkt_cut", 0) or 0
        t["total_mill_w"] += e.get("mill_w", 0)
        t["total_moisture_cut"] += e.get("moisture_cut", 0) or 0
        t["total_final_w"] += e.get("final_w", 0)
        t["total_g_issued"] += e.get("g_issued", 0)
        t["total_cash_paid"] += e.get("cash_paid", 0) or 0
        t["total_diesel_paid"] += e.get("diesel_paid", 0) or 0
        t["total_disc_dust_poll"] += e.get("disc_dust_poll", 0) or 0
        t["entry_count"] += 1
        mandi_map[mn]["entries"].append({
            "date": e.get("date", ""),
            "truck_no": e.get("truck_no", ""),
            "qntl": round(e.get("qntl", 0), 2),
            "bag": e.get("bag", 0),
            "g_deposite": e.get("g_deposite", 0),
            "gbw_cut": round(e.get("gbw_cut", 0) or 0, 2),
            "plastic_bag": e.get("plastic_bag", 0) or 0,
            "p_pkt_cut": round(e.get("p_pkt_cut", 0) or 0, 2),
            "mill_w": round(e.get("mill_w", 0), 2),
            "moisture_cut_percent": round(e.get("moisture_cut_percent", 0) or 0, 2),
            "moisture_cut": round(e.get("moisture_cut", 0) or 0, 2),
            "cutting_percent": round(e.get("cutting_percent", 0) or 0, 2),
            "disc_dust_poll": round(e.get("disc_dust_poll", 0) or 0, 2),
            "final_w": round(e.get("final_w", 0), 2),
            "g_issued": e.get("g_issued", 0),
            "cash_paid": e.get("cash_paid", 0) or 0,
            "diesel_paid": e.get("diesel_paid", 0) or 0,
        })

    # Round totals
    result = []
    for mn, data in mandi_map.items():
        for k in data["totals"]:
            data["totals"][k] = round(data["totals"][k], 2)
        result.append(data)

    result.sort(key=lambda x: x["mandi_name"])

    # Fetch mandi targets for extra QNTL calculation
    target_query = {}
    if kms_year: target_query["kms_year"] = kms_year
    if season: target_query["season"] = season
    targets = await db.mandi_targets.find(target_query, {"_id": 0}).to_list(500)
    target_map = {t["mandi_name"]: t for t in targets}

    # Check existing pvt entries from this feature
    pvt_entries = await db.private_paddy.find({"source": "agent_extra"}, {"_id": 0, "mandi_name": 1}).to_list(500)
    pvt_mandi_set = set(p.get("mandi_name", "") for p in pvt_entries)

    for m in result:
        mn = m["mandi_name"]
        target = target_map.get(mn, {})
        target_qntl = round(target.get("target_qntl", 0), 2)
        cutting_pct = round(target.get("cutting_percent", 0), 2)
        expected_total = round(target.get("expected_total", 0) or (target_qntl + target_qntl * cutting_pct / 100), 2)
        actual_final_w_qntl = round(m["totals"]["total_final_w"] / 100, 2)  # final_w is in kg, convert to QNTL
        extra_qntl = round(max(0, actual_final_w_qntl - expected_total), 2) if expected_total > 0 else 0
        m["target_qntl"] = target_qntl
        m["cutting_percent"] = cutting_pct
        m["expected_total"] = expected_total
        m["actual_final_qntl"] = actual_final_w_qntl
        m["extra_qntl"] = extra_qntl
        m["pvt_moved"] = mn in pvt_mandi_set
        # Include last entry details for pvt move
        if m["entries"]:
            last_entry = m["entries"][-1]  # last entry (oldest date, last truck)
            m["last_truck"] = {
                "truck_no": last_entry.get("truck_no", ""),
                "date": last_entry.get("date", ""),
                "qntl": last_entry.get("qntl", 0),
                "bag": last_entry.get("bag", 0),
                "agent_name": last_entry.get("agent_name", m.get("agent_name", "")),
                "mandi_name": last_entry.get("mandi_name", mn),
            }

    # Grand totals
    grand = {"total_qntl": 0, "total_bag": 0, "total_g_deposite": 0, "total_gbw_cut": 0,
             "total_plastic_bag": 0, "total_p_pkt_cut": 0, "total_mill_w": 0,
             "total_moisture_cut": 0, "total_final_w": 0, "total_g_issued": 0,
             "total_cash_paid": 0, "total_diesel_paid": 0, "total_disc_dust_poll": 0, "entry_count": 0}
    for m in result:
        for k in grand:
            grand[k] += m["totals"][k]
    for k in grand:
        grand[k] = round(grand[k], 2)
    grand["total_extra_qntl"] = round(sum(m.get("extra_qntl", 0) for m in result), 2)

    return {"mandis": result, "grand_totals": grand}


@router.post("/reports/agent-mandi-wise/move-to-pvt")
async def move_extra_to_pvt(request: Request):
    """Move extra QNTL (above target) to Private Paddy Purchase"""
    body = await request.json()
    mandi_name = body.get("mandi_name")
    agent_name = body.get("agent_name", "")
    extra_qntl = body.get("extra_qntl", 0)
    rate = body.get("rate", 0)
    kms_year = body.get("kms_year", "")
    season = body.get("season", "")
    username = body.get("username", "admin")
    last_truck = body.get("last_truck", {})

    if not mandi_name or extra_qntl <= 0 or rate <= 0:
        return {"success": False, "detail": "Mandi name, extra QNTL aur rate required hai"}

    total_amount = round(extra_qntl * rate, 2)

    # Check if already moved
    existing = await db.private_paddy.find_one({"mandi_name": mandi_name, "source": "agent_extra", "kms_year": kms_year, "season": season}, {"_id": 0})
    if existing:
        return {"success": False, "detail": f"{mandi_name} ka extra QNTL pehle se Pvt Purchase mein move ho chuka hai"}

    pvt_entry = {
        "id": str(uuid.uuid4()),
        "date": last_truck.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "party_name": f"{agent_name} ({mandi_name})",
        "mandi_name": mandi_name,
        "agent_name": agent_name,
        "truck_no": last_truck.get("truck_no", ""),
        "quantity_qntl": round(extra_qntl, 2),
        "rate_per_qntl": round(rate, 2),
        "total_amount": total_amount,
        "bag": last_truck.get("bag", 0),
        "paid_amount": 0,
        "status": "pending",
        "source": "agent_extra",
        "note": f"Agent extra - Target se {extra_qntl}Q zyada ({last_truck.get('truck_no', '')})",
        "kms_year": kms_year,
        "season": season,
        "created_by": username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.private_paddy.insert_one(pvt_entry)

    return {"success": True, "message": f"{extra_qntl}Q @ Rs.{rate}/Q = Rs.{total_amount} Pvt Purchase mein move ho gaya ({agent_name} - {mandi_name})"}



@router.get("/reports/agent-mandi-wise/excel")
async def export_agent_mandi_wise_excel(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, mandis: Optional[str] = None):
    from io import BytesIO
    data = await report_agent_mandi_wise(kms_year=kms_year, season=season, search=search, date_from=date_from, date_to=date_to)
    # Filter to only expanded mandis if specified
    if mandis:
        mandi_names = [m.strip() for m in mandis.split(',') if m.strip()]
        if mandi_names:
            data["mandis"] = [m for m in data["mandis"] if m["mandi_name"] in mandi_names]
            # Recalculate grand totals for filtered mandis
            gt = {}
            for key in data["grand_totals"]:
                gt[key] = 0
            for m in data["mandis"]:
                for key in gt:
                    gt[key] += m["totals"].get(key, 0)
            gt["entry_count"] = sum(m["totals"]["entry_count"] for m in data["mandis"])
            gt["total_extra_qntl"] = round(sum(m.get("extra_qntl", 0) for m in data["mandis"]), 2)
            data["grand_totals"] = gt
    wb = Workbook(); ws = wb.active; ws.title = "Agent Mandi Report"
    hf = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    hfont = Font(bold=True, color="FFFFFF", size=9)
    mf = PatternFill(start_color="D97706", end_color="D97706", fill_type="solid")
    mfont = Font(bold=True, color="FFFFFF", size=10)
    tf = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    gf = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")
    gfont = Font(bold=True, color="FFFFFF", size=10)
    tb = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))

    cols = get_columns("agent_mandi_report")
    ncols = col_count(cols)
    headers = get_excel_headers(cols)
    widths = get_excel_widths(cols)

    # Title
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    title = f"Agent & Mandi Wise Report"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    ws['A1'] = title
    ws['A1'].font = Font(bold=True, size=14, color="D97706")
    ws['A1'].alignment = Alignment(horizontal='center')

    row = 3
    for mandi_data in data["mandis"]:
        # Mandi header row
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=ncols)
        lbl = f"{mandi_data['mandi_name']} - Agent: {mandi_data['agent_name']} ({mandi_data['totals']['entry_count']} entries)"
        if mandi_data.get("target_qntl"):
            lbl += f" | Target: {mandi_data['target_qntl']}Q | Final W: {mandi_data.get('actual_final_qntl',0)}Q | Extra: {mandi_data.get('extra_qntl',0)}Q"
        cell = ws.cell(row=row, column=1, value=lbl)
        cell.fill = mf; cell.font = mfont; cell.alignment = Alignment(horizontal='left')
        row += 1

        # Column headers
        for col_idx, h in enumerate(headers, 1):
            c = ws.cell(row=row, column=col_idx, value=h)
            c.fill = hf; c.font = hfont; c.alignment = Alignment(horizontal='center'); c.border = tb
        row += 1

        # Entries - values come from shared config
        for entry in mandi_data["entries"]:
            vals = get_entry_row(entry, cols)
            for col_idx, v in enumerate(vals, 1):
                c = ws.cell(row=row, column=col_idx, value=v)
                c.border = tb
                if cols[col_idx-1]["align"] == "right": c.alignment = Alignment(horizontal='right')
            row += 1

        # Mandi total row - values come from shared config
        t = mandi_data["totals"]
        total_vals = get_total_row(t, cols)
        ws.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
        ws.cell(row=row, column=1).fill = tf; ws.cell(row=row, column=1).border = tb
        for col_idx, val in enumerate(total_vals, 1):
            if val is not None:
                c = ws.cell(row=row, column=col_idx, value=val)
                c.fill = tf; c.font = Font(bold=True); c.border = tb; c.alignment = Alignment(horizontal='right')
        row += 2  # gap

    # Grand total - values come from shared config
    g = data["grand_totals"]
    grand_vals = get_total_row(g, cols)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
    ws.cell(row=row, column=1, value=f"GRAND TOTAL ({g['entry_count']} entries)").font = gfont
    ws.cell(row=row, column=1).fill = gf
    for col_idx, val in enumerate(grand_vals, 1):
        if val is not None:
            c = ws.cell(row=row, column=col_idx, value=val)
            c.fill = gf; c.font = gfont; c.border = tb; c.alignment = Alignment(horizontal='right')

    # Column widths from shared config
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    buffer = BytesIO(); wb.save(buffer); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=agent_mandi_report_{datetime.now().strftime('%Y%m%d')}.xlsx"})


@router.get("/reports/agent-mandi-wise/pdf")
async def export_agent_mandi_wise_pdf(kms_year: Optional[str] = None, season: Optional[str] = None, search: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, mandis: Optional[str] = None):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    from io import BytesIO

    report_data = await report_agent_mandi_wise(kms_year=kms_year, season=season, search=search, date_from=date_from, date_to=date_to)
    # Filter to only expanded mandis if specified
    if mandis:
        mandi_names = [m.strip() for m in mandis.split(',') if m.strip()]
        if mandi_names:
            report_data["mandis"] = [m for m in report_data["mandis"] if m["mandi_name"] in mandi_names]
            gt = {}
            for key in report_data["grand_totals"]:
                gt[key] = 0
            for m in report_data["mandis"]:
                for key in gt:
                    gt[key] += m["totals"].get(key, 0)
            gt["entry_count"] = sum(m["totals"]["entry_count"] for m in report_data["mandis"])
            gt["total_extra_qntl"] = round(sum(m.get("extra_qntl", 0) for m in report_data["mandis"]), 2)
            report_data["grand_totals"] = gt
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=8*mm, rightMargin=8*mm, topMargin=10*mm, bottomMargin=10*mm)
    elements = []; styles = getSampleStyleSheet()

    title = f"Agent & Mandi Wise Report"
    if kms_year: title += f" | KMS: {kms_year}"
    if season: title += f" | {season}"
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=14, textColor=colors.HexColor('#D97706'), alignment=TA_CENTER)
    elements.append(Paragraph(title, title_style))
    elements.append(Spacer(1, 8))

    cols = get_columns("agent_mandi_report")
    ncols = col_count(cols)
    headers = get_pdf_headers(cols)
    col_widths = [w*mm for w in get_pdf_widths_mm(cols)]

    for mandi_data in report_data["mandis"]:
        # Mandi header
        mandi_label = f"{mandi_data['mandi_name']} - Agent: {mandi_data['agent_name']} ({mandi_data['totals']['entry_count']} entries)"
        if mandi_data.get("target_qntl"):
            mandi_label += f" | Target: {mandi_data['target_qntl']}Q | Final W: {mandi_data.get('actual_final_qntl',0)}Q | Extra: {mandi_data.get('extra_qntl',0)}Q"
        mandi_row = [[Paragraph(f"<b>{mandi_label}</b>", styles['Normal'])] + [''] * (ncols - 1)]
        mt = RLTable(mandi_row, colWidths=col_widths)
        mt.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#D97706')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('SPAN', (0, 0), (-1, 0)),
            ('TOPPADDING', (0, 0), (-1, 0), 4), ('BOTTOMPADDING', (0, 0), (-1, 0), 4)]))
        elements.append(mt)

        # Data table - entries from shared config
        table_data = [headers]
        for entry in mandi_data["entries"]:
            table_data.append([str(v) for v in get_entry_row(entry, cols)])

        # Mandi totals from shared config
        t = mandi_data["totals"]
        total_vals = get_total_row(t, cols)
        total_row = []
        for i, val in enumerate(total_vals):
            if i == 0: total_row.append("TOTAL")
            elif val is not None: total_row.append(str(val))
            else: total_row.append("")
        table_data.append(total_row)

        tbl = RLTable(table_data, colWidths=col_widths, repeatRows=1)
        # Find first right-aligned column index
        first_right = next((i for i, c in enumerate(cols) if c["align"] == "right"), 2)
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('ALIGN', (first_right, 1), (-1, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#FEF3C7')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ]
        for i in range(1, len(table_data) - 1):
            if i % 2 == 0:
                style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#F1F5F9')))
        tbl.setStyle(TableStyle(style_cmds))
        elements.append(tbl)
        elements.append(Spacer(1, 8))

    # Grand total from shared config
    g = report_data["grand_totals"]
    grand_vals = get_total_row(g, cols)
    grand_row = []
    for i, val in enumerate(grand_vals):
        if i == 0: grand_row.append(f"GRAND TOTAL ({g['entry_count']})")
        elif i == 1: grand_row.append("")
        elif val is not None: grand_row.append(str(val))
        else: grand_row.append("")
    grand_data = [grand_row]
    gt = RLTable(grand_data, colWidths=col_widths)
    gt.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#065F46')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8), ('ALIGN', (first_right, 0), (-1, 0), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, 0), 4), ('BOTTOMPADDING', (0, 0), (-1, 0), 4)]))
    elements.append(gt)

    doc.build(elements); buffer.seek(0)
    return Response(content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=agent_mandi_report_{datetime.now().strftime('%Y%m%d')}.pdf"})
