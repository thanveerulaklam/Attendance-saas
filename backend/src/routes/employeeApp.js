const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
} = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');
const { requireMobileAttendanceEnabled } = require('../middleware/mobileAttendance');
const {
  getMe,
  getToday,
  getMonthlyAttendance,
  punch,
} = require('../controllers/employeeAppController');

const router = express.Router();

const employeeAuth = [
  authenticate,
  requireRole(['employee']),
  enforceCompanyFromToken,
];

const employeePunchLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.MOBILE_PUNCH_RATE_LIMIT_MAX || '10', 10),
  keyGenerator: (req) => {
    const employeeId = req.user?.employee_id ?? 'unknown';
    const companyId = req.companyId ?? 'unknown';
    return `mobile-punch:${companyId}:${employeeId}`;
  },
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many punch attempts. Please wait and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Employee self-service API (mobile app).
router.get('/ping', ...employeeAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      user_id: req.user.user_id,
      employee_id: req.user.employee_id || null,
      company_id: req.companyId,
    },
  });
});

router.get('/me', ...employeeAuth, getMe);

router.get('/today', ...employeeAuth, getToday);

router.get('/attendance/monthly', ...employeeAuth, getMonthlyAttendance);

router.post(
  '/punch',
  ...employeeAuth,
  requireActiveSubscription,
  requireMobileAttendanceEnabled,
  employeePunchLimiter,
  punch
);

module.exports = router;
