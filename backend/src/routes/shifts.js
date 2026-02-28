const express = require('express');
const { getShifts, createShiftHandler } = require('../controllers/shiftController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withShiftAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

// GET /api/shifts
router.get('/', withShiftAuth, getShifts);

// POST /api/shifts
router.post('/', withShiftAuth, createShiftHandler);

module.exports = router;

