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
    phone = data.get("phone", "").strip() if data.get("phone") else ""
    party_name = data.get("party_name", "")
    total = data.get("total_amount", 0)
    paid = data.get("paid_amount", 0)
    balance = data.get("balance", total - paid)

    branding = await db["settings"].find_one({"key": "branding"}, {"_id": 0})
    company = branding.get("company_name", "Mill Entry System") if branding else "Mill Entry System"

    text = (
        f"*{company}*\n"
        f"---\n"
        f"Party: {party_name}\n"
        f"Total: Rs.{total:,.2f}\n"
        f"Paid: Rs.{paid:,.2f}\n"
        f"*Balance Due: Rs.{balance:,.2f}*\n"
        f"---\n"
        f"Thank you\n"
        f"{company}"
    )

    # Send to provided phone
    if phone:
        return await _send_wa_message(phone, text)

    # Else send to all default numbers
    settings = await _get_wa_settings()
    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]
    if not default_numbers:
        return {"success": False, "error": "Koi phone number nahi mila. Settings > WhatsApp mein default numbers SAVE karein."}

    results = []
    for num in default_numbers:
        if num and num.strip():
            r = await _send_wa_message(num.strip(), text)
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
    phone = data.get("phone", "").strip() if data.get("phone") else ""

    if not report_text:
        raise HTTPException(status_code=400, detail="Report text required")

    settings = await _get_wa_settings()
    default_numbers = settings.get("default_numbers", [])
    # Defensive: ensure default_numbers is a list
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]
    if not isinstance(default_numbers, list):
        default_numbers = []
    group_id = settings.get("group_id", "").strip() if settings.get("group_id") else ""

    logger.info(f"send-daily-report: phone='{phone}', default_numbers={default_numbers}, group_id='{group_id}', send_to_group={send_to_group}")

    results = []

    # Send to specific phone if provided
    if phone:
        r = await _send_wa_message(phone, report_text, pdf_url)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        # Send to all default numbers
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), report_text, pdf_url)
                results.append({"target": num, "success": r.get("success", False)})

    # Send to group if enabled
    if send_to_group and group_id:
        r = await _send_wa_to_group(report_text, pdf_url)
        results.append({"target": "group", "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number ya group set nahi hai. Settings > WhatsApp mein default numbers set karein aur SAVE dabayein."}

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0,
            "message": f"{success_count}/{len(results)} targets pe bhej diya!",
            "details": results}


@router.post("/whatsapp/send-party-ledger")
async def send_party_ledger(data: dict):
    """Send party ledger summary via WhatsApp."""
    party_name = data.get("party_name", "")
    phone = data.get("phone", "").strip() if data.get("phone") else ""
    total_debit = data.get("total_debit", 0)
    total_credit = data.get("total_credit", 0)
    balance = data.get("balance", total_debit - total_credit)
    transactions = data.get("transactions", [])
    pdf_url = data.get("pdf_url", "")

    if not party_name:
        raise HTTPException(status_code=400, detail="Party name required")

    settings = await _get_wa_settings()
    if not settings.get("api_key"):
        return {"success": False, "error": "WhatsApp API key set nahi hai."}

    branding = await db["settings"].find_one({"key": "branding"}, {"_id": 0})
    company = branding.get("company_name", "Mill Entry System") if branding else "Mill Entry System"

    # Build text summary
    bal_label = "Bakaya (Debit)" if balance > 0 else "Agrim (Credit)" if balance < 0 else "Settled"
    text = (
        f"*{company}*\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"*Party Ledger / खाता विवरण*\n"
        f"Party: *{party_name}*\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"Total Debit (Kharcha): Rs.{total_debit:,.2f}\n"
        f"Total Credit (Jama): Rs.{total_credit:,.2f}\n"
        f"*{bal_label}: Rs.{abs(balance):,.2f}*\n"
    )

    # Add recent transactions (max 10)
    if transactions:
        text += f"\n*Recent Transactions ({min(len(transactions), 10)}):*\n"
        for t in transactions[:10]:
            date = t.get("date", "")
            txn_type = "Jama" if t.get("txn_type") == "jama" else "Nikasi"
            amt = t.get("amount", 0)
            desc = t.get("description", "")[:30]
            text += f"  {date} | {txn_type} | Rs.{amt:,.0f}"
            if desc:
                text += f" | {desc}"
            text += "\n"
        if len(transactions) > 10:
            text += f"  ... aur {len(transactions) - 10} entries\n"

    text += f"\nThank you\n{company}"

    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]

    results = []
    if phone:
        r = await _send_wa_message(phone, text, pdf_url)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), text, pdf_url)
                results.append({"target": num, "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number set nahi hai. Settings > WhatsApp mein default numbers SAVE karein."}

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0,
            "message": f"Party ledger {success_count}/{len(results)} numbers pe bhej diya!",
            "details": results}


@router.post("/whatsapp/send-truck-payment")
async def send_truck_payment(data: dict):
    """Send truck payment summary via WhatsApp."""
    truck_no = data.get("truck_no", "")
    phone = data.get("phone", "").strip() if data.get("phone") else ""
    payments = data.get("payments", [])
    total_net = data.get("total_net", 0)
    total_paid = data.get("total_paid", 0)
    total_balance = data.get("total_balance", 0)
    pdf_url = data.get("pdf_url", "")

    if not truck_no:
        raise HTTPException(status_code=400, detail="Truck number required")

    settings = await _get_wa_settings()
    if not settings.get("api_key"):
        return {"success": False, "error": "WhatsApp API key set nahi hai."}

    branding = await db["settings"].find_one({"key": "branding"}, {"_id": 0})
    company = branding.get("company_name", "Mill Entry System") if branding else "Mill Entry System"

    bal_label = "Bakaya" if total_balance > 0 else "Settled"
    text = (
        f"*{company}*\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"*Truck Payment / ट्रक भुगतान*\n"
        f"Truck: *{truck_no}*\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"Net Amount: Rs.{total_net:,.2f}\n"
        f"Paid: Rs.{total_paid:,.2f}\n"
        f"*{bal_label}: Rs.{abs(total_balance):,.2f}*\n"
    )

    if payments:
        text += f"\n*Trips ({min(len(payments), 10)}):*\n"
        for p in payments[:10]:
            date = p.get("date", "")
            mandi = p.get("mandi_name", "")
            net = p.get("net_amount", 0)
            text += f"  {date} | {mandi} | Rs.{net:,.0f}\n"
        if len(payments) > 10:
            text += f"  ... aur {len(payments) - 10} trips\n"

    text += f"\nThank you\n{company}"

    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]

    results = []
    if phone:
        r = await _send_wa_message(phone, text, pdf_url)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), text, pdf_url)
                results.append({"target": num, "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number set nahi hai. Settings > WhatsApp mein default numbers SAVE karein."}

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0,
            "message": f"Truck payment {success_count}/{len(results)} numbers pe bhej diya!",
            "details": results}


@router.post("/whatsapp/send-truck-owner")
async def send_truck_owner(data: dict):
    """Send truck owner consolidated payment summary via WhatsApp."""
    truck_no = data.get("truck_no", "")
    phone = data.get("phone", "").strip() if data.get("phone") else ""
    total_trips = data.get("total_trips", 0)
    total_gross = data.get("total_gross", 0)
    total_deductions = data.get("total_deductions", 0)
    total_net = data.get("total_net", 0)
    total_paid = data.get("total_paid", 0)
    total_balance = data.get("total_balance", 0)
    pdf_url = data.get("pdf_url", "")

    if not truck_no:
        raise HTTPException(status_code=400, detail="Truck number required")

    settings = await _get_wa_settings()
    if not settings.get("api_key"):
        return {"success": False, "error": "WhatsApp API key set nahi hai."}

    branding = await db["settings"].find_one({"key": "branding"}, {"_id": 0})
    company = branding.get("company_name", "Mill Entry System") if branding else "Mill Entry System"

    bal_label = "Bakaya" if total_balance > 0 else "Settled"
    text = (
        f"*{company}*\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"*Truck Owner Payment / ट्रक मालिक भुगतान*\n"
        f"Truck: *{truck_no}*\n"
        f"Total Trips: {total_trips}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"Gross Amount: Rs.{total_gross:,.2f}\n"
        f"Deductions: Rs.{total_deductions:,.2f}\n"
        f"Net Payable: Rs.{total_net:,.2f}\n"
        f"Paid: Rs.{total_paid:,.2f}\n"
        f"*{bal_label}: Rs.{abs(total_balance):,.2f}*\n"
        f"\nThank you\n{company}"
    )

    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]

    results = []
    if phone:
        r = await _send_wa_message(phone, text, pdf_url)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), text, pdf_url)
                results.append({"target": num, "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number set nahi hai. Settings > WhatsApp mein default numbers SAVE karein."}

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0,
            "message": f"Truck owner payment {success_count}/{len(results)} numbers pe bhej diya!",
            "details": results}
