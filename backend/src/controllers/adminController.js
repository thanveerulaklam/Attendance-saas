const { pool } = require('../config/database');

/**
 * GET /api/admin/pending-companies
 * List companies with status 'pending' (for you to approve after payment).
 * Requires X-Approval-Secret or Authorization: Bearer <ADMIN_APPROVAL_SECRET>.
 */
async function listPendingCompanies(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.address, c.created_at,
              (SELECT u.email FROM users u WHERE u.company_id = c.id AND u.role = 'admin' LIMIT 1) AS admin_email
       FROM companies c
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`
    );
    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/approve-company
 * Body: { company_id }
 * Sets company status to 'active' so they can log in.
 * Requires X-Approval-Secret or Authorization: Bearer <ADMIN_APPROVAL_SECRET>.
 */
async function approveCompany(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    if (!companyId || !Number.isInteger(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'company_id (number) is required',
      });
    }
    const result = await pool.query(
      `UPDATE companies SET status = 'active' WHERE id = $1 AND status = 'pending' RETURNING id, name, status`,
      [companyId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or already approved',
      });
    }
    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: `Company "${result.rows[0].name}" is now active. They can log in.`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/decline-company
 * Body: { company_id }
 * Sets company status to 'declined' (they cannot log in; can re-register if needed).
 * Requires X-Approval-Secret or Authorization: Bearer <ADMIN_APPROVAL_SECRET>.
 */
async function declineCompany(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    if (!companyId || !Number.isInteger(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'company_id (number) is required',
      });
    }
    const result = await pool.query(
      `UPDATE companies SET status = 'declined' WHERE id = $1 AND status = 'pending' RETURNING id, name, status`,
      [companyId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found or already approved/declined',
      });
    }
    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: `Registration for "${result.rows[0].name}" was declined.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPendingCompanies, approveCompany, declineCompany };
