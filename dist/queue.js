"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueManager = void 0;
// RabbitMQ-based queue with in-memory fallback
const amqplib_1 = __importDefault(require("amqplib"));
class QueueManager {
    constructor() {
        this.queue = [];
        this.processing = new Set();
        this.rabbitMQConnection = null;
        this.rabbitMQChannel = null;
        this.isConnectedToRabbitMQ = false;
        this.listeners = new Set();
        this.initializeRabbitMQ();
    }
    async initializeRabbitMQ() {
        try {
            const connection = await amqplib_1.default.connect(process.env.RABBITMQ_URL || 'amqp://10.8.5.5:5672');
            const channel = await connection.createChannel();
            await channel.assertQueue('queue_updates', { durable: true });
            await channel.assertQueue('processing_queue', { durable: true });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.rabbitMQConnection = connection;
            this.rabbitMQChannel = channel;
            this.isConnectedToRabbitMQ = true;
            console.log('Connected to RabbitMQ successfully');
            // Start consuming messages for queue updates
            await this.consumeQueueUpdates();
        }
        catch (error) {
            console.warn('Failed to connect to RabbitMQ, using in-memory fallback:', error);
            this.isConnectedToRabbitMQ = false;
        }
    }
    async consumeQueueUpdates() {
        if (!this.rabbitMQChannel)
            return;
        await this.rabbitMQChannel.consume('queue_updates', (msg) => {
            if (msg) {
                try {
                    const data = JSON.parse(msg.content.toString());
                    this.notifyListeners(data);
                    this.rabbitMQChannel?.ack(msg);
                }
                catch (error) {
                    console.error('Error processing queue update:', error);
                    this.rabbitMQChannel?.nack(msg, false, false);
                }
            }
        });
    }
    addListener(listener) {
        this.listeners.add(listener);
    }
    removeListener(listener) {
        this.listeners.delete(listener);
    }
    notifyListeners(data) {
        this.listeners.forEach(listener => listener(data));
    }
    async publishQueueUpdate() {
        const queueInfo = this.getQueueInfo();
        if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
            try {
                await this.rabbitMQChannel.sendToQueue('queue_updates', Buffer.from(JSON.stringify(queueInfo)), { persistent: true });
            }
            catch (error) {
                console.error('Failed to publish queue update to RabbitMQ:', error);
            }
        }
        // Also notify local listeners
        this.notifyListeners(queueInfo);
    }
    async addToQueue(key) {
        // Check if key already exists in queue
        const existing = this.queue.find(item => item.key === key);
        if (existing) {
            return { position: existing.position, id: existing.id };
        }
        const id = Math.random().toString(36).substr(2, 9);
        const position = this.queue.length + 1;
        const queueItem = {
            id,
            key,
            timestamp: Date.now(),
            position
        };
        this.queue.push(queueItem);
        this.updatePositions();
        // Publish update to RabbitMQ
        await this.publishQueueUpdate();
        return { position, id };
    }
    getPosition(key) {
        const item = this.queue.find(item => item.key === key);
        return item ? item.position : null;
    }
    isMyTurn(key) {
        const item = this.queue.find(item => item.key === key);
        return item ? item.position === 1 : false;
    }
    async processNext() {
        if (this.queue.length === 0)
            return null;
        const item = this.queue.shift();
        if (item) {
            this.processing.add(item.key);
            this.updatePositions();
            // Send to processing queue via RabbitMQ
            if (this.isConnectedToRabbitMQ && this.rabbitMQChannel) {
                try {
                    await this.rabbitMQChannel.sendToQueue('processing_queue', Buffer.from(JSON.stringify({ key: item.key, timestamp: Date.now() })), { persistent: true });
                }
                catch (error) {
                    console.error('Failed to send to processing queue:', error);
                }
            }
            await this.publishQueueUpdate();
            return item.key;
        }
        return null;
    }
    async completeProcessing(key) {
        this.processing.delete(key);
        await this.publishQueueUpdate();
    }
    updatePositions() {
        this.queue.forEach((item, index) => {
            item.position = index + 1;
        });
    }
    getQueueInfo() {
        return {
            totalInQueue: this.queue.length,
            processing: Array.from(this.processing)
        };
    }
    // For graceful shutdown
    async close() {
        if (this.rabbitMQConnection) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await this.rabbitMQConnection.close();
            }
            catch (error) {
                console.error('Error closing RabbitMQ connection:', error);
            }
        }
    }
}
exports.queueManager = new QueueManager();
