// netlify/functions/nano-edit.js
// Универсальный edit: mode=replace|insert|remove
// Вход: { image, insert?, target?, bbox?, prompt?, mode? }
// image/insert могут быть dataURL | чистый base64 | https URL
// Требуются ENV: NANO_API_URL, NANO_API_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { mode = 'replace', image, insert, image_url, insert_url, target, bbox, prompt } = body;

    if (!image && !image_url) return json(400, { error: 'Missing image' });
    if (!['replace','insert','remove'].includes(String(mode))) {
      return json(400, { error: 'mode must be replace | insert | remove' });
    }

    const img = await loadAsInlineData(image || image_url);
    const ins = insert || insert_url ? await loadAsInlineData(insert || insert_url) : null;

    const instruction = buildInstruction({ mode, target, bbox, prompt, hasInsert: !!ins });

    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: instruction },
          { inlineData: { mimeType: img.mime, data: img.base64 } },
          ...(ins ? [
            { text: "Use the following reference image for the inserted/replaced subject:" },
            { inlineData: { mimeType: ins.mime, data: ins.base64 } }
          ] : [])
        ]
      }],
      generationConfig: {
        temperature: 0.3
      }
    };

    const url = `${process.env.NANO_API_URL}${process.env.NANO_API_URL.includes('?') ? '&':'?'}key=${process.env.NANO_API_KEY}`;
    const res = await withRetry(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }), { tries: 4, baseDelayMs: 800 });

    const j = await res.json();

    const out = pickInlineImage(j);
    if (!out) {
      return json(502, { error: 'No image in Gemini response', raw: j });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ ok: true, result: { mime: out.mime, base64: out.base64 } })
    };

  } catch (e) {
    return json(500, { error: String(e && e.message || e) });
  }
};

// ---------- helpers ----------

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(obj)
  };
}

async function loadAsInlineData(input) {
  // dataURL: data:image/png;base64,....
  if (typeof input === 'string' && input.startsWith('data:')) {
    const m = input.match(/^data:([^;]+);base64,(.+)$/);
    const mime = m?.[1] || 'image/png';
    const base64 = m?.[2] || input.split(',')[1];
    if (!base64) throw new Error('Bad dataURL');
    return { mime, base64 };
  }
  // чистый base64 (грубая эвристика)
  if (typeof input === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(input.slice(0, 200)) && !/^https?:\/\//i.test(input)) {
    return { mime: 'image/png', base64: input.replace(/\r?\n/g,'') };
  }
  // URL → скачать сервером
  if (typeof input === 'string' && /^https?:\/\//i.test(input)) {
    const r = await fetch(input);
    if (!r.ok) throw new Error(`fetch ${r.status} for ${input}`);
    const ct = r.headers.get('content-type') || 'image/png';
    const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
    return { mime: ct, base64: b64 };
  }
  throw new Error('Unsupported image input');
}

function buildInstruction({ mode, target, bbox, prompt, hasInsert }) {
  const lines = [];
  lines.push("You are a professional, precise visual editor. Edit the FIRST image ONLY.");
  lines.push(`Mode: ${mode}.`);
  if (target) lines.push(`Target object/person: ${target}.`);
  if (bbox && Number.isFinite(bbox.x) && Number.isFinite(bbox.y) && Number.isFinite(bbox.w) && Number.isFinite(bbox.h)) {
    lines.push(`Restrict edits to the bounding box: x=${bbox.x}, y=${bbox.y}, w=${bbox.w}, h=${bbox.h}. Do not alter pixels outside this box.`);
  }
  if (mode === 'replace' || mode === 'insert') {
    if (hasInsert) {
      lines.push("Use the SECOND image as the visual reference for identity/appearance (face, hair, clothing as applicable).");
    } else {
      lines.push("There is no reference image provided. Perform the operation based on the instruction text.");
    }
    lines.push("Match perspective, lighting, color temperature, grain/noise and shadowing to blend seamlessly.");
  }
  if (mode === 'remove') {
    lines.push("Remove the target cleanly and realistically, reconstructing the background with inpainting. No artifacts.");
  }
  lines.push("Keep all non-target areas intact.");
  if (prompt) lines.push(String(prompt));
  lines.push("Output: return ONLY the final edited image as inline binary. PNG format preferred.");
  return lines.join('\n');
}

async function withRetry(fn, { tries = 3, baseDelayMs = 700 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (!r.ok) {
        // retry on 429/5xx
        if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
          await delay(baseDelayMs * Math.pow(2, i) + jitter(200));
          last = new Error(`HTTP ${r.status}`);
          continue;
        }
        const txt = await r.text().catch(()=> '');
        throw new Error(`HTTP ${r.status} ${txt}`);
      }
      return r;
    } catch (e) {
      last = e;
      await delay(baseDelayMs * Math.pow(2, i) + jitter(200));
    }
  }
  throw last || new Error('retry failed');
}

function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }
function jitter(n){ return Math.floor(Math.random()*n); }

function pickInlineImage(resp) {
  const cands = resp?.candidates || [];
  for (const c of cands) {
    const parts = c?.content?.parts || [];
    for (const p of parts) {
      if (p?.inlineData?.data) {
        return { mime: p.inlineData.mimeType || 'image/png', base64: p.inlineData.data };
      }
    }
  }
  return null;
}
