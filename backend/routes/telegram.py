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

    # Generate PDF using the EXACT same function as the download button
    from routes.daily_report import export_daily_pdf
    try:
        pdf_response = await export_daily_pdf(report_date, kms_year or None, season or None, mode="detail")
        # Read the streaming response body into bytes
        pdf_buf = io.BytesIO()
        async for chunk in pdf_response.body_iterator:
            pdf_buf.write(chunk)
        pdf_buf.seek(0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generate nahi hua: {str(e)}")

    # Send only PDF to Telegram
    bot_token = config["bot_token"]
    chat_id = config["chat_id"]

    async with httpx.AsyncClient() as client:
        try:
            pdf_buf.seek(0)
            files = {"document": (f"detail_report_{report_date}.pdf", pdf_buf, "application/pdf")}
            form_data = {"chat_id": chat_id, "caption": f"Detail Report - {report_date}"}
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


async def scheduled_send_report():
    """Called by the scheduler to auto-send daily report PDF only"""
    config = await get_telegram_config()
    if not config or not config.get("enabled") or not config.get("bot_token") or not config.get("chat_id"):
        return

    today = datetime.now().strftime("%Y-%m-%d")

    # Check if already sent today
    existing = await db.telegram_logs.find_one({"date": today, "status": "success"})
    if existing:
        return

    try:
        from routes.daily_report import export_daily_pdf
        pdf_response = await export_daily_pdf(today, mode="detail")
        pdf_buf = io.BytesIO()
        async for chunk in pdf_response.body_iterator:
            pdf_buf.write(chunk)
        pdf_buf.seek(0)

        bot_token = config["bot_token"]
        chat_id = config["chat_id"]

        async with httpx.AsyncClient() as client:
            files = {"document": (f"detail_report_{today}.pdf", pdf_buf, "application/pdf")}
            form_data = {"chat_id": chat_id, "caption": f"Detail Report - {today} (Auto)"}
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
        logger.info(f"Telegram: Detail report sent for {today}")
    except Exception as e:
        logger.error(f"Telegram scheduled send failed: {e}")
        await db.telegram_logs.insert_one({
            "date": today,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "error": str(e),
            "type": "scheduled"
        })
