// netlify/functions/nano-remove.js
export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return resp(405, { error: 'POST only' });
    }

    const API_URL = process.env.BASE44_API_URL;   // задал в Netlify
    const API_KEY = process.env.BASE44_API_KEY;   // задал в Netlify

    if (!API_URL) {
      return resp(500, { error: 'MISSING_BASE44_API_URL' });
    }

    const body = JSON.parse(event.body || '{}');
    const { image, image_url, prompt, strength = 0.85 } = body || {};
    if (!image && !image_url) {
      return resp(400, { error: 'image or image_url required' });
    }

    // Проксируем на апстрим Base44 (формат: JSON)
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {})
      },
      body: JSON.stringify({ image, image_url, prompt, strength })
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok) {
      return resp(upstream.status, {
        error: 'UPSTREAM_ERROR',
        status: upstream.status,
        data
      });
    }

    // Нормализуем ответ: пробуем вернуть result.base64, иначе что пришло
    const b64 = data?.result?.base64 || data?.base64 || data?.data || null;
    const result_url = data?.result_url || data?.url || null;

    if (b64) return resp(200, { result: { base64: b64 } });
    if (result_url) return resp(200, { result_url });

    // Если апстрим вернул другой формат — отдаём как есть
    return resp(200, data);
  } catch (e) {
    return resp(500, { error: 'INTERNAL', message: String(e?.message || e) });
  }
};

const resp = (code, obj) => ({
  statusCode: code,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify(obj)
});
