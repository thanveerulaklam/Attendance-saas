const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Verify JWT and attach user + company context. Requires Authorization: Bearer <token>.
 * Sets req.user (payload) and req.companyId (from token only — never from body).
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.companyId = decoded.company_id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/**
 * Restrict access by role. Must be used after authenticate().
 * @param {string[]} allowedRoles - e.g. ['admin', 'hr']
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Strip company_id from body so it can never be trusted. Use after authenticate.
 * Ensures all handlers use req.companyId from JWT only.
 */
function enforceCompanyFromToken(req, _res, next) {
  if (req.body && typeof req.body.company_id !== 'undefined') {
    delete req.body.company_id;
  }
  if (req.query && typeof req.query.company_id !== 'undefined') {
    delete req.query.company_id;
  }
  next();
}

/**
 * Optional auth: attach user if token present, don't fail if missing.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    req.user = null;
    req.companyId = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.companyId = decoded.company_id || null;
  } catch {
    req.user = null;
    req.companyId = null;
  }
  next();
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

module.exports = {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  optionalAuth,
  signToken,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
