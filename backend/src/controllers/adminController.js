const { pool } = require('../config/database');
const { getEffectiveEmployeeLimit, PLAN_EMPLOYEE_LIMITS } = require('../services/employeeService');

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
 * - per-company staff counts and subscription/billing info.
 */
async function getAdminOverview(req, res, next) {
  try {
    const totalsPromise = pool.query(
      `SELECT
         COUNT(*) AS total_companies,
         COUNT(*) FILTER (WHERE status = 'active')   AS active_companies,
         COUNT(*) FILTER (WHERE status = 'pending')  AS pending_companies,
         COUNT(*) FILTER (WHERE status = 'declined') AS declined_companies,
         COUNT(*) FILTER (WHERE status = 'locked')   AS locked_companies
       FROM companies`
    );

    const companiesPromise = pool.query(
      `SELECT
         c.id,
         c.name,
         c.email,
         c.phone,
         c.status,
         c.created_at,
         c.subscription_start_date,
         c.subscription_end_date,
         c.is_active,
         c.plan_code,
         c.billing_cycle,
         c.next_billing_date,
         c.last_payment_date,
         c.payment_status,
         c.billing_notes,
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
          lockedCompanies: Number(totalsRow.locked_companies || 0),
        },
        companies: companiesResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          status: row.status,
          created_at: row.created_at,
          subscription_start_date: row.subscription_start_date,
          subscription_end_date: row.subscription_end_date,
          is_active: row.is_active,
          plan_code: row.plan_code,
          billing_cycle: row.billing_cycle,
          next_billing_date: row.next_billing_date,
          last_payment_date: row.last_payment_date,
          payment_status: row.payment_status,
          billing_notes: row.billing_notes,
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
 * GET /api/admin/demo-enquiries
 * List stored demo enquiries submitted from the landing page.
 * Requires X-Approval-Secret or Authorization: Bearer <ADMIN_APPROVAL_SECRET>.
 */
async function listDemoEnquiries(req, res, next) {
  try {
    const page = req.query?.page != null ? Number(req.query.page) : 1;
    const limit = req.query?.limit != null ? Number(req.query.limit) : 20;
    const pageNum = Math.max(1, Number.isFinite(page) ? page : 1);
    const limitNum = Math.min(100, Math.max(1, Number.isFinite(limit) ? limit : 20));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(`SELECT COUNT(*) AS total FROM demo_enquiries`);
    const total = Number(countResult.rows[0]?.total || 0);

    const result = await pool.query(
      `SELECT id, full_name, business_name, phone_number, employees_range, source, notes, created_at
       FROM demo_enquiries
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        data: result.rows,
        page: pageNum,
        limit: limitNum,
        total,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/company-billing
 * Update plan and billing metadata for a company.
 * Body: {
 *   company_id,
 *   plan_code?,
 *   billing_cycle?,
 *   next_billing_date?,
 *   last_payment_date?,
 *   payment_status?,
 *   billing_notes?,
 *   subscription_start_date?,
 *   subscription_end_date?,
 *   is_active?
 * }
 */
async function updateCompanyBilling(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    if (!companyId || !Number.isInteger(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'company_id (number) is required',
      });
    }

    const {
      plan_code,
      billing_cycle,
      next_billing_date,
      last_payment_date,
      payment_status,
      billing_notes,
      subscription_start_date,
      subscription_end_date,
      is_active,
    } = req.body || {};

    const { updateBillingMetadata } = require('../services/companyService');
    const updated = await updateBillingMetadata(companyId, {
      plan_code,
      billing_cycle,
      next_billing_date,
      last_payment_date,
      payment_status,
      billing_notes,
      subscription_start_date,
      subscription_end_date,
      is_active,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Billing details updated.',
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

/**
 * POST /api/admin/lock-company
 * Body: { company_id }
 * Sets company status to 'locked' to block login for overdue or problematic customers.
 * Requires X-Approval-Secret or Authorization: Bearer <ADMIN_APPROVAL_SECRET>.
 */
async function lockCompany(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    if (!companyId || !Number.isInteger(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'company_id (number) is required',
      });
    }
    const result = await pool.query(
      `UPDATE companies SET status = 'locked' WHERE id = $1 RETURNING id, name, status`,
      [companyId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }
    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: `Company "${result.rows[0].name}" has been locked. Users will no longer be able to log in.`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/unlock-company
 * Body: { company_id }
 * Sets company status back to 'active'.
 * Requires X-Approval-Secret or Authorization: Bearer <ADMIN_APPROVAL_SECRET>.
 */
async function unlockCompany(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    if (!companyId || !Number.isInteger(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'company_id (number) is required',
      });
    }
    const result = await pool.query(
      `UPDATE companies SET status = 'active' WHERE id = $1 RETURNING id, name, status`,
      [companyId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }
    res.status(200).json({
      success: true,
      data: result.rows[0],
      message: `Company "${result.rows[0].name}" has been unlocked.`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/company-details?company_id=
 * Full customer view: billing, effective employee limit, branches + counts, HR users + branch assignments.
 */
async function getCompanyDetails(req, res, next) {
  try {
    const companyId = req.query.company_id != null ? Number(req.query.company_id) : null;
    if (!companyId || !Number.isInteger(companyId)) {
      return res.status(400).json({ success: false, message: 'company_id (number) is required' });
    }

    const companyResult = await pool.query(
      `SELECT
         id, name, email, phone, address, status, created_at,
         subscription_start_date, subscription_end_date, is_active,
         plan_code, billing_cycle, next_billing_date, last_payment_date,
         payment_status, billing_notes,
         employee_limit_override
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (companyResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    const company = companyResult.rows[0];

    const effectiveLimit = await getEffectiveEmployeeLimit(companyId);
    const planCode = (company.plan_code || 'starter').toLowerCase();
    const planDerivedLimit = Object.prototype.hasOwnProperty.call(PLAN_EMPLOYEE_LIMITS, planCode)
      ? PLAN_EMPLOYEE_LIMITS[planCode]
      : null;

    const branchesResult = await pool.query(
      `SELECT b.id, b.name, b.address, b.created_at,
         COUNT(e.id) FILTER (WHERE e.status = 'active') AS active_employees
       FROM branches b
       LEFT JOIN employees e ON e.branch_id = b.id AND e.company_id = b.company_id
       WHERE b.company_id = $1
       GROUP BY b.id
       ORDER BY b.id ASC`,
      [companyId]
    );

    const devicesCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM devices WHERE company_id = $1`,
      [companyId]
    );
    const activeEmployeesTotal = await pool.query(
      `SELECT COUNT(*)::int AS n FROM employees WHERE company_id = $1 AND status = 'active'`,
      [companyId]
    );

    const hrUsersResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.role
       FROM users u WHERE u.company_id = $1 AND u.role = 'hr'
       ORDER BY u.id ASC`,
      [companyId]
    );

    const hrUsers = [];
    for (const u of hrUsersResult.rows) {
      const assign = await pool.query(
        `SELECT uba.branch_id, uba.is_default, b.name AS branch_name
         FROM user_branch_assignments uba
         JOIN branches b ON b.id = uba.branch_id AND b.company_id = $2
         WHERE uba.user_id = $1
         ORDER BY uba.is_default DESC, uba.branch_id ASC`,
        [u.id, companyId]
      );
      hrUsers.push({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        branch_assignments: assign.rows.map((r) => ({
          branch_id: Number(r.branch_id),
          branch_name: r.branch_name,
          is_default: r.is_default === true,
        })),
      });
    }

    res.status(200).json({
      success: true,
      data: {
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          phone: company.phone,
          address: company.address,
          status: company.status,
          created_at: company.created_at,
          subscription_start_date: company.subscription_start_date,
          subscription_end_date: company.subscription_end_date,
          is_active: company.is_active,
          plan_code: company.plan_code,
          billing_cycle: company.billing_cycle,
          next_billing_date: company.next_billing_date,
          last_payment_date: company.last_payment_date,
          payment_status: company.payment_status,
          billing_notes: company.billing_notes,
          employee_limit_override: company.employee_limit_override,
        },
        effective_employee_limit: effectiveLimit,
        plan_derived_employee_limit: planDerivedLimit,
        stats: {
          total_active_employees: Number(activeEmployeesTotal.rows[0]?.n || 0),
          total_devices: Number(devicesCount.rows[0]?.n || 0),
        },
        branches: branchesResult.rows.map((r) => ({
          id: r.id,
          name: r.name,
          address: r.address,
          created_at: r.created_at,
          active_employees: Number(r.active_employees || 0),
        })),
        hr_users: hrUsers,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/set-user-branch-assignments
 * Body: { company_id, user_id, branch_ids: number[], default_branch_id?: number|null }
 */
async function setUserBranchAssignments(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    const userId = req.body.user_id != null ? Number(req.body.user_id) : null;
    const branchIds = Array.isArray(req.body.branch_ids) ? req.body.branch_ids.map(Number).filter(Boolean) : [];
    const defaultBranchRaw = req.body.default_branch_id;
    const defaultBranchId =
      defaultBranchRaw == null || defaultBranchRaw === ''
        ? null
        : Number(defaultBranchRaw);

    if (!companyId || !userId || branchIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'company_id, user_id, and non-empty branch_ids are required',
      });
    }

    const userCheck = await pool.query(
      `SELECT id, role, company_id FROM users WHERE id = $1`,
      [userId]
    );
    if (userCheck.rowCount === 0 || Number(userCheck.rows[0].company_id) !== companyId) {
      return res.status(404).json({ success: false, message: 'User not found for this company' });
    }
    if (userCheck.rows[0].role !== 'hr') {
      return res.status(400).json({
        success: false,
        message: 'Branch assignments apply to HR users only',
      });
    }

    const branchesOk = await pool.query(
      `SELECT id FROM branches WHERE company_id = $1 AND id = ANY($2::bigint[])`,
      [companyId, branchIds]
    );
    if (branchesOk.rowCount !== branchIds.length) {
      return res.status(400).json({ success: false, message: 'One or more branch_ids are invalid for this company' });
    }

    const defId = defaultBranchId != null ? defaultBranchId : branchIds[0];
    if (!branchIds.includes(defId)) {
      return res.status(400).json({
        success: false,
        message: 'default_branch_id must be one of branch_ids',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM user_branch_assignments WHERE user_id = $1`, [userId]);
      for (const bid of branchIds) {
        await client.query(
          `INSERT INTO user_branch_assignments (user_id, branch_id, is_default)
           VALUES ($1, $2, $3)`,
          [userId, bid, bid === defId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.status(200).json({
      success: true,
      message: 'Branch assignments updated.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/set-company-employee-limit
 * Body: { company_id, employee_limit_override: number|null }
 */
async function setCompanyEmployeeLimit(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    const raw = req.body.employee_limit_override;

    if (!companyId) {
      return res.status(400).json({ success: false, message: 'company_id is required' });
    }

    let overrideVal = null;
    if (raw != null && raw !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
        return res.status(400).json({
          success: false,
          message: 'employee_limit_override must be a positive integer or null',
        });
      }
      overrideVal = n;
    }

    const result = await pool.query(
      `UPDATE companies SET employee_limit_override = $2 WHERE id = $1
       RETURNING id, employee_limit_override`,
      [companyId, overrideVal]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const effective = await getEffectiveEmployeeLimit(companyId);

    res.status(200).json({
      success: true,
      data: {
        company_id: result.rows[0].id,
        employee_limit_override: result.rows[0].employee_limit_override,
        effective_employee_limit: effective,
      },
      message: 'Employee limit updated.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPendingCompanies,
  getAdminOverview,
  listDemoEnquiries,
  updateCompanyBilling,
  approveCompany,
  declineCompany,
  lockCompany,
  unlockCompany,
  getCompanyDetails,
  setUserBranchAssignments,
  setCompanyEmployeeLimit,
};
