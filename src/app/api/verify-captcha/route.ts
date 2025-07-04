import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    
    // Simple token verification - we're just checking if a token exists 
    // and trusting that the MathCaptcha component already verified the math problem
    if (!token) {
      return NextResponse.json(
        { error: "Verification token is required" },
        { status: 400 }
      )
    }

    // Small delay to simulate verification
    await new Promise(resolve => setTimeout(resolve, 500));

    // Always return successful verification since the actual check was done client-side
    return NextResponse.json({ 
      success: true,
      message: "Verification successful" 
    })
  } catch (error) {
    console.error("Verification error:", error)
    return NextResponse.json(
      { error: "Failed to verify user" },
      { status: 500 }
    )
  }
}
