import 'dotenv/config';
import { create } from '@storacha/client';
import * as Delegation from '@storacha/client/delegation';

async function run() {
  try {
    // 1️⃣ Load proof
    const proofBytes = Buffer.from(process.env.STORCHA_PROOF, 'base64');

    // 2️⃣ Parse delegation
    const delegation = await Delegation.extract(proofBytes);
    if (!delegation.ok) {
      throw new Error('Failed to parse proof: ' + delegation.error);
    }

    // 3️⃣ Init client with space
    const client = await create();
    const space = await client.addSpace(delegation.ok);
    await client.setCurrentSpace(space.did());

    console.log('✅ Connected to space:', space.did());

    // 4️⃣ Upload test file
    const blob = new Blob(['Hello from Storcha Node test!'], {
      type: 'text/plain',
    });
    const cid = (await client.uploadFile(blob)).toString();

    console.log('✅ File uploaded!');
    console.log('CID:', cid);
    console.log('Gateway:', `https://${cid}.ipfs.storacha.link`);
  } catch (err) {
    console.error('❌ Upload failed:', err.message);
  }
}

run();
