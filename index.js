const { Configuration, OpenAIApi } = require('openai');
const fetch = require('node-fetch');
const Client = require('@storacha/client');
const Delegation = require('@storacha/client/delegation');

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

const COINGECKO_ETH_PRICE_API =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

module.exports = async function (req, res) {
  try {
    const { messages } = JSON.parse(req.payload || '{}');

    if (!messages || !messages.length) {
      return res.json({
        response: JSON.stringify({
          reply: { role: 'assistant', content: '⚠️ No messages received.' },
        }),
      });
    }

    // 1️⃣ Extract product JSON
    let product;
    const completion = await openai.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Extract clean product details in JSON. Only output JSON with keys: name, description, price (USD), origin, batch.',
        },
        ...messages,
      ],
    });

    try {
      product = JSON.parse(completion.data.choices[0].message.content);
    } catch {
      throw new Error('AI response was not valid JSON');
    }

    // 2️⃣ Add timestamp + ETH conversion
    product.timestamp = new Date().toISOString();
    try {
      const resp = await fetch(COINGECKO_ETH_PRICE_API);
      const ethPriceUSD = (await resp.json()).ethereum.usd;
      const priceNum = parseFloat(product.price);
      if (!isNaN(priceNum)) {
        product.price_in_eth = +(priceNum / ethPriceUSD).toFixed(6);
      } else {
        product.price_in_eth = null;
      }
    } catch {
      product.price_in_eth = null;
    }

    // 3️⃣ Storcha: parse UCAN proof from env
    const proofBytes = Buffer.from(process.env.STORCHA_PROOF, 'base64');
    const delegation = await Delegation.extract(proofBytes);
    if (!delegation.ok) {
      throw new Error('Failed to parse Storcha proof: ' + delegation.error);
    }

    const client = await Client.create();
    const space = await client.addSpace(delegation.ok);
    client.setCurrentSpace(space.did());

    // 4️⃣ Upload product JSON
    const blob = new Blob([JSON.stringify(product)], {
      type: 'application/json',
    });
    const cid = (await client.uploadFile(blob)).toString();

    // 5️⃣ Build gateway URL
    const gatewayUrl = `https://${cid}.ipfs.storacha.link`;

    return res.json({
      response: JSON.stringify({
        product,
        cid,
        gatewayUrl,
        reply: {
          role: 'assistant',
          content: '✅ Product stored successfully on Storcha.',
        },
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
