"use client"

import React, { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ShoppingCart, Clock } from 'lucide-react'

const CheckOutPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(60 * 10) // 10 minutes in seconds
  const [accessKey, setAccessKey] = useState("")
  const router = useRouter()

  const endSession = useCallback(async () => {
    const storedAccessKey = localStorage.getItem('accessKey')
    
    if (storedAccessKey) {
      try {
        // Call API to end session and cleanup processing
        await fetch('/api/session', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ key: storedAccessKey }),
        })
        console.log('🏁 Session ended successfully for key:', storedAccessKey)
      } catch (error) {
        console.error('❌ Failed to end session:', error)
      }
    }
    
    // Clear localStorage and redirect
    localStorage.removeItem('sessionToken')
    localStorage.removeItem('sessionStart')
    localStorage.removeItem('accessKey')
    router.push('/waitingQueue')
  }, [router])

  useEffect(() => {
    // Check for session token
    const sessionToken = localStorage.getItem('sessionToken')
    const storedAccessKey = localStorage.getItem('accessKey')
    
    if (!sessionToken || !storedAccessKey) {
      // Redirect to waiting queue if no session
      router.push('/waitingQueue')
      return
    }

    setHasSession(true)
    setAccessKey(storedAccessKey)
    setIsLoading(false)

    // Set session start time if not already set
    const sessionStart = localStorage.getItem('sessionStart')
    if (!sessionStart) {
      localStorage.setItem('sessionStart', Date.now().toString())
    }

    // Update time remaining every second
    const interval = setInterval(() => {
      const start = localStorage.getItem('sessionStart')
      if (start) {
        const elapsed = Math.floor((Date.now() - parseInt(start)) / 1000)
        const remaining = Math.max(0, 600 - elapsed) // 10 minutes = 600 seconds
        
        setTimeRemaining(remaining)
        
        // If session expired, end session properly
        if (remaining === 0) {
          endSession()
        }
      }
    }, 1000)

    // Handle page unload (browser close/refresh)
    const handleBeforeUnload = () => {
      // Try to end session when page is unloaded
      if (storedAccessKey) {
        navigator.sendBeacon('/api/session', JSON.stringify({ key: storedAccessKey }))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [router, endSession])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleLogout = () => {
    endSession()
  }

  if (isLoading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center"
        style={{
          backgroundImage: 'url(/redBG.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="text-center bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-lg">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Verifying session...</p>
        </div>
      </div>
    )
  }

  if (!hasSession) {
    return null // Will redirect
  }

  return (
    <div 
      className="min-h-screen p-4"
      style={{
        backgroundImage: 'url(/redBG.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Session Timer */}
      <div className="fixed top-4 right-4 z-50">
        <Alert className="bg-white/90 backdrop-blur-sm shadow-lg">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Session expires in: {formatTime(timeRemaining)}
          </AlertDescription>
        </Alert>
      </div>

      <div className="max-w-4xl mx-auto pt-16">
        <Card className="mb-6 bg-white/90 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold flex items-center justify-center gap-2">
              <ShoppingCart className="h-8 w-8" />
              Checkout Page
            </CardTitle>
            <CardDescription>
              Welcome! You have successfully entered the checkout area.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <Alert>
              <AlertDescription>
                🎉 Congratulations! You&apos;ve made it through the queue. Your session is active for 10 minutes.
              </AlertDescription>
            </Alert>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Product Information</h3>
                <div className="border rounded-lg p-4 bg-gray-50">
                  <Image
                    src="/redBG.jpg"
                    alt="Sample Product"
                    width={300}
                    height={200}
                    className="w-full h-48 object-cover rounded-md mb-4"
                  />
                  <h4 className="font-semibold">Premium Product</h4>
                  <p className="text-gray-600">Limited time exclusive offer</p>
                  <p className="text-2xl font-bold text-green-600 mt-2">$99.99</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Session Details</h3>
                <div className="border rounded-lg p-4 bg-blue-50">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Session Status:</span>
                      <span className="text-green-600 font-semibold">Active</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Time Remaining:</span>
                      <span className="font-mono">{formatTime(timeRemaining)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Session Type:</span>
                      <span>Queue-based Access</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center pt-6">
              <Button size="lg" className="bg-green-600 hover:bg-green-700">
                Complete Purchase
              </Button>
              <Button variant="outline" size="lg" onClick={handleLogout}>
                End Session
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default CheckOutPage