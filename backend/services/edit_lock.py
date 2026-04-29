"""5-minute edit window helper — applied across all transactional modules.

Centralizes the "can this entry be edited/deleted now" logic so:
1. Admin always overrides the lock
2. Non-admin can only edit/delete their OWN entries
3. Lock can be toggled on/off via Settings (key: "edit_window")
4. Default: lock is ENABLED (5 minutes from creation)
"""
from datetime import datetime, timezone, timedelta
from database import db


async def is_edit_lock_enabled() -> bool:
    """Returns True if the 5-min edit window is currently enforced. Default: True."""
    doc = await db["settings"].find_one({"key": "edit_window"}, {"_id": 0})
    if not doc:
        return True  # Default ON for safety (existing behaviour for Mill Entries)
    return bool(doc.get("enabled", True))


async def set_edit_lock_enabled(enabled: bool) -> None:
    await db["settings"].update_one(
        {"key": "edit_window"},
        {"$set": {"key": "edit_window", "enabled": bool(enabled),
                   "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )


async def check_edit_lock(entry: dict, username: str, role: str) -> tuple[bool, str]:
    """Return (allowed, message). Used by PUT and DELETE endpoints across modules.

    Rules:
    - Admin: always allowed
    - Non-admin: must be the creator AND within 5 min if lock is enabled
    - If lock is disabled (Settings toggle OFF): only ownership check applies
    """
    if (role or "").lower() == "admin":
        return True, "Admin access"

    created_by = entry.get("created_by") or entry.get("createdBy") or ""
    if created_by and username and created_by != username:
        return False, "Aap sirf apni entry edit/delete kar sakte hain"

    enabled = await is_edit_lock_enabled()
    if not enabled:
        return True, "Edit lock disabled in Settings"

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
        if delta > timedelta(minutes=5):
            mins = int(delta.total_seconds() / 60)
            return False, f"5 minute se zyada ho gaye ({mins} min) — ab edit/delete nahi kar sakte. Admin se contact karein."
    except Exception:
        return True, "Timestamp parse fail — lock skipped"

    return True, "Edit allowed"
