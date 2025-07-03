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
