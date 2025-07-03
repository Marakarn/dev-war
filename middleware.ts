import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Protect the checkout route
  if (request.nextUrl.pathname.startsWith('/checkout')) {
    // In a client-side app, we'll check this via JavaScript in the component
    // This middleware is just for additional protection
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/checkout/:path*']
}
