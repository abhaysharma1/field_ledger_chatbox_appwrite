const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async function (req, res) {
  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Appwrite-Project, X-Appwrite-Dev-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const { messages } = JSON.parse(req.payload || "{}");

    if (!messages || !messages.length) {
      return res.json({
        response: JSON.stringify({
          reply: { role: "assistant", content: "⚠️ No messages received." }
        })
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const reply = {
      role: "assistant",
      content: completion.choices[0].message.content,
    };

    return res.json({
      response: JSON.stringify({ reply })
    });

  } catch (error) {
    console.error("Function error:", error);
    return res.json({
      response: JSON.stringify({
        reply: { role: "assistant", content: `⚠️ Error: ${error.message}` }
      })
    });
  }
};
