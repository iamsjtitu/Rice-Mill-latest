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


@router.put("/vehicle-weight/{entry_id}/edit")
async def edit_weight_entry(entry_id: str, data: dict):
    """Edit completed weight entry (Vehicle, Party, Product, Pkts, Cash, Diesel)."""
    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_fields = {}
    editable = ["vehicle_no", "party_name", "farmer_name", "product", "tot_pkts", "cash_paid", "diesel_paid"]
    for f in editable:
        if f in data:
            if f in ("cash_paid", "diesel_paid"):
                update_fields[f] = float(data[f] or 0)
            elif f == "tot_pkts":
                update_fields[f] = data[f]
            else:
                update_fields[f] = data[f]

    if update_fields:
        await db["vehicle_weights"].update_one({"id": entry_id}, {"$set": update_fields})

    updated = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    return {"success": True, "entry": updated}


@router.get("/vehicle-weight/{entry_id}/slip-pdf")
async def weight_slip_pdf(entry_id: str):
    """Generate weight slip PDF - A5 portrait, 2 copies (Party + Customer) on single page."""
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    from fastapi.responses import StreamingResponse

    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    branding = await db["settings"].find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "JOLKO, KESINGA")

    # A5 portrait = 148mm x 210mm
    W, H = A5  # (419.53, 595.28) points
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)

    first_wt = entry.get("first_wt", 0)
    second_wt = entry.get("second_wt", 0)
    net_wt = entry.get("net_wt", 0)
    gross_wt = entry.get("gross_wt", max(first_wt, second_wt))
    tare_wt = entry.get("tare_wt", min(first_wt, second_wt))
    cash = entry.get("cash_paid", 0) or 0
    diesel = entry.get("diesel_paid", 0) or 0
    rst = entry.get("rst_no", "")

    LM = 5*mm   # left margin
    RM = 5*mm   # right margin
    PW = W - LM - RM  # printable width ~138mm

    def draw_copy(c, top_y, copy_label, show_sig):
        """Draw one copy block starting from top_y (in points from bottom)."""
        x = LM
        y = top_y
        bh = 93*mm  # block height for each copy

        # Border box
        c.setStrokeColor(colors.HexColor("#333"))
        c.setLineWidth(1.2)
        c.rect(x, y - bh, PW, bh)

        # Copy label (top right)
        c.setFont("Helvetica", 6)
        c.setFillColor(colors.HexColor("#888"))
        lw = c.stringWidth(copy_label, "Helvetica", 6)
        c.setFillColor(colors.white)
        c.rect(x + PW - lw - 14*mm, y - 0.5, lw + 4*mm, 5, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#888"))
        c.drawString(x + PW - lw - 12*mm, y + 0.5, copy_label)

        cy = y - 4*mm  # current y position inside box

        # Company name
        c.setFont("Helvetica-Bold", 13)
        c.setFillColor(colors.HexColor("#1a1a2e"))
        c.drawCentredString(W/2, cy, company)
        cy -= 3.5*mm

        # Tagline
        c.setFont("Helvetica", 6.5)
        c.setFillColor(colors.gray)
        c.drawCentredString(W/2, cy, tagline)
        cy -= 3*mm

        # Line under header
        c.setStrokeColor(colors.HexColor("#1a1a2e"))
        c.setLineWidth(1.2)
        c.line(x + 2*mm, cy, x + PW - 2*mm, cy)
        cy -= 3.5*mm

        # Slip title
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(colors.HexColor("#444"))
        c.drawCentredString(W/2, cy, "WEIGHT SLIP")
        cy -= 4.5*mm

        # ── Info Grid (4 rows x 4 cols) ──
        rows = [
            ("RST No.", f"#{rst}", "Date", entry.get("date", "")),
            ("Vehicle", entry.get("vehicle_no", ""), "Trans", entry.get("trans_type", "")),
            ("Party", entry.get("party_name", ""), "Farmer", entry.get("farmer_name", "")),
            ("Product", entry.get("product", ""), "Bags", str(entry.get("tot_pkts", 0))),
        ]
        rh = 3.8*mm  # row height
        c1w = 16*mm  # label col width
        c2w = 42*mm  # value col width
        c3w = 14*mm
        c4w = PW - c1w - c2w - c3w - 2*mm

        for i, (l1, v1, l2, v2) in enumerate(rows):
            ry = cy - i * rh
            # Grid lines
            c.setStrokeColor(colors.HexColor("#ddd"))
            c.setLineWidth(0.3)
            c.line(x + 2*mm, ry - 1*mm, x + PW - 2*mm, ry - 1*mm)

            c.setFont("Helvetica-Bold", 7.5)
            c.setFillColor(colors.HexColor("#555"))
            c.drawString(x + 3*mm, ry, l1)

            fsize = 9 if i == 0 else 8
            c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", fsize)
            c.setFillColor(colors.HexColor("#000"))
            c.drawString(x + 3*mm + c1w, ry, str(v1)[:22])

            c.setFont("Helvetica-Bold", 7.5)
            c.setFillColor(colors.HexColor("#555"))
            c.drawString(x + 3*mm + c1w + c2w, ry, l2)

            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#000"))
            c.drawString(x + 3*mm + c1w + c2w + c3w, ry, str(v2)[:22])

        cy -= len(rows) * rh + 3*mm

        # ── Weight boxes (Gross | Tare | Net + optional Cash/Diesel) ──
        wt_items = [
            ("Gross", f"{gross_wt:,.0f} KG", "#f5f5f5", "#111"),
            ("Tare", f"{tare_wt:,.0f} KG", "#f5f5f5", "#111"),
            ("Net", f"{net_wt:,.0f} KG", "#e8f5e9", "#1b5e20"),
        ]
        if cash > 0:
            wt_items.append(("Cash", f"{cash:,.0f}", "#fff8e1", "#e65100"))
        if diesel > 0:
            wt_items.append(("Diesel", f"{diesel:,.0f}", "#fff8e1", "#e65100"))

        num_cols = len(wt_items)
        col_w = (PW - 4*mm) / num_cols
        box_h = 10*mm

        for i, (label, val, bg, fg) in enumerate(wt_items):
            bx = x + 2*mm + i * col_w
            # Background
            c.setFillColor(colors.HexColor(bg))
            c.rect(bx, cy - box_h, col_w - 0.8*mm, box_h, fill=1, stroke=0)
            # Border
            bc = "#388e3c" if label == "Net" else "#f9a825" if label in ("Cash", "Diesel") else "#bbb"
            c.setStrokeColor(colors.HexColor(bc))
            c.setLineWidth(0.6 if label == "Net" else 0.4)
            c.rect(bx, cy - box_h, col_w - 0.8*mm, box_h)
            # Label
            c.setFont("Helvetica", 5.5)
            c.setFillColor(colors.HexColor("#666"))
            c.drawCentredString(bx + (col_w - 0.8*mm)/2, cy - 3*mm, label)
            # Value
            fz = 12 if label == "Net" else 9 if label in ("Cash", "Diesel") else 10
            c.setFont("Helvetica-Bold", fz)
            c.setFillColor(colors.HexColor(fg))
            c.drawCentredString(bx + (col_w - 0.8*mm)/2, cy - 8*mm, val)

        cy -= box_h + 3*mm

        # ── Signature section (only Customer copy) ──
        if show_sig:
            sig_w = 35*mm
            # Left sig
            c.setStrokeColor(colors.HexColor("#333"))
            c.setLineWidth(0.5)
            c.line(x + 8*mm, cy - 8*mm, x + 8*mm + sig_w, cy - 8*mm)
            c.setFont("Helvetica", 5.5)
            c.setFillColor(colors.HexColor("#666"))
            c.drawCentredString(x + 8*mm + sig_w/2, cy - 11*mm, "Driver")
            # Right sig
            c.line(x + PW - 8*mm - sig_w, cy - 8*mm, x + PW - 8*mm, cy - 8*mm)
            c.drawCentredString(x + PW - 8*mm - sig_w/2, cy - 11*mm, "Authorized")

        # Footer
        c.setFont("Helvetica", 4.5)
        c.setFillColor(colors.HexColor("#bbb"))
        c.drawCentredString(W/2, y - bh + 1.5*mm, f"{company} | Computer Generated")

    # Draw 2 copies
    top_margin = 5*mm
    copy1_top = H - top_margin
    draw_copy(c, copy1_top, "PARTY COPY", False)

    # Cut line
    cut_y = copy1_top - 93*mm - 4*mm
    c.setStrokeColor(colors.HexColor("#aaa"))
    c.setDash(3, 3)
    c.setLineWidth(0.8)
    c.line(LM, cut_y, W - RM, cut_y)
    c.setDash()
    c.setFont("Helvetica", 5)
    c.setFillColor(colors.HexColor("#aaa"))
    c.drawCentredString(W/2, cut_y + 1, "- - - CUT HERE - - -")

    copy2_top = cut_y - 3*mm
    draw_copy(c, copy2_top, "CUSTOMER COPY", True)

    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=WeightSlip_RST{rst}.pdf"})


