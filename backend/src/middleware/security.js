const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

function getBearerToken(req) {
  const header = req.headers?.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function getRateLimitKey(req) {
  const ipKey = typeof rateLimit.ipKeyGenerator === 'function'
    ? rateLimit.ipKeyGenerator(req.ip)
    : req.ip;
  const token = getBearerToken(req);
  if (token) {
    try {
      // Decode only for rate-limit bucketing; authentication still happens in auth middleware.
      const payload = jwt.decode(token);
      const companyId = payload?.company_id ?? payload?.companyId ?? 'unknown';
      const userId = payload?.user_id ?? payload?.userId ?? null;
      if (userId != null) {
        return `auth:${companyId}:${userId}`;
      }
      return `auth:${companyId}:${ipKey}`;
    } catch {
      // Fall back to IP key.
    }
  }
  return `anon:${ipKey}`;
}

/**
 * General API rate limit:
 * - Authenticated traffic is bucketed per user/company with a higher cap.
 * - Anonymous traffic stays stricter per IP.
 * Stricter limits can be applied to auth routes separately.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    const token = getBearerToken(req);
    if (token) {
      return parseInt(process.env.API_RATE_LIMIT_MAX_AUTH || '1200', 10);
    }
    return parseInt(process.env.API_RATE_LIMIT_MAX_ANON || '200', 10);
  },
  keyGenerator: getRateLimitKey,
  message: { success: false, message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Auth routes: limit per 15 minutes per IP (login/register).
 * Default 50; set AUTH_RATE_LIMIT_MAX in env to override.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '50', 10),
  message: { success: false, message: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Device push endpoint: 200 requests per minute per IP (bulk logs).
 */
const devicePushLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many device sync requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  devicePushLimiter,
};
