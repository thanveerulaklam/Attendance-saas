/** Display helpers using company IANA timezone (from GET /api/company). */
import { IST } from './istDisplay';

export function formatLocalTime(isoOrDate, timezone = IST) {
  if (isoOrDate == null || isoOrDate === '') return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    timeZone: timezone || IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatLocalDate(isoOrDate, timezone = IST) {
  if (isoOrDate == null || isoOrDate === '') return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    timeZone: timezone || IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function todayYmdInTimezone(timezone = IST) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone || IST });
}

export function formatYmdDisplay(ymd, timezone = IST) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  const tz = timezone || IST;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatYmdLong(ymd, timezone = IST) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  const tz = timezone || IST;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
