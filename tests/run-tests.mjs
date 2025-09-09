const SITE = process.env.SITE_URL || 'https://staryo.netlify.app';
(async () => {
  try {
    const res = await fetch(`${SITE}/.netlify/functions/health`);
    const data = await res.json();
    console.log('health', data);
  } catch (e) {
    console.error('E2E failed', e);
    process.exit(1);
  }
})();
