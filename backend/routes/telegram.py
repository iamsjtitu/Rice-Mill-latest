from fastapi import APIRouter, HTTPException
from database import db
import httpx
import io
import logging
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

TELEGRAM_CONFIG_ID = "telegram_config"


async def get_telegram_config():
    config = await db.app_settings.find_one({"setting_id": TELEGRAM_CONFIG_ID}, {"_id": 0})
    return config


@router.get("/telegram/config")
async def get_config():
    config = await get_telegram_config()
    if not config:
        return {"bot_token": "", "chat_id": "", "schedule_time": "21:00", "enabled": False}
    # Mask the token for security
    masked = config.copy()
    if masked.get("bot_token"):
        t = masked["bot_token"]
        masked["bot_token_masked"] = t[:8] + "..." + t[-4:] if len(t) > 12 else "***"
    return masked


@router.post("/telegram/config")
async def save_config(data: dict):
    bot_token = data.get("bot_token", "").strip()
    chat_id = data.get("chat_id", "").strip()
    schedule_time = data.get("schedule_time", "21:00").strip()
    enabled = data.get("enabled", False)

    if not bot_token or not chat_id:
        raise HTTPException(status_code=400, detail="Bot Token aur Chat ID dono zaroori hain")

    # Validate bot token by calling getMe
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe", timeout=10)
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Invalid Bot Token - Telegram se verify nahi hua")
            bot_info = resp.json()
            if not bot_info.get("ok"):
                raise HTTPException(status_code=400, detail="Bot Token galat hai")
        except httpx.RequestError:
            raise HTTPException(status_code=400, detail="Telegram API se connect nahi ho paya")

    config = {
        "setting_id": TELEGRAM_CONFIG_ID,
        "bot_token": bot_token,
        "chat_id": chat_id,
        "schedule_time": schedule_time,
        "enabled": enabled,
        "bot_name": bot_info["result"].get("first_name", ""),
        "bot_username": bot_info["result"].get("username", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.app_settings.update_one(
        {"setting_id": TELEGRAM_CONFIG_ID},
        {"$set": config},
        upsert=True
    )
    return {"success": True, "message": "Telegram config save ho gayi!", "bot_name": config["bot_name"]}


@router.post("/telegram/test")
async def test_connection(data: dict):
    """Send a test message to verify bot and chat_id work"""
    bot_token = data.get("bot_token", "").strip()
    chat_id = data.get("chat_id", "").strip()

    if not bot_token or not chat_id:
        raise HTTPException(status_code=400, detail="Bot Token aur Chat ID dono zaroori hain")

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": "Navkar Agro - Test Message\nTelegram Bot connected successfully!"},
                timeout=10
            )
            result = resp.json()
            if not result.get("ok"):
                desc = result.get("description", "Unknown error")
                raise HTTPException(status_code=400, detail=f"Message nahi gaya: {desc}")
            return {"success": True, "message": "Test message bhej diya! Telegram check karein."}
        except httpx.RequestError as e:
            raise HTTPException(status_code=400, detail=f"Telegram API error: {str(e)}")


@router.post("/telegram/send-report")
async def send_daily_report_now(data: dict = None):
    """Generate today's daily report PDF and send via Telegram"""
    config = await get_telegram_config()
    if not config or not config.get("bot_token") or not config.get("chat_id"):
        raise HTTPException(status_code=400, detail="Telegram config set nahi hai. Settings mein jaake configure karein.")

    report_date = (data or {}).get("date", datetime.now().strftime("%Y-%m-%d"))
    kms_year = (data or {}).get("kms_year", "")
    season = (data or {}).get("season", "")

    # Generate the PDF using the existing daily report endpoint logic
    from routes.daily_report import get_daily_report
    try:
        report_data = await get_daily_report(report_date, kms_year or None, season or None, mode="detail")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generate nahi hua: {str(e)}")

    # Build text summary
    p = report_data.get("paddy_entries", {})
    cf = report_data.get("cash_flow", {})
    ct = report_data.get("cash_transactions", {})
    ml = report_data.get("milling", {})

    summary_text = f"Daily Report - {report_date}\n{'='*30}\n"
    summary_text += f"Paddy: {p.get('count', 0)} entries | {p.get('total_final_w', 0)/100:.2f} QNTL\n"
    if ml.get("count", 0):
        summary_text += f"Milling: {ml.get('paddy_input_qntl', 0)} Q in | {ml.get('rice_output_qntl', 0)} Q out\n"
    summary_text += f"Cash: Jama Rs.{cf.get('cash_jama', 0):,.0f} | Nikasi Rs.{cf.get('cash_nikasi', 0):,.0f} | Net Rs.{cf.get('net_cash', 0):,.0f}\n"
    summary_text += f"Bank: Jama Rs.{cf.get('bank_jama', 0):,.0f} | Nikasi Rs.{cf.get('bank_nikasi', 0):,.0f} | Net Rs.{cf.get('net_bank', 0):,.0f}\n"
    if ct.get("count", 0):
        summary_text += f"Cash Txns: {ct.get('count', 0)} | Jama Rs.{ct.get('total_jama', 0):,.0f} | Nikasi Rs.{ct.get('total_nikasi', 0):,.0f}"

    # Generate PDF in memory
    pdf_buf = await _generate_report_pdf(report_data, report_date, kms_year, season)

    # Send to Telegram
    bot_token = config["bot_token"]
    chat_id = config["chat_id"]

    async with httpx.AsyncClient() as client:
        try:
            # Send text summary first
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": summary_text},
                timeout=15
            )

            # Send PDF document
            pdf_buf.seek(0)
            files = {"document": (f"daily_report_{report_date}.pdf", pdf_buf, "application/pdf")}
            form_data = {"chat_id": chat_id, "caption": f"Daily Report - {report_date} (Detail)"}
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendDocument",
                data=form_data,
                files=files,
                timeout=30
            )
            result = resp.json()
            if not result.get("ok"):
                raise HTTPException(status_code=400, detail=f"PDF nahi gaya: {result.get('description', 'Unknown error')}")

            # Log the send
            await db.telegram_logs.insert_one({
                "date": report_date,
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "status": "success",
                "type": "manual"
            })

            return {"success": True, "message": f"Report ({report_date}) Telegram pe bhej diya!"}
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"Telegram send error: {str(e)}")


@router.get("/telegram/logs")
async def get_send_logs():
    logs = await db.telegram_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(20)
    return logs


async def _generate_report_pdf(data, date, kms_year, season):
    """Generate Daily Report PDF (reuses logic from daily_report.py)"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RTable, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=25, rightMargin=25, topMargin=20, bottomMargin=20)
    styles = getSampleStyleSheet()
    elements = []

    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=18, textColor=colors.HexColor('#1a365d'), spaceAfter=4)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=9, textColor=colors.grey, spaceAfter=8)
    section_style = ParagraphStyle('SectionHead', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor('#1a365d'),
        spaceBefore=12, spaceAfter=4)

    hdr_bg = colors.HexColor('#1a365d')
    hdr_font_color = colors.white
    alt_row = colors.HexColor('#f5f5f5')
    border_color = colors.HexColor('#cbd5e1')

    def _fmt_amt(val):
        if val == 0: return "0"
        return f"{val:,.0f}"

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

    # Title
    elements.append(Paragraph(f"Daily Report - {date}", title_style))
    elements.append(Paragraph(f"Mode: DETAILED | KMS Year: {kms_year or 'All'} | Season: {season or 'All'}", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0')))
    elements.append(Spacer(1, 6))

    # Paddy Entries
    p = data["paddy_entries"]
    elements.append(Paragraph(f"1. Paddy Entries ({p['count']})", section_style))
    summary_data = [
        ['Total Mill W (QNTL)', 'Total BAG', 'Final W. QNTL', 'Bag Deposite', 'Bag Issued'],
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
    if p["details"]:
        elements.append(make_table(
            ['Truck', 'Agent', 'Mandi', 'RST', 'TP', 'QNTL', 'Bags', 'Mill W', 'Final W', 'Cash', 'Diesel'],
            [[d.get("truck_no",""), d.get("agent",""), d.get("mandi",""), d.get("rst_no",""),
              d.get("tp_no",""), f"{d.get('kg',0)/100:.2f}", str(d.get("bags",0)),
              f"{d.get('mill_w',0)/100:.2f}", f"{d.get('final_w',0)/100:.2f}",
              str(d.get("cash_paid",0)), str(d.get("diesel_paid",0))] for d in p["details"]],
            [55, 45, 50, 30, 30, 38, 30, 42, 42, 42, 42],
            font_size=6
        ))
    elements.append(Spacer(1, 4))

    # Milling
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
        ]))
        elements.append(st2)
        elements.append(Spacer(1, 4))

    # Cash Flow
    cf = data["cash_flow"]
    elements.append(Paragraph("3. Cash Flow", section_style))
    cf_sum = [
        ['', 'Jama (In)', 'Nikasi (Out)', 'Net'],
        ['Cash', f"Rs.{_fmt_amt(cf['cash_jama'])}", f"Rs.{_fmt_amt(cf['cash_nikasi'])}", f"Rs.{_fmt_amt(cf['net_cash'])}"],
        ['Bank', f"Rs.{_fmt_amt(cf['bank_jama'])}", f"Rs.{_fmt_amt(cf['bank_nikasi'])}", f"Rs.{_fmt_amt(cf['net_bank'])}"],
    ]
    cft = RTable(cf_sum, colWidths=[80, 130, 130, 130])
    cft.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dcfce7')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
    ]))
    elements.append(cft)
    elements.append(Spacer(1, 4))

    # Cash Transactions
    ct = data.get("cash_transactions", {})
    if ct.get("count", 0) > 0:
        elements.append(Paragraph(f"4. Cash Transactions ({ct['count']})", section_style))
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
        ]))
        elements.append(ctt)
        if ct.get("details"):
            elements.append(make_table(
                ['Date', 'Party Name', 'Type', 'Amount (Rs.)', 'Description'],
                [[d.get("date", "")[:10], d.get("party_name", ""),
                  "JAMA" if d.get("txn_type") == "jama" else "NIKASI",
                  f"Rs.{_fmt_amt(d.get('amount', 0))}", d.get("description", "")] for d in ct["details"]],
                [60, 110, 50, 80, 200]
            ))

    # Payments
    pay = data["payments"]
    elements.append(Paragraph("5. Payments", section_style))
    pay_data = [
        ['MSP Received', 'Pvt Paddy Paid', 'Rice Sale Received'],
        [f"Rs.{_fmt_amt(pay['msp_received'])}", f"Rs.{_fmt_amt(pay['pvt_paddy_paid'])}", f"Rs.{_fmt_amt(pay['rice_sale_received'])}"]
    ]
    pt = RTable(pay_data, colWidths=[170, 170, 170])
    pt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e0e7ff')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    elements.append(pt)

    # Staff
    sa = data.get("staff_attendance", {})
    if sa.get("total", 0):
        elements.append(Paragraph(f"6. Staff ({sa['total']})", section_style))
        sa_sum = [
            ['Present', 'Half Day', 'Absent', 'Holiday', 'Not Marked'],
            [str(sa.get('present', 0)), str(sa.get('half_day', 0)), str(sa.get('absent', 0)),
             str(sa.get('holiday', 0)), str(sa.get('not_marked', 0))]
        ]
        sat = RTable(sa_sum, colWidths=[95, 95, 95, 95, 95])
        sat.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dbeafe')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, border_color), ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        elements.append(sat)

    doc.build(elements)
    buf.seek(0)
    return buf


async def scheduled_send_report():
    """Called by the scheduler to auto-send daily report"""
    config = await get_telegram_config()
    if not config or not config.get("enabled") or not config.get("bot_token") or not config.get("chat_id"):
        return

    today = datetime.now().strftime("%Y-%m-%d")

    # Check if already sent today
    existing = await db.telegram_logs.find_one({"date": today, "status": "success"})
    if existing:
        return

    try:
        from routes.daily_report import get_daily_report
        report_data = await get_daily_report(today, mode="detail")

        p = report_data.get("paddy_entries", {})
        cf = report_data.get("cash_flow", {})
        ct = report_data.get("cash_transactions", {})

        summary_text = f"Daily Report - {today} (Auto)\n{'='*30}\n"
        summary_text += f"Paddy: {p.get('count', 0)} entries | {p.get('total_final_w', 0)/100:.2f} QNTL\n"
        summary_text += f"Cash: Jama Rs.{cf.get('cash_jama', 0):,.0f} | Nikasi Rs.{cf.get('cash_nikasi', 0):,.0f}\n"
        summary_text += f"Bank: Jama Rs.{cf.get('bank_jama', 0):,.0f} | Nikasi Rs.{cf.get('bank_nikasi', 0):,.0f}"

        pdf_buf = await _generate_report_pdf(report_data, today, "", "")

        bot_token = config["bot_token"]
        chat_id = config["chat_id"]

        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": summary_text},
                timeout=15
            )
            pdf_buf.seek(0)
            files = {"document": (f"daily_report_{today}.pdf", pdf_buf, "application/pdf")}
            form_data = {"chat_id": chat_id, "caption": f"Daily Report - {today} (Auto)"}
            await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendDocument",
                data=form_data, files=files, timeout=30
            )

        await db.telegram_logs.insert_one({
            "date": today,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "success",
            "type": "scheduled"
        })
        logger.info(f"Telegram: Daily report sent for {today}")
    except Exception as e:
        logger.error(f"Telegram scheduled send failed: {e}")
        await db.telegram_logs.insert_one({
            "date": today,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "error": str(e),
            "type": "scheduled"
        })
