import { useEffect, useMemo, useState } from 'react';
import { downloadCompactPayslipPdf } from '../../utils/payslipPdf';
import { normalizeWhatsAppNumber, openWhatsAppChat } from '../../utils/whatsapp';
import { authFetch } from '../../utils/api';
import RecordPaymentModal, { paymentModeLabel } from './RecordPaymentModal';

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function formatInrWithSymbol(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${formatMoney(n)}`;
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

function formatHours(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return num.toFixed(2).replace(/\.?0+$/, '');
}

function formatDayCount(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return num.toFixed(2).replace(/\.?0+$/, '');
}

function formatMoneyPrecise(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(n));
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

/** Match payroll period end (ISO Y-M-D); hide future calendar days on in-progress payslips. */
function filterYmdOnOrBefore(asOfYmd, dateValues) {
  const cap = String(asOfYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cap)) return dateValues || [];
  return (dateValues || []).filter((d) => String(d).slice(0, 10) <= cap);
}

function filterLateDetailsOnOrBefore(asOfYmd, items) {
  const cap = String(asOfYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cap)) return items || [];
  return (items || []).filter((it) => String(it?.date || '').slice(0, 10) <= cap);
}

function buildPayslipWhatsAppText({
  company,
  payrollRow,
  periodLabel,
  att,
  b,
  effectiveLateDetails,
}) {
  const overtimeHours = formatHours(att?.overtimeHours);
  const detailedDeductions = [
    ['Permission Offset', b.permissionOffsetAmount],
    ['Late Deduction', b.lateDeduction],
    ['Lunch Deduction', b.lunchOverDeduction],
    ['Advance Repayment', b.salaryAdvance],
    ['Absent Deduction', b.absenceDeduction],
    ['ESI Deduction', b.esiDeduction],
    ['PF Deduction', b.pfDeduction],
  ];

  return `PAYSLIP - ${periodLabel}
${company?.name || ''}

Employee: ${payrollRow.employee_name} (${payrollRow.employee_code})
---------------------
ATTENDANCE
Present: ${formatDayCount(att?.presentDays)} days
Absent: ${formatDayCount(att?.absenceDays)} days
Late: ${effectiveLateDetails.length} times
Overtime: ${overtimeHours === '—' ? '-' : `${overtimeHours} hrs`}

SALARY
Gross: Rs ${formatMoney(b.grossSalary)}
Deductions:
${detailedDeductions.map(([label, amount]) => `- ${label}: Rs ${formatMoney(amount)}`).join('\n')}
Total Deductions: Rs ${formatMoney((b.totalDeductions || 0) + (b.salaryAdvance || 0))}
Net Salary: Rs ${formatMoney(b.netSalary)}
---------------------
Generated by PunchPay
punchpay.in`;
}

export default function PayslipModal({
  open,
  onClose,
  company,
  payrollRow,
  breakdown,
  attendanceDetails,
  payrollMode = 'monthly',
  onPaymentRecorded,
}) {
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const dayDetails = Array.isArray(breakdown?.attendance?.dayDetails)
    ? breakdown.attendance.dayDetails
    : [];
  const hasDayDetails = dayDetails.length > 0;
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
  const payrollAsOfYmd = (breakdown?.attendance?.workingDaysUpToDate || '').slice(0, 10);

  useEffect(() => {
    if (!open || !payrollRow?.id) {
      setPaymentSummary(null);
      return undefined;
    }
    let cancelled = false;
    async function loadPayments() {
      setPaymentLoading(true);
      try {
        const path = payrollMode === 'weekly'
          ? `/api/salary-payments/weekly/${payrollRow.id}`
          : `/api/salary-payments/payroll/${payrollRow.id}`;
        const res = await authFetch(path, { headers: { 'Content-Type': 'application/json' } });
        const json = res.ok ? await res.json() : { data: null };
        if (!cancelled) setPaymentSummary(json.data || null);
      } catch {
        if (!cancelled) setPaymentSummary(null);
      } finally {
        if (!cancelled) setPaymentLoading(false);
      }
    }
    loadPayments();
    return () => { cancelled = true; };
  }, [open, payrollRow?.id, payrollMode]);

  const balanceDue = paymentSummary != null
    ? Number(paymentSummary.balance_due || 0)
    : Math.max(0, Number(payrollRow?.net_salary || 0) - Number(payrollRow?.total_paid || 0));
  const paymentStatus = paymentSummary?.payment_status || payrollRow?.payment_status || 'unpaid';

  const rawAbsentDates = useMemo(() => {
    if (hasDayDetails && fallbackAbsentDates.length > 0) {
      return fallbackAbsentDates;
    }
    if (Array.isArray(attendanceDetails?.absentDates) && attendanceDetails.absentDates.length > 0) {
      return attendanceDetails.absentDates;
    }
    return fallbackAbsentDates;
  }, [attendanceDetails?.absentDates, fallbackAbsentDates, hasDayDetails]);
  const rawHalfDayDates = useMemo(() => {
    if (hasDayDetails && fallbackHalfDayDates.length > 0) {
      return fallbackHalfDayDates;
    }
    if (Array.isArray(attendanceDetails?.halfDayDates) && attendanceDetails.halfDayDates.length > 0) {
      return attendanceDetails.halfDayDates;
    }
    return fallbackHalfDayDates;
  }, [attendanceDetails?.halfDayDates, fallbackHalfDayDates, hasDayDetails]);
  const rawLateDetails = useMemo(() => {
    if (hasDayDetails && fallbackLateDetails.length > 0) {
      return fallbackLateDetails;
    }
    if (Array.isArray(attendanceDetails?.lateDetails) && attendanceDetails.lateDetails.length > 0) {
      return attendanceDetails.lateDetails;
    }
    return fallbackLateDetails;
  }, [attendanceDetails?.lateDetails, fallbackLateDetails, hasDayDetails]);
  const effectiveAbsentDates = useMemo(
    () => filterYmdOnOrBefore(payrollAsOfYmd, rawAbsentDates),
    [payrollAsOfYmd, rawAbsentDates]
  );
  const effectiveHalfDayDates = useMemo(
    () => filterYmdOnOrBefore(payrollAsOfYmd, rawHalfDayDates),
    [payrollAsOfYmd, rawHalfDayDates]
  );
  const effectiveLateDetails = useMemo(
    () => filterLateDetailsOnOrBefore(payrollAsOfYmd, rawLateDetails),
    [payrollAsOfYmd, rawLateDetails]
  );

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

  const employeePhone =
    attendanceDetails?.phone || attendanceDetails?.phone_number || null;
  const employeeWhatsAppNumber = normalizeWhatsAppNumber(employeePhone);
  const payslipWhatsAppText = useMemo(() => {
    if (!payrollRow || !breakdown) return '';
    const b = breakdown.breakdown || {};
    return buildPayslipWhatsAppText({
      company,
      payrollRow,
      periodLabel,
      att: breakdown.attendance,
      b,
      effectiveLateDetails,
    });
  }, [company, payrollRow, periodLabel, breakdown, effectiveLateDetails]);

  if (!open || !payrollRow || !breakdown) return null;
  const b = breakdown.breakdown || {};
  const isHoursBasedPayroll =
    String(breakdown?.attendance?.attendanceMode || '').toLowerCase() === 'hours_based';
  const absentDaysNum = Number(breakdown?.attendance?.absenceDays || 0);
  const absentDeductNum = Number(breakdown?.breakdown?.absenceDeduction || 0);
  const absentPerDayRate =
    absentDaysNum > 0 && Number.isFinite(absentDeductNum)
      ? absentDeductNum / absentDaysNum
      : 0;
  const absentDeductFormula =
    absentDaysNum > 0 && absentDeductNum > 0
      ? `${formatHours(absentDaysNum)} days x Rs ${formatMoneyPrecise(absentPerDayRate)}/day = Rs ${formatMoneyPrecise(absentDeductNum)}`
      : null;
  const fullAbsentDaysCount = effectiveAbsentDates.length;
  const halfDayCountFromDates = effectiveHalfDayDates.length;
  const halfDayCountForDisplay = hasDayDetails
    ? halfDayCountFromDates
    : (breakdown.attendance?.halfDayDays ?? attendanceDetails?.halfDayCount ?? '—');
  const equivalentAbsenceFromDates = fullAbsentDaysCount + (halfDayCountFromDates * 0.5);
  const showAbsenceMismatchNote =
    !isHoursBasedPayroll &&
    hasDayDetails &&
    Number.isFinite(absentDaysNum) &&
    Math.abs(absentDaysNum - equivalentAbsenceFromDates) >= 0.01;
  const isCompletePeriod =
    b.isMonthComplete != null ? Boolean(b.isMonthComplete) : (b.isWeekComplete != null ? Boolean(b.isWeekComplete) : true);

  const handlePrint = () => {
    document.body.classList.add('payslip-printing');
    const cleanup = () => {
      document.body.classList.remove('payslip-printing');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    requestAnimationFrame(() => {
      window.print();
    });
  };

  const handleDownloadPdf = () => {
    downloadCompactPayslipPdf({
      company,
      employeeName: payrollRow.employee_name,
      employeeCode: payrollRow.employee_code,
      periodLabel,
      breakdown,
      attendanceDetails,
      payrollRow,
    });
  };

  const handleSendPayslipWhatsApp = () => {
    if (!employeeWhatsAppNumber || !payslipWhatsAppText.trim()) return;
    openWhatsAppChat(employeePhone, payslipWhatsAppText);
  };

  const handleShareWhatsappSummary = () => {
    if (!payslipWhatsAppText.trim()) return;
    openWhatsAppChat(null, payslipWhatsAppText);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3"
      onClick={onClose}
    >
      <div
        className="payslip-print-root w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur payslip-print-hidden">
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

        <div className="px-6 py-5 space-y-4">
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
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Basic Salary</span>
                <span>{formatInrWithSymbol(attendanceDetails?.basic_salary)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
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
              <div className="flex justify-between">
                <span className="font-medium text-slate-600">Unused Paid Leave</span>
                <span>{formatHours(breakdown.breakdown?.unusedPaidLeaveDays)} days</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] text-slate-700">
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-slate-600">
              ATTENDANCE SUMMARY
            </h3>
            {breakdown.attendance?.payrollFrozenToRecord === true && breakdown.attendance?.liveAttendanceNote && (
              <p className="payslip-print-hidden mb-2 rounded-md border border-amber-100 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-900">
                {breakdown.attendance.liveAttendanceNote}
                {breakdown.attendance?.payrollGeneratedAt && (
                  <span className="mt-0.5 block text-[9px] text-amber-800/90">
                    Payroll run:{' '}
                    {new Date(breakdown.attendance.payrollGeneratedAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                )}
              </p>
            )}
            {isHoursBasedPayroll && (
              <p className="payslip-print-hidden mb-2 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] text-blue-800">
                Hours-based payroll mode: salary is prorated by hours worked (worked hours / required hours per day).
                Full-day and half-day buckets are not used for payroll calculation.
              </p>
            )}
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <div className="flex justify-between">
                <span>Working Days</span>
                <span className="font-medium">{breakdown.attendance?.workingDays ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Days Present</span>
                <span className="font-medium">{formatDayCount(breakdown.attendance?.presentDays)}</span>
              </div>
              <div className="flex justify-between">
                <span>Salary Deduction Absence</span>
                <span className="font-medium text-rose-600">
                  {formatDayCount(breakdown.attendance?.absenceDays)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Full Absent Days</span>
                <span className="font-medium text-rose-600">{fullAbsentDaysCount}</span>
              </div>
              <div className="flex justify-between">
                <span>{isHoursBasedPayroll ? 'Partial Days' : 'Half Days'}</span>
                <span className="font-medium text-amber-600">
                  {halfDayCountForDisplay}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Late Arrivals</span>
                <span className="font-medium text-amber-700">
                  {effectiveLateDetails.length} times
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
            <p className="payslip-print-hidden mt-2 text-[10px] text-slate-500">
              {isHoursBasedPayroll
                ? 'Salary deduction absence is computed from worked-hours shortfall against required hours.'
                : 'Salary deduction absence = full absent days + (half days x 0.5).'}
            </p>
            {showAbsenceMismatchNote && (
              <p className="payslip-print-hidden mt-1 text-[10px] text-amber-600">
                Attendance buckets and payroll absence differ slightly due to payroll rules (leave/rounding/policy overrides).
              </p>
            )}
            <div className="payslip-print-hidden mt-3 text-[11px] text-slate-600">
              <p className="font-semibold">Absent Dates:</p>
              {payrollAsOfYmd && (
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Listed through {new Date(`${payrollAsOfYmd}T12:00:00`).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  .
                </p>
              )}
              <p className="mt-0.5">{renderGroupedDayNumbers(effectiveAbsentDates)}</p>
              <p className="mt-2 font-semibold">Late Arrival Dates:</p>
              <p className="mt-0.5">{renderGroupedLateDetails(effectiveLateDetails)}</p>
              <p className="mt-2 font-semibold">{isHoursBasedPayroll ? 'Partial Day Dates:' : 'Half Day Dates:'}</p>
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
                  <span>Paid Leave Encashment</span>
                  <span className="font-medium text-emerald-700">
                    ₹{formatMoney(breakdown.breakdown?.paidLeaveEncashmentAmount)}
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
                {absentDeductFormula && (
                  <p className="payslip-print-hidden -mt-0.5 text-[10px] text-slate-500">
                    {absentDeductFormula}
                  </p>
                )}
                <div className="flex justify-between">
                  <span>ESI Deduction</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.esiDeduction)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>PF Deduction</span>
                  <span className="font-medium text-amber-700">
                    ₹{formatMoney(breakdown.breakdown?.pfDeduction)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {!!(breakdown.advance_repayments || []).length && (
            <section className="payslip-print-hidden rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] text-slate-700">
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
              <div className="payslip-print-hidden mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
                Permission allocated: {formatHours(breakdown.breakdown?.permissionHoursAllocated)} hrs | Used:{' '}
                {formatHours(Number(breakdown.breakdown?.permissionMinutesUsed || 0) / 60)} hrs
              </div>
            )}
          </section>

          <section className="payslip-print-hidden rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-[11px] text-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[11px] font-semibold tracking-wide text-emerald-800">PAYMENT STATUS</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Paid: ₹{formatMoneyPrecise(paymentSummary?.total_paid ?? payrollRow?.total_paid ?? 0)}
                  {' · '}
                  Balance: <span className="font-semibold text-amber-700">₹{formatMoneyPrecise(balanceDue)}</span>
                </p>
                <p className="mt-0.5 text-[10px] capitalize text-slate-500">Status: {paymentStatus}</p>
              </div>
              <button
                type="button"
                onClick={() => setRecordPaymentOpen(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Record payment
              </button>
            </div>
            {paymentLoading ? (
              <p className="mt-2 text-[10px] text-slate-500">Loading payment history...</p>
            ) : (paymentSummary?.payments || []).length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-[10px]">
                  <thead>
                    <tr className="border-b border-emerald-100 text-left text-slate-600">
                      <th className="pb-1 pr-2 font-medium">Date</th>
                      <th className="pb-1 pr-2 font-medium">Mode</th>
                      <th className="pb-1 pr-2 font-medium">Reference</th>
                      <th className="pb-1 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(paymentSummary.payments || []).map((p) => (
                      <tr key={p.id} className="border-b border-emerald-50">
                        <td className="py-1 pr-2">{String(p.payment_date).slice(0, 10)}</td>
                        <td className="py-1 pr-2">{paymentModeLabel(p.payment_mode)}</td>
                        <td className="py-1 pr-2">{p.reference_number || '—'}</td>
                        <td className="py-1 text-right font-medium">₹{formatMoneyPrecise(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-[10px] text-slate-500">No payments recorded yet for this payroll.</p>
            )}
          </section>

          <section className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-3 text-[10px] text-slate-500">
            <span>Generated by PunchPay | punchpay.in</span>
          </section>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-6 py-3 backdrop-blur payslip-print-hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={handleSendPayslipWhatsApp}
              disabled={!employeeWhatsAppNumber}
              title={
                employeeWhatsAppNumber
                  ? `Open WhatsApp chat with ${payrollRow.employee_name}`
                  : 'Add the employee phone number in Employees to send payslip on WhatsApp'
              }
              className="inline-flex items-center rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              WhatsApp payslip to employee
            </button>
            <button
              type="button"
              onClick={handleShareWhatsappSummary}
              className="inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Share via WhatsApp (other)
            </button>
            {!employeeWhatsAppNumber && (
              <p className="text-[10px] text-amber-700 sm:basis-full">
                No valid phone on file — add the employee&apos;s mobile number under Employees → Edit.
              </p>
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

      <RecordPaymentModal
        open={recordPaymentOpen}
        onClose={() => setRecordPaymentOpen(false)}
        payrollRow={payrollRow}
        payrollMode={payrollMode}
        onSaved={async (data) => {
          setRecordPaymentOpen(false);
          onPaymentRecorded?.(data);
          try {
            const path = payrollMode === 'weekly'
              ? `/api/salary-payments/weekly/${payrollRow.id}`
              : `/api/salary-payments/payroll/${payrollRow.id}`;
            const res = await authFetch(path, { headers: { 'Content-Type': 'application/json' } });
            const json = res.ok ? await res.json() : { data: null };
            setPaymentSummary(json.data || null);
          } catch {
            // ignore refresh failure
          }
        }}
      />
    </div>
  );
}

