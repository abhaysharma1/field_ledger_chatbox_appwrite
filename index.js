const OpenAI = require("openai");

// Initialize OpenAI with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async function (req, res) {
  try {
    // -----------------------
    // CORS headers
    // -----------------------
    res.setHeader('Access-Control-Allow-Origin', '*'); // allow all domains
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Appwrite-Project, X-Appwrite-Dev-Key');

    // -----------------------
    // Handle preflight OPTIONS request
    // -----------------------
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // -----------------------
    // Parse payload
    // -----------------------
    let payload = {};
    try {
      payload = JSON.parse(req.payload || "{}");
    } catch (e) {
      return res.end(JSON.stringify({
        response: JSON.stringify({
          reply: { role: "assistant", content: "⚠️ Invalid JSON payload." }
        })
      }));
    }

    const { messages } = payload;

    if (!messages || !messages.length) {
      return res.end(JSON.stringify({
        response: JSON.stringify({
          reply: { role: "assistant", content: "⚠️ No messages received." }
        })
      }));
    }

    // -----------------------
    // Call OpenAI API
    // -----------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const reply = {
      role: "assistant",
      content: completion.choices[0].message.content,
    };

    // -----------------------
    // Send JSON response
    // -----------------------
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ response: JSON.stringify({ reply }) }));

  } catch (error) {
    console.error("Function error:", error);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      response: JSON.stringify({
        reply: { role: "assistant", content: `⚠️ Error: ${error.message}` }
      })
    }));
  }
};
