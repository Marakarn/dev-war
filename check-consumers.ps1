# PowerShell script to check RabbitMQ consumer status

Write-Host "🔍 Checking RabbitMQ Consumer Status..." -ForegroundColor Yellow

$username = "devwar01"
$password = "n6Qk5cF*`$%7r!A7L"
$base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(("{0}:{1}" -f $username, $password)))
$headers = @{Authorization = "Basic $base64AuthInfo"}

try {
    # Check API debug
    Write-Host "📊 Getting consumer info from API..." -ForegroundColor Cyan
    $apiResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/debug" -Method Post -Body '{"action":"check_consumers"}' -ContentType "application/json"
    Write-Host "API Response: $($apiResponse | ConvertTo-Json -Depth 3)" -ForegroundColor Green
    
    # Check RabbitMQ Management API directly
    Write-Host "🐰 Getting consumer info from RabbitMQ Management..." -ForegroundColor Cyan
    $consumers = Invoke-RestMethod -Uri "http://localhost:15672/api/consumers" -Headers $headers
    
    Write-Host "Total Consumers: $($consumers.Count)" -ForegroundColor Magenta
    
    $devWarConsumers = $consumers | Where-Object { 
        $_.queue.name -match "queue_updates|processing_queue|queue_state" 
    }
    
    if ($devWarConsumers.Count -gt 0) {
        Write-Host "✅ Dev-War Consumers Found: $($devWarConsumers.Count)" -ForegroundColor Green
        foreach ($consumer in $devWarConsumers) {
            Write-Host "  - Queue: $($consumer.queue.name)" -ForegroundColor White
            Write-Host "    Consumer Tag: $($consumer.consumer_tag)" -ForegroundColor Gray
            Write-Host "    State: $($consumer.state)" -ForegroundColor Gray
            Write-Host "    Channel: $($consumer.channel_details.name)" -ForegroundColor Gray
            Write-Host ""
        }
    } else {
        Write-Host "❌ No Dev-War consumers found!" -ForegroundColor Red
        Write-Host "This means consumers are not running properly." -ForegroundColor Yellow
    }
    
    # Check queue status
    Write-Host "📋 Checking queue message counts..." -ForegroundColor Cyan
    $queues = Invoke-RestMethod -Uri "http://localhost:15672/api/queues" -Headers $headers
    
    $devWarQueues = $queues | Where-Object { 
        $_.name -match "queue_updates|processing_queue|queue_state" 
    }
    
    foreach ($queue in $devWarQueues) {
        Write-Host "Queue: $($queue.name)" -ForegroundColor White
        Write-Host "  Messages Ready: $($queue.messages_ready)" -ForegroundColor $(if($queue.messages_ready -gt 0) { "Red" } else { "Green" })
        Write-Host "  Messages Unacked: $($queue.messages_unacknowledged)" -ForegroundColor $(if($queue.messages_unacknowledged -gt 0) { "Yellow" } else { "Green" })
        Write-Host "  Consumers: $($queue.consumers)" -ForegroundColor $(if($queue.consumers -eq 0) { "Red" } else { "Green" })
        Write-Host ""
    }
    
} catch {
    Write-Host "❌ Error checking consumers: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "🔄 To restart consumers, restart your Next.js application" -ForegroundColor Yellow
