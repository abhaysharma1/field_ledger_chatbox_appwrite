const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async function (context) {
  try {
    const { payload } = context.req;
    context.log('📩 Raw payload:', payload);

    const { messages } = JSON.parse(payload || '{}');
    context.log('📦 Parsed messages:', JSON.stringify(messages));

    if (!messages || !messages.length) {
      context.log('⚠️ No messages received in payload.');
      return context.res.send({
        response: JSON.stringify({
          reply: { role: 'assistant', content: '⚠️ No messages received.' },
        }),
      });
    }

    // 🔮 Call OpenAI
    context.log('🤖 Sending to OpenAI:', JSON.stringify(messages));
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
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
