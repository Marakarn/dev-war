#!/bin/bash

# Script to clear RabbitMQ queues for dev-war project

echo "🧹 Clearing RabbitMQ queues..."

# Clear processing_queue (the one with 59 stuck messages)
echo "Clearing processing_queue..."
curl -i -u devwar01:n6Qk5cF*$%7r!A7L -X DELETE http://localhost:15672/api/queues/%2f/processing_queue/contents

# Clear queue_updates  
echo "Clearing queue_updates..."
curl -i -u devwar01:n6Qk5cF*$%7r!A7L -X DELETE http://localhost:15672/api/queues/%2f/queue_updates/contents

# Clear queue_state
echo "Clearing queue_state..."
curl -i -u devwar01:n6Qk5cF*$%7r!A7L -X DELETE http://localhost:15672/api/queues/%2f/queue_state/contents

echo "✅ All queues cleared!"
echo "🔄 You can now restart your application"
