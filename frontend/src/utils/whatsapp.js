/**
 * Normalize phone for WhatsApp click-to-chat (digits only; default India +91 for 10-digit local).
 */
export function normalizeWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Official WhatsApp send URL — more reliable than wa.me/?text= for pre-filled messages.
 * @see https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat
 */
export function buildWhatsAppSendUrl({ phone, text } = {}) {
  const params = new URLSearchParams();
  const number = phone ? normalizeWhatsAppNumber(phone) : null;
  if (number) params.set('phone', number);
  const message = text != null ? String(text).trim() : '';
  if (message) params.set('text', message);
  if (!number && !message) return null;
  return `https://api.whatsapp.com/send?${params.toString()}`;
}

export function openWhatsAppSendUrl(url) {
  if (!url) return false;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

export function openWhatsAppChat(phone, text) {
  const url = buildWhatsAppSendUrl({ phone, text });
  return openWhatsAppSendUrl(url);
}
