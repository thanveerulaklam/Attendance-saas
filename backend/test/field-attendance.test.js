const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  cosineSimilarity,
  bestCosineAgainstTemplates,
  embeddingMatchesStoredTemplates,
  MOBILEFACE_MATCH_THRESHOLD,
} = require('../src/services/faceEnrollmentService');
const { findMatchingFieldSite } = require('../src/services/fieldSiteService');
const { parseGps, FIELD_MAX_ACCURACY_M } = require('../src/services/fieldPunchService');
const { parseFieldPunchBody } = require('../src/validators/fieldPunchValidator');

function unitVector(at = 0) {
  const values = new Array(128).fill(0);
  values[at] = 1;
  return values;
}

describe('field face cosine check', () => {
  it('matches an enrolled template at or above the kiosk threshold', () => {
    const probe = unitVector(0);
    const templates = [unitVector(0), unitVector(1)];
    assert.equal(cosineSimilarity(probe, templates[0]), 1);
    assert.ok(embeddingMatchesStoredTemplates(probe, templates));
    assert.ok(bestCosineAgainstTemplates(probe, templates) >= MOBILEFACE_MATCH_THRESHOLD);
  });

  it('rejects a mismatched embedding', () => {
    const probe = unitVector(3);
    const templates = [unitVector(0), unitVector(1)];
    assert.equal(bestCosineAgainstTemplates(probe, templates), 0);
    assert.equal(embeddingMatchesStoredTemplates(probe, templates), false);
  });
});

describe('field site geofence', () => {
  const sites = [
    {
      id: 1,
      name: 'Warehouse',
      latitude: 12.9716,
      longitude: 77.5946,
      radius_m: 200,
    },
    {
      id: 2,
      name: 'Customer site',
      latitude: 13.05,
      longitude: 77.7,
      radius_m: 150,
    },
  ];

  it('picks the nearest assigned site inside radius', () => {
    const match = findMatchingFieldSite(12.9716, 77.5946, sites);
    assert.equal(match.site.id, 1);
    assert.ok(match.distanceM < 1);
  });

  it('returns null when GPS is outside every assigned site', () => {
    const match = findMatchingFieldSite(11.0, 76.0, sites);
    assert.equal(match, null);
  });
});

describe('field GPS accuracy', () => {
  it('rejects poor GPS accuracy with GPS_INACCURATE', () => {
    assert.throws(
      () => parseGps(12.97, 77.59, FIELD_MAX_ACCURACY_M + 1),
      (err) => err.code === 'GPS_INACCURATE'
    );
  });

  it('accepts coarse indoor field GPS like Android fused location', () => {
    const coords = parseGps(12.9716, 77.5946, 129);
    assert.equal(coords.accuracy, 129);
    assert.equal(parseGps(12.9716, 77.5946, 400).accuracy, 400);
  });
});

describe('field punch body', () => {
  const gps = { latitude: 12.9716, longitude: 77.5946, location_accuracy_m: 8 };

  it('accepts an explicit in or out punch', () => {
    assert.equal(parseFieldPunchBody({ ...gps, punch_type: 'IN' }).punch_type, 'in');
    assert.equal(parseFieldPunchBody({ ...gps, punch_type: 'out' }).punch_type, 'out');
  });

  it('rejects an invalid punch type', () => {
    assert.throws(
      () => parseFieldPunchBody({ ...gps, punch_type: 'break' }),
      (err) => err.code === 'INVALID_PUNCH_TYPE'
    );
  });
});
