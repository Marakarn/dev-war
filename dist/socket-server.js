"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSocketServer = getSocketServer;
// Standalone WebSocket server for queue updates
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const queue_1 = require("./queue");
let io = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let httpServer = null;
function getSocketServer() {
    if (!io) {
        httpServer = (0, http_1.createServer)();
        io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling']
        });
        // Handle client connections
        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            // Send current queue info to new client
            const queueInfo = queue_1.queueManager.getQueueInfo();
            socket.emit('queue-update', queueInfo);
            // Listen for client wanting to join queue updates
            socket.on('join-queue-updates', () => {
                socket.join('queue-updates');
                console.log('Client joined queue updates:', socket.id);
            });
            // Listen for client leaving queue updates
            socket.on('leave-queue-updates', () => {
                socket.leave('queue-updates');
                console.log('Client left queue updates:', socket.id);
            });
            // Handle client checking their position
            socket.on('check-position', (key) => {
                const position = queue_1.queueManager.getPosition(key);
                const isMyTurn = queue_1.queueManager.isMyTurn(key);
                socket.emit('position-update', { key, position, isMyTurn });
            });
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
        // Set up queue manager listener for broadcasting updates
        queue_1.queueManager.addListener((queueInfo) => {
            if (io) {
                io.to('queue-updates').emit('queue-update', queueInfo);
            }
        });
        // Start the server on port 3001 for WebSocket
        const port = process.env.WEBSOCKET_PORT || 3001;
        httpServer.listen(port, () => {
            console.log(`🚀 WebSocket server running on port ${port}`);
        });
        // Handle server shutdown gracefully
        process.on('SIGTERM', () => {
            console.log('Shutting down WebSocket server...');
            if (httpServer) {
                httpServer.close();
            }
        });
    }
    return io;
}
// Auto-start if this file is run directly
if (require.main === module) {
    console.log('Starting standalone WebSocket server...');
    getSocketServer();
}
