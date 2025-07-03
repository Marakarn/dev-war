import { NextRequest, NextResponse } from "next/server"
import { queueManager } from "@/lib/queue"

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json()
    
    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { error: "Valid key is required" },
        { status: 400 }
      )
    }

    // Check if it's the user's turn or queue is empty
    const isMyTurn = queueManager.isMyTurn(key)
    const position = queueManager.getPosition(key)
    const queueInfo = queueManager.getQueueInfo()
    
    // Allow session creation if:
    // 1. It's user's turn (position = 1)
    // 2. User is not in queue but queue is empty (position = null && totalInQueue = 0)
    const canCreateSession = isMyTurn || (position === null && queueInfo.totalInQueue === 0)
    
    if (!canCreateSession) {
      return NextResponse.json(
        { error: "Not your turn yet", position },
        { status: 403 }
      )
    }

    // Process the user (remove from queue) only if they are actually in queue
    if (position !== null) {
      await queueManager.processNext()
    }
    
    // Create a session token (in a real app, you'd use proper authentication)
    const sessionToken = Math.random().toString(36).substr(2, 9)
    
    const message = position === null 
      ? "Session created - queue was empty" 
      : "Session created successfully"
    
    return NextResponse.json({
      success: true,
      sessionToken,
      key, // Return the key so frontend can store it
      message,
      redirectTo: "/checkout"
    })
  } catch (error) {
    console.error("Session creation error:", error)
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { key } = await request.json()
    
    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { error: "Valid key is required" },
        { status: 400 }
      )
    }

    // Complete processing to remove user from processing set
    await queueManager.completeProcessing(key)
    
    console.log(`🏁 Session ended for user: ${key}`)
    
    return NextResponse.json({
      success: true,
      message: "Session ended successfully"
    })
  } catch (error) {
    console.error("Session end error:", error)
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    )
  }
}
