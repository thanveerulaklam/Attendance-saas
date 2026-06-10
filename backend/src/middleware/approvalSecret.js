const crypto = require('crypto');

/**
 * Constant-time string compare to reduce timing side-channels on ADMIN_APPROVAL_SECRET.
 */
function safeSecretEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Compare against self so timing does not leak expected length.
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').trim();
}

/**
 * Optional comma-separated allowlist, e.g. ADMIN_IP_ALLOWLIST=203.0.113.10,127.0.0.1
 * When unset, all IPs may attempt auth (still need the secret).
 */
function requireAdminIpAllowlist(req, res, next) {
  const raw = process.env.ADMIN_IP_ALLOWLIST;
  if (!raw || !String(raw).trim()) {
    return next();
  }

  const allowed = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const clientIp = getClientIp(req);
  if (!allowed.includes(clientIp)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access is not allowed from this network',
    });
  }

  return next();
}

/**
 * Protects admin/approval routes: requires X-Approval-Secret or Authorization: Bearer <secret>
 * to match ADMIN_APPROVAL_SECRET.
 */
function requireApprovalSecret(req, res, next) {
  const secret = process.env.ADMIN_APPROVAL_SECRET;
  if (!secret) {
    return res.status(503).json({
      success: false,
      message: 'Approval not configured',
    });
  }

  const headerSecret = req.headers['x-approval-secret'];
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const provided = headerSecret || bearer;

  if (!provided || !safeSecretEqual(String(provided), String(secret))) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing approval secret',
    });
  }

  return next();
}

module.exports = {
  requireApprovalSecret,
  requireAdminIpAllowlist,
  safeSecretEqual,
};
