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

    // Check if we have capacity for direct access (without queueing)
    const isAtCapacity = queueManager.isAtCapacity()
    
    // If we have capacity, allow direct access without queueing
    if (!isAtCapacity) {
      return NextResponse.json({
        success: true,
        position: null, // No position needed since direct access
        directAccess: true,
        totalInQueue: queueManager.getQueueInfo().totalInQueue,
        activeUsers: queueManager.getActiveUserCount(),
        maxActiveUsers: queueManager.getQueueInfo().maxActiveUsers,
        message: "Direct access available, proceed to checkout"
      })
    }
    
    // Otherwise, add to queue
    const result = await queueManager.addToQueue(key.trim())
    const queueInfo = queueManager.getQueueInfo()
    const isMyTurn = queueManager.isMyTurn(key.trim())
    
    return NextResponse.json({
      success: true,
      position: result.position,
      id: result.id,
      directAccess: false,
      isMyTurn,
      totalInQueue: queueInfo.totalInQueue,
      activeUsers: queueInfo.activeUsers,
      maxActiveUsers: queueInfo.maxActiveUsers,
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
    const isAtCapacity = queueManager.isAtCapacity()
    
    // If user is not in queue and we have capacity, allow direct access
    const directAccess = position === null && !isAtCapacity;
    
    // For detailed logging only
    let queueList: Array<{ key: string, pos: number }> = [];
    try {
      // This is just for logging, so we can safely catch any errors
      const debugMethod = (queueManager as unknown as { getDebugStatus: () => { queue: Array<{ key: string, position: number }> } }).getDebugStatus;
      if (debugMethod) {
        const debugData = debugMethod();
        queueList = debugData.queue.map(q => ({ key: q.key, pos: q.position }));
      }
    } catch {
      // Ignore errors in debug code
    }
    
    console.log(`🔍 Queue status check for key: ${key}`, {
      position,
      isMyTurn,
      directAccess,
      activeUsers: queueInfo.activeUsers,
      maxActiveUsers: queueInfo.maxActiveUsers,
      totalInQueue: queueInfo.totalInQueue,
      queueList
    });
    
    return NextResponse.json({
      position,
      isMyTurn,
      totalInQueue: queueInfo.totalInQueue,
      activeUsers: queueInfo.activeUsers,
      maxActiveUsers: queueInfo.maxActiveUsers,
      directAccess,
      timestamp: Date.now() // Add timestamp for client-side freshness check
    })
  } catch (error) {
    console.error("Queue status error:", error)
    return NextResponse.json(
      { error: "Failed to get queue status" },
      { status: 500 }
    )
  }
}
