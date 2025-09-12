const { OpenAI } = require("openai");

exports.main = async function (req, res) {
  try {
    const body = JSON.parse(req.payload || '{}');
    const messages = body.messages;

    if (!messages) {
      return res.json({ error: "Messages missing" });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // or another model you prefer
      messages: messages,
      max_tokens: 500
    });

    const reply = completion.choices[0].message;

    res.json({ reply });
  } catch (error) {
    console.error("ChatGPT error:", error);
    res.json({ error: error.message });
  }
};
