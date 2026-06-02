import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '../utils/api';
import { generateDetailedAttendancePdf } from '../components/reports/DetailedReportPDF';
import {
  buildDayWiseWhatsAppMessage,
  buildDayWiseReportCsv,
  downloadDayWiseReportCsv,
  generateDayWiseReportPdf,
} from '../components/reports/DayWiseReportPDF';
import { createPdf, addAutoTable, addReportHeader, savePdf } from '../utils/pdfGenerator';
import { formatIstTime, IST } from '../utils/istDisplay';
import { normalizeWhatsAppNumber, openWhatsAppChat } from '../utils/whatsapp';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
}));
const PAYROLL_MODAL_PAGE_SIZE = 25;

function currentYear() {
  return new Date().getFullYear();
}

function todayIstYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: IST });
}

function istYmdFromDate(d) {
  return d.toLocaleDateString('en-CA', { timeZone: IST });
}

function istDateFromYmd(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // Use midday to avoid DST/offset edge cases when converting back and forth.
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+05:30`);
}

function yesterdayIstYmdFrom(ymd) {
  const dt = istDateFromYmd(ymd);
  if (!dt) return todayIstYmd();
  return istYmdFromDate(new Date(dt.getTime() - 24 * 60 * 60 * 1000));
}

function formatDateLongIstYmd(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatPunchTimings(punches) {
  const list = Array.isArray(punches) ? punches : [];
  if (list.length === 0) return '—';
  return list
    .map((p) => {
      const timeLabel = p?.punch_time ? formatIstTime(p.punch_time) : '';
      const typeLabel = String(p?.punch_type || '').toLowerCase() === 'out' ? 'OUT' : 'IN';
      return timeLabel ? `${timeLabel} (${typeLabel})` : '';
    })
    .filter(Boolean)
    .join(', ');
}

function getDayStatusLabel(row) {
  if (!row.present) return 'Absent';
  if (row.full_day) return row.late ? 'Full day (late)' : 'Full day';
  if (row.half_day) return row.late ? 'Half day (late)' : 'Half day';
  if (row.left_during_lunch) return 'Left at lunch';
  return row.late ? 'Present (late)' : 'Present';
}

function getDayTotalHours(row) {
  if (row.total_hours_inside != null) return `${row.total_hours_inside} h`;
  if (row.total_hours_from_shift_start != null) return `${row.total_hours_from_shift_start} h`;
  return '—';
}

function getFirstInTime(row) {
  const firstIn = (row.punches || []).find(
    (p) => String(p.punch_type || '').toLowerCase() === 'in'
  );
  return firstIn?.punch_time ? formatIstTime(firstIn.punch_time) : '—';
}

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

/**
 * Fetch CSV from URL and trigger browser download.
 */
async function downloadCsv(url, defaultFilename) {
  const res = await authFetch(url, {
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Download failed (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition');
  let filename = defaultFilename;
  if (disposition) {
    const match = /filename="?([^";\r\n]+)"?/.exec(disposition);
    if (match) filename = match[1].trim();
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsvText(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { header, rows };
}

export default function ReportsPage() {
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [detailedDepartment, setDetailedDepartment] = useState('');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [detailedFrom, setDetailedFrom] = useState('');
  const [detailedTo, setDetailedTo] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [payrollEmployees, setPayrollEmployees] = useState([]);
  const [currentMonthPayrollRows, setCurrentMonthPayrollRows] = useState([]);
  const [payrollModalRows, setPayrollModalRows] = useState([]);
  const [payrollModalLoading, setPayrollModalLoading] = useState(false);
  const [payrollModalPage, setPayrollModalPage] = useState(1);
  const [payrollModalTotal, setPayrollModalTotal] = useState(0);
  const [detailsModal, setDetailsModal] = useState(null); // 'employees' | 'payroll' | null
  const [reportFormats, setReportFormats] = useState({
    attendance: 'csv',
    payroll: 'csv',
    overtime: 'csv',
  });
  const [dayReportDate, setDayReportDate] = useState(todayIstYmd);
  const [dayReportDepartment, setDayReportDepartment] = useState('');
  const [dayReportData, setDayReportData] = useState([]);
  const [dayReportLoading, setDayReportLoading] = useState(false);
  const [dayReportFormat, setDayReportFormat] = useState('csv');

  const params = new URLSearchParams({ year, month });
  const base = '/api/reports';
  const now = new Date();
  const currentMonthNumber = now.getMonth() + 1;
  const currentMonthYear = now.getFullYear();
  const currentDay = now.getDate();

  useEffect(() => {
    let isMounted = true;
    async function loadFilterOptions() {
      try {
        const [employeesRes, departmentsRes] = await Promise.all([
          authFetch('/api/employees?limit=500', {
            headers: { 'Content-Type': 'application/json' },
          }),
          authFetch('/api/employees/departments', {
            headers: { 'Content-Type': 'application/json' },
          }),
        ]);

        const employeesJson = employeesRes.ok ? await employeesRes.json() : { data: { data: [] } };
        const departmentsJson = departmentsRes.ok ? await departmentsRes.json() : { data: [] };

        if (!isMounted) return;
        setEmployees(employeesJson.data?.data || []);
        setDepartments(departmentsJson.data || []);
      } catch {
        if (!isMounted) return;
        setEmployees([]);
        setDepartments([]);
      }
    }

    loadFilterOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredEmployees = useMemo(() => {
    if (!detailedDepartment) return employees;
    return employees.filter((emp) => (emp.department || '') === detailedDepartment);
  }, [employees, detailedDepartment]);

  useEffect(() => {
    const allowedIds = new Set(filteredEmployees.map((emp) => String(emp.id)));
    setSelectedEmployeeIds((prev) => prev.filter((id) => allowedIds.has(String(id))));
  }, [filteredEmployees]);

  useEffect(() => {
    let isMounted = true;
    async function loadCurrentMonthSummary() {
      try {
        setSummaryLoading(true);
        const summaryParams = new URLSearchParams({
          year: String(currentMonthYear),
          month: String(currentMonthNumber),
          page: '1',
          limit: '500',
        });
        const [employeesRes, payrollRes] = await Promise.all([
          authFetch('/api/employees?limit=500', {
            headers: { 'Content-Type': 'application/json' },
          }),
          authFetch(`/api/payroll?${summaryParams.toString()}`, {
            headers: { 'Content-Type': 'application/json' },
          }),
        ]);

        const employeesJson = employeesRes.ok ? await employeesRes.json() : { data: { data: [] } };
        const payrollJson = payrollRes.ok ? await payrollRes.json() : { data: { data: [] } };

        if (!isMounted) return;
        const activeEmployees = (employeesJson.data?.data || []).filter((emp) => emp.status === 'active');
        setPayrollEmployees(activeEmployees);
        setCurrentMonthPayrollRows(payrollJson.data?.data || []);
      } finally {
        if (isMounted) setSummaryLoading(false);
      }
    }

    loadCurrentMonthSummary();
    return () => {
      isMounted = false;
    };
  }, [currentMonthYear, currentMonthNumber]);

  const currentMonthPayrollTotal = useMemo(
    () => (currentMonthPayrollRows || []).reduce((sum, row) => sum + (Number(row.net_salary) || 0), 0),
    [currentMonthPayrollRows]
  );
  const payrollModalTotalPages = Math.max(1, Math.ceil(payrollModalTotal / PAYROLL_MODAL_PAGE_SIZE));

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    async function loadDayReport() {
      if (!dayReportDate) return;
      try {
        setDayReportLoading(true);
        const params = new URLSearchParams({ date: dayReportDate });
        if (dayReportDepartment) params.set('department', dayReportDepartment);
        const res = await authFetch(`/api/attendance/daily?${params.toString()}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Failed to load day report (${res.status})`);
        }
        const json = await res.json();
        if (!isMounted) return;
        setDayReportData(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        if (!isMounted || err?.name === 'AbortError') return;
        setDayReportData([]);
        setToast({ type: 'error', message: err.message || 'Failed to load day report' });
      } finally {
        if (isMounted) setDayReportLoading(false);
      }
    }
    loadDayReport();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [dayReportDate, dayReportDepartment]);

  const dayReportSummary = useMemo(() => {
    const rows = dayReportData || [];
    const present = rows.filter((r) => r.present).length;
    const late = rows.filter((r) => r.late).length;
    const fullDay = rows.filter((r) => r.full_day).length;
    const overtimeHours = rows.reduce((sum, r) => sum + (Number(r.overtime_hours) || 0), 0);
    return {
      total: rows.length,
      present,
      absent: rows.length - present,
      late,
      fullDay,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
    };
  }, [dayReportData]);

  const dayReportAbsentees = useMemo(
    () => (dayReportData || []).filter((r) => !r.present),
    [dayReportData]
  );

  const dayReportLateComers = useMemo(
    () => (dayReportData || []).filter((r) => r.late),
    [dayReportData]
  );

  const getDayReportExportPayload = () => {
    if (!dayReportData.length) {
      throw new Error('No data available for selected day. Wait for the report to load.');
    }
    return {
      dateLabel: formatDateLongIstYmd(dayReportDate),
      departmentLabel: dayReportDepartment || null,
      summary: dayReportSummary,
      absentees: dayReportAbsentees,
      lateComers: dayReportLateComers,
      allEmployees: dayReportData,
    };
  };

  const handleDayReportDownload = async () => {
    const filename = `daily-attendance-${dayReportDate}.csv`;
    try {
      setLoading('daily');
      setToast(null);
      const payload = getDayReportExportPayload();
      const csv = buildDayWiseReportCsv(payload);
      downloadDayWiseReportCsv(csv, filename);
      setToast({ type: 'success', message: 'Day report downloaded' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Download failed' });
    } finally {
      setLoading(null);
    }
  };

  const handleDayReportPdf = async () => {
    try {
      setLoading('daily-pdf');
      setToast(null);
      const payload = getDayReportExportPayload();
      const companyRes = await authFetch('/api/company', {
        headers: { 'Content-Type': 'application/json' },
      });
      const companyJson = companyRes.ok ? await companyRes.json() : { data: {} };
      await generateDayWiseReportPdf({
        company: companyJson.data || {},
        filename: `daily-attendance-${dayReportDate}.pdf`,
        ...payload,
      });
      setToast({ type: 'success', message: 'Day report PDF downloaded' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'PDF generation failed' });
    } finally {
      setLoading(null);
    }
  };

  const handleSendDayReportWhatsApp = async () => {
    try {
      setLoading('daily-whatsapp');
      setToast(null);
      const payload = getDayReportExportPayload();
      const companyRes = await authFetch('/api/company', {
        headers: { 'Content-Type': 'application/json' },
      });
      const companyJson = companyRes.ok ? await companyRes.json() : { data: {} };
      const company = companyJson.data || {};

      const phone = normalizeWhatsAppNumber(company.phone);
      if (!phone) {
        throw new Error('Company phone is missing. Please update it in Company Settings.');
      }

      const shareText = buildDayWiseWhatsAppMessage({
        companyName: company.name,
        dateLabel: payload.dateLabel,
        departmentLabel: payload.departmentLabel,
        summary: payload.summary,
        absentees: payload.absentees,
      });
      const opened = openWhatsAppChat(phone, shareText);
      if (!opened) {
        throw new Error('Unable to open WhatsApp for the company number.');
      }
      setToast({ type: 'success', message: 'WhatsApp opened with day report details.' });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setToast({ type: 'error', message: err.message || 'Failed to open WhatsApp' });
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadYesterdayDayReportPdf = async () => {
    const yesterdayYmd = yesterdayIstYmdFrom(dayReportDate);
    try {
      setLoading('yesterday-pdf');
      setToast(null);

      const params = new URLSearchParams({ date: yesterdayYmd });
      if (dayReportDepartment) params.set('department', dayReportDepartment);

      const res = await authFetch(`/api/attendance/daily?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to load yesterday report (${res.status})`);
      }

      const json = await res.json();
      const rows = Array.isArray(json.data) ? json.data : [];

      const present = rows.filter((r) => r.present).length;
      const late = rows.filter((r) => r.late).length;
      const fullDay = rows.filter((r) => r.full_day).length;
      const overtimeHours = rows.reduce((sum, r) => sum + (Number(r.overtime_hours) || 0), 0);

      const summary = {
        total: rows.length,
        present,
        absent: rows.length - present,
        late,
        fullDay,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
      };

      const absentees = rows.filter((r) => !r.present);
      const lateComers = rows.filter((r) => r.late);

      const companyRes = await authFetch('/api/company', {
        headers: { 'Content-Type': 'application/json' },
      });
      const companyJson = companyRes.ok ? await companyRes.json() : { data: {} };

      await generateDayWiseReportPdf({
        company: companyJson.data || {},
        filename: `daily-attendance-${yesterdayYmd}.pdf`,
        dateLabel: formatDateLongIstYmd(yesterdayYmd),
        departmentLabel: dayReportDepartment || null,
        summary,
        absentees,
        lateComers,
        allEmployees: rows,
      });

      setToast({ type: 'success', message: 'Yesterday report PDF downloaded' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'PDF generation failed' });
    } finally {
      setLoading(null);
    }
  };

  useEffect(() => {
    if (detailsModal !== 'payroll') return;
    let isMounted = true;
    async function loadPayrollModalPage() {
      try {
        setPayrollModalLoading(true);
        const modalParams = new URLSearchParams({
          year: String(currentMonthYear),
          month: String(currentMonthNumber),
          page: String(payrollModalPage),
          limit: String(PAYROLL_MODAL_PAGE_SIZE),
        });
        const res = await authFetch(`/api/payroll?${modalParams.toString()}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const json = res.ok ? await res.json() : { data: { data: [], total: 0 } };
        if (!isMounted) return;
        setPayrollModalRows(json.data?.data || []);
        setPayrollModalTotal(Number(json.data?.total || 0));
      } catch {
        if (!isMounted) return;
        setPayrollModalRows([]);
        setPayrollModalTotal(0);
      } finally {
        if (isMounted) setPayrollModalLoading(false);
      }
    }

    loadPayrollModalPage();
    return () => {
      isMounted = false;
    };
  }, [detailsModal, payrollModalPage, currentMonthYear, currentMonthNumber]);

  const handleDownload = (type) => async () => {
    const urls = {
      attendance: `${base}/attendance.csv?${params}`,
      payroll: `${base}/payroll.csv?${params}`,
      overtime: `${base}/overtime.csv?${params}`,
    };
    const names = {
      attendance: `attendance-${year}-${String(month).padStart(2, '0')}.csv`,
      payroll: `payroll-${year}-${String(month).padStart(2, '0')}.csv`,
      overtime: `overtime-${year}-${String(month).padStart(2, '0')}.csv`,
    };
    try {
      setLoading(type);
      setToast(null);
      await downloadCsv(urls[type], names[type]);
      setToast({ type: 'success', message: `${type} report downloaded` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Download failed' });
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadPdf = (type) => async () => {
    try {
      setLoading(`${type}-pdf`);
      setToast(null);
      const [companyRes, csvRes] = await Promise.all([
        authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } }),
        authFetch(`${base}/${type}.csv?${params}`, { headers: { Accept: 'text/csv' } }),
      ]);
      if (!csvRes.ok) {
        const err = await csvRes.json().catch(() => ({}));
        throw new Error(err.message || `Download failed (${csvRes.status})`);
      }
      const companyJson = companyRes.ok ? await companyRes.json() : { data: {} };
      const company = companyJson.data || {};
      const csvText = await csvRes.text();
      const { header, rows } = parseCsvText(csvText);
      if (header.length === 0) {
        throw new Error('No data available for selected period');
      }

      const monthLabel = MONTHS.find((m) => m.value === month)?.label || '';
      const doc = createPdf({ orientation: 'landscape' });
      const startY = addReportHeader(doc, {
        companyName: company.name,
        companyPhone: company.phone,
        companyAddress: company.address,
        title: `${type.charAt(0).toUpperCase()}${type.slice(1)} Report`,
        periodLabel: `${monthLabel} ${year}`,
        generatedAt: new Date().toLocaleString(),
        totalEmployees: rows.length,
      });
      addAutoTable(doc, [header], rows, {
        startY,
        margin: { left: 24, right: 24 },
        styles: { fontSize: 7 },
      });
      if (type === 'payroll') {
        const netIdx = header.findIndex((h) => String(h).trim().toLowerCase() === 'net salary');
        const payrollTotal = rows.reduce((sum, row) => {
          if (netIdx < 0) return sum;
          const raw = String(row[netIdx] ?? '').replace(/,/g, '');
          const val = Number(raw);
          return sum + (Number.isFinite(val) ? val : 0);
        }, 0);
        const pageWidth = doc.internal.pageSize.getWidth();
        const y = doc.internal.pageSize.getHeight() - 44;
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        const label = `INR: ${formatMoney(payrollTotal)}`;
        doc.text(label, pageWidth * 0.75, y, { align: 'center' });
      }
      savePdf(doc, `${type}-${year}-${String(month).padStart(2, '0')}.pdf`);
      setToast({ type: 'success', message: `${type} PDF downloaded` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'PDF generation failed' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed inset-x-3 top-20 z-30 sm:inset-x-auto sm:right-6">
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
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-[11px] text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <header>
        <h1 className="text-lg font-semibold text-slate-900">Reports</h1>
        <p className="text-xs text-slate-500">
          View a full day&apos;s attendance or export monthly attendance, payroll, and overtime.
        </p>
      </header>

      <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Current month overview</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Live summary for {MONTHS.find((m) => m.value === currentMonthNumber)?.label} {currentMonthYear} up to day {currentDay}.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setDetailsModal('employees')}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Employees under payroll
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {summaryLoading ? '...' : payrollEmployees.length}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Click to view employee details</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setPayrollModalPage(1);
              setDetailsModal('payroll');
            }}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-primary-200 hover:bg-primary-50"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Payroll total (month to date)
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {summaryLoading ? '...' : `₹${formatMoney(currentMonthPayrollTotal)}`}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Click to view payroll breakdown</p>
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Day-wise report</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Select a date to view the full attendance report for that day.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-600">Date</label>
              <input
                type="date"
                value={dayReportDate}
                max={todayIstYmd()}
                onChange={(e) => setDayReportDate(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
              />
              <button
                type="button"
                disabled={dayReportLoading || loading != null}
                onClick={() => {
                  void handleDownloadYesterdayDayReportPdf();
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 disabled:opacity-50"
              >
                {loading === 'yesterday-pdf' ? 'Downloading...' : 'Yesterday PDF'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-600">Department</label>
              <select
                value={dayReportDepartment}
                onChange={(e) => setDayReportDepartment(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
              >
                <option value="">All departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {dayReportLoading ? (
          <div className="mt-4 space-y-4">
            <div className="h-24 rounded-lg bg-slate-50 animate-pulse" />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-40 rounded-lg bg-slate-50 animate-pulse" />
              <div className="h-40 rounded-lg bg-slate-50 animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[11px] font-medium text-slate-700">
              {formatDateLongIstYmd(dayReportDate)}
              {dayReportDepartment ? ` · ${dayReportDepartment}` : ''}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  key: 'total',
                  label: 'Total employees',
                  value: dayReportSummary.total,
                  card: 'border-slate-200 bg-white',
                  labelCls: 'text-slate-500',
                  valueCls: 'text-slate-900',
                },
                {
                  key: 'present',
                  label: 'Present',
                  value: dayReportSummary.present,
                  card: 'border-emerald-100 bg-emerald-50',
                  labelCls: 'text-emerald-700',
                  valueCls: 'text-emerald-800',
                },
                {
                  key: 'absent',
                  label: 'Absent',
                  value: dayReportSummary.absent,
                  card: 'border-slate-200 bg-slate-50',
                  labelCls: 'text-slate-600',
                  valueCls: 'text-slate-800',
                },
                {
                  key: 'late',
                  label: 'Late',
                  value: dayReportSummary.late,
                  card: 'border-amber-100 bg-amber-50',
                  labelCls: 'text-amber-700',
                  valueCls: 'text-amber-800',
                },
                {
                  key: 'fullDay',
                  label: 'Full day',
                  value: dayReportSummary.fullDay,
                  card: 'border-blue-100 bg-blue-50',
                  labelCls: 'text-blue-700',
                  valueCls: 'text-blue-800',
                },
                {
                  key: 'overtime',
                  label: 'Overtime (total)',
                  value: `${dayReportSummary.overtimeHours} h`,
                  card: 'border-violet-100 bg-violet-50',
                  labelCls: 'text-violet-700',
                  valueCls: 'text-violet-800',
                },
              ].map(({ key, label, value, card, labelCls, valueCls }) => (
                <div
                  key={key}
                  className={`rounded-lg border px-3 py-4 shadow-sm ${card}`}
                >
                  <p className={`text-[11px] font-medium uppercase tracking-wide ${labelCls}`}>
                    {label}
                  </p>
                  <p className={`mt-1 text-3xl font-semibold leading-none ${valueCls}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <h3 className="text-xs font-semibold text-slate-900">Absentees</h3>
                  <p className="text-[10px] text-slate-500">
                    {dayReportAbsentees.length}{' '}
                    {dayReportAbsentees.length === 1 ? 'employee' : 'employees'} did not mark attendance
                  </p>
                </div>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Employee</th>
                        <th className="px-3 py-2 text-left font-medium">Code</th>
                        <th className="px-3 py-2 text-left font-medium">Branch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayReportAbsentees.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                            No absentees for this day.
                          </td>
                        </tr>
                      ) : (
                        dayReportAbsentees.map((row) => (
                          <tr key={row.employee_id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-medium text-slate-800">{row.name || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{row.employee_code || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{row.branch_name || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-amber-100 bg-white shadow-sm">
                <div className="border-b border-amber-100 bg-amber-50/40 px-3 py-2.5">
                  <h3 className="text-xs font-semibold text-amber-900">Late comers</h3>
                  <p className="text-[10px] text-amber-800/80">
                    {dayReportLateComers.length}{' '}
                    {dayReportLateComers.length === 1 ? 'employee' : 'employees'} arrived after the grace period
                  </p>
                </div>
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-amber-50/80 text-amber-900">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Employee</th>
                        <th className="px-3 py-2 text-left font-medium">Code</th>
                        <th className="px-3 py-2 text-left font-medium">Arrival</th>
                        <th className="px-3 py-2 text-right font-medium">Minutes late</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayReportLateComers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                            No late arrivals for this day.
                          </td>
                        </tr>
                      ) : (
                        dayReportLateComers.map((row) => (
                          <tr key={row.employee_id} className="border-t border-amber-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{row.name || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{row.employee_code || '—'}</td>
                            <td className="px-3 py-2 font-medium text-amber-800">{getFirstInTime(row)}</td>
                            <td className="px-3 py-2 text-right text-amber-800">
                              {row.minutes_late != null && row.minutes_late > 0
                                ? `${Math.round(row.minutes_late)} min`
                                : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <h3 className="mt-5 text-xs font-semibold text-slate-900">All employees</h3>
            <p className="text-[10px] text-slate-500">Complete attendance for the selected day</p>

            <div className="mt-2 max-h-[28rem] overflow-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Employee</th>
                    <th className="px-3 py-2 text-left font-medium">Code</th>
                    <th className="px-3 py-2 text-left font-medium">Branch</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Punch timings</th>
                    <th className="px-3 py-2 text-right font-medium">Hours</th>
                    <th className="px-3 py-2 text-right font-medium">OT</th>
                  </tr>
                </thead>
                <tbody>
                  {dayReportData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                        No attendance records for this day.
                      </td>
                    </tr>
                  ) : (
                    dayReportData.map((row) => {
                      const status = getDayStatusLabel(row);
                      const statusCls = !row.present
                        ? 'text-slate-500'
                        : row.full_day
                          ? 'text-blue-700'
                          : row.late
                            ? 'text-amber-700'
                            : 'text-emerald-700';
                      return (
                        <tr key={row.employee_id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-800">{row.name || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{row.employee_code || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{row.branch_name || '—'}</td>
                          <td className={`px-3 py-2 font-medium ${statusCls}`}>{status}</td>
                          <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={formatPunchTimings(row.punches)}>
                            {formatPunchTimings(row.punches)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">{getDayTotalHours(row)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {row.overtime_hours != null && row.overtime_hours > 0
                              ? `${row.overtime_hours} h`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
                <input
                  type="radio"
                  name="day-report-fmt"
                  className="border-slate-300 text-blue-600"
                  checked={dayReportFormat === 'csv'}
                  onChange={() => setDayReportFormat('csv')}
                />
                CSV
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
                <input
                  type="radio"
                  name="day-report-fmt"
                  className="border-slate-300 text-blue-600"
                  checked={dayReportFormat === 'pdf'}
                  onChange={() => setDayReportFormat('pdf')}
                />
                PDF
              </label>
              <button
                type="button"
                disabled={loading != null || dayReportData.length === 0}
                onClick={() => {
                  if (dayReportFormat === 'csv') {
                    void handleDayReportDownload();
                  } else {
                    void handleDayReportPdf();
                  }
                }}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 disabled:opacity-50"
              >
                {loading === 'daily' || loading === 'daily-pdf'
                  ? dayReportFormat === 'pdf'
                    ? 'Generating...'
                    : 'Downloading...'
                  : 'Download day report'}
              </button>
              <button
                type="button"
                disabled={loading != null || dayReportData.length === 0}
                onClick={() => {
                  void handleSendDayReportWhatsApp();
                }}
                className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-50"
              >
                {loading === 'daily-whatsapp' ? 'Opening WhatsApp...' : 'Send on WhatsApp'}
              </button>
              <p className="w-full text-[10px] text-slate-500">
                Export includes summary stats, absentees list, late comers list, and all employees.
              </p>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Date range</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Select year and month for the report period.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-600">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
            >
              {[currentYear(), currentYear() - 1, currentYear() - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-600">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-900">Download</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Choose a report, pick CSV or PDF, then download for {MONTHS.find((m) => m.value === month)?.label}{' '}
          {year}.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              key: 'attendance',
              title: 'Attendance',
              blurb: 'Present, absent, late days and overtime hours.',
            },
            {
              key: 'payroll',
              title: 'Payroll',
              blurb: 'Present/total days, gross, deductions, net salary.',
            },
            {
              key: 'overtime',
              title: 'Overtime',
              blurb: 'Overtime hours for the month.',
            },
          ].map(({ key, title, blurb }) => {
            const fmt = reportFormats[key];
            const busy =
              loading === key || loading === `${key}-pdf`;
            return (
              <div
                key={key}
                className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3 shadow-sm"
              >
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 flex-1 text-[11px] leading-snug text-slate-500">{blurb}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
                    <input
                      type="radio"
                      name={`report-fmt-${key}`}
                      className="border-slate-300 text-blue-600"
                      checked={fmt === 'csv'}
                      onChange={() =>
                        setReportFormats((prev) => ({ ...prev, [key]: 'csv' }))
                      }
                    />
                    CSV
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
                    <input
                      type="radio"
                      name={`report-fmt-${key}`}
                      className="border-slate-300 text-blue-600"
                      checked={fmt === 'pdf'}
                      onChange={() =>
                        setReportFormats((prev) => ({ ...prev, [key]: 'pdf' }))
                      }
                    />
                    PDF
                  </label>
                </div>
                <button
                  type="button"
                  disabled={loading != null}
                  onClick={() => {
                    if (fmt === 'csv') {
                      void handleDownload(key)();
                    } else {
                      void handleDownloadPdf(key)();
                    }
                  }}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 disabled:opacity-50"
                >
                  {busy ? (fmt === 'pdf' ? 'Generating...' : 'Downloading...') : 'Download'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-600">
          <p className="font-medium text-slate-700">Report contents</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li><strong>Attendance:</strong> Employee code, name, present/absent/late days, overtime hours.</li>
            <li><strong>Payroll:</strong> Employee code, name, present/total days, overtime, gross, deductions, net salary.</li>
            <li><strong>Overtime:</strong> Employee code, name, overtime hours for the month.</li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Detailed Attendance Report (PDF)</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Generate a printable PDF with per-employee summary and per-day attendance details.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Period
              </label>
              <p className="text-[11px] text-slate-500">
                Uses selected month/year above. Optionally override with a custom date range below.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  From date (optional)
                </label>
                <input
                  type="date"
                  value={detailedFrom}
                  onChange={(e) => setDetailedFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  To date (optional)
                </label>
                <input
                  type="date"
                  value={detailedTo}
                  onChange={(e) => setDetailedTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
                />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Department
              </label>
              <p className="text-[11px] text-slate-500 mb-1">
                Select a department or keep "All departments".
              </p>
              <select
                value={detailedDepartment}
                onChange={(e) => setDetailedDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
              >
                <option value="">All departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Employees
              </label>
              <p className="text-[11px] text-slate-500 mb-1">
                Keep empty for all employees, or choose one or more from the list.
              </p>
              <select
                multiple
                value={selectedEmployeeIds.map(String)}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, (opt) => Number(opt.value));
                  setSelectedEmployeeIds(values);
                }}
                className="h-32 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800"
              >
                {filteredEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.employee_code || `ID ${emp.id}`})
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEmployeeIds(filteredEmployees.map((emp) => Number(emp.id)))}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEmployeeIds([])}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                >
                  Clear (All employees)
                </button>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                disabled={detailedLoading}
                onClick={async () => {
                  try {
                    setDetailedLoading(true);
                    setToast(null);
                    await generateDetailedAttendancePdf({
                      year,
                      month,
                      fromDate: detailedFrom || null,
                      toDate: detailedTo || null,
                      department: detailedDepartment || null,
                      employeeIds: selectedEmployeeIds.length > 0 ? selectedEmployeeIds : null,
                    });
                    setToast({ type: 'success', message: 'Detailed attendance PDF generated' });
                  } catch (err) {
                    setToast({
                      type: 'error',
                      message: err.message || 'Failed to generate detailed PDF',
                    });
                  } finally {
                    setDetailedLoading(false);
                  }
                }}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {detailedLoading ? 'Generating PDF...' : 'Generate detailed attendance PDF'}
              </button>
              <p className="mt-2 text-[10px] text-slate-500">
                The PDF is generated in your browser using current attendance and company data. No file is stored on the server.
              </p>
            </div>
          </div>
        </div>
      </section>

      {detailsModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-3 sm:px-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {detailsModal === 'employees'
                    ? 'Employees under payroll'
                    : `Payroll details - ${MONTHS.find((m) => m.value === currentMonthNumber)?.label} ${currentMonthYear}`}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {detailsModal === 'employees'
                    ? `Active employees included in payroll (${payrollEmployees.length})`
                    : `Current month total: ₹${formatMoney(currentMonthPayrollTotal)}`}
                </p>
              </div>
              <button
                type="button"
                  onClick={() => {
                    setDetailsModal(null);
                    setPayrollModalPage(1);
                  }}
                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-100">
              {detailsModal === 'employees' ? (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Code</th>
                      <th className="px-3 py-2 text-left font-medium">Department</th>
                      <th className="px-3 py-2 text-left font-medium">Payroll Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollEmployees.map((emp) => (
                      <tr key={emp.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{emp.name || '-'}</td>
                        <td className="px-3 py-2 text-slate-700">{emp.employee_code || '-'}</td>
                        <td className="px-3 py-2 text-slate-700">{emp.department || '-'}</td>
                        <td className="px-3 py-2 text-slate-700 capitalize">
                          {emp.payroll_frequency || 'monthly'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Employee</th>
                        <th className="px-3 py-2 text-left font-medium">Code</th>
                        <th className="px-3 py-2 text-right font-medium">Present/Total</th>
                        <th className="px-3 py-2 text-right font-medium">Net Salary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollModalLoading ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                            Loading payroll details...
                          </td>
                        </tr>
                      ) : payrollModalRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                            No payroll records for this month.
                          </td>
                        </tr>
                      ) : (
                        payrollModalRows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-800">{row.employee_name || '-'}</td>
                            <td className="px-3 py-2 text-slate-700">{row.employee_code || '-'}</td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {row.present_days ?? 0}/{row.total_days ?? 0}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">
                              ₹{formatMoney(row.net_salary)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {payrollModalTotalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                      <p>
                        Showing {(payrollModalPage - 1) * PAYROLL_MODAL_PAGE_SIZE + 1}
                        -
                        {Math.min(payrollModalPage * PAYROLL_MODAL_PAGE_SIZE, payrollModalTotal)} of {payrollModalTotal}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={payrollModalPage <= 1 || payrollModalLoading}
                          onClick={() => setPayrollModalPage((p) => Math.max(1, p - 1))}
                          className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <span>Page {payrollModalPage} / {payrollModalTotalPages}</span>
                        <button
                          type="button"
                          disabled={payrollModalPage >= payrollModalTotalPages || payrollModalLoading}
                          onClick={() => setPayrollModalPage((p) => Math.min(payrollModalTotalPages, p + 1))}
                          className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
