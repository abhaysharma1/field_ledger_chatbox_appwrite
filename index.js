// index.js (Appwrite function, CommonJS)
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
const COINGECKO_ETH_PRICE_API =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

// CID regex
const CID_REGEX = /^[a-zA-Z0-9]{46,59}$/;

function base64ToUint8(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
function uint8ToBase64(u8) {
  return Buffer.from(u8).toString('base64');
}

module.exports = async function (context) {
  try {
    const raw = context.req.bodyRaw || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const messages = parsed.messages;
    if (!messages || !messages.length) {
      return context.res.send({
        response: JSON.stringify({
          reply: { role: 'assistant', content: '⚠️ No messages received.' },
        }),
      });
    }

    // Get latest user message
    const lastUser = messages.filter((m) => m.role === 'user').pop();
    const lastContent = lastUser?.content?.trim() || '';

    // 🟢 CASE 1: Customer provides a CID → fetch from Pinata
    if (CID_REGEX.test(lastContent)) {
      const cid = lastContent;
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
              content:
                `✅ This product is "${product.name}", price: ₹${product.price}, origin: ${product.origin}, batch: ${product.batch}.\n\n` +
                `📦 Products are cryptographically signed for authenticity, and FieldLedger uses blockchain to give farmers transparency and customers trust.\n\n` +
                `🔗 View on IPFS: ${url}`,
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

    // 🟢 CASE 2: Farmer conversation → call OpenAI with system instructions
    const systemPrompt =
      'You are FieldLedger AI Assistant. You have two roles depending on the type of user: ' +
      '👩‍🌾 For Farmers, Distributors, and Retailers: You are their friendly digital assistant to register agricultural products on the blockchain. ' +
      'Required fields for product registration are: name, description, price (INR), origin, batch. ' +
      'Always talk naturally. If some fields are missing, ask step by step in a conversational way. Example: "Great! What is the product\'s price in INR?" ' +
      'Never make up data yourself. When all fields are collected, output a JSON object only once in this format: ' +
      '{"name": "", "description": "", "price": "", "origin": "", "batch": ""}. ' +
      'After JSON is generated, the backend will store it on IPFS and generate a proof. You just confirm with the farmer that it has been stored. ' +
      '🛒 Customers do not provide product data. Instead, they provide a hash, CID, or scan a QR code. ' +
      'When a CID or hash is given, request the backend to fetch the JSON from IPFS (Pinata). Show them the product details in a clear, friendly format (not raw JSON unless requested). ' +
      'Example: "✅ This product is Organic Apples, price: ₹200, origin: India, batch: A123." ' +
      'After showing the data, explain in simple terms how FieldLedger works: Products are cryptographically signed to ensure authenticity. Blockchain provides transparency for farmers and trust for customers. ' +
      'Encourage questions and chat casually about blockchain or FieldLedger if the customer is curious. Keep your replies short.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    const replyMsg = completion.choices?.[0]?.message?.content?.trim() || '';

    // Detect if AI replied with product JSON
    let product = null;
    if (replyMsg.startsWith('{')) {
      try {
        const candidate = JSON.parse(replyMsg);
        if (
          candidate.name &&
          candidate.description &&
          candidate.price &&
          candidate.origin &&
          candidate.batch
        ) {
          product = candidate;
        }
      } catch {}
    }

    // 🟢 CASE 2A: Normal conversation (no JSON) → return reply
    if (!product) {
      return context.res.send({
        response: JSON.stringify({
          reply: { role: 'assistant', content: replyMsg },
        }),
      });
    }

    // 🟢 CASE 2B: Product JSON → enrich + store
    product.timestamp = new Date().toISOString();

    try {
      const cgResp = await fetchFn(COINGECKO_ETH_PRICE_API);
      const cgJson = await cgResp.json();
      const ethUsd = cgJson?.ethereum?.usd;
      const priceNum = parseFloat(product.price);
      product.price_in_eth =
        !isNaN(priceNum) && ethUsd
          ? +((priceNum / ethUsd) * 83).toFixed(6) // INR conversion rough
          : null;
    } catch {
      product.price_in_eth = null;
    }

    const pinRes = await fetchFn(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY,
        },
        body: JSON.stringify({
          pinataContent: product,
          pinataOptions: { cidVersion: 1 },
        }),
      }
    );
    const pinJson = await pinRes.json();
    if (!pinRes.ok) throw new Error('Pinata error: ' + JSON.stringify(pinJson));

    const cid = pinJson.IpfsHash;
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const qrDataUrl = await QRCode.toDataURL(gatewayUrl);

    const proofPayload = { cid, timestamp: product.timestamp };
    const proofMessage = JSON.stringify(proofPayload);

    let publicKeyBase64, signatureBase64;
    const rawPriv = (process.env.PROOF_PRIVATE_KEY || '').trim();
    if (rawPriv) {
      const sk = base64ToUint8(rawPriv);
      let secretKey, publicKey;
      if (sk.length === 64) {
        secretKey = sk;
        publicKey = sk.slice(32);
      } else if (sk.length === 32) {
        const kp = nacl.sign.keyPair.fromSeed(sk);
        secretKey = kp.secretKey;
        publicKey = kp.publicKey;
      } else {
        throw new Error('PROOF_PRIVATE_KEY must be 32/64-byte base64');
      }
      const sig = nacl.sign.detached(Buffer.from(proofMessage), secretKey);
      signatureBase64 = uint8ToBase64(sig);
      publicKeyBase64 = uint8ToBase64(publicKey);
    } else {
      const kp = nacl.sign.keyPair();
      const sig = nacl.sign.detached(Buffer.from(proofMessage), kp.secretKey);
      signatureBase64 = uint8ToBase64(sig);
      publicKeyBase64 = uint8ToBase64(kp.publicKey);
      context.log('⚠️ Ephemeral key used. Public key:', publicKeyBase64);
    }

    const proof = {
      payload: proofPayload,
      signature: signatureBase64,
      signer_public_key: publicKeyBase64,
      algo: 'ed25519+base64',
    };

    return context.res.send({
      response: JSON.stringify({
        product,
        cid,
        gatewayUrl,
        qrDataUrl,
        proof,
        reply: {
          role: 'assistant',
          content: '✅ Product stored on IPFS and signed.',
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
