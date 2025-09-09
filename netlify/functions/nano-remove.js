// netlify/functions/nano-remove.js
// STUB: возвращает ту же картинку (эха), чтобы пройти CORS/интеграционные тесты.
// Позже заменим на реальный вызов Gemini с правильным payload и mime.

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
  // Информативный GET
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, expects: '{ image (base64), prompt? }' }),
    };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { image, prompt } = JSON.parse(event.body || '{}');
    if (!image) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'image (base64) required' }) };
    }

    // ИМЕННО СЕЙЧАС: просто возвращаем то, что пришло (эха).
    // Это позволит Base44 считать API online и продолжить интеграцию.
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,          // тот же base64
        usedPrompt: prompt || null,
        note: 'stubbed remove (echo)',
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
