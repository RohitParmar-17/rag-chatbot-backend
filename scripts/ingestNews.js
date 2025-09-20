const dotenv = require('dotenv');
const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
dotenv.config();

// Import services
const QdrantService = require('../services/qdrantService');
const EmbeddingService = require('../services/embeddingService');

class NewsIngestion {
  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      customFields: {
        item: ['description', 'content:encoded', 'media:content']
      }
    });
    
    this.qdrantService = new QdrantService();
    this.embeddingService = new EmbeddingService();
    this.articleCounter = 1; // Counter for integer IDs
    
    // RSS feeds to scrape
    this.feeds = [
      'https://feeds.bbci.co.uk/news/rss.xml',
      'https://rss.cnn.com/rss/cnn_topstories.rss',
      'https://feeds.npr.org/1001/rss.xml',
      'https://rss.cnn.com/rss/cnn_world.rss',
      'https://feeds.bbci.co.uk/news/business/rss.xml'
    ];
  }

  async initialize() {
    await this.qdrantService.initialize();
    console.log('News ingestion service initialized');
  }

  // Fetch and parse RSS feed with retry logic
  async fetchFeed(feedUrl, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Fetching feed: ${feedUrl} (attempt ${attempt})`);
        
        const feed = await this.parser.parseURL(feedUrl);
        console.log(`✅ Successfully fetched ${feed.items?.length || 0} items from ${feedUrl}`);
        return feed.items || [];
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed for ${feedUrl}:`, error.message);
        
        if (attempt === retries) {
          console.error(`🚫 All ${retries} attempts failed for ${feedUrl}`);
          return [];
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
    return [];
  }

  // Clean and extract text from HTML
  cleanHtmlContent(html) {
    if (!html) return '';
    
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, footer, header, .advertisement').remove();
    
    // Get text content
    const text = $.text()
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
    
    return text;
  }

  // Process a single article
  processArticle(item, feedIndex) {
    const title = item.title || '';
    const description = item.description || item.summary || '';
    const content = item['content:encoded'] || item.content || '';
    const link = item.link || '';
    const pubDate = item.pubDate || item.isoDate || new Date().toISOString();

    // Clean HTML content
    const cleanDescription = this.cleanHtmlContent(description);
    const cleanContent = this.cleanHtmlContent(content);

    // Combine text for embedding
    let combinedText = title;
    if (cleanDescription) combinedText += '\n\n' + cleanDescription;
    if (cleanContent && cleanContent !== cleanDescription) {
      combinedText += '\n\n' + cleanContent;
    }

    // Limit text length to avoid embedding API limits
    if (combinedText.length > 8000) {
      combinedText = combinedText.substring(0, 8000) + '...';
    }

    return {
      id: this.articleCounter++, // Use incremental integer ID
      title,
      description: cleanDescription,
      content: combinedText,
      link,
      pubDate,
      source: this.feeds[feedIndex] || 'unknown'
    };
  }

  // Fetch articles from all feeds
  async fetchAllArticles() {
    console.log('Fetching articles from all feeds...');
    const allArticles = [];

    for (let i = 0; i < this.feeds.length; i++) {
      const feedUrl = this.feeds[i];
      const items = await this.fetchFeed(feedUrl);
      
      if (items.length > 0) {
        // Process and add articles
        const processedItems = items.slice(0, 10).map(item => 
          this.processArticle(item, i)
        );
        
        allArticles.push(...processedItems);
        console.log(`📰 Added ${processedItems.length} articles from feed ${i + 1}`);
      }
      
      // Add delay between feeds to be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`✅ Total articles collected: ${allArticles.length}`);
    return allArticles.slice(0, 50); // Limit to ~50 articles
  }

  // Generate embeddings and store in Qdrant
  async ingestArticles() {
    try {
      console.log('Starting news ingestion...');
      
      // Fetch articles
      const articles = await this.fetchAllArticles();
      
      if (articles.length === 0) {
        console.log('No articles found to ingest');
        return;
      }

      console.log(`Processing ${articles.length} articles...`);
      
      // Generate embeddings in batches
      const batchSize = 10;
      const documents = [];
      
      for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        const texts = batch.map(article => article.content);
        
        console.log(`Generating embeddings for batch ${Math.floor(i/batchSize) + 1}...`);
        
        try {
          const embeddings = await this.embeddingService.embedBatch(texts);
          
          // Prepare documents for Qdrant
          for (let j = 0; j < batch.length; j++) {
            const article = batch[j];
            const embedding = embeddings[j];
            
            documents.push({
              id: article.id,
              vector: embedding,
              payload: {
                title: article.title,
                description: article.description,
                content: article.content.substring(0, 1000), // Store first 1000 chars for retrieval
                link: article.link,
                pubDate: article.pubDate,
                source: article.source,
                ingested_at: new Date().toISOString()
              }
            });
          }
        } catch (error) {
          console.error(`Failed to process batch ${Math.floor(i/batchSize) + 1}:`, error.message);
          continue;
        }
        
        // Add delay between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (documents.length === 0) {
        console.log('No documents to insert');
        return;
      }

      // Insert documents into Qdrant
      console.log(`Inserting ${documents.length} documents into Qdrant...`);
      await this.qdrantService.insertDocuments(documents);
      
      console.log('News ingestion completed successfully!');
      console.log(`Total documents ingested: ${documents.length}`);
      
      // Print collection info
      const count = await this.qdrantService.getDocumentCount();
      console.log(`Total documents in collection: ${count}`);
      
    } catch (error) {
      console.error('News ingestion failed:', error);
      throw error;
    }
  }

  // Clear existing data (useful for re-ingestion)
  async clearExistingData() {
    try {
      console.log('Clearing existing data...');
      await this.qdrantService.clearCollection();
      console.log('Existing data cleared');
    } catch (error) {
      console.error('Failed to clear existing data:', error);
      throw error;
    }
  }
}

// Main execution function
async function main() {
  const ingestion = new NewsIngestion();
  
  try {
    await ingestion.initialize();
    
    // Check command line arguments
    const args = process.argv.slice(2);
    const shouldClear = args.includes('--clear');
    
    if (shouldClear) {
      await ingestion.clearExistingData();
    }
    
    await ingestion.ingestArticles();
    
  } catch (error) {
    console.error('Ingestion process failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().then(() => {
    console.log('Process completed');
    process.exit(0);
  }).catch(error => {
    console.error('Process failed:', error);
    process.exit(1);
  });
}

module.exports = NewsIngestion;