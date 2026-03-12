#!/usr/bin/env python3
"""Sync verification script - checks web and desktop feature parity"""
import os, json, re, sys
from datetime import datetime

DESKTOP = "/app/desktop-app/routes"
WEB = "/app/backend/routes"

checks = []
def check(name, ok, detail=""):
    checks.append({"name": name, "ok": ok, "detail": detail})
    print(f"{'[OK]' if ok else '[!!]'} {name}" + (f" - {detail}" if detail else ""))

# 1. Version check
with open("/app/desktop-app/package.json") as f:
    pkg = json.load(f)
check("Version is 2.23.9", pkg["version"] == "2.23.9", f"Current: {pkg['version']}")

# 2. Frontend build check
fb = "/app/desktop-app/frontend-build/index.html"
check("Frontend build exists", os.path.exists(fb))
if os.path.exists(fb):
    mtime = datetime.fromtimestamp(os.path.getmtime(fb))
    check("Frontend build is recent", (datetime.now() - mtime).total_seconds() < 3600, f"Built: {mtime}")

# 3. FY Summary - Ledger Parties
with open(f"{DESKTOP}/fy_summary.js") as f:
    fy_js = f.read()
check("FY: Ledger parties section", "ledger_parties" in fy_js)
check("FY: Carry forward API", "carry-forward" in fy_js)
check("FY: Saved opening balances", "savedOb" in fy_js or "opening_balances" in fy_js)
check("FY: getNextFy function", "getNextFy" in fy_js)

# 4. Local Party - Cashbook payment linking
with open(f"{DESKTOP}/local_party.js") as f:
    lp_js = f.read()
check("LP: Cashbook payment linking in report", "cashbook" in lp_js.lower() and "CashBook Payment" in lp_js)
check("LP: Dedup by linked_local_party_id", "linked_local_party_id" in lp_js)
check("LP: Dedup by reference", "existingRefs" in lp_js)

# 5. Milling - agent_extra exclusion
with open(f"{DESKTOP}/milling.js") as f:
    ml_js = f.read()
check("Milling: agent_extra exclusion", "agent_extra" in ml_js)

# 6. Payments - filtered truck
with open(f"{DESKTOP}/payments.js") as f:
    pay_js = f.read()
check("Payments: Move to Pvt Paddy filter", "moved_to_pvt_paddy" in pay_js)

# 7. Private Trading - Ledger creation
with open(f"{DESKTOP}/private_trading.js") as f:
    pt_js = f.read()
check("PvtTrading: Ledger jama for party", "jama" in pt_js and "ledger" in pt_js)
check("PvtTrading: Truck payment ledger", "truck" in pt_js.lower() and "nikasi" in pt_js)

# 8. Staff - Ledger creation
with open(f"{DESKTOP}/staff.js") as f:
    st_js = f.read()
check("Staff: Advance ledger creation", "cash_transactions" in st_js)

# 9. CashBook - Party detection
with open(f"{DESKTOP}/cashbook.js") as f:
    cb_js = f.read()
check("CashBook: Party type detection", "party_type" in cb_js)

# Summary
passed = sum(1 for c in checks if c["ok"])
total = len(checks)
print(f"\n{'='*50}")
print(f"SYNC CHECK: {passed}/{total} passed")
if passed < total:
    print("FAILED CHECKS:")
    for c in checks:
        if not c["ok"]:
            print(f"  - {c['name']}: {c['detail']}")
else:
    print("All checks passed! Desktop is in sync.")
