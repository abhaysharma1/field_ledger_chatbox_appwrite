import OpenAI from 'openai';
import fetch from 'node-fetch';
import { create as createClient } from '@storacha/client';
import * as Delegation from '@ucanto/core/delegation';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const COINGECKO_ETH_PRICE_API =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

// 🔑 Decode UCAN proof into delegation
async function parseDelegationFromProof(base64Proof) {
  const bytes = Buffer.from(base64Proof, 'base64');
  const result = await Delegation.extract(bytes);
  if (!result.ok) {
    throw new Error('Failed to extract delegation: ' + result.error);
  }
  if (!result.ok.length) {
    throw new Error('No delegations found in proof');
  }
  return result.ok[0];
}

// Appwrite-style handler
export default async function handler(req, res) {
  try {
    const { messages } = JSON.parse(req.payload || '{}');

    if (!messages?.length) {
      return res.json({
        response: JSON.stringify({
          reply: { role: 'assistant', content: '⚠️ No messages received.' },
        }),
      });
    }

    // 1️⃣ Ask OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract clean product details in JSON. Only output JSON with keys: name, description, price (USD), origin, batch.',
        },
        ...messages,
      ],
    });

    const replyMsg = completion.choices?.[0]?.message?.content;
    if (!replyMsg) throw new Error('No content returned from OpenAI');

    let product;
    try {
      product = JSON.parse(replyMsg);
    } catch {
      throw new Error('AI did not return valid JSON: ' + replyMsg);
    }

    // 2️⃣ Timestamp + ETH
    product.timestamp = new Date().toISOString();
    try {
      const resp = await fetch(COINGECKO_ETH_PRICE_API);
      const ethPriceUSD = (await resp.json()).ethereum.usd;
      const priceNum = parseFloat(product.price);
      product.price_in_eth = !isNaN(priceNum)
        ? +(priceNum / ethPriceUSD).toFixed(6)
        : null;
    } catch {
      product.price_in_eth = null;
    }

    // 3️⃣ Decode UCAN proof
    const delegation = await parseDelegationFromProof(
      process.env.STORCHA_PROOF
    );
    const client = await createClient();
    const space = await client.addSpace(delegation);
    await client.setCurrentSpace(space.did());

    // 4️⃣ Upload JSON
    const blob = new Blob([JSON.stringify(product)], {
      type: 'application/json',
    });
    const cid = (await client.uploadFile(blob)).toString();
    const gatewayUrl = `https://${cid}.ipfs.storacha.link`;

    // ✅ Return
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
}
