#!/bin/bash
# Sync Script: Keeps desktop-app and local-server in sync
# Also copies shared config to both backends
# Usage: bash sync_backends.sh

echo "=== Backend Sync Script ==="

# 1. Copy shared config/helpers
echo "[1/3] Syncing shared config..."
# shared/report_config.json and shared/report_helper.js are already accessible via relative paths

# 2. Sync routes from desktop-app to local-server
echo "[2/3] Syncing Node.js routes (desktop-app -> local-server)..."
ROUTES_TO_SYNC=(
    "routes/reports.js"
    "routes/dc_payments.js"
    "routes/daily_report.js"
    "routes/entries.js"
    "routes/auth.js"
    "routes/staff.js"
    "routes/masters.js"
    "routes/telegram.js"
    "routes/pdf_helpers.js"
    "routes/safe_handler.js"
)

SYNCED=0
for route in "${ROUTES_TO_SYNC[@]}"; do
    SRC="/app/desktop-app/$route"
    DST="/app/local-server/$route"
    if [ -f "$SRC" ]; then
        if ! diff -q "$SRC" "$DST" > /dev/null 2>&1; then
            cp "$SRC" "$DST"
            echo "  UPDATED: $route"
            SYNCED=$((SYNCED + 1))
        fi
    fi
done

if [ $SYNCED -eq 0 ]; then
    echo "  All routes already in sync!"
else
    echo "  Synced $SYNCED file(s)"
fi

# 3. Sync db/ files
echo "[3/3] Syncing db files..."
DB_SYNCED=0
for dbfile in /app/desktop-app/db/*.js; do
    fname=$(basename "$dbfile")
    DST="/app/local-server/db/$fname"
    if [ -f "$dbfile" ] && [ -f "$DST" ]; then
        if ! diff -q "$dbfile" "$DST" > /dev/null 2>&1; then
            cp "$dbfile" "$DST"
            echo "  UPDATED: db/$fname"
            DB_SYNCED=$((DB_SYNCED + 1))
        fi
    fi
done

if [ $DB_SYNCED -eq 0 ]; then
    echo "  All db files already in sync!"
else
    echo "  Synced $DB_SYNCED file(s)"
fi

echo ""
echo "=== Sync Complete ==="
echo "Shared config: /app/shared/report_config.json"
echo "To add/remove/reorder columns, edit report_config.json only!"
