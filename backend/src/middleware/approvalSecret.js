/**
 * Protects admin/approval routes: requires X-Approval-Secret or Authorization: Bearer <secret>
 * to match ADMIN_APPROVAL_SECRET. Use for approving company registrations after payment.
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
    ? req.headers.authorization.slice(7) : null;
  const provided = headerSecret || bearer;
  if (!provided || provided !== secret) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing approval secret',
    });
  }
  next();
}

module.exports = { requireApprovalSecret };
