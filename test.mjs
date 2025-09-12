import 'dotenv/config';
import handler from './index.mjs';
import fetch from 'node-fetch';

function debugProof() {
  if (!process.env.STORCHA_PROOF) {
    console.error('❌ No STORCHA_PROOF found in .env');
    return;
  }

  const base64 = process.env.STORCHA_PROOF.trim();
  const bytes = Buffer.from(base64, 'base64');

  console.log('🔎 Proof debug:');
  console.log('  Base64 length:', base64.length);
  console.log('  Decoded bytes length:', bytes.length);
  console.log('  First 32 bytes (hex):', bytes.slice(0, 32).toString('hex'));
}

async function run() {
  // Debug proof before handler
  debugProof();

  // 1️⃣ Simulated Appwrite request
  const req = {
    payload: JSON.stringify({
      messages: [
        {
          role: 'user',
          content:
            'Product: Wheat, description: Premium quality wheat grain, price 250 USD, origin India, batch 001',
        },
      ],
    }),
  };

  // 2️⃣ Fake response
  const res = {
    json: (obj) => obj,
  };

  // 3️⃣ Run handler
  console.log('\n🚀 Running index.mjs handler...');
  const result = await handler(req, res);
  const response = JSON.parse(result.response);

  console.log('\n👉 Function Response:');
  console.log(JSON.stringify(response, null, 2));

  // 4️⃣ Fetch from Storcha gateway
  if (!response.cid) {
    console.error('\n❌ No CID returned, upload failed.');
    return;
  }

  console.log('\n🌍 Fetching from Storcha Gateway...');
  try {
    const fetched = await fetch(response.gatewayUrl);
    if (!fetched.ok) throw new Error('Gateway fetch failed');
    const data = await fetched.json();

    console.log('\n✅ Retrieved from Storcha:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Retrieval failed:', err.message);
  }
}

run();
