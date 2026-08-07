#!/bin/bash
set -e

APP_DIR="/run/media/system/Data/Projects/vrcx-extras"
cd "$APP_DIR"

echo "Stopping any existing vrcx-extras server instances..."
pkill -f "node --disable-warning=ExperimentalWarning server.ts" || true
fuser -k 8990/tcp || true

echo "Running typecheck and build..."
npm run typecheck
npm run build

echo "Starting server..."
node --disable-warning=ExperimentalWarning server.ts &
SERVER_PID=$!

sleep 1.5

xdg-open "http://localhost:8990" || true

wait $SERVER_PID

