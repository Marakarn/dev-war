# Dev War Queue System

A Next.js queue system with RabbitMQ and WebSocket support for real-time updates. Users join a queue via captcha verification, receive auto-generated access keys, and wait for their turn to access a session-protected checkout area.

## Features

- **Queue System**: RabbitMQ-based queueing with in-memory fallback
- **Real-time Updates**: WebSocket connections for live queue status
- **Session Management**: JWT-based sessions with NextAuth
- **Captcha Protection**: Google reCAPTCHA before joining queue
- **Docker Deployment**: Full containerization with docker-compose
- **No Database**: All queue data is temporary, no persistent storage
- **External API Ready**: Designed to fetch stock/branch data from external APIs

## Architecture

- **Frontend**: Next.js 15 with React 19
- **Queue Backend**: RabbitMQ (10.8.5.5:5672)
- **WebSocket**: Socket.IO for real-time updates
- **Authentication**: NextAuth with JWT
- **Deployment**: Docker + Docker Compose

## Quick Start

### Development Mode

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env.local
# Edit .env.local with your values
```

3. **Run with RabbitMQ (recommended):**
```bash
# Start RabbitMQ
docker-compose up rabbitmq -d

# Run both Next.js and WebSocket server
npm run dev:all
```

4. **Or run without RabbitMQ (fallback mode):**
```bash
npm run dev
```

5. **Access the application:**
- Main app: http://localhost:4000
- RabbitMQ Management: http://localhost:15672 (admin/password123)

### Production Deployment with Docker

1. **Deploy with docker-compose:**
```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up --build -d
```

2. **Access the application:**
- Main app: http://localhost:4000
- WebSocket: ws://localhost:3001
- RabbitMQ Management: http://localhost:15672

### Manual Docker Build

```bash
# Build the image
docker build -t dev-war .

# Run with environment variables
docker run -p 4000:4000 -p 3001:3001 \
  -e RABBITMQ_URL=amqp://admin:password123@10.8.5.5:5672 \
  -e NEXTAUTH_SECRET=your-secret-key \
  dev-war
```

## API Endpoints

### Queue Management
- `POST /api/queue` - Join queue with access key
- `GET /api/queue?key=<key>` - Check queue position
- `POST /api/generate-key` - Generate new access key (after captcha)

### Session Management
- `POST /api/session` - Create session when it's user's turn
- `GET /api/session` - Check session status

### Captcha & WebSocket
- `POST /api/verify-captcha` - Verify reCAPTCHA token
- `GET /api/socket` - WebSocket endpoint info
- `POST /api/reservation/confirm` - Echo reservation data (no storage)

## Environment Variables

```bash
# NextAuth
NEXTAUTH_URL=http://localhost:4000
NEXTAUTH_SECRET=your-super-secret-key

# Google reCAPTCHA (test keys provided)
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
RECAPTCHA_SECRET_KEY=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe

# RabbitMQ
RABBITMQ_URL=amqp://admin:password123@10.8.5.5:5672
RABBITMQ_HOST=10.8.5.5
RABBITMQ_PORT=5672
RABBITMQ_USER=admin
RABBITMQ_PASS=password123

# WebSocket
WEBSOCKET_PORT=3001
```

## System Flow

1. **User visits home page** → Join Waiting Queue button
2. **Captcha verification** → Google reCAPTCHA challenge
3. **Key generation** → Auto-generated unique access key
4. **Queue joining** → Added to RabbitMQ queue
5. **Real-time updates** → WebSocket broadcasts position updates
6. **Session creation** → When it's user's turn, JWT session created
7. **Checkout access** → 10-minute session for protected area

## Technical Notes

- **No Database**: System uses only in-memory storage and RabbitMQ
- **External APIs**: Stock/branch data should come from external sources
- **Session Storage**: Uses JWT tokens (localStorage in demo, httpOnly cookies recommended for production)
- **Queue Persistence**: RabbitMQ provides queue durability
- **Fallback Mode**: System works with in-memory queue if RabbitMQ unavailable

## Troubleshooting

### RabbitMQ Connection Issues
```bash
# Check RabbitMQ status
docker-compose logs rabbitmq

# Restart RabbitMQ
docker-compose restart rabbitmq
```

### WebSocket Connection Issues
```bash
# Check if socket server is running
curl http://localhost:3001

# View socket server logs
docker-compose logs app
```

### Build Issues
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

## Production Considerations

1. **Change default credentials** in docker-compose.yml
2. **Use real reCAPTCHA keys** instead of test keys
3. **Set proper NEXTAUTH_SECRET** for production
4. **Configure external API endpoints** for stock/branch data
5. **Set up proper logging** and monitoring
6. **Use httpOnly cookies** instead of localStorage for sessions

## Deployment Instructions

### Prerequisites
1. Docker Desktop installed and running
2. Node.js 18+ (for development)
3. Git

### Quick Deploy with Docker

1. **Start Docker Desktop** (ensure it's running)

2. **Clone and deploy:**
```bash
git clone <repository-url>
cd dev-war
docker-compose up --build -d
```

3. **Access applications:**
- Main app: http://localhost:4000
- WebSocket: ws://localhost:3001 
- RabbitMQ Management: http://localhost:15672 (admin/password123)

### Manual Development Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Set environment variables:**
```bash
cp .env.example .env.local
# Edit .env.local if needed
```

3. **Option A: With RabbitMQ (recommended)**
```bash
# Start RabbitMQ only
docker-compose up rabbitmq -d

# Run development servers
npm run dev:all
```

4. **Option B: Without RabbitMQ (fallback mode)**
```bash
npm run dev
```

### Production Build Test

```bash
# Test build locally
npm run build
npm start

# Test with Docker
docker build -t dev-war .
docker run -p 4000:4000 -p 3001:3001 dev-war
```

### Environment Configuration

The system works with these default test credentials:
- **RabbitMQ**: admin/password123 at 10.8.5.5:5672
- **reCAPTCHA**: Test keys (always pass)
- **Session**: 10-minute JWT tokens

For production, update these in docker-compose.yml and .env files.

### Troubleshooting

**Docker Issues:**
```bash
# Ensure Docker Desktop is running
docker --version

# Check containers
docker-compose ps

# View logs
docker-compose logs app
docker-compose logs rabbitmq
```

**Build Issues:**
```bash
# Clean cache
npm run build
docker system prune -f

# Rebuild
docker-compose build --no-cache
```

**Queue Not Working:**
- Check RabbitMQ connection in app logs
- System falls back to in-memory queue if RabbitMQ unavailable
- Verify RabbitMQ is accessible at 10.8.5.5:5672

### System Architecture Summary

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js App   │────│   RabbitMQ       │    │   WebSocket     │
│   Port 4000     │    │   Port 5672      │────│   Port 3001     │
│                 │    │   Management     │    │                 │
│ - Home          │    │   Port 15672     │    │ - Real-time     │
│ - Queue         │    │                  │    │   Updates       │
│ - Checkout      │    │ - Queue Storage  │    │ - Position      │
│ - API Routes    │    │ - Pub/Sub        │    │   Broadcast     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

**Data Flow:**
1. User joins queue → Captcha → Key generation 
2. Queue position stored in RabbitMQ
3. WebSocket broadcasts real-time updates
4. When turn arrives → JWT session created
5. 10-minute checkout access granted

**Key Features:**
✅ RabbitMQ queue with in-memory fallback  
✅ Real-time WebSocket updates  
✅ reCAPTCHA protection  
✅ JWT session management  
✅ Docker deployment ready  
✅ No database required  
✅ External API ready (stock/branch data)
