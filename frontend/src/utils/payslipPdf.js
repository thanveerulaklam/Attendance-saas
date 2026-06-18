import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPdf, savePdf } from './pdfGenerator';
import {
  formatGroupedDayNumbersText,
  formatGroupedLateDetailsText,
  resolvePayslipAttendanceDates,
} from './payslipAttendance';

const LAYOUTS = {
  a5: {
    marginX: 36,
    startY: 24,
    companyTitleSize: 13,
    payslipTitleSize: 10,
    periodSize: 8,
    tableFont: 7,
    tablePadding: 4,
    sectionGap: 8,
    netFont: 11,
    showFooter: true,
  },
  'a4-half': {
    marginX: 14,
    startY: 6,
    companyTitleSize: 8,
    payslipTitleSize: 7,
    periodSize: 6,
    tableFont: 5.5,
    tablePadding: 1.5,
    sectionGap: 3,
    netFont: 8,
    showFooter: false,
  },
};

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

function trimPagesAfter(doc, anchorPage) {
  while (doc.getNumberOfPages() > anchorPage) {
    doc.deletePage(doc.getNumberOfPages());
  }
  doc.setPage(anchorPage);
}

function slotMargins(doc, slot, marginLeft, marginRight) {
  if (!slot) {
    const pageWidth = doc.internal.pageSize.getWidth();
    return { left: marginLeft, right: pageWidth - marginRight };
  }
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  return {
    left: marginLeft,
    right: pageWidth - marginRight,
    top: slot.y,
    bottom: Math.max(0, pageHeight - slot.y - slot.height),
  };
}

function drawPayslipTable(doc, { fixedPage, slot, marginLeft, marginRight, layout, startY, head, body, tableWidth, columnStylesOverride }) {
  if (fixedPage) doc.setPage(fixedPage);

  const columnStyles = columnStylesOverride ?? {
    0: { cellWidth: 'auto' },
    1: { halign: 'right', cellWidth: layout === LAYOUTS.a5 ? 72 : 50 },
  };

  autoTable(doc, {
    head,
    body,
    startY,
    tableWidth,
    margin: slotMargins(doc, slot, marginLeft, marginRight),
    styles: { fontSize: layout.tableFont, cellPadding: layout.tablePadding, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    theme: 'striped',
    columnStyles,
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    showHead: 'firstPage',
  });

  if (fixedPage) trimPagesAfter(doc, fixedPage);
  return doc.lastAutoTable.finalY;
}

/**
 * Render one compact payslip into the PDF document.
 */
function renderCompactPayslip(
  doc,
  {
    company,
    employeeName,
    employeeCode,
    periodLabel,
    breakdown,
    attendanceDetails,
    slot = null,
    layoutKey = 'a5',
    fixedPage = null,
  }
) {
  const layout = LAYOUTS[layoutKey] || LAYOUTS.a5;
  const pageWidth = slot ? slot.width : doc.internal.pageSize.getWidth();
  const slotX = slot?.x ?? 0;
  const slotY = slot?.y ?? 0;
  const marginLeft = slotX + layout.marginX;
  const marginRight = slot ? slotX + slot.width - layout.marginX : doc.internal.pageSize.getWidth() - layout.marginX;
  const contentWidth = marginRight - marginLeft;
  const centerX = slotX + pageWidth / 2;

  if (fixedPage) doc.setPage(fixedPage);

  const att = breakdown?.attendance || {};
  const b = breakdown?.breakdown || {};
  const { absentDates, lateDetails } = resolvePayslipAttendanceDates(breakdown, attendanceDetails);
  let y = slotY + layout.startY;

  doc.setFontSize(layout.companyTitleSize);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(company?.name || 'Company'), centerX, y, { align: 'center' });

  y += layout.companyTitleSize + 1;
  if (layoutKey === 'a5') {
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139);
    const companyLine = [company?.address, company?.phone].filter(Boolean).join(' | ');
    if (companyLine) {
      const lines = doc.splitTextToSize(companyLine, contentWidth);
      doc.text(lines, centerX, y, { align: 'center' });
      y += lines.length * 7;
    }
  }

  doc.setFontSize(layout.payslipTitleSize);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('PAYSLIP', centerX, y, { align: 'center' });
  y += layout.payslipTitleSize + 1;
  doc.setFontSize(layout.periodSize);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Period: ${periodLabel}`, centerX, y, { align: 'center' });
  y += layout.periodSize + layout.sectionGap;

  y =
    drawPayslipTable(doc, {
      fixedPage,
      slot,
      marginLeft,
      marginRight,
      layout,
      startY: y,
      head: [['Employee details', '']],
      body: [
        ['Name', `${employeeName || '—'} (${employeeCode || '—'})`],
        ['Department', attendanceDetails?.department || '—'],
        ['Shift', attendanceDetails?.shift_name || '—'],
        [
          'Basic salary',
          money(attendanceDetails?.basic_salary ?? breakdown?.employee?.basic_salary ?? 0),
        ],
      ],
    }) + layout.sectionGap;

  y =
    drawPayslipTable(doc, {
      fixedPage,
      slot,
      marginLeft,
      marginRight,
      layout,
      startY: y,
      head: [['Attendance', '']],
      body: [
        ['Working days', String(att.workingDays ?? '—')],
        ['Present', `${formatDayCount(att.presentDays)} d`],
        ['Absent', `${formatDayCount(att.absenceDays)} d`],
        ['Late', `${att.lateDays ?? 0}`],
        ['Overtime', `${formatHours(att.overtimeHours)} h`],
        ['Absent dates', formatGroupedDayNumbersText(absentDates)],
        ['Late dates', formatGroupedLateDetailsText(lateDetails)],
      ],
      columnStylesOverride: {
        0: { cellWidth: layout === LAYOUTS.a5 ? 58 : 42 },
        1: { halign: 'left', cellWidth: 'auto' },
      },
    }) + layout.sectionGap;

  const earningRows = rowsWithAmount([
    ['Earned basic', b.basicSalary],
    ['Travel', b.travelAllowance],
    ['Other allow.', b.otherAllowance],
    ['Overtime', b.overtimePay],
    ['Leave encash', b.paidLeaveEncashmentAmount],
    ['Incentive', b.noLeaveIncentive],
  ]);
  earningRows.push(['Gross', money(b.grossSalary)]);

  const deductionRows = rowsWithAmount([
    ['Absent', b.absenceDeduction],
    ['Late', b.lateDeduction],
    ['Lunch', b.lunchOverDeduction],
    ['ESI', b.esiDeduction],
    ['PF', b.pfDeduction],
    ['Advance', b.salaryAdvance],
  ]);
  const permissionOffset = Number(b.permissionOffsetAmount || 0);
  if (permissionOffset > 0) {
    deductionRows.push(['Perm. offset', `(Rs ${formatMoney(permissionOffset)})`]);
  }
  deductionRows.push(['Total ded.', money(Number(b.totalDeductions || 0) + Number(b.salaryAdvance || 0))]);

  const midX = slotX + pageWidth / 2;
  const halfWidth = pageWidth / 2 - layout.marginX - 2;

  const earningsEndY = drawPayslipTable(doc, {
    fixedPage,
    slot,
    marginLeft,
    marginRight: midX + 2,
    layout,
    startY: y,
    head: [['Earnings', 'Rs']],
    body: earningRows,
    tableWidth: halfWidth,
  });

  const deductionsEndY = drawPayslipTable(doc, {
    fixedPage,
    slot,
    marginLeft: midX + 2,
    marginRight,
    layout,
    startY: y,
    head: [['Deductions', 'Rs']],
    body: deductionRows,
    tableWidth: halfWidth,
  });

  y = Math.max(earningsEndY, deductionsEndY) + layout.sectionGap;

  if (fixedPage) doc.setPage(fixedPage);
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginRight, y);
  y += layout.sectionGap;
  doc.setFontSize(layout.netFont);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text(`NET SALARY: ${money(b.netSalary)}`, marginRight, y, { align: 'right' });

  if (layout.showFooter) {
    const footerY = doc.internal.pageSize.getHeight() - 16;
    doc.setFontSize(6);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('Generated by PunchPay | punchpay.in', centerX, footerY, { align: 'center' });
  }

  if (fixedPage) trimPagesAfter(doc, fixedPage);
  return doc;
}

export function addCompactPayslipPage(doc, params) {
  if (!params.isFirstPage) doc.addPage('a5', 'portrait');
  return renderCompactPayslip(doc, { ...params, layoutKey: 'a5' });
}

/**
 * Bulk payslips: two per A4 portrait page.
 */
export function addBulkCompactPayslipsToDoc(doc, items) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const halfH = pageHeight / 2;

  for (let i = 0; i < items.length; i += 2) {
    if (i > 0) doc.addPage('a4', 'portrait');
    const anchorPage = doc.getNumberOfPages();

    renderCompactPayslip(doc, {
      ...items[i],
      slot: { x: 0, y: 0, width: pageWidth, height: halfH },
      layoutKey: 'a4-half',
      fixedPage: anchorPage,
    });

    if (items[i + 1]) {
      trimPagesAfter(doc, anchorPage);
      doc.setDrawColor(180, 190, 200);
      doc.setLineWidth(0.6);
      doc.line(10, halfH, pageWidth - 10, halfH);

      renderCompactPayslip(doc, {
        ...items[i + 1],
        slot: { x: 0, y: halfH, width: pageWidth, height: halfH },
        layoutKey: 'a4-half',
        fixedPage: anchorPage,
      });
    }

    trimPagesAfter(doc, anchorPage);
  }

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
  const doc = createPdf({ orientation: 'p', format: 'a5' });
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

export function buildBulkPayslipsDoc(company, rows, payloads, payrollMode, formatPayslipPeriodLabel) {
  const doc = createPdf({ orientation: 'p', format: 'a4' });
  const items = rows.map((row, i) => {
    const payload = payloads[i];
    return {
      company,
      employeeName: row.employee_name,
      employeeCode: row.employee_code,
      periodLabel: formatPayslipPeriodLabel(row, payrollMode),
      breakdown: payload.breakdown,
      attendanceDetails: payload.attendanceMeta,
    };
  });
  addBulkCompactPayslipsToDoc(doc, items);
  return doc;
}

export function openBulkPayslipsForPrint(doc) {
  doc.autoPrint();
  const url = doc.output('bloburl');
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  return true;
}
