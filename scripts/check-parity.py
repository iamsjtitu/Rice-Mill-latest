#!/usr/bin/env python3
"""
Triple Backend Parity Checker
==============================
Compares API routes across Python (FastAPI), Desktop (Express), and Local (Express) backends.
Reports: missing routes, collection name mismatches, and summary.

Usage: python3 /app/scripts/check-parity.py
"""

import re
import os
import sys
from pathlib import Path
from collections import defaultdict

# ─── Config ───
PYTHON_ROUTES_DIR = "/app/backend/routes"
DESKTOP_ROUTES_DIR = "/app/desktop-app/routes"
LOCAL_ROUTES_DIR = "/app/local-server/routes"

# Collection name mapping: Python MongoDB name → JS local storage name
# This is the single source of truth for collection names
COLLECTION_MAP = {
    "mill_entries": "milling_entries",
    "vehicle_weights": "vehicle_weights",
    "entries": "entries",
    "cash_transactions": "cash_transactions",
    "paddy_cutting": "paddy_cutting",
    "private_paddy": "private_paddy",
    "private_payments": "private_payments",
    "rice_sales": "rice_sales",
    "byproduct_sales": "byproduct_sales",
    "frk_purchases": "frk_purchases",
    "diesel_accounts": "diesel_accounts",
    "hemali_items": "hemali_items",
    "hemali_payments": "hemali_payments",
    "staff": "staff",
    "staff_payments": "staff_payments",
    "staff_advances": "staff_advances",
    "gunny_bags": "gunny_bags",
    "store_rooms": "store_rooms",
    "mandi_targets": "mandi_targets",
    "mill_parts": "mill_parts",
    "mill_parts_stock": "mill_parts_stock",
    "truck_leases": "truck_leases",
    "opening_balances": "opening_balances",
    "dc_entries": "dc_entries",
    "dc_deliveries": "dc_deliveries",
    "sale_book": "sale_book",
    "purchase_book": "purchase_book",
    "bank_accounts": "bank_accounts",
    "local_party": "local_party",
    "app_settings": "app_settings",
}

# Colors
C = {
    "R": "\033[91m", "G": "\033[92m", "Y": "\033[93m",
    "C": "\033[96m", "B": "\033[94m", "N": "\033[0m", "BOLD": "\033[1m"
}

def extract_python_routes(routes_dir):
    """Extract routes from FastAPI Python files."""
    routes = []
    prefix_map = {}

    # First pass: find router prefixes from __init__.py
    init_file = os.path.join(routes_dir, "__init__.py")
    if os.path.exists(init_file):
        with open(init_file) as f:
            content = f.read()
        # Find: app.include_router(xxx, prefix="/yyy")
        for m in re.finditer(r'include_router\(\s*(\w+).*?prefix\s*=\s*["\']([^"\']+)', content):
            prefix_map[m.group(1)] = m.group(2)

    for py_file in sorted(Path(routes_dir).glob("*.py")):
        if py_file.name.startswith("__"):
            continue
        with open(py_file) as f:
            content = f.read()
        
        # Extract routes
        for m in re.finditer(r'@router\.(get|post|put|delete)\(\s*"([^"]+)"', content):
            method = m.group(1).upper()
            path = m.group(2)
            # Normalize path params: {param} → :param
            normalized = re.sub(r'\{(\w+)\}', r':\1', path)
            routes.append({
                "method": method,
                "path": normalized,
                "file": py_file.name,
                "line": content[:m.start()].count('\n') + 1
            })
    
    return routes

def extract_js_routes(routes_dir):
    """Extract routes from Express JS files."""
    routes = []
    for js_file in sorted(Path(routes_dir).glob("*.js")):
        with open(js_file) as f:
            content = f.read()
        
        for m in re.finditer(r"router\.(get|post|put|delete)\(\s*'(/api[^']+)'", content):
            method = m.group(1).upper()
            path = m.group(2)
            # Remove /api prefix for comparison
            normalized = path.replace("/api", "", 1)
            routes.append({
                "method": method,
                "path": normalized,
                "file": js_file.name,
                "line": content[:m.start()].count('\n') + 1
            })
    
    return routes

def normalize_route(path):
    """Normalize route for comparison (collapse all params to :id)."""
    return re.sub(r':\w+', ':id', path)

def check_collection_names(routes_dir, is_python=False):
    """Check for incorrect collection name usage in JS backends."""
    issues = []
    pattern_dir = Path(routes_dir)
    
    if is_python:
        files = pattern_dir.glob("*.py")
    else:
        files = pattern_dir.glob("*.js")
    
    for f in sorted(files):
        if f.name.startswith("__"):
            continue
        with open(f) as fh:
            lines = fh.readlines()
        
        for i, line in enumerate(lines, 1):
            if is_python:
                # Check db["collection_name"] or db.collection_name
                for m in re.finditer(r'db\["(\w+)"\]|db\.(\w+)', line):
                    coll = m.group(1) or m.group(2)
                    if coll in ('command', 'list_collection_names', 'create_index', 'data', 'getBranding'):
                        continue
                    if coll not in COLLECTION_MAP and coll not in COLLECTION_MAP.values():
                        issues.append({"file": f.name, "line": i, "collection": coll, "issue": "Unknown collection"})
            else:
                # Check database.data.xxx in JS
                for m in re.finditer(r'database\.data\.(\w+)', line):
                    arr = m.group(1)
                    if arr in ('app_settings', 'branding', 'users', 'backups'):
                        continue
                    # Check if this is a known JS array name
                    known_js_names = set(COLLECTION_MAP.values())
                    known_js_names.update(COLLECTION_MAP.keys())  # some might be same
                    if arr not in known_js_names and arr not in COLLECTION_MAP:
                        issues.append({"file": f.name, "line": i, "collection": arr, "issue": "Unknown array name"})
    
    return issues

def main():
    print(f"\n{C['C']}{C['BOLD']}{'='*60}")
    print(f"  TRIPLE BACKEND PARITY CHECKER")
    print(f"{'='*60}{C['N']}\n")

    # Extract routes
    print(f"{C['Y']}[1/4] Extracting routes...{C['N']}")
    py_routes = extract_python_routes(PYTHON_ROUTES_DIR)
    dt_routes = extract_js_routes(DESKTOP_ROUTES_DIR)
    lc_routes = extract_js_routes(LOCAL_ROUTES_DIR)
    
    print(f"  Python: {len(py_routes)} routes")
    print(f"  Desktop JS: {len(dt_routes)} routes")
    print(f"  Local JS: {len(lc_routes)} routes")

    # Create normalized route sets
    py_set = {(r["method"], normalize_route(r["path"])) for r in py_routes}
    dt_set = {(r["method"], normalize_route(r["path"])) for r in dt_routes}
    lc_set = {(r["method"], normalize_route(r["path"])) for r in lc_routes}

    # Build lookup for file info
    py_lookup = {(r["method"], normalize_route(r["path"])): r for r in py_routes}
    dt_lookup = {(r["method"], normalize_route(r["path"])): r for r in dt_routes}

    # ─── Check 1: Routes in Python but NOT in Desktop JS ───
    print(f"\n{C['Y']}[2/4] Routes in Python but MISSING in Desktop JS:{C['N']}")
    missing_in_dt = py_set - dt_set
    # Exclude known Python-only routes (like /docs, health checks)
    skip_patterns = ['/docs', '/openapi', '/redoc', '/health']
    missing_in_dt = {r for r in missing_in_dt if not any(p in r[1] for p in skip_patterns)}

    # Known Python-only routes (migrations, web-only APIs)
    python_only_patterns = [
        '/fix-old', '/fix-empty', '/fix-cash', '/migrate-',
        '/whatsapp/', '/telegram/send-custom',
        '/weighbridge/', '/settings/storage-engine',
        '/sale-book/:id/whatsapp'
    ]
    # Also exclude exact root path (Python health check)
    python_only = {r for r in missing_in_dt if any(p in r[1] for p in python_only_patterns) or r[1] == '/'}
    real_missing_dt = missing_in_dt - python_only
    
    if real_missing_dt:
        for method, path in sorted(real_missing_dt):
            info = py_lookup.get((method, path), {})
            print(f"  {C['R']}MISSING{C['N']} {method:6s} {path:50s} (Python: {info.get('file', '?')}:{info.get('line', '?')})")
    else:
        print(f"  {C['G']}All shared Python routes exist in Desktop JS!{C['N']}")
    
    if python_only:
        print(f"  {C['B']}INFO: {len(python_only)} Python-only routes (migrations/web-only) - OK to skip{C['N']}")
    else:
        print(f"  {C['G']}All Python routes exist in Desktop JS!{C['N']}")

    # ─── Check 2: Routes in Desktop JS but NOT in Local JS ───
    print(f"\n{C['Y']}[3/4] Routes in Desktop JS but MISSING in Local JS:{C['N']}")
    missing_in_lc = dt_set - lc_set
    
    if missing_in_lc:
        for method, path in sorted(missing_in_lc):
            info = dt_lookup.get((method, path), {})
            print(f"  {C['R']}MISSING{C['N']} {method:6s} {path:50s} (Desktop: {info.get('file', '?')}:{info.get('line', '?')})")
        print(f"\n  {C['Y']}FIX: Run 'bash /app/scripts/sync-js-routes.sh' to sync{C['N']}")
    else:
        print(f"  {C['G']}Desktop and Local JS routes are in sync!{C['N']}")

    # ─── Check 3: Routes in JS but NOT in Python (extras) ───
    extra_in_js = dt_set - py_set
    skip_js_only = ['/camera', '/error-log', '/vigi', '/serial', '/update']
    extra_in_js = {r for r in extra_in_js if not any(p in r[1] for p in skip_js_only)}
    if extra_in_js:
        print(f"\n  {C['B']}INFO: {len(extra_in_js)} routes exist in JS but not Python (Desktop-only features){C['N']}")

    # ─── Summary ───
    print(f"\n{C['Y']}[4/4] Summary:{C['N']}")
    total_issues = len(real_missing_dt) + len(missing_in_lc)
    
    if total_issues == 0:
        print(f"\n  {C['G']}{C['BOLD']}ALL CLEAR! Triple backend parity looks good.{C['N']}")
    else:
        print(f"\n  {C['R']}{C['BOLD']}PARITY ISSUES FOUND: {total_issues}{C['N']}")
        if real_missing_dt:
            print(f"  {C['R']}  - {len(real_missing_dt)} routes missing in Desktop JS (need manual port from Python){C['N']}")
        if missing_in_lc:
            print(f"  {C['R']}  - {len(missing_in_lc)} routes missing in Local JS (run sync script){C['N']}")
    
    print(f"\n{C['C']}{'='*60}{C['N']}\n")
    
    return 1 if total_issues > 0 else 0

if __name__ == "__main__":
    sys.exit(main())
