/**
 * Normalize phone for wa.me (digits only, default India +91 for 10-digit local numbers).
 */
export function normalizeWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function openWhatsAppChat(phone, text) {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return false;
  const url = `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
