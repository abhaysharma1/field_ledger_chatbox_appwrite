const OpenAI = require('openai');

module.exports = async ({ req, res, log, error }) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.json({ status: 'error', message: 'Question is required' });
    }

    log('User question:', question);

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: question }],
      max_tokens: 200
    });

    const answer = completion.choices[0].message.content;

    return res.json({
      question: question,
      answer: answer
    });

  } catch (err) {
    error('Error:', err.message);
    return res.json({
      status: 'error',
      message: 'Failed to get AI response'
    });
  }
};
