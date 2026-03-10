const express = require('express');
const {
  getDaily,
  getMonthly,
  createManualPunch,
  createManualFullDay,
  createManualFullDayBulk,
  updatePunchById,
  deletePunchById,
} = require('../controllers/attendanceController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/daily', withAuth, getDaily);
router.get('/monthly', withAuth, getMonthly);
router.post('/manual-punch', withAuth, createManualPunch);
router.post('/manual-full-day', withAuth, createManualFullDay);
router.post('/manual-full-day-bulk', withAuth, createManualFullDayBulk);
router.patch('/logs/:id', withAuth, updatePunchById);
router.delete('/logs/:id', withAuth, deletePunchById);

module.exports = router;
