// Reservation confirmation endpoint (just echoes data)
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Just echo the data back without storing anything
    return NextResponse.json({
      success: true,
      message: "Reservation confirmed (echo only)",
      data: data,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error("Reservation confirmation error:", error)
    return NextResponse.json(
      { error: "Invalid request data" },
      { status: 400 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Reservation confirm endpoint",
    method: "POST",
    description: "Echoes confirmation data without storing anything"
  })
}
