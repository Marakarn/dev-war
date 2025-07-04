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

    console.log(`🔑 Session creation request for key: ${key}`)

    // Check if we're at capacity for active users
    if (queueManager.isAtCapacity()) {
      // If at capacity, make sure user is in queue and it's their turn
      const isMyTurn = queueManager.isMyTurn(key)
      const position = queueManager.getPosition(key)
      const queueInfo = queueManager.getQueueInfo()
      
      console.log(`📊 Session request capacity check: isAtCapacity=true, isMyTurn=${isMyTurn}, position=${position}`)
      
      // If not their turn, deny session creation and return position
      if (!isMyTurn) {
        console.log(`❌ Session denied for key: ${key} - Not their turn (position: ${position}, isMyTurn: ${isMyTurn})`)
        return NextResponse.json(
          { 
            error: "Max active users reached. Please wait your turn in queue.",
            position,
            activeUsers: queueManager.getActiveUserCount(),
            maxActiveUsers: queueInfo.maxActiveUsers
          },
          { status: 403 }
        )
      }
    }

    // Get position before modifying queue (for logging)
    const initialPosition = queueManager.getPosition(key)
    
    // If user is at position 1 in queue, process them (remove from queue)
    if (initialPosition === 1) {
      console.log(`✅ Processing user: ${key} from position 1`)
      await queueManager.processNext()
    }
    
    // Try to add user to active users
    const addedToActive = queueManager.addActiveUser(key)
    
    if (!addedToActive) {
      console.log(`❌ Failed to add user to active sessions: ${key}`)
      return NextResponse.json(
        { error: "Failed to add user to active session. Maximum capacity reached." },
        { status: 403 }
      )
    }
    
    // Create a session token
    const sessionToken = Math.random().toString(36).substr(2, 9)
    const message = initialPosition === null 
      ? "Session created - direct access" 
      : `Session created successfully from queue position ${initialPosition}`
    
    console.log(`🎉 Session created for key: ${key} - ${message}`)
    
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

    // Remove user from active users
    queueManager.removeActiveUser(key)
    
    // Complete processing to remove user from processing set if they were there
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
