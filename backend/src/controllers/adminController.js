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
 * GET /api/admin/overview
 * High level overview for super admin:
 * - total companies
 * - counts by status
 * - per-company staff counts and subscription period.
 */
async function getAdminOverview(req, res, next) {
  try {
    const totalsPromise = pool.query(
      `SELECT
         COUNT(*) AS total_companies,
         COUNT(*) FILTER (WHERE status = 'active')   AS active_companies,
         COUNT(*) FILTER (WHERE status = 'pending')  AS pending_companies,
         COUNT(*) FILTER (WHERE status = 'declined') AS declined_companies
       FROM companies`
    );

    const companiesPromise = pool.query(
      `SELECT
         c.id,
         c.name,
         c.email,
         c.status,
         c.created_at,
         c.subscription_start_date,
         c.subscription_end_date,
         c.is_active,
         COUNT(e.id) AS total_staff,
         COUNT(e.id) FILTER (WHERE e.status = 'active') AS active_staff
       FROM companies c
       LEFT JOIN employees e ON e.company_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );

    const [totalsResult, companiesResult] = await Promise.all([totalsPromise, companiesPromise]);
    const totalsRow = totalsResult.rows[0] || {};

    res.status(200).json({
      success: true,
      data: {
        totals: {
          totalCompanies: Number(totalsRow.total_companies || 0),
          activeCompanies: Number(totalsRow.active_companies || 0),
          pendingCompanies: Number(totalsRow.pending_companies || 0),
          declinedCompanies: Number(totalsRow.declined_companies || 0),
        },
        companies: companiesResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          status: row.status,
          created_at: row.created_at,
          subscription_start_date: row.subscription_start_date,
          subscription_end_date: row.subscription_end_date,
          is_active: row.is_active,
          total_staff: Number(row.total_staff || 0),
          active_staff: Number(row.active_staff || 0),
        })),
      },
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

module.exports = { listPendingCompanies, getAdminOverview, approveCompany, declineCompany };
