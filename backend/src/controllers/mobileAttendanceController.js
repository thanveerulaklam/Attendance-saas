const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const {
  assertHrBranchAccess,
  loadBranchForMobile,
} = require('../services/mobileAttendanceService');
const { issueQrNonce } = require('../services/mobileQrService');
const { listMobilePunchAttempts } = require('../services/mobilePunchAttemptService');
const {
  getKioskByBranch,
  ensureKioskForBranch,
  setKioskSettingsPin,
  revokeKioskToken,
  sanitizeKioskForAdmin,
  kioskSettingsPinConfigured,
} = require('../services/kioskDeviceService');
const { modelsInstalled } = require('../services/faceRecognitionService');
const branchService = require('../services/branchService');

async function updateMobileSettings(req, res, next) {
  try {
    const companyId = req.companyId;
    if (typeof req.body?.mobile_attendance_enabled !== 'boolean') {
      throw new AppError('mobile_attendance_enabled (boolean) is required', 400);
    }

    const result = await pool.query(
      `UPDATE companies
       SET mobile_attendance_enabled = $2
       WHERE id = $1
       RETURNING id, name, mobile_attendance_enabled`,
      [companyId, req.body.mobile_attendance_enabled]
    );

    if (result.rowCount === 0) {
      throw new AppError('Company not found', 404);
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

async function updateBranchGeofence(req, res, next) {
  try {
    const companyId = req.companyId;
    const branchId = Number(req.params.id);
    if (!branchId) {
      throw new AppError('Invalid branch id', 400);
    }

    assertHrBranchAccess(branchId, req.allowedBranchIds);

    const existing = await loadBranchForMobile(companyId, branchId);
    const body = req.body || {};

    const patch = {
      name: existing.name,
      address: existing.address,
      latitude: Object.prototype.hasOwnProperty.call(body, 'latitude')
        ? body.latitude
        : existing.latitude,
      longitude: Object.prototype.hasOwnProperty.call(body, 'longitude')
        ? body.longitude
        : existing.longitude,
      geofence_radius_m: Object.prototype.hasOwnProperty.call(body, 'geofence_radius_m')
        ? body.geofence_radius_m
        : existing.geofence_radius_m,
    };

    const updated = await branchService.updateBranch(companyId, branchId, patch);

    if (Object.prototype.hasOwnProperty.call(body, 'mobile_attendance_enabled')) {
      const mobileEnabled = Boolean(body.mobile_attendance_enabled);
      const mobileResult = await pool.query(
        `UPDATE branches
         SET mobile_attendance_enabled = $3
         WHERE company_id = $1 AND id = $2
         RETURNING mobile_attendance_enabled`,
        [companyId, branchId, mobileEnabled]
      );
      updated.mobile_attendance_enabled = mobileResult.rows[0]?.mobile_attendance_enabled;
    } else {
      updated.mobile_attendance_enabled = existing.mobile_attendance_enabled;
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

async function getBranchQrToken(req, res, next) {
  try {
    const companyId = req.companyId;
    const branchId = Number(req.params.id);
    if (!branchId) {
      throw new AppError('Invalid branch id', 400);
    }

    assertHrBranchAccess(branchId, req.allowedBranchIds);
    await loadBranchForMobile(companyId, branchId);

    const data = await issueQrNonce(companyId, branchId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getBranchKiosk(req, res, next) {
  try {
    const companyId = req.companyId;
    const branchId = Number(req.params.id);
    if (!branchId) throw new AppError('Invalid branch id', 400);

    assertHrBranchAccess(branchId, req.allowedBranchIds);
    const kiosk = await getKioskByBranch(companyId, branchId);
    if (!kiosk || !kiosk.is_active || !kiosk.kiosk_code) {
      return res.json({
        success: true,
        data: {
          kiosk: sanitizeKioskForAdmin(kiosk && kiosk.is_active ? kiosk : null),
          settings_pin_configured: kioskSettingsPinConfigured(kiosk),
          face_models_ready: modelsInstalled(),
        },
      });
    }

    return res.json({
      success: true,
      data: {
        kiosk: sanitizeKioskForAdmin(kiosk),
        token: kiosk.kiosk_code,
        settings_pin_configured: kioskSettingsPinConfigured(kiosk),
        face_models_ready: modelsInstalled(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function createBranchKioskToken(req, res, next) {
  try {
    const companyId = req.companyId;
    const branchId = Number(req.params.id);
    if (!branchId) throw new AppError('Invalid branch id', 400);

    assertHrBranchAccess(branchId, req.allowedBranchIds);
    await loadBranchForMobile(companyId, branchId);

    const label = String(req.body?.label || 'Reception tablet').trim() || 'Reception tablet';
    const regenerate = Boolean(req.body?.regenerate);
    const settingsPin = req.body?.settings_pin;
    const { kiosk, token, created, regenerated, pin_updated } = await ensureKioskForBranch(
      companyId,
      branchId,
      label,
      { regenerate, settingsPin }
    );

    const status = created ? 201 : 200;
    const message = regenerated
      ? 'New kiosk code generated. Update the tablet with this code.'
      : pin_updated
        ? 'Settings PIN saved.'
        : created
          ? 'Kiosk code created for this branch.'
          : 'Existing kiosk code returned for this branch.';

    return res.status(status).json({
      success: true,
      data: {
        kiosk: sanitizeKioskForAdmin(kiosk),
        token,
        settings_pin_configured: kioskSettingsPinConfigured(kiosk),
        face_models_ready: modelsInstalled(),
      },
      message,
    });
  } catch (err) {
    return next(err);
  }
}

async function updateBranchKioskSettingsPin(req, res, next) {
  try {
    const companyId = req.companyId;
    const branchId = Number(req.params.id);
    if (!branchId) throw new AppError('Invalid branch id', 400);

    assertHrBranchAccess(branchId, req.allowedBranchIds);
    await loadBranchForMobile(companyId, branchId);

    const kiosk = await setKioskSettingsPin(companyId, branchId, req.body?.settings_pin);

    return res.json({
      success: true,
      data: {
        kiosk: sanitizeKioskForAdmin(kiosk),
        settings_pin_configured: true,
      },
      message: 'Settings PIN updated.',
    });
  } catch (err) {
    return next(err);
  }
}

async function revokeBranchKioskToken(req, res, next) {
  try {
    const companyId = req.companyId;
    const branchId = Number(req.params.id);
    if (!branchId) throw new AppError('Invalid branch id', 400);

    assertHrBranchAccess(branchId, req.allowedBranchIds);
    await revokeKioskToken(companyId, branchId);
    return res.json({ success: true, message: 'Kiosk access revoked' });
  } catch (err) {
    return next(err);
  }
}

async function getMobilePunchAttempts(req, res, next) {
  try {
    const companyId = req.companyId;
    const branchId = req.query.branch_id != null ? Number(req.query.branch_id) : null;
    if (req.query.branch_id != null && !branchId) {
      throw new AppError('Invalid branch id', 400);
    }

    const data = await listMobilePunchAttempts(companyId, {
      limit: req.query.limit,
      offset: req.query.offset,
      status: req.query.status,
      branchId,
      employeeId: req.query.employee_id != null ? Number(req.query.employee_id) : null,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      allowedBranchIds: req.allowedBranchIds,
    });

    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  updateMobileSettings,
  updateBranchGeofence,
  getBranchQrToken,
  getMobilePunchAttempts,
  getBranchKiosk,
  createBranchKioskToken,
  updateBranchKioskSettingsPin,
  revokeBranchKioskToken,
};
