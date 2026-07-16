const { AppError } = require('../utils/AppError');
const {
  getEmployeeMe,
  getEmployeeTodaySummary,
  getEmployeeMonthlySummary,
  processMobilePunch,
} = require('../services/mobilePunchService');
const { parseMobilePunchBody, parseMonthlyQuery } = require('../validators/mobilePunchValidator');

function requireEmployeeId(req) {
  const employeeId = Number(req.user?.employee_id);
  if (!employeeId) {
    throw new AppError('Employee profile not linked to this account', 403);
  }
  return employeeId;
}

async function getMe(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = requireEmployeeId(req);
    const data = await getEmployeeMe(companyId, employeeId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getToday(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = requireEmployeeId(req);
    const data = await getEmployeeTodaySummary(companyId, employeeId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getMonthlyAttendance(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = requireEmployeeId(req);
    const { year, month } = parseMonthlyQuery(req.query);
    const data = await getEmployeeMonthlySummary(companyId, employeeId, year, month);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function punch(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = requireEmployeeId(req);
    const body = parseMobilePunchBody(req.body);
    const clientIp = req.ip || null;
    const result = await processMobilePunch(companyId, employeeId, body, clientIp);
    return res.status(201).json({
      success: true,
      data: {
        punch: result.punch,
        today: result.today,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMe,
  getToday,
  getMonthlyAttendance,
  punch,
};
