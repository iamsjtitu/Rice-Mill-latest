#!/bin/bash
echo "========================================"
echo "  Mill Entry System - Starting..."
echo "========================================"

if [ ! -d "public" ]; then
    echo "[ERROR] Frontend build nahi mila! Pehle setup karein."
    echo "cd ../frontend && npm install && REACT_APP_BACKEND_URL=http://localhost:8080 npm run build && cp -r build ../local-server/public"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[INFO] Dependencies install ho rahe hain..."
    npm install
fi

echo "Server start ho raha hai..."
echo "Browser mein http://localhost:8080 khulega"
echo "Band karne ke liye: Ctrl+C"
echo "========================================"
node server.js
