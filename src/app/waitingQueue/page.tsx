"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Shield } from "lucide-react";
import MathCaptcha from "@/components/MathCaptcha";

interface QueueStatus {
  position: number | null;
  isMyTurn: boolean;
  totalInQueue: number;
  activeUsers: number;
  maxActiveUsers: number;
  directAccess?: boolean;
}

const WaitingQueuePage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isInQueue, setIsInQueue] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
  const createSession = useCallback(async () => {
    if (!generatedKey) return;
    
    // Don't try to create a session if one is already in progress
    if (isLoading) {
      console.log("⚠️ Session creation already in progress, skipping");
      return;
    }
    
    try {
      console.log("🔑 Creating session with key:", generatedKey);
      setIsLoading(true);
      
      // Stop polling and WebSocket checks while creating session
      setIsInQueue(false);
      
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: generatedKey }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log("✅ Session created successfully, redirecting to checkout");
        // Store both session token and access key in localStorage
        localStorage.setItem("sessionToken", data.sessionToken);
        localStorage.setItem("accessKey", data.key || generatedKey);
        
        // Stop WebSocket before redirecting
        if (socketRef.current) {
          socketRef.current.emit("leave-queue-updates");
          socketRef.current.disconnect();
        }
        
        // Use router.push to navigate to checkout
        router.push("/checkout");
        return true;
      } else {
        console.error("❌ Session creation failed:", data.error);
        setError(data.error || "Failed to create session");
        // Only re-enable polling if we got a 403 (not our turn)
        if (response.status === 403) {
          setIsInQueue(true);
        }
        return false;
      }
    } catch (error) {
      console.error("❌ Session creation error:", error);
      setError("Failed to create session. Please try again.");
      setIsInQueue(true);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [generatedKey, router, isLoading]);

  // Fetch queue status function
  const fetchQueueStatus = useCallback(async () => {
    if (!generatedKey || !isInQueue) return false;
    
    try {
      console.log("🔍 Fetching queue status for key:", generatedKey);
      const response = await fetch(
        `/api/queue?key=${encodeURIComponent(generatedKey)}`
      );
      
      if (!response.ok) {
        console.error("❌ Queue status HTTP error:", response.status);
        return false;
      }
      
      const data = await response.json();
      console.log("📊 Queue status update:", data);
      
      // Update UI with queue position
      setQueueStatus(data);
      
      // Check conditions for session creation
      const shouldCreateSession = data.isMyTurn === true || data.directAccess === true;
      
      if (shouldCreateSession) {
        console.log(`🎉 User can proceed: isMyTurn=${data.isMyTurn}, directAccess=${data.directAccess}`);
        // Stop polling before redirecting
        setIsInQueue(false);
        // Create session asynchronously
        const success = await createSession();
        return success;
      }
      
      // Check if we are polling for a user not in queue
      if (data.position === null && !data.directAccess) {
        console.warn("⚠️ User not in queue and no direct access - stopping polling");
        setIsInQueue(false);
        setError("You are not in the queue. Please join the queue again.");
        return false;
      }
      
      return false;
    } catch (error) {
      console.error("❌ Failed to check queue status:", error);
      return false;
    }
  }, [generatedKey, createSession, isInQueue]);

  // Initialize WebSocket connection
  useEffect(() => {
    // Connect to WebSocket server
    const wsUrl = "http://localhost:3001";
    
    console.log("🔌 Connecting to WebSocket server at:", wsUrl);

    socketRef.current = io(wsUrl, {
      transports: ["websocket", "polling"],
      timeout: 20000,
      forceNew: true
    });

    socketRef.current.on("connect", () => {
      console.log("✅ Connected to WebSocket server");
      socketRef.current?.emit("join-queue-updates");
    });

    socketRef.current.on("connect_error", (error) => {
      console.error("❌ WebSocket connection error:", error);
    });
    
    // Listen for WebSocket leave queue result
    socketRef.current.on("leave-queue-result", (result) => {
      console.log("📡 Leave queue result:", result);
      
      if (result.success) {
        setIsInQueue(false);
        setQueueStatus(null);
      } else {
        setError(result.message || "Failed to leave queue");
      }
    });

    socketRef.current.on(
      "queue-update",
      (data: { totalInQueue: number; processing: string[]; activeUsers: number; maxActiveUsers: number }) => {
        console.log("📡 Queue update received:", data);
        
        // Update queue status immediately from WebSocket
        if (isInQueue && generatedKey) {
          console.log("⏱️ Updating queue status from WebSocket data");
          setQueueStatus((prev) => {
            if (!prev) return null;
            
            // If a slot opened up and we're next in line, check our position
            const wasAtCapacity = prev.activeUsers >= prev.maxActiveUsers;
            const isNowOpen = data.activeUsers < data.maxActiveUsers;
            const mightBeMyTurn = prev.position === 1;
            
            if (wasAtCapacity && isNowOpen && mightBeMyTurn) {
              console.log("🚨 A slot opened up and we might be next - checking position");
              // Trigger a check-position to verify if it's our turn
              socketRef.current?.emit("check-position", generatedKey);
            }
            
            return {
              ...prev,
              totalInQueue: data.totalInQueue,
              activeUsers: data.activeUsers,
              maxActiveUsers: data.maxActiveUsers
            };
          });
        }
      }
    );

    socketRef.current.on(
      "position-update",
      async (data: { 
        key: string; 
        position: number | null; 
        isMyTurn: boolean; 
        directAccess: boolean;
        totalInQueue: number;
        activeUsers: number; 
        maxActiveUsers: number 
      }) => {
        console.log("📍 Position update:", data);
        
        // Only process if this update is for our key
        if (data.key === generatedKey && isInQueue) {
          console.log("✅ Position update matches our key, updating UI");
          
          setQueueStatus({
            position: data.position,
            isMyTurn: data.isMyTurn,
            directAccess: data.directAccess,
            totalInQueue: data.totalInQueue,
            activeUsers: data.activeUsers,
            maxActiveUsers: data.maxActiveUsers
          });
          
          // If it's the user's turn or they have direct access, create session and redirect
          if (data.isMyTurn || data.directAccess) {
            console.log(`🎉 Position update indicates ${data.isMyTurn ? "it's user's turn" : "direct access is available"}, creating session...`);
            setIsInQueue(false); // Stop polling
            await createSession();
          }
        } else if (data.key === generatedKey) {
          console.log("⚠️ Received position update but isInQueue is false");
        } else {
          console.log("ℹ️ Position update for different user, ignoring");
        }
      }
    );

    socketRef.current.on("disconnect", () => {
      console.log("❌ Disconnected from WebSocket server");
    });

    return () => {
      if (socketRef.current) {
        console.log("🔌 Cleaning up WebSocket connection");
        socketRef.current.emit("leave-queue-updates");
        socketRef.current.disconnect();
      }
    };
  }, [isInQueue, generatedKey, fetchQueueStatus, createSession]);

  // Poll queue status every 5 seconds when in queue (fallback)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    let isActive = true;
    let consecutiveAttempts = 0;
    const MAX_CONSECUTIVE_ATTEMPTS = 3;

    if (isInQueue && generatedKey) {
      console.log("⏱️ Starting queue status polling");
      
      // Check current position via socket first
      if (socketRef.current?.connected) {
        socketRef.current.emit("check-position", generatedKey);
      }
      
      // Initial check
      fetchQueueStatus().then(sessionCreated => {
        if (sessionCreated || !isActive) return;
        
        // If no session created, start polling with exponential backoff
        interval = setInterval(async () => {
          console.log(`🔄 Polling queue status (attempt ${consecutiveAttempts + 1})`);
          
          try {
            const sessionCreated = await fetchQueueStatus();
            
            if (sessionCreated) {
              console.log("✅ Session created, stopping polling");
              if (interval) clearInterval(interval);
              return;
            }
            
            // Check position via WebSocket too
            if (socketRef.current?.connected) {
              socketRef.current.emit("check-position", generatedKey);
            }
            
            // Reset consecutive attempts if we get a response
            consecutiveAttempts = 0;
          } catch (error) {
            console.error("❌ Error in queue polling:", error);
            consecutiveAttempts++;
            
            // If too many consecutive errors, increase interval
            if (consecutiveAttempts >= MAX_CONSECUTIVE_ATTEMPTS && interval) {
              clearInterval(interval);
              interval = setInterval(async () => {
                const sessionCreated = await fetchQueueStatus();
                if (sessionCreated && interval) {
                  clearInterval(interval);
                }
              }, 10000); // Increase to 10 seconds
            }
          }
        }, 5000);
      });
    }

    return () => {
      isActive = false;
      if (interval) clearInterval(interval);
    };
  }, [isInQueue, generatedKey, fetchQueueStatus]);

  const joinQueue = async () => {
    // Show verification dialog
    setShowVerification(true);
    setError("");
  };

  const verifyAndJoinQueue = async () => {
    setIsVerifying(true);
    setError("");

    try {
      // Generate a simple token for verification
      const simpleToken = Math.random().toString(36).substring(2, 15);
      
      // Verify user
      const verifyResponse = await fetch("/api/verify-captcha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: simpleToken }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        setError(verifyData.error || "Verification failed");
        return;
      }

      // Generate access key
      const keyResponse = await fetch("/api/generate-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const keyData = await keyResponse.json();

      if (!keyResponse.ok || !keyData.success) {
        setError("Failed to generate access key");
        return;
      }

      const newAccessKey = keyData.accessKey;
      setGeneratedKey(newAccessKey);

      // Join queue with the generated key
      setIsLoading(true);
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: newAccessKey }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsInQueue(true);
        setShowVerification(false);
        
        // Check if direct access is available
        if (data.directAccess) {
          console.log("🎉 Direct access available, proceeding to checkout...");
          localStorage.setItem("accessKey", newAccessKey);
          // Create session immediately and don't show queue UI
          await createSession();
          return;
        }
        
        // Otherwise, add to queue
        setQueueStatus({
          position: data.position,
          isMyTurn: data.isMyTurn || false,
          totalInQueue: data.totalInQueue || (data.position || 0),
          activeUsers: data.activeUsers,
          maxActiveUsers: data.maxActiveUsers,
          directAccess: false
        });

        // If already my turn, create session immediately
        if (data.isMyTurn) {
          console.log("🎉 Already my turn, creating session immediately...");
          await createSession();
          return;
        }
      } else {
        setError(data.error || "Failed to join queue");
      }
    } catch (error) {
      setError("Failed to join queue. Please try again.");
      console.error("Queue join error:", error);
    } finally {
      setIsLoading(false);
      setIsVerifying(false);
    }
  };

  const closeVerificationDialog = () => {
    setShowVerification(false);
  };

  // Function to handle leaving the queue
  const leaveQueue = async () => {
    if (!generatedKey || !isInQueue) return;
    
    try {
      setIsLoading(true);
      setError("");
      
      console.log("👋 Leaving queue with key:", generatedKey);
      
      // Try WebSocket first if connected
      if (socketRef.current?.connected) {
        console.log("🔌 Using WebSocket to leave queue");
        
        // Create a promise to wait for the WebSocket response
        const leaveQueuePromise = new Promise((resolve, reject) => {
          // Set a timeout to fall back to API if WebSocket doesn't respond
          const timeout = setTimeout(() => {
            reject(new Error("WebSocket leave queue timeout"));
          }, 3000);
          
          // Listen for the leave queue result
          socketRef.current?.once("leave-queue-result", (result) => {
            clearTimeout(timeout);
            console.log("📡 Received leave queue result via WebSocket:", result);
            resolve(result);
          });
          
          // Send the leave queue request
          socketRef.current?.emit("leave-queue", generatedKey);
        });
        
        try {
          await leaveQueuePromise;
          // Success via WebSocket
          setIsInQueue(false);
          setQueueStatus(null);
          return;
        } catch (error) {
          console.warn("⚠️ WebSocket leave queue failed, falling back to API:", error);
          // Fall back to API
        }
      }
      
      // Use API as fallback
      const response = await fetch("/api/queue/leave", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: generatedKey }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        console.log("✅ Successfully left queue via API:", data);
        setIsInQueue(false);
        setQueueStatus(null);
      } else {
        console.error("❌ Failed to leave queue:", data);
        setError(data.error || "Failed to leave queue");
      }
    } catch (error) {
      console.error("❌ Error leaving queue:", error);
      setError("Failed to leave queue. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle page unload (browser close/refresh) - leave queue when user leaves
  useEffect(() => {
    if (!isInQueue || !generatedKey) return;
    
    // Function to call when page is about to be unloaded
    const handleBeforeUnload = () => {
      console.log("🚪 Page unloading - leaving queue");
      
      // Use sendBeacon for asynchronous request that works during page unload
      const leaveQueueData = JSON.stringify({ key: generatedKey });
      
      // Try to leave queue via API
      navigator.sendBeacon("/api/queue/leave", leaveQueueData);
      
      // No return value needed - browser will continue unloading
    };
    
    // Add the event listener for beforeunload
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    // Clean up the event listener when component unmounts or dependencies change
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isInQueue, generatedKey]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: "url(/redBG.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Card className="w-full max-w-md bg-white/90 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Waiting Queue</CardTitle>
          <CardDescription>
            Click the button below to get an access key and join the waiting
            queue
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isInQueue ? (
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={joinQueue}
                className="w-full"
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining Queue...
                  </>
                ) : (
                  "Join Queue"
                )}
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="text-lg font-semibold">
                You&apos;re in the queue!
              </div>

              {generatedKey && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-sm text-gray-600 mb-1">
                    Your Access Key:
                  </div>
                  <div className="font-mono text-sm bg-white px-2 py-1 rounded border">
                    {generatedKey}
                  </div>
                </div>
              )}

              {queueStatus && (
                <div className="space-y-2">
                  {queueStatus.isMyTurn ? (
                    <Alert>
                      <AlertDescription className="text-center">
                        🎉 It&apos;s your turn! Redirecting to checkout...
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-indigo-600">
                        {queueStatus.position !== null 
                          ? `#${queueStatus.position}` 
                          : "Not in queue"}
                      </div>
                      <div className="text-sm text-gray-600">
                        {queueStatus.position !== null 
                          ? "Your position in queue" 
                          : queueStatus.directAccess 
                            ? "Direct access available" 
                            : "Waiting for server..."}
                      </div>
                      
                      {/* Active users count */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                        <div className="text-lg font-semibold text-blue-700">
                          👥 Active Users: {queueStatus.activeUsers} / {queueStatus.maxActiveUsers}
                        </div>
                        <div className="text-xs text-gray-500">
                          {queueStatus.activeUsers >= queueStatus.maxActiveUsers 
                            ? "Maximum capacity reached, waiting for slot to open" 
                            : "Slots available, queue moving soon"}
                        </div>
                      </div>
                      
                      {/* Information box about queue advancement */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
                        <div className="text-sm font-semibold text-green-700">
                          ℹ️ Queue Information
                        </div>
                        <div className="text-xs text-gray-600">
                          When a user leaves, the queue advances automatically. The next person in line will be able to proceed immediately. If that&apos;s you, you&apos;ll be redirected to checkout.
                        </div>
                      </div>
                      
                      {/* Total queue count */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2">
                        <div className="text-lg font-semibold text-gray-700">
                          📊 Total in Queue: {queueStatus.totalInQueue || 0}
                        </div>
                        <div className="text-xs text-gray-500">
                          People currently waiting
                        </div>
                      </div>
                      
                      <div className="text-sm text-gray-500">
                        {queueStatus.position &&
                          queueStatus.position > 1 &&
                          `${queueStatus.position - 1} people ahead of you`}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-gray-600">
                  Checking queue status...
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Verification Dialog */}
      <Dialog open={showVerification} onOpenChange={setShowVerification}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Verification
            </DialogTitle>
            <DialogDescription>
              Please complete the verification to join the queue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Math Captcha Component */}
            <MathCaptcha 
              onVerify={(success) => {
                if (success) {
                  verifyAndJoinQueue();
                } else {
                  setError("Verification failed. Please try again.");
                }
              }}
              onError={(errorMsg) => {
                setError(errorMsg);
              }}
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={closeVerificationDialog}
                disabled={isVerifying}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Queue Button - Always visible */}
      {isInQueue && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-full max-w-md px-4">
          <Button
            variant="outline"
            onClick={leaveQueue}
            disabled={isLoading}
            className="w-full text-red-500 border-red-300 hover:bg-red-50 hover:text-red-600"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Leaving Queue...
              </>
            ) : (
              "Leave Queue"
            )}
          </Button>
        </div>
      )}

    </div>
  );
};

export default WaitingQueuePage;
