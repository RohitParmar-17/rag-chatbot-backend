const axios = require('axios');

class EmbeddingService {
  constructor() {
    this.apiKey = process.env.JINA_API_KEY;
    this.baseUrl = 'https://api.jina.ai/v1/embeddings';
    this.model = 'jina-embeddings-v2-base-en'; // Free tier model
  }

  // Embed a single text
  async embedText(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          input: [text.trim()]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0].embedding;
      } else {
        throw new Error('Invalid response format from Jina API');
      }
    } catch (error) {
      console.error('Embedding error:', error.response?.data || error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  // Embed multiple texts in batch
  async embedBatch(texts) {
    try {
      if (!texts || texts.length === 0) {
        throw new Error('Texts array cannot be empty');
      }

      // Filter out empty texts
      const validTexts = texts.filter(text => text && text.trim().length > 0);
      
      if (validTexts.length === 0) {
        throw new Error('No valid texts to embed');
      }

      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          input: validTexts
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.data) {
        return response.data.data.map(item => item.embedding);
      } else {
        throw new Error('Invalid response format from Jina API');
      }
    } catch (error) {
      console.error('Batch embedding error:', error.response?.data || error.message);
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
  }

  // Get embedding dimensions (useful for vector DB setup)
  async getEmbeddingDimensions() {
    try {
      const testEmbedding = await this.embedText('test');
      return testEmbedding.length;
    } catch (error) {
      console.error('Failed to get embedding dimensions:', error);
      return 768; // Default dimension for jina-embeddings-v2-base-en
    }
  }

  // Validate API key
  async validateApiKey() {
    try {
      await this.embedText('test');
      return true;
    } catch (error) {
      console.error('API key validation failed:', error.message);
      return false;
    }
  }
}

module.exports = EmbeddingService;