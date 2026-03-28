"""WhatsApp integration via 360Messenger API."""
from fastapi import APIRouter, HTTPException
from database import db
import httpx
import logging

router = APIRouter()
logger = logging.getLogger("whatsapp")

WA_API_BASE = "https://api.360messenger.com/v2"


async def _get_wa_settings():
    """Get WhatsApp settings from DB."""
    doc = await db["settings"].find_one({"key": "whatsapp"}, {"_id": 0})
    if doc:
        return doc
    return {"key": "whatsapp", "api_key": "", "country_code": "91", "enabled": False}


async def _send_wa_message(phone: str, text: str, media_url: str = ""):
    """Send a WhatsApp message via 360Messenger v2 API."""
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"success": False, "error": "WhatsApp API key set nahi hai. Settings mein jaake set karein."}

    country_code = settings.get("country_code", "91")
    # Clean phone number - remove spaces, +, leading 0
    phone = phone.strip().replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("0"):
        phone = phone[1:]
    # Add country code if not present
    if not phone.startswith(country_code):
        phone = country_code + phone

    data = {"phonenumber": phone, "text": text}
    if media_url:
        data["url"] = media_url

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{WA_API_BASE}/sendMessage",
                data=data,
                headers={"Authorization": f"Bearer {api_key}"}
            )
            result = resp.json()
            if result.get("success") or resp.status_code == 201:
                return {"success": True, "message": "WhatsApp message bhej diya!", "data": result.get("data", {})}
            else:
                return {"success": False, "error": result.get("message", "Message send fail")}
    except Exception as e:
        logger.error(f"WhatsApp send error: {e}")
        return {"success": False, "error": str(e)}


# ---- Settings ----

@router.get("/whatsapp/settings")
async def get_whatsapp_settings():
    settings = await _get_wa_settings()
    settings.pop("key", None)
    # Mask API key for display
    api_key = settings.get("api_key", "")
    if api_key and len(api_key) > 8:
        settings["api_key_masked"] = api_key[:4] + "****" + api_key[-4:]
    else:
        settings["api_key_masked"] = ""
    return settings


@router.put("/whatsapp/settings")
async def update_whatsapp_settings(data: dict):
    api_key = data.get("api_key", "").strip()
    country_code = data.get("country_code", "91").strip()
    enabled = data.get("enabled", bool(api_key))

    await db["settings"].update_one(
        {"key": "whatsapp"},
        {"$set": {"key": "whatsapp", "api_key": api_key, "country_code": country_code, "enabled": enabled}},
        upsert=True
    )
    return {"success": True, "message": "WhatsApp settings save ho gayi!"}


@router.post("/whatsapp/test")
async def test_whatsapp(data: dict):
    """Test WhatsApp connection by sending a test message."""
    phone = data.get("phone", "")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number daalein")
    result = await _send_wa_message(phone, "Test message from Mill Entry System - WhatsApp connected!")
    return result


# ---- Send Messages ----

@router.post("/whatsapp/send")
async def send_whatsapp_message(data: dict):
    """Send a WhatsApp message to a phone number."""
    phone = data.get("phone", "")
    text = data.get("text", "")
    media_url = data.get("media_url", "")

    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    if not text and not media_url:
        raise HTTPException(status_code=400, detail="Message text ya media URL required")

    result = await _send_wa_message(phone, text, media_url)
    return result


@router.post("/whatsapp/send-payment-reminder")
async def send_payment_reminder(data: dict):
    """Send payment reminder to a party."""
    phone = data.get("phone", "")
    party_name = data.get("party_name", "")
    total = data.get("total_amount", 0)
    paid = data.get("paid_amount", 0)
    balance = data.get("balance", total - paid)

    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")

    # Get branding for company name
    branding = await db["branding"].find_one({"key": "branding"}, {"_id": 0})
    company = branding.get("company_name", "Mill Entry System") if branding else "Mill Entry System"

    text = (
        f"*{company}*\n"
        f"---\n"
        f"Party: {party_name}\n"
        f"Total: Rs.{total:,.2f}\n"
        f"Paid: Rs.{paid:,.2f}\n"
        f"*Balance Due: Rs.{balance:,.2f}*\n"
        f"---\n"
        f"Kripya baaki rashi ka bhugtan karein.\n"
        f"Dhanyavaad!"
    )

    result = await _send_wa_message(phone, text)
    return result


@router.post("/whatsapp/send-daily-report")
async def send_daily_report(data: dict):
    """Send daily report summary via WhatsApp."""
    phone = data.get("phone", "")
    report_text = data.get("report_text", "")

    if not phone or not report_text:
        raise HTTPException(status_code=400, detail="Phone aur report text dono required")

    result = await _send_wa_message(phone, report_text)
    return result
