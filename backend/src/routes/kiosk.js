const express = require('express');
const multer = require('multer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const {
  activateKiosk,
  getKioskStatus,
  getKioskPreferences,
  updateKioskPreferencesHandler,
  kioskFaceRecognize,
  kioskFaceGallery,
  kioskMarkPunch,
  kioskFacePunch,
  listKioskEmployees,
  createKioskEmployeeHandler,
  enrollKioskEmployeeFace,
  removeKioskEmployeeFace,
  getKioskAttendanceLogs,
} = require('../controllers/kioskController');
const {
  authenticateKiosk,
  authenticateKioskSettings,
} = require('../middleware/kioskAuth');
const {
  getKioskAppRelease,
  downloadKioskAppRelease,
} = require('../controllers/kioskApkController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const kioskPunchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.KIOSK_PUNCH_RATE_LIMIT_MAX || '30', 10),
  keyGenerator: (req) =>
    req.kiosk?.id
      ? `kiosk-punch:${req.kiosk.id}`
      : `kiosk-punch:${ipKeyGenerator(req.ip)}`,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many punch attempts. Please wait.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/app-release', authenticateKiosk, getKioskAppRelease);
router.get('/app-release/apk', authenticateKiosk, downloadKioskAppRelease);
router.post('/activate', activateKiosk);
router.get('/status', authenticateKiosk, getKioskStatus);
router.post(
  '/settings/verify',
  authenticateKiosk,
  authenticateKioskSettings,
  (_req, res) => res.json({ success: true })
);
router.get(
  '/employees',
  authenticateKiosk,
  authenticateKioskSettings,
  listKioskEmployees
);
router.post(
  '/employees',
  authenticateKiosk,
  authenticateKioskSettings,
  createKioskEmployeeHandler
);
router.post(
  '/employees/:employeeId/face',
  authenticateKiosk,
  authenticateKioskSettings,
  upload.single('image'),
  enrollKioskEmployeeFace
);
router.delete(
  '/employees/:employeeId/face',
  authenticateKiosk,
  authenticateKioskSettings,
  removeKioskEmployeeFace
);
router.get(
  '/attendance-logs',
  authenticateKiosk,
  authenticateKioskSettings,
  getKioskAttendanceLogs
);
router.get(
  '/preferences',
  authenticateKiosk,
  authenticateKioskSettings,
  getKioskPreferences
);
router.patch(
  '/preferences',
  authenticateKiosk,
  authenticateKioskSettings,
  updateKioskPreferencesHandler
);
router.get('/face-gallery', authenticateKiosk, kioskFaceGallery);
router.post(
  '/recognize',
  authenticateKiosk,
  kioskPunchLimiter,
  upload.single('image'),
  kioskFaceRecognize
);
router.post(
  '/mark',
  authenticateKiosk,
  kioskPunchLimiter,
  kioskMarkPunch
);
router.post(
  '/punch',
  authenticateKiosk,
  kioskPunchLimiter,
  upload.single('image'),
  kioskFacePunch
);

module.exports = router;
