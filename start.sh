#!/bin/bash

# Production startup script for Dev War Queue System
echo "🚀 Starting Dev War Queue System..."

# Check if we're in standalone mode (Docker production)
if [ -f "server.js" ]; then
    echo "📦 Production mode detected"
    
    # Create a simple WebSocket server inline since we can't use ts-node in production
    echo "⚡ Starting integrated WebSocket server..."
    
    # Start Next.js server (server.js includes WebSocket now through next.config.js)
    echo "🌐 Starting Next.js server on port ${PORT:-4000}..."
    exec node server.js
else
    echo "🛠️  Development mode detected"
    
    # Development mode with separate WebSocket server
    echo "⚡ Starting WebSocket server on port ${WEBSOCKET_PORT:-3001}..."
    node -e "require('./src/lib/socket-server.ts')" &
    
    # Wait for socket server
    sleep 2
    
    echo "🌐 Starting Next.js development server..."
    exec npm run dev
fi
