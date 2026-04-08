import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../utils/api';
import { getSubscriptionStatus } from '../utils/subscription';
import PayslipModal from '../components/payroll/PayslipModal';
import { createPdf, addReportHeader, addAutoTable, savePdf } from '../utils/pdfGenerator';

const PAGE_SIZE = 10;
const MONTHS = [
  { value: '', label: 'All months' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
  })),
];

function currentYear() {
  return new Date().getFullYear();
}

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function formatPermissionUsedHours(minutes) {
  const m = Number(minutes || 0);
  if (!Number.isFinite(m) || m <= 0) return '0';
  const hours = m / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
}

function buildWeeklyOffDateSet(year, month, weeklyOffDays) {
  const y = Number(year);
  const m = Number(month);
  const days = Array.isArray(weeklyOffDays)
    ? [...new Set(weeklyOffDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : [];
  if (!y || !m || m < 1 || m > 12 || days.length === 0) {
    return new Set();
  }

  const result = new Set();
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const utcDate = new Date(Date.UTC(y, m - 1, d));
    if (days.includes(utcDate.getUTCDay())) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      result.add(key);
    }
  }
  return result;
}

function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  if (/[,"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function payrollRowsToCsv(rows, payrollMode) {
  const headers =
    payrollMode === 'monthly'
      ? [
          'Employee',
          'Code',
          'Period',
          'Present days',
          'Total days',
          'Absent days',
          'Overtime (hrs)',
          'Gross',
          'Deductions',
          'Permission used (hrs)',
          'Permission offset',
          'Advance',
          'Incentive',
          'Net salary',
        ]
      : [
          'Employee',
          'Code',
          'Week',
          'Present days',
          'Total days',
          'Absent days',
          'Overtime (hrs)',
          'Gross',
          'Deductions',
          'Permission used (hrs)',
          'Permission offset',
          'Advance',
          'Incentive',
          'Net salary',
        ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  rows.forEach((row) => {
    const period =
      payrollMode === 'monthly'
        ? new Date(row.year, row.month - 1, 1).toLocaleString('default', {
            month: 'long',
            year: 'numeric',
          })
        : formatWeekLabel(row.week_start_date, row.week_end_date);
    lines.push(
      [
        row.employee_name,
        row.employee_code,
        period,
        row.present_days,
        row.total_days,
        row.absence_days ?? Math.max(0, Number(row.total_days || 0) - Number(row.present_days || 0)),
        row.overtime_hours,
        row.gross_salary,
        row.deductions,
        formatPermissionUsedHours(row.permission_minutes_used),
        row.permission_offset_amount ?? 0,
        row.salary_advance,
        row.no_leave_incentive,
        row.net_salary,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  });
  return lines.join('\r\n');
}

function triggerDownloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildPayrollPrintDocument(rows, payrollMode, companyName) {
  const title = companyName ? `${companyName} — Payroll` : 'Payroll';
  const rowsHtml = rows
    .map((row) => {
      const period =
        payrollMode === 'monthly'
          ? new Date(row.year, row.month - 1, 1).toLocaleString('default', {
              month: 'short',
              year: 'numeric',
            })
          : formatWeekLabel(row.week_start_date, row.week_end_date);
      return `<tr>
        <td>${escapeHtml(row.employee_name || '')}</td>
        <td>${escapeHtml(row.employee_code || '')}</td>
        <td>${escapeHtml(period)}</td>
        <td class="num">${row.present_days ?? ''} / ${row.total_days ?? ''}</td>
        <td class="num">${
          row.absence_days != null
            ? row.absence_days
            : Math.max(0, Number(row.total_days || 0) - Number(row.present_days || 0))
        }</td>
        <td class="num">${row.overtime_hours ?? ''}</td>
        <td class="num">${formatMoney(row.gross_salary)}</td>
        <td class="num">${formatMoney(row.deductions)}</td>
        <td class="num">${formatPermissionUsedHours(row.permission_minutes_used)}</td>
        <td class="num">${formatMoney(row.permission_offset_amount)}</td>
        <td class="num">${formatMoney(row.salary_advance)}</td>
        <td class="num">${formatMoney(row.no_leave_incentive)}</td>
        <td class="num"><strong>${formatMoney(row.net_salary)}</strong></td>
      </tr>`;
    })
    .join('');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; font-size: 12px; color: #0f172a; padding: 24px; }
    h1 { font-size: 16px; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; font-size: 11px; }
    td.num { text-align: right; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table>
    <thead>
      <tr>
        <th>Employee</th>
        <th>Code</th>
        <th>${payrollMode === 'monthly' ? 'Period' : 'Week'}</th>
        <th>Present</th>
        <th>Absent</th>
        <th>OT (hrs)</th>
        <th>Gross</th>
        <th>Deductions</th>
        <th>Permission (hrs)</th>
        <th>Permission offset</th>
        <th>Advance</th>
        <th>Incentive</th>
        <th>Net</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function payrollRowsToPdfData(rows, payrollMode) {
  const header = [
    'Employee',
    'Code',
    payrollMode === 'monthly' ? 'Period' : 'Week',
    'Present / Total',
    'Absent days',
    'OT (hrs)',
    'Gross',
    'Deductions',
    'Permission (hrs)',
    'Permission offset',
    'Advance',
    'Incentive',
    'Net salary',
  ];
  const body = rows.map((row) => {
    const period =
      payrollMode === 'monthly'
        ? new Date(row.year, row.month - 1, 1).toLocaleString('default', {
            month: 'long',
            year: 'numeric',
          })
        : formatWeekLabel(row.week_start_date, row.week_end_date);
    return [
      String(row.employee_name ?? ''),
      String(row.employee_code ?? ''),
      period,
      `${row.present_days ?? ''} / ${row.total_days ?? ''}`,
      String(
        row.absence_days != null
          ? row.absence_days
          : Math.max(0, Number(row.total_days || 0) - Number(row.present_days || 0))
      ),
      String(row.overtime_hours ?? ''),
      formatMoney(row.gross_salary),
      formatMoney(row.deductions),
      formatPermissionUsedHours(row.permission_minutes_used),
      formatMoney(row.permission_offset_amount),
      formatMoney(row.salary_advance),
      formatMoney(row.no_leave_incentive),
      formatMoney(row.net_salary),
    ];
  });
  const netTotal = rows.reduce((s, r) => s + (Number(r.net_salary) || 0), 0);
  return { header, body, netTotal };
}

function buildPayrollPdfDocument(rows, payrollMode, company, periodLabel) {
  const { header, body, netTotal } = payrollRowsToPdfData(rows, payrollMode);
  const doc = createPdf({ orientation: 'landscape' });
  const startY = addReportHeader(doc, {
    companyName: company?.name,
    companyPhone: company?.phone,
    companyAddress: company?.address,
    title: 'Payroll',
    periodLabel,
    generatedAt: new Date().toLocaleString(),
    totalEmployees: rows.length,
  });
  addAutoTable(doc, [header], body, {
    startY,
    margin: { left: 24, right: 24 },
    styles: { fontSize: 7 },
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const y = doc.internal.pageSize.getHeight() - 44;
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  const label = `INR: ${formatMoney(netTotal)}`;
  doc.text(label, pageWidth * 0.75, y, { align: 'center' });
  return doc;
}

function toYmdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSundayYmd(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  d.setDate(d.getDate() - day);
  return toYmdLocal(d);
}

function snapToSundayYmd(ymdStr) {
  const raw = String(ymdStr || '').slice(0, 10);
  if (!raw) return getSundayYmd(new Date());
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return getSundayYmd(new Date());
  return getSundayYmd(d);
}

function formatWeekLabel(weekStartDate, weekEndDate) {
  if (!weekStartDate || !weekEndDate) return '—';
  const s = new Date(`${weekStartDate}T00:00:00`);
  const e = new Date(`${weekEndDate}T00:00:00`);
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

function toYmdDateString(value) {
  if (!value) return '';
  if (value instanceof Date) return toYmdLocal(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return toYmdLocal(d);
}

/** ISO date strings compare lexicographically; use for payroll "as of" vs calendar day keys. */
function filterYmdOnOrBefore(asOfYmd, dateValues) {
  const cap = String(asOfYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cap)) return dateValues || [];
  return (dateValues || []).filter((d) => String(d).slice(0, 10) <= cap);
}

function formatPayslipPeriodLabel(row, payrollMode) {
  if (payrollMode === 'weekly') {
    return formatWeekLabel(row.week_start_date, row.week_end_date);
  }
  return new Date(row.year, row.month - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}

function addPayslipPage(doc, { company, row, payrollMode, breakdown, attendanceMeta, isFirstPage }) {
  if (!isFirstPage) doc.addPage();

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const frameLeft = margin;
  const frameRight = pageWidth - margin;
  const labelX = frameLeft + 8;
  const valueX = frameRight - 10;
  const contentWidth = frameRight - frameLeft - 16;
  let y = 32;
  const lineGap = 11;
  const sectionGap = 14;
  const b = breakdown?.breakdown || {};
  const att = breakdown?.attendance || {};
  const isHoursBasedPayroll = String(att?.attendanceMode || '').toLowerCase() === 'hours_based';
  const periodLabel = formatPayslipPeriodLabel(row, payrollMode);

  const writeLeft = (text, options = {}) => {
    doc.text(String(text), labelX, y, options);
    y += lineGap;
  };

  const writeKv = (label, value, color = [15, 23, 42]) => {
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(String(label), labelX, y);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...color);
    doc.text(String(value ?? '—'), valueX, y, { align: 'right' });
    y += lineGap;
  };

  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(frameLeft, 20, frameRight - frameLeft, pageHeight - 40, 4, 4);

  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(company?.name || 'Company'), labelX, y);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100, 116, 139);
  const addressLine = [company?.address, company?.phone, company?.email].filter(Boolean).join(' | ');
  const companyLines = doc.splitTextToSize(addressLine || '—', contentWidth);
  y += 12;
  doc.text(companyLines, labelX, y);
  y += companyLines.length * 10;

  doc.setDrawColor(226, 232, 240);
  doc.line(labelX, y, valueX, y);
  y += 10;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('PAYSLIP', labelX, y);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Period: ${periodLabel}`, valueX, y, { align: 'right' });
  y += sectionGap;

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(51, 65, 85);
  writeLeft('EMPLOYEE DETAILS');
  doc.setFontSize(9);
  writeKv('Employee Name', row.employee_name || '—');
  writeKv('Employee Code', row.employee_code || '—');
  writeKv('Department', attendanceMeta?.department || '—');
  writeKv(
    'Date of Joining',
    attendanceMeta?.join_date
      ? new Date(attendanceMeta.join_date).toLocaleDateString('en-IN')
      : '—'
  );
  writeKv('Shift', attendanceMeta?.shift_name || '—');
  writeKv('Payroll Type', payrollMode === 'weekly' ? 'Weekly' : 'Monthly');
  y += 4;

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(51, 65, 85);
  writeLeft('ATTENDANCE');
  if (isHoursBasedPayroll) {
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(37, 99, 235);
    const hoursModeNote = doc.splitTextToSize(
      'Hours-based payroll mode: salary is prorated by worked hours/required hours per day. Full-day and half-day buckets are not used for payroll calculation.',
      contentWidth
    );
    doc.text(hoursModeNote, labelX, y);
    y += hoursModeNote.length * 9;
  }
  doc.setFontSize(9);
  writeKv('Working Days', `${att.workingDays ?? '—'} days`);
  writeKv('Present', `${att.presentDays ?? '—'} days`);
  writeKv('Absent', `${att.absenceDays ?? '—'} days`, [190, 24, 93]);
  writeKv('Late', `${att.lateDays ?? 0} times`, [180, 83, 9]);
  writeKv('Overtime', `${Number(att.overtimeHours || 0)} hrs`, [5, 150, 105]);
  writeKv('Unused Paid Leave', `${Number(b.unusedPaidLeaveDays || 0)} days`, [22, 101, 52]);
  y += 4;

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(51, 65, 85);
  writeLeft('SALARY');
  doc.setFontSize(9);
  writeKv('Gross Salary', `INR ${formatMoney(b.grossSalary)}`);
  writeKv('Paid Leave Encashment', `INR ${formatMoney(b.paidLeaveEncashmentAmount)}`, [5, 150, 105]);
  writeKv('Permission Offset', `INR ${formatMoney(b.permissionOffsetAmount)}`);
  writeKv('Late Deduction', `INR ${formatMoney(b.lateDeduction)}`);
  writeKv('Lunch Deduction', `INR ${formatMoney(b.lunchOverDeduction)}`);
  writeKv('Advance Repayment', `INR ${formatMoney(b.salaryAdvance)}`);
  writeKv('Absent Deduction', `INR ${formatMoney(b.absenceDeduction)}`);
  writeKv('ESI Deduction', `INR ${formatMoney(b.esiDeduction)}`);
  writeKv('PF Deduction', `INR ${formatMoney(b.pfDeduction)}`);
  writeKv(
    'Total Deductions',
    `INR ${formatMoney((b.totalDeductions || 0) + (b.salaryAdvance || 0))}`,
    [180, 83, 9]
  );

  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(labelX, y, valueX, y);
  y += 11;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text(`NET SALARY: INR ${formatMoney(b.netSalary)}`, valueX, y, { align: 'right' });

  const footerY = pageHeight - 18;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Generated by PunchPay | punchpay.in', pageWidth / 2, footerY, { align: 'center' });
}

export default function PayrollPage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [payrollMode, setPayrollMode] = useState('monthly'); // 'monthly' | 'weekly'
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [weekStartDate, setWeekStartDate] = useState(getSundayYmd(new Date()));
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    year: currentYear(),
    month: String(new Date().getMonth() + 1),
    includeOvertime: false,
    treatHolidayAdjacentAbsenceAsWorking: false,
    applyAdvanceRepayments: false,
    encashUnusedPaidLeave: false,
    noLeaveIncentive: '',
  });
  const [weeklyGenerateForm, setWeeklyGenerateForm] = useState({
    includeOvertime: false,
    treatHolidayAdjacentAbsenceAsWorking: false,
    applyAdvanceRepayments: false,
  });
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState(null);
  const [generationFailures, setGenerationFailures] = useState([]);
  const [failureModalOpen, setFailureModalOpen] = useState(false);
  const [company, setCompany] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [attendanceMeta, setAttendanceMeta] = useState(null);
  const [selectedPayroll, setSelectedPayroll] = useState(() => new Map());
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const selectAllHeaderRef = useRef(null);

  const subscription = getSubscriptionStatus(company);
  const subscriptionAllowed = subscription.allowed;
  const monthlyOnlyPayroll = company?.shifts_compact_ui === true;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (monthlyOnlyPayroll && payrollMode !== 'monthly') {
      setPayrollMode('monthly');
      setPage(1);
    }
  }, [monthlyOnlyPayroll, payrollMode]);

  useEffect(() => {
    let isMounted = true;
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted && json?.data) setCompany(json.data);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    authFetch('/api/employees?limit=200', {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load employees'))))
      .then((json) => {
        if (isMounted) setEmployees(json.data?.data || []);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (payrollMode === 'monthly') {
      params.set('year', String(year));
      if (month) params.set('month', month);
    } else {
      params.set('week_start_date', String(weekStartDate));
    }
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (employeeId) params.set('employee_id', employeeId);

    const url = payrollMode === 'monthly' ? `/api/payroll?${params}` : `/api/payroll/weekly?${params}`;
    authFetch(url, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load payroll');
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        const d = json.data;
        setRecords(Array.isArray(d?.data) ? d.data : []);
        setTotal(Number(d?.total ?? 0));
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to load payroll');
          setRecords([]);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [payrollMode, year, month, weekStartDate, page, employeeId, reloadKey]);

  useEffect(() => {
    setSelectedPayroll(new Map());
  }, [payrollMode, year, month, weekStartDate, employeeId]);

  const allOnPageSelected =
    records.length > 0 && records.every((r) => selectedPayroll.has(r.id));
  const someOnPageSelected = records.some((r) => selectedPayroll.has(r.id));

  useEffect(() => {
    const el = selectAllHeaderRef.current;
    if (el) {
      el.indeterminate = someOnPageSelected && !allOnPageSelected;
    }
  }, [someOnPageSelected, allOnPageSelected, records]);

  async function fetchAllPayrollRecordsForExport() {
    const all = [];
    let pageNum = 1;
    const limit = 500;
    let totalCount = null;
    while (true) {
      const params = new URLSearchParams();
      if (payrollMode === 'monthly') {
        params.set('year', String(year));
        if (month) params.set('month', month);
      } else {
        params.set('week_start_date', String(weekStartDate));
      }
      params.set('page', String(pageNum));
      params.set('limit', String(limit));
      if (employeeId) params.set('employee_id', employeeId);

      const url = payrollMode === 'monthly' ? `/api/payroll?${params}` : `/api/payroll/weekly?${params}`;
      const res = await authFetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error('Failed to load payroll');
      const json = await res.json();
      const chunk = json.data?.data || [];
      if (totalCount == null) totalCount = Number(json.data?.total ?? 0);
      all.push(...chunk);
      if (chunk.length === 0 || chunk.length < limit || all.length >= totalCount) break;
      pageNum += 1;
    }
    return all;
  }

  function toggleSelectRow(row, checked) {
    setSelectedPayroll((prev) => {
      const next = new Map(prev);
      if (checked) next.set(row.id, row);
      else next.delete(row.id);
      return next;
    });
  }

  function toggleSelectAllOnPage(checked) {
    setSelectedPayroll((prev) => {
      const next = new Map(prev);
      if (checked) {
        records.forEach((r) => next.set(r.id, r));
      } else {
        records.forEach((r) => next.delete(r.id));
      }
      return next;
    });
  }

  function handleDownloadPayrollCsv(allRows) {
    const periodSlug =
      payrollMode === 'monthly'
        ? month
          ? `${year}-${String(month).padStart(2, '0')}`
          : `${year}-all-months`
        : weekStartDate;
    const csv = payrollRowsToCsv(allRows, payrollMode);
    triggerDownloadCsv(csv, `payroll-${payrollMode}-${periodSlug}.csv`);
    setToast({ type: 'success', message: 'Payroll CSV downloaded' });
  }

  async function handleExportAllCsv() {
    try {
      setExporting(true);
      setToast(null);
      const rows = await fetchAllPayrollRecordsForExport();
      if (rows.length === 0) {
        setToast({ type: 'error', message: 'No payroll records to export' });
        return;
      }
      await handleDownloadPayrollCsv(rows);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Export failed' });
    } finally {
      setExporting(false);
    }
  }

  function handleExportSelectedCsv() {
    const rows = Array.from(selectedPayroll.values());
    if (rows.length === 0) {
      setToast({ type: 'error', message: 'Select at least one row' });
      return;
    }
    setToast(null);
    handleDownloadPayrollCsv(rows);
  }

  function getPayrollExportPeriodLabel() {
    if (payrollMode === 'monthly') {
      if (month) {
        return `${new Date(2000, Number(month) - 1, 1).toLocaleString('default', {
          month: 'long',
        })} ${year}`;
      }
      return `Year ${year} (all months)`;
    }
    return `Week starting ${weekStartDate}`;
  }

  function payrollPdfFilename() {
    return payrollMode === 'monthly'
      ? month
        ? `payroll-${payrollMode}-${year}-${String(month).padStart(2, '0')}.pdf`
        : `payroll-${payrollMode}-${year}-all-months.pdf`
      : `payroll-${payrollMode}-${weekStartDate}.pdf`;
  }

  function savePayrollPdf(rows) {
    if (rows.length === 0) {
      setToast({ type: 'error', message: 'No payroll records to export' });
      return;
    }
    const doc = buildPayrollPdfDocument(
      rows,
      payrollMode,
      company,
      getPayrollExportPeriodLabel()
    );
    savePdf(doc, payrollPdfFilename());
    setToast({ type: 'success', message: 'Payroll PDF downloaded' });
  }

  async function handleExportAllPdf() {
    try {
      setExporting(true);
      setToast(null);
      const rows = await fetchAllPayrollRecordsForExport();
      savePayrollPdf(rows);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'PDF export failed' });
    } finally {
      setExporting(false);
    }
  }

  function handleExportSelectedPdf() {
    const rows = Array.from(selectedPayroll.values());
    if (rows.length === 0) {
      setToast({ type: 'error', message: 'Select at least one row' });
      return;
    }
    setToast(null);
    savePayrollPdf(rows);
  }

  async function fetchPayslipPayload(row) {
    if (payrollMode === 'weekly') {
      const params = new URLSearchParams({
        employee_id: String(row.employee_id),
        // Re-snap to Sunday (IST) to avoid any driver/UTC date-shift mismatches.
        week_start_date: snapToSundayYmd(toYmdDateString(row.week_start_date)),
      });
      const [breakdownRes, employeeRes] = await Promise.all([
        authFetch(`/api/payroll/weekly/breakdown?${params}`, { headers: { 'Content-Type': 'application/json' } }),
        authFetch(`/api/employees/${row.employee_id}`, { headers: { 'Content-Type': 'application/json' } }),
      ]);
      if (!breakdownRes.ok) throw new Error(`Failed payslip for ${row.employee_name}`);
      const breakdownJson = await breakdownRes.json();
      const employeeJson = employeeRes.ok ? await employeeRes.json() : null;
      const e = employeeJson?.data || null;
      return {
        breakdown: breakdownJson.data,
        attendanceMeta: {
          basic_salary: e?.basic_salary ?? null,
          department: e?.department || null,
          join_date: e?.join_date || null,
          shift_name: e?.shift_name || null,
        },
      };
    }

    const params = new URLSearchParams({
      employee_id: String(row.employee_id),
      year: String(row.year),
      month: String(row.month),
    });
    const [breakdownRes, employeeRes, shiftsRes] = await Promise.all([
      authFetch(`/api/payroll/breakdown?${params}`, { headers: { 'Content-Type': 'application/json' } }),
      authFetch(`/api/employees/${row.employee_id}`, { headers: { 'Content-Type': 'application/json' } }),
      authFetch('/api/shifts?limit=200', { headers: { 'Content-Type': 'application/json' } }),
    ]);
    if (!breakdownRes.ok) throw new Error(`Failed payslip for ${row.employee_name}`);

    const [breakdownJson, employeeJson, shiftsJson] = await Promise.all([
      breakdownRes.json(),
      employeeRes.ok ? employeeRes.json() : Promise.resolve(null),
      shiftsRes.ok ? shiftsRes.json() : Promise.resolve(null),
    ]);

    const e = employeeJson?.data || null;
    const shifts = Array.isArray(shiftsJson?.data) ? shiftsJson.data : [];
    const shift = shifts.find((s) => Number(s.id) === Number(e?.shift_id));

    return {
      breakdown: breakdownJson.data,
      attendanceMeta: {
        basic_salary: e?.basic_salary ?? null,
        department: e?.department || null,
        join_date: e?.join_date || null,
        shift_name: shift?.shift_name || null,
      },
    };
  }

  async function downloadPayslipsPdf(rows) {
    if (!rows.length) {
      setToast({ type: 'error', message: 'No payroll records selected' });
      return;
    }
    setExporting(true);
    setToast(null);
    try {
      const chunkSize = 5;
      const payloadByIndex = new Array(rows.length);
      for (let start = 0; start < rows.length; start += chunkSize) {
        const chunk = rows.slice(start, start + chunkSize);
        const chunkPayloads = await Promise.all(
          chunk.map((row) => fetchPayslipPayload(row))
        );
        chunkPayloads.forEach((payload, idx) => {
          payloadByIndex[start + idx] = payload;
        });
      }

      const doc = createPdf();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const payload = payloadByIndex[i];
        addPayslipPage(doc, {
          company,
          row,
          payrollMode,
          breakdown: payload.breakdown,
          attendanceMeta: payload.attendanceMeta,
          isFirstPage: i === 0,
        });
      }
      const periodSlug =
        payrollMode === 'monthly'
          ? month
            ? `${year}-${String(month).padStart(2, '0')}`
            : `${year}-all-months`
          : weekStartDate;
      savePdf(doc, `payslips-${payrollMode}-${periodSlug}.pdf`);
      setToast({ type: 'success', message: `Downloaded ${rows.length} payslip${rows.length > 1 ? 's' : ''}` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to download payslips' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadAllPayslipsPdf() {
    try {
      const rows = await fetchAllPayrollRecordsForExport();
      await downloadPayslipsPdf(rows);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to load payroll records' });
    }
  }

  async function handleDownloadSelectedPayslipsPdf() {
    const rows = Array.from(selectedPayroll.values());
    await downloadPayslipsPdf(rows);
  }

  function printPayrollRows(rows) {
    if (rows.length === 0) {
      setToast({ type: 'error', message: 'No payroll records to print' });
      return;
    }
    const html = buildPayrollPrintDocument(rows, payrollMode, company?.name);
    const w = window.open('', '_blank');
    if (!w) {
      setToast({ type: 'error', message: 'Allow pop-ups to print' });
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* ignore */
      }
    }, 250);
  }

  async function handlePrintAll() {
    try {
      setExporting(true);
      setToast(null);
      const rows = await fetchAllPayrollRecordsForExport();
      printPayrollRows(rows);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to load payroll' });
    } finally {
      setExporting(false);
    }
  }

  function handlePrintSelected() {
    setToast(null);
    printPayrollRows(Array.from(selectedPayroll.values()));
  }

  useEffect(() => {
    if (!detailModalOpen || !detailRow) return;
    let isMounted = true;
    setBreakdown(null);
    (async () => {
      try {
        if (payrollMode === 'weekly') {
          const params = new URLSearchParams({
            employee_id: String(detailRow.employee_id),
            // Re-snap to Sunday (IST) to avoid any driver/UTC date-shift mismatches.
            week_start_date: snapToSundayYmd(toYmdDateString(detailRow.week_start_date)),
          });

          const res = await authFetch(`/api/payroll/weekly/breakdown?${params}`, {
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) throw new Error('Failed to load details');
          const json = await res.json();
          if (!isMounted) return;
          setBreakdown(json.data);

          // Minimal attendance metadata for the payslip modal (no weekly attendance/holiday endpoint yet)
          const empRes = await authFetch(`/api/employees/${detailRow.employee_id}`, {
            headers: { 'Content-Type': 'application/json' },
          });
          const empJson = empRes.ok ? await empRes.json() : null;
          const e = empJson?.data || null;
          const att = json.data?.attendance || {};

          setAttendanceMeta({
            basic_salary: e?.basic_salary ?? null,
            designation: e?.designation || null,
            department: e?.department || null,
            join_date: e?.join_date || null,
            shift_name: e?.shift_name || null,
            phone: e?.phone || null,
            absentDates: [],
            halfDayDates: [],
            lateDetails: [],
            lateCount: att.lateDays ?? 0,
            halfDayCount: undefined,
          });
        } else {
          const params = new URLSearchParams({
            employee_id: String(detailRow.employee_id),
            year: String(detailRow.year),
            month: String(detailRow.month),
          });

          const res = await authFetch(`/api/payroll/breakdown?${params}`, {
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) throw new Error('Failed to load details');
          const json = await res.json();
          if (!isMounted) return;
          setBreakdown(json.data);

          try {
            const monthlyParams = new URLSearchParams({
              year: String(detailRow.year),
              month: String(detailRow.month),
              employee_id: String(detailRow.employee_id),
            });
            const monthlyRes = await authFetch(`/api/attendance/monthly?${monthlyParams}`, {
              headers: { 'Content-Type': 'application/json' },
            });
            const holidayParams = new URLSearchParams({
              year: String(detailRow.year),
              month: String(detailRow.month),
            });
            const [holidaysRes, weeklyOffRes, empRes, shiftsRes] = await Promise.all([
              authFetch(`/api/holidays?${holidayParams}`, {
                headers: { 'Content-Type': 'application/json' },
              }),
              authFetch('/api/holidays/weekly-off', {
                headers: { 'Content-Type': 'application/json' },
              }),
              authFetch(`/api/employees/${detailRow.employee_id}`, {
                headers: { 'Content-Type': 'application/json' },
              }),
              authFetch('/api/shifts?limit=200', {
                headers: { 'Content-Type': 'application/json' },
              }),
            ]);
            const empMeta = {
              basic_salary: null,
              designation: null,
              department: null,
              join_date: null,
              shift_name: null,
              phone: null,
              absentDates: [],
              halfDayDates: [],
              lateDetails: [],
              lateCount: 0,
              halfDayCount: 0,
            };
            if (monthlyRes.ok) {
              const monthlyJson = await monthlyRes.json();
              const data = monthlyJson.data;
              const employee = Array.isArray(data?.employees) ? data.employees[0] : null;
              const empJson = empRes.ok ? await empRes.json() : null;
              const employeeRecord = empJson?.data || null;
              const shiftsJson = shiftsRes.ok ? await shiftsRes.json() : null;
              const shifts = Array.isArray(shiftsJson?.data) ? shiftsJson.data : [];
              const employeeShift = shifts.find((s) => Number(s.id) === Number(employeeRecord?.shift_id));
              const shiftWeeklyOffDays = Array.isArray(employeeShift?.weekly_off_days)
                ? employeeShift.weekly_off_days
                : [];
              const companyWeeklyOffJson = weeklyOffRes.ok ? await weeklyOffRes.json() : null;
              const companyWeeklyOffDays = Array.isArray(companyWeeklyOffJson?.data?.days)
                ? companyWeeklyOffJson.data.days
                : [];
              const effectiveWeeklyOffDays =
                shiftWeeklyOffDays.length > 0 ? shiftWeeklyOffDays : companyWeeklyOffDays;
              const holidayJson = holidaysRes.ok ? await holidaysRes.json() : { data: [] };
              const explicitHolidaySet = new Set(
                (holidayJson.data || [])
                  .map((h) => (h?.holiday_date || h?.date || '').slice(0, 10))
                  .filter(Boolean)
              );
              const weeklyOffDateSet = buildWeeklyOffDateSet(
                detailRow.year,
                detailRow.month,
                effectiveWeeklyOffDays
              );
              const holidayDateSet = new Set([...explicitHolidaySet, ...weeklyOffDateSet]);
              const payrollAsOfYmd = (json?.data?.attendance?.workingDaysUpToDate || '').slice(
                0,
                10
              );
              if (employee) {
                const days = employee.days || [];
                const baseAbsentDates = days
                  .filter((d) => !d.present && !holidayDateSet.has(d.date))
                  .map((d) => d.date);
                const adjustedAbsentDates = [...baseAbsentDates];
                const treatAdjacentHolidayAsAbsent =
                  json?.data?.attendance?.treatHolidayAdjacentAbsenceAsWorking === true;
                if (treatAdjacentHolidayAsAbsent) {
                  const absentSet = new Set(baseAbsentDates);
                  for (const holidayDate of holidayDateSet) {
                    const prev = new Date(`${holidayDate}T00:00:00Z`);
                    prev.setUTCDate(prev.getUTCDate() - 1);
                    const next = new Date(`${holidayDate}T00:00:00Z`);
                    next.setUTCDate(next.getUTCDate() + 1);
                    const prevKey = prev.toISOString().slice(0, 10);
                    const nextKey = next.toISOString().slice(0, 10);
                    if (absentSet.has(prevKey) || absentSet.has(nextKey)) {
                      adjustedAbsentDates.push(holidayDate);
                    }
                  }
                }
                empMeta.absentDates = filterYmdOnOrBefore(
                  payrollAsOfYmd,
                  [...new Set(adjustedAbsentDates)]
                ).sort();
                empMeta.halfDayDates = filterYmdOnOrBefore(
                  payrollAsOfYmd,
                  days
                    .filter((d) => d.half_day && !holidayDateSet.has(d.date))
                    .map((d) => d.date)
                );
                empMeta.halfDayCount = empMeta.halfDayDates.length;
                empMeta.lateDetails = days
                  .filter((d) => d.late && !holidayDateSet.has(d.date))
                  .map((d) => ({
                    date: d.date,
                    minutes: d.minutes_late || null,
                  }))
                  .filter((row) => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(payrollAsOfYmd)) return true;
                    return String(row.date).slice(0, 10) <= payrollAsOfYmd;
                  });
                empMeta.lateCount = empMeta.lateDetails.length;
              }
              if (employeeRecord) {
                empMeta.basic_salary = employeeRecord.basic_salary ?? null;
                empMeta.designation = employeeRecord.designation || null;
                empMeta.department = employeeRecord.department || null;
                empMeta.join_date = employeeRecord.join_date || null;
                empMeta.phone = employeeRecord.phone_number || null;
              }
              if (employeeShift) {
                empMeta.shift_name = employeeShift.shift_name || null;
              }
            }
            if (isMounted) {
              setAttendanceMeta(empMeta);
            }
          } catch {
            if (isMounted) {
              setAttendanceMeta(null);
            }
          }
        }
      } catch {
        if (isMounted) setAttendanceMeta(null);
      } finally {
        // nothing to do: modal rendering is driven by `breakdown` existence
      }
    })();
    return () => { isMounted = false; };
  }, [detailModalOpen, detailRow, payrollMode]);

  const openDetailModal = (row) => {
    setDetailRow(row);
    setDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setDetailRow(null);
    setBreakdown(null);
    setAttendanceMeta(null);
  };

  const activeMonthlyCount = employees.filter(
    (e) => e.status === 'active' && (e.payroll_frequency || 'monthly') === 'monthly'
  ).length;
  const activeWeeklyCount = employees.filter(
    (e) => e.status === 'active' && (e.payroll_frequency || 'monthly') === 'weekly'
  ).length;
  const activeCount =
    monthlyOnlyPayroll || payrollMode === 'monthly' ? activeMonthlyCount : activeWeeklyCount;

  const handleGenerateAll = async (e) => {
    e.preventDefault();
    if (payrollMode === 'monthly') {
      const { year: y, month: m } = generateForm;
      if (!y || !m) {
        setToast({ type: 'error', message: 'Select year and month' });
        return;
      }

      const confirmed = window.confirm(
        `Generate payroll for all ${activeCount} active employees for ${new Date(2000, Number(m) - 1, 1).toLocaleString('default', { month: 'long' })} ${y}? This will create or update records from current attendance.`
      );
      if (!confirmed) return;

      try {
        setGenerating(true);
        setToast(null);
        const res = await authFetch('/api/payroll/generate-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: Number(y),
            month: Number(m),
            include_overtime: generateForm.includeOvertime !== false,
            treat_holiday_adjacent_absence_as_working:
              generateForm.treatHolidayAdjacentAbsenceAsWorking === true,
            encash_unused_paid_leave: generateForm.encashUnusedPaidLeave === true,
            no_leave_incentive: Math.max(
              0,
              Number(generateForm.noLeaveIncentive) || 0
            ),
            apply_advance_repayments: generateForm.applyAdvanceRepayments === true,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg =
            errData.code === 'SUBSCRIPTION_EXPIRED'
              ? errData.message
              : errData.message || 'Failed to generate payroll';
          throw new Error(msg);
        }
        const json = await res.json();
        const data = json.data || {};
        const generated = data.generated ?? 0;
        const failed = data.failed ?? 0;
        setModalOpen(false);
        const errors = Array.isArray(data.errors) ? data.errors : [];
        setGenerationFailures(errors);
        const successMsg =
          failed > 0
            ? `Payroll generated for ${generated} employees. ${failed} failed.`
            : `Payroll generated for ${generated} employee${
                generated !== 1 ? 's' : ''
              }.`;
        setToast({ type: 'success', message: successMsg });
        setPage(1);
        setYear(Number(y));
        setMonth(m);
        setEmployeeId('');
        setReloadKey((k) => k + 1);
      } catch (err) {
        setToast({
          type: 'error',
          message: err.message || 'Failed to generate payroll',
        });
      } finally {
        setGenerating(false);
      }
      return;
    }

    // weekly
    const confirmed = window.confirm(
      `Generate weekly payroll for all ${activeCount} active weekly employees for week starting ${weekStartDate}? This will create or update records from current attendance.`
    );
    if (!confirmed) return;

    try {
      setGenerating(true);
      setToast(null);
      const res = await authFetch('/api/payroll/generate-all-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: weekStartDate,
          include_overtime: weeklyGenerateForm.includeOvertime !== false,
          treat_holiday_adjacent_absence_as_working:
            weeklyGenerateForm.treatHolidayAdjacentAbsenceAsWorking === true,
          apply_advance_repayments: weeklyGenerateForm.applyAdvanceRepayments === true,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg =
          errData.code === 'SUBSCRIPTION_EXPIRED'
            ? errData.message
            : errData.message || 'Failed to generate weekly payroll';
        throw new Error(msg);
      }
      const json = await res.json();
      const data = json.data || {};
      const generated = data.generated ?? 0;
      const failed = data.failed ?? 0;
      setModalOpen(false);
      const errors = Array.isArray(data.errors) ? data.errors : [];
      setGenerationFailures(errors);
      const successMsg =
        failed > 0
          ? `Weekly payroll generated for ${generated} employees. ${failed} failed.`
          : `Weekly payroll generated for ${generated} employee${
              generated !== 1 ? 's' : ''
            }.`;
      setToast({ type: 'success', message: successMsg });
      setPage(1);
      setEmployeeId('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to generate weekly payroll',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-20 z-30" style={{ right: '20%' }}>
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-soft ${
              toast.type === 'error'
                ? 'border-rose-100 bg-rose-50 text-rose-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            }`}
          >
            <span className="mt-0.5 text-sm">{toast.type === 'error' ? '⚠️' : '✅'}</span>
            <div>
              <p className="font-medium">{toast.type === 'error' ? 'Error' : 'Success'}</p>
              <p className="mt-0.5">{toast.message}</p>
              {toast.type !== 'error' && generationFailures.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFailureModalOpen(true)}
                  className="mt-1 text-[11px] font-medium text-amber-700 underline hover:text-amber-800"
                >
                  View all failures
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setToast(null);
              }}
              className="ml-2 text-[11px] text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Payroll</h1>
          <p className="text-xs text-slate-500">
            View and generate salary runs based on attendance and overtime.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={!subscriptionAllowed}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Generate payroll
        </button>
      </header>

      {!subscriptionAllowed && company && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Payroll generation is unavailable because your subscription has expired. Please renew to generate payroll.
        </div>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPayrollMode('monthly');
                setPage(1);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                payrollMode === 'monthly'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Monthly
            </button>
            {!monthlyOnlyPayroll && (
              <button
                type="button"
                onClick={() => {
                  setPayrollMode('weekly');
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  payrollMode === 'weekly'
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Weekly
              </button>
            )}
          </div>

          {payrollMode === 'monthly' ? (
            <>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-slate-600">Year</label>
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                >
                  {[currentYear(), currentYear() - 1, currentYear() - 2].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-slate-600">Month</label>
                <select
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value || 'all'} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-600">Week start</label>
              <input
                type="date"
                value={weekStartDate}
                onChange={(e) => {
                  setWeekStartDate(snapToSundayYmd(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-600">Employee</label>
            <select
              value={employeeId}
              onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 min-w-[140px]"
            >
              <option value="">All employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code})</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        {!loading && total > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
            <span className="text-[11px] font-medium text-slate-600">Export</span>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExportAllCsv()}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              {exporting ? 'Loading...' : 'Download CSV (all)'}
            </button>
            <button
              type="button"
              disabled={exporting || selectedPayroll.size === 0}
              onClick={handleExportSelectedCsv}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              Download CSV (selected)
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExportAllPdf()}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              {exporting ? 'Loading...' : 'Download PDF (all)'}
            </button>
            <button
              type="button"
              disabled={exporting || selectedPayroll.size === 0}
              onClick={handleExportSelectedPdf}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              Download PDF (selected)
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleDownloadAllPayslipsPdf()}
              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {exporting ? 'Loading...' : 'Download Payslips PDF (all)'}
            </button>
            <button
              type="button"
              disabled={exporting || selectedPayroll.size === 0}
              onClick={() => void handleDownloadSelectedPayslipsPdf()}
              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              Download Payslips PDF (selected)
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handlePrintAll()}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              {exporting ? 'Loading...' : 'Print (all)'}
            </button>
            <button
              type="button"
              disabled={exporting || selectedPayroll.size === 0}
              onClick={handlePrintSelected}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              Print (selected)
            </button>
            {selectedPayroll.size > 0 && (
              <span className="text-[11px] text-slate-500">
                {selectedPayroll.size} selected
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-slate-50 animate-pulse"
              />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-xs text-slate-500">
            No payroll records for this period. Use &quot;Generate payroll&quot; to create records from attendance.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="w-10 pb-2 pr-2 font-medium">
                      <input
                        ref={selectAllHeaderRef}
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th className="pb-2 pr-3 font-medium">Employee</th>
                    <th className="pb-2 pr-3 font-medium">Period</th>
                    <th className="pb-2 pr-3 font-medium text-right">Present</th>
                    <th className="pb-2 pr-3 font-medium text-right">Overtime (hrs)</th>
                    <th className="pb-2 pr-3 font-medium text-right">Absent days</th>
                    <th className="pb-2 pr-3 font-medium text-right">Deductions</th>
                    <th className="pb-2 pr-3 font-medium text-right">Permission used</th>
                    <th className="pb-2 pr-3 font-medium text-right">Permission offset</th>
                    <th className="pb-2 pr-3 font-medium text-right">Advance</th>
                    <th className="pb-2 pr-3 font-medium text-right">Incentive</th>
                    <th className="pb-2 pr-3 font-medium text-right">Net salary</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openDetailModal(row)}
                      className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                    >
                      <td
                        className="py-3 pr-2 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPayroll.has(row.id)}
                          onChange={(e) => toggleSelectRow(row, e.target.checked)}
                          className="rounded border-slate-300 text-blue-600"
                          aria-label={`Select ${row.employee_name || 'row'}`}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <span className="font-medium text-slate-900">{row.employee_name}</span>
                        <span className="ml-1 text-slate-500">({row.employee_code})</span>
                      </td>
                      <td className="py-3 pr-3 text-slate-700">
                        {payrollMode === 'monthly'
                          ? new Date(row.year, row.month - 1, 1).toLocaleString('default', {
                              month: 'short',
                              year: 'numeric',
                            })
                          : formatWeekLabel(row.week_start_date, row.week_end_date)}
                      </td>
                      <td className="py-3 pr-3 text-right text-slate-700">
                        {row.present_days} / {row.total_days}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <span className={Number(row.overtime_hours) > 0 ? 'text-emerald-600 font-medium' : 'text-slate-600'}>
                          {Number(row.overtime_hours) > 0 ? `+${row.overtime_hours}` : row.overtime_hours}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right text-slate-800">
                        {(() => {
                          const absentDaysRaw = row.absence_days;
                          const fallback = Math.max(
                            0,
                            Number(row.total_days || 0) - Number(row.present_days || 0)
                          );
                          const value = absentDaysRaw != null ? Number(absentDaysRaw) : fallback;
                          if (!Number.isFinite(value)) return '0';
                          return Number.isInteger(value) ? String(value) : value.toFixed(2);
                        })()}
                      </td>
                      <td className="py-3 pr-3 text-right text-amber-700 font-medium">
                        −{formatMoney(row.deductions)}
                      </td>
                      <td className="py-3 pr-3 text-right text-slate-700">
                        {formatPermissionUsedHours(row.permission_minutes_used)}h
                      </td>
                      <td className="py-3 pr-3 text-right text-emerald-700 font-medium">
                        −{formatMoney(row.permission_offset_amount)}
                      </td>
                      <td className="py-3 pr-3 text-right text-amber-700 font-medium">
                        −{formatMoney(row.salary_advance)}
                      </td>
                      <td className="py-3 pr-3 text-right text-emerald-600 font-medium">
                        +{formatMoney(row.no_leave_incentive)}
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-slate-900">
                        {formatMoney(row.net_salary)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <p>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-slate-200 px-2 py-1 font-medium disabled:opacity-50 hover:border-primary-200 hover:text-primary-700"
                  >
                    Prev
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded border border-slate-200 px-2 py-1 font-medium disabled:opacity-50 hover:border-primary-200 hover:text-primary-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-soft">
            <h2 className="text-sm font-semibold text-slate-900">
              {payrollMode === 'monthly' ? 'Generate payroll for all' : 'Generate weekly payroll for all'}
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {activeCount > 0
                ? payrollMode === 'monthly'
                  ? `Create or update payroll for all ${activeCount} active employees for the selected month. Uses current attendance data.`
                  : `Create or update weekly payroll for all ${activeCount} active weekly employees starting from ${weekStartDate}. Uses current attendance data.`
                : 'No eligible employees. Add active employees to generate payroll.'}
            </p>
            <form onSubmit={handleGenerateAll} className="mt-4 space-y-3">
              {payrollMode === 'monthly' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-700">Year</label>
                    <select
                      value={generateForm.year}
                      onChange={(e) =>
                        setGenerateForm((f) => ({ ...f, year: e.target.value }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                    >
                      {[currentYear(), currentYear() - 1].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-700">Month</label>
                    <select
                      value={generateForm.month}
                      onChange={(e) =>
                        setGenerateForm((f) => ({ ...f, month: e.target.value }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                    >
                      {MONTHS.filter((m) => m.value).map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-700">Week start (Sunday)</label>
                    <input
                      type="date"
                      value={weekStartDate}
                      onChange={(e) => setWeekStartDate(snapToSundayYmd(e.target.value))}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      payrollMode === 'monthly'
                        ? generateForm.includeOvertime
                        : weeklyGenerateForm.includeOvertime
                    }
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (payrollMode === 'monthly') {
                        setGenerateForm((f) => ({ ...f, includeOvertime: checked }));
                      } else {
                        setWeeklyGenerateForm((f) => ({ ...f, includeOvertime: checked }));
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-700">Include overtime in pay</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      payrollMode === 'monthly'
                        ? generateForm.treatHolidayAdjacentAbsenceAsWorking
                        : weeklyGenerateForm.treatHolidayAdjacentAbsenceAsWorking
                    }
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (payrollMode === 'monthly') {
                        setGenerateForm((f) => ({
                          ...f,
                          treatHolidayAdjacentAbsenceAsWorking: checked,
                        }));
                      } else {
                        setWeeklyGenerateForm((f) => ({
                          ...f,
                          treatHolidayAdjacentAbsenceAsWorking: checked,
                        }));
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-700">Treat holiday as working day when adjacent day is absent</span>
                </label>
                <p className="text-[10px] text-slate-500">
                  If enabled, e.g. Sunday is holiday and staff is absent Monday, both Sunday and Monday count as absent (2 days).
                </p>
              </div>
              {payrollMode === 'monthly' ? (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateForm.applyAdvanceRepayments === true}
                      onChange={(e) =>
                        setGenerateForm((f) => ({
                          ...f,
                          applyAdvanceRepayments: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-700">
                      Deduct advances now
                    </span>
                  </label>
                  <p className="text-[10px] text-slate-500">
                    If unchecked, advance repayments remain pending and can be deducted later.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generateForm.encashUnusedPaidLeave === true}
                      onChange={(e) =>
                        setGenerateForm((f) => ({
                          ...f,
                          encashUnusedPaidLeave: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-700">
                      Encash unused paid leave (full month only)
                    </span>
                  </label>
                  <p className="text-[10px] text-slate-500">
                    Adds unused shift paid leave value to gross salary. Applies only when month is complete.
                  </p>
                  <label className="text-[11px] font-medium text-slate-700">
                    Incentive for no leave (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={generateForm.noLeaveIncentive}
                    onChange={(e) =>
                      setGenerateForm((f) => ({ ...f, noLeaveIncentive: e.target.value }))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Added to staff present all working days. Applies only when the month is complete (run at month-end).
                  </p>
                </div>
              ) : (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={weeklyGenerateForm.applyAdvanceRepayments === true}
                      onChange={(e) =>
                        setWeeklyGenerateForm((f) => ({
                          ...f,
                          applyAdvanceRepayments: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-700">
                      Deduct advances now
                    </span>
                  </label>
                  <p className="text-[10px] text-slate-500">
                    If unchecked, advance repayments remain pending and can be deducted in a later week.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating || activeCount === 0}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {generating ? 'Generating...' : payrollMode === 'monthly' ? 'Generate for all' : 'Generate weekly for all'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailModalOpen && detailRow && (
        <PayslipModal
          open={detailModalOpen}
          onClose={closeDetailModal}
          company={company}
          payrollRow={detailRow}
          breakdown={breakdown}
          attendanceDetails={attendanceMeta}
        />
      )}

      {failureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3">
          <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-soft">
            <h2 className="text-sm font-semibold text-slate-900">Payroll Generation Failures</h2>
            <p className="mt-1 text-xs text-slate-600">
              {generationFailures.length} employee{generationFailures.length !== 1 ? 's' : ''} failed in the last generation.
            </p>
            <div className="mt-3 max-h-[360px] overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2">Employee ID</th>
                    <th className="px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {generationFailures.map((f, idx) => (
                    <tr key={`${f.employee_id}-${idx}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">#{f.employee_id}</td>
                      <td className="px-3 py-2 text-slate-700">{f.message || 'Generation failed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setFailureModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
