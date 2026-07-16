const { AppError } = require('../utils/AppError');
const { resolveKioskFromToken } = require('../services/kioskDeviceService');
const bcrypt = require('bcrypt');

async function authenticateKiosk(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      throw new AppError('Kiosk token required', 401, 'KIOSK_UNAUTHORIZED');
    }

    const kiosk = await resolveKioskFromToken(token);
    if (!kiosk) {
      throw new AppError('Invalid or revoked kiosk token', 401, 'KIOSK_UNAUTHORIZED');
    }
    if (!kiosk.company_mobile_enabled) {
      throw new AppError('Mobile attendance is not enabled', 403, 'MOBILE_DISABLED');
    }

    req.kiosk = kiosk;
    req.companyId = kiosk.company_id;
    req.branchId = kiosk.branch_id;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function authenticateKioskSettings(req, res, next) {
  try {
    const pin = String(req.headers['x-kiosk-settings-pin'] || '').trim();
    if (!req.kiosk?.settings_pin_hash) {
      throw new AppError(
        'Set a Settings PIN for this branch kiosk in Company settings.',
        403,
        'KIOSK_SETTINGS_PIN_NOT_SET'
      );
    }
    if (!/^\d{6}$/.test(pin)) {
      throw new AppError('Settings PIN required', 401, 'KIOSK_SETTINGS_PIN_REQUIRED');
    }
    const valid = await bcrypt.compare(pin, req.kiosk.settings_pin_hash);
    if (!valid) {
      throw new AppError('Incorrect Settings PIN', 401, 'KIOSK_SETTINGS_PIN_INVALID');
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticateKiosk, authenticateKioskSettings };
