const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQrPayload, QR_TTL_SECONDS } = require('../src/services/mobileQrService');

test('buildQrPayload includes version, ids, nonce, and exp', () => {
  const expiresAt = new Date('2026-07-15T10:00:00.000Z');
  const payload = buildQrPayload(12, 3, 'abc123', expiresAt);
  assert.deepEqual(payload, {
    v: 1,
    company_id: 12,
    branch_id: 3,
    nonce: 'abc123',
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
});

test('QR_TTL_SECONDS defaults to 120', () => {
  assert.equal(QR_TTL_SECONDS, 120);
});
