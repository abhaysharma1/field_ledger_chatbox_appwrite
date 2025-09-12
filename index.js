const { Configuration, OpenAIApi } = require("openai");

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

module.exports = async function (req, res) {
  try {
    const { messages } = JSON.parse(req.payload || "{}");

    if (!messages || !messages.length) {
      return res.json({
        response: JSON.stringify({ reply: { role: "assistant", content: "⚠️ No messages received." } })
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

    return res.json({ response: JSON.stringify({ reply }) });
  } catch (error) {
    return res.json({
      response: JSON.stringify({ reply: { role: "assistant", content: `⚠️ Error: ${error.message}` } })
    });
  }
};
