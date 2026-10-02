const { AppError } = require('../utils/AppError');

function parseBeatLabel(raw) {
  if (raw == null) return null;
  const label = String(raw).trim();
  if (!label) return null;
  if (label.length > 120) {
    throw new AppError('Visit name must be 120 characters or fewer', 422, 'INVALID_LABEL');
  }
  return label;
}

function parseBeatBody(body, { requireLabel = false } = {}) {
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

  if (!Array.isArray(embedding) || embedding.length !== 128) {
    throw new AppError('embedding must be a 128-d vector', 422, 'FACE_MISMATCH');
  }
  const vector = embedding.map((value) => Number(value));
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new AppError('embedding contains invalid values', 422, 'FACE_MISMATCH');
  }

  const label = parseBeatLabel(body?.label ?? body?.name);
  if (requireLabel && !label) {
    throw new AppError('Visit name is required', 422, 'INVALID_LABEL');
  }

  return {
    latitude,
    longitude,
    location_accuracy_m: locationAccuracyM,
    embedding: vector,
    label,
  };
}

function parseBeatDateQuery(query) {
  const raw = String(query?.date || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError('date must be YYYY-MM-DD', 400);
  }
  return raw;
}

module.exports = {
  parseBeatBody,
  parseBeatLabel,
  parseBeatDateQuery,
};
