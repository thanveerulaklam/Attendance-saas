const express = require('express');
const {
  getCurrentCompany,
  updateCurrentCompany,
  updateSubscriptionHandler,
  listBranchesHandler,
  createBranchHandler,
  updateBranchHandler,
  deleteBranchHandler,
} = require('../controllers/companyController');
const {
  updateMobileSettings,
  updateBranchGeofence,
  getBranchQrToken,
  getMobilePunchAttempts,
  getBranchKiosk,
  createBranchKioskToken,
  updateBranchKioskSettingsPin,
  revokeBranchKioskToken,
} = require('../controllers/mobileAttendanceController');
const {
  updateFieldSettings,
  listSites,
  createSite,
  updateSite,
  removeSite,
  listFieldEmployeesHandler,
  createFieldEmployeeHandler,
  putEmployeeBeatHandler,
  listFieldBeatDaysHandler,
} = require('../controllers/fieldSiteController');
const { downloadKioskApk } = require('../controllers/kioskApkController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
} = require('../middleware/auth');
const { requireMobileAttendanceEnabledForAdmin } = require('../middleware/mobileAttendance');

const router = express.Router();

const withCompanyAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];
const withBranchScope = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];
const adminOnly = [authenticate, requireRole(['admin']), enforceCompanyFromToken];

// GET /api/company
router.get('/', withCompanyAuth, getCurrentCompany);

// PUT /api/company
router.put('/', withCompanyAuth, updateCurrentCompany);

// Branches (list: admin+hr with HR scope; create: admin only)
router.get('/branches', withBranchScope, listBranchesHandler);
router.post('/branches', adminOnly, createBranchHandler);
router.patch('/branches/:id', adminOnly, updateBranchHandler);
router.delete('/branches/:id', adminOnly, deleteBranchHandler);

// POST /api/company/subscription (admin only)
router.post('/subscription', adminOnly, updateSubscriptionHandler);

// Mobile attendance settings (admin only; default off)
router.patch('/mobile-settings', adminOnly, updateMobileSettings);

// Office tablet APK (admin only; requires face attendance enabled)
router.get(
  '/kiosk-apk',
  adminOnly,
  requireMobileAttendanceEnabledForAdmin,
  downloadKioskApk
);

// Branch geofence + per-branch mobile toggle (admin only)
router.patch('/branches/:id/geofence', adminOnly, updateBranchGeofence);

// Rotating QR nonce for kiosk display (admin + HR)
router.get(
  '/branches/:id/qr-token',
  withBranchScope,
  requireMobileAttendanceEnabledForAdmin,
  getBranchQrToken
);

// Mobile punch attempt audit log (admin + HR) — QR mobile, kiosk, and field
router.get(
  '/mobile-punch-attempts',
  withBranchScope,
  getMobilePunchAttempts
);

// PunchPay Field sites (admin CRUD; HR can list)
router.patch('/field-settings', adminOnly, updateFieldSettings);
router.get('/field-sites', withCompanyAuth, listSites);
router.post('/field-sites', adminOnly, createSite);
router.patch('/field-sites/:id', adminOnly, updateSite);
router.delete('/field-sites/:id', adminOnly, removeSite);
router.get('/field-employees', withCompanyAuth, listFieldEmployeesHandler);
router.post('/field-employees', withCompanyAuth, createFieldEmployeeHandler);
router.patch('/field-employees/:id/beat', withCompanyAuth, putEmployeeBeatHandler);
router.get('/field-beat-days', withCompanyAuth, listFieldBeatDaysHandler);

// Kiosk tablet pairing (admin only)
router.get('/branches/:id/kiosk', adminOnly, getBranchKiosk);
router.post('/branches/:id/kiosk', adminOnly, createBranchKioskToken);
router.patch('/branches/:id/kiosk/pin', adminOnly, updateBranchKioskSettingsPin);
router.delete('/branches/:id/kiosk', adminOnly, revokeBranchKioskToken);

module.exports = router;

