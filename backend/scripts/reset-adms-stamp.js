#!/usr/bin/env node
/**
 * Reset ADMS ATTLOG stamp for a device (forces re-upload of buffered punches).
 * Usage: node scripts/reset-adms-stamp.js GED7234200345
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');

const admsSn = String(process.argv[2] || '').trim().toUpperCase();
if (!admsSn) {
  console.error('Usage: node scripts/reset-adms-stamp.js <ADMS_SERIAL>');
  process.exit(1);
}

(async () => {
  const before = await pool.query(
    `SELECT id, name, adms_sn, adms_attlog_stamp, last_seen_at
     FROM devices WHERE adms_sn = $1`,
    [admsSn]
  );
  if (before.rowCount === 0) {
    console.error(`No device found with adms_sn=${admsSn}`);
    process.exit(1);
  }
  console.log('Before:', before.rows[0]);

  const updated = await pool.query(
    `UPDATE devices SET adms_attlog_stamp = '0' WHERE adms_sn = $1
     RETURNING id, name, adms_sn, adms_attlog_stamp, last_seen_at`,
    [admsSn]
  );
  console.log('After:', updated.rows[0]);
  console.log('Done. Reboot the biometric device (Cloud Server Save + reboot).');
  await pool.end();
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
