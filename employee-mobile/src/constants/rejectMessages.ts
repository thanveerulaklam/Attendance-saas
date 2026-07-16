const MESSAGES: Record<string, string> = {
  MOBILE_DISABLED: 'Mobile attendance is not enabled. Contact HR.',
  BRANCH_MOBILE_DISABLED: 'Mobile attendance is disabled for this branch.',
  EMPLOYEE_CHANNEL_NOT_MOBILE: 'Mobile attendance is not enabled for your profile.',
  SUBSCRIPTION_EXPIRED: 'Company subscription has expired. Contact HR.',
  QR_INVALID: 'Invalid QR code. Scan the current code at the office.',
  QR_EXPIRED: 'QR code expired. Ask reception to refresh the display.',
  GPS_DENIED: 'Location permission is required to punch.',
  GPS_INACCURATE: 'GPS signal is too weak. Move outdoors and try again.',
  OUTSIDE_GEOFENCE: 'You must be at the office location to mark attendance.',
  DUPLICATE_PUNCH: 'A punch already exists at this time. Wait a moment.',
  EMPLOYEE_INACTIVE: 'Your employee account is not active.',
  BRANCH_MISMATCH: 'You must punch at your assigned branch.',
  RATE_LIMITED: 'Too many attempts. Please wait and try again.',
  GEOFENCE_NOT_CONFIGURED: 'Branch location is not set up. Contact HR.',
};

export function messageForRejectCode(code?: string | null, fallback?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback || 'Unable to mark attendance. Please try again.';
}
