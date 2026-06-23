/** India region profile — default for existing PunchPay tenants. */
module.exports = {
  countryCode: 'IN',
  label: 'India',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  currencySymbol: '₹',
  locale: 'en-IN',
  payrollModule: 'india',
  features: {
    pf: true,
    esi: true,
    aadhaar: true,
    uan: true,
    wps: false,
    gratuityStatutory: true,
  },
};
