/** Generic international payroll — attendance-based pay without country-specific statutory deductions. */
module.exports = {
  moduleId: 'generic',
  supportsStatutoryDeductions: false,
  supportsEsiReports: false,
  supportsPfReports: false,

  resolveStatutoryDeductions() {
    return {
      esiDeduction: 0,
      pfDeduction: 0,
      gratuityAccrual: 0,
      gratuityEstimate: 0,
    };
  },

  employeeHasEsiConfigured: () => false,
  employeeHasPfConfigured: () => false,

  shouldDeductStatutoryForWeek() {
    return false;
  },
};
