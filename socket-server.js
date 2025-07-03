// Simple JavaScript WebSocket server with RabbitMQ integration
import { config } from 'dotenv';
config({ path: '.env.local' });
console.log('🔧 RABBITMQ_URL from env:', process.env.RABBITMQ_URL);
import { createServer } from 'http';
import { Server } from 'socket.io';
import amqp from 'amqplib';
import fetch from 'node-fetch';

// Pure WebSocket Relay - No Local Queue Management
class WebSocketRelay {
  constructor(socketIO) {
    // ✅ เพิ่ม Socket.IO reference เพื่อส่งข้อมูลไปยัง clients
    this.io = socketIO;
    this.currentQueueState = { totalInQueue: 0, processing: [] };
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
            // Update current state from API (don't manage our own queue)
            this.currentQueueState = {
              totalInQueue: data.queue ? data.queue.length : 0,
              processing: data.processing || []
            };
            console.log('🔄 WebSocket: Synced state from API', this.currentQueueState);
            
            // ✅ Broadcast updated state to all clients ทันที
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
    
    // ✅ ส่งข้อมูลไปยัง Socket.IO clients ทันที
    if (this.io) {
      console.log('📡 WebSocket: Broadcasting to all queue-updates clients:', data);
      this.io.to('queue-updates').emit('queue-update', data);
    }
  }

  async publishQueueUpdate() {
    // WebSocket relay only broadcasts received state, doesn't publish new state
    this.notifyListeners(this.currentQueueState);
  }

  // API delegation methods - all operations go to API via HTTP
  async addToQueueViaAPI(key) {
    try {
      const response = await fetch('http://localhost:3000/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Failed to add to queue via API:', error);
      throw error;
    }
  }

  async processNextViaAPI() {
    try {
      const response = await fetch('http://localhost:3000/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process_next' })
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Failed to process next via API:', error);
      throw error;
    }
  }

  async clearQueueViaAPI() {
    try {
      const response = await fetch('http://localhost:3000/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_clear' })
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Failed to clear queue via API:', error);
      throw error;
    }
  }

  // Deprecated methods - API is the source of truth
  getPosition() {
    console.warn('⚠️ WebSocket: getPosition deprecated - use API instead');
    return null;
  }

  isMyTurn() {
    console.warn('⚠️ WebSocket: isMyTurn deprecated - use API instead');
    return false;
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

// Create HTTP server first
const httpServer = createServer();

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:4000"],
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Create queue instance (relay) with Socket.IO reference
const queueManager = new WebSocketRelay(io);

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

  // Handle client checking their position (deprecated - use API directly)
  socket.on('check-position', async (key) => {
    console.log('⚠️ DEPRECATED: check-position event should use API directly');
    try {
      const response = await fetch(`http://localhost:3000/api/queue?key=${encodeURIComponent(key)}`);
      const data = await response.json();
      socket.emit('position-update', { 
        key, 
        position: data.position, 
        isMyTurn: data.isMyTurn 
      });
      console.log(`🔍 Position check for ${key}: ${data.position}, isMyTurn: ${data.isMyTurn}`);
    } catch (error) {
      console.error('❌ Failed to check position via API:', error);
      socket.emit('position-update', { key, position: null, isMyTurn: false });
    }
  });

  // Handle adding to queue (deprecated - use API directly)
  socket.on('add-to-queue', async (key) => {
    console.log('⚠️ DEPRECATED: add-to-queue event should use API directly');
    try {
      const result = await queueManager.addToQueueViaAPI(key);
      socket.emit('queue-joined', result);
      console.log(`➕ Added to queue via API: ${key}, position: ${result.position}`);
    } catch (error) {
      console.error('❌ Error adding to queue via API:', error);
      socket.emit('error', { message: 'Failed to join queue via API' });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });

  // ===== TEST FUNCTIONS - REMOVE IN PRODUCTION =====
  // Function to simulate adding multiple users to queue for testing
  socket.on('test-add-bulk-queue', async (count) => {
    console.log(`🧪 TEST: Adding ${count} users to queue via API...`);
    
    for (let i = 1; i <= count; i++) {
      const testKey = `TEST-USER-${Date.now()}-${i.toString().padStart(3, '0')}`;
      try {
        await queueManager.addToQueueViaAPI(testKey);
        console.log(`✅ Added test user ${i}/${count} via API: ${testKey}`);
      } catch (error) {
        console.error(`❌ Failed to add test user ${i} via API: ${error}`);
      }
      
      // Add small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🎉 TEST: Successfully sent ${count} users to API`);
    socket.emit('test-bulk-queue-complete', { count, message: 'Bulk queue test completed via API' });
  });

  // Function to clear all queue for testing
  socket.on('test-clear-queue', async () => {
    console.log('🧪 TEST: Clearing entire queue via API...');
    
    try {
      const result = await queueManager.clearQueueViaAPI();
      console.log('✅ TEST: Queue cleared via API:', result);
      socket.emit('test-queue-cleared', { message: 'Queue has been cleared via API' });
    } catch (error) {
      console.error('❌ TEST: Failed to clear queue via API:', error);
      socket.emit('test-error', { error: 'Failed to clear queue via API' });
    }
  });

  // Function to process next in queue (simulate user completing checkout)
  socket.on('test-process-next', async () => {
    console.log('🧪 TEST: Processing next user via API...');
    try {
      const result = await queueManager.processNextViaAPI();
      if (result.success) {
        console.log(`✅ TEST: Processed via API:`, result);
        socket.emit('test-user-processed', { result, message: 'User processed via API' });
      } else {
        console.log('📭 TEST: No users in queue to process (API)');
        socket.emit('test-no-users', { message: 'No users in queue (API)' });
      }
    } catch (error) {
      console.error('❌ TEST: Error processing next user via API:', error);
      socket.emit('test-error', { error: 'Failed to process next user via API' });
    }
  });

  // Function to get current queue status for testing
  socket.on('test-get-queue-status', () => {
    const queueInfo = queueManager.getQueueInfo();
    console.log('📊 TEST: Current queue status:', queueInfo);
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

export { io, queueManager };
