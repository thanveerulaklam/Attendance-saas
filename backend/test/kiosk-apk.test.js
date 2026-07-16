const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveKioskApkPath } = require('../src/controllers/kioskApkController');

describe('kiosk APK path', () => {
  it('defaults to backend/downloads/PunchPay-Kiosk.apk', () => {
    const previous = process.env.KIOSK_APK_PATH;
    delete process.env.KIOSK_APK_PATH;
    try {
      const resolved = resolveKioskApkPath();
      assert.equal(
        path.basename(resolved),
        'PunchPay-Kiosk.apk'
      );
      assert.ok(resolved.includes(`${path.sep}downloads${path.sep}`));
    } finally {
      if (previous == null) delete process.env.KIOSK_APK_PATH;
      else process.env.KIOSK_APK_PATH = previous;
    }
  });

  it('honors KIOSK_APK_PATH override', () => {
    const previous = process.env.KIOSK_APK_PATH;
    process.env.KIOSK_APK_PATH = '/var/apps/PunchPay-Kiosk.apk';
    try {
      assert.equal(resolveKioskApkPath(), path.resolve('/var/apps/PunchPay-Kiosk.apk'));
    } finally {
      if (previous == null) delete process.env.KIOSK_APK_PATH;
      else process.env.KIOSK_APK_PATH = previous;
    }
  });
});
