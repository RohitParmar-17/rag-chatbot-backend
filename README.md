# RAG-Powered News Chatbot Backend

A Node.js Express backend for a RAG (Retrieval-Augmented Generation) powered chatbot that answers queries about news articles.

## Tech Stack

- **Backend**: Node.js + Express
- **Vector Database**: Qdrant (cloud)
- **Embeddings**: Jina Embeddings API (free tier)
- **LLM**: Google Gemini API (free trial)
- **Cache & Sessions**: Redis (in-memory)
- **News Sources**: RSS feeds (Reuters, CNN, BBC)

## Architecture Overview

```
User Query → Embedding → Vector Search → Context Retrieval → LLM Response
                ↓              ↓              ↓              ↓
            Jina API      Qdrant DB    Top-K Articles   Gemini API
```

## Setup Instructions

### 1. Prerequisites

- Node.js 16+ and npm
- Redis server (local or cloud)
- API Keys:
  - Jina Embeddings API key (free at https://jina.ai/embeddings)
  - Google Gemini API key (free at https://aistudio.google.com/apikey)
  - Qdrant cloud cluster (free at https://qdrant.tech)

### 2. Installation

```bash
# Clone repository
git clone <repository-url>
cd rag-chatbot-backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 3. Environment Configuration

Edit `.env` file with your API keys:

```env
PORT=5000
NODE_ENV=development

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Qdrant Configuration  
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key

# Jina Embeddings API
JINA_API_KEY=your-jina-api-key

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key

# Cache Settings
SESSION_TTL=3600
CHAT_HISTORY_TTL=7200
```

### 4. Data Ingestion

Before starting the server, ingest news articles:

```bash
# Ingest ~50 news articles from RSS feeds
npm run ingest

# Clear existing data and re-ingest
npm run ingest -- --clear
```

### 5. Start Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

Server will start on `http://localhost:5000`

## API Endpoints

### Session Management

- `POST /api/session` - Create new session
- `GET /api/history/:sessionId` - Get chat history
- `DELETE /api/history/:sessionId` - Clear session

### Chat

- `POST /api/chat` - Send message and get response
  ```json
  {
    "sessionId": "uuid",
    "message": "What's the latest on tech news?"
  }
  ```

### Health Check

- `GET /api/health` - Server health status

## System Design & Caching

### Session Management
- **Redis Keys**: `session:{sessionId}` and `history:{sessionId}`
- **TTL Configuration**: 
  - Sessions: 1 hour (3600s)
  - Chat history: 2 hours (7200s)
- **Data Structure**: Chat history stored as Redis lists for efficient FIFO operations

### Caching Strategy
```javascript
// Session TTL Configuration
SESSION_TTL=3600        // Session expires after 1 hour
CHAT_HISTORY_TTL=7200   // History expires after 2 hours

// Cache warming strategy
- News articles pre-embedded and stored in Qdrant
- Vector search results cached for 10 minutes
- Frequent queries benefit from Qdrant's internal caching
```

### Performance Optimizations
1. **Batch Processing**: News ingestion processes articles in batches of 10
2. **Connection Pooling**: Redis connection reused across requests
3. **Vector Indexing**: Qdrant HNSW index for fast similarity search
4. **Text Chunking**: Articles limited to 8000 chars for embedding efficiency

## RAG Pipeline Flow

### 1. News Ingestion
```javascript
RSS Feeds → Article Extraction → Text Cleaning → Batch Embedding → Qdrant Storage
```

### 2. Query Processing
```javascript
User Query → Jina Embedding → Vector Search → Top-K Results → Context Assembly → Gemini Response
```

### 3. Embedding Strategy
- **Model**: `jina-embeddings-v2-base-en` (768 dimensions)
- **Batch Size**: 10 articles per API call
- **Rate Limiting**: 2-second delays between batches

## File Structure

```
src/
├── server.js              # Main Express server
├── services/
│   ├── redisService.js     # Redis session management
│   ├── qdrantService.js    # Vector database operations
│   ├── embeddingService.js # Jina embeddings API
│   └── geminiService.js    # Gemini LLM integration
└── scripts/
    └── ingestNews.js       # News ingestion script
```

## Error Handling

- **API Failures**: Graceful fallbacks with informative error messages
- **Rate Limiting**: Built-in delays and retry logic
- **Session Recovery**: Automatic session validation and recreation
- **Vector Search**: Fallback to lower similarity thresholds if no results

## Deployment

### Using Render.com

1. Connect GitHub repository to Render
2. Set environment variables in Render dashboard
3. Deploy with automatic builds on push

### Environment Variables for Production
```env
NODE_ENV=production
REDIS_URL=redis://your-redis-cloud-url
QDRANT_URL=https://your-cluster.qdrant.io
# ... other API keys
```

## Monitoring & Logging

- Request/response logging in development
- Error tracking with stack traces
- Redis connection status monitoring
- Vector database health checks

## News Sources

Current RSS feeds:
- Reuters (Top News, Business, Technology)
- CNN (Edition RSS)
- BBC (World News)

## Rate Limits & Quotas

- **Jina Embeddings**: 1M tokens/month (free tier)
- **Gemini API**: 15 requests/minute (free tier)
- **Qdrant**: 1GB storage (free tier)

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   ```bash
   # Check Redis status
   redis-cli ping
   # Should return PONG
   ```

2. **Qdrant Authentication Error**
   - Verify QDRANT_URL and QDRANT_API_KEY
   - Check cluster status in Qdrant dashboard

3. **Embedding API Limits**
   - Monitor Jina API usage in dashboard
   - Reduce batch sizes if hitting rate limits

4. **No Search Results**
   ```bash
   # Re-run news ingestion
   npm run ingest -- --clear
   ```

## Development Notes

- Use `nodemon` for auto-restart during development
- Redis data persists between server restarts
- Vector embeddings are cached in Qdrant permanently
- Session cleanup happens automatically via TTL

## Future Improvements

- WebSocket support for real-time streaming
- User authentication and personalization
- Advanced caching with cache warming strategies
- Horizontal scaling with Redis Cluster
- Article freshness scoring and auto-refresh