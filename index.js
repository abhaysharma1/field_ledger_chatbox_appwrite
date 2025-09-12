const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

module.exports = async ({ req, res, log, error }) => {
  const app = express();
  
  // Enable CORS
  app.use(cors());
  app.use(express.json());
  
  // Initialize OpenAI
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  // Main endpoint
  app.post('/', async (req, res) => {
    try {
      const { question } = req.body;
      
      if (!question) {
        return res.status(400).json({
          error: 'Question is required'
        });
      }
      
      log('User question:', question);
      
      // Get AI response
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: question }],
        max_tokens: 200
      });
      
      const answer = completion.choices[0].message.content;
      
      res.json({
        question: question,
        answer: answer
      });
      
    } catch (err) {
      error('Error:', err.message);
      res.status(500).json({
        error: 'Failed to get AI response'
      });
    }
  });
  
  // Handle the request
  return new Promise((resolve) => {
    const mockReq = {
      method: req.method,
      url: req.url || '/',
      headers: req.headers,
      body: req.body
    };
    
    const mockRes = {
      statusCode: 200,
      headers: {},
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        resolve({
          statusCode: this.statusCode,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }
    };
    
    app.handle(mockReq, mockRes);
  });
};