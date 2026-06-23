/** Fallback profile for countries without a dedicated payroll module yet. */
module.exports = {
  countryCode: null,
  label: 'Other',
  timezone: 'UTC',
  currency: 'USD',
  currencySymbol: 'USD',
  locale: 'en-US',
  payrollModule: 'generic',
  features: {
    pf: false,
    esi: false,
    aadhaar: false,
    uan: false,
    wps: false,
    gratuityStatutory: false,
  },
};
