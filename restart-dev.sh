#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}    Flo POS - Full Restart Script      ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to kill processes on a port
kill_port() {
    local port=$1
    echo -e "${YELLOW}Checking port $port...${NC}"
    
    # Find and kill process using the port
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}Killing processes on port $port...${NC}"
        lsof -Pi :$port -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}Port $port freed${NC}"
    else
        echo -e "${GREEN}Port $port is already free${NC}"
    fi
}

# Function to kill by process name
kill_process() {
    local name=$1
    echo -e "${YELLOW}Checking for $name processes...${NC}"
    if pgrep -f "$name" > /dev/null 2>&1; then
        echo -e "${RED}Killing $name processes...${NC}"
        pkill -9 -f "$name" 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}$name processes killed${NC}"
    else
        echo -e "${GREEN}No $name processes found${NC}"
    fi
}

echo -e "${BLUE}Step 1: Killing existing processes${NC}"
echo "----------------------------------------"

# Kill processes on specific ports
kill_port 3000  # Next.js dev server
kill_port 3001  # API server (expected by frontend)
kill_port 3088  # Old API server port

# Kill by process names
kill_process "next"
kill_process "node server.js"
kill_process "electron"

echo ""
echo -e "${BLUE}Step 2: Clearing caches${NC}"
echo "----------------------------------------"

# Clear Next.js cache
if [ -d "frontend/.next" ]; then
    echo -e "${YELLOW}Clearing Next.js cache...${NC}"
    rm -rf frontend/.next
    echo -e "${GREEN}Next.js cache cleared${NC}"
fi

# Clear node_modules/.cache if it exists
if [ -d "frontend/node_modules/.cache" ]; then
    echo -e "${YELLOW}Clearing node_modules cache...${NC}"
    rm -rf frontend/node_modules/.cache
    echo -e "${GREEN}Node modules cache cleared${NC}"
fi

# Clear dist folder
if [ -d "dist" ]; then
    echo -e "${YELLOW}Clearing dist folder...${NC}"
    rm -rf dist
    echo -e "${GREEN}Dist folder cleared${NC}"
fi

echo ""
echo -e "${BLUE}Step 3: Updating server to use port 3001${NC}"
echo "----------------------------------------"

# Update server.js to use port 3001 instead of 3088
if grep -q "const PORT = process.env.PORT || 3088" server.js; then
    echo -e "${YELLOW}Updating server.js to use port 3001...${NC}"
    sed -i '' 's/const PORT = process.env.PORT || 3088/const PORT = process.env.PORT || 3001/' server.js
    echo -e "${GREEN}Server.js updated to use port 3001${NC}"
else
    echo -e "${GREEN}Server.js already configured for port 3001${NC}"
fi

echo ""
echo -e "${BLUE}Step 4: Starting the backend API server${NC}"
echo "----------------------------------------"

# Start the server in the background
export PORT=3001
node server.js &
SERVER_PID=$!

# Wait for server to start
echo -e "${YELLOW}Waiting for API server to start...${NC}"
sleep 3

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${GREEN}API server started on port 3001 (PID: $SERVER_PID)${NC}"
else
    echo -e "${RED}Failed to start API server${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 5: Testing API endpoints${NC}"
echo "----------------------------------------"

# Test the health endpoint
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}API is responding on port 3001${NC}"
else
    echo -e "${RED}API is not responding yet, waiting...${NC}"
    sleep 2
fi

# Test the customers-search endpoint
echo -e "${YELLOW}Testing /api/customers-search endpoint...${NC}"
if curl -s "http://localhost:3001/api/customers-search?q=test" > /dev/null 2>&1; then
    echo -e "${GREEN}customers-search endpoint is working${NC}"
else
    echo -e "${RED}customers-search endpoint returned error (may need restart)${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}    Setup Complete!                    ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}API Server:${NC} http://localhost:3001"
echo -e "${YELLOW}Server PID:${NC} $SERVER_PID"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. In a new terminal, run: cd frontend && npm run dev"
echo "   (This will start the Next.js dev server on port 3000)"
echo ""
echo -e "2. Or to run the full Electron app: npm run dev"
echo ""
echo -e "${YELLOW}To stop the API server:${NC} kill $SERVER_PID"
echo ""

# Keep the script running to maintain the server
wait $SERVER_PID
