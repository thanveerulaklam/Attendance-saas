const ExcelJS = require('exceljs');

const LEAD_COLUMNS = [
  'full_name',
  'phone_number',
  'business_name',
  'city',
  'state',
  'source',
  'email',
  'employees',
  'notes',
];

const SAMPLE_LEAD_ROW = {
  full_name: 'Ravi',
  phone_number: '8940040072',
  business_name: 'Ravi garments',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  source: 'WhatsApp',
  email: '',
  employees: '25',
  notes: 'Enquired on WhatsApp',
};

const INSTRUCTION_ROWS = [
  ['Field', 'Required', 'Format / Allowed values', 'Example'],
  ['full_name', 'Yes', 'Contact name', 'Ravi'],
  ['phone_number', 'Yes', '10-digit mobile (or +91…)', '8940040072'],
  ['business_name', 'No', 'Defaults to contact name if blank', 'Ravi garments'],
  ['city', 'No', 'Text', 'Coimbatore'],
  ['state', 'No', 'Text', 'Tamil Nadu'],
  ['source', 'No', 'Defaults to WhatsApp if blank', 'WhatsApp'],
  ['email', 'No', 'Email', 'ravi@example.com'],
  ['employees', 'No', 'Number of staff', '25'],
  ['notes', 'No', 'Free text', 'Enquired on WhatsApp'],
  ['', '', '', ''],
  [
    'Paste instead of a file',
    '',
    'In PunchPay you can paste one lead per line: Name 9876543210',
    'Karthik, 9066096888',
  ],
];

function styleHeaderRow(sheet) {
  const headerRow = sheet.getRow(1);
  LEAD_COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    const required = col === 'full_name' || col === 'phone_number';
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
}

async function buildLeadImportTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PunchPay';
  workbook.created = new Date();

  const leadsSheet = workbook.addWorksheet('Leads');
  leadsSheet.columns = LEAD_COLUMNS.map((key) => ({
    header: key,
    key,
    width: Math.max(key.length + 4, 16),
  }));
  styleHeaderRow(leadsSheet);
  leadsSheet.addRow(SAMPLE_LEAD_ROW);

  const instructionsSheet = workbook.addWorksheet('Instructions');
  INSTRUCTION_ROWS.forEach((row) => instructionsSheet.addRow(row));
  instructionsSheet.columns = [{ width: 28 }, { width: 10 }, { width: 52 }, { width: 24 }];
  styleInstructionsSheet(instructionsSheet);

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  LEAD_COLUMNS,
  buildLeadImportTemplateBuffer,
};
