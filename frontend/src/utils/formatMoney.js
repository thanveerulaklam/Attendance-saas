/** ISO 4217 → BCP 47 locale for Intl currency formatting. */
const CURRENCY_LOCALE = {
  INR: 'en-IN',
  AED: 'en-AE',
  USD: 'en-US',
};

const FALLBACK_SYMBOL = {
  INR: '₹',
  AED: 'AED',
  USD: 'USD',
};

export function currencyLocale(currency = 'INR') {
  const code = String(currency || 'INR').toUpperCase();
  return CURRENCY_LOCALE[code] || 'en-US';
}

/**
 * Format a numeric amount (no currency symbol) for tables and PDFs.
 */
export function formatMoneyAmount(value, currency = 'INR') {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  const code = String(currency || 'INR').toUpperCase();
  const fractionDigits = code === 'INR' ? 0 : 2;
  return new Intl.NumberFormat(currencyLocale(code), {
    style: 'decimal',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value));
}

/**
 * Format with currency symbol/code via Intl (e.g. ₹1,234 or AED 1,234.00).
 */
export function formatMoneyWithSymbol(value, currency = 'INR') {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  const code = String(currency || 'INR').toUpperCase();
  const fractionDigits = code === 'INR' ? 0 : 2;
  try {
    return new Intl.NumberFormat(currencyLocale(code), {
      style: 'currency',
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(Number(value));
  } catch {
    return `${FALLBACK_SYMBOL[code] || code} ${formatMoneyAmount(value, code)}`;
  }
}

/** Short symbol for form labels (₹, AED, …). */
export function currencySymbol(currency = 'INR') {
  const code = String(currency || 'INR').toUpperCase();
  if (code === 'INR') return '₹';
  return FALLBACK_SYMBOL[code] || code;
}
