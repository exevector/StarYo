// netlify/functions/nano-remove.js
const API_URL =
  process.env.NANO_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent";
const API_KEY = process.env.NANO_API_KEY; // Твой Google API key

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  try {
    const { image, prompt = "Remove the background and output PNG with transparency.", strength = 0.85 } =
      JSON.parse(event.body || "{}");
    if (!image) throw new Error("MISSING_IMAGE");

    // 1) Скачиваем исходное изображение и кодируем в base64
    const imgRes = await fetch(image, { headers: { Range: "bytes=0-" } });
    if (!imgRes.ok) throw new Error(`IMAGE_FETCH_${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const mime = guessMime(image) || imgRes.headers.get("content-type") || "image/jpeg";
    const b64 = buf.toString("base64");

    // 2) Готовим запрос к Gemini 2.5 Flash Image (aka Nano Banana)
    if (!API_KEY) throw new Error("MISSING_GEMINI_API_KEY");

    const body = {
      contents: [
        {
          parts: [
            { text: `${prompt}\nstrength=${strength}` },
            { inline_data: { mime_type: mime, data: b64 } }, // исходник
          ],
        },
      ],
    };

    const r = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY, // В Gemini ключ передаётся так
      },
      body: JSON.stringify(body),
    });

    // 3) Читаем ответ: ищем inlineData (PNG base64) в первой кандидатуре
    const tx = await r.text();
    if (!r.ok) {
      return okFallback(image, prompt, strength, `GEMINI_STATUS_${r.status}`, tx.slice(0, 2000));
    }

    let data;
    try { data = JSON.parse(tx); } catch { return okFallback(image, prompt, strength, "GEMINI_JSON_PARSE", tx.slice(0, 2000)); }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const pngB64 = parts.find(p => p.inline_data)?.inline_data?.data || null;

    if (!pngB64) {
      // Иногда модель отвечает текстом — отдаём фолбэк, но без 500
      const text = parts.find(p => p.text)?.text;
      return okFallback(image, prompt, strength, "GEMINI_NO_IMAGE", text || data);
    }

    // Успех — возвращаем реальную картинку
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...CORS },
      body: JSON.stringify({
        ok: true,
        used: "external",
        model: "gemini-2.5-flash-image-preview",
        result: { base64: pngB64, format: "png" },
      }),
    };
  } catch (e) {
    return okFallback(null, null, null, "EXCEPTION", String(e?.message || e));
  }
};

function okFallback(image, prompt, strength, note, extra) {
  // Прозрачная 1×1 PNG — чтобы фронт не падал
  const tiny =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAF7QJ6x4i4VwAAAABJRU5ErkJggg==";
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", ...CORS },
    body: JSON.stringify({
      ok: true,
      used: "stub",
      note,
      echo: { image, prompt, strength },
      extra,
      result: { base64: tiny, format: "png" },
    }),
  };
}

function guessMime(url) {
  const u = url.toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  return null;
}
