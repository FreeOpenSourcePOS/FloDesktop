#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    Flo POS - Nuclear Reset             ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${BLUE}Step 1: Killing all processes${NC}"
echo "----------------------------------------"

# Kill everything
sudo pkill -9 -f "electron" 2>/dev/null || true
sudo pkill -9 -f "node" 2>/dev/null || true
sudo pkill -9 -f "flo" 2>/dev/null || true
sleep 2

# Force kill any remaining on ports
for port in 3000 3001 3088; do
    pid=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo -e "${RED}Killing process $pid on port $port${NC}"
        sudo kill -9 $pid 2>/dev/null || true
    fi
done

echo -e "${GREEN}All processes killed${NC}"

echo ""
echo -e "${BLUE}Step 2: Clearing ALL caches${NC}"
echo "----------------------------------------"

# Project caches
rm -rf frontend/.next 2>/dev/null && echo -e "${GREEN}Cleared: frontend/.next${NC}"
rm -rf frontend/node_modules/.cache 2>/dev/null && echo -e "${GREEN}Cleared: frontend/node_modules/.cache${NC}"
rm -rf dist 2>/dev/null && echo -e "${GREEN}Cleared: dist/${NC}"

# Electron caches
rm -rf ~/Library/Application\ Support/flo-desktop/Cache 2>/dev/null && echo -e "${GREEN}Cleared: Electron app cache${NC}"
rm -rf ~/Library/Application\ Support/flo-desktop/Code\ Cache 2>/dev/null && echo -e "${GREEN}Cleared: Electron code cache${NC}"
rm -rf ~/Library/Caches/flo-desktop 2>/dev/null && echo -e "${GREEN}Cleared: Electron system cache${NC}"

# TypeScript incremental build cache
rm -f tsconfig.tsbuildinfo 2>/dev/null && echo -e "${GREEN}Cleared: TS build info${NC}"

echo ""
echo -e "${BLUE}Step 3: Rebuilding TypeScript${NC}"
echo "----------------------------------------"

npm run build 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Build successful${NC}"
else
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 4: Verify routes are compiled${NC}"
echo "----------------------------------------"

if grep -q "customers-search" dist/routes/index.js; then
    echo -e "${GREEN}✓ customers-search route found in compiled code${NC}"
else
    echo -e "${RED}✗ customers-search route NOT found!${NC}"
    exit 1
fi

if grep -q "crm/lookup" dist/routes/index.js; then
    echo -e "${GREEN}✓ crm/lookup route found in compiled code${NC}"
else
    echo -e "${RED}✗ crm/lookup route NOT found!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}    Nuclear Reset Complete!            ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Now run: npm run dev${NC}"
echo ""
