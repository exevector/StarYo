// netlify/functions/nano-remove.js

const DEFAULT_TIMEOUT_MS = 25000;

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const req = JSON.parse(event.body || '{}');
    const image = req.image;
    const prompt = req.prompt || 'remove';
    const strength = typeof req.strength === 'number' ? req.strength : 0.85;

    // Читаем переменные окружения (заполним на шаге 2, когда будем подключать реальное API)
    const API_URL = process.env.BASE44_REMOVE_URL;   // ← URL реального эндпоинта (Base44/banana/и т.п.)
    const API_KEY = process.env.BASE44_API_KEY;      // ← ключ

    // Хелпер: фоллбэк-ответ, чтобы НЕ отдавать 500
    const fallback = (note, extra = {}) => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        image,
        usedPrompt: prompt,
        strength,
        note,
        ...extra
      })
    });

    // Если нет API-данных — сразу эхо-режим
    if (!API_URL || !API_KEY) {
      return fallback('stubbed remove (no API credentials)');
    }

    // Реальный вызов API с таймаутом и безопасным логированием
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let resp, data;
    try {
      resp = await fetch(API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({ image, prompt, strength })
      });
      data = await resp.json().catch(() => ({}));
    } catch (e) {
      clearTimeout(timer);
      // падать 500 не будем — фоллбэк
      return fallback('stubbed remove (fetch failed)', { error: String(e?.message || e) });
    }

    clearTimeout(timer);

    // Если внешний сервис ответил не 2xx — фоллбэк
    if (!resp.ok) {
      return fallback('stubbed remove (remote non-2xx)', { status: resp.status, data });
    }

    // Удача — отдаём как есть (или оберни под нужный формат)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify(data)
    };

  } catch (err) {
    // Последняя защита — никаких 500
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({ note: 'stubbed remove (exception)', error: String(err?.message || err) })
    };
  }
};
