const express = require('express');
const { getShifts, createShiftHandler, updateShiftHandler, deleteShiftHandler } = require('../controllers/shiftController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withShiftAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

// GET /api/shifts
router.get('/', withShiftAuth, getShifts);

// POST /api/shifts
router.post('/', withShiftAuth, createShiftHandler);

// PUT /api/shifts/:id
router.put('/:id', withShiftAuth, updateShiftHandler);

// DELETE /api/shifts/:id
router.delete('/:id', withShiftAuth, deleteShiftHandler);

module.exports = router;

