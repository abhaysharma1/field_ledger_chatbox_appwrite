const { OpenAI } = require('openai');
const { NFTStorage, Blob } = require('nft.storage');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const nft = new NFTStorage({
  token: process.env.NFT_STORAGE_API_KEY
});

exports.main = async function (req, res) {
  try {
    const body = JSON.parse(req.payload || '{}');
    const action = body.action;

    if (action === 'chat') {
      const messages = body.messages || [];
      const SYSTEM_PROMPT = `
You are a form assistant for AgriChain that collects farm produce details.
Required fields: farmer_name, farm_id, crop_type, harvest_date, quantity_kg, location, notes (optional).
Ask one question at a time and respond with FORM_COMPLETE and JSON once done.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 500
      });

      const message = response.choices[0].message;
      res.json({ assistant: message });
    }

    else if (action === 'submit') {
      const form = body.form;
      if (!form) {
        return res.json({ error: 'Form data missing' });
      }

      form.created_at = new Date().toISOString();

      const blob = new Blob([JSON.stringify(form)], { type: 'application/json' });
      const cid = await nft.storeBlob(blob);

      res.json({ cid, url: `https://ipfs.io/ipfs/${cid}` });
    }

    else {
      res.json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error(error);
    res.json({ error: error.message });
  }
};
