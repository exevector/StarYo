// netlify/functions/nano-remove2.js

exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ ok: true, function: 'nano-remove2', version: 'smoke-1' })
  };
};
