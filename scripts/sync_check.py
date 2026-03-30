#!/usr/bin/env python3
"""
Route Sync Checker v2 - Detects missing API endpoints across triple backends
Compares Python (FastAPI) routes with JS (Express) routes in desktop-app & local-server

Key Feature: Cross-file matching - a Python endpoint in entries.py can be found
in dashboard.js or exports.js in JS. No false positives from file reorganization.

Usage:
  python3 sync_check.py              # Full report  
  python3 sync_check.py --brief      # Summary only
  python3 sync_check.py --fix        # Show JS boilerplate for missing endpoints
  python3 sync_check.py --json       # Machine-readable JSON output
"""
import os, re, sys, json
from collections import defaultdict
from datetime import datetime

# ─── Configuration ────────────────────────────────────

PY_ROUTES = "/app/backend/routes"
DESKTOP_ROUTES = "/app/desktop-app/routes"
LOCAL_ROUTES = "/app/local-server/routes"

# Files that are helpers, not route files
SKIP_JS = {"safe_handler.js", "pdf_helpers.js", "excel_helpers.js", "daily_report_logic.js"}
SKIP_PY = {"__init__.py"}

# Endpoints to IGNORE in sync check (one-time migrations, health checks, etc.)
IGNORE_ENDPOINTS = {
    ("GET", "/api/"),                            # Root health check
    ("POST", "/api/entries/fix-cash-ledger"),     # One-time migration
    ("POST", "/api/cash-book/fix-empty-party-types"),  # One-time fix
    ("POST", "/api/cash-book/migrate-ledger-entries"),  # One-time migration
    ("POST", "/api/private-paddy/migrate-cashbook"),    # One-time migration
    ("GET", "/api/private-payments/fix-old-entries"),    # One-time fix
}

# ─── Endpoint Extraction ────────────────────────────────────

def extract_python_endpoints(filepath):
    """Extract (METHOD, PATH) from FastAPI @router decorators."""
    endpoints = []
    try:
        with open(filepath) as f:
            content = f.read()
    except Exception:
        return endpoints
    pattern = r'@router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']'
    for m in re.finditer(pattern, content):
        method = m.group(1).upper()
        path = m.group(2)
        if not path.startswith("/"):
            path = "/" + path
        if not path.startswith("/api/"):
            path = "/api/" + path.lstrip("/")
        endpoints.append((method, path))
    return endpoints


def extract_js_endpoints(filepath):
    """Extract (METHOD, PATH) from Express router.method() calls."""
    endpoints = []
    try:
        with open(filepath) as f:
            content = f.read()
    except Exception:
        return endpoints
    pattern = r'router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']'
    for m in re.finditer(pattern, content):
        method = m.group(1).upper()
        path = m.group(2)
        endpoints.append((method, path))
    return endpoints


def normalize_path(path):
    """Normalize: /api/vehicle-weight/{entry_id}/edit → /api/vehicle-weight/:id/edit"""
    # Convert Python {param} to Express :param
    path = re.sub(r'\{([^}]+)\}', r':\1', path)
    # Normalize all param names to just :param for comparison
    path = re.sub(r':[\w]+', ':param', path)
    return path.rstrip('/')


def endpoints_match(method1, path1, method2, path2):
    """Check if two endpoints refer to the same API."""
    if method1 != method2:
        return False
    return normalize_path(path1) == normalize_path(path2)


# ─── Scanning ────────────────────────────────────

def scan_all_endpoints(route_dir, extractor, skip_files):
    """Scan directory and return:
       - by_file: {filename: [(METHOD, PATH), ...]}  
       - all_endpoints: set of (METHOD, normalized_PATH)
    """
    by_file = {}
    all_endpoints = []  # (METHOD, original_PATH, filename)
    if not os.path.isdir(route_dir):
        return by_file, all_endpoints
    for fname in sorted(os.listdir(route_dir)):
        if fname in skip_files:
            continue
        fpath = os.path.join(route_dir, fname)
        if not os.path.isfile(fpath):
            continue
        endpoints = extractor(fpath)
        if endpoints:
            by_file[fname] = endpoints
            for method, path in endpoints:
                all_endpoints.append((method, path, fname))
    return by_file, all_endpoints


def find_in_pool(method, path, endpoint_pool):
    """Check if (method, path) exists anywhere in the endpoint pool."""
    for pm, pp, fname in endpoint_pool:
        if endpoints_match(method, path, pm, pp):
            return fname  # Return the file where it was found
    return None


# ─── Report ────────────────────────────────────

def run_sync_check(brief=False, fix=False, as_json=False):
    py_by_file, py_all = scan_all_endpoints(PY_ROUTES, extract_python_endpoints, SKIP_PY)
    dt_by_file, dt_all = scan_all_endpoints(DESKTOP_ROUTES, extract_js_endpoints, SKIP_JS)
    lc_by_file, lc_all = scan_all_endpoints(LOCAL_ROUTES, extract_js_endpoints, SKIP_JS)

    total_py = len(py_all)
    total_dt = len(dt_all)
    total_lc = len(lc_all)

    # Find missing endpoints (cross-file matching)
    missing_desktop = []  # (METHOD, PATH, source_py_file)
    missing_local = []

    for method, path, py_file in py_all:
        # Skip ignored endpoints
        norm = normalize_path(path)
        skip = False
        for im, ip in IGNORE_ENDPOINTS:
            if im == method and normalize_path(ip) == norm:
                skip = True
                break
        if skip:
            continue

        dt_found = find_in_pool(method, path, dt_all)
        lc_found = find_in_pool(method, path, lc_all)

        if not dt_found:
            missing_desktop.append((method, path, py_file))
        if not lc_found:
            missing_local.append((method, path, py_file))

    # ─── JSON Output ──
    if as_json:
        result = {
            "timestamp": datetime.now().isoformat(),
            "totals": {"python": total_py, "desktop": total_dt, "local": total_lc},
            "missing_desktop": [{"method": m, "path": p, "source": f} for m, p, f in missing_desktop],
            "missing_local": [{"method": m, "path": p, "source": f} for m, p, f in missing_local],
            "in_sync": len(missing_desktop) == 0 and len(missing_local) == 0
        }
        print(json.dumps(result, indent=2))
        return missing_desktop, missing_local

    # ─── Text Output ──
    print("=" * 64)
    print(f"  ROUTE SYNC CHECK - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 64)
    print(f"  Python (FastAPI):    {len(py_by_file):2d} files, {total_py:3d} endpoints")
    print(f"  Desktop (Electron):  {len(dt_by_file):2d} files, {total_dt:3d} endpoints")
    print(f"  Local (LAN Server):  {len(lc_by_file):2d} files, {total_lc:3d} endpoints")
    print(f"  Ignored:             {len(IGNORE_ENDPOINTS)} (one-time migrations)")
    print("=" * 64)

    if not brief:
        if missing_desktop:
            print(f"\n[!!] DESKTOP - Missing {len(missing_desktop)} endpoints:")
            by_source = defaultdict(list)
            for method, path, src in missing_desktop:
                by_source[src].append((method, path))
            for src, eps in sorted(by_source.items()):
                print(f"  From {src}:")
                for method, path in eps:
                    print(f"    {method:6s} {path}")

        if missing_local:
            print(f"\n[!!] LOCAL SERVER - Missing {len(missing_local)} endpoints:")
            by_source = defaultdict(list)
            for method, path, src in missing_local:
                by_source[src].append((method, path))
            for src, eps in sorted(by_source.items()):
                print(f"  From {src}:")
                for method, path in eps:
                    print(f"    {method:6s} {path}")

    # Summary
    print("\n" + "=" * 64)
    if not missing_desktop and not missing_local:
        print("  [OK] All backends are IN SYNC!")
    else:
        total_missing = max(len(missing_desktop), len(missing_local))
        sync_pct = round((1 - total_missing / max(total_py, 1)) * 100, 1)
        print(f"  Desktop:  {len(missing_desktop)} missing  |  Local: {len(missing_local)} missing")
        print(f"  Sync Level: ~{sync_pct}%")
    print("=" * 64)

    # ─── Fix Mode: Generate Boilerplate ──
    if fix and (missing_desktop or missing_local):
        print("\n" + "=" * 64)
        print("  JS BOILERPLATE (copy into your route files)")
        print("=" * 64)
        combined = set()
        for m, p, _ in missing_desktop:
            combined.add((m, p))
        for m, p, _ in missing_local:
            combined.add((m, p))
        for method, path in sorted(combined):
            express_path = re.sub(r'\{([^}]+)\}', r':\1', path)
            print(f"\n  // {method} {express_path}")
            print(f"  router.{method.lower()}('{express_path}', safeAsync(async (req, res) => {{")
            print(f"    // TODO: Port logic from Python backend")
            print(f"    res.json({{ success: true }});")
            print(f"  }}));")

    return missing_desktop, missing_local


# ─── Main ────────────────────────────────────

if __name__ == "__main__":
    brief = '--brief' in sys.argv
    fix = '--fix' in sys.argv
    as_json = '--json' in sys.argv

    missing_d, missing_l = run_sync_check(brief=brief, fix=fix, as_json=as_json)
    sys.exit(0 if (not missing_d and not missing_l) else 1)
