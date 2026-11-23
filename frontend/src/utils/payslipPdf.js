import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPdf, savePdf } from './pdfGenerator';
import {
  formatGroupedDayNumbersText,
  formatGroupedLateDetailsText,
  resolvePayslipAttendanceDates,
} from './payslipAttendance';
import { lateDeductionLabel, overtimePayLabel } from './payrollPayLabels';
import { calendarYmd, formatSabariDate, formatSabariDuration, formatSabariPunchLine, sabariPayslipExplanation } from './sabariPayslipExplanation';

const LAYOUTS = {
  a5: {
    marginX: 36,
    startY: 24,
    companyTitleSize: 13,
    payslipTitleSize: 10,
    periodSize: 8,
    employeeNameSize: 14,
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
    employeeNameSize: 10,
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

function ymdToken(value, timeZone) {
  return calendarYmd(value, timeZone);
}

function resolvePayslipCompany(company, breakdown) {
  const fromBreakdown = breakdown?.company || null;
  return {
    name: company?.name || company?.company_name || fromBreakdown?.name || '',
    phone: company?.phone || fromBreakdown?.phone || '',
    address: company?.address || fromBreakdown?.address || '',
  };
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

function sabariSlipTotals(breakdown, payrollRow) {
  const lines = Array.isArray(breakdown?.sabari?.payslipLines) ? breakdown.sabari.payslipLines : null;
  if (!lines) return null;
  const earningRows = lines
    .filter((line) => line.earning && Number(line.amount) > 0)
    .map((line) => [line.label, money(line.amount)]);
  const earningsGross = lines
    .filter((line) => line.earning)
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);
  earningRows.push(['Gross', money(earningsGross)]);
  const deductionRows = lines
    .filter((line) => !line.earning && Number(line.amount) > 0)
    .map((line) => [line.label, money(line.amount)]);
  const esi = Number(breakdown.sabari?.esiDeduction || 0);
  const pf = Number(breakdown.sabari?.pfDeduction || 0);
  if (esi > 0) deductionRows.push(['ESI', money(esi)]);
  if (pf > 0) deductionRows.push(['PF', money(pf)]);
  deductionRows.push(...buildAdvanceDeductionRows(breakdown, payrollRow));
  const { totalAdvance } = resolveAdvanceTotals(breakdown, payrollRow);
  const lineDeductions = lines
    .filter((line) => !line.earning)
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);
  deductionRows.push(['Total ded.', money(lineDeductions + esi + pf + totalAdvance)]);
  return { earningRows, deductionRows, net: earningsGross - (lineDeductions + esi + pf + totalAdvance) };
}

function rowsWithAmount(labelValuePairs) {
  return labelValuePairs
    .filter(([, amount]) => Number(amount || 0) !== 0)
    .map(([label, amount]) => [label, money(amount)]);
}

function resolveAdvanceTotals(breakdown, payrollRow) {
  const b = breakdown?.breakdown || {};
  const repayments = Array.isArray(breakdown?.advance_repayments) ? breakdown.advance_repayments : [];
  const diaryAmount = Number(payrollRow?.manual_advance_amount || 0);
  const loanAmountFromRepayments = repayments.reduce(
    (sum, row) => sum + Number(row?.this_month_deduction || 0),
    0
  );
  const loanFromRow =
    Number(payrollRow?.deducted_loan_repayment || 0) > 0
      ? Number(payrollRow.deducted_loan_repayment)
      : 0;
  const loanAmount =
    loanAmountFromRepayments > 0
      ? loanAmountFromRepayments
      : loanFromRow > 0
        ? loanFromRow
        : Math.max(0, Number(b.salaryAdvance || 0) - diaryAmount);
  const totalAdvance = diaryAmount + loanAmount;
  const storedAdvance = Number(b.salaryAdvance || 0);
  return {
    diaryAmount,
    loanAmount,
    totalAdvance: totalAdvance > 0 ? totalAdvance : storedAdvance,
    pendingLoanBalance: Number(b.pendingAdvanceBalance || 0),
    repayments,
  };
}

function buildAdvanceDeductionRows(breakdown, payrollRow) {
  const { diaryAmount, loanAmount } = resolveAdvanceTotals(breakdown, payrollRow);
  const rows = [];
  if (diaryAmount > 0) {
    rows.push(['Diary advance', money(diaryAmount)]);
  }
  if (loanAmount > 0) {
    rows.push(['Loan repayment', money(loanAmount)]);
  }
  return rows;
}

function buildAdvanceInfoRows(breakdown, payrollRow) {
  const { pendingLoanBalance, repayments } = resolveAdvanceTotals(breakdown, payrollRow);
  const rows = [];

  if (repayments.length > 1) {
    for (const [index, repayment] of repayments.entries()) {
      const outstandingAfter = Number(repayment?.outstanding_balance_after || 0);
      if (outstandingAfter > 0) {
        rows.push([`Loan #${index + 1} outstanding`, money(outstandingAfter)]);
      }
    }
  }

  if (pendingLoanBalance > 0) {
    rows.push(['Outstanding loan balance', money(pendingLoanBalance)]);
  }

  return rows;
}

function drawAdvanceInfoSection(doc, { marginLeft, marginRight, layout, startY, rows, fixedPage, slot }) {
  if (!rows.length) return startY;
  if (fixedPage) doc.setPage(fixedPage);

  let y = startY;
  const lineHeight = layout.tableFont + 2;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  const blockHeight = lineHeight * (rows.length + 1) + layout.tablePadding * 2;
  doc.roundedRect(marginLeft, y, marginRight - marginLeft, blockHeight, 2, 2, 'FD');

  y += layout.tablePadding + 1;
  doc.setFontSize(layout.tableFont);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Advances & loans (info)', marginLeft + 4, y + lineHeight - 2);
  y += lineHeight;

  doc.setFont(undefined, 'normal');
  doc.setTextColor(71, 85, 105);
  for (const [label, value] of rows) {
    doc.text(String(label), marginLeft + 4, y + lineHeight - 2);
    doc.text(String(value), marginRight - 4, y + lineHeight - 2, { align: 'right' });
    y += lineHeight;
  }

  if (fixedPage) trimPagesAfter(doc, fixedPage);
  return startY + blockHeight + layout.sectionGap / 2;
}

function buildAttendanceRows(breakdown, attendanceDetails, options = {}) {
  const compact = Boolean(options.compact);
  const att = breakdown?.attendance || {};
  const allowOvertime = Boolean(att.allowOvertime ?? breakdown?.breakdown?.allowOvertime);
  const { absentDates, lateDetails, weeklyOffDates } = resolvePayslipAttendanceDates(
    breakdown,
    attendanceDetails
  );

  const rows = [
    ['Working days', String(att.workingDays ?? '—')],
    ['Present', `${formatDayCount(att.presentDays)} d`],
    ['Absent', `${formatDayCount(att.absenceDays)} d`],
  ];

  if (weeklyOffDates.length > 0) {
    const weekOffDatesText = formatGroupedDayNumbersText(weeklyOffDates);
    if (compact) {
      rows.push(['Week off / holidays', `${weeklyOffDates.length} d · ${weekOffDatesText}`]);
    } else {
      rows.push(['Week off / holidays', `${weeklyOffDates.length} d`]);
      rows.push(['Week off dates', weekOffDatesText]);
    }
  }

  rows.push(['Late', `${att.lateDays ?? 0}`]);

  if (allowOvertime) {
    rows.push(['Overtime', `${formatHours(att.overtimeHours)} h`]);
  }

  const absentDatesText = formatGroupedDayNumbersText(absentDates);
  rows.push(['Absent dates', compact && absentDatesText.length > 42 ? `${absentDatesText.slice(0, 39)}…` : absentDatesText]);

  const lateDatesText = formatGroupedLateDetailsText(lateDetails);
  rows.push(['Late dates', compact && lateDatesText.length > 42 ? `${lateDatesText.slice(0, 39)}…` : lateDatesText]);

  return rows;
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
    payrollRow = null,
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
  const allowOvertime = Boolean(att.allowOvertime ?? b.allowOvertime);
  const payslipCompany = resolvePayslipCompany(company, breakdown);
  let y = slotY + layout.startY;

  doc.setFontSize(layout.companyTitleSize);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(payslipCompany.name || 'Company'), centerX, y, { align: 'center' });

  y += layout.companyTitleSize + 1;
  if (layoutKey === 'a5') {
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139);
    const companyLine = [payslipCompany.address, payslipCompany.phone].filter(Boolean).join(' | ');
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

  doc.setFontSize(layout.employeeNameSize);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  const employeeLine = `${employeeName || '—'} (${employeeCode || '—'})`;
  const nameLines = doc.splitTextToSize(employeeLine, contentWidth);
  doc.text(nameLines, marginLeft, y);
  y += nameLines.length * (layout.employeeNameSize + 1) + layout.sectionGap / 2;

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
      body: buildAttendanceRows(breakdown, attendanceDetails, { compact: layoutKey === 'a4-half' }),
      columnStylesOverride: {
        0: { cellWidth: layout === LAYOUTS.a5 ? 58 : 42 },
        1: { halign: 'left', cellWidth: 'auto' },
      },
    }) + layout.sectionGap;

  const sabariSlip = sabariSlipTotals(breakdown, payrollRow);
  const earningAmounts = [
    b.basicSalary,
    b.travelAllowance,
    b.otherAllowance,
    ...(allowOvertime ? [b.overtimePay] : []),
    b.paidLeaveEncashmentAmount,
    b.noLeaveIncentive,
  ];
  let earningRows = rowsWithAmount([
    ['Earned basic', b.basicSalary],
    ['Travel', b.travelAllowance],
    ['Other allow.', b.otherAllowance],
    ...(allowOvertime ? [[overtimePayLabel(b.overtimePayMode), b.overtimePay]] : []),
    ['Leave encash', b.paidLeaveEncashmentAmount],
    ['Incentive', b.noLeaveIncentive],
  ]);
  const earningsGross = earningAmounts.reduce((sum, n) => sum + Number(n || 0), 0);
  if (!sabariSlip) earningRows.push(['Gross', money(earningsGross)]);

  const extraBreakRows =
    Array.isArray(b.breakOverstayLines) &&
    b.breakOverstayLines.some((line) => Number(line?.amount || 0) > 0)
      ? b.breakOverstayLines
          .filter(
            (line) =>
              String(line?.name || '').toLowerCase() !== 'lunch' && Number(line?.amount || 0) > 0
          )
          .map((line) => [String(line.name), line.amount])
      : Number(b.otherBreakOverDeduction || 0) > 0
        ? [['Other breaks', b.otherBreakOverDeduction]]
        : [];
  let deductionRows = rowsWithAmount([
    ['Absent', b.absenceDeduction],
    [lateDeductionLabel(b.lateDeductionMode), b.lateDeduction],
    ['Lunch', b.lunchOverDeduction],
    ...extraBreakRows,
    ['ESI', b.esiDeduction],
    ['PF', b.pfDeduction],
  ]);
  const { totalAdvance } = resolveAdvanceTotals(breakdown, payrollRow);
  if (!sabariSlip) {
    deductionRows.push(...buildAdvanceDeductionRows(breakdown, payrollRow));
    const permissionOffset = Number(b.permissionOffsetAmount || 0);
    if (permissionOffset > 0) {
      deductionRows.push(['Perm. offset', `(Rs ${formatMoney(permissionOffset)})`]);
    }
    deductionRows.push(['Total ded.', money(Number(b.totalDeductions || 0) + totalAdvance)]);
  }
  if (sabariSlip) {
    earningRows = sabariSlip.earningRows;
    deductionRows = sabariSlip.deductionRows;
  }

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

  const advanceInfoRows = buildAdvanceInfoRows(breakdown, payrollRow);
  const resolvedNet = sabariSlip
    ? sabariSlip.net
    : Number(b.grossSalary || 0) -
      Number(b.totalDeductions || 0) -
      totalAdvance +
      Number(b.noLeaveIncentive || 0);
  const netDisplay = Number.isFinite(resolvedNet) ? resolvedNet : Number(b.netSalary || 0);

  if (advanceInfoRows.length > 0) {
    y = drawAdvanceInfoSection(doc, {
      fixedPage,
      slot,
      marginLeft,
      marginRight,
      layout,
      startY: y,
      rows: advanceInfoRows,
    });
  }

  if (fixedPage) doc.setPage(fixedPage);
  y += layout.sectionGap;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginRight, y);
  y += layout.sectionGap;
  doc.setFontSize(layout.netFont);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text(`NET SALARY: ${money(netDisplay)}`, marginRight, y, { align: 'right' });

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

function sabariPeriodLabel({ periodLabel, payrollRow, breakdown, company }) {
  const timeZone = company?.timezone || 'Asia/Kolkata';
  const start = ymdToken(payrollRow?.week_start_date || breakdown?.period?.week_start_date, timeZone);
  const end = ymdToken(payrollRow?.week_end_date || breakdown?.period?.week_end_date, timeZone);
  if (start && end) {
    const year = start.slice(0, 4) === end.slice(0, 4) ? start.slice(0, 4) : `${start.slice(0, 4)} – ${end.slice(0, 4)}`;
    return `${formatSabariDate(start)} – ${formatSabariDate(end)} ${year}`;
  }
  if (periodLabel && periodLabel !== '—') return periodLabel;
  if (payrollRow?.year && payrollRow?.month) {
    return new Date(payrollRow.year, payrollRow.month - 1, 1).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
  }
  return '';
}

function sheetDate(ymd) {
  const [year, month, day] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return String(ymd || '—');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(day).padStart(2, '0')}-${months[month - 1]}-${year}`;
}

function moneyPlain(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0.00';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function clockToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Time between the first and last punch that was not paid, such as lunch. */
function outHoursLabel(day) {
  const first = clockToMinutes(day?.firstIn);
  const last = clockToMinutes(day?.lastPunch);
  const inside = Number(day?.insideMinutes);
  if (first == null || last == null || !Number.isFinite(inside)) return '00:00';
  const gap = last - first - inside;
  if (!Number.isFinite(gap) || gap <= 0) return '00:00';
  return formatSabariDuration(gap);
}

function renderSabariPayslipPage(doc, params) {
  const { company, employeeName, employeeCode, breakdown, attendanceDetails, payrollRow } = params;
  const payslipCompany = resolvePayslipCompany(company, breakdown);
  const explanation = breakdown?.sabari?.explanation;
  const working = sabariPayslipExplanation(explanation, money);
  const slip = sabariSlipTotals(breakdown, payrollRow);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const rate = explanation?.hourlyRate ?? attendanceDetails?.basic_salary ?? breakdown?.employee?.basic_salary;

  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, pageWidth, 8, 'F');

  let y = 36;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(String(payslipCompany.name || 'Payslip'), pageWidth / 2, y, { align: 'center' });
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const place = [payslipCompany.address, payslipCompany.phone].filter(Boolean).join('   ·   ');
  if (place) {
    doc.text(place, pageWidth / 2, y, { align: 'center' });
    y += 14;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 64, 175);
  const period = sabariPeriodLabel(params);
  doc.text(period ? `PAYSLIP    ${period}` : 'PAYSLIP', pageWidth / 2, y, { align: 'center' });
  y += 20;

  const days = Array.isArray(explanation?.days) ? explanation.days : [];
  const displayName = String(employeeName || '—');
  const displayCode = String(employeeCode || '—');
  const dayBody = [];
  days.forEach((day, index) => {
    const punchText = formatSabariPunchLine(
      Array.isArray(day.punches) && day.punches.length
        ? day.punches.join(', ')
        : Number(day.punchCount) > 0 && day.firstIn
          ? [day.firstIn && `${day.firstIn} in`, day.lastPunch && day.lastPunch !== day.firstIn ? `${day.lastPunch} out` : '']
              .filter(Boolean)
              .join(', ')
          : '0'
    );
    dayBody.push([
      sheetDate(day.date),
      punchText,
      formatSabariDuration(day.insideMinutes, day.insideHours),
      outHoursLabel(day),
      moneyPlain(day.hourlyPay),
      working?.dayRows?.[index]?.[5] || '',
    ]);
  });
  if (dayBody.length === 0) {
    dayBody.push([sheetDate(''), '0', '00:00', '00:00', '0.00', '']);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const name = doc.splitTextToSize(displayName, 180)[0];
  doc.text(name, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Employee code', margin + 190, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(displayCode, margin + 268, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Per hour  Rs ${moneyPlain(rate)}`, margin + contentWidth, y, { align: 'right' });
  y += 8;

  autoTable(doc, {
    head: [['Date', 'Punch Records', 'In(Hrs)', 'Out(Hrs)', 'Day Payment', 'What applied']],
    body: dayBody,
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.4,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 68 },
      1: { cellWidth: 168, fontSize: 7.5 },
      2: { cellWidth: 46, halign: 'right' },
      3: { cellWidth: 46, halign: 'right' },
      4: { cellWidth: 62, halign: 'right' },
      5: { cellWidth: 125, fontSize: 7.5 },
    },
  });
  y = doc.lastAutoTable.finalY + 12;

  const totalMinutes = days.reduce((sum, day) => sum + Number(day.insideMinutes || 0), 0);
  const weekHours = (totalMinutes / 60).toFixed(2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`This week total work hours :  ${weekHours}`, margin, y);
  y += 14;

  const earningBody = slip?.earningRows?.length ? slip.earningRows : [['—', '']];
  const deductionBody = slip?.deductionRows?.length ? slip.deductionRows : [['Total ded.', money(0)]];
  const moneyRows = Math.max(earningBody.length, deductionBody.length);
  const moneyBody = Array.from({ length: moneyRows }, (_, index) => [
    earningBody[index]?.[0] || '',
    earningBody[index]?.[1] || '',
    deductionBody[index]?.[0] || '',
    deductionBody[index]?.[1] || '',
  ]);
  autoTable(doc, {
    head: [['Earnings', 'Rs', 'Deductions', 'Rs']],
    body: moneyBody,
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3, left: 0, right: 6 }, textColor: [15, 23, 42] },
    headStyles: { fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 10, fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 150 },
      1: { cellWidth: 100, halign: 'right' },
      2: { cellWidth: 155, cellPadding: { top: 3, bottom: 3, left: 28, right: 4 } },
      3: { cellWidth: 110, halign: 'right' },
    },
    didParseCell: (data) => {
      const earnTotal = /^(Gross|Total)/.test(String(data.row.raw?.[0] || ''));
      const dedTotal = /^(Gross|Total)/.test(String(data.row.raw?.[2] || ''));
      if (data.section === 'head' || (earnTotal && data.column.index < 2) || (dedTotal && data.column.index >= 2)) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`NET SALARY:  ${money(slip?.net || 0)}`, margin + contentWidth, y, { align: 'right' });

  const footerY = doc.internal.pageSize.getHeight() - 28;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Generated by PunchPay  ·  punchpay.in', pageWidth / 2, footerY, { align: 'center' });
}

export function createCompactPayslipDoc({
  company,
  employeeName,
  employeeCode,
  periodLabel,
  breakdown,
  attendanceDetails,
  payrollRow,
}) {
  const sabariPage = Array.isArray(breakdown?.sabari?.payslipLines);
  const doc = createPdf({ orientation: 'p', format: sabariPage ? 'a4' : 'a5' });
  if (sabariPage) {
    renderSabariPayslipPage(doc, {
      company,
      employeeName,
      employeeCode,
      periodLabel,
      breakdown,
      attendanceDetails,
      payrollRow,
    });
  } else {
    addCompactPayslipPage(doc, {
      company,
      employeeName,
      employeeCode,
      periodLabel,
      breakdown,
      attendanceDetails,
      payrollRow,
      isFirstPage: true,
    });
  }
  return doc;
}

export function downloadCompactPayslipPdf(params) {
  const doc = createCompactPayslipDoc(params);
  const { employeeName, periodLabel, payrollRow } = params;
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
    const breakdown = payload?.breakdown;
    const resolvedCompany = resolvePayslipCompany(company, breakdown);
    return {
      company: resolvedCompany.name ? resolvedCompany : company,
      employeeName: row.employee_name,
      employeeCode: row.employee_code,
      periodLabel: formatPayslipPeriodLabel(row, payrollMode),
      breakdown: payload.breakdown,
      attendanceDetails: payload.attendanceMeta,
      payrollRow: row,
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
