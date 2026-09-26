const path = require('path');
const fs = require('fs');
const { AppError } = require('../utils/AppError');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function resolveKioskApkPath() {
  const configured = String(process.env.KIOSK_APK_PATH || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(__dirname, '../../downloads/PunchPay-Kiosk.apk');
}

/**
 * GET /api/company/kiosk-apk
 * Authenticated admin download of the office tablet APK.
 * Face attendance must be enabled for the company.
 */
const downloadKioskApk = asyncHandler(async (req, res) => {
  const apkPath = resolveKioskApkPath();

  if (!fs.existsSync(apkPath)) {
    throw new AppError(
      'Kiosk APK is not available yet. Contact support to publish the tablet app.',
      503,
      'KIOSK_APK_MISSING'
    );
  }

  const stat = fs.statSync(apkPath);
  if (!stat.isFile() || stat.size < 1000) {
    throw new AppError(
      'Kiosk APK file is invalid. Contact support.',
      503,
      'KIOSK_APK_INVALID'
    );
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="PunchPay-Kiosk.apk"'
  );
  res.setHeader('Cache-Control', 'no-store');

  return res.sendFile(apkPath);
});

function readKioskRelease() {
  const apkPath = resolveKioskApkPath();
  if (!fs.existsSync(apkPath)) return null;
  const stat = fs.statSync(apkPath);
  if (!stat.isFile() || stat.size < 1000) return null;

  const metaPath = path.join(path.dirname(apkPath), 'kiosk-version.json');
  let version = null;
  let versionCode = null;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      version = meta.version ? String(meta.version) : null;
      const code = Number(meta.versionCode);
      versionCode = Number.isFinite(code) ? code : null;
    } catch {
      version = null;
      versionCode = null;
    }
  }

  return {
    version,
    version_code: versionCode,
    size: stat.size,
    apkPath,
  };
}

const getKioskAppRelease = asyncHandler(async (_req, res) => {
  const release = readKioskRelease();
  if (!release) {
    throw new AppError(
      'Kiosk APK is not available yet. Contact support to publish the tablet app.',
      503,
      'KIOSK_APK_MISSING'
    );
  }
  return res.json({
    success: true,
    data: {
      version: release.version,
      version_code: release.version_code,
      size: release.size,
    },
  });
});

const downloadKioskAppRelease = asyncHandler(async (_req, res) => {
  const release = readKioskRelease();
  if (!release) {
    throw new AppError(
      'Kiosk APK is not available yet. Contact support to publish the tablet app.',
      503,
      'KIOSK_APK_MISSING'
    );
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Length', String(release.size));
  res.setHeader('Content-Disposition', 'attachment; filename="PunchPay-Kiosk.apk"');
  res.setHeader('Cache-Control', 'no-store');
  return res.sendFile(release.apkPath);
});

module.exports = {
  downloadKioskApk,
  resolveKioskApkPath,
  getKioskAppRelease,
  downloadKioskAppRelease,
};
