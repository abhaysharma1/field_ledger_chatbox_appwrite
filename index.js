const dotenv = require('dotenv');
dotenv.config();

const OpenAI = require('openai');

// ✅ Initialize OpenAI client with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async function (req, res) {
  try {
    const { messages } = JSON.parse(req.payload || '{}');

    if (!messages || !messages.length) {
      return res.json({
        response: JSON.stringify({
          reply: {
            role: 'assistant',
            content: '⚠️ No messages received.',
          },
        }),
      });
    }

    // 1️⃣ Ask ChatGPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // or "gpt-3.5-turbo"
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const replyMsg = completion.choices?.[0]?.message?.content;
    if (!replyMsg) throw new Error('No reply generated');

    // 2️⃣ Return reply JSON
    return res.json({
      response: JSON.stringify({
        reply: { role: 'assistant', content: replyMsg },
      }),
    });
  } catch (error) {
    return res.json({
      response: JSON.stringify({
        reply: {
          role: 'assistant',
          content: `⚠️ Error: ${error.message}`,
        },
      }),
    });
  }
};
