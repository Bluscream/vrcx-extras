#!/bin/bash
set -e

APP_DIR="/run/media/system/Data/Projects/vrcx-extras"
cd "$APP_DIR"

if [ ! -d "dist" ]; then
    npm run build
fi

node --disable-warning=ExperimentalWarning server.ts &
SERVER_PID=$!

sleep 1.5

xdg-open "http://localhost:8990" || true

wait $SERVER_PID
