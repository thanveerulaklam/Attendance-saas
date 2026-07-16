const cron = require('node-cron');
const { cleanupExpiredNonces } = require('../services/mobileQrService');

let scheduledTask = null;

async function runMobileQrCleanupJob() {
  const olderThanDays = Number(process.env.MOBILE_QR_CLEANUP_OLDER_THAN_DAYS || 1);
  try {
    const deleted = await cleanupExpiredNonces(olderThanDays);
    if (deleted > 0) {
      console.log(`[mobile-qr-cleanup] Removed ${deleted} expired nonce(s)`);
    }
  } catch (err) {
    console.error('[mobile-qr-cleanup] Failed:', err?.message || err);
  }
}

function startMobileQrCleanupScheduler() {
  if (process.env.MOBILE_QR_CLEANUP_ENABLED === 'false') {
    return;
  }

  const cronExpr = process.env.MOBILE_QR_CLEANUP_CRON || '0 3 * * *';
  const timezone = process.env.MOBILE_QR_CLEANUP_TIMEZONE || 'Asia/Kolkata';

  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(
    cronExpr,
    () => {
      runMobileQrCleanupJob();
    },
    { timezone }
  );

  console.log(`[mobile-qr-cleanup] Scheduled "${cronExpr}" (${timezone})`);
}

function stopMobileQrCleanupScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  runMobileQrCleanupJob,
  startMobileQrCleanupScheduler,
  stopMobileQrCleanupScheduler,
};
