#!/usr/bin/env node
/**
 * Re-import ADMS punches stored as unknown_code (after code-matching fixes).
 * Usage: node scripts/replay-unknown-code-punches.js [device_id]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { replayUnknownCodePunchesForDevice } = require('../src/services/deviceService');
const { pool } = require('../src/config/database');

const deviceId = process.argv[2] ? Number(process.argv[2]) : null;

(async () => {
  let ids = [];
  if (deviceId) {
    ids = [deviceId];
  } else {
    const r = await pool.query(
      `SELECT DISTINCT device_id
       FROM adms_punch_rejections
       WHERE reason = 'unknown_code'
         AND punch_time IS NOT NULL
         AND created_at >= NOW() - INTERVAL '14 days'
         AND device_id IS NOT NULL`
    );
    ids = r.rows.map((row) => Number(row.device_id));
  }

  for (const id of ids) {
    const result = await replayUnknownCodePunchesForDevice(id);
    console.log(`device ${id}:`, result);
  }
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
