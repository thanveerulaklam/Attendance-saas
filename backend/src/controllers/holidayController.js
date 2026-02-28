const { listHolidays, createHoliday, deleteHoliday } = require('../services/holidayService');

async function getHolidays(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const { year, month } = req.query || {};
    const holidays = await listHolidays(companyId, { year, month });

    return res.json({
      success: true,
      data: holidays,
    });
  } catch (err) {
    next(err);
  }
}

async function createHolidayHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const created = await createHoliday(companyId, req.body || {});

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteHolidayHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    await deleteHoliday(companyId, Number(id));

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHolidays,
  createHolidayHandler,
  deleteHolidayHandler,
};

