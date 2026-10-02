const { AppError } = require('../utils/AppError');
const {
  getFieldMe,
  getEmployeeTodaySummary,
  getEmployeeMonthlySummary,
  processFieldPunch,
} = require('../services/fieldPunchService');
const { parseFieldPunchBody } = require('../validators/fieldPunchValidator');
const { parseMonthlyQuery } = require('../validators/mobilePunchValidator');
const { parseBeatBody } = require('../validators/fieldBeatValidator');
const {
  getMobileFaceProfile,
  saveMobileFaceProfile,
} = require('../services/faceEnrollmentService');
const { listAssignedFieldSites } = require('../services/fieldSiteService');
const {
  getBeatToday,
  processBeatAction,
} = require('../services/fieldBeatService');

function requireEmployeeId(req) {
  const employeeId = Number(req.user?.employee_id);
  if (!employeeId) {
    throw new AppError('Employee profile not linked to this account', 403);
  }
  return employeeId;
}

async function getMe(req, res, next) {
  try {
    const employeeId = requireEmployeeId(req);
    const data = await getFieldMe(req.companyId, employeeId);
    if (data.employee?.field_beat_enabled) {
      data.beat = await getBeatToday(req.companyId, employeeId);
    }
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getToday(req, res, next) {
  try {
    const data = await getEmployeeTodaySummary(req.companyId, requireEmployeeId(req));
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getMonthlyAttendance(req, res, next) {
  try {
    const { year, month } = parseMonthlyQuery(req.query);
    const data = await getEmployeeMonthlySummary(
      req.companyId,
      requireEmployeeId(req),
      year,
      month
    );
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getSites(req, res, next) {
  try {
    const employeeId = requireEmployeeId(req);
    const sites = await listAssignedFieldSites(req.companyId, employeeId);
    return res.json({ success: true, data: { sites } });
  } catch (err) {
    return next(err);
  }
}

async function getFaceProfile(req, res, next) {
  try {
    const employeeId = requireEmployeeId(req);
    const profile = await getMobileFaceProfile(req.companyId, employeeId);
    return res.json({
      success: true,
      data: {
        enrolled: Boolean(profile),
        profile: profile
          ? {
              model: profile.model,
              dimension: profile.dimension,
              embeddings: profile.embeddings,
              enrolled_at: profile.enrolled_at,
            }
          : null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function enrollFaceProfile(req, res, next) {
  try {
    const employeeId = requireEmployeeId(req);
    const result = await saveMobileFaceProfile(
      req.companyId,
      employeeId,
      req.body || {},
      req.user?.user_id || null
    );
    return res.status(201).json({
      success: true,
      data: result.enrollment,
      message: 'Face registered',
    });
  } catch (err) {
    return next(err);
  }
}

async function punch(req, res, next) {
  try {
    const employeeId = requireEmployeeId(req);
    const body = parseFieldPunchBody(req.body);
    const result = await processFieldPunch(req.companyId, employeeId, body, req.ip || null);
    return res.status(201).json({
      success: true,
      data: {
        punch: result.punch,
        today: result.today,
        site: result.site,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getBeatTodayHandler(req, res, next) {
  try {
    const data = await getBeatToday(req.companyId, requireEmployeeId(req));
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function beatStart(req, res, next) {
  try {
    const body = parseBeatBody(req.body);
    const result = await processBeatAction(
      req.companyId,
      requireEmployeeId(req),
      'start',
      body,
      req.ip || null
    );
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function beatVisit(req, res, next) {
  try {
    const body = parseBeatBody(req.body);
    const result = await processBeatAction(
      req.companyId,
      requireEmployeeId(req),
      'visit',
      body,
      req.ip || null
    );
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

async function beatEnd(req, res, next) {
  try {
    const body = parseBeatBody(req.body);
    const result = await processBeatAction(
      req.companyId,
      requireEmployeeId(req),
      'end',
      body,
      req.ip || null
    );
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMe,
  getToday,
  getMonthlyAttendance,
  getSites,
  getFaceProfile,
  enrollFaceProfile,
  punch,
  getBeatTodayHandler,
  beatStart,
  beatVisit,
  beatEnd,
};
