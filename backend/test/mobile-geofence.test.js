const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineDistanceMeters } = require('../src/utils/geo');
const {
  isInsideGeofence,
  resolveBranchRadius,
  validateGeofence,
  MAX_ACCURACY_M,
} = require('../src/services/mobileGeofenceService');

test('haversineDistanceMeters: same point is zero', () => {
  assert.equal(haversineDistanceMeters(12.97, 77.59, 12.97, 77.59), 0);
});

test('haversineDistanceMeters: known short distance is within tolerance', () => {
  // ~111m per 0.001 degree latitude at equator; use small offset
  const d = haversineDistanceMeters(12.9716, 77.5946, 12.9725, 77.5946);
  assert.ok(d > 90 && d < 130);
});

test('isInsideGeofence: point inside radius', () => {
  assert.equal(isInsideGeofence(12.9716, 77.5946, 12.9716, 77.5946, 100), true);
});

test('isInsideGeofence: point outside radius', () => {
  assert.equal(isInsideGeofence(12.9716, 77.5946, 13.0, 77.7, 100), false);
});

test('resolveBranchRadius caps at max and defaults when invalid', () => {
  assert.equal(resolveBranchRadius({ geofence_radius_m: null }), 100);
  assert.equal(resolveBranchRadius({ geofence_radius_m: 9999 }), 500);
});

test('validateGeofence rejects poor GPS accuracy', () => {
  assert.throws(
    () =>
      validateGeofence(12.97, 77.59, MAX_ACCURACY_M + 1, {
        latitude: 12.97,
        longitude: 77.59,
        geofence_radius_m: 100,
      }),
    (err) => err.code === 'GPS_INACCURATE'
  );
});

test('validateGeofence rejects outside geofence', () => {
  assert.throws(
    () =>
      validateGeofence(13.0, 77.7, 10, {
        latitude: 12.9716,
        longitude: 77.5946,
        geofence_radius_m: 100,
      }),
    (err) => err.code === 'OUTSIDE_GEOFENCE'
  );
});

test('validateGeofence accepts point at branch center', () => {
  const result = validateGeofence(12.9716, 77.5946, 12, {
    latitude: 12.9716,
    longitude: 77.5946,
    geofence_radius_m: 100,
  });
  assert.equal(result.lat, 12.9716);
  assert.equal(result.lng, 77.5946);
});
