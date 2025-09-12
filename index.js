const { Configuration, OpenAIApi } = require("openai");

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

module.exports = async function (req, res) {
  try {
    // ✅ Set CORS headers to allow all origins
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow access from any URL
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Appwrite-Project, X-Appwrite-Dev-Key');
    // Do NOT set Access-Control-Allow-Credentials if you use '*'

    // ✅ Handle preflight requests
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

    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const reply = {
      role: "assistant",
      content: completion.data.choices[0].message.content,
    };

    log(JSON.stringify({ reply }));

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
