const ExcelJS = require('exceljs');

const REQUIRED_HEADERS = new Set(['name', 'employee_code', 'basic_salary', 'join_date']);

const EMPLOYEE_COLUMNS = [
  'name',
  'employee_code',
  'basic_salary',
  'join_date',
  'department',
  'phone_number',
  'aadhar_number',
  'esi_number',
  'esi_amount',
  'pf_amount',
  'shift_id',
  'branch_id',
  'status',
  'payroll_frequency',
  'salary_type',
  'daily_travel_allowance',
  'other_allowance',
  'permission_hours_override',
];

const SAMPLE_EMPLOYEE_ROW = {
  name: 'Sample Employee',
  employee_code: 'TR001',
  basic_salary: 18000,
  join_date: '2026-04-01',
  department: 'Sales',
  phone_number: '9876543210',
  aadhar_number: '123412341234',
  esi_number: 'ESI12345',
  esi_amount: 0,
  pf_amount: 0,
  shift_id: '',
  branch_id: '',
  status: 'active',
  payroll_frequency: 'monthly',
  salary_type: 'monthly',
  daily_travel_allowance: 0,
  other_allowance: 0,
  permission_hours_override: '',
};

const INSTRUCTION_ROWS = [
  ['Field', 'Required', 'Format / Allowed values', 'Example'],
  ['name', 'Yes', 'Text (min 2 chars)', 'John Kumar'],
  ['employee_code', 'Yes', 'Unique per company', 'TR001'],
  ['basic_salary', 'Yes', 'Positive number', '18000'],
  ['join_date', 'Yes', 'YYYY-MM-DD preferred (Excel date also OK)', '2026-04-01'],
  ['department', 'No', 'Text', 'Sales'],
  ['phone_number', 'No', 'Text or number', '9876543210'],
  ['aadhar_number', 'No', 'Text or number', '123412341234'],
  ['esi_number', 'No', 'Text', 'ESI12345'],
  ['esi_amount', 'No', 'Number >= 0', '0'],
  ['pf_amount', 'No', 'Number >= 0', '0'],
  ['shift_id', 'No', 'Numeric shift id', '1'],
  ['branch_id', 'No', 'Numeric branch id', '1'],
  ['status', 'No', 'active | inactive (default: active)', 'active'],
  ['payroll_frequency', 'No', 'monthly | weekly (for Tharagai use monthly)', 'monthly'],
  ['salary_type', 'No', 'monthly | per_day', 'monthly'],
  ['daily_travel_allowance', 'No', 'Number >= 0', '0'],
  ['other_allowance', 'No', 'Fixed monthly amount (₹)', '0'],
  ['permission_hours_override', 'No', 'Number >= 0 (hours)', '2'],
];

function styleEmployeesHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  EMPLOYEE_COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    const required = REQUIRED_HEADERS.has(col);
    cell.font = {
      bold: true,
      color: { argb: required ? 'FFDC2626' : 'FF334155' },
    };
  });
  headerRow.commit();
}

function styleInstructionsSheet(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF334155' } };
  });
  headerRow.commit();

  for (let r = 2; r <= INSTRUCTION_ROWS.length; r += 1) {
    const fieldName = INSTRUCTION_ROWS[r - 1][0];
    if (REQUIRED_HEADERS.has(fieldName)) {
      const fieldCell = sheet.getRow(r).getCell(1);
      fieldCell.font = { color: { argb: 'FFDC2626' }, bold: true };
    }
  }
}

async function buildEmployeeImportTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PunchPay';
  workbook.created = new Date();

  const employeesSheet = workbook.addWorksheet('Employees');
  employeesSheet.columns = EMPLOYEE_COLUMNS.map((key) => ({
    header: key,
    key,
    width: Math.max(key.length + 4, 14),
  }));
  styleEmployeesHeaderRow(employeesSheet);
  employeesSheet.addRow(SAMPLE_EMPLOYEE_ROW);

  const instructionsSheet = workbook.addWorksheet('Instructions');
  INSTRUCTION_ROWS.forEach((row) => instructionsSheet.addRow(row));
  instructionsSheet.columns = [
    { width: 28 },
    { width: 10 },
    { width: 48 },
    { width: 22 },
  ];
  styleInstructionsSheet(instructionsSheet);

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  REQUIRED_HEADERS,
  EMPLOYEE_COLUMNS,
  buildEmployeeImportTemplateBuffer,
};
