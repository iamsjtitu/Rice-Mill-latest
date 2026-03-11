from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime
from database import db
import io

router = APIRouter()

@router.get("/reports/daily")
async def get_daily_report(date: str, kms_year: Optional[str] = None, season: Optional[str] = None, mode: str = "normal"):
    q_date = {"date": date}
    q_fy = {}
    if kms_year: q_fy["kms_year"] = kms_year
    if season: q_fy["season"] = season
    q = {**q_date, **q_fy}

    # Paddy Entries
    entries = await db.mill_entries.find(q, {"_id": 0}).to_list(500)
    total_paddy_kg = sum(e.get("kg", 0) for e in entries)
    total_paddy_bags = sum(e.get("bag", 0) for e in entries)
    total_final_w = sum(e.get("final_w", 0) for e in entries)

    # Private Paddy
    pvt_paddy = await db.private_paddy.find(q, {"_id": 0}).to_list(500)
    pvt_paddy_kg = sum(e.get("kg", 0) for e in pvt_paddy)
    pvt_paddy_amount = sum(e.get("total_amount", 0) for e in pvt_paddy)

    # Rice Sales
    rice_sales = await db.rice_sales.find(q, {"_id": 0}).to_list(500)
    rice_sale_qntl = sum(s.get("quantity_qntl", 0) for s in rice_sales)
    rice_sale_amount = sum(s.get("total_amount", 0) for s in rice_sales)

    # Milling
    milling = await db.milling_entries.find(q, {"_id": 0}).to_list(500)
    milling_paddy_input = sum(m.get("paddy_input_qntl", 0) for m in milling)
    milling_rice_output = sum(m.get("rice_qntl", 0) for m in milling)
    milling_frk_used = sum(m.get("frk_used_qntl", 0) for m in milling)

    # DC Deliveries
    dc_deliveries = await db.dc_deliveries.find(q_date, {"_id": 0}).to_list(500)
    dc_delivery_qntl = sum(d.get("quantity_qntl", 0) for d in dc_deliveries)

    # Diesel / Pump Account
    diesel_txns = await db.diesel_accounts.find(q, {"_id": 0}).to_list(500)
    diesel_total_amount = sum(t.get("amount", 0) for t in diesel_txns if t.get("txn_type") in ("diesel", "debit"))
    diesel_total_paid = sum(t.get("amount", 0) for t in diesel_txns if t.get("txn_type") in ("payment", "credit"))

    # Cash Book
    cash_txns = await db.cash_transactions.find(q, {"_id": 0}).to_list(500)
    cash_jama = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "jama" and t.get("account") == "cash")
    cash_nikasi = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "nikasi" and t.get("account") == "cash")
    bank_jama = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "jama" and t.get("account") == "bank")
    bank_nikasi = sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "nikasi" and t.get("account") == "bank")

    # MSP Payments
    msp = await db.msp_payments.find(q, {"_id": 0}).to_list(500)
    msp_amount = sum(p.get("amount", 0) for p in msp)

    # Private Payments
    pvt_payments = await db.private_payments.find(q_date, {"_id": 0}).to_list(500)
    pvt_paid = sum(p.get("amount", 0) for p in pvt_payments if p.get("ref_type") == "paddy_purchase")
    pvt_received = sum(p.get("amount", 0) for p in pvt_payments if p.get("ref_type") == "rice_sale")

    # By-product Sales
    bp_sales = await db.byproduct_sales.find(q, {"_id": 0}).to_list(500)
    bp_amount = sum(s.get("total_amount", 0) for s in bp_sales)

    # FRK Purchases
    frk = await db.frk_purchases.find(q, {"_id": 0}).to_list(500)
    frk_qntl = sum(f.get("quantity_qntl", 0) for f in frk)
    frk_amount = sum(f.get("total_amount", 0) for f in frk)

    # Mill Parts Stock
    parts_txns = await db.mill_parts_stock.find(q_date, {"_id": 0}).to_list(500)
    parts_in = [t for t in parts_txns if t.get("txn_type") == "in"]
    parts_used = [t for t in parts_txns if t.get("txn_type") == "used"]
    parts_in_amount = sum(t.get("total_amount", 0) for t in parts_in)

    # Staff Attendance - always show all active staff
    staff_att = await db.staff_attendance.find(q_date, {"_id": 0}).to_list(500)
    all_staff = await db.staff.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(500)
    att_map_local = {a["staff_id"]: a["status"] for a in staff_att}
    staff_details = []
    present_c = absent_c = half_c = holiday_c = not_marked_c = 0
    for s in all_staff:
        status = att_map_local.get(s["id"], "not_marked")
        staff_details.append({"name": s["name"], "status": status})
        if status == "present": present_c += 1
        elif status == "absent": absent_c += 1
        elif status == "half_day": half_c += 1
        elif status == "holiday": holiday_c += 1
        else: not_marked_c += 1

    is_detail = mode == "detail"

    # Build entry_id -> mandi_name map for diesel mandi lookup
    _entry_mandi_map = {e.get("id", ""): e.get("mandi_name", "") for e in entries}

    result = {
        "date": date, "mode": mode,
        "paddy_entries": {
            "count": len(entries), "total_kg": round(total_paddy_kg, 2),
            "total_bags": total_paddy_bags, "total_final_w": round(total_final_w, 2),
            "total_mill_w": round(sum(e.get("mill_w", 0) for e in entries), 2),
            "total_g_deposite": sum(e.get("g_deposite", 0) for e in entries),
            "total_g_issued": sum(e.get("g_issued", 0) for e in entries),
            "total_cash_paid": round(sum(e.get("cash_paid", 0) for e in entries), 2),
            "total_diesel_paid": round(sum(e.get("diesel_paid", 0) for e in entries), 2),
            "details": [{"truck_no": e.get("truck_no", ""), "agent": e.get("agent_name", ""),
                "mandi": e.get("mandi_name", ""), "rst_no": e.get("rst_no", ""),
                "tp_no": e.get("tp_no", ""), "season": e.get("season", ""),
                "kg": e.get("kg", 0), "qntl": e.get("qntl", 0), "bags": e.get("bag", 0),
                "g_deposite": e.get("g_deposite", 0), "gbw_cut": e.get("gbw_cut", 0),
                "mill_w": e.get("mill_w", 0),
                "moisture": e.get("moisture", 0),
                "moisture_cut": e.get("moisture_cut", 0),
                "cutting_percent": e.get("cutting_percent", 0),
                "disc_dust_poll": e.get("disc_dust_poll", 0),
                "final_w": e.get("final_w", 0),
                "plastic_bag": e.get("plastic_bag", 0),
                "p_pkt_cut": e.get("p_pkt_cut", 0),
                "g_issued": e.get("g_issued", 0),
                "cash_paid": e.get("cash_paid", 0),
                "diesel_paid": e.get("diesel_paid", 0)} for e in entries]
        },
        "pvt_paddy": {
            "count": len(pvt_paddy), "total_kg": round(pvt_paddy_kg, 2),
            "total_amount": round(pvt_paddy_amount, 2),
            "details": [{"party": p.get("party_name", ""), "variety": p.get("variety", ""),
                "kg": p.get("kg", 0), "rate": p.get("rate", 0),
                "amount": p.get("total_amount", 0), "vehicle": p.get("vehicle_no", "")} for p in pvt_paddy] if is_detail else
                [{"party": p.get("party_name", ""), "kg": p.get("kg", 0), "amount": p.get("total_amount", 0)} for p in pvt_paddy]
        },
        "rice_sales": {
            "count": len(rice_sales), "total_qntl": round(rice_sale_qntl, 2),
            "total_amount": round(rice_sale_amount, 2),
            "details": [{"party": s.get("party_name", ""), "qntl": s.get("quantity_qntl", 0),
                "type": s.get("rice_type", ""), "rate": s.get("rate", 0),
                "amount": s.get("total_amount", 0), "vehicle": s.get("vehicle_no", "")} for s in rice_sales] if is_detail else
                [{"party": s.get("party_name", ""), "qntl": s.get("quantity_qntl", 0),
                "type": s.get("rice_type", ""), "amount": s.get("total_amount", 0)} for s in rice_sales]
        },
        "milling": {
            "count": len(milling), "paddy_input_qntl": round(milling_paddy_input, 2),
            "rice_output_qntl": round(milling_rice_output, 2),
            "frk_used_qntl": round(milling_frk_used, 2),
            "details": [{"paddy_in": m.get("paddy_input_qntl", 0), "rice_out": m.get("rice_qntl", 0),
                "type": m.get("rice_type", ""), "frk": m.get("frk_used_qntl", 0),
                "cmr_ready": m.get("cmr_delivery_qntl", 0), "outturn": m.get("outturn_pct", 0)} for m in milling] if is_detail else
                [{"paddy_in": m.get("paddy_input_qntl", 0), "rice_out": m.get("rice_qntl", 0),
                "type": m.get("rice_type", "")} for m in milling]
        },
        "dc_deliveries": {
            "count": len(dc_deliveries), "total_qntl": round(dc_delivery_qntl, 2),
            "details": [{"dc_no": d.get("dc_no", ""), "godown": d.get("godown", ""),
                "vehicle": d.get("vehicle_no", ""), "qntl": d.get("quantity_qntl", 0),
                "bags": d.get("bags", 0)} for d in dc_deliveries] if is_detail else []
        },
        "cash_flow": {
            "cash_jama": round(cash_jama, 2), "cash_nikasi": round(cash_nikasi, 2),
            "bank_jama": round(bank_jama, 2), "bank_nikasi": round(bank_nikasi, 2),
            "net_cash": round(cash_jama - cash_nikasi, 2),
            "net_bank": round(bank_jama - bank_nikasi, 2),
            "details": [{"desc": t.get("description", ""), "type": t.get("txn_type", ""),
                "account": t.get("account", ""), "category": t.get("category", ""),
                "amount": t.get("amount", 0), "party": t.get("party_name", "")} for t in cash_txns]
        },
        "payments": {
            "msp_received": round(msp_amount, 2),
            "pvt_paddy_paid": round(pvt_paid, 2),
            "rice_sale_received": round(pvt_received, 2),
            "msp_details": [{"agent": p.get("agent_name", ""), "amount": p.get("amount", 0),
                "mandi": p.get("mandi_name", "")} for p in msp] if is_detail else [],
            "pvt_payment_details": [{"party": p.get("party_name", ""), "amount": p.get("amount", 0),
                "ref_type": p.get("ref_type", ""), "mode": p.get("payment_mode", "")} for p in pvt_payments] if is_detail else []
        },
        "byproducts": {
            "count": len(bp_sales), "total_amount": round(bp_amount, 2),
            "details": [{"type": s.get("type", ""), "buyer": s.get("buyer_name", ""),
                "qty": s.get("quantity", 0), "rate": s.get("rate", 0),
                "amount": s.get("total_amount", 0)} for s in bp_sales] if is_detail else []
        },
        "frk": {
            "count": len(frk), "total_qntl": round(frk_qntl, 2), "total_amount": round(frk_amount, 2),
            "details": [{"party": f.get("party_name", ""), "qntl": f.get("quantity_qntl", 0),
                "rate": f.get("rate", 0), "amount": f.get("total_amount", 0)} for f in frk] if is_detail else []
        },
        "mill_parts": {
            "in_count": len(parts_in), "used_count": len(parts_used),
            "in_amount": round(parts_in_amount, 2),
            "in_details": [{"part": t.get("part_name", ""), "qty": t.get("quantity", 0),
                "rate": t.get("rate", 0), "party": t.get("party_name", ""),
                "bill_no": t.get("bill_no", ""), "amount": t.get("total_amount", 0)} for t in parts_in],
            "used_details": [{"part": t.get("part_name", ""), "qty": t.get("quantity", 0),
                "remark": t.get("remark", "")} for t in parts_used]
        },
        "staff_attendance": {
            "total": len(all_staff),
            "present": present_c, "absent": absent_c,
            "half_day": half_c, "holiday": holiday_c, "not_marked": not_marked_c,
            "details": staff_details
        },
        "pump_account": {
            "total_diesel": round(diesel_total_amount, 2),
            "total_paid": round(diesel_total_paid, 2),
            "balance": round(diesel_total_amount - diesel_total_paid, 2),
            "details": [{"pump": t.get("pump_name", ""), "txn_type": t.get("txn_type", ""),
                "amount": t.get("amount", 0), "truck_no": t.get("truck_no", ""),
                "mandi": t.get("mandi_name", "") or _entry_mandi_map.get(t.get("linked_entry_id", ""), "") or (t.get("description", "").split("Mandi ")[-1] if "Mandi " in t.get("description", "") else ""),
                "desc": t.get("description", "")} for t in diesel_txns]
        },
        "cash_transactions": {
            "count": len(cash_txns),
            "total_jama": round(sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "jama"), 2),
            "total_nikasi": round(sum(t.get("amount", 0) for t in cash_txns if t.get("txn_type") == "nikasi"), 2),
            "details": [{
                "date": t.get("date", date),
                "party_name": t.get("category", ""),
                "party_type": t.get("party_type", ""),
                "txn_type": t.get("txn_type", ""),
                "amount": round(t.get("amount", 0), 2),
                "description": t.get("description", ""),
                "payment_mode": "Ledger" if t.get("account") == "ledger" else ("Cash" if t.get("account") == "cash" else "Bank")
            } for t in cash_txns]
        }
    }
    return result


def _fmt_amt(val):
    if val == 0: return "0"
    return f"{val:,.0f}"


@router.get("/reports/daily/pdf")
async def export_daily_pdf(date: str, kms_year: Optional[str] = None, season: Optional[str] = None, mode: str = "normal"):
    data = await get_daily_report(date, kms_year, season, mode)

    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=25, rightMargin=25, topMargin=20, bottomMargin=20)
    styles = getSampleStyleSheet()
    elements = []

    # Custom styles
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=18, textColor=colors.HexColor('#1a365d'), spaceAfter=4)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=9, textColor=colors.grey, spaceAfter=8)
    section_style = ParagraphStyle('SectionHead', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#1a365d'),
        spaceBefore=12, spaceAfter=4, borderWidth=0, leftIndent=0)

    hdr_bg = colors.HexColor('#1a365d')
    hdr_font_color = colors.white
    alt_row = colors.HexColor('#f5f5f5')
    green = colors.HexColor('#166534')
    red = colors.HexColor('#991b1b')
    border_color = colors.HexColor('#cbd5e1')

    def make_table(headers, rows, col_widths=None, font_size=7):
        data_rows = [headers] + rows
        t = RTable(data_rows, colWidths=col_widths, repeatRows=1)
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), hdr_bg),
            ('TEXTCOLOR', (0, 0), (-1, 0), hdr_font_color),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), font_size + 1),
            ('FONTSIZE', (0, 1), (-1, -1), font_size),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, border_color),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]
        for i in range(1, len(data_rows)):
            if i % 2 == 0:
                style_cmds.append(('BACKGROUND', (0, i), (-1, i), alt_row))
        t.setStyle(TableStyle(style_cmds))
        return t

    def summary_row(label, value, color_val=None):
        return [Paragraph(f"<b>{label}</b>", styles['Normal']),
                Paragraph(f"<b>Rs. {_fmt_amt(value)}</b>", ParagraphStyle('val', parent=styles['Normal'],
                    textColor=color_val or colors.black, alignment=2))]

    is_detail = mode == "detail"
    mode_label = "DETAILED" if is_detail else "SUMMARY"

    # Title
    elements.append(Paragraph(f"Daily Report - {date}", title_style))
    elements.append(Paragraph(f"Mode: {mode_label} | KMS Year: {kms_year or 'All'} | Season: {season or 'All'}", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0')))
    elements.append(Spacer(1, 6))

    # ===== PADDY ENTRIES =====
    p = data["paddy_entries"]
    elements.append(Paragraph(f"1. Paddy Entries ({p['count']})", section_style))
    summary_data = [
        ['Total Mill W (QNTL)', 'Total BAG', 'Final W. QNTL (Auto)', 'Bag Deposite', 'Bag Issued'],
        [f"{p.get('total_mill_w', 0)/100:.2f}", str(p['total_bags']), f"{p['total_final_w']/100:.2f}",
         str(p.get('total_g_deposite', 0)), str(p.get('total_g_issued', 0))]
    ]
    st = RTable(summary_data, colWidths=[100, 90, 100, 80, 80])
    st.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e0f2fe')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(st)
    # Cash/Diesel totals
    cash_diesel_row = [
        ['Total Cash Paid', 'Total Diesel Paid'],
        [f"Rs.{_fmt_amt(p.get('total_cash_paid', 0))}", f"Rs.{_fmt_amt(p.get('total_diesel_paid', 0))}"]
    ]
    cd_t = RTable(cash_diesel_row, colWidths=[250, 250])
    cd_t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dcfce7')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(cd_t)
    if p["details"]:
        if is_detail:
            elements.append(make_table(
                ['Truck', 'Agent', 'Mandi', 'RST', 'TP', 'QNTL', 'Bags', 'G.Dep', 'GBW', 'P.Pkt', 'P.Cut', 'Mill W', 'M%', 'M.Cut', 'C%', 'D/D/P', 'Final W', 'G.Iss', 'Cash', 'Diesel'],
                [[d.get("truck_no",""), d.get("agent",""), d.get("mandi",""), d.get("rst_no",""),
                  d.get("tp_no",""),
                  f"{d.get('kg',0)/100:.2f}", str(d.get("bags",0)), str(d.get("g_deposite",0)),
                  f"{d.get('gbw_cut',0)/100:.2f}", str(d.get("plastic_bag",0)),
                  f"{d.get('p_pkt_cut',0)/100:.2f}", f"{d.get('mill_w',0)/100:.2f}",
                  str(d.get("moisture",0)), f"{(d.get('moisture_cut',0) or 0)/100:.2f}",
                  f"{d.get('cutting_percent',0)}%", str(d.get("disc_dust_poll",0)),
                  f"{d.get('final_w',0)/100:.2f}",
                  str(d.get("g_issued",0)), str(d.get("cash_paid",0)), str(d.get("diesel_paid",0))] for d in p["details"]],
                [42, 35, 38, 24, 24, 30, 24, 24, 28, 24, 26, 30, 22, 26, 24, 24, 30, 24, 30, 30],
                font_size=6
            ))
        else:
            elements.append(make_table(
                ['Truck', 'Mandi', 'Agent', 'QNTL', 'Bags', 'Mill W', 'Final W', 'Cash', 'Diesel'],
                [[d.get("truck_no",""), d.get("mandi",""), d.get("agent",""),
                  f"{d.get('kg',0)/100:.2f}", str(d.get("bags",0)),
                  f"{d.get('mill_w',0)/100:.2f}", f"{d.get('final_w',0)/100:.2f}",
                  str(d.get("cash_paid",0)), str(d.get("diesel_paid",0))] for d in p["details"]],
                [65, 60, 55, 50, 40, 55, 55, 55, 55]
            ))
    elements.append(Spacer(1, 4))

    # ===== MILLING =====
    ml = data["milling"]
    if ml["count"]:
        elements.append(Paragraph(f"2. Milling ({ml['count']})", section_style))
        sm = [['Paddy In (Q)', 'Rice Out (Q)', 'FRK Used (Q)'],
              [str(ml['paddy_input_qntl']), str(ml['rice_output_qntl']), str(ml['frk_used_qntl'])]]
        st2 = RTable(sm, colWidths=[170, 170, 170])
        st2.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#fef3c7')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(st2)
        if is_detail and ml["details"]:
            elements.append(make_table(
                ['Paddy In (Q)', 'Rice Out (Q)', 'Type', 'FRK (Q)', 'CMR Ready (Q)', 'Outturn%'],
                [[str(d.get("paddy_in",0)), str(d.get("rice_out",0)), d.get("type",""),
                  str(d.get("frk",0)), str(d.get("cmr_ready",0)), str(d.get("outturn",0))] for d in ml["details"]],
                [75, 75, 70, 60, 75, 60]
            ))
        elements.append(Spacer(1, 4))

    # ===== PRIVATE TRADING =====
    pp = data["pvt_paddy"]
    rs = data["rice_sales"]
    if pp["count"] or rs["count"]:
        elements.append(Paragraph("3. Private Trading", section_style))
        if pp["count"]:
            elements.append(Paragraph(f"<b>Paddy Purchase ({pp['count']}): {pp['total_kg']} KG | Rs. {_fmt_amt(pp['total_amount'])}</b>",
                ParagraphStyle('sub', parent=styles['Normal'], fontSize=8, spaceAfter=2)))
            if is_detail and pp["details"]:
                elements.append(make_table(
                    ['Party', 'Variety', 'KG', 'Rate', 'Amount', 'Vehicle'],
                    [[d.get("party",""), d.get("variety",""), str(d.get("kg",0)), str(d.get("rate",0)),
                      f"Rs.{_fmt_amt(d.get('amount',0))}", d.get("vehicle","")] for d in pp["details"]],
                    [90, 60, 55, 55, 75, 65]
                ))
            elif pp["details"]:
                elements.append(make_table(
                    ['Party', 'KG', 'Amount'],
                    [[d["party"], str(d["kg"]), f"Rs.{_fmt_amt(d['amount'])}"] for d in pp["details"]],
                    [200, 100, 120]
                ))
        if rs["count"]:
            elements.append(Spacer(1, 4))
            elements.append(Paragraph(f"<b>Rice Sales ({rs['count']}): {rs['total_qntl']} Q | Rs. {_fmt_amt(rs['total_amount'])}</b>",
                ParagraphStyle('sub', parent=styles['Normal'], fontSize=8, spaceAfter=2)))
            if is_detail and rs["details"]:
                elements.append(make_table(
                    ['Party', 'Qntl', 'Type', 'Rate', 'Amount', 'Vehicle'],
                    [[d.get("party",""), str(d.get("qntl",0)), d.get("type",""), str(d.get("rate",0)),
                      f"Rs.{_fmt_amt(d.get('amount',0))}", d.get("vehicle","")] for d in rs["details"]],
                    [90, 55, 60, 55, 75, 65]
                ))
            elif rs["details"]:
                elements.append(make_table(
                    ['Party', 'Qntl', 'Type', 'Amount'],
                    [[d["party"], str(d["qntl"]), d["type"], f"Rs.{_fmt_amt(d['amount'])}"] for d in rs["details"]],
                    [150, 80, 90, 100]
                ))
        elements.append(Spacer(1, 4))

    # ===== CASH FLOW =====
    cf = data["cash_flow"]
    elements.append(Paragraph("4. Cash Flow", section_style))
    cf_sum = [
        ['', 'Jama (In)', 'Nikasi (Out)', 'Net'],
        ['Cash', f"Rs.{_fmt_amt(cf['cash_jama'])}", f"Rs.{_fmt_amt(cf['cash_nikasi'])}", f"Rs.{_fmt_amt(cf['net_cash'])}"],
        ['Bank', f"Rs.{_fmt_amt(cf['bank_jama'])}", f"Rs.{_fmt_amt(cf['bank_nikasi'])}", f"Rs.{_fmt_amt(cf['net_bank'])}"],
    ]
    cft = RTable(cf_sum, colWidths=[80, 130, 130, 130])
    cf_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dcfce7')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    cft.setStyle(TableStyle(cf_style))
    elements.append(cft)
    if cf["details"]:
        if is_detail:
            elements.append(make_table(
                ['Description', 'Party', 'Category', 'Type', 'Account', 'Amount'],
                [[d.get("desc",""), d.get("party",""), d.get("category",""), d.get("type","").upper(),
                  d.get("account","").upper(), f"Rs.{_fmt_amt(d.get('amount',0))}"] for d in cf["details"]],
                [120, 70, 55, 45, 45, 70]
            ))
        else:
            elements.append(make_table(
                ['Description', 'Type', 'Account', 'Amount'],
                [[d["desc"], d["type"].upper(), d["account"].upper(), f"Rs.{_fmt_amt(d['amount'])}"] for d in cf["details"]],
                [190, 80, 80, 100]
            ))
    elements.append(Spacer(1, 4))

    # ===== PAYMENTS =====
    pay = data["payments"]
    elements.append(Paragraph("5. Payments Summary", section_style))
    pay_data = [
        ['MSP Received', 'Pvt Paddy Paid', 'Rice Sale Received'],
        [f"Rs.{_fmt_amt(pay['msp_received'])}", f"Rs.{_fmt_amt(pay['pvt_paddy_paid'])}", f"Rs.{_fmt_amt(pay['rice_sale_received'])}"]
    ]
    pt = RTable(pay_data, colWidths=[170, 170, 170])
    pt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e0e7ff')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(pt)
    if is_detail:
        if pay.get("msp_details"):
            elements.append(Paragraph("<b>MSP Payment Details:</b>", ParagraphStyle('sub', parent=styles['Normal'], fontSize=7, spaceBefore=4, spaceAfter=2)))
            elements.append(make_table(['Agent', 'Mandi', 'Amount'],
                [[d.get("agent",""), d.get("mandi",""), f"Rs.{_fmt_amt(d.get('amount',0))}"] for d in pay["msp_details"]],
                [180, 150, 120]))
        if pay.get("pvt_payment_details"):
            elements.append(Paragraph("<b>Private Payment Details:</b>", ParagraphStyle('sub', parent=styles['Normal'], fontSize=7, spaceBefore=4, spaceAfter=2)))
            elements.append(make_table(['Party', 'Type', 'Mode', 'Amount'],
                [[d.get("party",""), d.get("ref_type",""), d.get("mode",""), f"Rs.{_fmt_amt(d.get('amount',0))}"] for d in pay["pvt_payment_details"]],
                [140, 100, 80, 100]))
    elements.append(Spacer(1, 4))

    # ===== PUMP ACCOUNT =====
    pa = data.get("pump_account", {})
    if pa.get("details"):
        elements.append(Paragraph("6. Pump Account / Diesel", section_style))
        pa_sum = [
            ['Total Diesel', 'Total Paid', 'Balance'],
            [f"Rs.{_fmt_amt(pa.get('total_diesel', 0))}", f"Rs.{_fmt_amt(pa.get('total_paid', 0))}", f"Rs.{_fmt_amt(pa.get('balance', 0))}"]
        ]
        pat = RTable(pa_sum, colWidths=[170, 170, 170])
        pat.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#fff7ed')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(pat)
        elements.append(make_table(
            ['Pump', 'Type', 'Truck', 'Mandi', 'Description', 'Amount'],
            [[d.get("pump",""), "PAID" if d.get("txn_type") in ("payment","credit") else "DIESEL",
              d.get("truck_no",""), d.get("mandi",""), d.get("desc",""),
              f"Rs.{_fmt_amt(d.get('amount',0))}"] for d in pa["details"]],
            [60, 40, 60, 60, 170, 60]
        ))
        elements.append(Spacer(1, 4))

    # ===== DC DELIVERIES =====
    dc = data["dc_deliveries"]
    if dc["count"]:
        elements.append(Paragraph(f"7. DC Deliveries ({dc['count']}) - {dc['total_qntl']} Q", section_style))
        if is_detail and dc.get("details"):
            elements.append(make_table(
                ['DC No', 'Godown', 'Vehicle', 'Qntl', 'Bags'],
                [[d.get("dc_no",""), d.get("godown",""), d.get("vehicle",""),
                  str(d.get("qntl",0)), str(d.get("bags",0))] for d in dc["details"]],
                [80, 100, 100, 80, 80]
            ))

    # ===== BY-PRODUCTS =====
    bp = data["byproducts"]
    if bp["count"]:
        elements.append(Paragraph(f"8. By-Product Sales ({bp['count']}) - Rs. {_fmt_amt(bp['total_amount'])}", section_style))
        if is_detail and bp.get("details"):
            elements.append(make_table(
                ['Type', 'Buyer', 'Qty', 'Rate', 'Amount'],
                [[d.get("type",""), d.get("buyer",""), str(d.get("qty",0)),
                  str(d.get("rate",0)), f"Rs.{_fmt_amt(d.get('amount',0))}"] for d in bp["details"]],
                [90, 110, 70, 70, 90]
            ))

    # ===== FRK =====
    fk = data["frk"]
    if fk["count"]:
        elements.append(Paragraph(f"9. FRK Purchase ({fk['count']}) - {fk['total_qntl']} Q | Rs. {_fmt_amt(fk['total_amount'])}", section_style))
        if is_detail and fk.get("details"):
            elements.append(make_table(
                ['Party', 'Qntl', 'Rate', 'Amount'],
                [[d.get("party",""), str(d.get("qntl",0)), str(d.get("rate",0)),
                  f"Rs.{_fmt_amt(d.get('amount',0))}"] for d in fk["details"]],
                [150, 90, 90, 100]
            ))

    # ===== MILL PARTS STOCK =====
    mp = data["mill_parts"]
    if mp["in_count"] or mp["used_count"]:
        elements.append(Paragraph(f"10. Mill Parts Stock (In: {mp['in_count']} | Used: {mp['used_count']}) | Purchase: Rs. {_fmt_amt(mp.get('in_amount',0))}", section_style))
        if mp["in_details"]:
            elements.append(Paragraph("<b>Parts Purchased:</b>", ParagraphStyle('sub', parent=styles['Normal'], fontSize=7, spaceBefore=2, spaceAfter=2)))
            elements.append(make_table(
                ['Part', 'Qty', 'Rate', 'Party', 'Bill No', 'Amount'],
                [[d.get("part",""), str(d.get("qty",0)), str(d.get("rate",0)),
                  d.get("party",""), d.get("bill_no",""), f"Rs.{_fmt_amt(d.get('amount',0))}"] for d in mp["in_details"]],
                [80, 45, 55, 80, 60, 70]
            ))
        if mp["used_details"]:
            elements.append(Spacer(1, 3))
            elements.append(Paragraph("<b>Parts Used:</b>", ParagraphStyle('sub', parent=styles['Normal'], fontSize=7, spaceBefore=2, spaceAfter=2)))
            elements.append(make_table(
                ['Part', 'Qty', 'Remark'],
                [[d.get("part",""), str(d.get("qty",0)), d.get("remark","")] for d in mp["used_details"]],
                [150, 80, 200]
            ))

    # ===== STAFF ATTENDANCE =====
    sa = data.get("staff_attendance", {})
    if sa.get("total", 0):
        elements.append(Paragraph(f"11. Staff Attendance ({sa['total']})", section_style))
        sa_sum = [
            ['Present', 'Half Day', 'Holiday', 'Absent', 'Not Marked'],
            [str(sa.get('present', 0)), str(sa.get('half_day', 0)), str(sa.get('holiday', 0)), str(sa.get('absent', 0)), str(sa.get('not_marked', 0))]
        ]
        sat = RTable(sa_sum, colWidths=[95, 95, 95, 95, 95])
        sat.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dbeafe')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(sat)
        if sa.get("details"):
            status_map = {"present": "P", "absent": "A", "half_day": "H", "holiday": "CH", "not_marked": "-"}
            elements.append(make_table(
                ['Staff Name', 'Status'],
                [[d.get("name",""), status_map.get(d.get("status",""), d.get("status",""))] for d in sa["details"]],
                [250, 100]
            ))

    # ===== CASH TRANSACTIONS =====
    ct = data.get("cash_transactions", {})
    if ct.get("count", 0) > 0:
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(f"Cash Transactions / लेन-देन ({ct['count']})", section_style))
        ct_sum = [
            ['Total Jama', 'Total Nikasi', 'Balance'],
            [f"Rs.{_fmt_amt(ct.get('total_jama', 0))}", f"Rs.{_fmt_amt(ct.get('total_nikasi', 0))}",
             f"Rs.{_fmt_amt(ct.get('total_jama', 0) - ct.get('total_nikasi', 0))}"]
        ]
        ctt = RTable(ct_sum, colWidths=[170, 170, 170])
        ctt.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#fef3c7')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(ctt)
        if ct.get("details"):
            ct_headers = ['Date', 'Party Name', 'Type', 'Amount', 'Description', 'Mode'] if is_detail else ['Date', 'Party Name', 'Type', 'Amount', 'Mode']
            ct_rows = []
            for d in ct["details"]:
                txn_label = "JAMA" if d.get("txn_type") == "jama" else "NIKASI"
                row = [d.get("date", "")[:10], d.get("party_name", ""), txn_label, f"Rs.{_fmt_amt(d.get('amount', 0))}"]
                if is_detail:
                    row.insert(4, d.get("description", "")[:40])
                row.append(d.get("payment_mode", ""))
                ct_rows.append(row)
            ct_widths = [50, 80, 40, 60, 160, 50] if is_detail else [55, 130, 50, 80, 70]
            elements.append(make_table(ct_headers, ct_rows, ct_widths))
        elements.append(Spacer(1, 4))

    # Build
    doc.build(elements)
    buf.seek(0)
    fn = f"daily_report_{mode}_{date}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={fn}"})


@router.get("/reports/daily/excel")
async def export_daily_excel(date: str, kms_year: Optional[str] = None, season: Optional[str] = None, mode: str = "normal"):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    data = await get_daily_report(date, kms_year, season, mode)
    is_detail = mode == "detail"
    wb = Workbook()
    ws = wb.active
    ws.title = f"Daily Report {date}"
    hdr_fill = PatternFill(start_color='1a365d', end_color='1a365d', fill_type='solid')
    hdr_font = Font(bold=True, color='FFFFFF', size=9)
    bold = Font(bold=True)
    section_font = Font(bold=True, size=11, color='1a365d')
    sub_font = Font(bold=True, size=9, color='475569')
    tb = Border(left=Side(style='thin', color='cbd5e1'), right=Side(style='thin', color='cbd5e1'),
                top=Side(style='thin', color='cbd5e1'), bottom=Side(style='thin', color='cbd5e1'))
    amt_fmt = '#,##0'
    mode_label = "DETAILED" if is_detail else "SUMMARY"

    ws.merge_cells('A1:F1')
    ws['A1'] = f"Daily Report - {date} ({mode_label})"
    ws['A1'].font = Font(bold=True, size=14, color='1a365d')
    ws.merge_cells('A2:F2')
    ws['A2'] = f"KMS Year: {kms_year or 'All'} | Season: {season or 'All'}"
    ws['A2'].font = Font(size=9, color='64748b')
    row = 4

    def write_section(title):
        nonlocal row
        ws.cell(row=row, column=1, value=title).font = section_font
        row += 1

    def write_headers(headers_list):
        nonlocal row
        for i, h in enumerate(headers_list, 1):
            c = ws.cell(row=row, column=i, value=h)
            c.fill = hdr_fill; c.font = hdr_font; c.border = tb; c.alignment = Alignment(horizontal='center')
        row += 1

    def write_row(values, bold_row=False):
        nonlocal row
        for i, v in enumerate(values, 1):
            c = ws.cell(row=row, column=i, value=v)
            c.border = tb; c.font = Font(bold=bold_row, size=9)
        row += 1

    def write_sub(text):
        nonlocal row
        ws.cell(row=row, column=1, value=text).font = sub_font
        row += 1

    # Paddy Entries
    p = data["paddy_entries"]
    write_section(f"1. Paddy Entries ({p['count']})")
    write_sub(f"Total Mill W(Q): {p.get('total_mill_w',0)/100:.2f} | Bags: {p['total_bags']} | Final W(Q): {p['total_final_w']/100:.2f}")
    write_sub(f"Bag Dep: {p.get('total_g_deposite',0)} | Bag Issued: {p.get('total_g_issued',0)} | Cash: Rs.{p.get('total_cash_paid',0):,.0f} | Diesel: Rs.{p.get('total_diesel_paid',0):,.0f}")
    if p["details"]:
        if is_detail:
            write_headers(['Truck', 'Agent', 'Mandi', 'RST', 'TP', 'QNTL', 'Bags', 'G.Dep', 'GBW', 'P.Pkt', 'P.Cut', 'Mill W', 'M%', 'M.Cut', 'C%', 'D/D/P', 'Final W', 'G.Iss', 'Cash', 'Diesel'])
            for d in p["details"]:
                write_row([d.get("truck_no",""), d.get("agent",""), d.get("mandi",""), d.get("rst_no",""),
                    d.get("tp_no",""),
                    round(d.get("kg",0)/100, 2), d.get("bags",0), d.get("g_deposite",0),
                    round(d.get("gbw_cut",0)/100, 2), d.get("plastic_bag",0),
                    round(d.get("p_pkt_cut",0)/100, 2), round(d.get("mill_w",0)/100, 2),
                    d.get("moisture",0), round((d.get("moisture_cut",0) or 0)/100, 2),
                    d.get("cutting_percent",0), d.get("disc_dust_poll",0),
                    round(d.get("final_w",0)/100, 2),
                    d.get("g_issued",0), d.get("cash_paid",0), d.get("diesel_paid",0)])
        else:
            write_headers(['Truck', 'Mandi', 'Agent', 'QNTL', 'Bags', 'Mill W', 'Final W', 'Cash', 'Diesel'])
            for d in p["details"]:
                write_row([d.get("truck_no",""), d.get("mandi",""), d.get("agent",""),
                    round(d.get("kg",0)/100, 2), d.get("bags",0),
                    round(d.get("mill_w",0)/100, 2), round(d.get("final_w",0)/100, 2),
                    d.get("cash_paid",0), d.get("diesel_paid",0)])
    row += 1

    # Milling
    ml = data["milling"]
    if ml["count"]:
        write_section(f"2. Milling ({ml['count']})")
        write_sub(f"Paddy In: {ml['paddy_input_qntl']}Q | Rice Out: {ml['rice_output_qntl']}Q | FRK: {ml['frk_used_qntl']}Q")
        if is_detail and ml["details"]:
            write_headers(['Paddy In(Q)', 'Rice Out(Q)', 'Type', 'FRK(Q)', 'CMR Ready(Q)', 'Outturn%'])
            for d in ml["details"]:
                write_row([d.get("paddy_in",0), d.get("rice_out",0), d.get("type",""),
                    d.get("frk",0), d.get("cmr_ready",0), d.get("outturn",0)])
        row += 1

    # Private Trading
    pp = data["pvt_paddy"]
    rs = data["rice_sales"]
    if pp["count"] or rs["count"]:
        write_section("3. Private Trading")
        if pp["count"]:
            write_sub(f"Paddy Purchase ({pp['count']}): {pp['total_kg']} KG | Rs. {pp['total_amount']:,.0f}")
            if pp["details"]:
                if is_detail:
                    write_headers(['Party', 'Variety', 'KG', 'Rate', 'Amount', 'Vehicle'])
                    for d in pp["details"]:
                        write_row([d.get("party",""), d.get("variety",""), d.get("kg",0),
                            d.get("rate",0), d.get("amount",0), d.get("vehicle","")])
                else:
                    write_headers(['Party', 'KG', 'Amount'])
                    for d in pp["details"]:
                        write_row([d["party"], d["kg"], d["amount"]])
        if rs["count"]:
            write_sub(f"Rice Sales ({rs['count']}): {rs['total_qntl']}Q | Rs. {rs['total_amount']:,.0f}")
            if rs["details"]:
                if is_detail:
                    write_headers(['Party', 'Qntl', 'Type', 'Rate', 'Amount', 'Vehicle'])
                    for d in rs["details"]:
                        write_row([d.get("party",""), d.get("qntl",0), d.get("type",""),
                            d.get("rate",0), d.get("amount",0), d.get("vehicle","")])
                else:
                    write_headers(['Party', 'Qntl', 'Type', 'Amount'])
                    for d in rs["details"]:
                        write_row([d["party"], d["qntl"], d["type"], d["amount"]])
        row += 1

    # Cash Flow
    cf = data["cash_flow"]
    write_section("4. Cash Flow")
    write_headers(['', 'Jama (In)', 'Nikasi (Out)', 'Net'])
    write_row(['Cash', cf['cash_jama'], cf['cash_nikasi'], cf['net_cash']])
    write_row(['Bank', cf['bank_jama'], cf['bank_nikasi'], cf['net_bank']])
    if cf["details"]:
        row += 1
        if is_detail:
            write_headers(['Description', 'Party', 'Category', 'Type', 'Account', 'Amount'])
            for d in cf["details"]:
                write_row([d.get("desc",""), d.get("party",""), d.get("category",""),
                    d["type"].upper(), d["account"].upper(), d["amount"]])
        else:
            write_headers(['Description', 'Type', 'Account', 'Amount'])
            for d in cf["details"]:
                write_row([d["desc"], d["type"].upper(), d["account"].upper(), d["amount"]])
    row += 1

    # Payments
    pay = data["payments"]
    write_section("5. Payments")
    write_headers(['MSP Received', 'Pvt Paddy Paid', 'Rice Sale Received'])
    write_row([pay['msp_received'], pay['pvt_paddy_paid'], pay['rice_sale_received']])
    if is_detail:
        if pay.get("msp_details"):
            write_sub("MSP Details:")
            write_headers(['Agent', 'Mandi', 'Amount'])
            for d in pay["msp_details"]:
                write_row([d.get("agent",""), d.get("mandi",""), d.get("amount",0)])
        if pay.get("pvt_payment_details"):
            write_sub("Private Payment Details:")
            write_headers(['Party', 'Type', 'Mode', 'Amount'])
            for d in pay["pvt_payment_details"]:
                write_row([d.get("party",""), d.get("ref_type",""), d.get("mode",""), d.get("amount",0)])
    row += 1

    # Pump Account
    pa = data.get("pump_account", {})
    if pa.get("details"):
        write_section("6. Pump Account / Diesel")
        write_sub(f"Total Diesel: Rs.{pa.get('total_diesel',0):,.0f} | Paid: Rs.{pa.get('total_paid',0):,.0f} | Balance: Rs.{pa.get('balance',0):,.0f}")
        write_headers(['Pump', 'Type', 'Truck', 'Mandi', 'Description', 'Amount'])
        for d in pa["details"]:
            write_row([d.get("pump",""), "PAID" if d.get("txn_type") in ("payment","credit") else "DIESEL",
                d.get("truck_no",""), d.get("mandi",""), d.get("desc",""), d.get("amount",0)])
        row += 1

    # Mill Parts Stock
    mp = data["mill_parts"]
    if mp["in_count"] or mp["used_count"]:
        write_section(f"7. Mill Parts Stock (In: {mp['in_count']} | Used: {mp['used_count']})")
        if mp["in_details"]:
            write_sub(f"Parts Purchased - Total: Rs. {mp.get('in_amount',0):,.0f}")
            write_headers(['Part', 'Qty', 'Rate', 'Party', 'Bill No', 'Amount'])
            for d in mp["in_details"]:
                write_row([d.get("part",""), d.get("qty",0), d.get("rate",0),
                    d.get("party",""), d.get("bill_no",""), d.get("amount",0)])
        if mp["used_details"]:
            write_sub("Parts Used:")
            write_headers(['Part', 'Qty', 'Remark'])
            for d in mp["used_details"]:
                write_row([d.get("part",""), d.get("qty",0), d.get("remark","")])
    row += 1

    # By-products & FRK
    bp = data["byproducts"]
    fk = data["frk"]
    if bp["count"] or fk["count"]:
        write_section("8. Others")
        if bp["count"]:
            write_sub(f"By-Product Sales ({bp['count']}): Rs. {bp['total_amount']:,.0f}")
            if is_detail and bp.get("details"):
                write_headers(['Type', 'Buyer', 'Qty', 'Rate', 'Amount'])
                for d in bp["details"]:
                    write_row([d.get("type",""), d.get("buyer",""), d.get("qty",0), d.get("rate",0), d.get("amount",0)])
        if fk["count"]:
            write_sub(f"FRK Purchase ({fk['count']}): {fk['total_qntl']}Q | Rs. {fk['total_amount']:,.0f}")
            if is_detail and fk.get("details"):
                write_headers(['Party', 'Qntl', 'Rate', 'Amount'])
                for d in fk["details"]:
                    write_row([d.get("party",""), d.get("qntl",0), d.get("rate",0), d.get("amount",0)])

    # Staff Attendance
    sa = data.get("staff_attendance", {})
    if sa.get("total", 0):
        row += 1
        write_section(f"9. Staff Attendance ({sa['total']})")
        write_headers(['Present', 'Half Day', 'Holiday', 'Absent', 'Not Marked'])
        write_row([sa.get('present', 0), sa.get('half_day', 0), sa.get('holiday', 0), sa.get('absent', 0), sa.get('not_marked', 0)])
        if sa.get("details"):
            row += 1
            status_map = {"present": "P", "absent": "A", "half_day": "H", "holiday": "CH", "not_marked": "-"}
            write_headers(['Staff Name', 'Status'])
            for d in sa["details"]:
                write_row([d.get("name",""), status_map.get(d.get("status",""), d.get("status",""))])

    # Cash Transactions
    ct = data.get("cash_transactions", {})
    if ct.get("count", 0) > 0:
        row += 1
        write_section(f"Cash Transactions / लेन-देन ({ct['count']})")
        write_sub(f"Jama: Rs.{ct.get('total_jama',0):,.0f} | Nikasi: Rs.{ct.get('total_nikasi',0):,.0f} | Balance: Rs.{(ct.get('total_jama',0) - ct.get('total_nikasi',0)):,.0f}")
        if ct.get("details"):
            if is_detail:
                write_headers(['Date', 'Party Name', 'Type (Jama/Nikasi)', 'Amount (Rs.)', 'Description', 'Payment Mode'])
            else:
                write_headers(['Date', 'Party Name', 'Type (Jama/Nikasi)', 'Amount (Rs.)', 'Payment Mode'])
            for d in ct["details"]:
                txn_label = "Jama" if d.get("txn_type") == "jama" else "Nikasi"
                if is_detail:
                    write_row([d.get("date",""), d.get("party_name",""), txn_label, round(d.get("amount",0), 2), d.get("description",""), d.get("payment_mode","")])
                else:
                    write_row([d.get("date",""), d.get("party_name",""), txn_label, round(d.get("amount",0), 2), d.get("payment_mode","")])

    # Auto-fit column widths
    from openpyxl.utils import get_column_letter
    for col_idx in range(1, ws.max_column + 1):
        max_len = 0
        col_letter = get_column_letter(col_idx)
        for row_idx in range(1, ws.max_row + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max(max_len + 2, 8), 25)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fn = f"daily_report_{mode}_{date}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fn}"})
