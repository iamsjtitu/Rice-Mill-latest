"""Vehicle Weight Entry - Weighbridge management for Rice Mill"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from database import db
from datetime import datetime, timezone
import uuid
import logging
import io
import os
import base64 as b64mod
from utils.date_format import fmt_date

router = APIRouter()
logger = logging.getLogger(__name__)

IMG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "vw_images")
os.makedirs(IMG_DIR, exist_ok=True)


def _save_image(entry_id: str, tag: str, b64data) -> str:
    try:
        if not b64data or not isinstance(b64data, str):
            return ""
        raw = b64data
        # Strip data URL prefix if present (data:image/jpeg;base64,...)
        if raw.startswith("data:"):
            comma_idx = raw.find(",")
            if comma_idx > 0:
                raw = raw[comma_idx + 1:]
        if not raw or len(raw) < 100:
            return ""
        filename = f"{entry_id}_{tag}.jpg"
        with open(os.path.join(IMG_DIR, filename), "wb") as f:
            f.write(b64mod.b64decode(raw))
        return filename
    except Exception as e:
        print(f"[VW] save_image error: {e}")
        return ""


def _load_image_b64(filename: str) -> str:
    if not filename:
        return ""
    fp = os.path.join(IMG_DIR, filename)
    if os.path.exists(fp):
        with open(fp, "rb") as f:
            return b64mod.b64encode(f.read()).decode()
    return ""


@router.get("/vehicle-weight/image/{filename}")
async def serve_image(filename: str):
    """Serve a saved vehicle weight image file (for WhatsApp media_url)."""
    fp = os.path.join(IMG_DIR, filename)
    if not os.path.exists(fp):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(fp, media_type="image/jpeg")


@router.get("/vehicle-weight/{entry_id}/photos")
async def get_entry_photos(entry_id: str):
    """Get all photos for a vehicle weight entry as base64."""
    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {
        "entry_id": entry_id,
        "rst_no": entry.get("rst_no"),
        "date": entry.get("date", ""),
        "vehicle_no": entry.get("vehicle_no", ""),
        "party_name": entry.get("party_name", ""),
        "farmer_name": entry.get("farmer_name", ""),
        "product": entry.get("product", ""),
        "trans_type": entry.get("trans_type", ""),
        "tot_pkts": entry.get("tot_pkts", 0),
        "first_wt": entry.get("first_wt", 0),
        "first_wt_time": entry.get("first_wt_time", ""),
        "second_wt": entry.get("second_wt", 0),
        "second_wt_time": entry.get("second_wt_time", ""),
        "net_wt": entry.get("net_wt", 0),
        "remark": entry.get("remark", ""),
        "cash_paid": entry.get("cash_paid", 0),
        "diesel_paid": entry.get("diesel_paid", 0),
        "g_issued": entry.get("g_issued", 0),
        "tp_no": entry.get("tp_no", ""),
        "first_wt_front_img": _load_image_b64(entry.get("first_wt_front_img", "")),
        "first_wt_side_img": _load_image_b64(entry.get("first_wt_side_img", "")),
        "second_wt_front_img": _load_image_b64(entry.get("second_wt_front_img", "")),
        "second_wt_side_img": _load_image_b64(entry.get("second_wt_side_img", "")),
    }


async def _next_rst(kms_year: str = ""):
    """Auto-increment RST number for current KMS year with duplicate prevention."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    cursor = db["vehicle_weights"].find(query, {"_id": 0, "rst_no": 1})
    docs = await cursor.to_list(length=50000)
    if not docs:
        return 1
    # Collect all used RST numbers
    used_rsts = set()
    for d in docs:
        try:
            used_rsts.add(int(d.get("rst_no", 0) or 0))
        except (ValueError, TypeError):
            pass
    max_rst = max(used_rsts) if used_rsts else 0
    next_rst = max_rst + 1
    return next_rst


@router.get("/vehicle-weight")
async def list_weights(kms_year: str = "", status: str = "", page: int = 1, page_size: int = 200,
                       date_from: str = "", date_to: str = "", vehicle_no: str = "",
                       party_name: str = "", farmer_name: str = "", rst_no: str = ""):
    """List weight entries with pagination and filters."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    if status:
        query["status"] = status
    if date_from or date_to:
        date_q = {}
        if date_from: date_q["$gte"] = date_from
        if date_to: date_q["$lte"] = date_to
        query["date"] = date_q
    if vehicle_no:
        query["vehicle_no"] = {"$regex": vehicle_no, "$options": "i"}
    if party_name:
        query["party_name"] = {"$regex": party_name, "$options": "i"}
    if farmer_name:
        query["farmer_name"] = {"$regex": farmer_name, "$options": "i"}
    if rst_no:
        try: query["rst_no"] = int(rst_no)
        except: pass
    total_count = await db["vehicle_weights"].count_documents(query)
    if page_size < 1: page_size = 200
    if page < 1: page = 1
    skip = (page - 1) * page_size
    items = await db["vehicle_weights"].find(query, {"_id": 0}).sort([("date", -1), ("rst_no", -1)]).skip(skip).limit(page_size).to_list(page_size)
    return {"entries": items, "count": len(items), "total": total_count, "page": page, "page_size": page_size, "total_pages": max(1, (total_count + page_size - 1) // page_size)}


@router.get("/vehicle-weight/pending")
async def pending_vehicles(kms_year: str = ""):
    """Get vehicles with only first weight (waiting for second weight)."""
    query = {"status": "pending"}
    if kms_year:
        query["kms_year"] = kms_year
    cursor = db["vehicle_weights"].find(query, {"_id": 0}).sort([("date", -1), ("rst_no", -1)])
    items = await cursor.to_list(length=100)
    return {"pending": items, "count": len(items)}


@router.get("/vehicle-weight/next-rst")
async def get_next_rst(kms_year: str = ""):
    """Get next RST number."""
    rst = await _next_rst(kms_year)
    return {"rst_no": rst}


@router.get("/settings/vw-date-lock")
async def get_vw_date_lock():
    doc = await db["settings"].find_one({"key": "vw_date_lock"}, {"_id": 0})
    return {"locked": doc.get("locked", False) if doc else False}


@router.put("/settings/vw-date-lock")
async def update_vw_date_lock(data: dict):
    locked = data.get("locked", False)
    await db["settings"].update_one(
        {"key": "vw_date_lock"},
        {"$set": {"key": "vw_date_lock", "locked": locked}},
        upsert=True
    )
    return {"success": True, "locked": locked}


@router.get("/vehicle-weight/rst-edit-setting")
async def get_rst_edit_setting():
    """Get manual RST edit toggle setting."""
    doc = await db["settings"].find_one({"key": "manual_rst_edit"}, {"_id": 0})
    return {"enabled": doc.get("enabled", False) if doc else False}


@router.put("/vehicle-weight/rst-edit-setting")
async def update_rst_edit_setting(data: dict):
    """Toggle manual RST edit on/off."""
    enabled = data.get("enabled", False)
    await db["settings"].update_one(
        {"key": "manual_rst_edit"},
        {"$set": {"key": "manual_rst_edit", "enabled": enabled}},
        upsert=True
    )
    return {"success": True, "enabled": enabled}


@router.get("/vehicle-weight/auto-notify-setting")
async def get_auto_notify_setting():
    """Get auto VW messaging setting with group config."""
    doc = await db["settings"].find_one({"key": "auto_vw_messaging"}, {"_id": 0})
    if doc:
        return {
            "enabled": doc.get("enabled", False),
            "wa_group_id": doc.get("wa_group_id", ""),
            "wa_group_name": doc.get("wa_group_name", ""),
            "tg_chat_ids": doc.get("tg_chat_ids", []),
        }
    return {"enabled": False, "wa_group_id": "", "wa_group_name": "", "tg_chat_ids": []}


@router.put("/vehicle-weight/auto-notify-setting")
async def update_auto_notify_setting(data: dict):
    """Update auto VW messaging setting with group config."""
    update_fields = {"key": "auto_vw_messaging"}
    if "enabled" in data:
        update_fields["enabled"] = data["enabled"]
    if "wa_group_id" in data:
        update_fields["wa_group_id"] = data["wa_group_id"]
    if "wa_group_name" in data:
        update_fields["wa_group_name"] = data["wa_group_name"]
    if "tg_chat_ids" in data:
        update_fields["tg_chat_ids"] = data["tg_chat_ids"]
    await db["settings"].update_one(
        {"key": "auto_vw_messaging"},
        {"$set": update_fields},
        upsert=True
    )
    return {"success": True, **{k: v for k, v in update_fields.items() if k != "key"}}


@router.post("/vehicle-weight/auto-notify")
async def auto_notify_weight(data: dict):
    """Auto-send weight details + stored camera images to WhatsApp & Telegram."""
    import base64

    entry_id = data.get("entry_id", "")

    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    rst = entry.get("rst_no", "?")
    pkts = entry.get("tot_pkts", entry.get("pkts", 0)) or 0
    farmer = entry.get("farmer_name", "") or ""
    mandi = entry.get("mandi_name", "") or ""
    farmer_mandi = farmer if farmer else mandi
    text = (
        f"*Weight Slip — RST #{rst}*\n"
        f"Date: {entry.get('date','')}\n"
        f"Vehicle: {entry.get('vehicle_no','')}\n"
        f"Trans: {entry.get('trans_type','')}\n"
        f"Party: {entry.get('party_name','')}\n"
    )
    if farmer_mandi:
        text += f"Source/Mandi: {farmer_mandi}\n"
    text += (
        f"Product: {entry.get('product','')}\n"
        f"Bags: {pkts if pkts > 0 else '-'}\n"
        f"───────────────\n"
        f"Gross Wt: {entry.get('gross_wt', entry.get('first_wt',0)):,.0f} KG\n"
        f"Tare Wt: {entry.get('tare_wt', entry.get('second_wt',0)):,.0f} KG\n"
        f"*Net Wt: {entry.get('net_wt',0):,.0f} KG*\n"
        f"───────────────\n"
    )
    cash = entry.get("cash_paid", 0) or 0
    diesel = entry.get("diesel_paid", 0) or 0
    g_issued = float(entry.get("g_issued", 0) or 0)
    if g_issued > 0:
        text += f"G.Issued: {g_issued:,.0f}\n"
    tp_no = entry.get("tp_no", "")
    if tp_no:
        text += f"TP: {tp_no}\n"
    remark = entry.get("remark", "")
    if remark:
        text += f"Remark: {remark}\n"
    if cash > 0:
        text += f"Cash Paid: \u20b9{cash:,.0f}\n"
    if diesel > 0:
        text += f"Diesel Paid: \u20b9{diesel:,.0f}\n"
    if cash > 0 or diesel > 0:
        text += f"───────────────\n"

    results = {"whatsapp": [], "telegram": []}

    # Load saved camera images from disk
    first_front_b64 = _load_image_b64(entry.get("first_wt_front_img", ""))
    first_side_b64 = _load_image_b64(entry.get("first_wt_side_img", ""))
    second_front_b64 = _load_image_b64(entry.get("second_wt_front_img", ""))
    second_side_b64 = _load_image_b64(entry.get("second_wt_side_img", ""))

    # Build public image URLs for WhatsApp media
    base_url = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    img_urls = {}
    for key in ["first_wt_front_img", "first_wt_side_img", "second_wt_front_img", "second_wt_side_img"]:
        fname = entry.get(key, "")
        if fname and base_url:
            img_urls[key] = f"{base_url}/api/vehicle-weight/image/{fname}"

    # Get VW-specific messaging config
    vw_config = await db["settings"].find_one({"key": "auto_vw_messaging"}, {"_id": 0}) or {}
    vw_wa_group_id = vw_config.get("wa_group_id", "")
    vw_tg_chat_ids = vw_config.get("tg_chat_ids", [])

    # Send via WhatsApp to VW-specific group (or fallback to default numbers)
    try:
        from routes.whatsapp import _get_wa_settings, _send_wa_message, _send_wa_to_group
        wa_settings = await _get_wa_settings()
        if wa_settings.get("enabled") and wa_settings.get("api_key"):
            if vw_wa_group_id:
                # Send text to VW group
                r = await _send_wa_to_group(vw_wa_group_id, text)
                results["whatsapp"].append(r)
                # Send photos to VW group
                for key, label in [("first_wt_front_img", "1st Wt Front"), ("first_wt_side_img", "1st Wt Side"), ("second_wt_front_img", "2nd Wt Front"), ("second_wt_side_img", "2nd Wt Side")]:
                    if key in img_urls:
                        r = await _send_wa_to_group(vw_wa_group_id, f"{label} - RST #{rst}", img_urls[key])
                        results["whatsapp"].append(r)
            else:
                # Fallback: send to default numbers
                numbers = wa_settings.get("default_numbers", [])
                for num in numbers:
                    if num:
                        r = await _send_wa_message(num.strip(), text)
                        results["whatsapp"].append(r)
                        # Send photos to individual numbers
                        for key, label in [("first_wt_front_img", "1st Wt Front"), ("first_wt_side_img", "1st Wt Side"), ("second_wt_front_img", "2nd Wt Front"), ("second_wt_side_img", "2nd Wt Side")]:
                            if key in img_urls:
                                r = await _send_wa_message(num.strip(), f"{label} - RST #{rst}", img_urls[key])
                                results["whatsapp"].append(r)
    except Exception as e:
        logger.error(f"WA auto-notify error: {e}")

    # Send via Telegram to VW-specific chats (or fallback to default config)
    try:
        from routes.telegram import get_telegram_config, _send_photo_to_all
        import httpx
        tg_config = await get_telegram_config()
        if tg_config and tg_config.get("bot_token"):
            bot_token = tg_config["bot_token"]
            # Use VW-specific chat IDs if set, otherwise fallback to default
            chat_ids = vw_tg_chat_ids if vw_tg_chat_ids and len(vw_tg_chat_ids) > 0 else (tg_config.get("chat_ids") or [])
            if chat_ids:
                async with httpx.AsyncClient() as client:
                    for item in chat_ids:
                        cid = str(item.get("chat_id", "")).strip()
                        if cid:
                            await client.post(
                                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                                json={"chat_id": cid, "text": text, "parse_mode": "Markdown"},
                                timeout=15
                            )
                # Send 1st weight photos
                if first_front_b64:
                    r = await _send_photo_to_all(bot_token, chat_ids, base64.b64decode(first_front_b64), f"1st Weight Front - RST #{rst}", f"1st_front_rst{rst}.jpg")
                    results["telegram"].extend(r)
                if first_side_b64:
                    r = await _send_photo_to_all(bot_token, chat_ids, base64.b64decode(first_side_b64), f"1st Weight Side - RST #{rst}", f"1st_side_rst{rst}.jpg")
                    results["telegram"].extend(r)
                # Send 2nd weight photos
                if second_front_b64:
                    r = await _send_photo_to_all(bot_token, chat_ids, base64.b64decode(second_front_b64), f"2nd Weight Front - RST #{rst}", f"2nd_front_rst{rst}.jpg")
                    results["telegram"].extend(r)
                if second_side_b64:
                    r = await _send_photo_to_all(bot_token, chat_ids, base64.b64decode(second_side_b64), f"2nd Weight Side - RST #{rst}", f"2nd_side_rst{rst}.jpg")
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


@router.get("/vehicle-weight/linked-rst")
async def get_linked_rst(kms_year: str = ""):
    """Get RST numbers from Mill Entries that are linked to Vehicle Weight entries."""
    query = {}
    if kms_year:
        query["kms_year"] = kms_year
    # Get all RST numbers from mill_entries
    entries = await db["mill_entries"].find(query, {"_id": 0, "rst_no": 1}).to_list(50000)
    linked = set()
    for e in entries:
        r = e.get("rst_no", "")
        if r and r.strip():
            try: linked.add(int(r))
            except: pass
    return {"linked_rst": list(linked)}


@router.get("/vehicle-weight/pending-count")
async def get_pending_vw_count(kms_year: str = ""):
    """Count VW entries that don't have a corresponding Mill Entry."""
    vw_query = {"status": "completed"}
    me_query = {}
    if kms_year:
        vw_query["kms_year"] = kms_year
        me_query["kms_year"] = kms_year
    # Get all VW RST numbers
    vw_entries = await db["vehicle_weights"].find(vw_query, {"_id": 0, "rst_no": 1}).to_list(50000)
    vw_rsts = set()
    for e in vw_entries:
        r = e.get("rst_no")
        if r is not None:
            try: vw_rsts.add(int(r))
            except: pass
    # Get all Mill Entry RST numbers
    me_entries = await db["mill_entries"].find(me_query, {"_id": 0, "rst_no": 1}).to_list(50000)
    linked = set()
    for e in me_entries:
        r = e.get("rst_no", "")
        if r and r.strip():
            try: linked.add(int(r))
            except: pass
    pending = vw_rsts - linked
    return {"pending_count": len(pending), "total_vw": len(vw_rsts), "linked": len(linked & vw_rsts)}



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
        # Check for duplicate RST in same kms_year
        dup_query = {"rst_no": rst_no}
        if kms_year:
            dup_query["kms_year"] = kms_year
        existing = await db["vehicle_weights"].find_one(dup_query)
        if existing:
            raise HTTPException(status_code=400, detail=f"RST #{rst_no} already exists! Duplicate RST number.")
    else:
        rst_no = await _next_rst(kms_year)
        # Double-check no duplicate exists (race condition guard)
        dup_check = {"rst_no": rst_no}
        if kms_year:
            dup_check["kms_year"] = kms_year
        if await db["vehicle_weights"].find_one(dup_check):
            # Recalculate to be safe
            rst_no = await _next_rst(kms_year)

    entry = {
        "id": str(uuid.uuid4()),
        "rst_no": rst_no,
        "date": data.get("date", datetime.now().strftime("%Y-%m-%d")),
        "kms_year": kms_year,
        "vehicle_no": (data.get("vehicle_no", "") or "").strip().upper(),
        "party_name": (data.get("party_name", "") or "").strip(),
        "tp_no": (data.get("tp_no", "") or "").strip(),
        "g_issued": float(data.get("g_issued", 0) or 0),
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

    eid = entry["id"]
    entry["first_wt_front_img"] = _save_image(eid, "1st_front", data.get("first_wt_front_img", ""))
    entry["first_wt_side_img"] = _save_image(eid, "1st_side", data.get("first_wt_side_img", ""))

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
    # Save second weight camera photos
    front_img = _save_image(entry_id, "2nd_front", data.get("second_wt_front_img", ""))
    side_img = _save_image(entry_id, "2nd_side", data.get("second_wt_side_img", ""))
    if front_img:
        update_fields["second_wt_front_img"] = front_img
    if side_img:
        update_fields["second_wt_side_img"] = side_img
    # Update cash/diesel if provided during second weight capture
    if "cash_paid" in data:
        update_fields["cash_paid"] = float(data.get("cash_paid", 0) or 0)
    if "diesel_paid" in data:
        update_fields["diesel_paid"] = float(data.get("diesel_paid", 0) or 0)
    if "g_issued" in data:
        update_fields["g_issued"] = float(data.get("g_issued", 0) or 0)
    if "tp_no" in data:
        update_fields["tp_no"] = str(data.get("tp_no", "")).strip()

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
    editable = ["vehicle_no", "party_name", "farmer_name", "product", "tot_pkts", "cash_paid", "diesel_paid", "g_issued", "tp_no", "remark"]
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
async def weight_slip_pdf(entry_id: str, party_only: int = 0):
    """Generate weight slip PDF - A5 portrait. party_only=1 for single Party Copy (download), 0 for 2 copies (print)."""
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    from fastapi.responses import StreamingResponse

    entry = await db["vehicle_weights"].find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    from utils.branding_helper import get_branding_data
    from utils.export_helpers import register_hindi_fonts
    register_hindi_fonts()
    branding = await get_branding_data()
    company = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "JOLKO, KESINGA")
    custom_fields = branding.get("custom_fields", [])
    above_parts, below_parts = [], []
    for f in custom_fields:
        val = f.get("value", "").strip()
        if not val: continue
        lbl = f.get("label", "").strip()
        txt = f"{lbl}: {val}" if lbl else val
        if f.get("placement", "below") == "above":
            above_parts.append(txt)
        else:
            below_parts.append(txt)
    above_text = "  |  ".join(above_parts) if above_parts else ""
    below_text = "  |  ".join(below_parts) if below_parts else ""

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
        bh = 95*mm  # block height for each copy

        # Border box (outer)
        c.setStrokeColor(colors.HexColor("#1a1a2e"))
        c.setLineWidth(2)
        c.rect(x, y - bh, PW, bh)

        # Copy label (top right on border)
        c.setFont("Helvetica-Bold", 7)
        lw = c.stringWidth(copy_label, "Helvetica-Bold", 7)
        c.setFillColor(colors.white)
        c.rect(x + PW - lw - 14*mm, y - 1, lw + 4*mm, 6, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#888"))
        c.drawString(x + PW - lw - 12*mm, y + 0.5, copy_label)

        cy = y - 5*mm

        # Custom fields ABOVE company name
        if above_text:
            c.setFont("FreeSans", 8)
            c.setFillColor(colors.HexColor("#8B0000"))
            c.drawCentredString(W/2, cy, above_text)
            cy -= 4.5*mm

        # Company name - large bold
        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(colors.HexColor("#000"))
        c.drawCentredString(W/2, cy, company)
        cy -= 5.5*mm

        # Tagline
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.gray)
        c.drawCentredString(W/2, cy, tagline)
        cy -= 3.5*mm

        # Custom fields BELOW tagline
        if below_text:
            c.setFont("FreeSans", 7)
            c.setFillColor(colors.HexColor("#374151"))
            c.drawCentredString(W/2, cy, below_text)
            cy -= 3*mm

        # Slip title
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#333"))
        c.drawCentredString(W/2, cy, "WEIGHT SLIP / \u0924\u094c\u0932 \u092a\u0930\u094d\u091a\u0940")
        cy -= 2*mm

        # ── Bordered Info Table (4 rows x 4 cols) ──
        # Header separator line
        c.setStrokeColor(colors.HexColor("#1a1a2e"))
        c.setLineWidth(1.5)
        c.line(x, cy, x + PW, cy)

        rows = [
            ("RST No.", f"#{rst}", "Date / \u0926\u093f\u0928\u093e\u0902\u0915", fmt_date(entry.get("date", ""))),
            ("Vehicle / \u0917\u093e\u0921\u093c\u0940", entry.get("vehicle_no", ""), "Trans Type", entry.get("trans_type", "")),
            ("Party / \u092a\u093e\u0930\u094d\u091f\u0940", entry.get("party_name", ""), "Source/Mandi", entry.get("farmer_name", "")),
            ("Product / \u092e\u093e\u0932", entry.get("product", ""), "Bags / \u092c\u094b\u0930\u0947", str(entry.get("tot_pkts", 0))),
        ]
        g_issued = float(entry.get("g_issued", 0) or 0)
        tp_no = entry.get("tp_no", "") or ""
        remark_text = entry.get("remark", "") or ""
        if g_issued > 0:
            rows.append(("G.Issued", f"{g_issued:,.0f}", "TP No.", tp_no or "-"))
        elif tp_no:
            rows.append(("TP No.", tp_no, "", ""))
        if remark_text:
            rows.append(("Remark", remark_text, "", ""))
        rh = 6*mm  # row height - taller for proper table cells
        table_x = x
        c1w = PW * 0.18   # label col 1
        c2w = PW * 0.32   # value col 1
        c3w = PW * 0.18   # label col 2
        c4w = PW * 0.32   # value col 2

        for i, (l1, v1, l2, v2) in enumerate(rows):
            row_top = cy - i * rh
            row_bottom = row_top - rh

            # Draw cell borders
            c.setStrokeColor(colors.HexColor("#999"))
            c.setLineWidth(0.5)
            # Horizontal line at bottom of row
            c.line(table_x, row_bottom, table_x + PW, row_bottom)
            # Vertical lines for column separators
            c.line(table_x + c1w, row_top, table_x + c1w, row_bottom)
            c.line(table_x + c1w + c2w, row_top, table_x + c1w + c2w, row_bottom)
            c.line(table_x + c1w + c2w + c3w, row_top, table_x + c1w + c2w + c3w, row_bottom)

            # Text vertical center in cell
            text_y = row_top - rh * 0.65

            # Label 1
            c.setFont("FreeSans", 8)
            c.setFillColor(colors.HexColor("#333"))
            c.drawString(table_x + 2*mm, text_y, l1)

            # Value 1 - bold
            c.setFont("FreeSansBold" if i == 0 else "FreeSans", 10 if i == 0 else 9)
            c.setFillColor(colors.HexColor("#000"))
            c.drawString(table_x + c1w + 2*mm, text_y, str(v1)[:22])

            # Label 2
            c.setFont("FreeSans", 8)
            c.setFillColor(colors.HexColor("#333"))
            c.drawString(table_x + c1w + c2w + 2*mm, text_y, l2)

            # Value 2 - bold
            c.setFont("FreeSansBold" if i == 0 else "FreeSans", 10 if i == 0 else 9)
            c.setFillColor(colors.HexColor("#000"))
            c.drawString(table_x + c1w + c2w + c3w + 2*mm, text_y, str(v2)[:22])

        cy -= len(rows) * rh

        # Thick line separating table from weight boxes
        c.setStrokeColor(colors.HexColor("#1a1a2e"))
        c.setLineWidth(1.5)
        c.line(x, cy, x + PW, cy)
        cy -= 1*mm

        # ── Weight boxes (Gross | Tare | Net + optional Cash/Diesel) ──
        wt_items = [
            ("GROSS / \u0915\u0941\u0932", f"{gross_wt:,.0f} KG", "#f0f0f0", "#000", "#999"),
            ("TARE / \u0916\u093e\u0932\u0940", f"{tare_wt:,.0f} KG", "#f0f0f0", "#000", "#999"),
            ("NET / \u0936\u0941\u0926\u094d\u0927", f"{net_wt:,.0f} KG", "#dcf5dc", "#1b5e20", "#2e7d32"),
        ]
        if cash > 0:
            wt_items.append(("CASH / \u0928\u0915\u0926", f"\u20b9{cash:,.0f}", "#fff8e1", "#e65100", "#f9a825"))
        if diesel > 0:
            wt_items.append(("DIESEL / \u0921\u0940\u091c\u0932", f"\u20b9{diesel:,.0f}", "#fff8e1", "#e65100", "#f9a825"))

        num_cols = len(wt_items)
        col_w = PW / num_cols
        box_h = 13*mm

        for i, (label, val, bg, fg, bc) in enumerate(wt_items):
            bx = x + i * col_w
            # Background fill
            c.setFillColor(colors.HexColor(bg))
            c.rect(bx, cy - box_h, col_w, box_h, fill=1, stroke=0)
            # Cell border
            c.setStrokeColor(colors.HexColor(bc))
            c.setLineWidth(1.2 if "NET" in label else 0.5)
            c.rect(bx, cy - box_h, col_w, box_h)
            # Label (uppercase, small)
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(colors.HexColor("#555"))
            c.drawCentredString(bx + col_w/2, cy - 4*mm, label)
            # Value (large, bold)
            fz = 14 if "NET" in label else 11 if "CASH" in label or "DIESEL" in label else 12
            c.setFont("Helvetica-Bold", fz)
            c.setFillColor(colors.HexColor(fg))
            c.drawCentredString(bx + col_w/2, cy - 10*mm, val)

        cy -= box_h + 2*mm

        # ── Signature section (only Customer copy) ──
        if show_sig:
            sig_w = 38*mm
            c.setStrokeColor(colors.HexColor("#333"))
            c.setLineWidth(0.6)
            c.line(x + 8*mm, cy - 10*mm, x + 8*mm + sig_w, cy - 10*mm)
            c.setFont("Helvetica", 6)
            c.setFillColor(colors.HexColor("#555"))
            c.drawCentredString(x + 8*mm + sig_w/2, cy - 13*mm, "Driver / \u0921\u094d\u0930\u093e\u0907\u0935\u0930")
            c.line(x + PW - 8*mm - sig_w, cy - 10*mm, x + PW - 8*mm, cy - 10*mm)
            c.drawCentredString(x + PW - 8*mm - sig_w/2, cy - 13*mm, "Authorized / \u0905\u0927\u093f\u0915\u0943\u0924")

        # Footer
        c.setFont("Helvetica", 6)
        c.setFillColor(colors.HexColor("#999"))
        c.drawCentredString(W/2, y - bh + 2*mm, f"{company} | Computer Generated")

    # Draw copies based on mode
    top_margin = 5*mm
    copy1_top = H - top_margin

    if party_only:
        # Single Party Copy - centered vertically on A5
        draw_copy(c, copy1_top, "PARTY COPY", False)
    else:
        # 2 copies: Party + Customer
        draw_copy(c, copy1_top, "PARTY COPY", False)

        # Cut line
        cut_y = copy1_top - 95*mm - 3*mm
        c.setStrokeColor(colors.HexColor("#aaa"))
        c.setDash(3, 3)
        c.setLineWidth(0.8)
        c.line(LM, cut_y, W - RM, cut_y)
        c.setDash()
        c.setFont("Helvetica", 5)
        c.setFillColor(colors.HexColor("#aaa"))
        c.drawCentredString(W/2, cut_y + 1, "- - - CUT HERE / \u0915\u093e\u091f\u0947\u0902 - - -")

        copy2_top = cut_y - 2*mm
        draw_copy(c, copy2_top, "CUSTOMER COPY", True)

    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=WeightSlip_RST{rst}.pdf"})




# ── Bulk Export: Excel & PDF ──

async def _build_vw_query(kms_year="", status="", date_from="", date_to="",
                           vehicle_no="", party_name="", farmer_name="", rst_no=""):
    query = {}
    if kms_year: query["kms_year"] = kms_year
    if status: query["status"] = status
    if date_from or date_to:
        dq = {}
        if date_from: dq["$gte"] = date_from
        if date_to: dq["$lte"] = date_to
        query["date"] = dq
    if vehicle_no: query["vehicle_no"] = {"$regex": vehicle_no, "$options": "i"}
    if party_name: query["party_name"] = {"$regex": party_name, "$options": "i"}
    if farmer_name: query["farmer_name"] = {"$regex": farmer_name, "$options": "i"}
    if rst_no:
        try: query["rst_no"] = int(rst_no)
        except: pass
    return query


@router.get("/vehicle-weight/export/excel")
async def export_vw_excel(kms_year: str = "", status: str = "completed",
                          date_from: str = "", date_to: str = "",
                          vehicle_no: str = "", party_name: str = "",
                          farmer_name: str = "", rst_no: str = ""):
    """Export vehicle weight entries to Excel."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from fastapi.responses import StreamingResponse
    from utils.branding_helper import get_branding_data
    query = await _build_vw_query(kms_year, status, date_from, date_to, vehicle_no, party_name, farmer_name, rst_no)
    items = await db["vehicle_weights"].find(query, {"_id": 0}).to_list(10000)
    items.sort(key=lambda e: (e.get("date", ""), int(e.get("rst_no") or 0)))

    branding = await get_branding_data()
    company_name = branding.get("company_name", "NAVKAR AGRO")
    tagline = branding.get("tagline", "")
    custom_fields = branding.get("custom_fields", [])

    wb = Workbook()
    ws = wb.active
    ws.title = "Vehicle Weight"
    thin = Side(style='thin')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    cur_row = 1
    # Above fields (placement=above)
    above_parts = []
    for f in custom_fields:
        if f.get("placement", "below") == "above":
            lbl, val = f.get("label", ""), f.get("value", "")
            if val:
                above_parts.append(f"{lbl}: {val}" if lbl else val)
    if above_parts:
        ws.merge_cells(start_row=cur_row, start_column=1, end_row=cur_row, end_column=13)
        cell = ws.cell(row=cur_row, column=1, value="  |  ".join(above_parts))
        cell.font = Font(bold=True, size=10, color="8B0000")
        cell.alignment = Alignment(horizontal='center')
        cur_row += 1

    # Company Title
    ws.merge_cells(start_row=cur_row, start_column=1, end_row=cur_row, end_column=13)
    title_cell = ws.cell(row=cur_row, column=1, value=f"{company_name} - Vehicle Weight / तौल पर्ची")
    title_cell.font = Font(bold=True, size=14, color="1a1a2e")
    title_cell.alignment = Alignment(horizontal='center')
    cur_row += 1

    # Tagline + Below fields
    below_parts = []
    for f in custom_fields:
        if f.get("placement", "below") != "above":
            lbl, val = f.get("label", ""), f.get("value", "")
            if val:
                below_parts.append(f"{lbl}: {val}" if lbl else val)
    sub_text = tagline
    if below_parts:
        sub_text += "  |  " + "  |  ".join(below_parts) if sub_text else "  |  ".join(below_parts)
    ws.merge_cells(start_row=cur_row, start_column=1, end_row=cur_row, end_column=13)
    ws.cell(row=cur_row, column=1, value=sub_text).font = Font(size=9, color="666666")
    ws.cell(row=cur_row, column=1).alignment = Alignment(horizontal='center')
    cur_row += 1

    # Date/count row
    ws.merge_cells(start_row=cur_row, start_column=1, end_row=cur_row, end_column=13)
    sub = f"Date: {date_from or 'All'} to {date_to or 'All'} | Total: {len(items)} entries"
    ws.cell(row=cur_row, column=1, value=sub).font = Font(size=9, color="666666")
    ws.cell(row=cur_row, column=1).alignment = Alignment(horizontal='center')
    cur_row += 1

    # Header row
    hdr_row = cur_row + 1

    headers = ["RST", "Date", "Vehicle", "Party", "Source/Mandi", "Product", "Trans Type", "Bags",
               "1st Wt (KG)", "2nd Wt (KG)", "Net Wt (KG)", "G.Issued", "Cash", "Diesel"]
    hdr_fill = PatternFill(start_color="1a1a2e", end_color="1a1a2e", fill_type="solid")
    hdr_font = Font(bold=True, color="FFFFFF", size=10)
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=hdr_row, column=c, value=h)
        cell.font = hdr_font
        cell.fill = hdr_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = border

    for i, e in enumerate(items, hdr_row + 1):
        vals = [e.get("rst_no",""), fmt_date(e.get("date","")), e.get("vehicle_no",""), e.get("party_name",""),
                e.get("farmer_name",""), e.get("product",""), e.get("trans_type",""), e.get("tot_pkts",""),
                e.get("first_wt",0), e.get("second_wt",0), e.get("net_wt",0),
                e.get("g_issued",0), e.get("cash_paid",0), e.get("diesel_paid",0)]
        for c, v in enumerate(vals, 1):
            cell = ws.cell(row=i, column=c, value=v)
            cell.border = border
            if c >= 9: cell.alignment = Alignment(horizontal='right')

    # Auto width
    from openpyxl.cell.cell import MergedCell
    for col in ws.columns:
        cells = [c for c in col if not isinstance(c, MergedCell)]
        if not cells: continue
        max_len = max((len(str(c.value or "")) for c in cells), default=8)
        ws.column_dimensions[cells[0].column_letter].width = min(max_len + 3, 25)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"vehicle_weight_{date_from or 'all'}_{date_to or 'all'}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})


@router.get("/vehicle-weight/export/pdf")
async def export_vw_pdf(kms_year: str = "", status: str = "completed",
                        date_from: str = "", date_to: str = "",
                        vehicle_no: str = "", party_name: str = "",
                        farmer_name: str = "", rst_no: str = ""):
    """Export vehicle weight entries to PDF (A4 Landscape)."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from fastapi.responses import StreamingResponse
    from utils.branding_helper import get_pdf_header_elements_from_db

    query = await _build_vw_query(kms_year, status, date_from, date_to, vehicle_no, party_name, farmer_name, rst_no)
    items = await db["vehicle_weights"].find(query, {"_id": 0}).to_list(10000)
    items.sort(key=lambda e: (e.get("date", "")[:10], int(e.get("rst_no") or 0)))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=10*mm, rightMargin=10*mm, topMargin=10*mm, bottomMargin=10*mm)
    elements = []

    # Branding header with custom fields
    sub = f"Date: {date_from or 'All'} to {date_to or 'All'} | Total: {len(items)} entries"
    elements.extend(await get_pdf_header_elements_from_db("Vehicle Weight / तौल पर्ची", sub))
    elements.append(Spacer(1, 3*mm))

    # Table
    headers = ["RST", "Date", "Vehicle", "Party", "Source/Mandi", "Product", "Trans Type", "Bags", "1st Wt", "2nd Wt", "Net Wt", "G.Issued", "Cash", "Diesel"]
    data = [headers]
    for e in items:
        data.append([
            e.get("rst_no",""), fmt_date(e.get("date","")), e.get("vehicle_no",""),
            e.get("party_name",""), e.get("farmer_name",""), e.get("product",""),
            e.get("trans_type",""), e.get("tot_pkts",""),
            f"{e.get('first_wt',0):,.0f}", f"{e.get('second_wt',0):,.0f}", f"{e.get('net_wt',0):,.0f}",
            f"{e.get('g_issued',0):,.0f}" if e.get('g_issued') else "-",
            f"{e.get('cash_paid',0):,.0f}" if e.get('cash_paid') else "-",
            f"{e.get('diesel_paid',0):,.0f}" if e.get('diesel_paid') else "-"
        ])

    col_widths = [38, 62, 70, 76, 72, 66, 58, 35, 58, 58, 58, 46, 46, 46]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    
    # Color-coded column header: Navy(info), Teal(weights), Orange(money)
    navy = colors.HexColor('#1a237e')
    teal = colors.HexColor('#004d40')
    amber = colors.HexColor('#e65100')
    
    style_cmds = [
        # Header colors by column group
        ('BACKGROUND', (0, 0), (7, 0), navy),      # Info columns: RST to Bags
        ('BACKGROUND', (8, 0), (11, 0), teal),      # Weight columns: 1st-Net-GIssued
        ('BACKGROUND', (12, 0), (13, 0), amber),    # Money columns: Cash-Diesel
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 1), (-1, -1), 7),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (7, 1), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, 0), 0.5, colors.HexColor('#ffffff')),
        ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor('#f9a825')),
        ('INNERGRID', (0, 1), (-1, -1), 0.3, colors.HexColor('#d0d5dd')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#90a4ae')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f7ff')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]
    
    # Color-code specific data cells
    for row_idx in range(1, len(data)):
        # RST bold navy
        style_cmds.append(('TEXTCOLOR', (0, row_idx), (0, row_idx), navy))
        style_cmds.append(('FONTNAME', (0, row_idx), (0, row_idx), 'Helvetica-Bold'))
        # 1st Wt blue
        style_cmds.append(('TEXTCOLOR', (8, row_idx), (8, row_idx), colors.HexColor('#0277bd')))
        # 2nd Wt purple
        style_cmds.append(('TEXTCOLOR', (9, row_idx), (9, row_idx), colors.HexColor('#7b1fa2')))
        # Net Wt green bold
        style_cmds.append(('TEXTCOLOR', (10, row_idx), (10, row_idx), colors.HexColor('#1b5e20')))
        style_cmds.append(('FONTNAME', (10, row_idx), (10, row_idx), 'Helvetica-Bold'))
        # Cash green bold
        if data[row_idx][12] != "-":
            style_cmds.append(('TEXTCOLOR', (12, row_idx), (12, row_idx), colors.HexColor('#2e7d32')))
            style_cmds.append(('FONTNAME', (12, row_idx), (12, row_idx), 'Helvetica-Bold'))
        # Diesel orange bold
        if data[row_idx][13] != "-":
            style_cmds.append(('TEXTCOLOR', (13, row_idx), (13, row_idx), colors.HexColor('#e65100')))
            style_cmds.append(('FONTNAME', (13, row_idx), (13, row_idx), 'Helvetica-Bold'))
    
    t.setStyle(TableStyle(style_cmds))
    elements.append(t)
    doc.build(elements)
    buf.seek(0)
    fname = f"vehicle_weight_{date_from or 'all'}_{date_to or 'all'}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={fname}"})

# ── Image Cleanup Settings & Scheduler ──

@router.get("/settings/mandi-cutting-map")
async def get_mandi_cutting_map():
    """Get mandi cutting map from database."""
    doc = await db["settings"].find_one({"key": "mandi_cutting_map"}, {"_id": 0})
    return doc.get("value", {}) if doc else {}


@router.put("/settings/mandi-cutting-map")
async def save_mandi_cutting_map(data: dict):
    """Save/update a mandi cutting entry."""
    key = data.get("key", "")
    value = data.get("value", 0)
    if not key:
        raise HTTPException(status_code=400, detail="Key missing")
    doc = await db["settings"].find_one({"key": "mandi_cutting_map"})
    current = doc.get("value", {}) if doc else {}
    current[key] = value
    await db["settings"].update_one(
        {"key": "mandi_cutting_map"},
        {"$set": {"key": "mandi_cutting_map", "value": current}},
        upsert=True
    )
    return {"success": True}


@router.get("/settings/camera-config")
async def get_camera_config():
    """Get camera config from database."""
    doc = await db["settings"].find_one({"key": "camera_config"}, {"_id": 0})
    return doc.get("value", {}) if doc else {}


@router.put("/settings/camera-config")
async def save_camera_config(data: dict):
    """Save camera config to database."""
    await db["settings"].update_one(
        {"key": "camera_config"},
        {"$set": {"key": "camera_config", "value": data}},
        upsert=True
    )
    return {"success": True}


@router.get("/settings/image-cleanup")
async def get_image_cleanup_setting():
    """Get image auto-cleanup days setting."""
    doc = await db["settings"].find_one({"key": "image_cleanup"}, {"_id": 0})
    if doc:
        return {"days": doc.get("days", 0), "enabled": doc.get("days", 0) > 0}
    return {"days": 0, "enabled": False}


@router.put("/settings/image-cleanup")
async def update_image_cleanup_setting(data: dict):
    """Set image auto-cleanup days (0 = disabled)."""
    days = int(data.get("days", 0) or 0)
    if days < 0:
        days = 0
    await db["settings"].update_one(
        {"key": "image_cleanup"},
        {"$set": {"key": "image_cleanup", "days": days}},
        upsert=True
    )
    return {"success": True, "days": days, "enabled": days > 0}


@router.post("/settings/image-cleanup/run")
async def run_image_cleanup_now():
    """Manually trigger image cleanup based on configured days."""
    doc = await db["settings"].find_one({"key": "image_cleanup"}, {"_id": 0})
    days = doc.get("days", 0) if doc else 0
    if days <= 0:
        return {"success": False, "message": "Cleanup disabled (days = 0)", "deleted": 0}
    deleted = _cleanup_old_images(days)
    return {"success": True, "message": f"{deleted} purani images delete hui", "deleted": deleted}


def _cleanup_old_images(days: int) -> int:
    """Delete image files older than N days from IMG_DIR."""
    import time
    if days <= 0:
        return 0
    cutoff = time.time() - (days * 86400)
    deleted = 0
    try:
        for fname in os.listdir(IMG_DIR):
            fpath = os.path.join(IMG_DIR, fname)
            if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                os.remove(fpath)
                deleted += 1
        if deleted > 0:
            logger.info(f"Image cleanup: {deleted} files older than {days} days deleted")
    except Exception as e:
        logger.error(f"Image cleanup error: {e}")
    return deleted


async def image_cleanup_scheduler():
    """Background task: run cleanup once every 24 hours."""
    import asyncio
    while True:
        await asyncio.sleep(86400)  # 24 hours
        try:
            doc = await db["settings"].find_one({"key": "image_cleanup"}, {"_id": 0})
            days = doc.get("days", 0) if doc else 0
            if days > 0:
                _cleanup_old_images(days)
        except Exception as e:
            logger.error(f"Image cleanup scheduler error: {e}")


# Storage Engine (Web version always uses MongoDB - this is for frontend compatibility)
@router.get("/settings/storage-engine")
async def get_storage_engine():
    return {"engine": "mongodb"}


@router.get("/weighbridge/live-weight")
async def get_live_weight():
    """Web version has no serial port - return disconnected status"""
    return {"connected": False, "weight": 0, "stable": False, "timestamp": 0}
