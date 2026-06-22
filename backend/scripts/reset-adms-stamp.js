#!/usr/bin/env node
/**
 * Reset ADMS ATTLOG stamp and force full re-upload (keeps ATTLOGStamp=0 until device sends empty POST).
 * Usage: node scripts/reset-adms-stamp.js GED7234200345 [GED7234201039 ...]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const { startForceFullSync } = require('../src/services/admsStampService');

const sns = process.argv.slice(2).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
if (sns.length === 0) {
  console.error('Usage: node scripts/reset-adms-stamp.js <ADMS_SERIAL> [more...]');
  process.exit(1);
}

(async () => {
  for (const admsSn of sns) {
    const before = await pool.query(
      `SELECT id, name, adms_sn, adms_attlog_stamp, adms_force_full_sync, last_seen_at
       FROM devices WHERE adms_sn = $1`,
      [admsSn]
    );
    if (before.rowCount === 0) {
      console.error(`Not found: ${admsSn}`);
      continue;
    }
    console.log('Before:', before.rows[0]);
    await startForceFullSync(admsSn);
    const after = await pool.query(
      `SELECT id, name, adms_sn, adms_attlog_stamp, adms_force_full_sync, last_seen_at
       FROM devices WHERE adms_sn = $1`,
      [admsSn]
    );
    console.log('After:', after.rows[0]);
  }
  console.log('Done. Reboot each biometric device (Cloud Server Save + reboot).');
  console.log('Watch: pm2 logs attendance-api | grep -E "imported|full sync"');
  await pool.end();
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
