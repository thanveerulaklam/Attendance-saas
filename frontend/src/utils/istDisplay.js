/** India Standard Time — consistent display for PunchPay (API stores UTC instants). */
export const IST = 'Asia/Kolkata';

export function formatIstTime(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatIstDate(isoOrDate) {
  if (isoOrDate == null || isoOrDate === '') return '';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
