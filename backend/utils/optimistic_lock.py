"""
Optimistic Locking Utility for MongoDB
- Prevents data corruption when multiple users edit the same record
- Uses _v (version) field to detect conflicts
- Returns 409 Conflict if version mismatch
"""

from fastapi import HTTPException


async def optimistic_update(collection, record_id: str, update_data: dict, client_version=None):
    """
    Update a record with optimistic locking.
    
    - If client sends _v: check version before update, increment on success
    - If client doesn't send _v (legacy): skip version check, just update
    - Existing records without _v: treated as version 0, gets _v on next update
    """
    # Extract _v from update data if present
    if client_version is None:
        client_version = update_data.pop("_v", None)
    else:
        update_data.pop("_v", None)

    if client_version is not None:
        client_version = int(client_version)
        # Version-checked update: only update if version matches
        update_data["_v"] = client_version + 1
        result = await collection.update_one(
            {"id": record_id, "_v": client_version},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            # Check if record exists at all
            existing = await collection.find_one({"id": record_id}, {"_id": 0, "_v": 1})
            if not existing:
                raise HTTPException(status_code=404, detail="Record not found")
            if "_v" not in existing:
                # Legacy record without _v - do normal update with _v init
                update_data["_v"] = 1
                await collection.update_one({"id": record_id}, {"$set": update_data})
                return
            # Version conflict
            raise HTTPException(
                status_code=409,
                detail="Ye record kisi aur ne update kar diya hai. Data refresh ho raha hai."
            )
    else:
        # No version sent - legacy/non-versioned update
        # Increment _v if it exists, or set to 1
        existing = await collection.find_one({"id": record_id}, {"_id": 0, "_v": 1})
        if existing:
            current_v = existing.get("_v", 0)
            update_data["_v"] = current_v + 1
        else:
            update_data["_v"] = 1
        await collection.update_one({"id": record_id}, {"$set": update_data})


def stamp_version(doc: dict) -> dict:
    """Add _v: 1 to a new document."""
    doc["_v"] = 1
    return doc
