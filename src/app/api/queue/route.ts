import { NextRequest, NextResponse } from "next/server"
import { queueManager } from "@/lib/queue"

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json()
    
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return NextResponse.json(
        { error: "Valid key is required" },
        { status: 400 }
      )
    }

    const result = await queueManager.addToQueue(key.trim())
    
    return NextResponse.json({
      success: true,
      position: result.position,
      id: result.id,
      message: `You are in position ${result.position} in the queue`
    })
  } catch (error) {
    console.error("Queue join error:", error)
    return NextResponse.json(
      { error: "Failed to join queue" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get("key")
    
    if (!key) {
      return NextResponse.json(
        { error: "Key is required" },
        { status: 400 }
      )
    }

    const position = queueManager.getPosition(key)
    const isMyTurn = queueManager.isMyTurn(key)
    const queueInfo = queueManager.getQueueInfo()
    
    // If user is not in queue anymore (position is null), they should get session
    if (position === null && queueInfo.totalInQueue === 0) {
      return NextResponse.json({
        position: null,
        isMyTurn: true, // Allow immediate access when queue is empty
        totalInQueue: queueInfo.totalInQueue,
        message: "Queue is empty, you can proceed"
      })
    }
    
    return NextResponse.json({
      position,
      isMyTurn,
      totalInQueue: queueInfo.totalInQueue
    })
  } catch (error) {
    console.error("Queue status error:", error)
    return NextResponse.json(
      { error: "Failed to get queue status" },
      { status: 500 }
    )
  }
}
