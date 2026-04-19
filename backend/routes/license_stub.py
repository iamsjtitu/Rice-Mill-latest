"""License info stub for Python/web backend.
On web deployment (mill.9x.design, etc.) license enforcement runs on desktop-app only.
This stub returns 'web deployment' status so Settings > License tab shows a helpful message.
"""
from fastapi import APIRouter

router = APIRouter()


@router.get("/license/info")
async def license_info():
    return {
        "activated": True,
        "key": "WEB-DEPLOYMENT",
        "customer_name": "Web Deployment",
        "mill_name": "mill.9x.design (Cloud)",
        "plan": "lifetime",
        "expires_at": None,
        "is_master": True,
        "last_validated_at": None,
        "machine_fingerprint": "web-stub",
        "pc_info": {"hostname": "web", "platform": "web", "app_version": "web"},
    }


@router.post("/license/heartbeat")
async def license_heartbeat():
    return {"active": True, "note": "web_deployment"}
