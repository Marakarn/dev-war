// WebSocket upgrade endpoint for App Router

export async function GET() {
  // For App Router, WebSocket handling needs to be done differently
  // This endpoint will be used by the client to establish connection
  
  return new Response(JSON.stringify({ 
    message: 'WebSocket endpoint available',
    path: '/api/socket'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
