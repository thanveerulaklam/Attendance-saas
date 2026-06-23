const india = require('./india');
const uae = require('./uae');
const generic = require('./generic');
const { AppError } = require('../../utils/AppError');

/** Supported countries for super-admin company setup (expand as modules ship). */
const SUPPORTED_COUNTRIES = [india, uae];

const BY_CODE = new Map(SUPPORTED_COUNTRIES.map((p) => [p.countryCode, p]));

/**
 * Resolve region profile for an ISO country code.
 * Unknown codes fall back to generic (UTC/USD) but keep the requested country_code in DB.
 */
function getProfileByCountryCode(countryCode) {
  const code =
    typeof countryCode === 'string' && countryCode.trim()
      ? countryCode.trim().toUpperCase()
      : 'IN';
  return BY_CODE.get(code) || { ...generic, countryCode: code };
}

/**
 * Timezone + currency for a new company row from country selection.
 */
function resolveLocaleFromCountryCode(countryCode) {
  const profile = getProfileByCountryCode(countryCode);
  return {
    country_code: profile.countryCode || String(countryCode || 'IN').trim().toUpperCase(),
    timezone: profile.timezone,
    currency: profile.currency,
  };
}

function validateCountryCode(countryCode) {
  const code =
    typeof countryCode === 'string' && countryCode.trim()
      ? countryCode.trim().toUpperCase()
      : null;
  if (!code || !/^[A-Z]{2}$/.test(code)) {
    throw new AppError('country_code must be a 2-letter ISO code (e.g. IN, AE)', 400);
  }
  return code;
}

function listCountriesForSelect() {
  return SUPPORTED_COUNTRIES.map((p) => ({
    country_code: p.countryCode,
    label: p.label,
    timezone: p.timezone,
    currency: p.currency,
    currency_symbol: p.currencySymbol,
    payroll_module: p.payrollModule,
  }));
}

function getFeaturesForCountry(countryCode) {
  return getProfileByCountryCode(countryCode).features;
}

module.exports = {
  india,
  uae,
  generic,
  SUPPORTED_COUNTRIES,
  getProfileByCountryCode,
  resolveLocaleFromCountryCode,
  validateCountryCode,
  listCountriesForSelect,
  getFeaturesForCountry,
};
