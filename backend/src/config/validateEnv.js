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

  const adminSecret = String(process.env.ADMIN_APPROVAL_SECRET || '').trim();
  if (isProd) {
    if (!adminSecret) {
      console.error(
        'ADMIN_APPROVAL_SECRET is required in production. Super Admin routes must not run without it.'
      );
      process.exit(1);
    }
    if (adminSecret.length < 32) {
      console.error(
        `ADMIN_APPROVAL_SECRET must be at least 32 characters in production (currently ${adminSecret.length}). ` +
          'Check backend/.env for duplicate lines, # in the value, or edit the file on the VPS (not only locally). ' +
          'Generate with: openssl rand -hex 32'
      );
      process.exit(1);
    }
  } else if (adminSecret && adminSecret.length < 16) {
    console.warn(
      '[validateEnv] ADMIN_APPROVAL_SECRET is short; use at least 32 random characters in production.'
    );
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
