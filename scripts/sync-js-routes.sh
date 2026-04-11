#!/bin/bash
# ============================================================
# JS Route Sync: desktop-app → local-server
# ============================================================
# Desktop-app is the "source of truth" for JS routes.
# This script copies all shared route files to local-server.
# Run this after making ANY change to desktop-app routes.
# Usage: bash /app/scripts/sync-js-routes.sh
# ============================================================

set -e

DESKTOP="/app/desktop-app"
LOCAL="/app/local-server"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  JS Route Sync: Desktop → Local Server ${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Files that are UNIQUE to local-server (don't overwrite)
LOCAL_ONLY=("cmr_exports.js" "ledgers.js")

SYNCED=0
SKIPPED=0
ERRORS=0

# Sync routes/
echo -e "${YELLOW}[1/3] Syncing routes/ ...${NC}"
for file in "$DESKTOP/routes/"*.js; do
    fname=$(basename "$file")
    
    # Skip local-only files
    skip=false
    for lo in "${LOCAL_ONLY[@]}"; do
        if [ "$fname" = "$lo" ]; then skip=true; break; fi
    done
    if $skip; then
        echo -e "  ${YELLOW}SKIP${NC} $fname (local-server only)"
        SKIPPED=$((SKIPPED+1))
        continue
    fi
    
    # Check if files differ
    if [ -f "$LOCAL/routes/$fname" ]; then
        if diff -q "$file" "$LOCAL/routes/$fname" > /dev/null 2>&1; then
            continue  # identical, skip silently
        fi
    fi
    
    cp "$file" "$LOCAL/routes/$fname"
    echo -e "  ${GREEN}SYNC${NC} $fname"
    SYNCED=$((SYNCED+1))
done

# Sync shared/
echo -e "${YELLOW}[2/3] Syncing shared/ ...${NC}"
for file in "$DESKTOP/shared/"*; do
    fname=$(basename "$file")
    if [ -f "$LOCAL/shared/$fname" ]; then
        if diff -q "$file" "$LOCAL/shared/$fname" > /dev/null 2>&1; then
            continue
        fi
    fi
    cp "$file" "$LOCAL/shared/$fname"
    echo -e "  ${GREEN}SYNC${NC} shared/$fname"
    SYNCED=$((SYNCED+1))
done

# Sync utils/
echo -e "${YELLOW}[3/3] Syncing utils/ ...${NC}"
if [ -d "$DESKTOP/utils" ]; then
    for file in "$DESKTOP/utils/"*; do
        fname=$(basename "$file")
        mkdir -p "$LOCAL/utils"
        if [ -f "$LOCAL/utils/$fname" ]; then
            if diff -q "$file" "$LOCAL/utils/$fname" > /dev/null 2>&1; then
                continue
            fi
        fi
        cp "$file" "$LOCAL/utils/$fname"
        echo -e "  ${GREEN}SYNC${NC} utils/$fname"
        SYNCED=$((SYNCED+1))
    done
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "  ${GREEN}Synced: $SYNCED${NC} | ${YELLOW}Skipped: $SKIPPED${NC} | ${RED}Errors: $ERRORS${NC}"
echo -e "${CYAN}========================================${NC}"

if [ $SYNCED -eq 0 ]; then
    echo -e "${GREEN}All routes already in sync!${NC}"
else
    echo -e "${GREEN}Done! $SYNCED files updated in local-server.${NC}"
fi
