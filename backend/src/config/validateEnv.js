/**
 * Validate required environment variables at startup.
 * In production, missing required vars cause exit(1).
 * In development, only warnings are logged (except JWT_SECRET which is always required).
 */
function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';

  const required = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
  ];

  const missing = required.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    const message = `Missing required env: ${missing.join(', ')}. Set them in .env or environment.`;

    if (isProd) {
      console.error(message);
      process.exit(1);
    }

    if (missing.includes('JWT_SECRET')) {
      console.error('JWT_SECRET is required in all environments. Using default is insecure.');
      process.exit(1);
    }

    console.warn(`[validateEnv] ${message}`);
  }

  if (process.env.WHATSAPP_ENABLED === 'true') {
    const waKeys = [
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_TEMPLATE_NAME',
    ];
    const waMissing = waKeys.filter((key) => !String(process.env[key] || '').trim());
    if (waMissing.length > 0) {
      console.warn(
        `[validateEnv] WHATSAPP_ENABLED=true but missing: ${waMissing.join(', ')}`
      );
    }
  }
}

module.exports = { validateEnv };
