const {
  getDailyAttendance,
  getMonthlyAttendance,
  addManualPunch,
  addManualFullDay,
  addManualFullDayBulk,
  updatePunch,
  deletePunch,
} = require('../services/attendanceService');
const { pool } = require('../config/database');

async function resolveBranchScopeForAttendance({ companyId, allowedBranchIds, requestedBranchId }) {
  // allowedBranchIds:
  // - null: admin can see all branches
  // - []: HR with no assignments (blocked by middleware)
  // - [ids]: HR assigned branches
  if (!requestedBranchId) return allowedBranchIds;

  const bid = Number(requestedBranchId);
  if (!Number.isInteger(bid) || bid < 1) {
    throw Object.assign(new Error('Invalid branch_id'), { status: 400 });
  }

  // HR must only request branches they already have access to
  if (Array.isArray(allowedBranchIds)) {
    if (!allowedBranchIds.includes(bid)) {
      throw Object.assign(new Error('Branch not allowed for your account'), { status: 403 });
    }
  }

  // Admin or HR: verify branch belongs to this company.
  const r = await pool.query(`SELECT id FROM branches WHERE company_id = $1 AND id = $2`, [companyId, bid]);
  if (r.rowCount === 0) {
    throw Object.assign(new Error('Branch not found'), { status: 404 });
  }

  return [bid];
}

/**
 * GET /api/attendance/daily?date=YYYY-MM-DD&employee_id=
 */
async function getDaily(req, res, next) {
  try {
    const companyId = req.companyId;
    const { date, employee_id: employeeId, department, branch_id: branchIdRaw } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    if (!date || typeof date !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Query "date" (YYYY-MM-DD) is required',
      });
    }

    const eid = employeeId ? Number(employeeId) : null;
    const dept = department ? String(department).trim() : null;
    const allowedBranchIds = await resolveBranchScopeForAttendance({
      companyId,
      allowedBranchIds: req.allowedBranchIds,
      requestedBranchId: branchIdRaw,
    });

    const data = await getDailyAttendance(companyId, date.trim(), eid, dept, allowedBranchIds);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/attendance/monthly?year=&month=&employee_id=
 */
async function getMonthly(req, res, next) {
  try {
    const companyId = req.companyId;
    const { year, month, employee_id: employeeId, department, branch_id: branchIdRaw } = req.query || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const y = Number(year);
    const m = Number(month);
    if (!y || !m) {
      return res.status(400).json({
        success: false,
        message: 'Query "year" and "month" are required',
      });
    }

    const eid = employeeId ? Number(employeeId) : null;
    const dept = department ? String(department).trim() : null;
    const allowedBranchIds = await resolveBranchScopeForAttendance({
      companyId,
      allowedBranchIds: req.allowedBranchIds,
      requestedBranchId: branchIdRaw,
    });

    const data = await getMonthlyAttendance(companyId, y, m, eid, dept, allowedBranchIds);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/attendance/manual-punch
 * Body: { employee_id, punch_time? (ISO from browser), date?, time?, punch_type ('in'|'out') }
 */
async function createManualPunch(req, res, next) {
  try {
    const companyId = req.companyId;
    const { employee_id: employeeId, punch_time: punchTime, date, time, punch_type: punchType } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const result = await addManualPunch(
      companyId,
      {
        employeeId,
        punch_time: punchTime,
        date,
        time,
        punchType,
      },
      req.allowedBranchIds
    );

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Manual punch recorded',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/attendance/manual-full-day
 * Body: { employee_id, date (YYYY-MM-DD) }
 */
async function createManualFullDay(req, res, next) {
  try {
    const companyId = req.companyId;
    const { employee_id: employeeId, date } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const result = await addManualFullDay(companyId, { employeeId, date }, req.allowedBranchIds);

    return res.status(201).json({
      success: true,
      data: result,
      message: `Manual full-day attendance recorded (${result.inserted} punches)`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/attendance/manual-full-day-bulk
 * Body: { employee_ids: number[], date (YYYY-MM-DD) }
 */
async function createManualFullDayBulk(req, res, next) {
  try {
    const companyId = req.companyId;
    const { employee_ids: employeeIds, date } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const result = await addManualFullDayBulk(companyId, { employeeIds, date }, req.allowedBranchIds);

    return res.status(201).json({
      success: true,
      data: result,
      message: `Marked ${result.processed} employee(s), ${result.inserted} punches recorded`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/attendance/logs/:id
 * Body: { punch_time (ISO string), punch_type ('in'|'out')? }
 */
async function updatePunchById(req, res, next) {
  try {
    const companyId = req.companyId;
    const logId = req.params.id;
    const { punch_time: punchTime, punch_type: punchType } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const updated = await updatePunch(
      companyId,
      logId,
      {
        punch_time: punchTime,
        punch_type: punchType,
      },
      req.allowedBranchIds
    );

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Punch updated',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/attendance/logs/:id
 * Deletes a punch record.
 */
async function deletePunchById(req, res, next) {
  try {
    const companyId = req.companyId;
    const logId = req.params.id;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const deleted = await deletePunch(companyId, logId, req.allowedBranchIds);

    return res.status(200).json({
      success: true,
      data: deleted,
      message: 'Punch deleted',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDaily,
  getMonthly,
  createManualPunch,
  createManualFullDay,
  createManualFullDayBulk,
  updatePunchById,
  deletePunchById,
};
