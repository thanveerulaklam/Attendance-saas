const { testConnection } = require('../config/database');

/**
 * GET /api/health
 * Returns service and database status.
 */
async function getHealth(_req, res, next) {
  try {
    const dbOk = await testConnection();
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbOk ? 'connected' : 'disconnected',
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHealth };
