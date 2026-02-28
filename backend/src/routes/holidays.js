const express = require('express');
const {
  getHolidays,
  createHolidayHandler,
  deleteHolidayHandler,
} = require('../controllers/holidayController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withHolidayAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/', withHolidayAuth, getHolidays);
router.post('/', withHolidayAuth, createHolidayHandler);
router.delete('/:id', withHolidayAuth, deleteHolidayHandler);

module.exports = router;

