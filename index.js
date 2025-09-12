// index.js (CommonJS) - Appwrite-ready
const dotenv = require('dotenv');
dotenv.config();

const OpenAI = require('openai');
const QRCode = require('qrcode');
const nacl = require('tweetnacl');

// Use global fetch if available (Node 18+). Otherwise fall back to node-fetch.
let fetchFn = global.fetch;
try {
  if (!fetchFn) fetchFn = require('node-fetch');
} catch (e) {}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COINGECKO_ETH_PRICE_API =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

function base64ToUint8(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
function uint8ToBase64(u8) {
  return Buffer.from(u8).toString('base64');
}

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

    // 1) Ask ChatGPT to extract product JSON (force JSON)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract clean product details as JSON. Only output JSON with keys: name, description, price (USD), origin, batch.',
        },
        ...messages,
      ],
    });

    const replyMsg = completion.choices?.[0]?.message?.content;
    if (!replyMsg) throw new Error('No content returned from OpenAI');

    let product;
    try {
      product = JSON.parse(replyMsg);
    } catch (e) {
      throw new Error('AI did not return valid JSON: ' + replyMsg);
    }

    // 2) Add timestamp + convert USD -> ETH
    const timestamp = new Date().toISOString();
    product.timestamp = timestamp;

    try {
      const cgResp = await fetchFn(COINGECKO_ETH_PRICE_API);
      const cgJson = await cgResp.json();
      const ethUsd = cgJson?.ethereum?.usd;
      const priceNum = parseFloat(product.price);
      product.price_in_eth =
        !isNaN(priceNum) && ethUsd ? +(priceNum / ethUsd).toFixed(6) : null;
    } catch {
      product.price_in_eth = null;
    }

    // 3) Upload JSON to Pinata (pinJSONToIPFS)
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_SECRET = process.env.PINATA_SECRET_API_KEY;
    if (!PINATA_API_KEY || !PINATA_SECRET) {
      throw new Error(
        'Pinata API keys not found. Set PINATA_API_KEY & PINATA_SECRET_API_KEY in env.'
      );
    }

    const pinRes = await fetchFn(
      'https://api.pinata.cloud/pinning/pinJSONToIPFS',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET,
        },
        body: JSON.stringify({
          pinataContent: product,
          pinataOptions: { cidVersion: 1 },
        }),
      }
    );

    const pinJson = await pinRes.json();
    if (!pinRes.ok) {
      throw new Error('Pinata error: ' + JSON.stringify(pinJson));
    }

    const cid = pinJson.IpfsHash;
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;

    // 4) Generate QR code (data URL)
    const qrDataUrl = await QRCode.toDataURL(gatewayUrl);

    // 5) Create cryptographic proof over (cid + timestamp) using Ed25519
    const proofPayload = { cid, timestamp };
    const proofMessage = JSON.stringify(proofPayload);

    // load or generate key
    let publicKeyBase64;
    let signatureBase64;
    const rawPriv = (process.env.PROOF_PRIVATE_KEY || '').trim();

    if (rawPriv) {
      // Accept seed (32 bytes) or secretKey (64 bytes) base64
      const sk = base64ToUint8(rawPriv);
      let secretKey;
      let publicKey;
      if (sk.length === 64) {
        secretKey = sk;
        publicKey = sk.slice(32);
      } else if (sk.length === 32) {
        const kp = nacl.sign.keyPair.fromSeed(sk);
        secretKey = kp.secretKey;
        publicKey = kp.publicKey;
      } else {
        throw new Error(
          'PROOF_PRIVATE_KEY must be base64 of 32-byte seed or 64-byte secretKey'
        );
      }
      const sig = nacl.sign.detached(Buffer.from(proofMessage), secretKey);
      signatureBase64 = uint8ToBase64(sig);
      publicKeyBase64 = uint8ToBase64(publicKey);
    } else {
      // generate ephemeral keypair (useful for quick dev/testing)
      const kp = nacl.sign.keyPair();
      const sig = nacl.sign.detached(Buffer.from(proofMessage), kp.secretKey);
      signatureBase64 = uint8ToBase64(sig);
      publicKeyBase64 = uint8ToBase64(kp.publicKey);
      console.log(
        '⚠️ WARNING: No PROOF_PRIVATE_KEY set. Generated ephemeral keypair. Public key:',
        publicKeyBase64
      );
    }

    const proof = {
      payload: proofPayload,
      signature: signatureBase64,
      signer_public_key: publicKeyBase64,
      algo: 'ed25519+base64',
    };

    // optional: pin proof receipt as JSON (commented out, enable if desired)
    // await fetchFn("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json", pinata_api_key: PINATA_API_KEY, pinata_secret_api_key: PINATA_SECRET },
    //   body: JSON.stringify({ pinataContent: { productCID: cid, proof } }),
    // });

    // 6) Return to caller
    return res.json({
      response: JSON.stringify({
        product,
        cid,
        gatewayUrl,
        qrDataUrl,
        proof,
        reply: { role: 'assistant', content: '✅ Stored on IPFS and signed.' },
      }),
    });
  } catch (error) {
    return res.json({
      response: JSON.stringify({
        reply: { role: 'assistant', content: `⚠️ Error: ${error.message}` },
      }),
    });
  }
};
