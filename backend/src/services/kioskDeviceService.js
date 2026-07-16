const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

const DEFAULT_DUPLICATE_PUNCH_SECONDS = 90;
const MIN_DUPLICATE_PUNCH_SECONDS = 15;
const MAX_DUPLICATE_PUNCH_SECONDS = 600;
const DEFAULT_MIN_RECOGNIZE_SECONDS = 2;
const MIN_MIN_RECOGNIZE_SECONDS = 0;
const MAX_MIN_RECOGNIZE_SECONDS = 10;
const KIOSK_CODE_LENGTH = 8;
const KIOSK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeDuplicatePunchSeconds(raw, fallback = DEFAULT_DUPLICATE_PUNCH_SECONDS) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DUPLICATE_PUNCH_SECONDS, Math.max(MIN_DUPLICATE_PUNCH_SECONDS, n));
}

function normalizeMinRecognizeSeconds(raw, fallback = DEFAULT_MIN_RECOGNIZE_SECONDS) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_MIN_RECOGNIZE_SECONDS, Math.max(MIN_MIN_RECOGNIZE_SECONDS, n));
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeKioskCode(raw) {
  let value = String(raw || '').trim().toUpperCase();
  if (value.startsWith('PK_')) {
    value = value.slice(3);
  }
  return value.replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function normalizeSettingsPin(raw) {
  return String(raw || '').trim().replace(/\D/g, '').slice(0, 6);
}

function assertValidSettingsPin(raw) {
  const pin = normalizeSettingsPin(raw);
  if (!/^\d{6}$/.test(pin)) {
    throw new AppError('Settings PIN must be exactly 6 digits', 400);
  }
  return pin;
}

function isValidKioskCode(code) {
  return /^[A-Z0-9]{8}$/.test(code);
}

function kioskSettingsPinConfigured(kiosk) {
  return Boolean(kiosk?.settings_pin_hash);
}

function sanitizeKioskForAdmin(kiosk) {
  if (!kiosk) return null;
  const { settings_pin_hash, settings_pin, ...rest } = kiosk;
  return {
    ...rest,
    settings_pin_configured: kioskSettingsPinConfigured(kiosk),
    duplicate_punch_seconds: normalizeDuplicatePunchSeconds(
      kiosk.duplicate_punch_seconds
    ),
  };
}

function preferencesFromKiosk(kiosk) {
  return {
    duplicate_punch_seconds: normalizeDuplicatePunchSeconds(
      kiosk?.duplicate_punch_seconds
    ),
    min_duplicate_punch_seconds: MIN_DUPLICATE_PUNCH_SECONDS,
    max_duplicate_punch_seconds: MAX_DUPLICATE_PUNCH_SECONDS,
    default_duplicate_punch_seconds: DEFAULT_DUPLICATE_PUNCH_SECONDS,
    min_recognize_seconds: normalizeMinRecognizeSeconds(kiosk?.min_recognize_seconds),
    min_min_recognize_seconds: MIN_MIN_RECOGNIZE_SECONDS,
    max_min_recognize_seconds: MAX_MIN_RECOGNIZE_SECONDS,
    default_min_recognize_seconds: DEFAULT_MIN_RECOGNIZE_SECONDS,
  };
}

async function updateKioskPreferences(
  companyId,
  branchId,
  { duplicatePunchSeconds, minRecognizeSeconds }
) {
  const existing = await getKioskByBranch(companyId, branchId);
  if (!existing || !existing.is_active) {
    throw new AppError('No active kiosk configured for this branch', 404);
  }

  const nextDuplicate =
    duplicatePunchSeconds == null
      ? normalizeDuplicatePunchSeconds(existing.duplicate_punch_seconds)
      : normalizeDuplicatePunchSeconds(duplicatePunchSeconds);
  const nextMinRecognize =
    minRecognizeSeconds == null
      ? normalizeMinRecognizeSeconds(existing.min_recognize_seconds)
      : normalizeMinRecognizeSeconds(minRecognizeSeconds);

  const result = await pool.query(
    `UPDATE branch_kiosk_devices
     SET duplicate_punch_seconds = $3,
         min_recognize_seconds = $4,
         updated_at = NOW()
     WHERE company_id = $1 AND branch_id = $2
     RETURNING id, company_id, branch_id, label, kiosk_code, settings_pin,
               settings_pin_hash, duplicate_punch_seconds, min_recognize_seconds,
               is_active, last_seen_at, created_at, updated_at`,
    [companyId, branchId, nextDuplicate, nextMinRecognize]
  );

  return result.rows[0];
}

function generateKioskCode() {
  let code = '';
  for (let i = 0; i < KIOSK_CODE_LENGTH; i += 1) {
    code += KIOSK_CODE_ALPHABET[crypto.randomInt(KIOSK_CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueKioskCode(db = pool) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = generateKioskCode();
    const exists = await db.query(
      `SELECT 1 FROM branch_kiosk_devices WHERE kiosk_code = $1`,
      [code]
    );
    if (exists.rowCount === 0) {
      return code;
    }
  }
  throw new AppError('Could not allocate kiosk code', 500);
}

async function getKioskByBranch(companyId, branchId) {
  const result = await pool.query(
    `SELECT id, company_id, branch_id, label, kiosk_code, settings_pin,
            settings_pin_hash, duplicate_punch_seconds, min_recognize_seconds,
            is_active, last_seen_at, created_at, updated_at
     FROM branch_kiosk_devices
     WHERE company_id = $1 AND branch_id = $2`,
    [companyId, branchId]
  );
  return result.rows[0] || null;
}

async function updateKioskCode(db, rowId, { label, kioskCode }) {
  const tokenKey = hashToken(kioskCode);
  const result = await db.query(
    `UPDATE branch_kiosk_devices
     SET label = $2,
         kiosk_code = $3,
         token_key = $4,
         is_active = TRUE,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, company_id, branch_id, label, kiosk_code, settings_pin,
               settings_pin_hash, duplicate_punch_seconds, min_recognize_seconds,
               is_active, last_seen_at, created_at, updated_at`,
    [rowId, label, kioskCode, tokenKey]
  );
  return result.rows[0];
}

async function createKioskCredentials(companyId, branchId, label, settingsPin) {
  assertValidSettingsPin(settingsPin);
  const kioskCode = await generateUniqueKioskCode();
  const tokenKey = hashToken(kioskCode);
  const settingsPinHash = await bcrypt.hash(settingsPin, 10);

  const result = await pool.query(
    `INSERT INTO branch_kiosk_devices (
       company_id, branch_id, label, kiosk_code, token_key,
       settings_pin_hash, is_active, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
     RETURNING id, company_id, branch_id, label, kiosk_code, settings_pin,
               settings_pin_hash, duplicate_punch_seconds, min_recognize_seconds,
               is_active, last_seen_at, created_at, updated_at`,
    [companyId, branchId, label, kioskCode, tokenKey, settingsPinHash]
  );

  return {
    kiosk: result.rows[0],
    token: kioskCode,
    created: true,
  };
}

async function setKioskSettingsPin(companyId, branchId, settingsPin) {
  const pin = assertValidSettingsPin(settingsPin);
  const existing = await getKioskByBranch(companyId, branchId);
  if (!existing || !existing.is_active) {
    throw new AppError('Create a kiosk code for this branch before setting a Settings PIN', 404);
  }

  const settingsPinHash = await bcrypt.hash(pin, 10);
  const result = await pool.query(
    `UPDATE branch_kiosk_devices
     SET settings_pin_hash = $3,
         settings_pin = NULL,
         updated_at = NOW()
     WHERE company_id = $1 AND branch_id = $2
     RETURNING id, company_id, branch_id, label, kiosk_code, settings_pin,
               settings_pin_hash, duplicate_punch_seconds, min_recognize_seconds,
               is_active, last_seen_at, created_at, updated_at`,
    [companyId, branchId, settingsPinHash]
  );

  return result.rows[0];
}

/**
 * Ensure a branch has a permanent kiosk code. Reuses the existing code unless regenerate=true.
 * settings_pin is required when the branch has no PIN yet.
 */
async function ensureKioskForBranch(
  companyId,
  branchId,
  label = 'Reception tablet',
  { regenerate = false, settingsPin = null } = {}
) {
  const trimmedLabel = String(label || 'Reception tablet').trim() || 'Reception tablet';
  const existing = await getKioskByBranch(companyId, branchId);
  const hasPin = kioskSettingsPinConfigured(existing);
  const normalizedPin =
    settingsPin != null && String(settingsPin).trim() !== ''
      ? assertValidSettingsPin(settingsPin)
      : null;

  if (existing && existing.is_active && existing.kiosk_code && !regenerate) {
    if (trimmedLabel !== existing.label) {
      await pool.query(
        `UPDATE branch_kiosk_devices SET label = $3, updated_at = NOW()
         WHERE company_id = $1 AND branch_id = $2`,
        [companyId, branchId, trimmedLabel]
      );
      existing.label = trimmedLabel;
    }
    if (normalizedPin) {
      await setKioskSettingsPin(companyId, branchId, normalizedPin);
      const refreshed = await getKioskByBranch(companyId, branchId);
      return {
        kiosk: refreshed,
        token: refreshed.kiosk_code,
        created: false,
        pin_updated: true,
      };
    }
    if (!hasPin) {
      throw new AppError('Set a 6-digit Settings PIN before using the kiosk tablet', 400);
    }
    return {
      kiosk: existing,
      token: existing.kiosk_code,
      created: false,
    };
  }

  if (existing && regenerate) {
    if (!hasPin && !normalizedPin) {
      throw new AppError('Set a 6-digit Settings PIN before generating a kiosk code', 400);
    }
    const kioskCode = await generateUniqueKioskCode();
    const kiosk = await updateKioskCode(pool, existing.id, {
      label: trimmedLabel,
      kioskCode,
    });
    if (normalizedPin) {
      await setKioskSettingsPin(companyId, branchId, normalizedPin);
    }
    const refreshed = await getKioskByBranch(companyId, branchId);
    return {
      kiosk: refreshed,
      token: kioskCode,
      created: false,
      regenerated: true,
      pin_updated: Boolean(normalizedPin),
    };
  }

  if (existing && !regenerate && !existing.is_active) {
    if (!normalizedPin && !hasPin) {
      throw new AppError('Set a 6-digit Settings PIN before enabling kiosk access', 400);
    }
    const kioskCode = existing.kiosk_code || (await generateUniqueKioskCode());
    const kiosk = await updateKioskCode(pool, existing.id, {
      label: trimmedLabel,
      kioskCode,
    });
    if (normalizedPin) {
      await setKioskSettingsPin(companyId, branchId, normalizedPin);
    }
    const refreshed = await getKioskByBranch(companyId, branchId);
    return {
      kiosk: refreshed,
      token: kioskCode,
      created: true,
      pin_updated: Boolean(normalizedPin),
    };
  }

  if (existing && !existing.kiosk_code) {
    if (!normalizedPin && !hasPin) {
      throw new AppError('Set a 6-digit Settings PIN before creating a kiosk code', 400);
    }
    const kioskCode = await generateUniqueKioskCode();
    const kiosk = await updateKioskCode(pool, existing.id, {
      label: trimmedLabel,
      kioskCode,
    });
    if (normalizedPin) {
      await setKioskSettingsPin(companyId, branchId, normalizedPin);
    }
    const refreshed = await getKioskByBranch(companyId, branchId);
    return {
      kiosk: refreshed,
      token: kioskCode,
      created: false,
      pin_updated: Boolean(normalizedPin),
    };
  }

  if (!normalizedPin) {
    throw new AppError('Settings PIN (6 digits) is required', 400);
  }

  return createKioskCredentials(companyId, branchId, trimmedLabel, normalizedPin);
}

/** @deprecated use ensureKioskForBranch */
async function issueKioskToken(companyId, branchId, label = 'Reception tablet', options = {}) {
  return ensureKioskForBranch(companyId, branchId, label, options);
}

async function revokeKioskToken(companyId, branchId) {
  const result = await pool.query(
    `UPDATE branch_kiosk_devices
     SET is_active = FALSE, updated_at = NOW()
     WHERE company_id = $1 AND branch_id = $2
     RETURNING id`,
    [companyId, branchId]
  );
  if (result.rowCount === 0) {
    throw new AppError('No kiosk device configured for this branch', 404);
  }
  return { revoked: true };
}

async function resolveKioskFromToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const normalized = normalizeKioskCode(raw);

  if (isValidKioskCode(normalized)) {
    const result = await pool.query(
      `SELECT k.id, k.company_id, k.branch_id, k.label, k.is_active,
              k.settings_pin_hash, k.kiosk_code, k.duplicate_punch_seconds,
              k.min_recognize_seconds,
              b.name AS branch_name, b.mobile_attendance_enabled,
              c.name AS company_name, c.mobile_attendance_enabled AS company_mobile_enabled
       FROM branch_kiosk_devices k
       JOIN branches b ON b.id = k.branch_id AND b.company_id = k.company_id
       JOIN companies c ON c.id = k.company_id
       WHERE k.kiosk_code = $1 OR k.token_key = $2`,
      [normalized, hashToken(normalized)]
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    if (!row.is_active) return null;
    return { ...row, token: row.kiosk_code || normalized };
  }

  if (raw.startsWith('pk_') && raw.length >= 20) {
    const tokenKey = hashToken(raw);
    const result = await pool.query(
      `SELECT k.id, k.company_id, k.branch_id, k.label, k.is_active,
              k.settings_pin_hash, k.kiosk_code, k.duplicate_punch_seconds,
              k.min_recognize_seconds,
              b.name AS branch_name, b.mobile_attendance_enabled,
              c.name AS company_name, c.mobile_attendance_enabled AS company_mobile_enabled
       FROM branch_kiosk_devices k
       JOIN branches b ON b.id = k.branch_id AND b.company_id = k.company_id
       JOIN companies c ON c.id = k.company_id
       WHERE k.token_key = $1`,
      [tokenKey]
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    if (!row.is_active) return null;
    return { ...row, token: row.kiosk_code || raw };
  }

  return null;
}

async function touchKioskSeen(kioskId) {
  await pool.query(
    `UPDATE branch_kiosk_devices SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [kioskId]
  );
}

module.exports = {
  hashToken,
  normalizeKioskCode,
  normalizeSettingsPin,
  assertValidSettingsPin,
  normalizeDuplicatePunchSeconds,
  normalizeMinRecognizeSeconds,
  DEFAULT_DUPLICATE_PUNCH_SECONDS,
  MIN_DUPLICATE_PUNCH_SECONDS,
  MAX_DUPLICATE_PUNCH_SECONDS,
  DEFAULT_MIN_RECOGNIZE_SECONDS,
  MIN_MIN_RECOGNIZE_SECONDS,
  MAX_MIN_RECOGNIZE_SECONDS,
  isValidKioskCode,
  kioskSettingsPinConfigured,
  sanitizeKioskForAdmin,
  preferencesFromKiosk,
  generateKioskCode,
  getKioskByBranch,
  ensureKioskForBranch,
  setKioskSettingsPin,
  updateKioskPreferences,
  issueKioskToken,
  revokeKioskToken,
  resolveKioskFromToken,
  touchKioskSeen,
};
