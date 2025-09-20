const redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.sessionTTL = parseInt(process.env.SESSION_TTL) || 3600; // 1 hour
    this.historyTTL = parseInt(process.env.CHAT_HISTORY_TTL) || 7200; // 2 hours
  }

  async connect() {
    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis');
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
    }
  }

  // Generate session key
  getSessionKey(sessionId) {
    return `session:${sessionId}`;
  }

  // Generate chat history key
  getHistoryKey(sessionId) {
    return `history:${sessionId}`;
  }

  // Add message to chat history
  async addMessage(sessionId, messageData) {
    try {
      const historyKey = this.getHistoryKey(sessionId);
      const sessionKey = this.getSessionKey(sessionId);
      
      // Add message to history list
      await this.client.lPush(historyKey, JSON.stringify(messageData));
      
      // Set TTL for history
      await this.client.expire(historyKey, this.historyTTL);
      
      // Update session timestamp
      await this.client.set(sessionKey, new Date().toISOString(), {
        EX: this.sessionTTL
      });
      
      return true;
    } catch (error) {
      console.error('Failed to add message:', error);
      throw error;
    }
  }

  // Get chat history for session
  async getHistory(sessionId) {
    try {
      const historyKey = this.getHistoryKey(sessionId);
      const messages = await this.client.lRange(historyKey, 0, -1);
      
      // Parse messages and reverse to get chronological order
      return messages.reverse().map(msg => JSON.parse(msg));
    } catch (error) {
      console.error('Failed to get history:', error);
      throw error;
    }
  }

  // Clear session and history
  async clearSession(sessionId) {
    try {
      const historyKey = this.getHistoryKey(sessionId);
      const sessionKey = this.getSessionKey(sessionId);
      
      await this.client.del([historyKey, sessionKey]);
      return true;
    } catch (error) {
      console.error('Failed to clear session:', error);
      throw error;
    }
  }

  // Check if session exists
  async sessionExists(sessionId) {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const exists = await this.client.exists(sessionKey);
      return exists === 1;
    } catch (error) {
      console.error('Failed to check session:', error);
      return false;
    }
  }

  // Get session info
  async getSessionInfo(sessionId) {
    try {
      const sessionKey = this.getSessionKey(sessionId);
      const historyKey = this.getHistoryKey(sessionId);
      
      const [timestamp, messageCount] = await Promise.all([
        this.client.get(sessionKey),
        this.client.lLen(historyKey)
      ]);
      
      return {
        sessionId,
        lastActivity: timestamp,
        messageCount
      };
    } catch (error) {
      console.error('Failed to get session info:', error);
      return null;
    }
  }
}

module.exports = RedisService;