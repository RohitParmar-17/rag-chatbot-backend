const { QdrantClient } = require('@qdrant/js-client-rest');

class QdrantService {
  constructor() {
    this.client = null;
    this.collectionName = 'news_articles';
    this.vectorSize = 768; // jina-embeddings-v2-base-en dimension
  }

  async initialize() {
    try {
      this.client = new QdrantClient({
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
      });

      // Check if collection exists, create if not
      await this.ensureCollection();
      console.log('Qdrant service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Qdrant:', error);
      throw error;
    }
  }

  async ensureCollection() {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        col => col.name === this.collectionName
      );

      if (!collectionExists) {
        console.log(`Creating collection: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine'
          }
        });
        console.log('Collection created successfully');
      } else {
        console.log('Collection already exists');
      }
    } catch (error) {
      console.error('Failed to ensure collection:', error);
      throw error;
    }
  }

  // Insert single document
  async insertDocument(id, vector, payload) {
    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: id,
            vector: vector,
            payload: payload
          }
        ]
      });
      return true;
    } catch (error) {
      console.error('Failed to insert document:', error);
      throw error;
    }
  }

  // Insert multiple documents
  async insertDocuments(documents) {
    try {
      const points = documents.map((doc) => ({
        id: doc.id, // Should be integer or UUID
        vector: doc.vector,
        payload: doc.payload
      }));

      console.log(`Preparing to insert ${points.length} documents...`);
      console.log(`Sample point ID: ${points[0]?.id}, type: ${typeof points[0]?.id}`);

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points
      });

      console.log(`✅ Inserted ${documents.length} documents successfully`);
      return true;
    } catch (error) {
      console.error('Failed to insert documents:', error);
      console.error('Error details:', error.data?.status?.error);
      throw error;
    }
  }

  // Search for similar documents
  async search(queryVector, topK = 5, threshold = 0.7) {
    try {
      const searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit: topK,
        score_threshold: threshold,
        with_payload: true
      });

      return searchResult;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  // Get collection info
  async getCollectionInfo() {
    try {
      const info = await this.client.getCollection(this.collectionName);
      return info;
    } catch (error) {
      console.error('Failed to get collection info:', error);
      throw error;
    }
  }

  // Count documents in collection
  async getDocumentCount() {
    try {
      const info = await this.getCollectionInfo();
      return info.points_count;
    } catch (error) {
      console.error('Failed to get document count:', error);
      return 0;
    }
  }

  // Delete document by ID
  async deleteDocument(id) {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: [id]
      });
      return true;
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  }

  // Clear all documents
  async clearCollection() {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {}
      });
      console.log('Collection cleared successfully');
      return true;
    } catch (error) {
      console.error('Failed to clear collection:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const collections = await this.client.getCollections();
      return {
        status: 'healthy',
        collections: collections.collections.length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = QdrantService;