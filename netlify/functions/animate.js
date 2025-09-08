// Netlify Function: animate
// Receives a JSON payload with a base64-encoded image, a prompt, and optional duration/fps.
// Sends the request to the Vidu image-to-video API (v2) using the provided API key.
// Responds with whatever JSON Vidu returns (task ID, status, or video URL).

exports.handler = async function(event, context) {
  // Compute allowed origin and CORS headers
  const allowOrigin = process.env.ALLOW_ORIGIN || '*';
  const corsHeaders = {
    // Allow the configured origin or wildcard during development
    'Access-Control-Allow-Origin': allowOrigin,
    // Accept standard headers plus Authorization for authenticated requests
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // Permit GET for simple diagnostics, POST for actual work, and OPTIONS for preflight
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
    // Return a simple status message for GET requests without attempting any processing.
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'animate ready' }),
      };
    }
    // Only allow POST beyond this point. Other methods already handled (GET above).
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }
    const body = event.body ? JSON.parse(event.body) : {};
    const { image, prompt, duration, fps } = body;
    if (!image) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing image' }),
      };
    }
    const apiKey = process.env.ANIMATE_API_KEY;
    const animateUrl = process.env.ANIMATE_URL;
    if (!apiKey || !animateUrl) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Animation API configuration missing' }),
      };
    }
    // Prepare payload for Vidu. According to available docs, images array is expected.
    // We send one image as data URI or raw base64; here we pass raw base64 string.
    // Duration and fps default from env if not provided.
    const dur = typeof duration !== 'undefined' ? duration : (process.env.ANIMATE_DURATION_SEC || 5);
    const frames = typeof fps !== 'undefined' ? fps : (process.env.ANIMATE_FPS || 25);
    // Strip data URI prefix if present
    let base64Image = image;
    const match = /^data:(.*?);base64,(.*)$/.exec(image);
    if (match) base64Image = match[2];
    const viduBody = {
      images: [ base64Image ],
      prompt: prompt || '',
      duration: Number(dur),
      fps: Number(frames),
    };
    const response = await fetch(animateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(viduBody),
    });
    const statusCode = response.status;
    let responseBody;
    try {
      responseBody = await response.text();
    } catch (e) {
      responseBody = '';
    }
    // Attempt to parse JSON if possible
    let json;
    try { json = JSON.parse(responseBody); } catch(e) { json = null; }
    return {
      statusCode: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: json ? JSON.stringify(json) : JSON.stringify({ result: responseBody }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || err.toString() }),
    };
  }
};
