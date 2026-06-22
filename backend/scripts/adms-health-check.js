#!/usr/bin/env node
/**
 * ADMS punch pipeline health — run daily via cron (e.g. 10:30 IST).
 * Flags: devices with rejections, devices online but no imports today, force-sync stuck.
 *
 * Usage: node scripts/adms-health-check.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const { SQL_PUNCH_IST_DATE } = require('../src/utils/istDate');

(async () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const rejections = await pool.query(
    `SELECT company_id, adms_sn, reason, COUNT(*)::int AS cnt
     FROM adms_punch_rejections
     WHERE created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY company_id, adms_sn, reason
     ORDER BY cnt DESC`
  );

  const stuckFullSync = await pool.query(
    `SELECT id, company_id, name, adms_sn, adms_attlog_stamp, last_seen_at
     FROM devices
     WHERE is_active = TRUE AND adms_sn IS NOT NULL AND adms_force_full_sync = TRUE
     ORDER BY last_seen_at DESC`
  );

  const onlineNoImports = await pool.query(
    `SELECT d.id, d.company_id, d.name, d.adms_sn, d.last_seen_at,
            COALESCE(p.cnt, 0)::int AS punches_today
     FROM devices d
     LEFT JOIN (
       SELECT device_id, COUNT(*)::int AS cnt
       FROM attendance_logs
       WHERE ${SQL_PUNCH_IST_DATE} = $1::date
       GROUP BY device_id
     ) p ON p.device_id = d.id::text
     WHERE d.is_active = TRUE AND d.adms_sn IS NOT NULL
       AND d.last_seen_at >= NOW() - INTERVAL '2 hours'
     ORDER BY punches_today ASC, d.last_seen_at DESC`,
    [today]
  );

  let issues = 0;

  if (rejections.rowCount > 0) {
    issues += rejections.rowCount;
    console.log('\n=== ADMS punch rejections (24h) — action required ===');
    for (const row of rejections.rows) {
      console.log(row);
    }
  }

  if (stuckFullSync.rowCount > 0) {
    issues += stuckFullSync.rowCount;
    console.log('\n=== Devices stuck in full-sync mode ===');
    for (const row of stuckFullSync.rows) {
      console.log(row);
    }
  }

  const silent = onlineNoImports.rows.filter(
    (r) => r.punches_today === 0 && r.last_seen_at
  );
  if (silent.length > 0) {
    issues += silent.length;
    console.log(`\n=== Devices polled recently but 0 punches imported today (${today}) ===`);
    for (const row of silent) {
      console.log(row);
    }
  }

  if (issues === 0) {
    console.log(`ADMS health OK for ${today}`);
  } else {
    console.log(`\nTotal issue groups: ${issues}`);
    process.exitCode = 1;
  }

  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
