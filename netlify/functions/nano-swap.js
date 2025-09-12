// netlify/functions/nano-swap.js
async function readJSON(req) {
  try { return await req.json(); } catch { return {}; }
}
function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
const toInline = (dataUrlOrB64, mime) => {
  if (!dataUrlOrB64) return null;
  if (dataUrlOrB64.startsWith("data:")) {
    const [, m, b] = dataUrlOrB64.match(/^data:(.+?);base64,(.+)$/) || [];
    return { mime_type: m, data: b };
  }
  return { mime_type: mime || "image/png", data: dataUrlOrB64 };
};

export default async (request, context) => {
  if (request.method !== "POST") {
    return json(400, { ok: false, error: "PATH_NOT_ALLOWED", message: "POST only" });
  }

  const { image, selfie, prompt = "Replace target face in the first image with the face from the selfie. Keep pose, lighting and background. Output PNG." } = await readJSON(request);

  const API_URL = process.env.NANO_API_URL; // e.g. https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent
  const API_KEY = process.env.NANO_API_KEY; // your Gemini key

  if (!API_URL || !API_KEY) {
    return json(500, { ok: false, error: "NANO_MISSING", message: "NANO_API_URL or NANO_API_KEY not set" });
  }
  if (!image || !selfie) {
    return json(400, { ok: false, error: "BAD_INPUT", message: "Need 'image' (dataURL/base64) and 'selfie' (dataURL/base64)" });
  }

  const base = toInline(image);
  const ref  = toInline(selfie);

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: base },
        { inline_data: ref },
      ]
    }]
  };

  try {
    const r = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();

    const b64 =
      data?.candidates?.[0]?.content?.parts?.find(p => p.inline_data)?.inline_data?.data ||
      data?.candidates?.[0]?.content?.parts?.find(p => p.file_data)?.file_data?.data ||
      null;

    return json(200, { ok: true, used: "preview", result: b64 ? { base64: b64, mime: "image/png" } : null, raw: b64 ? undefined : data });
  } catch (e) {
    return json(500, { ok: false, error: "NANO_SWAP_FAIL", message: e.message });
  }
};
