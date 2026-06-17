import { createPdf, addAutoTable, savePdf } from './pdfGenerator';

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function money(n) {
  return `Rs ${formatMoney(n)}`;
}

function formatDayCount(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return num.toFixed(2).replace(/\.?0+$/, '');
}

function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2).replace(/\.?0+$/, '');
}

function rowsWithAmount(labelValuePairs) {
  return labelValuePairs
    .filter(([, amount]) => Number(amount || 0) !== 0)
    .map(([label, amount]) => [label, money(amount)]);
}

const TABLE_OPTS = {
  styles: { fontSize: 8, cellPadding: 5 },
  headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
  columnStyles: {
    0: { cellWidth: 'auto' },
    1: { halign: 'right', cellWidth: 88 },
  },
  theme: 'striped',
};

/**
 * Compact payslip PDF — tables with essential fields only (no date lists, notes, or join date).
 */
export function addCompactPayslipPage(
  doc,
  {
    company,
    employeeName,
    employeeCode,
    periodLabel,
    breakdown,
    attendanceDetails,
    isFirstPage = true,
  }
) {
  if (!isFirstPage) doc.addPage();

  const pageWidth = doc.internal.pageSize.getWidth();
  const att = breakdown?.attendance || {};
  const b = breakdown?.breakdown || {};
  let y = 28;

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(company?.name || 'Company'), pageWidth / 2, y, { align: 'center' });

  y += 14;
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100, 116, 139);
  const companyLine = [company?.address, company?.phone].filter(Boolean).join(' | ');
  if (companyLine) {
    doc.text(companyLine, pageWidth / 2, y, { align: 'center' });
    y += 12;
  }

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('PAYSLIP', pageWidth / 2, y, { align: 'center' });
  y += 12;
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Period: ${periodLabel}`, pageWidth / 2, y, { align: 'center' });
  y += 14;

  addAutoTable(
    doc,
    [['Employee details', '']],
    [
      ['Name', `${employeeName || '—'} (${employeeCode || '—'})`],
      ['Department', attendanceDetails?.department || '—'],
      ['Shift', attendanceDetails?.shift_name || '—'],
      [
        'Basic salary',
        money(attendanceDetails?.basic_salary ?? breakdown?.employee?.basic_salary ?? 0),
      ],
    ],
    { ...TABLE_OPTS, startY: y, margin: { left: 40, right: 40 } }
  );
  y = doc.lastAutoTable.finalY + 10;

  addAutoTable(
    doc,
    [['Attendance summary', '']],
    [
      ['Working days', String(att.workingDays ?? '—')],
      ['Present', `${formatDayCount(att.presentDays)} days`],
      ['Absent', `${formatDayCount(att.absenceDays)} days`],
      ['Late arrivals', `${att.lateDays ?? 0} times`],
      ['Overtime', `${formatHours(att.overtimeHours)} hrs`],
    ],
    { ...TABLE_OPTS, startY: y, margin: { left: 40, right: 40 } }
  );
  y = doc.lastAutoTable.finalY + 10;

  const earningRows = rowsWithAmount([
    ['Earned basic', b.basicSalary],
    ['Travel allowance', b.travelAllowance],
    ['Overtime pay', b.overtimePay],
    ['Paid leave encashment', b.paidLeaveEncashmentAmount],
    ['No-leave incentive', b.noLeaveIncentive],
  ]);
  earningRows.push(['Gross salary', money(b.grossSalary)]);

  const deductionRows = rowsWithAmount([
    ['Absent deduction', b.absenceDeduction],
    ['Late deduction', b.lateDeduction],
    ['Lunch deduction', b.lunchOverDeduction],
    ['ESI', b.esiDeduction],
    ['PF', b.pfDeduction],
    ['Advance repayment', b.salaryAdvance],
  ]);
  const permissionOffset = Number(b.permissionOffsetAmount || 0);
  if (permissionOffset > 0) {
    deductionRows.push(['Permission offset (credit)', `(Rs ${formatMoney(permissionOffset)})`]);
  }
  const totalDeductions = Number(b.totalDeductions || 0) + Number(b.salaryAdvance || 0);
  deductionRows.push(['Total deductions', money(totalDeductions)]);

  const midX = pageWidth / 2;
  const halfWidth = (pageWidth - 80) / 2 - 4;

  addAutoTable(doc, [['Earnings', 'Amount (Rs)']], earningRows, {
    ...TABLE_OPTS,
    startY: y,
    margin: { left: 40, right: midX + 4 },
    tableWidth: halfWidth,
  });
  const earningsEndY = doc.lastAutoTable.finalY;

  addAutoTable(doc, [['Deductions', 'Amount (Rs)']], deductionRows, {
    ...TABLE_OPTS,
    startY: y,
    margin: { left: midX + 4, right: 40 },
    tableWidth: halfWidth,
  });
  y = Math.max(earningsEndY, doc.lastAutoTable.finalY) + 14;

  doc.setDrawColor(226, 232, 240);
  doc.line(40, y, pageWidth - 40, y);
  y += 16;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text(`NET SALARY: ${money(b.netSalary)}`, pageWidth - 40, y, { align: 'right' });

  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setFontSize(7);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Generated by PunchPay | punchpay.in', pageWidth / 2, footerY, { align: 'center' });

  return doc;
}

export function buildCompactPayslipFilename({ employeeName, periodLabel, year, month }) {
  const safeName = String(employeeName || 'Employee').replace(/\s+/g, '');
  if (year && month) {
    const d = new Date(year, month - 1, 1);
    const monthStr = d.toLocaleString('default', { month: 'short', year: 'numeric' }).replace(/\s+/g, '');
    return `PunchPay_${safeName}_${monthStr}.pdf`;
  }
  const slug = String(periodLabel || 'payslip').replace(/\s+/g, '').replace(/[—–-]/g, '_');
  return `PunchPay_${safeName}_${slug}.pdf`;
}

export function downloadCompactPayslipPdf({
  company,
  employeeName,
  employeeCode,
  periodLabel,
  breakdown,
  attendanceDetails,
  payrollRow,
}) {
  const doc = createPdf({ orientation: 'p' });
  addCompactPayslipPage(doc, {
    company,
    employeeName,
    employeeCode,
    periodLabel,
    breakdown,
    attendanceDetails,
    isFirstPage: true,
  });
  const filename = buildCompactPayslipFilename({
    employeeName,
    periodLabel,
    year: payrollRow?.year,
    month: payrollRow?.month,
  });
  savePdf(doc, filename);
}
