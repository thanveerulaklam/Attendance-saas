const express = require('express');
const {
  getHolidays,
  createHolidayHandler,
  deleteHolidayHandler,
  getWeeklyOffHandler,
  putWeeklyOffHandler,
} = require('../controllers/holidayController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withHolidayAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/', withHolidayAuth, getHolidays);
router.post('/', withHolidayAuth, createHolidayHandler);
router.delete('/:id', withHolidayAuth, deleteHolidayHandler);

router.get('/weekly-off', withHolidayAuth, getWeeklyOffHandler);
router.put('/weekly-off', withHolidayAuth, putWeeklyOffHandler);

module.exports = router;

