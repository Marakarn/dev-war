// RabbitMQ-based queue with in-memory fallback
import amqp from 'amqplib'

interface QueueItem {
  id: string
  key: string
  timestamp: number
  position: number
}

interface QueueUpdateListener {
  (data: { totalInQueue: number; processing: string[]; activeUsers: number; maxActiveUsers: number }): void
}

class QueueManager {
  private queue: QueueItem[] = []
  private processing: Set<string> = new Set()
  private activeUsers: Set<string> = new Set() // Track currently active users
  private maxActiveUsers = 100 // Maximum allowed concurrent users
  private rabbitMQConnection: amqp.Connection | null = null
  private rabbitMQChannel: amqp.Channel | null = null
  private isConnectedToRabbitMQ = false
  private listeners: Set<QueueUpdateListener> = new Set()

  constructor() {
    this.initializeRabbitMQ()
  }

  private async initializeRabbitMQ() {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://devwar01:n6Qk5cF%2A%24%257r%21A7L@localhost:5672')
      const channel = await connection.createChannel()
      
      // Declare queues for coordination
      await channel.assertQueue('queue_updates', { durable: true })
      await channel.assertQueue('processing_queue', { durable: true })
      await channel.assertQueue('queue_state', { durable: true }) // Main queue state
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.rabbitMQConnection = connection as any
      this.rabbitMQChannel = channel
      this.isConnectedToRabbitMQ = true
      
      console.log('🐰 API: Connected to RabbitMQ successfully at localhost:5672')
      
      // Start consuming messages for queue updates
      await this.consumeQueueUpdates()
      
    } catch (error) {
      console.warn('⚠️ API: Failed to connect to RabbitMQ, using in-memory fallback:', error)
      this.isConnectedToRabbitMQ = false
    }
  }

  private async consumeQueueUpdates() {
    if (!this.rabbitMQChannel) return

    await this.rabbitMQChannel.consume('queue_updates', (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString())
          this.notifyListeners(data)
          this.rabbitMQChannel?.ack(msg)
        } catch (error) {
          console.error('Error processing queue update:', error)
          this.rabbitMQChannel?.nack(msg, false, false)
        }
      }
    })

    // Also consume queue state changes from WebSocket test functions
    await this.rabbitMQChannel.consume('queue_state', (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString())
          
          // Handle different actions from WebSocket
          if (data.action === 'add_item' && data.item) {
            const existing = this.queue.find(item => item.key === data.item.key)
            if (!existing) {
              this.queue.push(data.item)
              this.updatePositions()
              console.log('🔄 API: Added item from WebSocket test:', data.item.key)
              // Publish update after adding item
              this.publishQueueUpdate()
            }
          } else if (data.action === 'clear_queue') {
            this.queue = []
            this.processing.clear()
            console.log('🗑️ API: Cleared queue from WebSocket test command')
            // Publish update after clearing
            this.publishQueueUpdate()
          } else if (data.action === 'process_next') {
            // Handle process next from WebSocket
            if (this.queue.length > 0) {
              const item = this.queue.shift()
              if (item) {
                this.processing.add(item.key)
                this.updatePositions()
                console.log('⚡ API: Processed next user from WebSocket:', item.key)
                this.publishQueueUpdate()
              }
            }
          } else if (data.action === 'complete_processing' && data.key) {
            this.processing.delete(data.key)
            console.log('🏁 API: Completed processing from WebSocket:', data.key)
            this.publishQueueUpdate()
          }
          
          this.rabbitMQChannel?.ack(msg)
        } catch (error) {
          console.error('❌ API: Error processing queue state update:', error)
          this.rabbitMQChannel?.nack(msg, false, false)
        }
      }
    })
  }

  addListener(listener: QueueUpdateListener) {
    this.listeners.add(listener)
  }

  removeListener(listener: QueueUpdateListener) {
    this.listeners.delete(listener)
  }

  private notifyListeners(data: { totalInQueue: number; processing: string[]; activeUsers: number; maxActiveUsers: number }) {
    this.listeners.forEach(listener => listener(data))
  }

  private async publishQueueUpdate() {
    const queueInfo = this.getQueueInfo()
    
    if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
      try {
        // First publish queue state to sync with WebSocket server
        await this.rabbitMQChannel.sendToQueue(
          'queue_state',
          Buffer.from(JSON.stringify({
            action: 'sync_state',
            queue: this.queue,
            processing: Array.from(this.processing),
            activeUsers: Array.from(this.activeUsers),
            maxActiveUsers: this.maxActiveUsers,
            timestamp: Date.now()
          })),
          { persistent: true }
        )
        
        // Then publish update for notifications
        await this.rabbitMQChannel.sendToQueue(
          'queue_updates',
          Buffer.from(JSON.stringify(queueInfo)),
          { persistent: true }
        )
        
        console.log(`📡 API: Published queue state - Queue: ${this.queue.length}, Processing: ${this.processing.size}, Active Users: ${this.activeUsers.size}/${this.maxActiveUsers}`)
      } catch (error) {
        console.error('❌ API: Failed to publish queue update to RabbitMQ:', error)
      }
    }
    
    // Also notify local listeners
    this.notifyListeners(queueInfo)
  }

  async addToQueue(key: string): Promise<{ position: number; id: string }> {
    // Check if key already exists in queue
    const existing = this.queue.find(item => item.key === key)
    if (existing) {
      return { position: existing.position, id: existing.id }
    }

    const id = Math.random().toString(36).substr(2, 9)
    const position = this.queue.length + 1
    
    const queueItem: QueueItem = {
      id,
      key,
      timestamp: Date.now(),
      position
    }

    this.queue.push(queueItem)
    this.updatePositions()
    
    // Publish update to RabbitMQ
    await this.publishQueueUpdate()
    
    return { position, id }
  }

  getPosition(key: string): number | null {
    const item = this.queue.find(item => item.key === key)
    return item ? item.position : null
  }

  isMyTurn(key: string): boolean {
    // First check if there's capacity and user is first in queue
    const item = this.queue.find(item => item.key === key);
    const isFirstInQueue = item !== undefined && item.position === 1;
    
    // A user gets a turn if they're first in queue AND there's capacity available
    const hasCapacity = this.activeUsers.size < this.maxActiveUsers;
    const queueLength = this.queue.length;
    
    console.log(`🔍 isMyTurn check for ${key}:`, {
      position: item?.position,
      isFirstInQueue,
      hasCapacity,
      activeUsers: this.activeUsers.size,
      maxActiveUsers: this.maxActiveUsers,
      queueLength
    });
    
    return isFirstInQueue && hasCapacity;
  }

  async processNext(): Promise<string | null> {
    if (this.queue.length === 0) return null
    
    const item = this.queue.shift()
    if (item) {
      this.processing.add(item.key)
      this.updatePositions()
      
      // Send to processing queue via RabbitMQ
      if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
        try {
          console.log(`📬 Sending key: ${item.key} to processing_queue in RabbitMQ`)
          await this.rabbitMQChannel.sendToQueue(
            'processing_queue',
            Buffer.from(JSON.stringify({ 
              key: item.key, 
              timestamp: Date.now(),
              action: 'process_user' 
            })),
            { persistent: true }
          )
          console.log(`✅ Successfully sent ${item.key} to processing_queue`)
        } catch (error) {
          console.error('❌ Failed to send to processing queue:', error)
        }
      } else {
        console.warn('⚠️ RabbitMQ not connected, skipping sending to processing_queue')
      }
      
      await this.publishQueueUpdate()
      return item.key
    }
    return null
  }

  async completeProcessing(key: string): Promise<void> {
    const wasInProcessing = this.processing.has(key)
    this.processing.delete(key)
    
    console.log(`🏁 Completed processing for key: ${key}, was in processing: ${wasInProcessing}`)
    console.log(`📊 Current processing count: ${this.processing.size}`)
    console.log(`📊 Current queue length: ${this.queue.length}`)
    
    await this.publishQueueUpdate()
  }

  // Add a user to active users
  addActiveUser(key: string): boolean {
    // Check if we're at capacity
    if (this.activeUsers.size >= this.maxActiveUsers) {
      return false;
    }
    
    this.activeUsers.add(key);
    this.publishQueueUpdate();
    return true;
  }

  // Remove a user from active users
  removeActiveUser(key: string): void {
    if (this.activeUsers.has(key)) {
      this.activeUsers.delete(key);
      
      console.log(`👤 Removed active user: ${key}, active users now: ${this.activeUsers.size}/${this.maxActiveUsers}`);
      
      // If there are queued users and we now have capacity, notify next in queue
      if (this.queue.length > 0 && this.activeUsers.size < this.maxActiveUsers) {
        // Important: Don't remove the user from the queue yet - that happens in processNext
        // Instead, get the first user in the queue and broadcast their position update
        const nextUser = this.queue[0];
        if (nextUser) {
          console.log(`� Next user in line: ${nextUser.key} (position ${nextUser.position}) - Queue advancing!`);
          // Force publish an update to notify clients
          this.publishQueueUpdate();
        }
      }
    }
  }

  // Remove a user from the queue (when they leave or cancel)
  async removeFromQueue(key: string): Promise<boolean> {
    const index = this.queue.findIndex(item => item.key === key);
    
    if (index === -1) {
      console.log(`❓ Attempted to remove non-existent user ${key} from queue`);
      return false;
    }
    
    // Remove the user from the queue
    this.queue.splice(index, 1);
    
    // Update positions for remaining users
    this.updatePositions();
    
    console.log(`👋 Removed user ${key} from queue at position ${index + 1}`);
    console.log(`📊 Queue length after removal: ${this.queue.length}`);
    
    // Also remove from processing if they were there
    if (this.processing.has(key)) {
      this.processing.delete(key);
      console.log(`🧹 Also removed ${key} from processing set`);
    }
    
    // Publish queue update to notify all clients
    await this.publishQueueUpdate();
    
    return true;
  }

  // Check if active users are at capacity
  isAtCapacity(): boolean {
    return this.activeUsers.size >= this.maxActiveUsers;
  }

  // Get current active user count
  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  // For debugging: get list of active users
  getActiveUsers(): string[] {
    return Array.from(this.activeUsers);
  }

  // Debug method to check processing status
  isInProcessing(key: string): boolean {
    return this.processing.has(key)
  }

  // Debug method to get all processing keys
  getProcessingKeys(): string[] {
    return Array.from(this.processing)
  }

  // Force clear method for testing/debugging
  async forceClear(): Promise<{ clearedQueue: number; clearedProcessing: number }> {
    const queueCount = this.queue.length
    const processingCount = this.processing.size
    
    this.queue = []
    this.processing.clear()
    
    console.log(`🧹 Force cleared - Queue: ${queueCount}, Processing: ${processingCount}`)
    
    // Publish update after force clear
    await this.publishQueueUpdate()
    
    return { clearedQueue: queueCount, clearedProcessing: processingCount }
  }

  private updatePositions(): void {
    this.queue.forEach((item, index) => {
      item.position = index + 1
    })
  }

  // Debug method to get full queue status for troubleshooting
  getDebugStatus(): { 
    queue: QueueItem[], 
    processing: string[], 
    activeUsers: string[],
    maxActiveUsers: number 
  } {
    return {
      queue: [...this.queue],
      processing: Array.from(this.processing),
      activeUsers: Array.from(this.activeUsers),
      maxActiveUsers: this.maxActiveUsers
    };
  }

  getQueueInfo() {
    const queueStatus = {
      totalInQueue: this.queue.length,
      processing: Array.from(this.processing),
      activeUsers: this.activeUsers.size,
      maxActiveUsers: this.maxActiveUsers
    };
    
    // Log detailed queue info for debugging
    console.log('📊 Queue status:', {
      ...queueStatus,
      queueUsers: this.queue.map(item => ({ key: item.key, position: item.position })),
      activeUsersList: Array.from(this.activeUsers)
    });
    
    return queueStatus;
  }

  // For graceful shutdown
  async close() {
    if (this.rabbitMQConnection) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this.rabbitMQConnection as any).close()
      } catch (error) {
        console.error('Error closing RabbitMQ connection:', error)
      }
    }
  }
}

export const queueManager = new QueueManager()
