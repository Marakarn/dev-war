# PowerShell script แบบง่ายเพื่อตรวจสอบ RabbitMQ

Write-Host "🔍 ตรวจสอบการเชื่อมต่อ RabbitMQ..." -ForegroundColor Yellow

# ทดสอบการเชื่อมต่อที่พอร์ต 5672 (AMQP) และ 15672 (Management)
$amqpPort = Test-NetConnection -ComputerName localhost -Port 5672 -InformationLevel Quiet
$mgmtPort = Test-NetConnection -ComputerName localhost -Port 15672 -InformationLevel Quiet

if ($amqpPort) {
    Write-Host "✅ RabbitMQ AMQP port (5672) กำลังทำงาน" -ForegroundColor Green
} else {
    Write-Host "❌ RabbitMQ AMQP port (5672) ไม่ตอบสนอง" -ForegroundColor Red
}

if ($mgmtPort) {
    Write-Host "✅ RabbitMQ Management port (15672) กำลังทำงาน" -ForegroundColor Green
} else {
    Write-Host "❌ RabbitMQ Management port (15672) ไม่ตอบสนอง" -ForegroundColor Red
}

# ทดสอบการเชื่อมต่อไปยัง Next.js API
$apiPort = Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet

if ($apiPort) {
    Write-Host "✅ Next.js API port (3000) กำลังทำงาน" -ForegroundColor Green
} else {
    Write-Host "❌ Next.js API port (3000) ไม่ตอบสนอง" -ForegroundColor Red
}

# ทดสอบการเชื่อมต่อไปยัง WebSocket server
$wsPort = Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet

if ($wsPort) {
    Write-Host "✅ WebSocket server port (3001) กำลังทำงาน" -ForegroundColor Green
} else {
    Write-Host "❌ WebSocket server port (3001) ไม่ตอบสนอง" -ForegroundColor Red
}

Write-Host "`n🧪 สรุปสถานะระบบ:" -ForegroundColor Cyan
Write-Host "- RabbitMQ: $(if ($amqpPort -and $mgmtPort) { "✅ ทำงาน" } else { "❌ ไม่ทำงาน" })"
Write-Host "- Next.js API: $(if ($apiPort) { "✅ ทำงาน" } else { "❌ ไม่ทำงาน" })"
Write-Host "- WebSocket: $(if ($wsPort) { "✅ ทำงาน" } else { "❌ ไม่ทำงาน" })"

if (-not ($amqpPort -and $mgmtPort)) {
    Write-Host "`n📋 คำแนะนำในการแก้ไขปัญหา RabbitMQ:" -ForegroundColor Yellow
    Write-Host "1. ลองเริ่ม RabbitMQ ด้วย Docker:"
    Write-Host "   docker-compose up rabbitmq -d" -ForegroundColor DarkGray
    Write-Host "2. หรือรันระบบทั้งหมด:"
    Write-Host "   docker-compose up -d" -ForegroundColor DarkGray
    Write-Host "3. ตรวจสอบสถานะ container:"
    Write-Host "   docker-compose ps" -ForegroundColor DarkGray
}

if (-not $apiPort) {
    Write-Host "`n📋 คำแนะนำในการแก้ไขปัญหา Next.js API:" -ForegroundColor Yellow
    Write-Host "1. รัน Next.js API:"
    Write-Host "   npm run dev" -ForegroundColor DarkGray
}

if (-not $wsPort) {
    Write-Host "`n📋 คำแนะนำในการแก้ไขปัญหา WebSocket server:" -ForegroundColor Yellow
    Write-Host "1. รัน WebSocket server ด้วย Node.js:"
    Write-Host "   node socket-server.js" -ForegroundColor DarkGray
}
