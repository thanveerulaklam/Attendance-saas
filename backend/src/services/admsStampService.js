const { pool } = require('../config/database');

async function getAttlogStamp(admsSn) {
  if (!admsSn) return '0';
  const result = await pool.query(
    `SELECT adms_attlog_stamp FROM devices WHERE adms_sn = $1 AND is_active = TRUE`,
    [admsSn]
  );
  const stamp = result.rows[0]?.adms_attlog_stamp;
  return stamp != null && String(stamp).trim() !== '' ? String(stamp).trim() : '0';
}

async function persistAttlogStamp(admsSn, stamp) {
  if (!admsSn) return;
  const normalized = stamp != null && String(stamp).trim() !== '' ? String(stamp).trim() : '0';
  await pool.query(
    `UPDATE devices
     SET adms_attlog_stamp = $2, last_seen_at = NOW()
     WHERE adms_sn = $1`,
    [admsSn, normalized]
  );
}

async function touchAdmsDevice(admsSn) {
  if (!admsSn) return;
  await pool.query(`UPDATE devices SET last_seen_at = NOW() WHERE adms_sn = $1`, [admsSn]);
}

/** True while device has never completed a stamp sync (first-time ADMS upload). */
async function shouldBootstrapPush(admsSn) {
  const stamp = await getAttlogStamp(admsSn);
  return stamp === '0';
}

module.exports = {
  getAttlogStamp,
  persistAttlogStamp,
  touchAdmsDevice,
  shouldBootstrapPush,
};
