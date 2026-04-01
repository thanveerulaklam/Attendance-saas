import { useMemo, useRef } from 'react';
import { createPdf, savePdf } from '../../utils/pdfGenerator';

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_LONG = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

function parseDateYMD(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || Number.isNaN(day)) return null;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex, day };
}

function formatJoinDate(value) {
  const d = parseDateYMD(value);
  if (!d) return '—';
  return `${d.day} ${MONTH_SHORT[d.monthIndex]} ${d.year}`;
}

function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return num.toFixed(2).replace(/\.?0+$/, '');
}

function groupDayNumbersByMonth(dateValues) {
  const map = new Map();
  for (const raw of dateValues || []) {
    const d = parseDateYMD(raw);
    if (!d) continue;
    const key = `${d.year}-${d.monthIndex}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: d.year,
        monthIndex: d.monthIndex,
        monthName: MONTH_LONG[d.monthIndex],
        days: new Set(),
      });
    }
    map.get(key).days.add(d.day);
  }

  return [...map.values()]
    .map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
    .sort((a, b) => (a.year - b.year) || (a.monthIndex - b.monthIndex));
}

function renderGroupedDayNumbers(dateValues) {
  const groups = groupDayNumbersByMonth(dateValues);
  if (!groups.length) return '—';

  return groups.map((g) => (
    <span key={g.key} className="block">
      {g.year} {g.monthName}:
      {' '}
      {g.days.map((day, i) => (
        <span key={`${g.key}-${day}`}>
          <span className="font-bold">{day}</span>
          {i < g.days.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  ));
}

function groupLateDetailsByMonth(lateDetails) {
  const map = new Map();
  for (const item of lateDetails || []) {
    const d = parseDateYMD(item?.date);
    if (!d) continue;
    const key = `${d.year}-${d.monthIndex}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        year: d.year,
        monthIndex: d.monthIndex,
        monthName: MONTH_LONG[d.monthIndex],
        days: new Set(),
      });
    }
    map.get(key).days.add(d.day);
  }

  return [...map.values()]
    .map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
    .sort((a, b) => (a.year - b.year) || (a.monthIndex - b.monthIndex));
}

function renderGroupedLateDetails(lateDetails) {
  const groups = groupLateDetailsByMonth(lateDetails);
  if (!groups.length) return '—';

  return groups.map((g) => (
    <span key={g.key} className="block">
      {g.year} {g.monthName}:
      {' '}
      {g.days.map((day, i) => (
        <span key={`${g.key}-${day}`}>
          <span className="font-bold">{day}</span>
          {i < g.days.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  ));
}

export default function PayslipModal({
  open,
  onClose,
  company,
  payrollRow,
  breakdown,
  attendanceDetails,
}) {
  const payslipContentRef = useRef(null);
  const dayDetails = Array.isArray(breakdown?.attendance?.dayDetails)
    ? breakdown.attendance.dayDetails
    : [];
  const fallbackAbsentDates = useMemo(
    () => dayDetails.filter((d) => d?.status === 'absent').map((d) => d.date).filter(Boolean),
    [dayDetails]
  );
  const fallbackHalfDayDates = useMemo(
    () => dayDetails.filter((d) => d?.status === 'half_day').map((d) => d.date).filter(Boolean),
    [dayDetails]
  );
  const fallbackLateDetails = useMemo(
    () =>
      dayDetails
        .filter((d) => d?.late === true)
        .map((d) => ({ date: d.date, minutes: d.minutesLate ?? null }))
        .filter((d) => Boolean(d.date)),
    [dayDetails]
  );
  const effectiveAbsentDates =
    Array.isArray(attendanceDetails?.absentDates) && attendanceDetails.absentDates.length > 0
      ? attendanceDetails.absentDates
      : fallbackAbsentDates;
  const effectiveHalfDayDates =
    Array.isArray(attendanceDetails?.halfDayDates) && attendanceDetails.halfDayDates.length > 0
      ? attendanceDetails.halfDayDates
      : fallbackHalfDayDates;
  const effectiveLateDetails =
    Array.isArray(attendanceDetails?.lateDetails) && attendanceDetails.lateDetails.length > 0
      ? attendanceDetails.lateDetails
      : fallbackLateDetails;

  const periodLabel = useMemo(() => {
    if (!payrollRow) return '';
    if (payrollRow.week_start_date && payrollRow.week_end_date) {
      const s = new Date(`${payrollRow.week_start_date}T00:00:00`);
      const e = new Date(`${payrollRow.week_end_date}T00:00:00`);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '—';

      const sLabel = s.toLocaleString('default', { day: '2-digit', month: 'short' });
      const eLabel = e.toLocaleString('default', { day: '2-digit', month: 'short' });
      const sYear = s.getFullYear();
      const eYear = e.getFullYear();
      if (sYear !== eYear) {
        return `${sLabel} ${sYear} — ${eLabel} ${eYear}`;
      }
      return `${sLabel} — ${eLabel} ${sYear}`;
    }

    const d = new Date(payrollRow.year, payrollRow.month - 1, 1);
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [payrollRow]);

  if (!open || !payrollRow || !breakdown) return null;
  const b = breakdown.breakdown || {};
  const isCompletePeriod =
    b.isMonthComplete != null ? Boolean(b.isMonthComplete) : (b.isWeekComplete != null ? Boolean(b.isWeekComplete) : true);
  const basicEarnedLabel = isCompletePeriod ? 'Basic Earned' : 'Basic Earned (MTD)';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const target = payslipContentRef.current;
    if (!target) return;

    try {
      const { default: html2canvas } = await import('html2canvas');
      const deviceScale = Math.max(1, Number(window.devicePixelRatio) || 1);
      const contentHeight = target.scrollHeight || target.clientHeight || 0;
      const scale = contentHeight > 2200
        ? Math.min(2.2, deviceScale * 1.6)
        : Math.min(3, deviceScale * 2);

      const canvas = await html2canvas(target, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.clientWidth,
      });

      const doc = createPdf({ orientation: 'p' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 16;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;

      const pxPerPt = canvas.width / printableWidth;
      const pageCanvasHeight = Math.max(1, Math.floor(printableHeight * pxPerPt));
      let sourceY = 0;
      let pageIndex = 0;

      while (sourceY < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const pageCtx = pageCanvas.getContext('2d');
        if (!pageCtx) throw new Error('Unable to build PDF page canvas');

        pageCtx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );

        const imageData = pageCanvas.toDataURL('image/png');
        const imageHeightPt = sliceHeight / pxPerPt;

        if (pageIndex > 0) doc.addPage();
        doc.addImage(
          imageData,
          'PNG',
          margin,
          margin,
          printableWidth,
          imageHeightPt,
          undefined,
          'FAST'
        );

        sourceY += sliceHeight;
        pageIndex += 1;
      }

      const safeName = `${payrollRow.employee_name || 'Employee'}`.replace(/\s+/g, '');
      const d = new Date(payrollRow.year, payrollRow.month - 1, 1);
      let filename = `PunchPay_${safeName}_${periodLabel.replace(/\s+/g, '').replace(/[—–-]/g, '_')}.pdf`;
      if (payrollRow.year && payrollRow.month) {
        const monthStr = d
          .toLocaleString('default', { month: 'short', year: 'numeric' })
          .replace(/\s+/g, '');
        filename = `PunchPay_${safeName}_${monthStr}.pdf`;
      }
      savePdf(doc, filename);
    } catch (err) {
      // Fallback to print flow if image capture fails.
      window.print();
    }
  };

  const handleShareWhatsappSummary = () => {
    const att = breakdown.attendance;
    const overtimeHours = formatHours(att?.overtimeHours);
    const detailedDeductions = [
      ['Permission Offset', b.permissionOffsetAmount],
      ['Late Deduction', b.lateDeduction],
      ['Lunch Deduction', b.lunchOverDeduction],
      ['Advance Repayment', b.salaryAdvance],
      ['Absent Deduction', b.absenceDeduction],
      ['ESI Deduction', b.esiDeduction],
    ];
    const payslipText = `
PAYSLIP — ${periodLabel}
${company?.name || ''}

Employee: ${payrollRow.employee_name} (${payrollRow.employee_code})
─────────────────────
ATTENDANCE
Present: ${att?.presentDays ?? '—'} days
Absent: ${att?.absenceDays ?? '—'} days
Late: ${attendanceDetails?.lateCount ?? '—'} times
Overtime: ${overtimeHours === '—' ? '—' : `${overtimeHours} hrs`}

SALARY
Gross: ₹${formatMoney(b.grossSalary)}
Deductions (Detailed):
${detailedDeductions.map(([label, amount]) => `- ${label}: ₹${formatMoney(amount)}`).join('\n')}
Total Deductions: ₹${formatMoney(b.totalDeductions + b.salaryAdvance)}
*Net Salary: ₹${formatMoney(b.netSalary)}*
─────────────────────
Generated by PunchPay
punchpay.in
`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(payslipText)}`;
    window.open(waUrl, '_blank', 'noopener');
  };

  const handleWhatsappToNumber = () => {
    if (!attendanceDetails?.phone) return;
    const digits = String(attendanceDetails.phone).replace(/[^\d]/g, '');
    if (!digits) return;
    const waUrl = `https://wa.me/${digits}`;
    window.open(waUrl, '_blank', 'noopener');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 print:static print:bg-transparent"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200 print:max-h-none print:shadow-none print:border-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur print:hidden">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Payslip</h2>
            <p className="text-xs text-slate-500">
              {payrollRow.employee_name} ({payrollRow.employee_code}) — {periodLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div ref={payslipContentRef} className="px-6 py-5 space-y-4 print:px-10 print:py-8">
          <header className="border-b border-slate-200 pb-3 text-center">
            <h1 className="text-lg font-semibold tracking-wide text-slate-900">
              {company?.name || 'Company'}
            </h1>
            <p className="mt-1 text-[11px] text-slate-600">
              {[company?.address, company?.phone, company?.email].filter(Boolean).join(' | ')}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              PAYSLIP
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Period: {periodLabel}</p>
          </header>

          <section className="grid gap-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-[11px] text-slate-700 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Employee Name</span>
                <span className="font-semibold text-slate-900">{payrollRow.employee_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Employee Code</span>
                <span className="font-semibold text-slate-900">{payrollRow.employee_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Designation</span>
                <span>{attendanceDetails?.designation || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Department</span>
                <span>{attendanceDetails?.department || '—'}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Date of Joining</span>
                <span>{formatJoinDate(attendanceDetails?.join_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Shift</span>
                <span>{attendanceDetails?.shift_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Working Days</span>
                <span>{breakdown.attendance?.workingDays ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Overtime Hours</span>
                <span>{formatHours(breakdown.attendance?.overtimeHours)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] text-slate-700">
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-slate-600">
              ATTENDANCE SUMMARY
            </h3>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <div className="flex justify-between">
                <span>Working Days</span>
                <span className="font-medium">{breakdown.attendance?.workingDays ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Days Present</span>
                <span className="font-medium">{breakdown.attendance?.presentDays ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Payroll Absent Days</span>
                <span className="font-medium text-rose-600">
                  {breakdown.attendance?.absenceDays ?? '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Full Absent Days</span>
                <span className="font-medium text-rose-600">
                  {(attendanceDetails?.absentDates || []).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Half Days</span>
                <span className="font-medium text-amber-600">
                  {breakdown.attendance?.halfDayDays ?? attendanceDetails?.halfDayCount ?? '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Late Arrivals</span>
                <span className="font-medium text-amber-700">
                  {attendanceDetails?.lateCount ?? '—'} times
                </span>
              </div>
              <div className="flex justify-between">
                <span>Overtime Hours</span>
                <span className="font-medium text-emerald-700">
                  {(() => {
                    const v = formatHours(breakdown.attendance?.overtimeHours);
                    return v === '—' ? '—' : `${v} hrs`;
                  })()}
                </span>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-600">
              <p className="font-semibold">Absent Dates:</p>
              <p className="mt-0.5">{renderGroupedDayNumbers(effectiveAbsentDates)}</p>
              <p className="mt-2 font-semibold">Late Arrival Dates:</p>
              <p className="mt-0.5">{renderGroupedLateDetails(effectiveLateDetails)}</p>
              <p className="mt-2 font-semibold">Half Day Dates:</p>
              <p className="mt-0.5">{renderGroupedDayNumbers(effectiveHalfDayDates)}</p>
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] text-slate-700 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-slate-600">
                EARNINGS
              </h3>
              <div className="space-y-1.5">
                {isCompletePeriod && (
                  <div className="flex justify-between">
                    <span>Basic Salary</span>
                    <span className="font-medium">₹{formatMoney(breakdown.employee?.basic_salary)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{basicEarnedLabel}</span>
                  <span className="font-medium">₹{formatMoney(breakdown.breakdown?.basicSalary)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Travel Allow.</span>
                  <span className="font-medium">
                    ₹{formatMoney(breakdown.breakdown?.travelAllowance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Overtime Pay</span>
                  <span className="font-medium text-emerald-700">
                    ₹{formatMoney(breakdown.breakdown?.overtimePay)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>No Leave Bonus</span>
                  <span className="font-medium text-emerald-700">
                    ₹{formatMoney(breakdown.breakdown?.noLeaveIncentive)}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-slate-600">
                DEDUCTIONS
              </h3>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>Permission Offset</span>
                  <span className="font-medium text-emerald-700">
                    −₹{formatMoney(breakdown.breakdown?.permissionOffsetAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Late Deduction</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.lateDeduction)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Lunch Deduct.</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.lunchOverDeduction)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Advance Repayment</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.salaryAdvance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Pending Advance Balance</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.pendingAdvanceBalance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Absent Deduct.</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.absenceDeduction)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>ESI Deduction</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.esiDeduction)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {!!(breakdown.advance_repayments || []).length && (
            <section className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] text-slate-700">
              <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-slate-600">
                ADVANCE REPAYMENTS
              </h3>
              <div className="space-y-1.5">
                {(breakdown.advance_repayments || []).map((repayment, index) => (
                  <div key={`${repayment.loan_id}-${index}`} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1.5">
                    <div>
                      <p className="font-medium text-slate-800">
                        Loan #{index + 1} (₹{formatMoney(repayment.original_loan_amount)} on {repayment.loan_date || '—'})
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Outstanding after: ₹{formatMoney(repayment.outstanding_balance_after)}
                      </p>
                    </div>
                    <p className="font-semibold text-amber-700">-₹{formatMoney(repayment.this_month_deduction)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                <span>Total Advance Deduction</span>
                <span>-₹{formatMoney(breakdown.breakdown?.salaryAdvance)}</span>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[11px] text-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">Gross Salary</p>
                <p className="text-base font-semibold text-slate-900">
                  ₹{formatMoney(breakdown.breakdown?.grossSalary)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Total Deductions</p>
                <p className="text-sm font-semibold text-amber-700">
                  ₹{formatMoney(breakdown.breakdown?.totalDeductions + breakdown.breakdown?.salaryAdvance)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">NET SALARY</p>
                <p className="text-lg font-bold text-emerald-700">
                  ₹{formatMoney(breakdown.breakdown?.netSalary)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-600">ESI Amount</p>
                <p className="text-sm font-medium text-slate-800">
                  ₹{formatMoney(breakdown.breakdown?.esiDeduction)}
                </p>
              </div>
            </div>
            {(Number(breakdown.breakdown?.permissionHoursAllocated || 0) > 0 ||
              Number(breakdown.breakdown?.permissionMinutesUsed || 0) > 0) && (
              <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
                Permission allocated: {formatHours(breakdown.breakdown?.permissionHoursAllocated)} hrs | Used:{' '}
                {formatHours(Number(breakdown.breakdown?.permissionMinutesUsed || 0) / 60)} hrs
              </div>
            )}
          </section>

          <section className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-3 text-[10px] text-slate-500">
            <span>Generated by PunchPay | punchpay.in</span>
          </section>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-6 py-3 backdrop-blur print:hidden">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={handleShareWhatsappSummary}
              className="inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Share Summary on WhatsApp
            </button>
            {attendanceDetails?.phone && (
              <button
                type="button"
                onClick={handleWhatsappToNumber}
                className="inline-flex items-center rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Open WhatsApp for Employee
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

