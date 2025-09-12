const { Configuration, OpenAIApi } = require('openai');
const fetch = require('node-fetch');

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

const STORCHA_API = 'https://api.storcha.org/upload';
const STORCHA_KEY = process.env.STORCHA_API_KEY;

// CoinGecko endpoint for price
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

    // Function to fetch ETH price in USD
    async function getEthPriceUSD() {
      const resp = await fetch(COINGECKO_ETH_PRICE_API);
      if (!resp.ok) {
        throw new Error(`CoinGecko API error: ${resp.statusText}`);
      }
      const json = await resp.json();
      if (!json.ethereum || typeof json.ethereum.usd !== 'number') {
        throw new Error('Unexpected format from ETH price API');
      }
      return json.ethereum.usd; // e.g. 1800.23
    }

    // 1️⃣ Extract product JSON from ChatGPT
    let product;
    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      const completion = await openai.createChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an AI that extracts clean product details in JSON. Only output valid JSON with keys: name, description, price (in USD), origin, batch. Do not output any other text.',
          },
          ...messages,
        ],
      });

      const aiOutput = completion.data.choices[0].message.content;

      // Try parse JSON
      try {
        product = JSON.parse(aiOutput);
        // Check required fields
        if (
          typeof product.name === 'string' &&
          typeof product.description === 'string' &&
          (typeof product.price === 'number' ||
            typeof product.price === 'string') &&
          typeof product.origin === 'string' &&
          typeof product.batch === 'string'
        ) {
          break; // valid, exit loop
        } else {
          // Throw to retry
          throw new Error('Missing or invalid product fields');
        }
      } catch (e) {
        if (attempt >= maxAttempts) {
          // If final attempt, respond with error
          return res.json({
            response: JSON.stringify({
              reply: {
                role: 'assistant',
                content: `⚠️ Error parsing product JSON: ${e.message}`,
              },
            }),
          });
        }
        // else retry one more time
      }
    }

    // 2️⃣ Add timestamp
    product.timestamp = new Date().toISOString();

    // 3️⃣ Fetch ETH price and convert product.price → ETH equivalent
    let ethPriceUSD;
    try {
      ethPriceUSD = await getEthPriceUSD();
    } catch (e) {
      // If ETH price API fails, still continue but set ethPriceUSD = null
      ethPriceUSD = null;
    }

    if (ethPriceUSD && typeof product.price === 'number') {
      product.price_in_eth = product.price / ethPriceUSD;
    } else {
      // If price is string, try parse; or if ethPriceUSD unavailable
      const priceNum = parseFloat(product.price);
      if (!isNaN(priceNum) && ethPriceUSD) {
        product.price_in_eth = priceNum / ethPriceUSD;
      } else {
        product.price_in_eth = null; // indicate not available
      }
    }

    // 4️⃣ Upload product JSON to Storcha
    const uploadRes = await fetch(STORCHA_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STORCHA_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(product),
    });

    if (!uploadRes.ok) {
      throw new Error(`Storcha upload failed: ${uploadRes.statusText}`);
    }

    const { cid } = await uploadRes.json();

    // 5️⃣ Return product + CID
    return res.json({
      response: JSON.stringify({
        product,
        cid,
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
