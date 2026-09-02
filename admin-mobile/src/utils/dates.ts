import { IST } from '../theme';

export function resolveTimezone(company?: { timezone?: string | null; country_code?: string | null } | null) {
  if (!company) return IST;
  if (String(company.country_code || '').toUpperCase() === 'AE') return 'Asia/Dubai';
  return company.timezone || IST;
}

export function todayYmd(timezone = IST) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone || IST });
}

export function formatTime(iso?: string | null, timezone = IST) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    timeZone: timezone || IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatHours(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)}h`;
}
