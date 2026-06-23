/** UI feature flags by company country (mirrors backend/src/config/region). */

const INDIA = {
  pf: true,
  esi: true,
  aadhaar: true,
  uan: true,
  wps: false,
};

const UAE = {
  pf: false,
  esi: false,
  aadhaar: false,
  uan: false,
  wps: true,
};

const GENERIC = {
  pf: false,
  esi: false,
  aadhaar: false,
  uan: false,
  wps: false,
};

export function regionFeaturesForCountry(countryCode) {
  const code = String(countryCode || 'IN').toUpperCase();
  if (code === 'IN') return { ...INDIA };
  if (code === 'AE') return { ...UAE };
  return { ...GENERIC };
}

export function isIndiaCompany(companyOrCode) {
  const code =
    typeof companyOrCode === 'string'
      ? companyOrCode
      : companyOrCode?.country_code;
  return String(code || 'IN').toUpperCase() === 'IN';
}

export function companyCurrency(company) {
  return String(company?.currency || 'INR').toUpperCase();
}
