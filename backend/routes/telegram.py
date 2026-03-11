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
    # Migrate old single chat_id to chat_ids list
    if config and "chat_ids" not in config and config.get("chat_id"):
        config["chat_ids"] = [{"chat_id": config["chat_id"], "label": "Default"}]
    return config


@router.get("/telegram/config")
async def get_config():
    config = await get_telegram_config()
    if not config:
        return {"bot_token": "", "chat_ids": [], "schedule_time": "21:00", "enabled": False}
    masked = config.copy()
    if masked.get("bot_token"):
        t = masked["bot_token"]
        masked["bot_token_masked"] = t[:8] + "..." + t[-4:] if len(t) > 12 else "***"
    return masked


@router.post("/telegram/config")
async def save_config(data: dict):
    bot_token = data.get("bot_token", "").strip()
    chat_ids = data.get("chat_ids", [])
    schedule_time = data.get("schedule_time", "21:00").strip()
    enabled = data.get("enabled", False)

    if not bot_token:
        raise HTTPException(status_code=400, detail="Bot Token zaroori hai")
    if not chat_ids or len(chat_ids) == 0:
        raise HTTPException(status_code=400, detail="Kam se kam ek Chat ID add karein")

    # Clean chat_ids
    clean_ids = []
    for item in chat_ids:
        cid = str(item.get("chat_id", "")).strip()
        label = str(item.get("label", "")).strip() or f"Chat {len(clean_ids)+1}"
        if cid:
            clean_ids.append({"chat_id": cid, "label": label})
    if not clean_ids:
        raise HTTPException(status_code=400, detail="Valid Chat ID add karein")

    # Validate bot token
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe", timeout=10)
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Invalid Bot Token")
            bot_info = resp.json()
            if not bot_info.get("ok"):
                raise HTTPException(status_code=400, detail="Bot Token galat hai")
        except httpx.RequestError:
            raise HTTPException(status_code=400, detail="Telegram API se connect nahi ho paya")

    config = {
        "setting_id": TELEGRAM_CONFIG_ID,
        "bot_token": bot_token,
        "chat_ids": clean_ids,
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
    return {"success": True, "message": f"Config save ho gayi! {len(clean_ids)} recipients set.", "bot_name": config["bot_name"]}


@router.post("/telegram/test")
async def test_connection(data: dict):
    bot_token = data.get("bot_token", "").strip()
    chat_ids = data.get("chat_ids", [])

    if not bot_token or not chat_ids:
        raise HTTPException(status_code=400, detail="Bot Token aur Chat ID dono zaroori hain")

    results = []
    async with httpx.AsyncClient() as client:
        for item in chat_ids:
            cid = str(item.get("chat_id", "")).strip()
            label = item.get("label", cid)
            if not cid:
                continue
            try:
                resp = await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": cid, "text": f"Navkar Agro - Test Message\n{label}: Connected!"},
                    timeout=10
                )
                result = resp.json()
                if result.get("ok"):
                    results.append({"label": label, "status": "sent"})
                else:
                    results.append({"label": label, "status": "failed", "error": result.get("description", "")})
            except httpx.RequestError as e:
                results.append({"label": label, "status": "failed", "error": str(e)})

    sent = sum(1 for r in results if r["status"] == "sent")
    failed = sum(1 for r in results if r["status"] == "failed")
    msg = f"{sent} ko message gaya"
    if failed:
        msg += f", {failed} failed"
    return {"success": sent > 0, "message": msg, "details": results}


async def _send_pdf_to_all(bot_token, chat_ids, pdf_bytes, caption):
    """Send PDF to all chat_ids, return results"""
    results = []
    async with httpx.AsyncClient() as client:
        for item in chat_ids:
            cid = str(item.get("chat_id", "")).strip()
            label = item.get("label", cid)
            if not cid:
                continue
            try:
                buf = io.BytesIO(pdf_bytes)
                files = {"document": (f"detail_report.pdf", buf, "application/pdf")}
                form_data = {"chat_id": cid, "caption": caption}
                resp = await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendDocument",
                    data=form_data, files=files, timeout=30
                )
                result = resp.json()
                results.append({"label": label, "ok": result.get("ok", False)})
            except Exception as e:
                results.append({"label": label, "ok": False, "error": str(e)})
    return results


@router.post("/telegram/send-report")
async def send_daily_report_now(data: dict = None):
    config = await get_telegram_config()
    if not config or not config.get("bot_token") or not config.get("chat_ids"):
        raise HTTPException(status_code=400, detail="Telegram config set nahi hai. Settings mein configure karein.")

    report_date = (data or {}).get("date", datetime.now().strftime("%Y-%m-%d"))
    kms_year = (data or {}).get("kms_year", "")
    season = (data or {}).get("season", "")

    from routes.daily_report import export_daily_pdf
    try:
        pdf_response = await export_daily_pdf(report_date, kms_year or None, season or None, mode="detail")
        pdf_buf = io.BytesIO()
        async for chunk in pdf_response.body_iterator:
            pdf_buf.write(chunk)
        pdf_bytes = pdf_buf.getvalue()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generate nahi hua: {str(e)}")

    caption = f"Detail Report - {report_date}"
    results = await _send_pdf_to_all(config["bot_token"], config["chat_ids"], pdf_bytes, caption)

    sent = sum(1 for r in results if r.get("ok"))
    total = len(results)

    await db.telegram_logs.insert_one({
        "date": report_date,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "status": "success" if sent > 0 else "failed",
        "type": "manual",
        "sent_to": sent,
        "total": total
    })

    return {"success": sent > 0, "message": f"Report {sent}/{total} recipients ko bhej diya!", "details": results}


@router.get("/telegram/logs")
async def get_send_logs():
    logs = await db.telegram_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(20)
    return logs


async def scheduled_send_report():
    config = await get_telegram_config()
    if not config or not config.get("enabled") or not config.get("bot_token") or not config.get("chat_ids"):
        return

    today = datetime.now().strftime("%Y-%m-%d")
    existing = await db.telegram_logs.find_one({"date": today, "status": "success", "type": "scheduled"})
    if existing:
        return

    try:
        from routes.daily_report import export_daily_pdf
        pdf_response = await export_daily_pdf(today, mode="detail")
        pdf_buf = io.BytesIO()
        async for chunk in pdf_response.body_iterator:
            pdf_buf.write(chunk)
        pdf_bytes = pdf_buf.getvalue()

        results = await _send_pdf_to_all(config["bot_token"], config["chat_ids"], pdf_bytes, f"Detail Report - {today} (Auto)")
        sent = sum(1 for r in results if r.get("ok"))

        await db.telegram_logs.insert_one({
            "date": today,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "success" if sent > 0 else "failed",
            "type": "scheduled",
            "sent_to": sent,
            "total": len(results)
        })
        logger.info(f"Telegram: Detail report sent to {sent}/{len(results)} for {today}")
    except Exception as e:
        logger.error(f"Telegram scheduled send failed: {e}")
        await db.telegram_logs.insert_one({
            "date": today,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "error": str(e),
            "type": "scheduled"
        })
