// netlify/functions/vidu-proxy.js

async function core(request) {
  const VIDU_API_URL = process.env.VIDU_API_URL;   // напр. https://api.vidu.com
  const VIDU_API_KEY = process.env.VIDU_API_KEY;   // твой ключ Vidu

  if (!VIDU_API_URL || !VIDU_API_KEY) {
    return json(500, { ok: false, error: 'VIDU_MISCONFIG', message: 'Missing VIDU_API_URL or VIDU_API_KEY' });
  }

  const { path, method = 'POST', payload } = await readJSON(request);
  if (typeof path !== 'string' || !path.startsWith('/ent/v2/')) {
    return json(400, { ok: false, error: 'PATH_NOT_ALLOWED', message: 'path must start with /ent/v2/' });
  }

  const url = `${VIDU_API_URL.replace(/\/$/, '')}${path}`;
  const headers = {
    'Authorization': `Token ${VIDU_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const opts = { method, headers };
  if (method.toUpperCase() !== 'GET' && payload !== undefined) {
    opts.body = JSON.stringify(payload);
  }

  try {
    const r = await fetch(url, opts);
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : await r.text();
    return json(r.status, { ok: r.ok, status: r.status, data });
  } catch (e) {
    return json(500, { ok: false, error: 'VIDU_PROXY_FAIL', message: e.message });
  }
}

export default async (request, context) => core(request);            // для ESM
export async function handler(event) {                               // fallback для CJS
  const req = new Request('http://local', {
    method: event.httpMethod,
    headers: event.headers,
    body: event.body,
  });
  return core(req);
}

async function readJSON(req) {
  try { const t = await req.text(); return t ? JSON.parse(t) : {}; }
  catch { return {}; }
}
function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
