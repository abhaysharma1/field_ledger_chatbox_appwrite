// testc.mjs
import * as pkg from './index.js';
const handler = pkg;

const req = {
  payload: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
};

const res = {
  json: (obj) => {
    console.log('👉 Handler response:');
    console.log(JSON.stringify(obj, null, 2));
  },
};

await handler(req, res);
