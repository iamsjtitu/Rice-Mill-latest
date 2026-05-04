#!/usr/bin/env python3
"""
v104.44.100 — Triple Version Sync Checker

Verifies that 3 version sources are in sync:
1. /app/frontend/src/utils/constants-version.js → APP_VERSION (UI footer/badge)
2. /app/desktop-app/package.json → version (drives GitHub Actions release tag)
3. /app/local-server/package.json → version

If out of sync, it AUTO-FIXES desktop-app and local-server to match the
frontend constant (which is treated as source of truth).

Usage:
  python3 /app/scripts/sync-version.py            # check only (exit 1 if mismatch)
  python3 /app/scripts/sync-version.py --fix      # auto-fix mismatches

This script is invoked by the pre-push git hook to prevent the "build skipped
because tag already exists" bug where desktop-app/package.json lagged behind
frontend.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path("/app")
FRONTEND_VERSION_FILE = ROOT / "frontend/src/utils/constants-version.js"
DESKTOP_PKG = ROOT / "desktop-app/package.json"
LOCAL_PKG = ROOT / "local-server/package.json"


def read_frontend_version():
    text = FRONTEND_VERSION_FILE.read_text()
    m = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', text)
    if not m:
        raise RuntimeError(f"Could not parse APP_VERSION from {FRONTEND_VERSION_FILE}")
    return m.group(1)


def read_pkg_version(pkg_path):
    return json.loads(pkg_path.read_text())["version"]


def write_pkg_version(pkg_path, new_version):
    text = pkg_path.read_text()
    new_text = re.sub(r'("version"\s*:\s*)"[^"]+"', rf'\1"{new_version}"', text, count=1)
    pkg_path.write_text(new_text)


def main():
    fix = "--fix" in sys.argv
    fe_v = read_frontend_version()
    dt_v = read_pkg_version(DESKTOP_PKG)
    lc_v = read_pkg_version(LOCAL_PKG)

    print(f"Frontend (constants-version.js): {fe_v}")
    print(f"Desktop  (package.json):         {dt_v}")
    print(f"Local    (package.json):         {lc_v}")

    if fe_v == dt_v == lc_v:
        print("\n✅ All 3 versions in sync.")
        return 0

    print(f"\n⚠️  Version MISMATCH detected.")
    if not fix:
        print("\nFix steps:")
        print("  1. Run: python3 /app/scripts/sync-version.py --fix")
        print(f"     (will set desktop-app and local-server to {fe_v})")
        print("\nOr manually edit:")
        print(f"  - {DESKTOP_PKG}  → \"version\": \"{fe_v}\"")
        print(f"  - {LOCAL_PKG}    → \"version\": \"{fe_v}\"")
        print()
        print("⚠️  Why this matters: GitHub Actions reads desktop-app/package.json")
        print("   to compute release tag. If it lags behind frontend, build will")
        print("   say 'release already exists' and skip — no new installer made.")
        return 1

    if dt_v != fe_v:
        write_pkg_version(DESKTOP_PKG, fe_v)
        print(f"  Fixed desktop-app/package.json: {dt_v} → {fe_v}")
    if lc_v != fe_v:
        write_pkg_version(LOCAL_PKG, fe_v)
        print(f"  Fixed local-server/package.json: {lc_v} → {fe_v}")
    print("\n✅ Versions synced.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
