const { AppError } = require('../utils/AppError');

function parseFieldPunchBody(body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const locationAccuracyM = Number(body?.location_accuracy_m);
  const embedding = body?.embedding;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AppError('latitude and longitude are required', 422, 'GPS_DENIED');
  }
  if (!Number.isFinite(locationAccuracyM) || locationAccuracyM < 0) {
    throw new AppError('location_accuracy_m is required', 422, 'GPS_INACCURATE');
  }

  let vector = null;
  if (embedding != null) {
    if (!Array.isArray(embedding) || embedding.length !== 128) {
      throw new AppError('embedding must be a 128-d vector', 422, 'FACE_MISMATCH');
    }
    vector = embedding.map((value) => Number(value));
    if (vector.some((value) => !Number.isFinite(value))) {
      throw new AppError('embedding contains invalid values', 422, 'FACE_MISMATCH');
    }
  }

  return {
    latitude,
    longitude,
    location_accuracy_m: locationAccuracyM,
    embedding: vector,
  };
}

module.exports = {
  parseFieldPunchBody,
};
