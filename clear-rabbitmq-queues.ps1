# PowerShell script to clear RabbitMQ queues for dev-war project

Write-Host "🧹 Clearing RabbitMQ queues..." -ForegroundColor Yellow

$username = "devwar01"
$password = "n6Qk5cF*`$%7r!A7L"
$base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(("{0}:{1}" -f $username, $password)))
$headers = @{Authorization = "Basic $base64AuthInfo"}

# Clear processing_queue (the one with 59 stuck messages)
Write-Host "Clearing processing_queue..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "http://localhost:15672/api/queues/%2f/processing_queue/contents" -Method Delete -Headers $headers
    Write-Host "✅ processing_queue cleared" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to clear processing_queue: $($_.Exception.Message)" -ForegroundColor Red
}

# Clear queue_updates  
Write-Host "Clearing queue_updates..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "http://localhost:15672/api/queues/%2f/queue_updates/contents" -Method Delete -Headers $headers
    Write-Host "✅ queue_updates cleared" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to clear queue_updates: $($_.Exception.Message)" -ForegroundColor Red
}

# Clear queue_state
Write-Host "Clearing queue_state..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "http://localhost:15672/api/queues/%2f/queue_state/contents" -Method Delete -Headers $headers
    Write-Host "✅ queue_state cleared" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to clear queue_state: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "✅ All queues cleared!" -ForegroundColor Green
Write-Host "🔄 You can now restart your application" -ForegroundColor Yellow
