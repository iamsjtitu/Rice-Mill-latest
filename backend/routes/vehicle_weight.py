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


@router.get("/vehicle-weight/auto-notify-setting")
async def get_auto_notify_setting():
    """Get auto VW messaging setting."""
    doc = await db["settings"].find_one({"key": "auto_vw_messaging"}, {"_id": 0})
    if doc:
        return {"enabled": doc.get("enabled", False)}
    return {"enabled": False}


@router.put("/vehicle-weight/auto-notify-setting")
async def update_auto_notify_setting(data: dict):
    """Update auto VW messaging setting."""
    enabled = data.get("enabled", False)
    await db["settings"].update_one(
        {"key": "auto_vw_messaging"},
        {"$set": {"key": "auto_vw_messaging", "enabled": enabled}},
        upsert=True
    )
    return {"success": True, "enabled": enabled}


@router.post("/vehicle-weight/auto-notify")
async def auto_notify_weight(data: dict):
    """Auto-send weight details + camera images to WhatsApp & Telegram."""
    import base64

    entry_id = data.get("entry_id", "")
    front_image_b64 = data.get("front_image", "")
    side_image_b64 = data.get("side_image", "")

    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    rst = entry.get("rst_no", "?")
    text = (
        f"*Weight Slip #{rst}*\n"
        f"Vehicle: {entry.get('vehicle_no','')}\n"
        f"Party: {entry.get('party_name','')}\n"
        f"Product: {entry.get('product','')}\n"
        f"Gross: {entry.get('gross_wt', entry.get('first_wt',0)):,.0f} KG\n"
        f"Tare: {entry.get('tare_wt', entry.get('second_wt',0)):,.0f} KG\n"
        f"*Net: {entry.get('net_wt',0):,.0f} KG*\n"
    )
    cash = entry.get("cash_paid", 0) or 0
    diesel = entry.get("diesel_paid", 0) or 0
    if cash > 0:
        text += f"Cash Paid: {cash:,.0f}\n"
    if diesel > 0:
        text += f"Diesel Paid: {diesel:,.0f}\n"

    results = {"whatsapp": [], "telegram": []}
    front_bytes = base64.b64decode(front_image_b64) if front_image_b64 else None
    side_bytes = base64.b64decode(side_image_b64) if side_image_b64 else None

    # Send via WhatsApp
    try:
        from routes.whatsapp import _get_wa_settings, _send_wa_message
        wa_settings = await _get_wa_settings()
        if wa_settings.get("enabled") and wa_settings.get("api_key"):
            numbers = wa_settings.get("default_numbers", [])
            for num in numbers:
                if num:
                    r = await _send_wa_message(num.strip(), text)
                    results["whatsapp"].append(r)
    except Exception as e:
        logger.error(f"WA auto-notify error: {e}")

    # Send via Telegram
    try:
        from routes.telegram import get_telegram_config, _send_photo_to_all
        import httpx
        tg_config = await get_telegram_config()
        if tg_config and tg_config.get("bot_token") and tg_config.get("chat_ids"):
            bot_token = tg_config["bot_token"]
            chat_ids = tg_config["chat_ids"]
            async with httpx.AsyncClient() as client:
                for item in chat_ids:
                    cid = str(item.get("chat_id", "")).strip()
                    if cid:
                        await client.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": cid, "text": text, "parse_mode": "Markdown"},
                            timeout=15
                        )
            if front_bytes:
                r = await _send_photo_to_all(bot_token, chat_ids, front_bytes, f"Front View - RST #{rst}", f"front_rst{rst}.jpg")
                results["telegram"].extend(r)
            if side_bytes:
                r = await _send_photo_to_all(bot_token, chat_ids, side_bytes, f"Side View - RST #{rst}", f"side_rst{rst}.jpg")
                results["telegram"].extend(r)
    except Exception as e:
        logger.error(f"Telegram auto-notify error: {e}")

    wa_sent = sum(1 for r in results["whatsapp"] if r.get("success"))
    tg_sent = sum(1 for r in results["telegram"] if r.get("ok"))
    return {"success": True, "message": f"WA: {wa_sent} sent, TG: {tg_sent} sent", "results": results}


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


@router.post("/vehicle-weight/send-manual")
async def send_manual_weight_msg(data: dict):
    """Manual send weight text + camera photos to WhatsApp/Telegram (no PDF)."""
    import base64

    text = data.get("text", "")
    front_image_b64 = data.get("front_image", "")
    side_image_b64 = data.get("side_image", "")
    send_to_numbers = data.get("send_to_numbers", False)
    send_to_group = data.get("send_to_group", False)

    results = {"whatsapp": [], "telegram": []}
    front_bytes = base64.b64decode(front_image_b64) if front_image_b64 else None
    side_bytes = base64.b64decode(side_image_b64) if side_image_b64 else None

    # ── WhatsApp ──
    try:
        from routes.whatsapp import _get_wa_settings, _send_wa_message, _send_wa_to_group
        wa_settings = await _get_wa_settings()
        if wa_settings.get("enabled") and wa_settings.get("api_key"):
            if send_to_numbers:
                numbers = wa_settings.get("default_numbers", [])
                for num in numbers:
                    if num:
                        r = await _send_wa_message(num.strip(), text)
                        results["whatsapp"].append({"to": num, "success": r.get("success", False)})
            if send_to_group:
                group_id = wa_settings.get("default_group_id", "")
                if group_id:
                    r = await _send_wa_to_group(group_id, text)
                    results["whatsapp"].append({"to": "group", "success": r.get("success", False)})
    except Exception as e:
        logger.error(f"WA manual send error: {e}")

    # ── Telegram (text + photos) ──
    try:
        from routes.telegram import get_telegram_config, _send_photo_to_all
        import httpx
        tg_config = await get_telegram_config()
        if tg_config and tg_config.get("bot_token") and tg_config.get("chat_ids"):
            bot_token = tg_config["bot_token"]
            chat_ids = tg_config["chat_ids"]
            # Text message
            async with httpx.AsyncClient() as client:
                for item in chat_ids:
                    cid = str(item.get("chat_id", "")).strip()
                    if cid:
                        await client.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={"chat_id": cid, "text": text, "parse_mode": "Markdown"},
                            timeout=15
                        )
            # Photos
            if front_bytes:
                r = await _send_photo_to_all(bot_token, chat_ids, front_bytes, "Front View", "front.jpg")
                results["telegram"].extend(r)
            if side_bytes:
                r = await _send_photo_to_all(bot_token, chat_ids, side_bytes, "Side View", "side.jpg")
                results["telegram"].extend(r)
    except Exception as e:
        logger.error(f"TG manual send error: {e}")

    wa_sent = sum(1 for r in results["whatsapp"] if r.get("success"))
    tg_sent = sum(1 for r in results["telegram"] if r.get("ok"))
    return {"success": True, "message": f"WA: {wa_sent}, TG: {tg_sent}", "results": results}


@router.post("/vehicle-weight")
async def create_weight_entry(data: dict):
    """Create new weight entry with first weight."""
    kms_year = data.get("kms_year", "")
    # Allow custom RST number, fallback to auto-increment
    custom_rst = data.get("rst_no")
    if custom_rst and int(custom_rst) > 0:
        rst_no = int(custom_rst)
    else:
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
    """Update second weight, cash/diesel and calculate net weight."""
    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    second_wt = float(data.get("second_wt", 0) or 0)
    first_wt = entry["first_wt"]
    net_wt = abs(first_wt - second_wt)
    gross_wt = max(first_wt, second_wt)
    tare_wt = min(first_wt, second_wt)

    update_fields = {
        "second_wt": second_wt,
        "second_wt_time": datetime.now(timezone.utc).isoformat(),
        "net_wt": net_wt,
        "gross_wt": gross_wt,
        "tare_wt": tare_wt,
        "status": "completed"
    }
    # Update cash/diesel if provided during second weight capture
    if "cash_paid" in data:
        update_fields["cash_paid"] = float(data.get("cash_paid", 0) or 0)
    if "diesel_paid" in data:
        update_fields["diesel_paid"] = float(data.get("diesel_paid", 0) or 0)

    await db["vehicle_weights"].update_one(
        {"id": entry_id},
        {"$set": update_fields}
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


