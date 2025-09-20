const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Import services
const RedisService = require('./services/redisService');
const QdrantService = require('./services/qdrantService');
const EmbeddingService = require('./services/embeddingService');
const GeminiService = require('./services/geminiService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
let redisService, qdrantService, embeddingService, geminiService;

async function initializeServices() {
  try {
    redisService = new RedisService();
    await redisService.connect();

    qdrantService = new QdrantService();
    await qdrantService.initialize();

    embeddingService = new EmbeddingService();
    geminiService = new GeminiService();

    console.log('All services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Routes

// Create new session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4();
  res.json({ sessionId });
});

// Send chat message
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }

    // Get relevant context using RAG
    const queryEmbedding = await embeddingService.embedText(message);
    const relevantDocs = await qdrantService.search(queryEmbedding, 5);

    // Prepare context from retrieved documents
    const context = relevantDocs.map(doc => doc.payload.content).join('\n\n');

    // Generate response using Gemini
    const response = await geminiService.generateResponse(message, context);

    // Store conversation in Redis
    await redisService.addMessage(sessionId, {
      user: message,
      bot: response,
      timestamp: new Date().toISOString()
    });

    res.json({ response, sessionId });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Get chat history
app.get('/api/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await redisService.getHistory(sessionId);
    res.json({ history });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

// Clear session
app.delete('/api/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await redisService.clearSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Session clear error:', error);
    res.status(500).json({ error: 'Failed to clear session' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
async function startServer() {
  await initializeServices();
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  if (redisService) await redisService.disconnect();
  process.exit(0);
});

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});