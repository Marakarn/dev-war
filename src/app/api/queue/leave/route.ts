import { NextRequest, NextResponse } from "next/server"
import { queueManager } from "@/lib/queue"

export async function DELETE(request: NextRequest) {
  try {
    const { key } = await request.json()
    
    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { error: "Valid key is required" },
        { status: 400 }
      )
    }

    // First check if the user is in the queue
    const position = queueManager.getPosition(key)
    
    if (position === null) {
      // User isn't in the queue, check if they're an active user
      if (queueManager.getActiveUsers().includes(key)) {
        // User is an active user, end their session
        queueManager.removeActiveUser(key)
        await queueManager.completeProcessing(key)
        console.log(`🏁 Active user ${key} removed from active users`)
        
        return NextResponse.json({
          success: true,
          message: "Successfully left active session",
          wasInQueue: false,
          wasActive: true
        })
      }
      
      // User isn't in queue or active
      return NextResponse.json({
        success: false,
        message: "User not found in queue or active sessions",
        wasInQueue: false,
        wasActive: false
      })
    }
    
    // User is in queue, remove them
    const removed = await queueManager.removeFromQueue(key)
    
    if (removed) {
      console.log(`👋 User ${key} successfully left the queue from position ${position}`)
      
      // If the user was in position 1 and there are still users in the queue,
      // trigger a queue update to notify the next user
      if (position === 1) {
        const queueInfo = queueManager.getQueueInfo()
        console.log(`🚨 Position 1 user left. Queue length: ${queueInfo.totalInQueue}, Active users: ${queueInfo.activeUsers}/${queueInfo.maxActiveUsers}`)
      }
      
      return NextResponse.json({
        success: true,
        message: `Successfully left queue from position ${position}`,
        wasInQueue: true,
        wasActive: false,
        formerPosition: position
      })
    } else {
      return NextResponse.json({
        success: false,
        message: "Failed to remove from queue",
        wasInQueue: true,
        wasActive: false
      })
    }
  } catch (error) {
    console.error("Leave queue error:", error)
    return NextResponse.json(
      { error: "Failed to leave queue" },
      { status: 500 }
    )
  }
}
