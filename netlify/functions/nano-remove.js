exports.handler = async (event, context) => {
  const allowOrigin = process.env.ALLOW_ORIGIN || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  // Provide simple GET status
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'nano-remove ready' }),
    };
  }

  // Only POST is allowed for actual processing
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { image, instruction } = JSON.parse(event.body || '{}');
    if (!image) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No image provided' }),
      };
    }

    // Determine MIME type and data from base64 string
    let mime = 'image/jpeg';
    let data = image;
    if (image.startsWith('data:')) {
      const matches = image.match(/^data:(.*?);base64,(.+)$/);
      if (matches) {
        mime = matches[1];
        data = matches[2];
      }
    }

    const removeInstruction = instruction || 'remove the seated man, keep background and the woman; preserve the cube, ground shadow and lighting';
    const model = process.env.NANO_MODEL || 'gemini-2.5-flash-image-preview';
    const apiKey = process.env.NANO_API_KEY;

    const body = {
      contents: [
        {
          parts: [
            { text: removeInstruction },
            { inline_data: { mime_type: mime, data } },
          ],
        },
      ],
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Remove API returned status ' + response.status }),
      };
    }

    const json = await response.json();
    const inlineData = json?.candidates?.[0]?.content?.parts?.find(p => p.inline_data)?.inline_data;
    if (!inlineData) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Remove API did not return inline data', detail: json }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: inlineData.data,
        mime_type: inlineData.mime_type,
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', detail: error.message }),
    };
  }
};
