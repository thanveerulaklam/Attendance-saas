const { getProfileByCountryCode } = require('../../config/region');
const { getCompanyCountryCode } = require('../../services/companyService');
const india = require('./india');
const uae = require('./uae');
const generic = require('./generic');

const BY_MODULE = {
  india,
  uae,
  generic,
};

/**
 * Resolve payroll rule module from ISO country code.
 * Uses region profile `payrollModule` (india | uae | generic).
 */
function getPayrollRulesForCountry(countryCode) {
  const profile = getProfileByCountryCode(countryCode);
  const key = profile.payrollModule || 'generic';
  return BY_MODULE[key] || generic;
}

async function getPayrollRulesForCompanyId(companyId) {
  const countryCode = await getCompanyCountryCode(companyId);
  return getPayrollRulesForCountry(countryCode);
}

module.exports = {
  india,
  uae,
  generic,
  getPayrollRulesForCountry,
  getPayrollRulesForCompanyId,
};
