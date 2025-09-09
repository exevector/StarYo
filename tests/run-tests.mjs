const SITE = process.env.SITE_URL || 'https://staryo.netlify.app';

(async () => {
  try {
    console.log('Running E2E test against:', SITE);

    const res = await fetch(`${SITE}/.netlify/functions/health`);
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const data = await res.json();
    console.log('✅ Health check passed:', data);

  } catch (e) {
    console.error('❌ E2E failed:', e.message);
    process.exit(1);
  }
})();
