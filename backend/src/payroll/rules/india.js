const {
  computeEsiDeduction,
  computePfDeduction,
  employeeHasEsiConfigured,
  employeeHasPfConfigured,
} = require('../../utils/statutoryDeductions');

/** India payroll — PF/ESI statutory deductions (existing PunchPay behavior). */
module.exports = {
  moduleId: 'india',
  supportsStatutoryDeductions: true,
  supportsEsiReports: true,
  supportsPfReports: true,

  resolveStatutoryDeductions(employee, { earnedBasic = 0, grossSalary = 0 } = {}) {
    return {
      esiDeduction: computeEsiDeduction(employee, { grossSalary }),
      pfDeduction: computePfDeduction(employee, { earnedBasic }),
      gratuityProvision: 0,
    };
  },

  employeeHasEsiConfigured,
  employeeHasPfConfigured,

  /** Weekly payroll: deduct statutory only on the week ending the calendar month. */
  shouldDeductStatutoryForWeek(weekEndYmd, monthLastDayYmd) {
    return String(weekEndYmd).slice(0, 10) === String(monthLastDayYmd).slice(0, 10);
  },
};
