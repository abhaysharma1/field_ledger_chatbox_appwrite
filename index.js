const dotenv = require('dotenv');
dotenv.config();

const OpenAI = require('openai');
const QRCode = require('qrcode');
const nacl = require('tweetnacl');

let fetchFn = global.fetch;
try {
  if (!fetchFn) fetchFn = require('node-fetch');
} catch (e) {}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async function (context) {
  try {
    const { payload } = context.req;
    const { messages } = JSON.parse(payload || '{}');

    if (!messages || !messages.length) {
      return context.res.send({
        response: JSON.stringify({
          reply: { role: 'assistant', content: '⚠️ No messages received.' },
        }),
      });
    }

    // 🔮 Ask ChatGPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract clean product details as JSON. Only output JSON with keys: name, description, price (USD), origin, batch.',
        },
        ...messages,
      ],
    });

    const replyMsg = completion.choices?.[0]?.message?.content;
    if (!replyMsg) throw new Error('No reply generated');

    // Just return reply for chatbot now
    return context.res.send({
      response: JSON.stringify({
        reply: { role: 'assistant', content: replyMsg },
      }),
    });
  } catch (error) {
    return context.res.send({
      response: JSON.stringify({
        reply: {
          role: 'assistant',
          content: `⚠️ Error: ${error.message}`,
        },
      }),
    });
  }
};
