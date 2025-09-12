// test.js
const handler = require('./index.js');

(async () => {
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

  const res = {
    json: (obj) => {
      console.log(
        'Result:\n',
        JSON.stringify(JSON.parse(obj.response), null, 2)
      );
      return obj;
    },
  };

  await handler(req, res);
})();
