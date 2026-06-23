/** Country options for super-admin company setup (mirrors backend/src/config/region). */
export const COUNTRY_OPTIONS = [
  {
    country_code: 'IN',
    label: 'India',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    currency_symbol: '₹',
  },
  {
    country_code: 'AE',
    label: 'United Arab Emirates',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    currency_symbol: 'AED',
  },
];

export const DEFAULT_COUNTRY_CODE = 'IN';

export function countryLabel(code) {
  const c = String(code || DEFAULT_COUNTRY_CODE).toUpperCase();
  return COUNTRY_OPTIONS.find((o) => o.country_code === c)?.label || c;
}

export function countryProfile(code) {
  const c = String(code || DEFAULT_COUNTRY_CODE).toUpperCase();
  return COUNTRY_OPTIONS.find((o) => o.country_code === c) || COUNTRY_OPTIONS[0];
}
