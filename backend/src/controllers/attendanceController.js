const {
  getDailyAttendance,
  getMonthlyAttendance,
  addManualPunch,
  addManualFullDay,
  addManualFullDayBulk,
} = require('../services/attendanceService');

/**
 * GET /api/attendance/daily?date=YYYY-MM-DD&employee_id=
 */
async function getDaily(req, res, next) {
  try {
    const companyId = req.companyId;
    const { date, employee_id: employeeId } = req.query || {};

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
    const data = await getDailyAttendance(companyId, date.trim(), eid);

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
    const { year, month, employee_id: employeeId } = req.query || {};

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
    const data = await getMonthlyAttendance(companyId, y, m, eid);

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
 * Body: { employee_id, date (YYYY-MM-DD), time (HH:mm), punch_type ('in'|'out') }
 */
async function createManualPunch(req, res, next) {
  try {
    const companyId = req.companyId;
    const { employee_id: employeeId, date, time, punch_type: punchType } = req.body || {};

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const result = await addManualPunch(companyId, {
      employeeId,
      date,
      time,
      punchType,
    });

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

    const result = await addManualFullDay(companyId, { employeeId, date });

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

    const result = await addManualFullDayBulk(companyId, { employeeIds, date });

    return res.status(201).json({
      success: true,
      data: result,
      message: `Marked ${result.processed} employee(s), ${result.inserted} punches recorded`,
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
};
