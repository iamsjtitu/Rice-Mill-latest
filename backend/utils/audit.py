"""
Audit Log Utility
- Tracks who changed what and when
- Stores old vs new values for each field change
"""

from datetime import datetime, timezone
from database import db
import uuid


async def log_audit(collection_name: str, record_id: str, action: str, username: str,
                    old_data: dict = None, new_data: dict = None, summary: str = ""):
    """
    Log an audit entry.
    action: 'create', 'update', 'delete', 'payment', 'undo_payment'
    """
    changes = {}
    if action == "update" and old_data and new_data:
        skip_keys = {"_id", "_v", "updated_at", "created_at"}
        for key in set(list(old_data.keys()) + list(new_data.keys())):
            if key in skip_keys:
                continue
            old_val = old_data.get(key)
            new_val = new_data.get(key)
            if old_val != new_val:
                changes[key] = {"old": old_val, "new": new_val}
        if not changes:
            return  # No real changes, skip logging

    if action == "create" and new_data:
        # For create, just log key fields
        for key in ["truck_no", "party_name", "amount", "kg", "bag", "category", "description"]:
            if key in new_data and new_data[key]:
                changes[key] = {"new": new_data[key]}

    if action == "delete" and old_data:
        for key in ["truck_no", "party_name", "amount", "kg", "bag", "category", "description"]:
            if key in old_data and old_data[key]:
                changes[key] = {"old": old_data[key]}

    # Auto-generate summary if not provided
    if not summary:
        if action == "create":
            summary = f"{username} ne naya record banaya"
        elif action == "delete":
            summary = f"{username} ne record delete kiya"
        elif action == "update" and changes:
            parts = []
            for k, v in list(changes.items())[:3]:
                if "old" in v and "new" in v:
                    parts.append(f"{k}: {v['old']} → {v['new']}")
            summary = f"{username} ne {', '.join(parts)} change kiya"
        elif action in ("payment", "undo_payment"):
            summary = summary or f"{username} ne {action} kiya"

    doc = {
        "id": str(uuid.uuid4()),
        "collection": collection_name,
        "record_id": str(record_id),
        "action": action,
        "changes": changes,
        "username": username or "system",
        "summary": summary,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    try:
        await db.audit_log.insert_one(doc)
    except Exception:
        pass  # Never let audit logging break the main operation
