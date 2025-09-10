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

    // --- если заданы переменные окружения — пробуем внешний API ---
    const hasExternal = !!(process.env.NANO_API_URL && process.env.NANO_API_KEY);
    let used = 'stub', external = null;

    if (hasExternal) {
      try {
        const apiRes = await fetch(process.env.NANO_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NANO_API_KEY}`
          },
          body: JSON.stringify({ image, prompt, strength })
        });

        if (!apiRes.ok) throw new Error('NANO_BAD_STATUS_' + apiRes.status);
        const data = await apiRes.json();

        const base64 =
          data?.result?.base64 || data?.base64 || data?.data || null;

        if (!base64) throw new Error('NANO_NO_BASE64');

        used = 'external';
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', ...cors },
          body: JSON.stringify({
            ok: true,
            used,
            result: { base64, format: data?.result?.format || 'png' }
          })
        };
      } catch (e) {
        external = String(e);
        // падаем в заглушку ниже
      }
    }

    // --- заглушка (прозрачная 1×1 PNG) + мини-проверка доступности картинки ---
    let reach = null;
    try {
      const r = await fetch(image, { headers: { Range: 'bytes=0-0' } });
      reach = { ok: r.ok, status: r.status, url: r.url };
    } catch (e) {
      reach = { ok: false, error: String(e) };
    }

    const tinyPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAF7QJ6x4i4VwAAAABJRU5ErkJggg==';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        ok: true,
        used,
        external,      // если внешка упала — увидим причину
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
