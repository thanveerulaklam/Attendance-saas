const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
} = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');
const { requireFieldAttendanceEnabled } = require('../middleware/fieldAttendance');
const {
  getMe,
  getToday,
  getMonthlyAttendance,
  getSites,
  getFaceProfile,
  enrollFaceProfile,
  punch,
} = require('../controllers/fieldAppController');

const router = express.Router();

const employeeAuth = [
  authenticate,
  requireRole(['employee']),
  enforceCompanyFromToken,
];

const fieldPunchLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.FIELD_PUNCH_RATE_LIMIT_MAX || '20', 10),
  keyGenerator: (req) => {
    const employeeId = req.user?.employee_id ?? 'unknown';
    const companyId = req.companyId ?? 'unknown';
    return `field-punch:${companyId}:${employeeId}`;
  },
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many punch attempts. Please wait and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/me', ...employeeAuth, getMe);
router.get('/today', ...employeeAuth, getToday);
router.get('/attendance/monthly', ...employeeAuth, getMonthlyAttendance);
router.get('/sites', ...employeeAuth, requireFieldAttendanceEnabled, getSites);
router.get('/face-profile', ...employeeAuth, getFaceProfile);
router.post(
  '/face-profile',
  ...employeeAuth,
  requireActiveSubscription,
  requireFieldAttendanceEnabled,
  enrollFaceProfile
);
router.post(
  '/punch',
  ...employeeAuth,
  requireActiveSubscription,
  requireFieldAttendanceEnabled,
  fieldPunchLimiter,
  punch
);

module.exports = router;
