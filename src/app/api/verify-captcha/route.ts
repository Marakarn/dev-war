import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()
    
    if (!token) {
      return NextResponse.json(
        { error: "reCAPTCHA token is required" },
        { status: 400 }
      )
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY
    
    if (!secretKey) {
      console.error("RECAPTCHA_SECRET_KEY is not configured")
      return NextResponse.json(
        { error: "reCAPTCHA verification not configured" },
        { status: 500 }
      )
    }

    // Verify the reCAPTCHA token with Google
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${secretKey}&response=${token}`,
    })

    const data = await response.json()

    if (data.success) {
      return NextResponse.json({ 
        success: true,
        message: "reCAPTCHA verified successfully" 
      })
    } else {
      return NextResponse.json(
        { 
          error: "reCAPTCHA verification failed",
          details: data['error-codes'] || []
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error("reCAPTCHA verification error:", error)
    return NextResponse.json(
      { error: "Failed to verify reCAPTCHA" },
      { status: 500 }
    )
  }
}
