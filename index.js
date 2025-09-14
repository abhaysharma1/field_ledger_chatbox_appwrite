// index.js (Appwrite Function - CommonJS)
const dotenv = require('dotenv');
dotenv.config();

const OpenAI = require('openai');
const QRCode = require('qrcode');

let fetchFn = global.fetch;
try {
  if (!fetchFn) fetchFn = require('node-fetch');
} catch (e) {}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

const CID_REGEX = /^[a-zA-Z0-9]{46,59}$/;

// Case: Verify a product by CID
if (parsed.mode === 'verify' && parsed.cid && CID_REGEX.test(parsed.cid)) {
  const cid = parsed.cid;
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  try {
    const resp = await fetchFn(url);
    const product = await resp.json();

    return context.res.send({
      response: JSON.stringify({
        product,
        cid,
        gatewayUrl: url,
        reply: {
          role: 'assistant',
          content: `✅ Verified product: "${product.name}", ₹${product.price}, origin: ${product.origin}, batch: ${product.batch}\n\n🔗 View on IPFS: ${url}`,
        },
      }),
    });
  } catch (e) {
    return context.res.send({
      response: JSON.stringify({
        reply: {
          role: 'assistant',
          content: `⚠️ Could not fetch data for CID ${cid}`,
        },
      }),
    });
  }
}

// --- Helpers ---
async function uploadToPinata(content) {
  const res = await fetchFn('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_API_KEY,
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataOptions: { cidVersion: 1 },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Pinata error: ' + JSON.stringify(json));
  return json.IpfsHash;
}

async function fetchFromPinata(cid) {
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error('Failed to fetch CID from Pinata');
  return await res.json();
}

async function generateQR(gatewayUrl) {
  return await QRCode.toDataURL(gatewayUrl);
}

// --- Main ---
module.exports = async function (context) {
  try {
    const raw = context.req.bodyRaw || '{}';
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    const { mode, product, cid, updates, messages } = payload;

    // ---------- CASE 1: Form Register
    if (mode === 'form_register' && product) {
      const enriched = { ...product, timestamp: new Date().toISOString() };
      const newCid = await uploadToPinata(enriched);
      const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${newCid}`;
      const qrDataUrl = await generateQR(gatewayUrl);

      return context.res.send({
        response: JSON.stringify({
          cid: newCid,
          gatewayUrl,
          qrDataUrl,
          product: enriched,
          reply: { role: 'assistant', content: '✅ Stored on Pinata.' },
        }),
      });
    }

    // ---------- CASE 2: Register (chat flow with product JSON)
    if (mode === 'register' && product) {
      const enriched = { ...product, timestamp: new Date().toISOString() };
      const newCid = await uploadToPinata(enriched);
      const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${newCid}`;
      const qrDataUrl = await generateQR(gatewayUrl);

      return context.res.send({
        response: JSON.stringify({
          cid: newCid,
          gatewayUrl,
          qrDataUrl,
          product: enriched,
          reply: {
            role: 'assistant',
            content: '✅ Product registered on IPFS.',
          },
        }),
      });
    }

    // ---------- CASE 3: Verify CID
    if (mode === 'verify' && cid && CID_REGEX.test(cid)) {
      try {
        const productData = await fetchFromPinata(cid);

        return context.res.send({
          response: JSON.stringify({
            product: productData,
            cid,
            gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
            reply: {
              role: 'assistant',
              content: `✅ Found product: ${
                productData.name || 'N/A'
              }, price: ₹${productData.price || 'N/A'}, origin: ${
                productData.origin || 'N/A'
              }.`,
            },
          }),
        });
      } catch (err) {
        return context.res.send({
          response: JSON.stringify({
            reply: {
              role: 'assistant',
              content: `⚠️ Could not fetch data for CID ${cid}`,
            },
          }),
        });
      }
    }

    // ---------- CASE 4: Update CID
    if (mode === 'update' && cid && updates) {
      try {
        const old = await fetchFromPinata(cid);
        const newProduct = {
          ...old,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        const newCid = await uploadToPinata(newProduct);
        const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${newCid}`;
        const qrDataUrl = await generateQR(gatewayUrl);

        return context.res.send({
          response: JSON.stringify({
            cid: newCid,
            gatewayUrl,
            qrDataUrl,
            product: newProduct,
            reply: {
              role: 'assistant',
              content: `✅ Product updated. New CID: ${newCid}`,
            },
          }),
        });
      } catch (err) {
        return context.res.send({
          response: JSON.stringify({
            reply: {
              role: 'assistant',
              content: `⚠️ Update failed: ${err.message}`,
            },
          }),
        });
      }
    }

    // ---------- FALLBACK: ChatGPT conversation
    if (messages && messages.length) {
      const systemPrompt =
        'You are FieldLedger AI Assistant. Help farmers register products naturally. ' +
        'Required fields: name, description, price (INR), origin, batch. ' +
        'If some fields are missing, ask step by step. ' +
        '⚠️ When all fields are collected, output ONLY the JSON object, no extra text, no markdown. ' +
        'Format: {"name":"","description":"","price":"","origin":"","batch":""}. ' +
        'Do not include explanations or code blocks.';

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      });

      const replyMsg = completion.choices?.[0]?.message?.content?.trim() || '';

      // Try extracting JSON from reply (even if wrapped in code/text)
      let product = null;
      try {
        const match = replyMsg.match(/\{[\s\S]*\}/);
        if (match) {
          const candidate = JSON.parse(match[0]);
          if (
            candidate.name &&
            candidate.description &&
            candidate.price &&
            candidate.origin &&
            candidate.batch
          ) {
            product = candidate;
          }
        }
      } catch {}

      // If product JSON found → store on Pinata
      if (product) {
        const enriched = { ...product, timestamp: new Date().toISOString() };
        const newCid = await uploadToPinata(enriched);
        const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${newCid}`;
        const qrDataUrl = await generateQR(gatewayUrl);

        return context.res.send({
          response: JSON.stringify({
            cid: newCid,
            gatewayUrl,
            qrDataUrl,
            product: enriched,
            reply: { role: 'assistant', content: '✅ Product stored on IPFS.' },
          }),
        });
      }

      // Otherwise → return normal reply
      return context.res.send({
        response: JSON.stringify({
          reply: { role: 'assistant', content: replyMsg },
        }),
      });
    }

    // ---------- No mode / no messages
    return context.res.send({
      response: JSON.stringify({
        reply: {
          role: 'assistant',
          content: '⚠️ No valid mode or data provided.',
        },
      }),
    });
  } catch (error) {
    return context.res.send({
      response: JSON.stringify({
        reply: { role: 'assistant', content: `⚠️ Error: ${error.message}` },
      }),
    });
  }
};
