const cron = require('node-cron');
const { pool } = require('../config/database');
const { todayIstYmd } = require('../utils/istDate');
const { isWhatsAppConfigured } = require('../services/whatsappService');
const { sendDailyAttendanceForCompany } = require('../services/dailyAttendanceWhatsappService');
const { isSubscriptionAllowed } = require('../services/companyService');

let scheduledTask = null;

async function loadCompaniesDueForSend(dateYmd) {
  const result = await pool.query(
    `SELECT id, name, phone, is_active, subscription_start_date, subscription_end_date,
            whatsapp_auto_enabled, whatsapp_primary_number, whatsapp_secondary_number,
            whatsapp_last_sent_for_date, whatsapp_last_sent_at
     FROM companies
     WHERE whatsapp_auto_enabled = TRUE
       AND (whatsapp_last_sent_for_date IS DISTINCT FROM $1::date)`,
    [dateYmd]
  );
  return result.rows;
}

async function runDailyWhatsappStatsJob() {
  if (!isWhatsAppConfigured()) {
    console.warn('[whatsapp-job] Skipped: WHATSAPP_ENABLED or credentials not set');
    return { ran: false, reason: 'not_configured' };
  }

  const dateYmd = todayIstYmd();
  console.log(`[whatsapp-job] Starting daily send for ${dateYmd} (IST)`);

  const companies = await loadCompaniesDueForSend(dateYmd);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const company of companies) {
    if (!isSubscriptionAllowed(company)) {
      skipped += 1;
      console.log(`[whatsapp-job] company=${company.id} skipped (subscription)`);
      continue;
    }

    try {
      const result = await sendDailyAttendanceForCompany(company, { dateYmd });
      if (result.skipped) {
        skipped += 1;
      } else {
        sent += 1;
        console.log(
          `[whatsapp-job] company=${company.id} (${company.name}) sent to ${result.recipients?.filter((r) => r.ok).length || 0} recipient(s)`
        );
      }
    } catch (err) {
      failed += 1;
      console.error(`[whatsapp-job] company=${company.id} failed:`, err.message);
    }
  }

  const summary = { dateYmd, total: companies.length, sent, skipped, failed };
  console.log('[whatsapp-job] Done', summary);
  return { ran: true, ...summary };
}

function startDailyWhatsappStatsScheduler() {
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    console.log('[whatsapp-job] Scheduler not started (WHATSAPP_ENABLED is not true)');
    return;
  }

  const cronExpr = process.env.WHATSAPP_DAILY_CRON || '0 11 * * *';
  const timezone = process.env.WHATSAPP_DAILY_TIMEZONE || 'Asia/Kolkata';

  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(
    cronExpr,
    () => {
      runDailyWhatsappStatsJob().catch((err) => {
        console.error('[whatsapp-job] Unhandled error:', err);
      });
    },
    { timezone }
  );

  console.log(`[whatsapp-job] Scheduled "${cronExpr}" (${timezone})`);
}

function stopDailyWhatsappStatsScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  startDailyWhatsappStatsScheduler,
  stopDailyWhatsappStatsScheduler,
  runDailyWhatsappStatsJob,
};
