require('dotenv').config();
const handler = require('./index.js');
const fetch = require('node-fetch');

async function run() {
  // 1️⃣ Simulated request (like Appwrite would send)
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

  // 2️⃣ Fake response object (captures result)
  const res = {
    json: (obj) => obj,
  };

  // 3️⃣ Run handler
  console.log('🚀 Running index.js handler...');
  const result = await handler(req, res);
  const response = JSON.parse(result.response);

  console.log('\n👉 Function Response:');
  console.log(JSON.stringify(response, null, 2));

  // 4️⃣ Check CID
  if (!response.cid) {
    console.error('\n❌ No CID returned, upload failed.');
    return;
  }

  // 5️⃣ Fetch back from Storcha
  console.log('\n🌍 Fetching data back from Storcha Gateway...');
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
