// netlify/functions/remove-insert.js
// Последовательно вызывает наши же функции: nano-remove -> nano-insert.
// Вход (POST JSON): { sceneImage, personImage, removePrompt?, insertPrompt? }
// base64 без data URI префикса.

const allowOrigin = process.env.ALLOW_ORIGIN || '*';
const cors = {
  'Access-Control-Allow-Origin': allowOrigin,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  // Небезопасные методы блокируем
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        expects: '{ sceneImage, personImage, removePrompt?, insertPrompt? }',
      }),
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { sceneImage, personImage, removePrompt, insertPrompt } = body;

    if (!sceneImage || !personImage) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'sceneImage and personImage (base64) are required' }),
      };
    }

    const base = process.env.URL || `https://${event.headers.host}`;

    // 1) remove
    const rem = await fetch(`${base}/.netlify/functions/nano-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: sceneImage,
        prompt: removePrompt || 'remove the male actor from the cube',
      }),
    });
    if (!rem.ok) throw new Error(`nano-remove failed: ${rem.status} ${await rem.text()}`);
    const remJson = await rem.json();

    // 2) insert
    const ins = await fetch(`${base}/.netlify/functions/nano-insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sceneImage: remJson.image,
        personImage,
        instruction:
          insertPrompt || 'place the person naturally where the actor was, matching lighting and perspective',
      }),
    });
    if (!ins.ok) throw new Error(`nano-insert failed: ${ins.status} ${await ins.text()}`);
    const insJson = await ins.json();

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: insJson.image, steps: ['remove', 'insert'] }),
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
