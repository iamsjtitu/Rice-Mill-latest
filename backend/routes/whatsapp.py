"""WhatsApp integration via 360Messenger API."""
from fastapi import APIRouter, HTTPException, Request
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


async def _send_wa_to_group(group_id: str, text: str, media_url: str = ""):
    """Send message to WhatsApp group via 360Messenger sendGroup API."""
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"success": False, "error": "WhatsApp API key set nahi hai."}
    if not group_id:
        return {"success": False, "error": "Group ID set nahi hai."}

    data = {"groupId": group_id, "text": text}
    if media_url:
        data["url"] = media_url

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{WA_API_BASE}/sendGroup",
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
    default_group_id = data.get("default_group_id", "").strip()
    default_group_name = data.get("default_group_name", "").strip()
    group_schedule_enabled = data.get("group_schedule_enabled", False)
    group_schedule_time = data.get("group_schedule_time", "").strip()

    await db["settings"].update_one(
        {"key": "whatsapp"},
        {"$set": {
            "key": "whatsapp", "api_key": api_key, "country_code": country_code,
            "enabled": enabled, "default_numbers": default_numbers, "group_id": group_id,
            "default_group_id": default_group_id, "default_group_name": default_group_name,
            "group_schedule_enabled": group_schedule_enabled, "group_schedule_time": group_schedule_time
        }},
        upsert=True
    )
    return {"success": True, "message": "WhatsApp settings save ho gayi!"}


@router.get("/whatsapp/groups")
async def get_whatsapp_groups():
    """Fetch list of WhatsApp groups from 360Messenger."""
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"success": False, "groups": [], "error": "WhatsApp API key set nahi hai."}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{WA_API_BASE}/groupChat/getGroupList",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            result = resp.json()
            if result.get("success"):
                groups = result.get("data", {}).get("groups", [])
                return {"success": True, "groups": groups}
            else:
                return {"success": False, "groups": [], "error": result.get("message", "Group list fetch fail")}
    except Exception as e:
        logger.error(f"WhatsApp get groups error: {e}")
        return {"success": False, "groups": [], "error": str(e)}


@router.post("/whatsapp/send-group")
async def send_to_whatsapp_group(data: dict):
    """Send message + optional PDF to a specific WhatsApp group."""
    group_id = data.get("group_id", "")
    text = data.get("text", "")
    media_url = data.get("media_url", "")
    pdf_url = data.get("pdf_url", "")

    if not group_id:
        raise HTTPException(status_code=400, detail="Group ID required")
    if not text and not media_url and not pdf_url:
        raise HTTPException(status_code=400, detail="Text ya media URL required")

    public_pdf_url = media_url
    if pdf_url and not media_url:
        try:
            fetch_url = pdf_url
            if pdf_url.startswith("/api/"):
                fetch_url = f"http://localhost:8001{pdf_url}"
            async with httpx.AsyncClient(timeout=30) as client:
                pdf_resp = await client.get(fetch_url)
                if pdf_resp.status_code == 200 and len(pdf_resp.content) > 100:
                    files = {"file": ("report.pdf", pdf_resp.content, "application/pdf")}
                    upload_resp = await client.post("https://tmpfiles.org/api/v1/upload", files=files)
                    if upload_resp.status_code == 200:
                        tmp_data = upload_resp.json()
                        tmp_url = tmp_data.get("data", {}).get("url", "")
                        if tmp_url:
                            public_pdf_url = tmp_url.replace("http://tmpfiles.org/", "https://tmpfiles.org/dl/")
                            logger.info(f"Group PDF uploaded: {public_pdf_url}")
                else:
                    logger.error(f"Group PDF fetch fail: status={pdf_resp.status_code}")
        except Exception as e:
            logger.error(f"Group PDF upload error: {e}")

    result = await _send_wa_to_group(group_id, text, public_pdf_url)
    return result


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
    """Send daily report via WhatsApp to default numbers and/or group. Generates PDF, uploads to tmpfiles.org first."""
    report_text = data.get("report_text", "")
    pdf_url = data.get("pdf_url", "")
    send_to_group = data.get("send_to_group", False)
    phone = data.get("phone", "").strip() if data.get("phone") else ""

    if not report_text:
        raise HTTPException(status_code=400, detail="Report text required")

    # If pdf_url is a local/API URL, fetch PDF and upload to tmpfiles.org
    public_pdf_url = ""
    if pdf_url:
        try:
            # Fetch PDF from internal API
            async with httpx.AsyncClient(timeout=30) as client:
                pdf_resp = await client.get(pdf_url)
                if pdf_resp.status_code == 200 and len(pdf_resp.content) > 100:
                    # Upload to tmpfiles.org
                    files = {"file": ("daily_report.pdf", pdf_resp.content, "application/pdf")}
                    upload_resp = await client.post("https://tmpfiles.org/api/v1/upload", files=files)
                    if upload_resp.status_code == 200:
                        tmp_data = upload_resp.json()
                        tmp_url = tmp_data.get("data", {}).get("url", "")
                        if tmp_url:
                            public_pdf_url = tmp_url.replace("http://tmpfiles.org/", "https://tmpfiles.org/dl/")
                            logger.info(f"Daily report PDF uploaded to tmpfiles: {public_pdf_url}")
                    else:
                        logger.error(f"tmpfiles upload failed: {upload_resp.status_code}")
                else:
                    logger.error(f"PDF fetch failed: status={pdf_resp.status_code}, size={len(pdf_resp.content)}")
        except Exception as e:
            logger.error(f"Daily report PDF upload error: {e}")

    settings = await _get_wa_settings()
    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]
    if not isinstance(default_numbers, list):
        default_numbers = []
    group_id = settings.get("default_group_id", "").strip() or settings.get("group_id", "").strip()

    logger.info(f"send-daily-report: phone='{phone}', default_numbers={default_numbers}, group_id='{group_id}', send_to_group={send_to_group}, pdf_url='{public_pdf_url}'")

    results = []

    if phone:
        r = await _send_wa_message(phone, report_text, public_pdf_url)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), report_text, public_pdf_url)
                results.append({"target": num, "success": r.get("success", False)})

    if send_to_group and group_id:
        r = await _send_wa_to_group(group_id, report_text, public_pdf_url)
        results.append({"target": "group", "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number ya group set nahi hai. Settings > WhatsApp mein default numbers set karein aur SAVE dabayein."}

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0,
            "message": f"{success_count}/{len(results)} targets pe bhej diya!",
            "details": results, "pdf_url": public_pdf_url}


@router.post("/whatsapp/send-party-ledger")
async def send_party_ledger(data: dict):
    """Send party ledger PDF (same as download) via WhatsApp."""
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

    # Generate the SAME PDF internally (no HTTP self-call)
    public_pdf_url = ""
    try:
        from urllib.parse import urlparse, parse_qs
        # Parse query params from pdf_url to get the same filters
        pdf_params = {}
        is_cashbook_pdf = False
        if pdf_url:
            parsed = urlparse(pdf_url)
            qs = parse_qs(parsed.query)
            pdf_params = {k: v[0] for k, v in qs.items()}
            # Detect if this is a cash-book PDF request
            if "cash-book/pdf" in parsed.path:
                is_cashbook_pdf = True
        
        if is_cashbook_pdf:
            from routes.cashbook import _generate_cash_book_pdf_bytes
            pdf_bytes = await _generate_cash_book_pdf_bytes(
                kms_year=pdf_params.get("kms_year", ""),
                season=pdf_params.get("season", ""),
                account=pdf_params.get("account", None),
                txn_type=pdf_params.get("txn_type", None),
                category=pdf_params.get("category", party_name),
                party_type=pdf_params.get("party_type", None),
                date_from=pdf_params.get("date_from", None),
                date_to=pdf_params.get("date_to", None),
            )
        else:
            from routes.ledgers import _generate_party_ledger_pdf_bytes
            pdf_bytes = await _generate_party_ledger_pdf_bytes(
                party_name=pdf_params.get("party_name", party_name),
                party_type=pdf_params.get("party_type", ""),
                kms_year=pdf_params.get("kms_year", ""),
                season=pdf_params.get("season", ""),
                date_from=pdf_params.get("date_from", ""),
                date_to=pdf_params.get("date_to", ""),
            )
        if pdf_bytes and len(pdf_bytes) > 100:
            fname = f"cash_book_{party_name}.pdf" if is_cashbook_pdf else f"party_ledger_{party_name}.pdf"
            async with httpx.AsyncClient(timeout=30) as client:
                files = {"file": (fname, pdf_bytes, "application/pdf")}
                upload_resp = await client.post("https://tmpfiles.org/api/v1/upload", files=files)
                if upload_resp.status_code == 200:
                    tmp_data = upload_resp.json()
                    tmp_url = tmp_data.get("data", {}).get("url", "")
                    if tmp_url:
                        public_pdf_url = tmp_url.replace("http://tmpfiles.org/", "https://tmpfiles.org/dl/")
                        logger.info(f"PDF uploaded to tmpfiles: {public_pdf_url}")
                else:
                    logger.error(f"tmpfiles upload failed: {upload_resp.status_code}")
        else:
            logger.error("PDF generation returned empty/small data")
    except Exception as e:
        logger.error(f"PDF generation/upload error: {e}")

    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]

    results = []
    if phone:
        r = await _send_wa_message(phone, text, public_pdf_url)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), text, public_pdf_url)
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


# ============ SEND GST INVOICE ============
@router.post("/whatsapp/send-gst-invoice")
async def send_gst_invoice(request: Request):
    body = await request.json()
    inv_id = body.get("invoice_id", "")
    pdf_url = body.get("pdf_url", "")
    phone = body.get("phone", "")

    inv = await db.gst_invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        return {"success": False, "error": "Invoice not found"}

    branding = await db.settings.find_one({"key": "branding"}, {"_id": 0}) or {}
    company = branding.get("company_name", "Mill Entry System")
    totals = inv.get("totals", {})

    text = (
        f"*{company}*\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"*TAX INVOICE*\n"
        f"Invoice No: *{inv.get('invoice_no', '')}*\n"
        f"Date: {inv.get('date', '')}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"Buyer: {inv.get('buyer_name', '')}\n"
        f"GSTIN: {inv.get('buyer_gstin', '')}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"Taxable: Rs.{totals.get('taxable', 0):,.2f}\n"
    )
    if inv.get("is_igst"):
        text += f"IGST: Rs.{totals.get('igst', 0):,.2f}\n"
    else:
        text += f"CGST: Rs.{totals.get('cgst', 0):,.2f}\n"
        text += f"SGST: Rs.{totals.get('sgst', 0):,.2f}\n"
    text += (
        f"*Grand Total: Rs.{totals.get('total', 0):,.2f}*\n"
        f"\nThank you\n{company}"
    )

    wa_settings = await db.settings.find_one({"key": "whatsapp"}, {"_id": 0}) or {}
    default_numbers = wa_settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]

    results = []
    targets = [phone] if phone else default_numbers
    for num in targets:
        if num and num.strip():
            r = await _send_wa_message(num.strip(), text, pdf_url)
            results.append({"target": num, "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number set nahi hai."}

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0, "message": f"GST Invoice {success_count}/{len(results)} numbers pe bhej diya!", "details": results}


# ---- Scheduled WhatsApp Group Report ----

async def get_wa_settings_for_scheduler():
    """Export for server.py scheduler."""
    return await _get_wa_settings()


async def scheduled_wa_group_send():
    """Auto-send daily report to default WhatsApp group at scheduled time."""
    from datetime import datetime, timezone
    import io

    settings = await _get_wa_settings()
    group_id = settings.get("default_group_id", "")
    if not group_id:
        return

    today = datetime.now().strftime("%Y-%m-%d")

    # Check if already sent today
    existing = await db["wa_group_schedule_logs"].find_one({"date": today, "status": "success"})
    if existing:
        return

    try:
        from routes.daily_report import export_daily_pdf
        pdf_response = await export_daily_pdf(today, mode="detail")
        pdf_buf = io.BytesIO()
        async for chunk in pdf_response.body_iterator:
            pdf_buf.write(chunk)
        pdf_bytes = pdf_buf.getvalue()

        # Upload PDF to tmpfiles.org
        public_pdf_url = ""
        if len(pdf_bytes) > 100:
            async with httpx.AsyncClient(timeout=30) as client:
                files = {"file": ("daily_report.pdf", pdf_bytes, "application/pdf")}
                upload_resp = await client.post("https://tmpfiles.org/api/v1/upload", files=files)
                if upload_resp.status_code == 200:
                    tmp_data = upload_resp.json()
                    tmp_url = tmp_data.get("data", {}).get("url", "")
                    if tmp_url:
                        public_pdf_url = tmp_url.replace("http://tmpfiles.org/", "https://tmpfiles.org/dl/")

        report_text = f"*Daily Report - {today}*\n(Auto-scheduled via WhatsApp Group)"

        result = await _send_wa_to_group(group_id, report_text, public_pdf_url)

        await db["wa_group_schedule_logs"].insert_one({
            "date": today,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "success" if result.get("success") else "failed",
            "group_id": group_id,
            "group_name": settings.get("default_group_name", ""),
            "error": result.get("error", "")
        })
        logger.info(f"WhatsApp Group scheduled: {result.get('success', False)} for {today}")
    except Exception as e:
        logger.error(f"WhatsApp Group scheduled send failed: {e}")
        await db["wa_group_schedule_logs"].insert_one({
            "date": today,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "error": str(e)
        })


@router.post("/whatsapp/send-pdf")
async def send_pdf_via_whatsapp(data: dict):
    """Send any internal PDF URL via WhatsApp to default numbers/group."""
    settings = await _get_wa_settings()
    if not settings.get("enabled") or not settings.get("api_key"):
        raise HTTPException(status_code=400, detail="WhatsApp settings configure nahi hai.")

    caption = data.get("text", "Report")
    pdf_url = data.get("pdf_url", "")
    if not pdf_url:
        raise HTTPException(status_code=400, detail="pdf_url required")

    fetch_url = pdf_url
    if pdf_url.startswith("/api/"):
        fetch_url = f"http://localhost:8001{pdf_url}"

    public_pdf_url = ""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            pdf_resp = await client.get(fetch_url)
            if pdf_resp.status_code == 200 and len(pdf_resp.content) > 100:
                files = {"file": ("report.pdf", pdf_resp.content, "application/pdf")}
                upload_resp = await client.post("https://tmpfiles.org/api/v1/upload", files=files)
                if upload_resp.status_code == 200:
                    tmp_url = upload_resp.json().get("data", {}).get("url", "")
                    if tmp_url:
                        public_pdf_url = tmp_url.replace("http://tmpfiles.org/", "https://tmpfiles.org/dl/")
    except Exception as e:
        logger.error(f"PDF upload error: {e}")

    if not public_pdf_url:
        raise HTTPException(status_code=500, detail="PDF upload fail hua")

    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]
    group_id = settings.get("default_group_id", "").strip() or settings.get("group_id", "").strip()

    results = []
    if group_id:
        r = await _send_wa_to_group(group_id, caption, public_pdf_url)
        results.append({"target": "group", "success": r.get("success", False)})
    for num in default_numbers:
        if num and num.strip():
            r = await _send_wa_message(num.strip(), caption, public_pdf_url)
            results.append({"target": num, "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number ya group set nahi hai."}

    sent = sum(1 for r in results if r["success"])
    return {"success": sent > 0, "message": f"{sent}/{len(results)} recipients ko bhej diya!"}
