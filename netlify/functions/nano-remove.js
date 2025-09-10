// netlify/functions/nano-remove.js
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors };
  }

  try {
    const { image, prompt, strength } = JSON.parse(event.body || '{}');
    if (!image) throw new Error('MISSING_IMAGE');

    // Мини-проверка доступности картинки (GET с Range, чтобы почти ничего не качать)
    let reach = null;
    try {
      const r = await fetch(image, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' }
      });
      reach = { ok: r.ok, status: r.status, url: r.url };
    } catch (e) {
      reach = { ok: false, error: String(e) };
    }

    // Прозрачная PNG 1x1 — заглушка
    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAF7QJ6x4i4VwAAAABJRU5ErkJggg==';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        ok: true,
        echo: { image, prompt, strength },
        reach,
        result: { base64: tinyPngBase64, format: 'png' }
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({ error: 'INTERNAL', message: String(err?.message || err) })
    };
  }
};
