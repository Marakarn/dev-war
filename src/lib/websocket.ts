// WebSocket server for real-time queue updates
import { Server } from 'socket.io'
import { queueManager } from './queue'

export interface SocketServer {
  socket: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any
  }
}

export function initializeWebSocket(res: SocketServer) {
  if (!res.socket.server.io) {
    console.log('Setting up WebSocket server...')
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const io = new Server(res.socket.server as any, {
      path: '/api/socket',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    })

    // Handle client connections
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id)

      // Send current queue info to new client
      const queueInfo = queueManager.getQueueInfo()
      socket.emit('queue-update', queueInfo)

      // Listen for client wanting to join queue updates
      socket.on('join-queue-updates', () => {
        socket.join('queue-updates')
        console.log('Client joined queue updates:', socket.id)
      })

      // Listen for client leaving queue updates
      socket.on('leave-queue-updates', () => {
        socket.leave('queue-updates')
        console.log('Client left queue updates:', socket.id)
      })

      // Handle client checking their position
      socket.on('check-position', (key: string) => {
        const position = queueManager.getPosition(key)
        const isMyTurn = queueManager.isMyTurn(key)
        socket.emit('position-update', { key, position, isMyTurn })
      })

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id)
      })
    })

    // Set up queue manager listener for broadcasting updates
    queueManager.addListener((queueInfo) => {
      io.to('queue-updates').emit('queue-update', queueInfo)
    })

    res.socket.server.io = io
    console.log('WebSocket server initialized')
  }
}
