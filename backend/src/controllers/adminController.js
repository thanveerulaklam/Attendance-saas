const { pool } = require('../config/database');
const { getEffectiveEmployeeLimit, PLAN_EMPLOYEE_LIMITS } = require('../services/employeeService');
const { computeNextAmcDueDate } = require('../services/companyService');
const auditService = require('../services/auditService');
const authService = require('../services/authService');

async function logSuperadminAction(companyId, actionType, entityType, entityId, metadata = null) {
  if (!companyId) return;
  await auditService.log(companyId, null, actionType, entityType, entityId, {
    actor: 'superadmin',
    ...(metadata || {}),
  });
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

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
         c.employee_limit_override,
         c.branch_limit_override,
         c.onetime_fee_paid,
         c.onetime_fee_amount,
         c.amc_amount,
         c.last_amc_payment_date,
         c.onetime_payment_status,
         c.amc_payment_status,
         c.last_onetime_payment_date,
         (
           SELECT MAX(d.last_seen_at)
           FROM devices d
           WHERE d.company_id = c.id
         ) AS last_device_sync_at,
         (
          SELECT MAX(at)
          FROM (
            SELECT MAX(p.generated_at) AS at
            FROM payroll_records p
            WHERE p.company_id = c.id
            UNION ALL
            SELECT MAX(w.generated_at) AS at
            FROM weekly_payroll_records w
            WHERE w.company_id = c.id
          ) x
         ) AS last_payroll_generated_at,
         (
           SELECT MAX(a.created_at)
           FROM audit_logs a
           WHERE a.company_id = c.id AND a.action_type = 'auth.login'
         ) AS last_login_at,
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
          employee_limit_override: row.employee_limit_override,
          branch_limit_override: row.branch_limit_override,
          onetime_fee_paid: row.onetime_fee_paid,
          onetime_fee_amount: row.onetime_fee_amount,
          amc_amount: row.amc_amount,
          last_amc_payment_date: row.last_amc_payment_date,
          onetime_payment_status: row.onetime_payment_status,
          amc_payment_status: row.amc_payment_status,
          last_onetime_payment_date: row.last_onetime_payment_date,
          next_amc_due_date: computeNextAmcDueDate(row),
          last_device_sync_at: row.last_device_sync_at,
          last_payroll_generated_at: row.last_payroll_generated_at,
          last_login_at: row.last_login_at,
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

    const existingResult = await pool.query(
      `SELECT created_at, status, subscription_start_date, subscription_end_date
       FROM companies
       WHERE id = $1`,
      [companyId]
    );
    if (existingResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }
    const existing = existingResult.rows[0];

    const {
      plan_code,
      billing_cycle: _ignoredBillingCycle,
      next_billing_date: _ignoredNextBillingDate,
      last_payment_date,
      payment_status,
      onetime_payment_status,
      amc_payment_status,
      billing_notes,
      subscription_start_date,
      subscription_end_date,
      is_active,
      onetime_fee_paid,
      onetime_fee_amount,
      amc_amount,
      last_amc_payment_date,
      last_onetime_payment_date,
    } = req.body || {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activationDate = existing.subscription_start_date
      ? new Date(existing.subscription_start_date)
      : existing.status === 'active'
        ? new Date(existing.created_at || today)
        : today;
    activationDate.setHours(0, 0, 0, 0);
    const defaultEndDate = new Date(activationDate);
    defaultEndDate.setDate(defaultEndDate.getDate() + 365);

    const normalizedStart =
      subscription_start_date === '' || subscription_start_date == null
        ? activationDate
        : subscription_start_date;
    const normalizedEnd =
      subscription_end_date === '' || subscription_end_date == null
        ? defaultEndDate
        : subscription_end_date;

    const { updateBillingMetadata } = require('../services/companyService');
    const updated = await updateBillingMetadata(companyId, {
      plan_code,
      billing_cycle: 'annual',
      next_billing_date: normalizedEnd,
      last_payment_date,
      payment_status,
      onetime_payment_status,
      amc_payment_status,
      billing_notes,
      subscription_start_date: normalizedStart,
      subscription_end_date: normalizedEnd,
      is_active,
      onetime_fee_paid,
      onetime_fee_amount,
      amc_amount,
      last_amc_payment_date,
      last_onetime_payment_date,
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
    await logSuperadminAction(companyId, 'admin.company_billing.update', 'company', companyId, {
      updated_fields: Object.keys(req.body || {}).filter((k) => k !== 'company_id'),
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

    const allowedPlanCodes = ['starter', 'growth', 'business', 'professional', 'enterprise', 'custom'];
    const allowedPaymentStatuses = ['trial', 'paid', 'pending', 'overdue', 'unpaid'];

    const plan_code =
      typeof req.body?.plan_code === 'string' ? req.body.plan_code.trim().toLowerCase() : '';
    const payment_status =
      typeof req.body?.payment_status === 'string'
        ? req.body.payment_status.trim().toLowerCase()
        : '';
    const subscription_start_date = req.body?.subscription_start_date;
    const subscription_end_date = req.body?.subscription_end_date;
    const last_payment_date = req.body?.last_payment_date;

    const rawBranchesAllowed = req.body?.branches_allowed;
    const rawStaffAllowed = req.body?.staffs_allowed;

    if (!allowedPlanCodes.includes(plan_code)) {
      return res.status(400).json({
        success: false,
        message: `plan_code must be one of: ${allowedPlanCodes.join(', ')}`,
      });
    }
    if (!allowedPaymentStatuses.includes(payment_status)) {
      return res.status(400).json({
        success: false,
        message: `payment_status must be one of: ${allowedPaymentStatuses.join(', ')}`,
      });
    }
    if (!subscription_start_date) {
      return res.status(400).json({
        success: false,
        message: 'subscription_start_date is required (YYYY-MM-DD)',
      });
    }

    let branchesAllowed = null;
    if (rawBranchesAllowed == null || rawBranchesAllowed === '') {
      return res.status(400).json({ success: false, message: 'branches_allowed is required' });
    } else {
      const n = Number(rawBranchesAllowed);
      if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
        return res.status(400).json({
          success: false,
          message: 'branches_allowed must be a positive integer (total branches including Main)',
        });
      }
      branchesAllowed = n;
    }

    let staffsAllowed = null;
    if (rawStaffAllowed == null || rawStaffAllowed === '') {
      return res.status(400).json({ success: false, message: 'staffs_allowed is required' });
    } else {
      const n = Number(rawStaffAllowed);
      if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
        return res.status(400).json({
          success: false,
          message: 'staffs_allowed must be a positive integer',
        });
      }
      staffsAllowed = n;
    }

    const startDate = new Date(subscription_start_date);
    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid subscription_start_date' });
    }
    startDate.setHours(0, 0, 0, 0);

    let endDate = null;
    if (subscription_end_date) {
      const d = new Date(subscription_end_date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid subscription_end_date' });
      }
      d.setHours(0, 0, 0, 0);
      endDate = d;
    } else {
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    let normalizedLastPaymentDate = null;
    if (last_payment_date) {
      const d = new Date(last_payment_date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid last_payment_date' });
      }
      d.setHours(0, 0, 0, 0);
      normalizedLastPaymentDate = d;
    } else if (payment_status === 'paid') {
      normalizedLastPaymentDate = startDate;
    }

    const branch_limit_override = Math.max(0, branchesAllowed - 1);
    const employee_limit_override = staffsAllowed;

    const onetime_fee_paid = req.body.onetime_fee_paid === true;
    let onetime_fee_amount = null;
    if (req.body.onetime_fee_amount != null && req.body.onetime_fee_amount !== '') {
      const n = Number(req.body.onetime_fee_amount);
      if (Number.isFinite(n) && n >= 0) onetime_fee_amount = n;
    }
    let amc_amount = null;
    if (req.body.amc_amount != null && req.body.amc_amount !== '') {
      const n = Number(req.body.amc_amount);
      if (Number.isFinite(n) && n >= 0) amc_amount = n;
    }
    let last_amc_payment_date = null;
    if (req.body.last_amc_payment_date) {
      const d = new Date(req.body.last_amc_payment_date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid last_amc_payment_date' });
      }
      d.setHours(0, 0, 0, 0);
      last_amc_payment_date = d;
    }

    const onetimePayStatus = onetime_fee_paid ? 'paid' : 'unpaid';
    const amcPayStatus = last_amc_payment_date ? 'paid' : 'unpaid';
    const lastOnetimePayDate =
      onetime_fee_paid && normalizedLastPaymentDate
        ? normalizedLastPaymentDate
        : onetime_fee_paid
          ? startDate
          : null;

    const result = await pool.query(
      `UPDATE companies
       SET status = 'active',
           is_active = TRUE,
           plan_code = $2,
           billing_cycle = 'annual',
           next_billing_date = $3::date,
           payment_status = $4,
           last_payment_date = $5::date,
           subscription_start_date = $6::date,
           subscription_end_date = $3::date,
           branch_limit_override = $7,
           employee_limit_override = $8,
           onetime_fee_paid = $9,
           onetime_fee_amount = $10,
           amc_amount = $11,
           last_amc_payment_date = $12::date,
           onetime_payment_status = $13,
           amc_payment_status = $14,
           last_onetime_payment_date = $15::date
       WHERE id = $1 AND status = 'pending'
       RETURNING id, name, status, plan_code, payment_status, last_payment_date,
                 subscription_start_date, subscription_end_date,
                 branch_limit_override, employee_limit_override,
                 onetime_fee_paid, onetime_fee_amount, amc_amount, last_amc_payment_date,
                 onetime_payment_status, amc_payment_status, last_onetime_payment_date`,
      [
        companyId,
        plan_code,
        endDate,
        payment_status,
        normalizedLastPaymentDate,
        startDate,
        branch_limit_override,
        employee_limit_override,
        onetime_fee_paid,
        onetime_fee_amount,
        amc_amount,
        last_amc_payment_date,
        onetimePayStatus,
        amcPayStatus,
        lastOnetimePayDate,
      ]
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
    await logSuperadminAction(companyId, 'admin.company.approve', 'company', companyId, {
      plan_code,
      payment_status,
      subscription_start_date: startDate,
      subscription_end_date: endDate,
      branches_allowed: branchesAllowed,
      staffs_allowed: staffsAllowed,
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
    await logSuperadminAction(companyId, 'admin.company.decline', 'company', companyId, {});
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
    await logSuperadminAction(companyId, 'admin.company.lock', 'company', companyId, {});
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
    await logSuperadminAction(companyId, 'admin.company.unlock', 'company', companyId, {});
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
         employee_limit_override,
         branch_limit_override,
         onetime_fee_paid, onetime_fee_amount, amc_amount, last_amc_payment_date,
         onetime_payment_status, amc_payment_status, last_onetime_payment_date
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (companyResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    const company = companyResult.rows[0];
    const next_amc_due_date = computeNextAmcDueDate(company);

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
    const lastDeviceSync = await pool.query(
      `SELECT MAX(last_seen_at) AS at FROM devices WHERE company_id = $1`,
      [companyId]
    );
    const lastPayrollRun = await pool.query(
      `SELECT MAX(generated_at) AS at FROM payroll_records WHERE company_id = $1`,
      [companyId]
    );
    const lastLogin = await pool.query(
      `SELECT MAX(created_at) AS at
       FROM audit_logs
       WHERE company_id = $1 AND action_type = 'auth.login'`,
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
          branch_limit_override: company.branch_limit_override,
          onetime_fee_paid: company.onetime_fee_paid,
          onetime_fee_amount: company.onetime_fee_amount,
          amc_amount: company.amc_amount,
          last_amc_payment_date: company.last_amc_payment_date,
          last_onetime_payment_date: company.last_onetime_payment_date,
          onetime_payment_status: company.onetime_payment_status,
          amc_payment_status: company.amc_payment_status,
          next_amc_due_date,
        },
        effective_employee_limit: effectiveLimit,
        plan_derived_employee_limit: planDerivedLimit,
        stats: {
          total_active_employees: Number(activeEmployeesTotal.rows[0]?.n || 0),
          total_devices: Number(devicesCount.rows[0]?.n || 0),
          last_device_sync_at: lastDeviceSync.rows[0]?.at || null,
          last_payroll_generated_at: lastPayrollRun.rows[0]?.at || null,
          last_login_at: lastLogin.rows[0]?.at || null,
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
    await logSuperadminAction(companyId, 'admin.user.branch_assignments.update', 'user', userId, {
      branch_ids: branchIds,
      default_branch_id: defId,
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

    const usage = await pool.query(
      `SELECT COUNT(*)::int AS active_count FROM employees WHERE company_id = $1 AND status = 'active'`,
      [companyId]
    );
    const activeCount = Number(usage.rows[0]?.active_count || 0);

    const result = await pool.query(
      `UPDATE companies SET employee_limit_override = $2 WHERE id = $1
       RETURNING id, employee_limit_override`,
      [companyId, overrideVal]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const effective = await getEffectiveEmployeeLimit(companyId);
    const warning =
      overrideVal != null && overrideVal < activeCount
        ? `Current active employees (${activeCount}) exceed this limit. New active employees will be blocked until count drops below ${overrideVal}.`
        : null;

    res.status(200).json({
      success: true,
      data: {
        company_id: result.rows[0].id,
        employee_limit_override: result.rows[0].employee_limit_override,
        effective_employee_limit: effective,
        active_employees: activeCount,
        warning,
      },
      message: 'Employee limit updated.',
    });
    await logSuperadminAction(companyId, 'admin.company.employee_limit.update', 'company', companyId, {
      employee_limit_override: overrideVal,
      active_employees: activeCount,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/set-company-branch-limit
 * Body: { company_id, branch_limit_override: number|null }
 */
async function setCompanyBranchLimit(req, res, next) {
  try {
    const companyId = req.body.company_id != null ? Number(req.body.company_id) : null;
    const raw = req.body.branch_limit_override;

    if (!companyId) {
      return res.status(400).json({ success: false, message: 'company_id is required' });
    }

    let overrideVal = null;
    if (raw != null && raw !== '') {
      const n = Number(raw);
      // 0 is valid (no extra branches beyond Main allowed)
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return res.status(400).json({
          success: false,
          message: 'branch_limit_override must be a non-negative integer or null',
        });
      }
      overrideVal = n;
    }

    const usage = await pool.query(
      `SELECT COUNT(*)::int AS total FROM branches WHERE company_id = $1`,
      [companyId]
    );
    const currentBranches = Number(usage.rows[0]?.total || 0);
    const result = await pool.query(
      `UPDATE companies SET branch_limit_override = $2 WHERE id = $1
       RETURNING id, branch_limit_override`,
      [companyId, overrideVal]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const allowedTotal =
      overrideVal == null ? null : 1 + Number(overrideVal);
    const warning =
      allowedTotal != null && currentBranches > allowedTotal
        ? `Current branches (${currentBranches}) exceed allowed total (${allowedTotal}). New branch creation will remain blocked until usage is reduced or cap is increased.`
        : null;

    res.status(200).json({
      success: true,
      data: {
        company_id: result.rows[0].id,
        branch_limit_override: result.rows[0].branch_limit_override,
        current_branches: currentBranches,
        allowed_total_branches: allowedTotal,
        warning,
      },
      message: 'Branch limit updated.',
    });
    await logSuperadminAction(companyId, 'admin.company.branch_limit.update', 'company', companyId, {
      branch_limit_override: overrideVal,
      current_branches: currentBranches,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/collections-queue?days=30
 * Returns companies at risk for renewal collections.
 */
async function getCollectionsQueue(req, res, next) {
  try {
    const days = Math.max(1, Math.min(90, Number(req.query?.days) || 30));
    const result = await pool.query(
      `SELECT
         c.id, c.name, c.email, c.phone, c.status,
         c.subscription_end_date, c.payment_status, c.plan_code, c.billing_cycle,
         c.last_payment_date, c.next_billing_date,
         c.onetime_payment_status, c.amc_payment_status,
         COUNT(e.id) FILTER (WHERE e.status = 'active')::int AS active_staff
       FROM companies c
       LEFT JOIN employees e ON e.company_id = c.id
       WHERE c.status IN ('active', 'locked')
       GROUP BY c.id
       HAVING (
         c.subscription_end_date IS NOT NULL
         AND c.subscription_end_date <= (NOW()::date + $1 * INTERVAL '1 day')
       )
       OR c.onetime_payment_status IN ('overdue', 'pending', 'unpaid')
       OR c.amc_payment_status IN ('overdue', 'pending', 'unpaid')
       ORDER BY c.subscription_end_date ASC NULLS LAST, c.id ASC`,
      [days]
    );
    res.status(200).json({
      success: true,
      data: result.rows,
      meta: { days },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/renew-company-subscription
 * Body: { company_id, action: 'renew_30_days'|'renew_1_year'|'mark_paid_today'|'cancel_subscription' }
 */
async function renewCompanySubscription(req, res, next) {
  try {
    const companyId = req.body?.company_id != null ? Number(req.body.company_id) : null;
    const action = String(req.body?.action || '').trim();
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'company_id is required' });
    }
    const allowed = ['renew_30_days', 'renew_1_year', 'mark_paid_today', 'cancel_subscription'];
    if (!allowed.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const currentResult = await pool.query(
      `SELECT id, name, subscription_start_date, subscription_end_date, payment_status, is_active
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (currentResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }
    const current = currentResult.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentEnd = current.subscription_end_date ? new Date(current.subscription_end_date) : null;
    const base = currentEnd && currentEnd > today ? currentEnd : today;

    let updates = {};
    if (action === 'renew_30_days') {
      updates = {
        subscription_start_date: current.subscription_start_date || today,
        subscription_end_date: addDays(base, 30),
        payment_status: 'paid',
        last_payment_date: today,
        is_active: true,
      };
    } else if (action === 'renew_1_year') {
      updates = {
        subscription_start_date: current.subscription_start_date || today,
        subscription_end_date: addDays(base, 365),
        payment_status: 'paid',
        last_payment_date: today,
        is_active: true,
      };
    } else if (action === 'mark_paid_today') {
      updates = {
        payment_status: 'paid',
        last_payment_date: today,
        is_active: true,
      };
    } else if (action === 'cancel_subscription') {
      updates = {
        is_active: false,
        payment_status: 'overdue',
      };
    }

    const { updateBillingMetadata } = require('../services/companyService');
    const updated = await updateBillingMetadata(companyId, updates);

    await logSuperadminAction(companyId, 'admin.company.subscription_action', 'company', companyId, {
      action,
      updates,
    });

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Subscription updated.',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/admin/recent-superadmin-audit?limit=40
 * Latest super-admin actions across all tenants (action_type starts with admin.).
 */
async function getRecentSuperadminAudit(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 40));
    const result = await pool.query(
      `SELECT
         a.id,
         a.company_id,
         a.action_type,
         a.created_at,
         c.name AS company_name
       FROM audit_logs a
       LEFT JOIN companies c ON c.id = a.company_id
       WHERE a.action_type LIKE 'admin.%'
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
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
 * GET /api/admin/company-audit?company_id=1&page=1&limit=20
 */
async function getCompanyAudit(req, res, next) {
  try {
    const companyId = req.query?.company_id != null ? Number(req.query.company_id) : null;
    const page = req.query?.page != null ? Number(req.query.page) : 1;
    const limit = req.query?.limit != null ? Number(req.query.limit) : 20;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'company_id is required' });
    }
    const offset = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs WHERE company_id = $1`,
      [companyId]
    );
    const rows = await pool.query(
      `SELECT id, company_id, user_id, action_type, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [companyId, Math.min(100, Math.max(1, limit)), offset]
    );
    res.status(200).json({
      success: true,
      data: {
        data: rows.rows,
        page: Math.max(1, page),
        limit: Math.min(100, Math.max(1, limit)),
        total: Number(count.rows[0]?.total || 0),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/reset-company-admin-password
 * Body: { company_id, admin_user_id?, admin_email?, new_password }
 * Requires X-Approval-Secret or Authorization: Bearer <ADMIN_APPROVAL_SECRET>.
 */
/**
 * POST /api/admin/create-company
 * SuperAdmin creates an active tenant + admin user (credentials to share with client).
 * Body: { company: { name, email?, phone?, address? }, admin: { name, email, password },
 *   plan_code?, subscription_start_date?, subscription_end_date?, branches_allowed, staffs_allowed,
 *   onetime_fee_amount?, amc_amount?, onetime_fee_paid?, payment_status?, last_amc_payment_date? }
 */
async function createCompanyProvisioned(req, res, next) {
  try {
    const result = await authService.createCompanyProvisionedBySuperadmin(req.body || {});
    res.status(201).json({
      success: true,
      data: {
        company: result.company,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
        },
        admin_password_plaintext_once: result.admin_password_plaintext_once,
      },
      message: `Company "${result.company.name}" is active. Share admin credentials securely with the client.`,
    });
    await logSuperadminAction(result.company.id, 'admin.company.create', 'company', result.company.id, {
      plan_code: result.company.plan_code,
    });
  } catch (err) {
    next(err);
  }
}

async function resetCompanyAdminPassword(req, res, next) {
  try {
    const companyId = req.body?.company_id != null ? Number(req.body.company_id) : null;
    const adminUserId = req.body?.admin_user_id != null ? Number(req.body.admin_user_id) : null;
    const adminEmail =
      typeof req.body?.admin_email === 'string' && req.body.admin_email.trim()
        ? req.body.admin_email.trim()
        : null;
    const newPassword =
      typeof req.body?.new_password === 'string' ? req.body.new_password : null;

    if (!companyId || !Number.isInteger(companyId)) {
      return res.status(400).json({
        success: false,
        message: 'company_id (number) is required',
      });
    }
    if (!adminUserId && !adminEmail) {
      return res.status(400).json({
        success: false,
        message: 'Either admin_user_id or admin_email is required',
      });
    }
    if (adminUserId != null && !Number.isInteger(adminUserId)) {
      return res.status(400).json({
        success: false,
        message: 'admin_user_id must be a number when provided',
      });
    }
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'new_password is required',
      });
    }

    const user = await authService.superadminResetAdminPassword(
      companyId,
      { adminUserId, adminEmail },
      newPassword
    );

    res.status(200).json({
      success: true,
      data: user,
      message: `Password reset successfully for admin "${user.email}".`,
    });
    await logSuperadminAction(companyId, 'admin.user.password.reset', 'user', user.id, {
      admin_email: user.email,
      reset_via: adminUserId ? 'admin_user_id' : 'admin_email',
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
  createCompanyProvisioned,
  approveCompany,
  declineCompany,
  lockCompany,
  unlockCompany,
  getCompanyDetails,
  setUserBranchAssignments,
  setCompanyEmployeeLimit,
  setCompanyBranchLimit,
  getCollectionsQueue,
  renewCompanySubscription,
  getRecentSuperadminAudit,
  getCompanyAudit,
  resetCompanyAdminPassword,
};
