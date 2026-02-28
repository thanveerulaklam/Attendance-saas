const rateLimit = require('express-rate-limit');

/**
 * General API rate limit: 100 requests per 15 minutes per IP.
 * Stricter limits can be applied to auth routes separately.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
