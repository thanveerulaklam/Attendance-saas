const { pool } = require('../config/database');

async function getDeviceAdmsState(admsSn) {
  if (!admsSn) return { stamp: '0', forceFullSync: false };
  const result = await pool.query(
    `SELECT adms_attlog_stamp, adms_force_full_sync
     FROM devices WHERE adms_sn = $1 AND is_active = TRUE`,
    [admsSn]
  );
  const row = result.rows[0];
  if (!row) return { stamp: '0', forceFullSync: false };
  const stamp =
    row.adms_attlog_stamp != null && String(row.adms_attlog_stamp).trim() !== ''
      ? String(row.adms_attlog_stamp).trim()
      : '0';
  return { stamp, forceFullSync: row.adms_force_full_sync === true };
}

async function getAttlogStamp(admsSn) {
  const { stamp, forceFullSync } = await getDeviceAdmsState(admsSn);
  if (forceFullSync) return '0';
  return stamp;
}

async function isForceFullSync(admsSn) {
  const { forceFullSync } = await getDeviceAdmsState(admsSn);
  return forceFullSync;
}

async function persistAttlogStamp(admsSn, stamp) {
  if (!admsSn) return;
  if (await isForceFullSync(admsSn)) return;
  const normalized = stamp != null && String(stamp).trim() !== '' ? String(stamp).trim() : '0';
  await pool.query(
    `UPDATE devices
     SET adms_attlog_stamp = $2, last_seen_at = NOW()
     WHERE adms_sn = $1`,
    [admsSn, normalized]
  );
}

async function startForceFullSync(admsSn) {
  if (!admsSn) return;
  await pool.query(
    `UPDATE devices
     SET adms_attlog_stamp = '0', adms_force_full_sync = TRUE, last_seen_at = NOW()
     WHERE adms_sn = $1`,
    [admsSn]
  );
}

async function completeForceFullSync(admsSn, stamp) {
  if (!admsSn) return;
  const normalized = stamp != null && String(stamp).trim() !== '' ? String(stamp).trim() : '0';
  await pool.query(
    `UPDATE devices
     SET adms_attlog_stamp = $2, adms_force_full_sync = FALSE, last_seen_at = NOW()
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
  const { stamp, forceFullSync } = await getDeviceAdmsState(admsSn);
  return forceFullSync || stamp === '0';
}

module.exports = {
  getAttlogStamp,
  isForceFullSync,
  persistAttlogStamp,
  startForceFullSync,
  completeForceFullSync,
  touchAdmsDevice,
  shouldBootstrapPush,
};
