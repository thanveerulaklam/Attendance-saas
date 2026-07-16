const { AppError } = require('../utils/AppError');

function parseMobilePunchBody(body = {}) {
  const qrNonce = String(body.qr_nonce || '').trim();
  if (!qrNonce) {
    throw new AppError('qr_nonce is required', 400);
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const locationAccuracyM = Number(body.location_accuracy_m);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AppError('latitude and longitude are required', 400);
  }

  if (!Number.isFinite(locationAccuracyM)) {
    throw new AppError('location_accuracy_m is required', 400);
  }

  return {
    qr_nonce: qrNonce,
    latitude,
    longitude,
    location_accuracy_m: locationAccuracyM,
    captured_at: body.captured_at != null ? String(body.captured_at) : null,
  };
}

function parseMonthlyQuery(query = {}) {
  const year = Number(query.year);
  const month = Number(query.month);
  if (!year || !month || month < 1 || month > 12) {
    throw new AppError('Valid year and month query params are required', 400);
  }
  return { year, month };
}

module.exports = {
  parseMobilePunchBody,
  parseMonthlyQuery,
};
