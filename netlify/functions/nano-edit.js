// netlify/functions/nano-edit.js
// Универсальная функция: mode = "remove" | "insert" | "replace"
// Вход: {
//   mode: "replace",
//   image: <dataURL | http(s) URL>,           // кадр
//   insert?: <dataURL | http(s) URL>,         // селфи/объект для вставки (для insert/replace)
//   target?: "man on the right",              // кого/что удалить/заменить (подсказка модели)
//   bbox?: {x: number, y: number, w: number, h: number}, // необязательный бокс-подсказка
//   prompt?: "…",                             // доп.инструкция (опционально)
// }
export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: cors() });
  }
  if (request.method !== "POST") {
    return json(400, { ok: false, error: "PATH_NOT_ALLOWED", message: "POST only" });
  }

  const API_URL = process.env.NANO_API_URL; // e.g. https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent
  const API_KEY = process.env.NANO_API_KEY; // Google AI key (Gemini)
  if (!API_URL || !API_KEY) {
    return json(500, { ok: false, error: "MISCONFIG", need: ["NANO_API_URL","NANO_API_KEY"] });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const {
    mode = "replace",
    image,
    insert,
    target = "the target object",
    bbox,
    prompt
  } = body || {};

  if (!image) return json(400, { ok: false, error: "MISSING_IMAGE" });
  if ((mode === "insert" || mode === "replace") && !insert) {
    return json(400, { ok: false, error: "MISSING_INSERT", message: "Need 'insert' for insert/replace" });
  }

  try {
    const baseInline   = await toInline(image);
    const insertInline = insert ? await toInline(insert) : null;

    const parts = [];
    // Инструкция для модели
    parts.push({
      text: [
        `Task: ${mode.toUpperCase()} object.`,
        bbox ? `Target box: x=${bbox.x}, y=${bbox.y}, w=${bbox.w}, h=${bbox.h}.` : `Target: ${target}.`,
        mode === "remove"
          ? `Remove ${target} from the scene and plausibly fill the background.`
          : mode === "insert"
          ? `Insert the second image object into the first image ${bbox ? "inside given box" : "near the described target"}; keep perspective and lighting.`
          : `Replace ${target} in the first image with the person/object from the second image; keep pose, lighting and background; preserve other people.` ,
        `Output PNG with transparent pixels only where needed (no extra borders).`,
        prompt ? `Extra: ${prompt}` : ""
      ].filter(Boolean).join(" ")
    });

    // 1-й инпут — исходный кадр
    parts.push({ inline_data: baseInline });
    // 2-й инпут — объект/селфи, если insert/replace
    if (insertInline) parts.push({ inline_data: insertInline });

    const payload = { contents: [{ parts }] };

    const r = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const txt = await r.text();
    if (!r.ok) {
      return json(r.status, { ok: false, error: "GEMINI_ERROR", detail: txt.slice(0, 2000) });
    }
    let data;
    try { data = JSON.parse(txt); }
    catch { return json(500, { ok: false, error: "PARSE_ERROR", detail: txt.slice(0, 2000) }); }

    // Достаём картинку из ответа
    const partsOut = data?.candidates?.[0]?.content?.parts || [];
    const out64 =
      partsOut.find(p => p.inline_data)?.inline_data?.data ||
      partsOut.find(p => p.file_data)?.file_data?.data || null;

    if (!out64) {
      // текст модели (диагностика)
      const note = partsOut.find(p => p.text)?.text || null;
      return json(200, { ok: true, note: "NO_IMAGE_FROM_MODEL", modelText: note, data });
    }

    return json(200, { ok: true, mode, result: { base64: out64, format: "png" } });
  } catch (e) {
    return json(500, { ok: false, error: "EDIT_FAIL", message: String(e?.message || e) });
  }
}

// === helpers ===
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
}
function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}
async function toInline(src) {
  if (typeof src !== "string") throw new Error("Bad image src");
  if (src.startsWith("data:")) {
    const m = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Bad dataURL");
    return { mime_type: m[1], data: m[2] };
  }
  // http(s) URL → fetch → base64
  const res = await fetch(src, { headers: { Range: "bytes=0-" } });
  if (!res.ok) throw new Error(`Fetch image failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || guessMime(src) || "image/jpeg";
  return { mime_type: mime, data: buf.toString("base64") };
}
function guessMime(u) {
  const s = u.toLowerCase();
  if (s.endsWith(".png")) return "image/png";
  if (s.endsWith(".webp")) return "image/webp";
  if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
  return null;
}
