const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSummaryFromRows,
  formatAbsenteesList,
  buildTemplateBodyParameters,
} = require('../src/services/dailyAttendanceWhatsappService');

const rows = [
  { name: 'Alice', present: true, shift_pending: false, late: false, overtime_hours: 0 },
  { name: 'Bob', present: false, shift_pending: false, late: false, overtime_hours: 0 },
  { name: 'Carol', present: false, shift_pending: true, late: false, overtime_hours: 0 },
  { name: 'Dan', present: false, shift_pending: true, late: false, overtime_hours: 0 },
];

test('whatsapp summary excludes shift_pending from absent count', () => {
  const summary = buildSummaryFromRows(rows);
  assert.equal(summary.present, 1);
  assert.equal(summary.shiftPending, 2);
  assert.equal(summary.absent, 1);
  assert.equal(summary.total, 4);
});

test('whatsapp absentees list separates true absent from shift not started', () => {
  assert.equal(
    formatAbsenteesList(rows),
    'Bob | Shift not started: Carol, Dan'
  );
});

test('whatsapp absentees when only shift pending', () => {
  assert.equal(
    formatAbsenteesList([{ name: 'Night', present: false, shift_pending: true }]),
    'None | Shift not started: Night'
  );
});

test('whatsapp template absent parameter uses adjusted absent count', () => {
  const params = buildTemplateBodyParameters({
    companyName: 'Test Co',
    dateYmd: '2026-06-30',
    rows,
  });
  assert.equal(params[4], '1');
  assert.equal(params[7], 'Bob | Shift not started: Carol, Dan');
});
