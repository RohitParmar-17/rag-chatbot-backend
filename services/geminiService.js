const axios = require('axios');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
    this.maxTokens = 2048;
  }

  // Generate response using RAG context
  async generateResponse(userQuery, context) {
    try {
      const prompt = this.buildRAGPrompt(userQuery, context);
      
      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: this.maxTokens,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text.trim();
      } else {
        throw new Error('Invalid response format from Gemini API');
      }
    } catch (error) {
      console.error('Gemini API error:', error.response?.data || error.message);
      
      // Fallback response
      return "I apologize, but I'm having trouble processing your request right now. Please try again or rephrase your question.";
    }
  }

  // Build RAG prompt with context
  buildRAGPrompt(userQuery, context) {
    return `You are a helpful news chatbot assistant. Answer the user's question based on the provided news context. If the context doesn't contain relevant information, politely say so and provide a general response if possible.

Context from recent news articles:
${context}

User Question: ${userQuery}

Instructions:
- Base your answer primarily on the provided context
- Be concise and informative
- If the context doesn't contain relevant information, acknowledge this
- Maintain a friendly and professional tone
- Cite specific details from the articles when relevant

Response:`;
  }

  // Simple text generation (without RAG context)
  async generateSimpleResponse(text) {
    try {
      const response = await axios.post(
        `${this.baseUrl}?key=${this.apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: text
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: this.maxTokens,
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text.trim();
      } else {
        throw new Error('Invalid response format from Gemini API');
      }
    } catch (error) {
      console.error('Gemini simple generation error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Validate API key
  async validateApiKey() {
    try {
      await this.generateSimpleResponse('Hello');
      return true;
    } catch (error) {
      console.error('Gemini API key validation failed:', error.message);
      return false;
    }
  }

  // Summarize text
  async summarizeText(text, maxLength = 200) {
    try {
      const prompt = `Please summarize the following text in about ${maxLength} words:\n\n${text}`;
      return await this.generateSimpleResponse(prompt);
    } catch (error) {
      console.error('Text summarization failed:', error);
      return text.substring(0, maxLength) + '...';
    }
  }
}

module.exports = GeminiService;