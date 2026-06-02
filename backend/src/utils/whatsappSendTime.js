const MIN_HOUR = 6;
const MAX_HOUR = 22;
const DEFAULT_HOUR = 11;

/**
 * Parse user input to hour 0-23. Accepts number, "HH", "HH:mm", or "HH:mm:ss".
 */
function parseSendHour(value) {
  if (value === '' || value == null || typeof value === 'undefined') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const str = String(value).trim();
  if (/^\d{1,2}$/.test(str)) {
    return Number(str);
  }
  const m = /^(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?$/.exec(str);
  if (!m) return null;
  return Number(m[1]);
}

/**
 * Normalize to Postgres TIME string on the hour (HH:00:00).
 */
function normalizeWhatsappSendTime(value) {
  const hour = parseSendHour(value);
  if (hour == null || !Number.isFinite(hour) || hour < 0 || hour > 23) {
    throw new Error(`whatsapp_send_time must be a valid hour between ${MIN_HOUR}:00 and ${MAX_HOUR}:00 IST`);
  }
  if (hour < MIN_HOUR || hour > MAX_HOUR) {
    throw new Error(`whatsapp_send_time must be between ${MIN_HOUR}:00 and ${MAX_HOUR}:00 IST`);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hour)}:00:00`;
}

function hourFromSendTime(timeLike) {
  if (!timeLike) return DEFAULT_HOUR;
  const str = String(timeLike).trim();
  const m = /^(\d{1,2})/.exec(str);
  if (!m) return DEFAULT_HOUR;
  const h = Number(m[1]);
  return Number.isFinite(h) ? h : DEFAULT_HOUR;
}

/** Format hour as "HH:00" for API responses / forms. */
function formatSendTimeForApi(timeLike) {
  const h = hourFromSendTime(timeLike);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:00`;
}

function currentIstHour() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === 'hour');
  return Number(hourPart?.value ?? new Date().getHours());
}

module.exports = {
  MIN_HOUR,
  MAX_HOUR,
  DEFAULT_HOUR,
  parseSendHour,
  normalizeWhatsappSendTime,
  hourFromSendTime,
  formatSendTimeForApi,
  currentIstHour,
};
