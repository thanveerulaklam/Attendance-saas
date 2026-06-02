/**
 * Normalize phone for WhatsApp Cloud API (digits only; default India +91 for 10-digit local).
 */
function normalizeWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

module.exports = { normalizeWhatsAppNumber };
