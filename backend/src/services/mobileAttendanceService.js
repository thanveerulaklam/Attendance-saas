const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { isSubscriptionAllowed } = require('./companyService');

const MOBILE_CHANNELS = new Set(['mobile', 'both']);

function isEmployeeChannelAllowed(channel) {
  const normalized = String(channel || 'device').toLowerCase();
  return MOBILE_CHANNELS.has(normalized);
}

function mobileReject(code, message, statusCode = 403) {
  const err = new AppError(message, statusCode, code);
  return err;
}

async function loadCompanyForMobile(companyId) {
  const result = await pool.query(
    `SELECT id, name, mobile_attendance_enabled, is_active, subscription_end_date
     FROM companies
     WHERE id = $1`,
    [companyId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Company not found', 404);
  }
  return result.rows[0];
}

async function loadBranchForMobile(companyId, branchId) {
  const result = await pool.query(
    `SELECT id, company_id, name, latitude, longitude, geofence_radius_m, mobile_attendance_enabled
     FROM branches
     WHERE company_id = $1 AND id = $2`,
    [companyId, branchId]
  );
  if (result.rowCount === 0) {
    throw mobileReject('BRANCH_NOT_FOUND', 'Branch not found', 404);
  }
  return result.rows[0];
}

async function loadEmployeeForMobile(companyId, employeeId) {
  const result = await pool.query(
    `SELECT id, company_id, branch_id, name, employee_code, status, attendance_channel, shift_id
     FROM employees
     WHERE company_id = $1 AND id = $2`,
    [companyId, employeeId]
  );
  if (result.rowCount === 0) {
    throw new AppError('Employee not found', 404);
  }
  return result.rows[0];
}

function assertEmployeeMobileEligible({ company, employee }) {
  if (!company.mobile_attendance_enabled) {
    throw mobileReject(
      'MOBILE_DISABLED',
      'Mobile attendance is not enabled for your company. Contact HR.'
    );
  }

  if (!isSubscriptionAllowed(company)) {
    throw mobileReject(
      'SUBSCRIPTION_EXPIRED',
      'Subscription has expired. Please contact HR to renew.'
    );
  }

  if (String(employee.status) !== 'active') {
    throw mobileReject('EMPLOYEE_INACTIVE', 'Your employee account is not active.');
  }

  if (!isEmployeeChannelAllowed(employee.attendance_channel)) {
    throw mobileReject(
      'EMPLOYEE_CHANNEL_NOT_MOBILE',
      'Mobile attendance is not enabled for your profile. Contact HR.'
    );
  }
}

/**
 * Assert company, branch, and employee are eligible for mobile punch.
 * @throws {AppError} with stable `code` for mobile clients
 */
function assertMobilePunchAllowed({ company, branch, employee, qrBranchId }) {
  assertEmployeeMobileEligible({ company, employee });

  if (!branch.mobile_attendance_enabled) {
    throw mobileReject(
      'BRANCH_MOBILE_DISABLED',
      'Mobile attendance is disabled for this branch.'
    );
  }

  const employeeBranchId = Number(employee.branch_id);
  const punchBranchId = Number(qrBranchId);
  if (employeeBranchId !== punchBranchId) {
    throw mobileReject(
      'BRANCH_MISMATCH',
      'You must punch at your assigned branch location.'
    );
  }
}

function assertHrBranchAccess(branchId, allowedBranchIds) {
  if (allowedBranchIds == null) return;
  if (!allowedBranchIds.includes(Number(branchId))) {
    throw new AppError('Branch not found', 404);
  }
}

module.exports = {
  MOBILE_CHANNELS,
  isEmployeeChannelAllowed,
  loadCompanyForMobile,
  loadBranchForMobile,
  loadEmployeeForMobile,
  assertEmployeeMobileEligible,
  assertMobilePunchAllowed,
  assertHrBranchAccess,
  mobileReject,
};
