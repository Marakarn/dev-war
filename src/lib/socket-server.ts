// Standalone WebSocket server for queue updates
import { createServer } from 'http'
import { Server } from 'socket.io'
import { queueManager } from './queue'

let io: Server | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let httpServer: any = null

export function getSocketServer(): Server {
  if (!io) {
    httpServer = createServer()
    io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
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

      // ===== TEST FUNCTIONS - REMOVE IN PRODUCTION =====
      // Function to simulate adding multiple users to queue for testing
      socket.on('test-add-bulk-queue', async (count: number) => {
        console.log(`🧪 TEST: Adding ${count} users to queue...`)
        
        for (let i = 1; i <= count; i++) {
          const testKey = `TEST-USER-${Date.now()}-${i.toString().padStart(3, '0')}`
          try {
            await queueManager.addToQueue(testKey)
            console.log(`✅ Added test user ${i}/${count}: ${testKey}`)
          } catch (error) {
            console.error(`❌ Failed to add test user ${i}: ${error}`)
          }
          
          // Add small delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        
        console.log(`🎉 TEST: Successfully added ${count} users to queue`)
        socket.emit('test-bulk-queue-complete', { count, message: 'Bulk queue test completed' })
      })
    // Function to clear all queue for testing
    socket.on('test-clear-queue', () => {
      console.log('🧪 TEST: Clearing entire queue...')
      // Note: This directly manipulates the internal queue - only for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(queueManager as any).queue = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(queueManager as any).processing.clear()
      
      // Notify all clients about the update
      const queueInfo = queueManager.getQueueInfo()
      io?.to('queue-updates').emit('queue-update', queueInfo)
      
      console.log('🗑️ TEST: Queue cleared')
      socket.emit('test-queue-cleared', { message: 'Queue has been cleared' })
    })

      // Function to process next in queue (simulate user completing checkout)
      socket.on('test-process-next', async () => {
        console.log('🧪 TEST: Processing next user in queue...')
        try {
          const nextKey = await queueManager.processNext()
          if (nextKey) {
            console.log(`✅ TEST: Processed user: ${nextKey}`)
            socket.emit('test-user-processed', { key: nextKey, message: 'User processed successfully' })
            
            // Auto-complete processing after 2 seconds (simulate checkout completion)
            setTimeout(async () => {
              await queueManager.completeProcessing(nextKey)
              console.log(`🏁 TEST: Completed processing for: ${nextKey}`)
            }, 2000)
          } else {
            console.log('📭 TEST: No users in queue to process')
            socket.emit('test-no-users', { message: 'No users in queue' })
          }
        } catch (error) {
          console.error('❌ TEST: Error processing next user:', error)
          socket.emit('test-error', { error: 'Failed to process next user' })
        }
      })
      // ===== END TEST FUNCTIONS =====
    })

    // Set up queue manager listener for broadcasting updates
    queueManager.addListener((queueInfo) => {
      if (io) {
        io.to('queue-updates').emit('queue-update', queueInfo)
      }
    })

    // Start the server on port 3001 for WebSocket
    const port = process.env.WEBSOCKET_PORT || 3001
    httpServer.listen(port, () => {
      console.log(`🚀 WebSocket server running on port ${port}`)
    })

    // Handle server shutdown gracefully
    process.on('SIGTERM', () => {
      console.log('Shutting down WebSocket server...')
      if (httpServer) {
        httpServer.close()
      }
    })
  }

  return io
}

// Auto-start if this file is run directly
if (require.main === module) {
  console.log('Starting standalone WebSocket server...')
  getSocketServer()
}
