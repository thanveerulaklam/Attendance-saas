/** UAE payroll rules — no PF/ESI; gratuity + WPS hooks for M5. */
module.exports = {
  moduleId: 'uae',
  supportsStatutoryDeductions: false,
  supportsEsiReports: false,
  supportsPfReports: false,

  resolveStatutoryDeductions() {
    return {
      esiDeduction: 0,
      pfDeduction: 0,
      gratuityProvision: 0,
    };
  },

  employeeHasEsiConfigured: () => false,
  employeeHasPfConfigured: () => false,

  shouldDeductStatutoryForWeek() {
    return false;
  },

  /**
   * End-of-service gratuity estimate (M5 will wire into payroll breakdown).
   * @returns {number} Accrued gratuity amount (0 in M4).
   */
  estimateGratuityAccrual() {
    return 0;
  },

  /** WPS salary file export shape (M5). */
  buildWpsExport() {
    return { header: [], rows: [] };
  },
};
