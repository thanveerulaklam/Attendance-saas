const { haversineDistanceMeters } = require('../utils/geo');
const { mobileReject } = require('./mobileAttendanceService');

const MAX_ACCURACY_M = Number(process.env.MOBILE_MAX_GPS_ACCURACY_M || 80);
const MAX_GEOFENCE_RADIUS_M = Number(process.env.MOBILE_MAX_GEOFENCE_RADIUS_M || 500);
const DEFAULT_RADIUS_M = Number(process.env.MOBILE_DEFAULT_GEOFENCE_RADIUS_M || 100);

function isInsideGeofence(lat, lng, branchLat, branchLng, radiusM) {
  const distance = haversineDistanceMeters(lat, lng, branchLat, branchLng);
  return distance <= radiusM;
}

function resolveBranchRadius(branch) {
  const raw = Number(branch?.geofence_radius_m);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_RADIUS_M;
  }
  return Math.min(raw, MAX_GEOFENCE_RADIUS_M);
}

/**
 * Validate GPS coordinates against branch geofence.
 * @throws {AppError} with stable reject codes
 */
function validateGeofence(latitude, longitude, locationAccuracyM, branch) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const accuracy = Number(locationAccuracyM);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw mobileReject('GPS_DENIED', 'Location is required to mark attendance.', 422);
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw mobileReject('GPS_DENIED', 'Invalid location coordinates.', 422);
  }

  if (!Number.isFinite(accuracy) || accuracy < 0) {
    throw mobileReject('GPS_INACCURATE', 'GPS accuracy reading is required.', 422);
  }

  if (accuracy > MAX_ACCURACY_M) {
    throw mobileReject(
      'GPS_INACCURATE',
      `GPS accuracy is too low (${Math.round(accuracy)}m). Move outdoors and try again.`,
      422
    );
  }

  const branchLat = branch.latitude;
  const branchLng = branch.longitude;
  if (branchLat == null || branchLng == null) {
    throw mobileReject(
      'GEOFENCE_NOT_CONFIGURED',
      'Branch location is not configured. Contact HR.',
      422
    );
  }

  const radiusM = resolveBranchRadius(branch);
  if (!isInsideGeofence(lat, lng, Number(branchLat), Number(branchLng), radiusM)) {
    throw mobileReject(
      'OUTSIDE_GEOFENCE',
      'You must be at the office location to mark attendance.',
      422
    );
  }

  return { lat, lng, accuracy, radiusM };
}

module.exports = {
  MAX_ACCURACY_M,
  MAX_GEOFENCE_RADIUS_M,
  DEFAULT_RADIUS_M,
  isInsideGeofence,
  resolveBranchRadius,
  validateGeofence,
};
