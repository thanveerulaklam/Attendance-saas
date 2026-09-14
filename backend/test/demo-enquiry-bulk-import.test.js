const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  parsePastedLeadLines,
  parseImportFile,
  rowToLeadPayload,
} = require('../src/services/demoEnquiryBulkImportService');

test('parsePastedLeadLines reads name then phone', () => {
  const rows = parsePastedLeadLines('Ravi garments 8940040072\nKarthik, 9066096888\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].full_name, 'Ravi garments');
  assert.equal(rows[0].phone_number, '8940040072');
  assert.equal(rows[0].business_name, 'Ravi garments');
  assert.equal(rows[0].source, 'WhatsApp');
  assert.equal(rows[1].full_name, 'Karthik');
  assert.equal(rows[1].phone_number, '9066096888');
});

test('parsePastedLeadLines flags lines without a phone', () => {
  const rows = parsePastedLeadLines('Just a name\n9876543210');
  assert.equal(rows[0]._parseError.includes('Could not find a phone number'), true);
  assert.equal(rows[1].phone_number, '9876543210');
  assert.equal(rows[1].full_name, '9876543210');
});

test('rowToLeadPayload accepts header aliases and WhatsApp default', () => {
  const row = { Name: 'Meena', Mobile: '9000011111', City: 'Salem' };
  const headerMap = { name: 'Name', mobile: 'Mobile', city: 'City' };
  const payload = rowToLeadPayload(row, headerMap);
  assert.equal(payload.full_name, 'Meena');
  assert.equal(payload.phone_number, '9000011111');
  assert.equal(payload.business_name, 'Meena');
  assert.equal(payload.city, 'Salem');
  assert.equal(payload.source, 'WhatsApp');
});

test('parseImportFile reads csv with alias headers', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['name', 'phone', 'business'],
    ['Arun', '9888877777', 'Arun Stores'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Leads');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'csv' });
  const parsed = parseImportFile(buffer, { filename: 'leads.csv' });
  const payload = rowToLeadPayload(parsed.rows[0], parsed.headerMap);
  assert.equal(payload.full_name, 'Arun');
  assert.equal(payload.phone_number, '9888877777');
  assert.equal(payload.business_name, 'Arun Stores');
});
