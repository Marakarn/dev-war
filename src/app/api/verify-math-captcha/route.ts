import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { success: false, error: "Token is required" },
        { status: 400 }
      )
    }

    // Verify math captcha token
    try {
      const decodedToken = atob(token)
      
      // Check if token format is correct
      if (!decodedToken.startsWith('math_captcha_')) {
        throw new Error('Invalid token format')
      }

      // Extract timestamp from token
      const parts = decodedToken.split('_')
      if (parts.length < 3) {
        throw new Error('Invalid token structure')
      }

      const timestamp = parseInt(parts[parts.length - 1])
      const now = Date.now()
      const fiveMinutes = 5 * 60 * 1000

      // Check if token is not older than 5 minutes
      if (now - timestamp > fiveMinutes) {
        return NextResponse.json(
          { success: false, error: "Token expired. Please try again." },
          { status: 400 }
        )
      }

      // Token is valid
      return NextResponse.json({
        success: true,
        message: "Math captcha verified successfully"
      })

    } catch (decodeError) {
      console.error("Token decode error:", decodeError)
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error("Math captcha verification error:", error)
    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 }
    )
  }
}
