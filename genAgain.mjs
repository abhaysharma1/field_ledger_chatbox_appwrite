import { create } from '@storacha/client';
import { StoreFs } from '@storacha/client/stores/fs';
import { resolve } from 'path';

// Pick a location to persist the store
const storePath = resolve('./storcha-keystore.json');
const store = new StoreFs(storePath);

// Create client with file store
const client = await create({ store });

// If not already logged in, run this once:
// await client.login("time.atulya@gmail.com");

const spaces = client.spaces();
if (!spaces.length) {
  console.error('⚠️ No spaces found. Run login first with this same script.');
  process.exit(1);
}

const space = spaces[0];
await client.setCurrentSpace(space.did());

console.log('ℹ️ Using space:', space.did());

// Dump the keystore to JSON
const stateJSON = store.dump();

// Encode to base64 for Appwrite env var
const stateBase64 = Buffer.from(JSON.stringify(stateJSON)).toString('base64');

console.log('\n🚀 Copy this and save as STORCHA_STATE in Appwrite env:\n');
console.log(stateBase64);
