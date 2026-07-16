const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeKioskCode,
  normalizeSettingsPin,
  assertValidSettingsPin,
  normalizeDuplicatePunchSeconds,
  normalizeMinRecognizeSeconds,
  isValidKioskCode,
  generateKioskCode,
  hashToken,
} = require('../src/services/kioskDeviceService');

test('normalizeKioskCode strips legacy prefix and non-alphanumerics', () => {
  assert.equal(normalizeKioskCode(' pk_ab12cd34 '), 'AB12CD34');
  assert.equal(normalizeKioskCode('ab12-cd34'), 'AB12CD34');
});

test('isValidKioskCode accepts 8 uppercase alphanumeric characters', () => {
  assert.equal(isValidKioskCode('AB12CD34'), true);
  assert.equal(isValidKioskCode('AB12CD3'), false);
  assert.equal(isValidKioskCode('AB12CD345'), false);
});

test('generateKioskCode returns 8 readable characters', () => {
  const code = generateKioskCode();
  assert.equal(code.length, 8);
  assert.match(code, /^[A-Z2-9]+$/);
  assert.equal(isValidKioskCode(code), true);
});

test('assertValidSettingsPin requires exactly 6 digits', () => {
  assert.equal(assertValidSettingsPin('123456'), '123456');
  assert.throws(() => assertValidSettingsPin('12345'), /6 digits/);
  assert.throws(() => assertValidSettingsPin(''), /6 digits/);
});

test('normalizeSettingsPin strips non-digits', () => {
  assert.equal(normalizeSettingsPin('12-34 56'), '123456');
});

test('normalizeDuplicatePunchSeconds clamps to allowed range', () => {
  assert.equal(normalizeDuplicatePunchSeconds(90), 90);
  assert.equal(normalizeDuplicatePunchSeconds(5), 15);
  assert.equal(normalizeDuplicatePunchSeconds(999), 600);
});

test('normalizeMinRecognizeSeconds clamps to allowed range', () => {
  assert.equal(normalizeMinRecognizeSeconds(2), 2);
  assert.equal(normalizeMinRecognizeSeconds(-1), 0);
  assert.equal(normalizeMinRecognizeSeconds(99), 10);
});

test('hashToken is deterministic', () => {
  assert.equal(hashToken('AB12CD34'), hashToken('AB12CD34'));
});
