const cron = require('node-cron');
const { pool } = require('../config/database');
const { todayIstYmd } = require('../utils/istDate');
const { currentIstHour } = require('../utils/whatsappSendTime');
const { isWhatsAppConfigured } = require('../services/whatsappService');
const { sendDailyAttendanceForCompany } = require('../services/dailyAttendanceWhatsappService');
const { isSubscriptionAllowed } = require('../services/companyService');

const WHATSAPP_JOB_LOCK_ID = 84001101;

let scheduledTask = null;

async function tryAcquireJobLock(client) {
  const r = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [WHATSAPP_JOB_LOCK_ID]);
  return Boolean(r.rows[0]?.locked);
}

async function releaseJobLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [WHATSAPP_JOB_LOCK_ID]);
}

async function loadCompaniesDueForSend(dateYmd, hourIst) {
  const result = await pool.query(
    `SELECT id, name, phone, is_active, subscription_start_date, subscription_end_date,
            whatsapp_auto_enabled, whatsapp_primary_number, whatsapp_secondary_number,
            whatsapp_send_time, whatsapp_last_sent_for_date, whatsapp_last_sent_at
     FROM companies
     WHERE whatsapp_auto_enabled = TRUE
       AND (whatsapp_last_sent_for_date IS DISTINCT FROM $1::date)
       AND EXTRACT(HOUR FROM whatsapp_send_time)::int = $2`,
    [dateYmd, hourIst]
  );
  return result.rows;
}

async function runDailyWhatsappStatsJob() {
  if (!isWhatsAppConfigured()) {
    console.warn('[whatsapp-job] Skipped: WHATSAPP_ENABLED or credentials not set');
    return { ran: false, reason: 'not_configured' };
  }

  const client = await pool.connect();
  let locked = false;

  try {
    locked = await tryAcquireJobLock(client);
    if (!locked) {
      return { ran: false, reason: 'lock_held' };
    }

    const dateYmd = todayIstYmd();
    const hourIst = currentIstHour();
    console.log(`[whatsapp-job] Hourly tick ${dateYmd} ${hourIst}:00 IST`);

    const companies = await loadCompaniesDueForSend(dateYmd, hourIst);
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

    const summary = { dateYmd, hourIst, total: companies.length, sent, skipped, failed };
    console.log('[whatsapp-job] Done', summary);
    return { ran: true, ...summary };
  } finally {
    if (locked) {
      await releaseJobLock(client);
    }
    client.release();
  }
}

function startDailyWhatsappStatsScheduler() {
  if (process.env.WHATSAPP_ENABLED !== 'true') {
    console.log('[whatsapp-job] Scheduler not started (WHATSAPP_ENABLED is not true)');
    return;
  }

  const cronExpr = process.env.WHATSAPP_HOURLY_CRON || '0 * * * *';
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

  console.log(`[whatsapp-job] Scheduled hourly "${cronExpr}" (${timezone}), per-company send hour`);
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
