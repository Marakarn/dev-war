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
}

const WaitingQueuePage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isInQueue, setIsInQueue] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [isVerifyingCaptcha, setIsVerifyingCaptcha] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();

  const createSession = useCallback(async () => {
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: generatedKey }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("sessionToken", data.sessionToken);
        localStorage.setItem("accessKey", data.key || generatedKey);
        router.push("/checkout");
      } else {
        setError(data.error || "Failed to create session");
      }
    } catch (error) {
      setError("Failed to create session. Please try again.");
      console.error("Session creation error:", error);
    }
  }, [generatedKey, router]);

  const fetchQueueStatus = useCallback(async () => {
    if (!generatedKey) return;
    
    try {
      const response = await fetch(
        `/api/queue?key=${encodeURIComponent(generatedKey)}`
      );
      const data = await response.json();

      if (response.ok) {
        setQueueStatus(data);
        
        if (data.isMyTurn || data.position === null) {
          console.log("🎉 User's turn or queue is empty, creating session...");
          await createSession();
        }
      }
    } catch (error) {
      console.error("Failed to check queue status:", error);
    }
  }, [generatedKey, createSession]);

  // Initialize WebSocket connection
  useEffect(() => {
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

    socketRef.current.on("connect_error", (error: any) => {
      console.error("❌ WebSocket connection error:", error);
    });

    socketRef.current.on(
      "queue-update",
      (data: { totalInQueue: number; processing: string[] }) => {
        console.log("📡 Queue update received:", data);
        
        setQueueStatus((prev) => ({
          ...prev,
          position: prev?.position || null,
          isMyTurn: prev?.isMyTurn || false,
          totalInQueue: data.totalInQueue,
        }));
        
        if (data.totalInQueue === 0 && isInQueue && generatedKey) {
          console.log("🎉 Queue is empty, user should proceed!");
          createSession();
        }
        
        if (isInQueue && generatedKey) {
          fetchQueueStatus();
        }
      }
    );

    socketRef.current.on(
      "position-update",
      (data: { key: string; position: number | null; isMyTurn: boolean }) => {
        console.log("📍 Position update:", data);
        if (data.key === generatedKey) {
          setQueueStatus((prev) => ({
            ...prev,
            position: data.position,
            isMyTurn: data.isMyTurn,
            totalInQueue: prev?.totalInQueue || 0,
          }));
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

    if (isInQueue && generatedKey) {
      interval = setInterval(() => {
        fetchQueueStatus();
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isInQueue, generatedKey, fetchQueueStatus]);

  const joinQueue = async () => {
    setShowCaptcha(true);
    setError("");
  };

  const handleMathCaptchaVerify = async (isValid: boolean, token?: string) => {
    if (!isValid || !token) {
      setError("Math verification failed. Please try again.");
      return;
    }

    setIsVerifyingCaptcha(true);
    setError("");

    try {
      // Verify math captcha
      const captchaResponse = await fetch("/api/verify-math-captcha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const captchaData = await captchaResponse.json();

      if (!captchaResponse.ok || !captchaData.success) {
        setError(captchaData.error || "Math verification failed");
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
        setShowCaptcha(false);
        setQueueStatus({
          position: data.position,
          isMyTurn: data.position === 1,
          totalInQueue: data.totalInQueue || data.position,
        });

        // If already first in queue, create session immediately
        if (data.position === 1) {
          try {
            const sessionResponse = await fetch("/api/session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ key: newAccessKey }),
            });

            const sessionData = await sessionResponse.json();

            if (sessionResponse.ok) {
              localStorage.setItem("sessionToken", sessionData.sessionToken);
              localStorage.setItem("accessKey", newAccessKey);
              router.push("/checkout");
              return;
            }
          } catch (sessionError) {
            console.error("Session creation error:", sessionError);
          }
        }
      } else {
        setError(data.error || "Failed to join queue");
      }
    } catch (error) {
      setError("Failed to join queue. Please try again.");
      console.error("Queue join error:", error);
    } finally {
      setIsLoading(false);
      setIsVerifyingCaptcha(false);
    }
  };

  const closeCaptchaDialog = () => {
    setShowCaptcha(false);
    setCaptchaToken("");
  };

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
                        #{queueStatus.position}
                      </div>
                      <div className="text-sm text-gray-600">
                        Your position in queue
                      </div>
                      
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

              <Button
                variant="outline"
                onClick={() => {
                  setIsInQueue(false);
                  setQueueStatus(null);
                  setGeneratedKey("");
                  setError("");
                }}
                className="w-full"
              >
                Leave Queue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Math Captcha Dialog */}
      <Dialog open={showCaptcha} onOpenChange={setShowCaptcha}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Verification
            </DialogTitle>
            <DialogDescription>
              Please solve the math problem to verify you&apos;re human. An
              access key will be generated and you will automatically join the
              queue once verified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <MathCaptcha
              onVerify={handleMathCaptchaVerify}
              onReset={() => setError("")}
            />

            {isVerifyingCaptcha && (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-gray-600">
                  Generating access key and joining queue...
                </span>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={closeCaptchaDialog}
                disabled={isVerifyingCaptcha}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WaitingQueuePage;
