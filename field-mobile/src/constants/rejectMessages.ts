const MESSAGES: Record<string, string> = {
  FIELD_DISABLED: 'Field attendance is not enabled. Contact HR.',
  EMPLOYEE_CHANNEL_NOT_MOBILE: 'Field attendance is not enabled for your profile.',
  SUBSCRIPTION_EXPIRED: 'Company subscription has expired. Contact HR.',
  GPS_DENIED: 'Location permission is required to punch.',
  GPS_INACCURATE: 'GPS signal is too weak. Move outdoors and try again.',
  OUTSIDE_SITE: 'You must be at an assigned field site to mark attendance.',
  DUPLICATE_PUNCH: 'A punch already exists at this time. Wait a moment.',
  EMPLOYEE_INACTIVE: 'Your employee account is not active.',
  RATE_LIMITED: 'Too many attempts. Please wait and try again.',
  FACE_MISMATCH: 'Face did not match. Try again in better light.',
  NOT_ENROLLED: 'Register your face in this app before punching.',
  NO_SITES: 'No field sites are assigned to you. Contact HR.',
  NOT_EMPLOYEE: 'This app is for field employees. Admins should use PunchPay Admin.',
};

export function messageForRejectCode(code?: string | null, fallback?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback || 'Unable to mark attendance. Please try again.';
}
