// RabbitMQ-based queue with in-memory fallback
import amqp from 'amqplib'

interface QueueItem {
  id: string
  key: string
  timestamp: number
  position: number
}

interface QueueUpdateListener {
  (data: { totalInQueue: number; processing: string[] }): void
}

class QueueManager {
  private queue: QueueItem[] = []
  private processing: Set<string> = new Set()
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

    // ✅ เพิ่ม noAck: false และ consumer tag เพื่อให้ consume ต่อเนื่อง
    const queueUpdatesConsumer = await this.rabbitMQChannel.consume('queue_updates', (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString())
          console.log('📥 Queue updates message received:', data)
          this.notifyListeners(data)
          this.rabbitMQChannel?.ack(msg)
        } catch (error) {
          console.error('❌ Error processing queue update:', error)
          this.rabbitMQChannel?.nack(msg, false, false)
        }
      }
    }, { noAck: false, consumerTag: 'queue-updates-consumer' })

    // ✅ เพิ่ม consumer สำหรับ processing_queue พร้อม noAck: false
    const processingQueueConsumer = await this.rabbitMQChannel.consume('processing_queue', (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString())
          console.log('📥 Processing queue message received:', data)
          
          // ถ้าต้องการให้ระบบจัดการ processing automatically
          if (data.key) {
            console.log(`⚡ Auto-processing user: ${data.key}`)
            // หรือ setTimeout สำหรับ auto-complete
            setTimeout(() => {
              this.completeProcessingFromQueue(data.key)
            }, 5000) // auto complete หลัง 5 วินาที
          }
          
          this.rabbitMQChannel?.ack(msg)
        } catch (error) {
          console.error('❌ Error processing processing_queue message:', error)
          this.rabbitMQChannel?.nack(msg, false, false)
        }
      }
    }, { noAck: false, consumerTag: 'processing-queue-consumer' })

    console.log('🔄 Queue consumers started:', {
      queueUpdates: queueUpdatesConsumer.consumerTag,
      processingQueue: processingQueueConsumer.consumerTag
    })

    // ✅ Also consume queue state changes from WebSocket test functions
    const queueStateConsumer = await this.rabbitMQChannel.consume('queue_state', (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString())
          console.log('📥 Queue state message received:', data)
          
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
            this.updatePositions() // ✅ เพิ่ม updatePositions ที่นี่ด้วย
            console.log('🏁 API: Completed processing from WebSocket:', data.key)
            this.publishQueueUpdate()
          }
          
          this.rabbitMQChannel?.ack(msg)
        } catch (error) {
          console.error('❌ API: Error processing queue state update:', error)
          this.rabbitMQChannel?.nack(msg, false, false)
        }
      }
    }, { noAck: false, consumerTag: 'queue-state-consumer' })

    console.log('🔄 All consumers started:', {
      queueUpdates: queueUpdatesConsumer.consumerTag,
      processingQueue: processingQueueConsumer.consumerTag,
      queueState: queueStateConsumer.consumerTag
    })
  }

  addListener(listener: QueueUpdateListener) {
    this.listeners.add(listener)
  }

  removeListener(listener: QueueUpdateListener) {
    this.listeners.delete(listener)
  }

  private notifyListeners(data: { totalInQueue: number; processing: string[] }) {
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
        
        console.log(`📡 API: Published queue state - Queue: ${this.queue.length}, Processing: ${this.processing.size}`)
        console.log(`📡 API: Queue items:`, this.queue.map(item => `${item.key}(pos:${item.position})`))
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
    const item = this.queue.find(item => item.key === key)
    return item ? item.position === 1 : false
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
          await this.rabbitMQChannel.sendToQueue(
            'processing_queue',
            Buffer.from(JSON.stringify({ key: item.key, timestamp: Date.now() })),
            { persistent: true }
          )
        } catch (error) {
          console.error('Failed to send to processing queue:', error)
        }
      }
      
      await this.publishQueueUpdate()
      return item.key
    }
    return null
  }

  async completeProcessing(key: string): Promise<void> {
    const wasInProcessing = this.processing.has(key)
    this.processing.delete(key)
    
    // ⚡ สำคัญ: อัพเดต positions หลังจากลบคนออกจาก processing
    // เพื่อให้คนที่เหลือในคิวได้ position ใหม่ที่ถูกต้อง
    this.updatePositions()
    
    console.log(`🏁 Completed processing for key: ${key}, was in processing: ${wasInProcessing}`)
    console.log(`📊 Current processing count: ${this.processing.size}`)
    console.log(`📊 Current queue length: ${this.queue.length}`)
    console.log(`🔄 Updated queue positions after completion`)
    
    await this.publishQueueUpdate()
  }

  // Debug method to check processing status
  isInProcessing(key: string): boolean {
    return this.processing.has(key)
  }

  // Debug method to get all processing keys
  getProcessingKeys(): string[] {
    return Array.from(this.processing)
  }

  // เพิ่มฟังก์ชันสำหรับ complete processing จาก RabbitMQ message
  private async completeProcessingFromQueue(key: string): Promise<void> {
    const wasInProcessing = this.processing.has(key)
    this.processing.delete(key)
    
    // ⚡ สำคัญ: อัพเดต positions หลังจากลบคนออกจาก processing
    this.updatePositions()
    
    console.log(`🏁 Auto-completed processing for key: ${key}, was in processing: ${wasInProcessing}`)
    console.log(`📊 Current processing count: ${this.processing.size}`)
    console.log(`📊 Current queue length: ${this.queue.length}`)
    console.log(`🔄 Updated queue positions after auto-completion`)
    
    await this.publishQueueUpdate()
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

  // เพิ่มฟังก์ชัน debug สำหรับดูสถานะ queue แบบละเอียด
  debugQueueState(): void {
    console.log('🔍 === QUEUE DEBUG STATE ===')
    console.log(`📊 Queue Length: ${this.queue.length}`)
    console.log(`🔄 Processing Size: ${this.processing.size}`)
    console.log(`📝 Queue Items:`)
    
    this.queue.forEach((item, index) => {
      console.log(`   ${index + 1}. Key: ${item.key}, Position: ${item.position}, Timestamp: ${new Date(item.timestamp).toLocaleTimeString()}`)
    })
    
    console.log(`⚡ Processing Items:`)
    Array.from(this.processing).forEach((key, index) => {
      console.log(`   ${index + 1}. Key: ${key}`)
    })
    console.log('🔍 === END DEBUG STATE ===')
  }

  private updatePositions(): void {
    const oldPositions = this.queue.map(item => ({ key: item.key, position: item.position }))
    
    this.queue.forEach((item, index) => {
      item.position = index + 1
    })
    
    // Log การเปลี่ยนแปลง positions เพื่อ debug
    const newPositions = this.queue.map(item => ({ key: item.key, position: item.position }))
    
    if (oldPositions.length > 0 || newPositions.length > 0) {
      console.log(`🔄 Position Update:`)
      console.log(`   Before:`, oldPositions)
      console.log(`   After:`, newPositions)
    }
  }

  getQueueInfo() {
    const queueInfo = {
      totalInQueue: this.queue.length,
      processing: Array.from(this.processing)
    }
    
    // Log current queue state for debugging
    console.log(`📊 Queue Info:`)
    console.log(`   Total in queue: ${queueInfo.totalInQueue}`)
    console.log(`   Processing: [${queueInfo.processing.join(', ')}]`)
    console.log(`   Queue items:`, this.queue.map(item => `${item.key}(pos:${item.position})`))
    
    return queueInfo
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
