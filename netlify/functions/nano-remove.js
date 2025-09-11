// netlify/functions/nano-remove.js
export default async function handler(request) {
  // CORS / preflight
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors() });
  }

  const API_URL = process.env.NANO_API_URL;   // напр.: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent
  const API_KEY = process.env.NANO_API_KEY;   // твой Google API key

  if (!API_URL || !API_KEY) {
    return json(500, { ok: false, error: 'MISCONFIG', need: ['NANO_API_URL','NANO_API_KEY'] });
  }

  // читаем вход
  let body = {};
  try { body = await request.json(); } catch {}
  const {
    image,
    prompt = 'Remove the background and output PNG with transparency.',
    strength = 0.85,
  } = body;

  if (!image) return json(400, { ok: false, error: 'MISSING_IMAGE' });

  // скачиваем картинку
  const imgRes = await fetch(image, { headers: { Range: 'bytes=0-' } });
  if (!imgRes.ok) {
    return json(400, { ok: false, error: 'IMAGE_FETCH', status: imgRes.status });
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mime = imgRes.headers.get('content-type') || guessMime(image) || 'image/jpeg';
  const b64  = buf.toString('base64');

  // запрос к Gemini
  const payload = {
    contents: [
      {
        parts: [
          { text: `${prompt}\nstrength=${strength}` },
          { inline_data: { mime_type: mime, data: b64 } },
        ],
      },
    ],
  };

  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY },
    body: JSON.stringify(payload),
  });

  const txt = await r.text();
  if (!r.ok) {
    return json(r.status, { ok: false, error: 'GEMINI_ERROR', detail: txt.slice(0, 2000) });
  }

  let data;
  try { data = JSON.parse(txt); }
  catch { return json(500, { ok: false, error: 'PARSE_ERROR', detail: txt.slice(0, 2000) }); }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const out64 = parts.find(p => p.inline_data)?.inline_data?.data || null;
  const text  = parts.find(p => p.text)?.text;

  if (!out64) {
    return json(200, { ok: true, note: 'NO_IMAGE_FROM_MODEL', modelText: text || null });
  }

  return json(200, { ok: true, model: 'gemini', result: { base64: out64, format: 'png' } });
}

// helpers
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
}
function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}
function guessMime(url) {
  const u = url.toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}
