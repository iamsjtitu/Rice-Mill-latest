"""WhatsApp integration via 360Messenger API."""
from fastapi import APIRouter, HTTPException
from database import db
import httpx
import logging
import os

router = APIRouter()
logger = logging.getLogger("whatsapp")

WA_API_BASE = "https://api.360messenger.com/v2"


async def _get_wa_settings():
    """Get WhatsApp settings from DB."""
    doc = await db["settings"].find_one({"key": "whatsapp"}, {"_id": 0})
    if doc:
        return doc
    return {"key": "whatsapp", "api_key": "", "country_code": "91", "enabled": False,
            "default_numbers": [], "group_id": ""}


def _clean_phone(phone: str, country_code: str = "91") -> str:
    """Clean and normalize phone number."""
    phone = phone.strip().replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("0"):
        phone = phone[1:]
    if not phone.startswith(country_code):
        phone = country_code + phone
    return phone


async def _send_wa_message(phone: str, text: str, media_url: str = ""):
    """Send a WhatsApp message via 360Messenger v2 API."""
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"success": False, "error": "WhatsApp API key set nahi hai. Settings mein jaake set karein."}

    country_code = settings.get("country_code", "91")
    phone = _clean_phone(phone, country_code)

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


async def _send_wa_to_group(text: str, media_url: str = ""):
    """Send message to WhatsApp group via group ID."""
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    group_id = settings.get("group_id", "")
    if not api_key:
        return {"success": False, "error": "WhatsApp API key set nahi hai."}
    if not group_id:
        return {"success": False, "error": "Group ID set nahi hai. Settings mein set karein."}

    data = {"phonenumber": group_id, "text": text}
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
                return {"success": True, "message": "Group message bhej diya!"}
            else:
                return {"success": False, "error": result.get("message", "Group send fail")}
    except Exception as e:
        logger.error(f"WhatsApp group send error: {e}")
        return {"success": False, "error": str(e)}


# ---- Settings ----

@router.get("/whatsapp/settings")
async def get_whatsapp_settings():
    settings = await _get_wa_settings()
    settings.pop("key", None)
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
    # Default numbers: comma-separated string -> list
    default_numbers_raw = data.get("default_numbers", "")
    if isinstance(default_numbers_raw, str):
        default_numbers = [n.strip() for n in default_numbers_raw.split(",") if n.strip()]
    else:
        default_numbers = default_numbers_raw or []
    group_id = data.get("group_id", "").strip()

    await db["settings"].update_one(
        {"key": "whatsapp"},
        {"$set": {
            "key": "whatsapp", "api_key": api_key, "country_code": country_code,
            "enabled": enabled, "default_numbers": default_numbers, "group_id": group_id
        }},
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
    """Send payment reminder to a party via saved default numbers or provided phone."""
    phone = data.get("phone", "")
    party_name = data.get("party_name", "")
    total = data.get("total_amount", 0)
    paid = data.get("paid_amount", 0)
    balance = data.get("balance", total - paid)

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

    # Send to provided phone
    if phone:
        return await _send_wa_message(phone, text)

    # Else send to all default numbers
    settings = await _get_wa_settings()
    default_numbers = settings.get("default_numbers", [])
    if not default_numbers:
        return {"success": False, "error": "Koi phone number nahi mila. Default numbers set karein Settings mein."}

    results = []
    for num in default_numbers:
        r = await _send_wa_message(num, text)
        results.append({"phone": num, "success": r.get("success", False)})

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0,
            "message": f"{success_count}/{len(results)} numbers pe bhej diya!",
            "details": results}


@router.post("/whatsapp/send-daily-report")
async def send_daily_report(data: dict):
    """Send daily report via WhatsApp to default numbers and/or group. Supports PDF URL."""
    report_text = data.get("report_text", "")
    pdf_url = data.get("pdf_url", "")
    send_to_group = data.get("send_to_group", False)
    phone = data.get("phone", "")  # Optional specific number

    if not report_text:
        raise HTTPException(status_code=400, detail="Report text required")

    settings = await _get_wa_settings()
    results = []

    # Send to specific phone if provided
    if phone:
        r = await _send_wa_message(phone, report_text, pdf_url)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        # Send to all default numbers
        for num in settings.get("default_numbers", []):
            r = await _send_wa_message(num, report_text, pdf_url)
            results.append({"target": num, "success": r.get("success", False)})

    # Send to group if enabled
    if send_to_group and settings.get("group_id"):
        r = await _send_wa_to_group(report_text, pdf_url)
        results.append({"target": "group", "success": r.get("success", False)})

    success_count = sum(1 for r in results if r["success"])
    if not results:
        return {"success": False, "error": "Koi number ya group set nahi hai. Settings mein default numbers / group ID daalein."}

    return {"success": success_count > 0,
            "message": f"{success_count}/{len(results)} targets pe bhej diya!",
            "details": results}
