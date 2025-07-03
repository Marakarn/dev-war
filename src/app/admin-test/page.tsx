"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ===== ADMIN TEST PAGE - REMOVE IN PRODUCTION =====
// This page is for testing queue functionality and should be removed before production deployment

interface QueueStatus {
  totalInQueue: number;
  processing: string[];
}

export default function AdminTestPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ totalInQueue: 0, processing: [] });
  const [bulkCount, setBulkCount] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMessage(prev => `[${timestamp}] ${msg}\n${prev}`);
  };

  useEffect(() => {
    // Connect to WebSocket server
    const wsUrl = "http://localhost:3001";
    const socketInstance = io(wsUrl, {
      transports: ["websocket", "polling"],
      timeout: 20000,
    });

    socketInstance.on("connect", () => {
      setConnected(true);
      addLog("✅ Connected to WebSocket server");
      socketInstance.emit("join-queue-updates");
    });

    socketInstance.on("connect_error", (error) => {
      addLog(`❌ Connection error: ${error.message}`);
    });

    socketInstance.on("queue-update", (data: QueueStatus) => {
      setQueueStatus(data);
      addLog(`📡 Queue update: ${data.totalInQueue} in queue, ${data.processing.length} processing`);
    });

    // Test event listeners
    socketInstance.on("test-bulk-queue-complete", (data) => {
      addLog(`🎉 Bulk queue completed: ${data.message}`);
      setIsLoading(false);
    });

    socketInstance.on("test-queue-cleared", (data) => {
      addLog(`🗑️ Queue cleared: ${data.message}`);
      setIsLoading(false);
    });

    socketInstance.on("test-user-processed", (data) => {
      addLog(`✅ User processed: ${data.key}`);
    });

    socketInstance.on("test-no-users", (data) => {
      addLog(`📭 ${data.message}`);
    });

    socketInstance.on("test-queue-status", (data) => {
      addLog(`📊 Queue status: ${JSON.stringify(data)}`);
    });

    socketInstance.on("disconnect", () => {
      setConnected(false);
      addLog("❌ Disconnected from WebSocket server");
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const handleBulkAdd = () => {
    if (!socket || !connected) {
      addLog("❌ Not connected to server");
      return;
    }

    setIsLoading(true);
    addLog(`🧪 Adding ${bulkCount} users to queue...`);
    socket.emit("test-add-bulk-queue", bulkCount);
  };

  const handleClearQueue = () => {
    if (!socket || !connected) {
      addLog("❌ Not connected to server");
      return;
    }

    setIsLoading(true);
    addLog("🧪 Clearing queue...");
    socket.emit("test-clear-queue");
  };

  const handleProcessNext = () => {
    if (!socket || !connected) {
      addLog("❌ Not connected to server");
      return;
    }

    addLog("🧪 Processing next user...");
    socket.emit("test-process-next");
  };

  const handleGetStatus = () => {
    if (!socket || !connected) {
      addLog("❌ Not connected to server");
      return;
    }

    addLog("📊 Getting queue status...");
    socket.emit("test-get-queue-status");
  };

  const handleCheckAPIQueue = async () => {
    try {
      addLog("🔍 Checking API queue status...");
      const response = await fetch('/api/debug');
      const data = await response.json();
      addLog(`📊 API Queue Status: ${JSON.stringify(data.data, null, 2)}`);
    } catch (error) {
      addLog(`❌ Failed to check API queue: ${error}`);
    }
  };

  const handleForceClearAPI = async () => {
    try {
      addLog("🧹 Force clearing API queue...");
      const response = await fetch('/api/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'force_clear' }),
      });
      const data = await response.json();
      addLog(`✅ Force clear result: ${JSON.stringify(data)}`);
    } catch (error) {
      addLog(`❌ Failed to force clear API queue: ${error}`);
    }
  };

  return (
    <div 
      className="min-h-screen p-8"
      style={{
        backgroundImage: 'url(/redBG.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="max-w-4xl mx-auto">
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-red-600">
              🧪 Queue Testing Admin Panel
            </CardTitle>
            <p className="text-sm text-gray-600">
              ⚠️ FOR TESTING ONLY - Remove this page before production deployment
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Connection Status */}
            <Alert className={connected ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <AlertDescription>
                Status: {connected ? "🟢 Connected" : "🔴 Disconnected"} to WebSocket server
              </AlertDescription>
            </Alert>

            {/* Current Queue Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📊 Current Queue Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{queueStatus.totalInQueue}</div>
                    <div className="text-sm text-gray-600">Users in Queue</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{queueStatus.processing.length}</div>
                    <div className="text-sm text-gray-600">Users Processing</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Test Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">🎛️ Test Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Bulk Add */}
                <div className="flex items-center gap-4">
                  <Input
                    type="number"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Number(e.target.value))}
                    min={1}
                    max={100}
                    className="w-24"
                  />
                  <Button 
                    onClick={handleBulkAdd}
                    disabled={!connected || isLoading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isLoading ? "Adding..." : `Add ${bulkCount} Users to Queue`}
                  </Button>
                </div>

                {/* Other Controls */}
                <div className="flex flex-wrap gap-2">
                  <Button 
                    onClick={handleProcessNext}
                    disabled={!connected}
                    variant="outline"
                  >
                    Process Next User
                  </Button>
                  <Button 
                    onClick={handleGetStatus}
                    disabled={!connected}
                    variant="outline"
                  >
                    Get WebSocket Status
                  </Button>
                  <Button 
                    onClick={handleCheckAPIQueue}
                    disabled={!connected}
                    variant="outline"
                  >
                    Check API Queue
                  </Button>
                  <Button 
                    onClick={handleForceClearAPI}
                    disabled={!connected || isLoading}
                    variant="destructive"
                  >
                    {isLoading ? "Clearing..." : "Force Clear API Queue"}
                  </Button>
                  <Button 
                    onClick={handleClearQueue}
                    disabled={!connected || isLoading}
                    variant="destructive"
                  >
                    {isLoading ? "Clearing..." : "Clear All Queue"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📋 Activity Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  ref={logRef}
                  className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto whitespace-pre-wrap"
                >
                  {message || "No logs yet..."}
                </div>
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex gap-4">
              <Button 
                onClick={() => window.location.href = '/'}
                variant="outline"
              >
                ← Back to Home
              </Button>
              <Button 
                onClick={() => window.location.href = '/waitingQueue'}
                variant="outline"
              >
                Go to Queue Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
