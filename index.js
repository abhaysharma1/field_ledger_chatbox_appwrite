const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async function (context) {
  try {
    // 🔎 Fix: use bodyRaw instead of payload
    const raw = context.req.bodyRaw || '{}';
    context.log('📩 Raw body:', raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = {};
    }

    const messages = parsed.messages;
    context.log('📦 Parsed messages:', JSON.stringify(messages));

    if (!messages || !messages.length) {
      context.log('⚠️ No messages received.');
      return context.res.send({
        response: JSON.stringify({
          reply: { role: 'assistant', content: '⚠️ No messages received.' },
        }),
      });
    }

    // 🔮 Ask OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });

    const replyMsg = completion.choices?.[0]?.message?.content || '';
    context.log('✅ OpenAI reply:', replyMsg);

    return context.res.send({
      response: JSON.stringify({
        reply: { role: 'assistant', content: replyMsg },
      }),
    });
  } catch (error) {
    context.error('❌ Function failed:', error);
    return context.res.send({
      response: JSON.stringify({
        reply: { role: 'assistant', content: `⚠️ Error: ${error.message}` },
      }),
    });
  }
};
