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
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
  requireHrBranchForMutation,
} = require('../middleware/auth');

const router = express.Router();

const withAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

router.get('/daily', withAuth, getDaily);
router.get('/monthly', withAuth, getMonthly);
router.post('/manual-punch', withAuth, requireHrBranchForMutation, createManualPunch);
router.post('/manual-full-day', withAuth, requireHrBranchForMutation, createManualFullDay);
router.post('/manual-full-day-bulk', withAuth, requireHrBranchForMutation, createManualFullDayBulk);
router.patch('/logs/:id', withAuth, requireHrBranchForMutation, updatePunchById);
router.delete('/logs/:id', withAuth, requireHrBranchForMutation, deletePunchById);

module.exports = router;
