const crypto = require('crypto');
const { pool } = require('../config/database');
const { mobileReject } = require('./mobileAttendanceService');

const QR_TTL_SECONDS = Number(process.env.MOBILE_QR_TTL_SECONDS || 120);

function buildQrPayload(companyId, branchId, nonce, expiresAt) {
  return {
    v: 1,
    company_id: Number(companyId),
    branch_id: Number(branchId),
    nonce,
    exp: Math.floor(new Date(expiresAt).getTime() / 1000),
  };
}

async function issueQrNonce(companyId, branchId) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);

  await pool.query(
    `INSERT INTO mobile_qr_nonces (company_id, branch_id, nonce, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [companyId, branchId, nonce, expiresAt.toISOString()]
  );

  return {
    nonce,
    expires_at: expiresAt.toISOString(),
    qr_payload: buildQrPayload(companyId, branchId, nonce, expiresAt),
    ttl_seconds: QR_TTL_SECONDS,
  };
}

/**
 * Look up a valid QR nonce without consuming it.
 * @returns {{ id: number, branch_id: number, company_id: number }}
 */
async function findValidQrNonce(nonce, companyId) {
  const normalized = String(nonce || '').trim();
  if (!normalized) {
    throw mobileReject('QR_INVALID', 'QR code is invalid. Scan again.', 422);
  }

  const result = await pool.query(
    `SELECT id, company_id, branch_id, nonce, expires_at
     FROM mobile_qr_nonces
     WHERE nonce = $1`,
    [normalized]
  );

  if (result.rowCount === 0) {
    throw mobileReject('QR_INVALID', 'QR code is invalid. Scan again.', 422);
  }

  const row = result.rows[0];
  if (Number(row.company_id) !== Number(companyId)) {
    throw mobileReject('QR_INVALID', 'QR code is invalid. Scan again.', 422);
  }

  const expiresAt = new Date(row.expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    throw mobileReject('QR_EXPIRED', 'QR code has expired. Scan the current code.', 422);
  }

  return {
    id: row.id,
    company_id: Number(row.company_id),
    branch_id: Number(row.branch_id),
  };
}

/**
 * Validate nonce belongs to company and consume it (single-use).
 * Pass `client` to run inside an existing transaction (no nested BEGIN/COMMIT).
 * @returns {{ branch_id: number, company_id: number }}
 */
async function validateAndConsume(nonce, companyId, client = null) {
  const ownsClient = !client;
  const db = client || (await pool.connect());

  try {
    if (ownsClient) await db.query('BEGIN');

    const normalized = String(nonce || '').trim();
    if (!normalized) {
      throw mobileReject('QR_INVALID', 'QR code is invalid. Scan again.', 422);
    }

    const result = await db.query(
      `SELECT id, company_id, branch_id, nonce, expires_at
       FROM mobile_qr_nonces
       WHERE nonce = $1
       FOR UPDATE`,
      [normalized]
    );

    if (result.rowCount === 0) {
      throw mobileReject('QR_INVALID', 'QR code is invalid. Scan again.', 422);
    }

    const row = result.rows[0];
    if (Number(row.company_id) !== Number(companyId)) {
      throw mobileReject('QR_INVALID', 'QR code is invalid. Scan again.', 422);
    }

    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      throw mobileReject('QR_EXPIRED', 'QR code has expired. Scan the current code.', 422);
    }

    await db.query(`DELETE FROM mobile_qr_nonces WHERE id = $1`, [row.id]);
    if (ownsClient) await db.query('COMMIT');

    return {
      company_id: Number(row.company_id),
      branch_id: Number(row.branch_id),
    };
  } catch (err) {
    if (ownsClient) await db.query('ROLLBACK');
    throw err;
  } finally {
    if (ownsClient) db.release();
  }
}

async function cleanupExpiredNonces(olderThanDays = 1) {
  const days = Math.max(1, Number(olderThanDays) || 1);
  const result = await pool.query(
    `DELETE FROM mobile_qr_nonces
     WHERE expires_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [days]
  );
  return result.rowCount || 0;
}

module.exports = {
  QR_TTL_SECONDS,
  buildQrPayload,
  issueQrNonce,
  findValidQrNonce,
  validateAndConsume,
  cleanupExpiredNonces,
};
