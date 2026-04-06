#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    Flo POS - Full Rebuild & Restart   ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to kill processes on a port
kill_port() {
    local port=$1
    echo -e "${YELLOW}Checking port $port...${NC}"
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}Killing processes on port $port...${NC}"
        lsof -Pi :$port -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}Port $port freed${NC}"
    else
        echo -e "${GREEN}Port $port is already free${NC}"
    fi
}

echo -e "${BLUE}Step 1: Killing existing processes${NC}"
echo "----------------------------------------"

kill_port 3000
kill_port 3001
kill_port 3088

# Kill Electron and Node processes
pkill -9 -f "electron" 2>/dev/null || true
pkill -9 -f "next" 2>/dev/null || true

echo ""
echo -e "${BLUE}Step 2: Clearing caches${NC}"
echo "----------------------------------------"

rm -rf frontend/.next 2>/dev/null && echo -e "${GREEN}Next.js cache cleared${NC}"
rm -rf frontend/node_modules/.cache 2>/dev/null && echo -e "${GREEN}Node modules cache cleared${NC}"
rm -rf dist 2>/dev/null && echo -e "${GREEN}Dist folder cleared${NC}"

echo ""
echo -e "${BLUE}Step 3: Rebuilding TypeScript${NC}"
echo "----------------------------------------"

npm run build 2>&1 | tail -20
if [ $? -eq 0 ]; then
    echo -e "${GREEN}TypeScript build successful${NC}"
else
    echo -e "${RED}TypeScript build failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 4: Starting Electron Dev${NC}"
echo "----------------------------------------"
echo -e "${GREEN}Running: npm run dev${NC}"
echo ""

npm run dev
