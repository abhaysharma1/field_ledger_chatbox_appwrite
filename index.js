const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

// -----------------------
// Middlewares
// -----------------------
app.use(cors({ origin: "*" })); // Allow all origins
app.use(express.json()); // Parse JSON payloads

// -----------------------
// Initialize OpenAI
// -----------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// -----------------------
// Route for POST /
// -----------------------
app.post("/", async (req, res) => {
  try {
    const { messages } = req.body;

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

    return res.json({ response: JSON.stringify({ reply }) });

  } catch (error) {
    console.error("OpenAI error:", error);
    return res.json({
      response: JSON.stringify({
        reply: { role: "assistant", content: `⚠️ Error: ${error.message}` }
      })
    });
  }
});

// -----------------------
// Start server
// -----------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
