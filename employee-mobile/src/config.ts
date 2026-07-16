/**
 * API base URL. For a physical phone, use your machine LAN IP (not localhost).
 * Example: EXPO_PUBLIC_API_URL=http://192.168.29.66:3000
 */
export const API_BASE = (
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'
).replace(/\/$/, '');

export const MAX_GPS_ACCURACY_M = 80;
