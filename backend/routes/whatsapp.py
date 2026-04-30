"""WhatsApp integration — supports 360messenger AND wa.9x.design (drop-in compatible)."""
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from database import db
import httpx
import logging
import mimetypes
import os

router = APIRouter()
logger = logging.getLogger("whatsapp")

# MIME type detection from filename extension
def _detect_mime(filename: str) -> str:
    """Detect MIME type from filename. Returns application/octet-stream as fallback."""
    if not filename:
        return "application/octet-stream"
    mime, _ = mimetypes.guess_type(filename)
    if mime:
        return mime
    # Manual fallback for common types not always in mimetypes
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    overrides = {
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xls": "application/vnd.ms-excel",
        "doc": "application/msword",
        "csv": "text/csv",
    }
    return overrides.get(ext, "application/octet-stream")

# Provider hosts (both speak the same v2 API)
WA_PROVIDER_HOSTS = {
    "360messenger": "https://api.360messenger.com/v2",
    "wa9x": "https://wa.9x.design/api/v2",
}
WA_API_BASE_DEFAULT = WA_PROVIDER_HOSTS["360messenger"]


def _wa_base_url(settings: dict) -> str:
    """Return v2 base URL for whichever provider the user has configured."""
    provider = (settings.get("wa_provider") or "360messenger").lower()
    return WA_PROVIDER_HOSTS.get(provider, WA_API_BASE_DEFAULT)


async def _get_wa_settings():
    """Get WhatsApp settings from DB."""
    doc = await db["settings"].find_one({"key": "whatsapp"}, {"_id": 0})
    if doc:
        return doc
    return {"key": "whatsapp", "api_key": "", "country_code": "91", "enabled": False,
            "default_numbers": [], "group_id": "", "wa_provider": "360messenger"}


def _clean_phone(phone: str, country_code: str = "91") -> str:
    """Clean and normalize phone number."""
    phone = phone.strip().replace(" ", "").replace("-", "").replace("+", "")
    if phone.startswith("0"):
        phone = phone[1:]
    if not phone.startswith(country_code):
        phone = country_code + phone
    return phone


async def _upload_pdf_to_tmpfiles(pdf_bytes: bytes, filename: str = "report.pdf") -> str:
    """Upload PDF bytes to tmpfiles.org and return public download URL. Returns empty string on failure."""
    if not pdf_bytes or len(pdf_bytes) < 100:
        return ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            files = {"file": (filename, pdf_bytes, "application/pdf")}
            resp = await client.post("https://tmpfiles.org/api/v1/upload", files=files)
            if resp.status_code == 200:
                tmp_url = resp.json().get("data", {}).get("url", "")
                if tmp_url:
                    public = tmp_url.replace("http://tmpfiles.org/", "https://tmpfiles.org/dl/")
                    logger.info(f"PDF uploaded to tmpfiles: {public}")
                    return public
            logger.error(f"tmpfiles upload failed: HTTP {resp.status_code}")
    except Exception as e:
        logger.error(f"tmpfiles upload error: {e}")
    return ""


async def _fetch_local_pdf_bytes(pdf_url: str) -> bytes:
    """Fetch PDF bytes from a local /api/* URL or full http URL. Returns empty bytes on failure."""
    if not pdf_url:
        return b""
    fetch_url = pdf_url
    if pdf_url.startswith("/api/"):
        fetch_url = f"http://localhost:8001{pdf_url}"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(fetch_url)
            if resp.status_code == 200 and len(resp.content) > 100:
                return resp.content
            logger.error(f"PDF fetch failed: HTTP {resp.status_code}, size={len(resp.content)}")
    except Exception as e:
        logger.error(f"PDF fetch error: {e}")
    return b""


async def _send_wa_message(phone: str, text: str, media_url: str = "",
                            file_bytes: bytes | None = None, filename: str = "report.pdf",
                            content_type: str | None = None):
    """Send a WhatsApp message. Provider-aware:
    - wa9x + file_bytes: direct binary upload via /sendMessageFile (PDF/Excel/Word/image — MIME auto-detected)
    - 360messenger + file_bytes: tmpfiles.org upload → /sendMessage with url
    - media_url only: /sendMessage with url (both providers)
    """
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"success": False, "error": "WhatsApp API key set nahi hai. Settings mein jaake set karein."}

    country_code = settings.get("country_code", "91")
    phone = _clean_phone(phone, country_code)
    provider = (settings.get("wa_provider") or "360messenger").lower()
    base_url = _wa_base_url(settings)
    mime = content_type or _detect_mime(filename)

    # Fast path: wa9x + binary file → /sendMessageFile
    if file_bytes and provider == "wa9x":
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                files = {"file": (filename, file_bytes, mime)}
                form = {"phonenumber": phone}
                if text:
                    form["caption"] = text
                resp = await client.post(
                    f"{base_url}/sendMessageFile",
                    files=files, data=form,
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                result = resp.json() if resp.text else {}
                if result.get("success"):
                    return {"success": True, "message": "WhatsApp file bhej diya!", "data": result.get("data", {})}
                err = result.get("error") or result.get("message") or f"HTTP {resp.status_code}"
                logger.error(f"sendMessageFile fail: {err} | body: {resp.text[:300]}")
                return {"success": False, "error": err}
        except httpx.TimeoutException:
            logger.error("sendMessageFile timeout (>120s)")
            return {"success": False, "error": "Provider timeout (120s). Retry karein."}
        except Exception as e:
            msg = str(e) or e.__class__.__name__
            logger.error(f"sendMessageFile error: {msg}")
            return {"success": False, "error": msg}

    # 360messenger fallback: upload bytes to tmpfiles, then use URL flow
    if file_bytes and not media_url:
        media_url = await _upload_pdf_to_tmpfiles(file_bytes, filename)

    # Standard URL/text flow
    data = {"phonenumber": phone, "text": text}
    if media_url:
        data["url"] = media_url

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{base_url}/sendMessage",
                data=data,
                headers={"Authorization": f"Bearer {api_key}"}
            )
            result = resp.json()
            if result.get("success") or resp.status_code == 201:
                return {"success": True, "message": "WhatsApp message bhej diya!", "data": result.get("data", {})}
            return {"success": False, "error": result.get("message") or result.get("error") or "Message send fail"}
    except httpx.TimeoutException:
        logger.error("WhatsApp send timeout (>90s)")
        return {"success": False, "error": "Provider timeout (90s). Retry karein."}
    except Exception as e:
        msg = str(e) or e.__class__.__name__
        logger.error(f"WhatsApp send error: {msg}")
        return {"success": False, "error": msg}


async def _send_wa_to_group(group_id: str, text: str, media_url: str = "",
                             file_bytes: bytes | None = None, filename: str = "report.pdf",
                             content_type: str | None = None):
    """Send to WhatsApp group. Provider-aware:
    - wa9x + file_bytes: direct binary upload via /sendGroupFile (PDF/Excel/Word/image — MIME auto-detected)
    - 360messenger + file_bytes: tmpfiles.org upload → /sendGroup with url
    - media_url only: /sendGroup with url (both providers)
    """
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"success": False, "error": "WhatsApp API key set nahi hai."}
    if not group_id:
        return {"success": False, "error": "Group ID set nahi hai."}

    provider = (settings.get("wa_provider") or "360messenger").lower()
    base_url = _wa_base_url(settings)
    mime = content_type or _detect_mime(filename)

    # Fast path: wa9x + binary file → /sendGroupFile
    if file_bytes and provider == "wa9x":
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                files = {"file": (filename, file_bytes, mime)}
                form = {"groupId": group_id}
                if text:
                    form["caption"] = text
                resp = await client.post(
                    f"{base_url}/sendGroupFile",
                    files=files, data=form,
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                result = resp.json() if resp.text else {}
                if result.get("success"):
                    return {"success": True, "message": "Group file bhej diya!", "data": result.get("data", {})}
                err = result.get("error") or result.get("message") or f"HTTP {resp.status_code}"
                logger.error(f"sendGroupFile fail: {err} | body: {resp.text[:300]}")
                return {"success": False, "error": err}
        except httpx.TimeoutException:
            logger.error("sendGroupFile timeout (>120s)")
            return {"success": False, "error": "Provider timeout (120s). Retry karein."}
        except Exception as e:
            msg = str(e) or e.__class__.__name__
            logger.error(f"sendGroupFile error: {msg}")
            return {"success": False, "error": msg}

    # 360messenger fallback: upload bytes to tmpfiles, then use URL flow
    if file_bytes and not media_url:
        media_url = await _upload_pdf_to_tmpfiles(file_bytes, filename)

    # Standard URL/text flow
    data = {"groupId": group_id, "text": text}
    if media_url:
        data["url"] = media_url

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{base_url}/sendGroup",
                data=data,
                headers={"Authorization": f"Bearer {api_key}"}
            )
            result = resp.json()
            if result.get("success") or resp.status_code == 201:
                return {"success": True, "message": "Group message bhej diya!"}
            err_parts = []
            if result.get("message"):
                err_parts.append(result["message"])
            if result.get("error"):
                err_parts.append(result["error"])
            sc = result.get("statusCode")
            if sc and sc != resp.status_code:
                err_parts.append(f"provider statusCode {sc}")
            err_msg = " | ".join(err_parts) or f"Group send fail (HTTP {resp.status_code})"
            logger.error(f"sendGroup fail: {err_msg} | body: {resp.text[:300]}")
            return {"success": False, "error": err_msg}
    except httpx.TimeoutException:
        logger.error("sendGroup timeout (>90s)")
        return {"success": False, "error": "Provider timeout (90s). Retry karein."}
    except Exception as e:
        msg = str(e) or e.__class__.__name__
        logger.error(f"sendGroup error: {msg}")
        return {"success": False, "error": msg}


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
    # WhatsApp API provider: '360messenger' (default) or 'wa9x' (wa.9x.design)
    wa_provider = (data.get("wa_provider") or "360messenger").strip().lower()
    if wa_provider not in WA_PROVIDER_HOSTS:
        wa_provider = "360messenger"

    await db["settings"].update_one(
        {"key": "whatsapp"},
        {"$set": {
            "key": "whatsapp", "api_key": api_key, "country_code": country_code,
            "enabled": enabled, "default_numbers": default_numbers, "group_id": group_id,
            "default_group_id": default_group_id, "default_group_name": default_group_name,
            "group_schedule_enabled": group_schedule_enabled, "group_schedule_time": group_schedule_time,
            "wa_provider": wa_provider,
        }},
        upsert=True
    )
    return {"success": True, "message": "WhatsApp settings save ho gayi!"}


@router.get("/whatsapp/groups")
async def get_whatsapp_groups():
    """Fetch list of WhatsApp groups. 360messenger and wa.9x.design use identical response shape: {success, data: {groups: [...]}}."""
    settings = await _get_wa_settings()
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"success": False, "groups": [], "error": "WhatsApp API key set nahi hai."}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{_wa_base_url(settings)}/groupChat/getGroupList",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            try:
                result = resp.json()
            except Exception:
                result = {}

            if resp.status_code >= 400 or result.get("success") is False:
                err = result.get("message") or result.get("detail") or f"HTTP {resp.status_code}"
                return {"success": False, "groups": [], "error": err}

            groups = (result.get("data") or {}).get("groups", [])
            return {"success": True, "groups": groups}
    except Exception as e:
        logger.error(f"WhatsApp get groups error: {e}")
        return {"success": False, "groups": [], "error": str(e)}


@router.post("/whatsapp/send-group")
async def send_to_whatsapp_group(data: dict):
    """Send message + optional PDF to a specific WhatsApp group. Uses direct file upload for wa9x."""
    group_id = data.get("group_id", "")
    text = data.get("text", "")
    media_url = data.get("media_url", "")
    pdf_url = data.get("pdf_url", "")

    if not group_id:
        raise HTTPException(status_code=400, detail="Group ID required")
    if not text and not media_url and not pdf_url:
        raise HTTPException(status_code=400, detail="Text ya media URL required")

    pdf_bytes: bytes = b""
    if pdf_url and not media_url:
        pdf_bytes = await _fetch_local_pdf_bytes(pdf_url)

    # Context-aware filename derived from pdf_url (matches send-pdf logic)
    fname = (data.get("filename") or "").strip()
    if not fname and pdf_url:
        try:
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(pdf_url).query)
            party_type = (qs.get("party_type", [""])[0] or "").strip()
            party = (qs.get("party_name", [""])[0] or qs.get("category", [""])[0]).strip()
            base = "report"
            if "/party-ledger" in pdf_url: base = f"{party}_party_ledger" if party else "party_ledger"
            elif "/cash-book" in pdf_url:
                if party:
                    base = f"{party}_owner_ledger" if party_type == "Owner" else f"{party}_party_ledger"
                else:
                    base = "cash_book"
            elif "/sale-book" in pdf_url: base = "sale_book"
            elif "/bp-sale" in pdf_url: base = "rice_bran_sale"
            elif "/stock-register" in pdf_url: base = "stock_register"
            elif "/hemali" in pdf_url: base = "hemali_register"
            elif "/staff" in pdf_url: base = "staff_register"
            elif "/oil-premium" in pdf_url: base = "labtest_report"
            elif "/vehicle-weight" in pdf_url: base = "vw_report"
            fname = base
        except Exception:
            fname = "report"
    import re as _re
    fname = (_re.sub(r'[^\w\-\.]+', '_', fname or "report").strip('_') or "report")
    if not fname.lower().endswith('.pdf'):
        fname += '.pdf'

    result = await _send_wa_to_group(group_id, text, media_url, file_bytes=pdf_bytes or None, filename=fname)
    return result


@router.post("/whatsapp/test")
async def test_whatsapp(data: dict):
    """Test WhatsApp connection by sending a test message."""
    phone = data.get("phone", "")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number daalein")
    result = await _send_wa_message(phone, "Test message from Mill Entry System - WhatsApp connected!")
    return result


# ---- Generic File Send (any file type — Excel, Word, Image, PDF, etc.) ----

@router.post("/whatsapp/send-file")
async def send_file_via_whatsapp(
    file: UploadFile = File(...),
    mode: str = Form("default"),  # "phone" | "group" | "default"
    phone: str = Form(""),
    group_id: str = Form(""),
    caption: str = Form(""),
):
    """Send any file (PDF/Excel/Word/image/etc.) to WhatsApp. MIME auto-detected from filename.

    Form fields:
    - file: binary file (multipart upload)
    - mode: 'phone' | 'group' | 'default' (default = all default numbers)
    - phone: required if mode='phone'
    - group_id: optional override; defaults to settings.default_group_id when mode='group'
    - caption: optional caption text
    """
    file_bytes = await file.read()
    if not file_bytes or len(file_bytes) < 10:
        raise HTTPException(status_code=400, detail="File khaali hai ya bahut chhoti hai")
    if len(file_bytes) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File 100 MB se badi hai. WhatsApp limit exceed hua.")

    filename = file.filename or "attachment.bin"
    content_type = file.content_type or _detect_mime(filename)

    settings = await _get_wa_settings()
    if not settings.get("api_key"):
        raise HTTPException(status_code=400, detail="WhatsApp API key set nahi hai. Settings → WhatsApp mein set karein.")

    mode = (mode or "default").lower()
    results = []

    if mode == "phone":
        if not phone.strip():
            raise HTTPException(status_code=400, detail="Phone number daalein")
        r = await _send_wa_message(phone.strip(), caption, file_bytes=file_bytes,
                                    filename=filename, content_type=content_type)
        results.append({"target": phone, "success": r.get("success", False), "error": r.get("error", "")})
    elif mode == "group":
        gid = group_id.strip() or settings.get("default_group_id", "").strip() or settings.get("group_id", "").strip()
        if not gid:
            raise HTTPException(status_code=400, detail="Group ID daalein ya default group set karein")
        r = await _send_wa_to_group(gid, caption, file_bytes=file_bytes,
                                     filename=filename, content_type=content_type)
        results.append({"target": "group", "success": r.get("success", False), "error": r.get("error", "")})
    else:  # default = all default numbers
        nums = settings.get("default_numbers", [])
        if isinstance(nums, str):
            nums = [n.strip() for n in nums.split(",") if n.strip()]
        if not isinstance(nums, list) or not nums:
            raise HTTPException(status_code=400, detail="Default numbers set nahi hai. Phone ya group choose karein, ya Settings me numbers SAVE karein.")
        for num in nums:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), caption, file_bytes=file_bytes,
                                            filename=filename, content_type=content_type)
                results.append({"target": num, "success": r.get("success", False), "error": r.get("error", "")})

    success_count = sum(1 for r in results if r["success"])
    return {
        "success": success_count > 0,
        "message": f"File {success_count}/{len(results)} target(s) pe bhej diya!",
        "details": results,
        "filename": filename,
        "size_bytes": len(file_bytes),
        "mime_type": content_type,
    }


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
    """Send daily report via WhatsApp to default numbers and/or group. Uses direct file upload for wa9x."""
    report_text = data.get("report_text", "")
    pdf_url = data.get("pdf_url", "")
    send_to_group = data.get("send_to_group", False)
    phone = data.get("phone", "").strip() if data.get("phone") else ""

    if not report_text:
        raise HTTPException(status_code=400, detail="Report text required")

    pdf_bytes = await _fetch_local_pdf_bytes(pdf_url) if pdf_url else b""
    pdf_payload = pdf_bytes or None

    settings = await _get_wa_settings()
    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]
    if not isinstance(default_numbers, list):
        default_numbers = []
    group_id = settings.get("default_group_id", "").strip() or settings.get("group_id", "").strip()

    logger.info(f"send-daily-report: phone='{phone}', default_numbers={default_numbers}, group_id='{group_id}', send_to_group={send_to_group}, pdf_bytes={len(pdf_bytes)}")

    results = []

    if phone:
        r = await _send_wa_message(phone, report_text, file_bytes=pdf_payload, filename="daily_report.pdf")
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), report_text, file_bytes=pdf_payload, filename="daily_report.pdf")
                results.append({"target": num, "success": r.get("success", False)})

    if send_to_group and group_id:
        r = await _send_wa_to_group(group_id, report_text, file_bytes=pdf_payload, filename="daily_report.pdf")
        results.append({"target": "group", "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number ya group set nahi hai. Settings > WhatsApp mein default numbers set karein aur SAVE dabayein."}

    success_count = sum(1 for r in results if r["success"])
    return {"success": success_count > 0,
            "message": f"{success_count}/{len(results)} targets pe bhej diya!",
            "details": results}


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
    pdf_bytes = b""
    fname = "party_ledger.pdf"
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
            fname = f"cash_book_{party_name}.pdf"
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
            fname = f"party_ledger_{party_name}.pdf"
        # Sanitize filename for filesystem (replace spaces, special chars)
        import re as _re
        fname = _re.sub(r'[^\w\-\.]+', '_', fname).strip('_') or "party_ledger.pdf"
        if not fname.lower().endswith('.pdf'):
            fname += '.pdf'
        if not pdf_bytes or len(pdf_bytes) <= 100:
            logger.error("PDF generation returned empty/small data")
            pdf_bytes = b""
    except Exception as e:
        logger.error(f"PDF generation error: {e}")
        pdf_bytes = b""

    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]

    pdf_payload = pdf_bytes or None
    results = []
    if phone:
        r = await _send_wa_message(phone, text, file_bytes=pdf_payload, filename=fname)
        results.append({"target": phone, "success": r.get("success", False)})
    else:
        for num in default_numbers:
            if num and num.strip():
                r = await _send_wa_message(num.strip(), text, file_bytes=pdf_payload, filename=fname)
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

        report_text = f"*Daily Report - {today}*\n(Auto-scheduled via WhatsApp Group)"

        result = await _send_wa_to_group(group_id, report_text, file_bytes=pdf_bytes or None, filename="daily_report.pdf")

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
    """Send any internal PDF URL via WhatsApp to default numbers/group. Uses direct file upload for wa9x."""
    settings = await _get_wa_settings()
    if not settings.get("enabled") or not settings.get("api_key"):
        raise HTTPException(status_code=400, detail="WhatsApp settings configure nahi hai.")

    caption = data.get("text", "Report")
    pdf_url = data.get("pdf_url", "")
    if not pdf_url:
        raise HTTPException(status_code=400, detail="pdf_url required")

    pdf_bytes = await _fetch_local_pdf_bytes(pdf_url)
    if not pdf_bytes:
        raise HTTPException(status_code=500, detail="PDF fetch fail hua")

    # Context-aware filename — use caller's hint or derive from pdf_url
    raw_name = (data.get("filename") or "").strip()
    if not raw_name:
        # Best-effort: parse query params from pdf_url to build descriptive name
        try:
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(pdf_url).query)
            party = (qs.get("party_name", [""])[0] or qs.get("category", [""])[0]).strip()
            ptype = (qs.get("party_type", [""])[0]).strip()
            base = "report"
            if "/party-ledger" in pdf_url: base = f"{party}_party_ledger" if party else "party_ledger"
            elif "/cash-book" in pdf_url: base = f"{party}_cash_book" if party else "cash_book"
            elif "/sale-book" in pdf_url: base = "sale_book"
            elif "/bp-sale" in pdf_url: base = "rice_bran_sale"
            elif "/stock-register" in pdf_url: base = "stock_register"
            elif "/hemali" in pdf_url: base = "hemali_register"
            elif "/staff" in pdf_url: base = "staff_register"
            elif "/oil-premium" in pdf_url: base = "labtest_report"
            elif "/vehicle-weight" in pdf_url: base = "vw_report"
            elif "/agent" in pdf_url or "agent_payment" in pdf_url: base = "agent_payments"
            elif "/truck" in pdf_url: base = "truck_payments"
            raw_name = base
        except Exception:
            raw_name = "report"
    # Sanitize for filesystem (replace illegal chars + spaces)
    import re as _re
    safe = _re.sub(r'[^\w\-\.]+', '_', raw_name).strip('_') or "report"
    if not safe.lower().endswith('.pdf'):
        safe += '.pdf'

    default_numbers = settings.get("default_numbers", [])
    if isinstance(default_numbers, str):
        default_numbers = [n.strip() for n in default_numbers.split(",") if n.strip()]
    group_id = settings.get("default_group_id", "").strip() or settings.get("group_id", "").strip()

    results = []
    if group_id:
        r = await _send_wa_to_group(group_id, caption, file_bytes=pdf_bytes, filename=safe)
        results.append({"target": "group", "success": r.get("success", False)})
    for num in default_numbers:
        if num and num.strip():
            r = await _send_wa_message(num.strip(), caption, file_bytes=pdf_bytes, filename=safe)
            results.append({"target": num, "success": r.get("success", False)})

    if not results:
        return {"success": False, "error": "Koi number ya group set nahi hai."}

    sent = sum(1 for r in results if r["success"])
    return {"success": sent > 0, "message": f"{sent}/{len(results)} recipients ko bhej diya!", "filename": safe}
