"""Backup & Restore routes - ZIP download/upload + folder-based backups + auto daily."""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from database import db
from datetime import datetime, timezone
from bson import ObjectId
import json
import io
import os
import zipfile
import asyncio
import logging

logger = logging.getLogger("backup")

router = APIRouter()

BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "backups")
MAX_BACKUPS = 7

BACKUP_COLLECTIONS = [
    "agent_payments", "bank_accounts", "branding", "byproduct_sales",
    "cash_transactions", "dc_deliveries", "dc_entries", "diesel_accounts",
    "diesel_pumps", "frk_purchases", "fy_settings", "gst_opening_balances",
    "gunny_bags", "hemali_items", "hemali_payments", "local_party_accounts",
    "mandi_targets", "mill_entries", "mill_parts", "mill_parts_stock",
    "milling_entries", "msp_payments", "opening_balances", "opening_stock",
    "private_paddy", "private_payments", "purchase_vouchers", "rice_sales",
    "sale_vouchers", "settings", "staff", "staff_advance", "staff_attendance",
    "staff_payments", "store_rooms", "truck_lease_payments", "truck_leases",
    "truck_owner_payments", "truck_payments", "users"
]


class BackupEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


def _ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


def _get_backups_list():
    _ensure_backup_dir()
    files = []
    for f in os.listdir(BACKUP_DIR):
        if f.endswith('.zip'):
            fp = os.path.join(BACKUP_DIR, f)
            stat = os.stat(fp)
            size = stat.st_size
            size_readable = f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / (1024*1024):.1f} MB"
            files.append({
                "filename": f,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "size": size,
                "size_readable": size_readable
            })
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files


def _cleanup_old_backups():
    """Keep only MAX_BACKUPS most recent."""
    files = _get_backups_list()
    if len(files) > MAX_BACKUPS:
        for old in files[MAX_BACKUPS:]:
            try:
                os.remove(os.path.join(BACKUP_DIR, old["filename"]))
            except Exception:
                pass


# ---- ZIP Download/Upload (cross-platform) ----

@router.get("/backup/download")
async def download_backup(username: str = "", role: str = ""):
    """Download all data as a ZIP file."""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin backup download kar sakta hai")

    zip_buffer = io.BytesIO()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        meta = {"backup_date": datetime.now(timezone.utc).isoformat(), "version": "50.2.0", "collections": [], "created_by": username}
        for coll_name in BACKUP_COLLECTIONS:
            docs = []
            async for doc in db[coll_name].find({}):
                docs.append(doc)
            if docs:
                zf.writestr(f"{coll_name}.json", json.dumps(docs, cls=BackupEncoder, ensure_ascii=False, indent=2))
                meta["collections"].append({"name": coll_name, "count": len(docs)})
        zf.writestr("_backup_meta.json", json.dumps(meta, indent=2))

    zip_buffer.seek(0)
    return StreamingResponse(zip_buffer, media_type="application/zip",
                             headers={"Content-Disposition": f"attachment; filename=mill_backup_{timestamp}.zip"})


@router.post("/backup/restore")
async def restore_backup_zip(username: str = "", role: str = "", file: UploadFile = File(...)):
    """Restore data from an uploaded ZIP file."""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Sirf Admin backup restore kar sakta hai")
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Sirf ZIP file upload karein")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size 100MB se zyada hai")

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    if "_backup_meta.json" not in zf.namelist():
        raise HTTPException(status_code=400, detail="Ye valid backup file nahi hai")

    meta = json.loads(zf.read("_backup_meta.json"))
    restored, skipped = [], []

    for name in zf.namelist():
        if name == "_backup_meta.json" or not name.endswith('.json'):
            continue
        coll_name = name.replace('.json', '')
        if coll_name not in BACKUP_COLLECTIONS:
            skipped.append(coll_name)
            continue
        try:
            docs = json.loads(zf.read(name))
            if not isinstance(docs, list) or len(docs) == 0:
                skipped.append(coll_name)
                continue
            for doc in docs:
                doc.pop('_id', None)
            await db[coll_name].delete_many({})
            await db[coll_name].insert_many(docs)
            restored.append({"name": coll_name, "count": len(docs)})
        except Exception as e:
            skipped.append(f"{coll_name} (error: {str(e)})")

    return {"success": True, "message": f"Backup restore ho gaya! {len(restored)} collections restored.",
            "backup_date": meta.get("backup_date", "unknown"), "restored": restored, "skipped": skipped}


# ---- Folder-based Backups (Backup Now + Auto Daily) ----

async def _create_backup_to_folder(trigger="manual"):
    """Create a ZIP backup in the data/backups/ folder."""
    _ensure_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{trigger}_{timestamp}.zip"
    filepath = os.path.join(BACKUP_DIR, filename)

    with zipfile.ZipFile(filepath, 'w', zipfile.ZIP_DEFLATED) as zf:
        meta = {"backup_date": datetime.now(timezone.utc).isoformat(), "version": "50.2.0",
                "trigger": trigger, "collections": []}
        for coll_name in BACKUP_COLLECTIONS:
            docs = []
            async for doc in db[coll_name].find({}):
                docs.append(doc)
            if docs:
                zf.writestr(f"{coll_name}.json", json.dumps(docs, cls=BackupEncoder, ensure_ascii=False, indent=2))
                meta["collections"].append({"name": coll_name, "count": len(docs)})
        zf.writestr("_backup_meta.json", json.dumps(meta, indent=2))

    _cleanup_old_backups()
    stat = os.stat(filepath)
    size = stat.st_size
    size_readable = f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / (1024*1024):.1f} MB"
    return {"success": True, "filename": filename, "size_readable": size_readable,
            "created_at": datetime.now(timezone.utc).isoformat()}


@router.get("/backups")
async def list_backups():
    """List all saved backups."""
    backups = _get_backups_list()
    today = datetime.now().strftime("%Y-%m-%d")
    has_today = any(b["created_at"][:10] == today for b in backups)
    return {"backups": backups, "has_today_backup": has_today, "max_backups": MAX_BACKUPS}


@router.post("/backups")
async def create_backup_now():
    """Create a backup in the server folder (Backup Now button)."""
    result = await _create_backup_to_folder("manual")
    if result["success"]:
        return {"success": True, "message": "Backup ban gaya!", "backup": result}
    raise HTTPException(status_code=500, detail="Backup fail")


@router.post("/backups/restore")
async def restore_from_folder(data: dict):
    """Restore from a saved backup file in the folder."""
    filename = data.get("filename", "")
    filepath = os.path.join(BACKUP_DIR, filename)
    if not filename.endswith('.zip') or not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup file nahi mili")

    with open(filepath, 'rb') as f:
        content = f.read()

    zf = zipfile.ZipFile(io.BytesIO(content))
    if "_backup_meta.json" not in zf.namelist():
        raise HTTPException(status_code=400, detail="Invalid backup file")

    meta = json.loads(zf.read("_backup_meta.json"))
    restored = []
    for name in zf.namelist():
        if name == "_backup_meta.json" or not name.endswith('.json'):
            continue
        coll_name = name.replace('.json', '')
        if coll_name not in BACKUP_COLLECTIONS:
            continue
        try:
            docs = json.loads(zf.read(name))
            if not isinstance(docs, list) or len(docs) == 0:
                continue
            for doc in docs:
                doc.pop('_id', None)
            await db[coll_name].delete_many({})
            await db[coll_name].insert_many(docs)
            restored.append({"name": coll_name, "count": len(docs)})
        except Exception:
            pass

    return {"success": True, "message": f"Restore ho gaya! {len(restored)} collections restored."}


@router.delete("/backups/{filename}")
async def delete_backup(filename: str):
    """Delete a backup file."""
    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    os.remove(filepath)
    return {"success": True}


@router.get("/backups/status")
async def backup_status():
    """Get backup status for reminder check."""
    backups = _get_backups_list()
    today = datetime.now().strftime("%Y-%m-%d")
    has_today = any(b["created_at"][:10] == today for b in backups)
    return {"has_today_backup": has_today, "last_backup": backups[0] if backups else None,
            "total_backups": len(backups)}

@router.post("/backups/on-logout")
async def backup_on_logout():
    """Create backup on user logout."""
    now = datetime.now()
    label = "logout_" + now.strftime("%H%M%S")
    result = await _create_backup_to_folder(label)
    return result



# ---- Auto Daily Backup Scheduler ----

async def auto_backup_scheduler():
    """Run once at startup, then every 24 hours."""
    while True:
        try:
            backups = _get_backups_list()
            today = datetime.now().strftime("%Y-%m-%d")
            has_today = any(b["created_at"][:10] == today for b in backups)
            if not has_today:
                result = await _create_backup_to_folder("auto")
                logger.info(f"Auto backup created: {result.get('filename')}")
        except Exception as e:
            logger.error(f"Auto backup error: {e}")
        await asyncio.sleep(86400)  # 24 hours
