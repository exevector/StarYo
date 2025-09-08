// Netlify Function: nano-insert
// Receives a JSON payload with two base64-encoded images (scene and person) and an optional instruction.
// Uses the Gemini API to insert the person into the scene image according to the instruction.
// Responds with a JSON object containing the base64-encoded result image (without data URI prefix).

exports.handler = async function(event, context) {
  // Determine allowed origin and CORS headers
  const allowOrigin = process.env.ALLOW_ORIGIN || '*';
  const corsHeaders = {
    // Allow requests from configured origin (or any origin during development).
    'Access-Control-Allow-Origin': allowOrigin,
    // Accept common headers. Add Authorization in case the client sends it.
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // Permit GET for simple health checks, POST for actual work, and OPTIONS for preflight.
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }
  try {
    if (event.httpMethod === 'GET') {
      // Respond OK for simple GET requests with CORS headers. Do not perform insertion.
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'nano-insert ready' }),
      };
    }
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }
    const body = event.body ? JSON.parse(event.body) : {};
    const { scene, person, instruction } = body;
    if (!scene || !person) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing scene or person' }),
      };
    }
    const apiKey = process.env.NANO_API_KEY;
    const model = process.env.NANO_MODEL || 'gemini-2.5-flash-image-preview';
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'NANO_API_KEY not set' }),
      };
    }
    // Extract base64 and MIME types for both images
    function parseData(data) {
      let mime = 'image/jpeg';
      let b64 = data;
      const m = /^data:(.*?);base64,(.*)$/.exec(data);
      if (m) {
        mime = m[1];
        b64 = m[2];
      }
      return { mime, b64 };
    }
    const sceneParsed = parseData(scene);
    const personParsed = parseData(person);
    const prompt = instruction || 'insert the person into the scene in a natural way';
    const geminiBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: sceneParsed.mime,
                data: sceneParsed.b64,
              },
            },
            {
              inline_data: {
                mime_type: personParsed.mime,
                data: personParsed.b64,
              },
            },
          ],
        },
      ],
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(geminiBody),
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Gemini API error', details: text }),
      };
    }
    const result = await response.json();
    let outData;
    const candidates = result?.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part.inline_data && part.inline_data.data) {
            outData = part.inline_data.data;
            break;
          }
        }
      }
    }
    if (!outData) {
      return {
        statusCode: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No image returned from Gemini' }),
      };
    }
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: outData }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || err.toString() }),
    };
  }
};
