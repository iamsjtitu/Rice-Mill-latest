"""5-minute edit window helper — applied across all transactional modules.

Centralizes the "can this entry be edited/deleted now" logic so:
1. Admin always overrides the lock
2. Non-admin can only edit/delete their OWN entries
3. Lock can be toggled on/off via Settings (key: "edit_window")
4. Duration is configurable (default 5 minutes, range 1-1440)
"""
from datetime import datetime, timezone, timedelta
from database import db


DEFAULT_DURATION_MIN = 5


async def get_edit_window_settings() -> dict:
    """Returns {'enabled': bool, 'duration_minutes': int}. Defaults: enabled=True, 5 min."""
    doc = await db["settings"].find_one({"key": "edit_window"}, {"_id": 0})
    if not doc:
        return {"enabled": True, "duration_minutes": DEFAULT_DURATION_MIN}
    raw = doc.get("duration_minutes", DEFAULT_DURATION_MIN)
    try:
        dur = int(raw)
    except (ValueError, TypeError):
        dur = DEFAULT_DURATION_MIN
    if dur < 1:
        dur = 1
    if dur > 1440:
        dur = 1440
    return {"enabled": bool(doc.get("enabled", True)), "duration_minutes": dur}


async def is_edit_lock_enabled() -> bool:
    return (await get_edit_window_settings())["enabled"]


async def set_edit_window_settings(enabled: bool, duration_minutes: int = None) -> dict:
    """Update edit window settings. Pass duration_minutes=None to keep existing."""
    update = {"key": "edit_window", "enabled": bool(enabled),
              "updated_at": datetime.now(timezone.utc).isoformat()}
    if duration_minutes is not None:
        try:
            d = int(duration_minutes)
        except (ValueError, TypeError):
            d = DEFAULT_DURATION_MIN
        if d < 1:
            d = 1
        if d > 1440:
            d = 1440
        update["duration_minutes"] = d
    await db["settings"].update_one(
        {"key": "edit_window"}, {"$set": update}, upsert=True
    )
    return await get_edit_window_settings()


# Back-compat alias (older Python code calls set_edit_lock_enabled)
async def set_edit_lock_enabled(enabled: bool) -> None:
    await set_edit_window_settings(enabled)


async def check_edit_lock(entry: dict, username: str, role: str) -> tuple[bool, str]:
    """Return (allowed, message). Used by PUT and DELETE endpoints across modules.

    Rules:
    - Admin: always allowed
    - Non-admin: must be the creator AND within configured duration if lock is enabled
    - If lock is disabled (Settings toggle OFF): only ownership check applies
    """
    if (role or "").lower() == "admin":
        return True, "Admin access"

    created_by = entry.get("created_by") or entry.get("createdBy") or ""
    if created_by and username and created_by != username:
        return False, "Aap sirf apni entry edit/delete kar sakte hain"

    settings_doc = await get_edit_window_settings()
    if not settings_doc["enabled"]:
        return True, "Edit lock disabled in Settings"
    duration_min = settings_doc["duration_minutes"]

    created_at = entry.get("created_at") or entry.get("createdAt") or ""
    if not created_at:
        return True, "No creation timestamp — lock skipped"

    try:
        # Handle both Z-suffix and +00:00 ISO formats
        s = created_at.replace("Z", "+00:00") if created_at.endswith("Z") else created_at
        created_time = datetime.fromisoformat(s)
        if created_time.tzinfo is None:
            created_time = created_time.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = now - created_time
        if delta > timedelta(minutes=duration_min):
            mins = int(delta.total_seconds() / 60)
            return False, f"{duration_min} minute se zyada ho gaye ({mins} min) — ab edit/delete nahi kar sakte. Admin se contact karein."
    except Exception:
        return True, "Timestamp parse fail — lock skipped"

    return True, "Edit allowed"
