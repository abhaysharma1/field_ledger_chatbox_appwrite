const { Configuration, OpenAIApi } = require("openai");

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

module.exports = async function (req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*'); // or specify your domain instead of '*'
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
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
    return res.json({
      response: JSON.stringify({
        reply: { role: "assistant", content: `⚠️ Error: ${error.message}` }
      })
    });
  }
};
