import { NextRequest, NextResponse } from "next/server"
import { queueManager } from "@/lib/queue"

export async function GET() {
  try {
    const queueInfo = queueManager.getQueueInfo()
    const processingKeys = queueManager.getProcessingKeys()
    
    return NextResponse.json({
      success: true,
      data: {
        totalInQueue: queueInfo.totalInQueue,
        processing: queueInfo.processing,
        processingCount: processingKeys.length,
        processingKeys: processingKeys,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error("Debug API error:", error)
    return NextResponse.json(
      { error: "Failed to get debug info" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    
    if (action === 'force_clear') {
      // Force clear both queue and processing
      const result = await queueManager.forceClear()
      
      console.log(`🧹 Force cleared API queue via debug endpoint`)
      
      return NextResponse.json({
        success: true,
        message: `Force cleared ${result.clearedQueue} queue items and ${result.clearedProcessing} processing items`,
        result
      })
    }
    
    if (action === 'process_next') {
      // Process next user in queue
      const nextKey = await queueManager.processNext()
      
      if (nextKey) {
        console.log(`⚡ Processed next user via debug endpoint: ${nextKey}`)
        
        // Auto-complete processing after 3 seconds (simulate checkout completion)
        setTimeout(async () => {
          await queueManager.completeProcessing(nextKey)
          console.log(`🏁 Auto-completed processing for: ${nextKey}`)
        }, 3000)
        
        return NextResponse.json({
          success: true,
          processedKey: nextKey,
          message: `Processed user: ${nextKey}`
        })
      } else {
        return NextResponse.json({
          success: false,
          message: "No users in queue to process"
        })
      }
    }

    if (action === 'clear_processing') {
      // Clear only processing set (for fixing stuck processing queue)
      const processingKeys = queueManager.getProcessingKeys()
      
      // Force clear all processing
      for (const key of processingKeys) {
        await queueManager.completeProcessing(key)
      }
      
      console.log(`🧹 Cleared ${processingKeys.length} stuck processing items`)
      
      return NextResponse.json({
        success: true,
        message: `Cleared ${processingKeys.length} processing items`,
        clearedKeys: processingKeys
      })
    }

    if (action === 'debug_state') {
      // Debug current queue state
      queueManager.debugQueueState()
      const queueInfo = queueManager.getQueueInfo()
      
      return NextResponse.json({
        success: true,
        message: "Debug state logged to console",
        queueInfo
      })
    }

    if (action === 'check_consumers') {
      // ตรวจสอบ consumer status ใน RabbitMQ
      try {
        const response = await fetch('http://localhost:15672/api/consumers', {
          headers: {
            'Authorization': 'Basic ' + Buffer.from('devwar01:n6Qk5cF*$%7r!A7L').toString('base64')
          }
        })
        
        const consumers = await response.json()
        const devWarConsumers = consumers.filter((c: { queue?: { name?: string } }) => 
          c.queue && c.queue.name && 
          (c.queue.name.includes('queue_updates') || 
           c.queue.name.includes('processing_queue') || 
           c.queue.name.includes('queue_state'))
        )
        
        return NextResponse.json({
          success: true,
          message: "Consumer status checked",
          consumers: devWarConsumers,
          totalConsumers: consumers.length,
          devWarConsumers: devWarConsumers.length
        })
      } catch (error) {
        console.error('Failed to check consumers:', error)
        return NextResponse.json({
          success: false,
          message: "Failed to check consumers",
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Debug API POST error:", error)
    return NextResponse.json(
      { error: "Failed to perform action" },
      { status: 500 }
    )
  }
}
