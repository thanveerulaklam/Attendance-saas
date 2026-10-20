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

const SABARI_PAY_COLUMNS = [
  { header: 'Name', key: 'name', width: 28 },
  { header: 'Employee code', key: 'employee_code', width: 18 },
  { header: 'Gender', key: 'gender', width: 14 },
  { header: 'Week-off', key: 'week_off', width: 16 },
  { header: 'Hourly rate', key: 'hourly_rate', width: 14 },
  { header: 'Pay cycle', key: 'pay_cycle', width: 14 },
  { header: 'Join date', key: 'join_date', width: 16 },
];

const WEEK_OFF_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatJoinDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  return '';
}

async function buildSabariPayTemplateBuffer(employees = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PunchPay';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Staff');
  sheet.columns = SABARI_PAY_COLUMNS;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FF1E293B' } };
  header.commit();

  const people = Array.isArray(employees) ? employees : [];
  for (const emp of people) {
    const gender = String(emp.gender || '').toLowerCase();
    sheet.addRow({
      name: emp.name || '',
      employee_code: emp.employee_code || '',
      gender: gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : '',
      week_off: emp.week_off_day == null ? '' : WEEK_OFF_LABELS[Number(emp.week_off_day)] || '',
      hourly_rate: emp.basic_salary == null ? '' : Number(emp.basic_salary),
      pay_cycle: String(emp.payroll_frequency || '').toLowerCase() === 'weekly' ? 'Weekly' : 'Monthly',
      join_date: formatJoinDate(emp.join_date),
    });
  }

  const lastRow = Math.max(sheet.rowCount + 30, 40);
  sheet.dataValidations.add(`C2:C${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"Male,Female"'],
    showErrorMessage: true,
    errorTitle: 'Gender',
    error: 'Choose Male or Female',
  });
  sheet.dataValidations.add(`D2:D${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday"'],
    showErrorMessage: true,
    errorTitle: 'Week-off',
    error: 'Choose a day',
  });
  sheet.dataValidations.add(`F2:F${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"Monthly,Weekly"'],
    showErrorMessage: true,
    errorTitle: 'Pay cycle',
    error: 'Choose Monthly or Weekly',
  });

  const help = workbook.addWorksheet('How to fill');
  [
    ['Column', 'What to enter'],
    ['Name', 'Staff name. Required for someone who is not already in PunchPay.'],
    ['Employee code', 'A short unique code, for example SS01. Same code updates that person if they already exist.'],
    ['Gender', 'Male or Female. Salary will not run without this.'],
    ['Week-off', 'Their weekly off: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, or Saturday.'],
    ['Hourly rate', 'Rupees per hour while they are inside the shop. Example: 50'],
    ['Pay cycle', 'Monthly or Weekly. Leave Monthly if they are paid once a month.'],
    ['Join date', 'Optional. Use YYYY-MM-DD. Blank means today, and only for new staff.'],
    ['', ''],
    ['After filling', 'Send this file back. One row per person. Do not rename the column headings.'],
  ].forEach((row) => help.addRow(row));
  help.getRow(1).font = { bold: true };
  help.columns = [{ width: 18 }, { width: 88 }];

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  REQUIRED_HEADERS,
  EMPLOYEE_COLUMNS,
  buildEmployeeImportTemplateBuffer,
  buildSabariPayTemplateBuffer,
};
