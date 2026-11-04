import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../utils/api';
import { resolveCompanyTimezone, todayYmdInTimezone } from '../../utils/companyLocalDisplay';
import { createPdf, addReportHeader, addAutoTable, savePdf } from '../../utils/pdfGenerator';
import { SectionShell } from './ReportsInsights';

function dayOfWeekFromYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getDay();
}

function toYearMonth(value) {
  const [y, m] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function monthBounds(year, month) {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

function monthsBetween(fromYmd, toYmd) {
  const start = toYearMonth(fromYmd);
  const end = toYearMonth(toYmd);
  if (!start || !end) return [];
  const out = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    out.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (out.length > 24) break;
  }
  return out;
}

function formatLeaveDays(value) {
  const n = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatLeaveDate(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(ymd || '');
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getWeeklyOffDays(employeeRow, shiftById, companyWeeklyOffDays) {
  const sid = employeeRow?.shift_id != null ? Number(employeeRow.shift_id) : null;
  if (sid && shiftById.has(sid)) {
    const arr = shiftById.get(sid).weekly_off_days;
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    }
  }
  return Array.isArray(companyWeeklyOffDays)
    ? companyWeeklyOffDays.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
}

function classifyDay(day, context) {
  const date = String(day?.date || '').slice(0, 10);
  if (!date) return null;
  if (context.fromDate && date < context.fromDate) return null;
  if (context.toDate && date > context.toDate) return null;
  if (date > context.todayYmd) return null;

  const openedForWork = context.workingOverrideDates.has(date);
  const holidayName = context.namedHolidayByDate.get(date);
  const dow = dayOfWeekFromYmd(date);
  const isOff =
    !openedForWork &&
    (Boolean(holidayName) ||
      context.holidayOverrideDates.has(date) ||
      context.explicitWeeklyOffDates.has(date) ||
      (context.weeklyOffDays.length > 0 && context.weeklyOffDays.includes(dow)));
  if (isOff) return 'off';
  if (day.half_day) return 'half';
  if (!day.present) return 'absent';
  return 'present';
}

async function loadJson(url) {
  const res = await authFetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const str = value == null ? '' : String(value);
  if (/[,"\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export default function TotalLeaveDaysReport({ year, month, branchId, company }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [periodLabel, setPeriodLabel] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const requestRef = useRef(0);
  const detailRef = useRef(null);

  useEffect(() => {
    if (!selectedId || !detailRef.current) return;
    detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  useEffect(() => {
    requestRef.current += 1;
    setRows([]);
    setPeriodLabel('');
    setSelectedId(null);
    setError('');
    setLoading(false);
  }, [year, month, branchId, fromDate, toDate]);

  const buildReport = async () => {
    const monthRange = monthBounds(Number(year), Number(month));
    const hasFrom = Boolean(fromDate);
    const hasTo = Boolean(toDate);
    if (hasFrom !== hasTo) {
      setError('Enter both a from date and a to date, or leave both empty to use the selected month.');
      return;
    }
    const rangeFrom = hasFrom ? fromDate : monthRange.from;
    const rangeTo = hasTo ? toDate : monthRange.to;
    if (rangeFrom > rangeTo) {
      setError('From date must be on or before the to date.');
      return;
    }

    const months = monthsBetween(rangeFrom, rangeTo);
    if (months.length === 0) {
      setError('Choose a valid month or date range.');
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const companyTz = resolveCompanyTimezone(company);
      const todayYmd = todayYmdInTimezone(companyTz);
      const branchQuery = branchId ? `&branch_id=${encodeURIComponent(branchId)}` : '';

      const [employeesJson, weeklyOffJson, shiftsJson, overridesJson] = await Promise.all([
        loadJson(`/api/employees?limit=500${branchQuery}`),
        loadJson('/api/holidays/weekly-off'),
        loadJson('/api/shifts?limit=100'),
        loadJson(`/api/holidays/day-overrides?${new URLSearchParams({ from: rangeFrom, to: rangeTo }).toString()}`),
      ]);

      const monthlyPayloads = await Promise.all(
        months.map(async ({ year: y, month: m }) => {
          const bounds = monthBounds(y, m);
          const [monthlyJson, holidaysJson] = await Promise.all([
            loadJson(
              `/api/attendance/monthly?${new URLSearchParams({
                year: String(y),
                month: String(m),
                include_inactive: '1',
                ...(branchId ? { branch_id: String(branchId) } : {}),
              }).toString()}`
            ),
            loadJson(`/api/holidays?${new URLSearchParams({ year: String(y), month: String(m) }).toString()}`),
          ]);
          return { bounds, monthlyJson, holidaysJson };
        })
      );

      const employeeById = new Map(
        (employeesJson.data?.data || []).map((emp) => [Number(emp.id), emp])
      );
      const shiftById = new Map(
        (Array.isArray(shiftsJson.data) ? shiftsJson.data : []).map((shift) => [Number(shift.id), shift])
      );
      const companyWeeklyOffDays = weeklyOffJson.data?.days || [];

      const namedHolidayByDate = new Map();
      const explicitWeeklyOffDates = new Set();
      monthlyPayloads.forEach(({ holidaysJson }) => {
        (holidaysJson.data || []).forEach((holiday) => {
          const date = String(holiday.holiday_date ?? holiday.date ?? '').slice(0, 10);
          if (!date) return;
          const kind = String(holiday.kind || 'public').toLowerCase();
          if (kind === 'weekly_off') explicitWeeklyOffDates.add(date);
          else if (kind === 'public' || kind === 'company') {
            namedHolidayByDate.set(date, (holiday.name && String(holiday.name).trim()) || 'Holiday');
          }
        });
      });

      const workingOverrideDates = new Set();
      const holidayOverrideDates = new Set();
      (overridesJson.data || []).forEach((row) => {
        const date = String(row?.override_date || '').slice(0, 10);
        if (!date) return;
        if (row.effect === 'working') workingOverrideDates.add(date);
        if (row.effect === 'holiday') holidayOverrideDates.add(date);
      });

      const byEmployee = new Map();
      monthlyPayloads.forEach(({ monthlyJson }) => {
        (monthlyJson.data?.employees || []).forEach((emp) => {
          const id = Number(emp.employee_id);
          if (!byEmployee.has(id)) {
            byEmployee.set(id, {
              employee_id: id,
              employee_code: emp.employee_code || '',
              name: emp.name || '',
              status: emp.status || 'active',
              days: [],
            });
          }
          const bucket = byEmployee.get(id);
          if (String(emp.status || '').toLowerCase() === 'inactive') bucket.status = 'inactive';
          bucket.days.push(...(emp.days || []));
        });
      });

      const nextRows = [];
      byEmployee.forEach((emp) => {
        const meta = employeeById.get(emp.employee_id);
        const deactivated = String(emp.status || meta?.status || '').toLowerCase() === 'inactive';
        const punchesInRange = emp.days.some((day) => {
          const date = String(day?.date || '').slice(0, 10);
          if (!date || date < rangeFrom || date > rangeTo) return false;
          return Array.isArray(day.punches) && day.punches.length > 0;
        });
        if (deactivated && !punchesInRange) return;

        const weeklyOffDays = getWeeklyOffDays(meta, shiftById, companyWeeklyOffDays);
        let fullAbsent = 0;
        let halfDays = 0;
        const leaveDates = [];
        const seen = new Set();
        emp.days.forEach((day) => {
          const date = String(day?.date || '').slice(0, 10);
          if (!date || seen.has(date)) return;
          seen.add(date);
          const kind = classifyDay(day, {
            fromDate: rangeFrom,
            toDate: rangeTo,
            todayYmd,
            namedHolidayByDate,
            explicitWeeklyOffDates,
            workingOverrideDates,
            holidayOverrideDates,
            weeklyOffDays,
          });
          if (kind === 'absent') {
            fullAbsent += 1;
            leaveDates.push({ date, kind: 'absent' });
          }
          if (kind === 'half') {
            halfDays += 1;
            leaveDates.push({ date, kind: 'half' });
          }
        });
        leaveDates.sort((a, b) => a.date.localeCompare(b.date));

        nextRows.push({
          employee_id: emp.employee_id,
          employee_code: emp.employee_code,
          name: emp.name,
          deactivated,
          fullAbsent,
          halfDays,
          totalLeaveDays: fullAbsent + halfDays * 0.5,
          leaveDates,
        });
      });

      nextRows.sort((a, b) => {
        if (b.totalLeaveDays !== a.totalLeaveDays) return b.totalLeaveDays - a.totalLeaveDays;
        return String(a.name).localeCompare(String(b.name));
      });

      const label = hasFrom
        ? `${rangeFrom} to ${rangeTo}`
        : new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', {
            month: 'long',
            year: 'numeric',
          });
      if (requestRef.current !== requestId) return;
      setRows(nextRows);
      setPeriodLabel(label);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setRows([]);
      setPeriodLabel('');
      setError(err.message || 'Could not load leave days');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  };

  const totals = rows.reduce(
    (sum, row) => ({
      fullAbsent: sum.fullAbsent + row.fullAbsent,
      halfDays: sum.halfDays + row.halfDays,
      totalLeaveDays: sum.totalLeaveDays + row.totalLeaveDays,
    }),
    { fullAbsent: 0, halfDays: 0, totalLeaveDays: 0 }
  );

  const exportCsv = () => {
    const header = ['Employee Code', 'Name', 'Full Absent Days', 'Half Days', 'Total Leave Days'];
    const body = rows.map((row) => [
      row.employee_code,
      row.deactivated ? `${row.name} (Deactivated)` : row.name,
      row.fullAbsent,
      row.halfDays,
      formatLeaveDays(row.totalLeaveDays),
    ]);
    body.push(['', 'Total', totals.fullAbsent, totals.halfDays, formatLeaveDays(totals.totalLeaveDays)]);
    const csv = [header, ...body].map((line) => line.map(escapeCsv).join(',')).join('\r\n');
    const slug = periodLabel.replace(/\s+/g, '-').toLowerCase() || 'period';
    downloadTextFile(`total-leave-days-${slug}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const exportPdf = () => {
    const doc = createPdf({ orientation: 'landscape' });
    const startY = addReportHeader(doc, {
      companyName: company?.name,
      companyPhone: company?.phone,
      companyAddress: company?.address,
      title: 'Total Leave Days',
      periodLabel: periodLabel || '',
      generatedAt: new Date().toLocaleString(),
      totalEmployees: rows.length,
    });
    const body = rows.map((row) => [
      row.employee_code || '',
      row.deactivated ? `${row.name || ''} (Deactivated)` : (row.name || ''),
      String(row.fullAbsent),
      String(row.halfDays),
      formatLeaveDays(row.totalLeaveDays),
    ]);
    body.push(['', 'Total', String(totals.fullAbsent), String(totals.halfDays), formatLeaveDays(totals.totalLeaveDays)]);
    addAutoTable(
      doc,
      [['Employee Code', 'Name', 'Full Absent Days', 'Half Days', 'Total Leave Days']],
      body,
      { startY, margin: { left: 32, right: 32 }, styles: { fontSize: 9 } }
    );
    const slug = (periodLabel || 'period').replace(/\s+/g, '');
    savePdf(doc, `TotalLeaveDays_${slug}.pdf`);
  };

  const selected = rows.find((row) => row.employee_id === selectedId) || null;

  const exportSelectedPdf = () => {
    if (!selected) return;
    const doc = createPdf();
    const name = selected.deactivated ? `${selected.name} (Deactivated)` : selected.name;
    const startY = addReportHeader(doc, {
      companyName: company?.name,
      companyPhone: company?.phone,
      companyAddress: company?.address,
      title: 'Leave dates',
      periodLabel: `${`${selected.employee_code || ''} ${name}`.trim()} · ${periodLabel || ''}`.trim(),
      generatedAt: new Date().toLocaleString(),
    });
    const totalLabel = `${formatLeaveDays(selected.totalLeaveDays)} leave days (${selected.fullAbsent} full absent, ${selected.halfDays} half days)`;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Total: ${totalLabel}`, 40, startY);
    const body = (selected.leaveDates || []).map((entry) => [
      entry.date,
      formatLeaveDate(entry.date),
      entry.kind === 'half' ? 'Half day' : 'Absent',
    ]);
    if (body.length === 0) body.push(['—', 'No absent days in this period', '']);
    body.push(['', 'Total', totalLabel]);
    const totalRowIndex = body.length - 1;
    addAutoTable(
      doc,
      [['Date', 'Day', 'Status']],
      body,
      {
        startY: startY + 16,
        margin: { left: 32, right: 32 },
        styles: { fontSize: 10 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === totalRowIndex) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
          }
        },
      }
    );
    const safeName = String(selected.name || 'employee').replace(/\s+/g, '');
    savePdf(doc, `LeaveDates_${selected.employee_code || safeName}.pdf`);
  };

  return (
    <SectionShell
      badge="Leave"
      title="Total leave days"
      description="Total absent days for each employee. Click a name to see the dates. A half day counts as 0.5. Weekly offs and holidays are not counted."
      accent="blue"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] text-slate-500">
            Uses the year and month selected above. Optionally limit the total to a date range.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">From date (optional)</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">To date (optional)</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void buildReport()}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Calculating...' : 'Show total leave days'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={exportCsv}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Download CSV
            </button>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={exportPdf}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Download PDF
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="mt-3 text-[11px] text-red-600">{error}</p> : null}

      {periodLabel && rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-2 text-[11px] font-medium text-slate-700">{periodLabel}</p>
          <table className="min-w-full text-left text-[11px] text-slate-800">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-2 py-2 font-medium">Code</th>
                <th className="px-2 py-2 font-medium">Employee</th>
                <th className="px-2 py-2 text-right font-medium">Full absent</th>
                <th className="px-2 py-2 text-right font-medium">Half days</th>
                <th className="px-2 py-2 text-right font-medium">Total leave days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = selectedId === row.employee_id;
                return (
                  <tr
                    key={row.employee_id}
                    className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${open ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedId(open ? null : row.employee_id)}
                  >
                    <td className="px-2 py-1.5">{row.employee_code}</td>
                    <td className={`px-2 py-1.5 ${row.deactivated ? 'text-red-600' : 'text-blue-700'}`}>
                      {row.name}
                      {row.deactivated ? ' — deactivated' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right">{row.fullAbsent}</td>
                    <td className="px-2 py-1.5 text-right">{row.halfDays}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatLeaveDays(row.totalLeaveDays)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold text-slate-900">
                <td className="px-2 py-2" />
                <td className="px-2 py-2">Total</td>
                <td className="px-2 py-2 text-right">{totals.fullAbsent}</td>
                <td className="px-2 py-2 text-right">{totals.halfDays}</td>
                <td className="px-2 py-2 text-right">{formatLeaveDays(totals.totalLeaveDays)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {selected ? (
        <div ref={detailRef} className="mt-4 scroll-mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={`text-sm font-semibold ${selected.deactivated ? 'text-red-600' : 'text-slate-900'}`}>
                {selected.employee_code ? `${selected.employee_code} ` : ''}
                {selected.name}
                {selected.deactivated ? ' — deactivated' : ''}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {periodLabel} · {formatLeaveDays(selected.totalLeaveDays)} leave days
                {' · '}
                {selected.fullAbsent} full absent
                {' · '}
                {selected.halfDays} half days
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportSelectedPdf}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Download dates PDF
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
          {selected.leaveDates.length === 0 ? (
            <p className="mt-3 text-[11px] text-slate-500">No absent days in this period.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-[11px] text-slate-800">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.leaveDates.map((entry) => (
                    <tr key={entry.date} className="border-b border-slate-100">
                      <td className="px-2 py-1.5">{formatLeaveDate(entry.date)}</td>
                      <td className="px-2 py-1.5">{entry.kind === 'half' ? 'Half day' : 'Absent'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {periodLabel && rows.length === 0 && !error ? (
        <p className="mt-3 text-[11px] text-slate-500">No employees for this period.</p>
      ) : null}
    </SectionShell>
  );
}
