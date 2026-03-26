const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

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

/**
 * After authenticate + company context: attach branch scope for HR users.
 * - admin: req.allowedBranchIds = null (no filter; all company branches)
 * - hr: req.allowedBranchIds = number[], req.defaultBranchId from is_default (else first assigned)
 * - other roles: null (no branch filtering)
 */
async function attachBranchScopes(req, res, next) {
  if (!req.user) {
    return next();
  }

  const role = req.user.role;
  const companyId = req.companyId;

  if (role === 'admin') {
    req.allowedBranchIds = null;
    req.defaultBranchId = null;
    return next();
  }

  if (role !== 'hr' || !companyId) {
    req.allowedBranchIds = null;
    req.defaultBranchId = null;
    return next();
  }

  const userId = req.user.user_id;
  if (!userId) {
    req.allowedBranchIds = [];
    req.defaultBranchId = null;
    return next();
  }

  try {
    const result = await pool.query(
      `SELECT uba.branch_id, uba.is_default
       FROM user_branch_assignments uba
       INNER JOIN branches b ON b.id = uba.branch_id AND b.company_id = $2
       WHERE uba.user_id = $1
       ORDER BY uba.is_default DESC, uba.branch_id ASC`,
      [userId, companyId]
    );

    const ids = result.rows.map((r) => Number(r.branch_id));
    req.allowedBranchIds = ids;

    const defaultRow = result.rows.find((r) => r.is_default === true);
    req.defaultBranchId = defaultRow
      ? Number(defaultRow.branch_id)
      : ids[0] != null
        ? ids[0]
        : null;

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * HR users must have at least one assigned branch to create/update data.
 */
function requireHrBranchForMutation(req, res, next) {
  if (req.user?.role === 'hr' && Array.isArray(req.allowedBranchIds) && req.allowedBranchIds.length === 0) {
    return res.status(403).json({
      success: false,
      message:
        'No branch access assigned. Ask your administrator to assign branches to your account.',
    });
  }
  return next();
}

module.exports = {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  optionalAuth,
  signToken,
  attachBranchScopes,
  requireHrBranchForMutation,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
