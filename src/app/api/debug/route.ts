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
