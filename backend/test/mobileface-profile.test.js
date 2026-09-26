const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertMobileFaceProfile, MOBILEFACE_DIMENSION } = require('../src/services/faceEnrollmentService');

function unitVector() {
  const values = new Array(MOBILEFACE_DIMENSION).fill(0);
  values[0] = 1;
  return values;
}

describe('mobilefacenet profile validation', () => {
  it('accepts 3 normalized templates for the current model', () => {
    const profile = assertMobileFaceProfile({
      model: 'mobilefacenet_sface_v1',
      dimension: MOBILEFACE_DIMENSION,
      embeddings: [unitVector(), unitVector(), unitVector()],
    });
    assert.equal(profile.embeddings.length, 3);
    assert.equal(profile.dimension, 128);
  });

  it('rejects a legacy face-api descriptor', () => {
    assert.throws(
      () => assertMobileFaceProfile({
        model: 'faceapi_128',
        dimension: 128,
        embeddings: [unitVector(), unitVector(), unitVector()],
      }),
      (err) => err.code === 'FACE_MODEL_MISMATCH'
    );
  });

  it('rejects a vector that is not unit length', () => {
    const bad = unitVector();
    bad[0] = 4;
    assert.throws(
      () => assertMobileFaceProfile({
        model: 'mobilefacenet_sface_v1',
        dimension: 128,
        embeddings: [bad, unitVector(), unitVector()],
      }),
      (err) => err.code === 'FACE_SAMPLES_INVALID'
    );
  });
});
