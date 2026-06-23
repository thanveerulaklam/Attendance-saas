const {
  computeMonthlyGratuityAccrual,
  estimateTotalGratuity,
} = require('./uaeGratuity');

/** UAE payroll rules — gratuity accrual + WPS export; no PF/ESI. */
module.exports = {
  moduleId: 'uae',
  supportsStatutoryDeductions: false,
  supportsEsiReports: false,
  supportsPfReports: false,
  supportsWpsReports: true,
  supportsGratuityAccrual: true,

  resolveStatutoryDeductions(employee, { earnedBasic = 0, grossSalary = 0, asOfDate } = {}) {
    const basicForGratuity = Number(earnedBasic || 0) > 0 ? earnedBasic : employee?.basic_salary;
    const gratuityAccrual = computeMonthlyGratuityAccrual({
      basicSalary: basicForGratuity,
      joinDate: employee?.join_date,
      asOfDate,
      contractType: employee?.contract_type,
    });
    const gratuityEstimate = estimateTotalGratuity({
      basicSalary: basicForGratuity,
      joinDate: employee?.join_date,
      asOfDate,
      contractType: employee?.contract_type,
    });
    return {
      esiDeduction: 0,
      pfDeduction: 0,
      gratuityAccrual,
      gratuityEstimate,
    };
  },

  employeeHasEsiConfigured: () => false,
  employeeHasPfConfigured: () => false,

  shouldDeductStatutoryForWeek() {
    return false;
  },

  /**
   * Build WPS-style salary CSV rows for a payroll month.
   * Compatible with common UAE bank upload templates (SIF-like columns).
   */
  buildWpsExport({ company, employeesById, payrollRows, year, month }) {
    const y = Number(year);
    const m = Number(month);
    const lastDay = new Date(y, m, 0).getDate();
    const payStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const payEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const currency = company?.currency || 'AED';

    const header = [
      'Employer MOL ID',
      'Bank Routing Code',
      'Employee Code',
      'Employee Name',
      'Labour Card',
      'IBAN',
      'Pay Start',
      'Pay End',
      'Fixed Salary',
      'Variable Pay',
      'Total Salary',
      'Currency',
    ];

    const rows = (payrollRows || []).map((row) => {
      const emp = employeesById.get(Number(row.employee_id)) || {};
      const net = Number(row.net_salary || 0);
      const gross = Number(row.gross_salary || 0);
      const variable = Math.max(0, round2(net - Number(emp.basic_salary || gross)));
      const fixed = round2(net - variable);
      return [
        company?.mol_establishment_id || '',
        company?.bank_routing_code || '',
        row.employee_code || emp.employee_code || '',
        row.employee_name || emp.name || '',
        emp.labour_card_number || '',
        emp.iban || '',
        payStart,
        payEnd,
        fixed,
        variable,
        round2(net),
        currency,
      ];
    });

    return { header, rows, payStart, payEnd, currency };
  },
};

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
