// index.js (Appwrite Function, CommonJS)
const dotenv = require('dotenv');
dotenv.config();

const OpenAI = require('openai');
const QRCode = require('qrcode');
const nacl = require('tweetnacl');
const sdk = require('node-appwrite');

let fetchFn = global.fetch;
try {
  if (!fetchFn) fetchFn = require('node-fetch');
} catch (e) {}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 Appwrite client
const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT) // e.g. "https://cloud.appwrite.io/v1"
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new sdk.Databases(client);

// Put your IDs in env
const DB_ID = process.env.APPWRITE_DB_ID;
const PRODUCTS_COLLECTION_ID = process.env.APPWRITE_PRODUCTS_COLLECTION_ID;
const CHATLOGS_COLLECTION_ID = process.env.APPWRITE_CHATLOGS_COLLECTION_ID;

// Helpers
const CID_REGEX = /^[a-zA-Z0-9]{46,59}$/;

function base64ToUint8(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
function uint8ToBase64(u8) {
  return Buffer.from(u8).toString('base64');
}

async function uploadToPinata(content) {
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
        pinataContent: content,
        pinataOptions: { cidVersion: 1 },
      }),
    }
  );
  const pinJson = await pinRes.json();
  if (!pinRes.ok) throw new Error('Pinata error: ' + JSON.stringify(pinJson));
  return pinJson.IpfsHash;
}

async function fetchFromPinata(cid) {
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  const resp = await fetchFn(url);
  if (!resp.ok) throw new Error('Failed to fetch CID from Pinata');
  return await resp.json();
}

async function generateProof(cid, product) {
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
    console.log('⚠️ Ephemeral key used. Public key:', publicKeyBase64);
  }

  const proof = {
    payload: proofPayload,
    signature: signatureBase64,
    signer_public_key: publicKeyBase64,
    algo: 'ed25519+base64',
  };

  return { gatewayUrl, qrDataUrl, proof };
}

// Save product snapshot
async function saveProduct(cid, product) {
  return await databases.createDocument(
    DB_ID,
    PRODUCTS_COLLECTION_ID,
    'unique()',
    {
      cid,
      product,
      createdAt: new Date().toISOString(),
    }
  );
}

// Save chat logs
async function saveChatLogs(cid, messages) {
  return await databases.createDocument(
    DB_ID,
    CHATLOGS_COLLECTION_ID,
    'unique()',
    {
      cid,
      messages: messages || [],
      createdAt: new Date().toISOString(),
    }
  );
}

// Main entry
module.exports = async function (context) {
  try {
    const raw = context.req.bodyRaw || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const { mode, cid, product, updates, messages } = parsed;

    // 🟢 REGISTER
    if (mode === 'register' && product) {
      const enriched = { ...product, timestamp: new Date().toISOString() };
      const newCid = await uploadToPinata(enriched);
      const { gatewayUrl, qrDataUrl, proof } = await generateProof(
        newCid,
        enriched
      );

      await saveProduct(newCid, enriched);
      await saveChatLogs(newCid, messages);

      return context.res.send({
        response: JSON.stringify({
          product: enriched,
          cid: newCid,
          gatewayUrl,
          qrDataUrl,
          proof,
          reply: {
            role: 'assistant',
            content: '✅ Product registered on IPFS.',
          },
        }),
      });
    }

    // 🟢 VERIFY
    if (mode === 'verify' && cid && CID_REGEX.test(cid)) {
      try {
        const productData = await fetchFromPinata(cid);

        await saveChatLogs(cid, messages);

        return context.res.send({
          response: JSON.stringify({
            product: productData,
            cid,
            gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
            reply: {
              role: 'assistant',
              content: `✅ Found product: ${productData.name}, price: ₹${productData.price}, origin: ${productData.origin}, batch: ${productData.batch}.`,
            },
          }),
        });
      } catch {
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

    // 🟢 UPDATE
    if (mode === 'update' && cid && updates) {
      try {
        const oldData = await fetchFromPinata(cid);
        const newProduct = {
          ...oldData,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const newCid = await uploadToPinata(newProduct);
        const { gatewayUrl, qrDataUrl, proof } = await generateProof(
          newCid,
          newProduct
        );

        await saveProduct(newCid, newProduct);
        await saveChatLogs(newCid, messages);

        return context.res.send({
          response: JSON.stringify({
            product: newProduct,
            cid: newCid,
            gatewayUrl,
            qrDataUrl,
            proof,
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

    // 🟢 FALLBACK: Chat-only
    if (messages && messages.length) {
      const systemPrompt =
        'You are FieldLedger AI Assistant. Farmers register products (name, description, price, origin, batch). Customers verify by CID. Updates create new CID. Save all chats.';
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      });
      const replyMsg =
        completion.choices?.[0]?.message?.content?.trim() || '⚠️ No reply.';

      return context.res.send({
        response: JSON.stringify({
          reply: { role: 'assistant', content: replyMsg },
        }),
      });
    }

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
