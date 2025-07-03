// Simple JavaScript WebSocket server with RabbitMQ integration
import { config } from 'dotenv';
config({ path: '.env.local' });
console.log('🔧 RABBITMQ_URL from env:', process.env.RABBITMQ_URL);
import { createServer } from 'http';
import { Server } from 'socket.io';
import amqp from 'amqplib';

// RabbitMQ-based queue to match the main app
class RabbitMQQueue {
  constructor() {
    this.queue = [];
    this.processing = new Set();
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
            // Sync queue state from API
            this.queue = data.queue || [];
            this.processing = new Set(data.processing || []);
            console.log('🔄 WebSocket: Synced queue state from API', {
              queueLength: this.queue.length,
              processing: this.processing.size
            });
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
    const queueInfo = this.getQueueInfo();
    
    if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
      try {
        // Only publish updates, not state changes (API manages state)
        await this.rabbitMQChannel.sendToQueue(
          'queue_updates',
          Buffer.from(JSON.stringify(queueInfo)),
          { persistent: true }
        );
        console.log('📡 WebSocket: Published queue update to RabbitMQ');
      } catch (error) {
        console.error('❌ WebSocket: Failed to publish queue update to RabbitMQ:', error);
      }
    }
    
    // Also notify local listeners
    this.notifyListeners(queueInfo);
  }

  async addToQueue(key) {
    // For test functions only - in production, clients should use API
    // Check if key already exists in queue
    const existing = this.queue.find(item => item.key === key);
    if (existing) {
      return { position: existing.position, id: existing.id };
    }

    const id = Math.random().toString(36).substr(2, 9);
    const position = this.queue.length + 1;
    
    const queueItem = {
      id,
      key,
      timestamp: Date.now(),
      position
    };

    this.queue.push(queueItem);
    this.updatePositions();
    
    // Publish state to API via RabbitMQ for sync
    if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
      try {
        await this.rabbitMQChannel.sendToQueue(
          'queue_state',
          Buffer.from(JSON.stringify({
            action: 'add_item',
            item: queueItem,
            timestamp: Date.now()
          })),
          { persistent: true }
        );
      } catch (error) {
        console.error('❌ WebSocket: Failed to sync add to API:', error);
      }
    }
    
    // Publish update
    await this.publishQueueUpdate();
    
    return { position, id };
  }

  getPosition(key) {
    const item = this.queue.find(item => item.key === key);
    return item ? item.position : null;
  }

  isMyTurn(key) {
    const item = this.queue.find(item => item.key === key);
    return item ? item.position === 1 : false;
  }

  async processNext() {
    if (this.queue.length === 0) return null;
    
    const item = this.queue.shift();
    if (item) {
      this.processing.add(item.key);
      this.updatePositions();
      
      // Send to processing queue via RabbitMQ
      if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
        try {
          await this.rabbitMQChannel.sendToQueue(
            'processing_queue',
            Buffer.from(JSON.stringify({ key: item.key, timestamp: Date.now() })),
            { persistent: true }
          );
        } catch (error) {
          console.error('Failed to send to processing queue:', error);
        }
      }
      
      await this.publishQueueUpdate();
      return item.key;
    }
    return null;
  }

  async completeProcessing(key) {
    this.processing.delete(key);
    await this.publishQueueUpdate();
  }

  updatePositions() {
    this.queue.forEach((item, index) => {
      item.position = index + 1;
    });
  }

  getQueueInfo() {
    return {
      totalInQueue: this.queue.length,
      processing: Array.from(this.processing)
    };
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
      try {
        await queueManager.addToQueue(testKey);
        console.log(`✅ Added test user ${i}/${count}: ${testKey}`);
      } catch (error) {
        console.error(`❌ Failed to add test user ${i}: ${error}`);
      }
      
      // Add small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`🎉 TEST: Successfully added ${count} users to queue`);
    socket.emit('test-bulk-queue-complete', { count, message: 'Bulk queue test completed' });
  });

  // Function to clear all queue for testing
  socket.on('test-clear-queue', async () => {
    console.log('🧪 TEST: Clearing entire queue...');
    
    // Clear local queue
    this.queue = [];
    this.processing.clear();
    
    // Sync with API via RabbitMQ
    if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
      try {
        await this.rabbitMQChannel.sendToQueue(
          'queue_state',
          Buffer.from(JSON.stringify({
            action: 'clear_queue',
            timestamp: Date.now()
          })),
          { persistent: true }
        );
        console.log('📡 WebSocket: Sent clear queue command to API');
      } catch (error) {
        console.error('❌ WebSocket: Failed to sync clear with API:', error);
      }
    }
    
    // Notify all clients about the update
    const queueInfo = queueManager.getQueueInfo();
    io.to('queue-updates').emit('queue-update', queueInfo);
    
    console.log('🗑️ TEST: Queue cleared');
    socket.emit('test-queue-cleared', { message: 'Queue has been cleared' });
  });

  // Function to process next in queue (simulate user completing checkout)
  socket.on('test-process-next', async () => {
    console.log('🧪 TEST: Processing next user in queue...');
    try {
      const nextKey = await queueManager.processNext();
      if (nextKey) {
        console.log(`✅ TEST: Processed user: ${nextKey}`);
        socket.emit('test-user-processed', { key: nextKey, message: 'User processed successfully' });
        
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
