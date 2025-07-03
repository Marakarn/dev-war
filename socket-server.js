// Simple JavaScript WebSocket server with RabbitMQ integration
require('dotenv').config({ path: '.env.local' });
console.log('🔧 RABBITMQ_URL from env:', process.env.RABBITMQ_URL);
const { createServer } = require('http');
const { Server } = require('socket.io');
const amqp = require('amqplib');

// RabbitMQ-based queue to match the main app
class RabbitMQQueue {
  constructor() {
    // Remove local queue management - API is the source of truth
    this.currentQueueState = { totalInQueue: 0, processing: [] }
    this.listeners = new Set();
    this.rabbitMQConnection = null;
    this.rabbitMQChannel = null;
    this.isConnectedToRabbitMQ = false;
    
    this.initializeRabbitMQ();
  }

  async initializeRabbitMQ() {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://devwar01:n6Qk5cF%2A%24%257r%21A7L@localhost:5672');
      const channel = await connection.createChannel();
      
      await channel.assertQueue('queue_updates', { durable: true });
      await channel.assertQueue('processing_queue', { durable: true });
      await channel.assertQueue('queue_state', { durable: true }); // For syncing with API
      
      this.rabbitMQConnection = connection;
      this.rabbitMQChannel = channel;
      this.isConnectedToRabbitMQ = true;
      
      console.log('🐰 WebSocket: Connected to RabbitMQ successfully at localhost:5672');
      
      // Start consuming messages for queue updates
      await this.consumeQueueUpdates();
      
      // Start consuming queue state from API
      await this.consumeQueueState();
      
    } catch (error) {
      console.warn('⚠️ WebSocket: Failed to connect to RabbitMQ, using in-memory fallback:', error.message);
      this.isConnectedToRabbitMQ = false;
    }
  }

  async consumeQueueUpdates() {
    if (!this.rabbitMQChannel) return;

    await this.rabbitMQChannel.consume('queue_updates', (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          this.notifyListeners(data);
          this.rabbitMQChannel.ack(msg);
        } catch (error) {
          console.error('Error processing queue update:', error);
          this.rabbitMQChannel.nack(msg, false, false);
        }
      }
    });
  }

  async consumeQueueState() {
    if (!this.rabbitMQChannel) return;

    await this.rabbitMQChannel.consume('queue_state', (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          if (data.action === 'sync_state') {
            // Update local state from API
            this.currentQueueState = {
              totalInQueue: data.queue ? data.queue.length : 0,
              processing: data.processing || []
            }
            console.log('🔄 WebSocket: Synced queue state from API', this.currentQueueState);
            
            // Broadcast updated state to all clients
            this.notifyListeners(this.currentQueueState);
          }
          this.rabbitMQChannel.ack(msg);
        } catch (error) {
          console.error('Error processing queue state sync:', error);
          this.rabbitMQChannel.nack(msg, false, false);
        }
      }
    });
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  notifyListeners(data) {
    this.listeners.forEach(listener => listener(data));
  }

  async publishQueueUpdate() {
    // WebSocket server doesn't publish updates anymore
    // Only broadcasts received updates from API
    this.notifyListeners(this.currentQueueState);
  }

  async addToQueue(key) {
    // WebSocket doesn't manage queue anymore - just sends commands to API
    if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
      try {
        await this.rabbitMQChannel.sendToQueue(
          'queue_state',
          Buffer.from(JSON.stringify({
            action: 'add_item',
            item: {
              id: Math.random().toString(36).substr(2, 9),
              key: key,
              timestamp: Date.now(),
              position: 0 // Will be calculated by API
            },
            timestamp: Date.now()
          })),
          { persistent: true }
        );
        console.log('📡 WebSocket: Sent add command to API for key:', key);
        return { position: 0, id: 'pending' }; // Return placeholder
      } catch (error) {
        console.error('❌ WebSocket: Failed to send add command to API:', error);
      }
    }
    
    // If RabbitMQ is not available, can't add to queue
    console.warn('⚠️ WebSocket: Cannot add to queue - RabbitMQ not connected');
    return { position: 0, id: 'error' };
  }

  // Remove all local queue methods - delegate to API
  getPosition(key) {
    console.warn('⚠️ WebSocket: getPosition deprecated - use API instead');
    return null;
  }

  isMyTurn(key) {
    console.warn('⚠️ WebSocket: isMyTurn deprecated - use API instead');
    return false;
  }

  async processNext() {
    console.warn('⚠️ WebSocket: processNext deprecated - use API commands instead');
    return null;
  }

  async completeProcessing(key) {
    console.warn('⚠️ WebSocket: completeProcessing deprecated - use API instead');
  }

  updatePositions() {
    // No longer needed - API handles this
  }

  getQueueInfo() {
    return this.currentQueueState;
  }

  async close() {
    if (this.rabbitMQConnection) {
      try {
        await this.rabbitMQConnection.close();
      } catch (error) {
        console.error('Error closing RabbitMQ connection:', error);
      }
    }
  }
}

// Create queue instance
const queueManager = new RabbitMQQueue();

// Create HTTP server
const httpServer = createServer();

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Handle client connections
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  // Send current queue info to new client
  const queueInfo = queueManager.getQueueInfo();
  socket.emit('queue-update', queueInfo);

  // Listen for client wanting to join queue updates
  socket.on('join-queue-updates', () => {
    socket.join('queue-updates');
    console.log('📢 Client joined queue updates:', socket.id);
  });

  // Listen for client leaving queue updates
  socket.on('leave-queue-updates', () => {
    socket.leave('queue-updates');
    console.log('👋 Client left queue updates:', socket.id);
  });

  // Handle client checking their position
  socket.on('check-position', (key) => {
    const position = queueManager.getPosition(key);
    const isMyTurn = queueManager.isMyTurn(key);
    socket.emit('position-update', { key, position, isMyTurn });
    console.log(`🔍 Position check for ${key}: ${position}, isMyTurn: ${isMyTurn}`);
  });

  // Handle adding to queue (for testing)
  socket.on('add-to-queue', async (key) => {
    try {
      const result = await queueManager.addToQueue(key);
      socket.emit('queue-joined', result);
      console.log(`➕ Added to queue: ${key}, position: ${result.position}`);
    } catch (error) {
      console.error('Error adding to queue:', error);
      socket.emit('error', { message: 'Failed to join queue' });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });

  // ===== TEST FUNCTIONS - REMOVE IN PRODUCTION =====
  // Function to simulate adding multiple users to queue for testing
  socket.on('test-add-bulk-queue', async (count) => {
    console.log(`🧪 TEST: Adding ${count} users to queue...`);
    
    for (let i = 1; i <= count; i++) {
      const testKey = `TEST-USER-${Date.now()}-${i.toString().padStart(3, '0')}`;
      
      // Send add command to API via RabbitMQ instead of adding directly
      if (queueManager.isConnectedToRabbitMQ && queueManager.rabbitMQChannel) {
        try {
          await queueManager.rabbitMQChannel.sendToQueue(
            'queue_state',
            Buffer.from(JSON.stringify({
              action: 'add_item',
              item: {
                id: Math.random().toString(36).substr(2, 9),
                key: testKey,
                timestamp: Date.now(),
                position: 0 // Will be calculated by API
              },
              timestamp: Date.now()
            })),
            { persistent: true }
          );
          console.log(`✅ Sent test user ${i}/${count} to API: ${testKey}`);
        } catch (error) {
          console.error(`❌ Failed to send test user ${i} to API: ${error}`);
        }
      } else {
        // Fallback: add directly to local queue
        await queueManager.addToQueue(testKey);
        console.log(`✅ Added test user ${i}/${count} locally: ${testKey}`);
      }
      
      // Add small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`🎉 TEST: Successfully processed ${count} user additions`);
    socket.emit('test-bulk-queue-complete', { count, message: 'Bulk queue test completed' });
  });

  // Function to clear all queue for testing
  socket.on('test-clear-queue', async () => {
    console.log('🧪 TEST: Clearing entire queue...');
    
    // Send clear command to API via RabbitMQ
    if (queueManager.isConnectedToRabbitMQ && queueManager.rabbitMQChannel) {
      try {
        await queueManager.rabbitMQChannel.sendToQueue(
          'queue_state',
          Buffer.from(JSON.stringify({
            action: 'clear_queue',
            timestamp: Date.now()
          })),
          { persistent: true }
        );
        console.log('📡 WebSocket: Sent clear queue command to API');
      } catch (error) {
        console.error('❌ WebSocket: Failed to send clear command to API:', error);
        // Fallback: clear locally
        queueManager.queue = [];
        queueManager.processing.clear();
      }
    } else {
      // Fallback: clear locally
      queueManager.queue = [];
      queueManager.processing.clear();
    }
    
    console.log('🗑️ TEST: Queue clear command sent');
    socket.emit('test-queue-cleared', { message: 'Queue clear command sent' });
  });

  // Function to process next in queue (simulate user completing checkout)
  socket.on('test-process-next', async () => {
    console.log('🧪 TEST: Processing next user in queue...');
    
    // Send process next command to API via RabbitMQ
    if (queueManager.isConnectedToRabbitMQ && queueManager.rabbitMQChannel) {
      try {
        await queueManager.rabbitMQChannel.sendToQueue(
          'queue_state',
          Buffer.from(JSON.stringify({
            action: 'process_next',
            timestamp: Date.now()
          })),
          { persistent: true }
        );
        console.log('📡 WebSocket: Sent process next command to API');
        socket.emit('test-user-processed', { message: 'Process next command sent to API' });
      } catch (error) {
        console.error('❌ WebSocket: Failed to send process next command to API:', error);
        socket.emit('test-error', { error: 'Failed to send process next command' });
      }
    } else {
      // Fallback: process locally
      try {
        const nextKey = await queueManager.processNext();
        if (nextKey) {
          console.log(`✅ TEST: Processed user locally: ${nextKey}`);
          socket.emit('test-user-processed', { key: nextKey, message: 'User processed successfully (local)' });
          
          // Auto-complete processing after 2 seconds (simulate checkout completion)
          setTimeout(async () => {
            await queueManager.completeProcessing(nextKey);
            console.log(`🏁 TEST: Completed processing for: ${nextKey}`);
          }, 2000);
        } else {
          console.log('📭 TEST: No users in queue to process');
          socket.emit('test-no-users', { message: 'No users in queue' });
        }
      } catch (error) {
        console.error('❌ TEST: Error processing next user:', error);
        socket.emit('test-error', { error: 'Failed to process next user' });
      }
    }
  });

  // Function to get current queue status for testing
  socket.on('test-get-queue-status', () => {
    // Get status from local WebSocket queue (which should be synced from API)
    const queueInfo = queueManager.getQueueInfo();
    console.log('📊 TEST: WebSocket queue status:', queueInfo);
    console.log('📊 TEST: Note - this should match API status. Use "Check API Queue" to compare.');
    socket.emit('test-queue-status', queueInfo);
  });
  // ===== END TEST FUNCTIONS =====
});

// Set up queue manager listener for broadcasting updates
queueManager.addListener((queueInfo) => {
  io.to('queue-updates').emit('queue-update', queueInfo);
  console.log('📡 Broadcasting queue update:', queueInfo);
});

// Start the server
const port = process.env.WEBSOCKET_PORT || 3001;
httpServer.listen(port, () => {
  console.log(`🚀 WebSocket server running on port ${port}`);
  console.log(`📡 Socket.IO endpoint: http://localhost:${port}/socket.io/`);
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down WebSocket server...');
  httpServer.close();
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down WebSocket server...');
  httpServer.close();
  process.exit(0);
});

module.exports = { io, queueManager };
