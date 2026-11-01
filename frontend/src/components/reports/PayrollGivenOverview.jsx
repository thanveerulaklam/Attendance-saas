import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { authFetch } from '../../utils/api';
import { formatMoneyWithSymbol } from '../../utils/formatMoney';
import { SectionShell } from './ReportsInsights';

const PRESETS = [
  { id: 'last_month', label: 'Last month' },
  { id: 'last_6', label: 'Last 6 months' },
  { id: 'last_12', label: 'Last 12 months' },
  { id: 'custom', label: 'Custom month' },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
}));

const COLORS = {
  net: '#336dff',
  advance: '#d97706',
  deductions: '#e11d48',
  paid: '#059669',
  leave: '#7c3aed',
  late: '#d97706',
  grid: '#e2e8f0',
  tick: '#64748b',
};

function previousMonth() {
  const now = new Date();
  const month = now.getMonth();
  if (month === 0) return { year: now.getFullYear() - 1, month: 12 };
  return { year: now.getFullYear(), month };
}

function compactNumber(value) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function fullMonthLabel(row) {
  if (!row?.year || !row?.month) return '';
  return new Date(row.year, row.month - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}

function sameMonth(a, b) {
  return Boolean(a && b && a.year === b.year && a.month === b.month);
}

function salarySlices(source) {
  if (!source) return [];
  return [
    { name: 'Take-home', value: Number(source.net_salary) || 0, color: COLORS.net },
    { name: 'Advance', value: Number(source.advance) || 0, color: COLORS.advance },
    { name: 'Deductions', value: Number(source.deductions) || 0, color: COLORS.deductions },
  ].filter((slice) => slice.value > 0);
}

function truncate(value, max = 16) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function MoneyTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label ? <p className="mb-1 font-medium text-slate-800">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-slate-600">
          <span className="font-medium" style={{ color: entry.color || entry.fill }}>
            {entry.name}:
          </span>{' '}
          {entry.name.includes('%')
            ? `${entry.value}%`
            : formatMoneyWithSymbol(entry.value, currency)}
        </p>
      ))}
    </div>
  );
}

function Stat({ label, value, hint, tone = 'slate' }) {
  const toneClass = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    blue: 'text-primary-700',
  }[tone] || 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function PayrollGivenOverview({ branchId = '', currency = 'INR' }) {
  const initial = previousMonth();
  const [preset, setPreset] = useState('last_month');
  const [customYear, setCustomYear] = useState(initial.year);
  const [customMonth, setCustomMonth] = useState(initial.month);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthEmployees, setMonthEmployees] = useState([]);
  const [monthEmployeesLoading, setMonthEmployeesLoading] = useState(false);
  const [monthEmployeesError, setMonthEmployeesError] = useState('');
  const detailRef = useRef(null);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => current - i);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ preset });
      if (preset === 'custom') {
        params.set('year', String(customYear));
        params.set('month', String(customMonth));
      }
      if (branchId) params.set('branch_id', String(branchId));
      try {
        const res = await authFetch(`/api/reports/payroll-overview?${params}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Failed to load payroll overview');
        if (!cancelled) setData(json.data || null);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err.message || 'Failed to load payroll overview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [preset, customYear, customMonth, branchId]);

  useEffect(() => {
    setSelectedMonth(null);
  }, [preset, customYear, customMonth, branchId]);

  useEffect(() => {
    if (!selectedMonth || !Number(selectedMonth.records)) {
      setMonthEmployees([]);
      setMonthEmployeesError('');
      setMonthEmployeesLoading(false);
      return undefined;
    }
    let cancelled = false;
    async function loadMonth() {
      setMonthEmployeesLoading(true);
      setMonthEmployeesError('');
      const params = new URLSearchParams({
        year: String(selectedMonth.year),
        month: String(selectedMonth.month),
      });
      if (branchId) params.set('branch_id', String(branchId));
      try {
        const res = await authFetch(`/api/reports/payroll-month?${params}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Failed to load this month');
        if (!cancelled) setMonthEmployees(json.data?.employees || []);
      } catch (err) {
        if (!cancelled) {
          setMonthEmployees([]);
          setMonthEmployeesError(err.message || 'Failed to load this month');
        }
      } finally {
        if (!cancelled) setMonthEmployeesLoading(false);
      }
    }
    loadMonth();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, branchId]);

  useEffect(() => {
    if (!selectedMonth || !detailRef.current) return;
    detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedMonth]);

  const totals = data?.totals;
  const months = data?.months || [];
  const multiMonth = months.length > 1;
  const fmt = (n) => formatMoneyWithSymbol(n, currency);

  const composition = useMemo(
    () => salarySlices(selectedMonth || totals),
    [selectedMonth, totals]
  );

  function openMonth(row) {
    if (!row?.year || !row?.month) return;
    setSelectedMonth(row);
  }

  function openChartMonth(state) {
    const fromPayload = state?.activePayload?.[0]?.payload;
    if (fromPayload?.year) {
      openMonth(fromPayload);
      return;
    }
    const index = state?.activeTooltipIndex ?? state?.activeIndex;
    if (index != null && index !== '' && months[Number(index)]?.year) {
      openMonth(months[Number(index)]);
      return;
    }
    if (state?.activeLabel) {
      openMonth(months.find((item) => item.label === state.activeLabel));
    }
  }

  function openBar(entry) {
    openMonth(entry?.payload?.year ? entry.payload : entry);
  }

  const topEmployees = useMemo(
    () =>
      (data?.top_employees || []).map((row) => ({
        name: truncate(row.employee_name || row.employee_code || 'Employee'),
        fullName: row.employee_name || 'Employee',
        net: Number(row.net_salary) || 0,
        advance: Number(row.advance) || 0,
      })),
    [data]
  );

  const hasPayroll = Number(totals?.records || 0) > 0;

  return (
    <SectionShell
      badge="Payroll given"
      title="Overall payroll"
      description="Generated payroll for last month, the last 6 or 12 months, or any month you choose."
      accent="blue"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPreset(item.id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${
                preset === item.id
                  ? 'border-blue-700 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <select
              value={customMonth}
              onChange={(e) => setCustomMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
              aria-label="Month"
            >
              {MONTHS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={customYear}
              onChange={(e) => setCustomYear(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
              aria-label="Year"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] font-medium text-slate-600">
        {loading ? 'Loading…' : data?.label || '—'}
      </p>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total payroll" value={loading || error ? '…' : fmt(totals?.net_salary)} hint="Net salary generated" tone="blue" />
        <Stat label="Advance" value={loading || error ? '…' : fmt(totals?.advance)} hint="Diary and loan deducted" tone="amber" />
        <Stat label="Deductions" value={loading || error ? '…' : fmt(totals?.deductions)} hint="Other salary deductions" tone="rose" />
        <Stat label="Salary paid" value={loading || error ? '…' : fmt(totals?.paid)} hint={`Outstanding ${loading || error ? '…' : fmt(totals?.outstanding)}`} tone="emerald" />
        <Stat
          label="Leave"
          value={loading || error ? '…' : `${totals?.leave_percentage ?? 0}%`}
          hint={loading || error ? '' : `${totals?.absence_days ?? 0} absence days`}
        />
        <Stat
          label="Late"
          value={loading || error ? '…' : `${totals?.late_percentage ?? 0}%`}
          hint={loading || error ? '' : `${totals?.late_days ?? 0} late days`}
        />
        <Stat label="Overtime" value={loading || error ? '…' : `${totals?.overtime_hours ?? 0} h`} hint="Hours on payroll" />
        <Stat
          label="Incentive"
          value={loading || error ? '…' : fmt(totals?.incentive)}
          hint={loading || error ? '' : `${totals?.employees ?? 0} employee${Number(totals?.employees) === 1 ? '' : 's'}`}
        />
      </div>

      {!loading && !error && !hasPayroll ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-600">
          No payroll was generated for this period.
        </p>
      ) : null}

      {hasPayroll ? (
        <>
          <div className={`mt-5 grid grid-cols-1 gap-4 ${multiMonth ? 'xl:grid-cols-2' : ''}`}>
            <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-900">Payroll and advance</h3>
              <p className="mt-0.5 text-[10px] text-slate-500">Click a month to see its payroll, advances, and who was paid</p>
              <div className="mt-2 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={months} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} onClick={openChartMonth}>
                    <CartesianGrid stroke={COLORS.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: COLORS.tick, fontSize: 11 }} />
                    <YAxis tickFormatter={compactNumber} tick={{ fill: COLORS.tick, fontSize: 11 }} width={48} />
                    <Tooltip content={<MoneyTooltip currency={currency} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="net_salary" name="Payroll" fill={COLORS.net} radius={[4, 4, 0, 0]} cursor="pointer" onClick={openBar}>
                      {months.map((row) => (
                        <Cell
                          key={`net-${row.year}-${row.month}`}
                          fill={COLORS.net}
                          fillOpacity={!selectedMonth || sameMonth(selectedMonth, row) ? 1 : 0.35}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="advance" name="Advance" fill={COLORS.advance} radius={[4, 4, 0, 0]} cursor="pointer" onClick={openBar}>
                      {months.map((row) => (
                        <Cell
                          key={`adv-${row.year}-${row.month}`}
                          fill={COLORS.advance}
                          fillOpacity={!selectedMonth || sameMonth(selectedMonth, row) ? 1 : 0.35}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            {multiMonth ? (
              <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h3 className="text-xs font-semibold text-slate-900">Leave and late</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Share of absence days, and attended days that started late</p>
                <div className="mt-2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={months} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} onClick={openChartMonth}>
                      <CartesianGrid stroke={COLORS.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: COLORS.tick, fontSize: 11 }} />
                      <YAxis unit="%" tick={{ fill: COLORS.tick, fontSize: 11 }} width={40} />
                      <Tooltip content={<MoneyTooltip currency={currency} />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="leave_percentage" name="Leave %" stroke={COLORS.leave} strokeWidth={2} dot={{ r: 3, cursor: 'pointer' }} activeDot={{ r: 5, cursor: 'pointer' }} />
                      <Line type="monotone" dataKey="late_percentage" name="Late %" stroke={COLORS.late} strokeWidth={2} dot={{ r: 3, cursor: 'pointer' }} activeDot={{ r: 5, cursor: 'pointer' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>
            ) : (
              <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <h3 className="text-xs font-semibold text-slate-900">Where the salary went</h3>
                <p className="mt-0.5 text-[10px] text-slate-500">Take-home, advance, and other deductions</p>
                <div className="mt-2 h-64">
                  {composition.length === 0 ? (
                    <p className="px-2 py-8 text-center text-xs text-slate-500">Nothing to chart for this month.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={composition} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
                          {composition.map((slice) => (
                            <Cell key={slice.name} fill={slice.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<MoneyTooltip currency={currency} />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </article>
            )}
          </div>

          {selectedMonth ? (
            <article ref={detailRef} className="mt-4 rounded-xl border border-blue-200 bg-blue-50/40 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{fullMonthLabel(selectedMonth)}</h3>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {Number(selectedMonth.records)
                      ? `${selectedMonth.employees} employee${Number(selectedMonth.employees) === 1 ? '' : 's'} on this payroll`
                      : 'No payroll was generated for this month'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(null)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                >
                  Close
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Stat label="Payroll" value={fmt(selectedMonth.net_salary)} hint="Net salary generated" tone="blue" />
                <Stat label="Advance" value={fmt(selectedMonth.advance)} hint="Diary and loan deducted" tone="amber" />
                <Stat label="Deductions" value={fmt(selectedMonth.deductions)} hint="Other salary deductions" tone="rose" />
                <Stat label="Salary paid" value={fmt(selectedMonth.paid)} hint={`Outstanding ${fmt(selectedMonth.outstanding)}`} tone="emerald" />
                <Stat label="Leave" value={`${selectedMonth.leave_percentage ?? 0}%`} hint={`${selectedMonth.absence_days ?? 0} absence days`} />
                <Stat label="Late" value={`${selectedMonth.late_percentage ?? 0}%`} hint={`${selectedMonth.late_days ?? 0} late days`} />
                <Stat label="Overtime" value={`${selectedMonth.overtime_hours ?? 0} h`} hint="Hours on payroll" />
                <Stat
                  label="Incentive"
                  value={fmt(selectedMonth.incentive)}
                  hint={`${selectedMonth.employees ?? 0} employee${Number(selectedMonth.employees) === 1 ? '' : 's'}`}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
                <div className="rounded-xl border border-slate-200 bg-white p-3 xl:col-span-2">
                  <h4 className="text-xs font-semibold text-slate-900">Where the salary went</h4>
                  <p className="mt-0.5 text-[10px] text-slate-500">Take-home, advance, and other deductions this month</p>
                  <div className="mt-2 h-52">
                    {salarySlices(selectedMonth).length === 0 ? (
                      <p className="px-2 py-8 text-center text-xs text-slate-500">Nothing to chart for this month.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={salarySlices(selectedMonth)} dataKey="value" nameKey="name" innerRadius={46} outerRadius={70} paddingAngle={2}>
                            {salarySlices(selectedMonth).map((slice) => (
                              <Cell key={slice.name} fill={slice.color} />
                            ))}
                          </Pie>
                          <Tooltip content={<MoneyTooltip currency={currency} />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white xl:col-span-3">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <h4 className="text-xs font-semibold text-slate-900">Employees</h4>
                    <p className="mt-0.5 text-[10px] text-slate-500">Each person’s generated payroll for {fullMonthLabel(selectedMonth)}</p>
                  </div>
                  {monthEmployeesError ? (
                    <p className="px-3 py-4 text-xs text-rose-700">{monthEmployeesError}</p>
                  ) : monthEmployeesLoading ? (
                    <p className="px-3 py-4 text-xs text-slate-500">Loading employees…</p>
                  ) : monthEmployees.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-slate-500">No employees on this payroll.</p>
                  ) : (
                    <div className="max-h-80 overflow-auto">
                      <table className="min-w-full text-left text-[11px]">
                        <thead className="sticky top-0 bg-slate-50 text-slate-500">
                          <tr>
                            {['Employee', 'Payroll', 'Advance', 'Deductions', 'Paid', 'Leave', 'Overtime'].map((heading) => (
                              <th key={heading} className="whitespace-nowrap px-3 py-2 font-semibold">{heading}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {monthEmployees.map((row) => (
                            <tr key={row.employee_id} className="border-t border-slate-100">
                              <td className="whitespace-nowrap px-3 py-2">
                                <p className="font-medium text-slate-800">{row.employee_name || 'Employee'}</p>
                                {row.employee_code ? <p className="text-[10px] text-slate-500">{row.employee_code}</p> : null}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt(row.net_salary)}</td>
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt(row.advance)}</td>
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt(row.deductions)}</td>
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmt(row.paid)}</td>
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.leave_percentage}%</td>
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{row.overtime_hours} h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ) : null}

          {!selectedMonth && multiMonth && composition.length > 0 ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-900">Where the salary went</h3>
              <p className="mt-0.5 text-[10px] text-slate-500">Combined take-home, advance, and other deductions. Click a month above to see that month alone.</p>
              <div className="mt-2 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={composition} dataKey="value" nameKey="name" innerRadius={48} outerRadius={74} paddingAngle={2}>
                      {composition.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<MoneyTooltip currency={currency} />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {topEmployees.length > 0 ? (
            <article className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-900">Highest payroll</h3>
              <p className="mt-0.5 text-[10px] text-slate-500">Employees with the largest net salary in this period</p>
              <div className="mt-2" style={{ height: Math.max(180, topEmployees.length * 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topEmployees} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke={COLORS.grid} horizontal={false} />
                    <XAxis type="number" tickFormatter={compactNumber} tick={{ fill: COLORS.tick, fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fill: COLORS.tick, fontSize: 11 }} />
                    <Tooltip content={<MoneyTooltip currency={currency} />} />
                    <Bar dataKey="net" name="Payroll" fill={COLORS.net} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {['Month', 'Employees', 'Payroll', 'Advance', 'Deductions', 'Paid', 'Leave', 'Late', 'Overtime'].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-3 py-2 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((row) => (
                  <tr
                    key={`${row.year}-${row.month}`}
                    onClick={() => openMonth(row)}
                    className={`cursor-pointer border-t border-slate-100 ${
                      sameMonth(selectedMonth, row) ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{row.label}</td>
                    <td className="px-3 py-2 tabular-nums">{row.employees}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.net_salary)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.advance)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.deductions)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(row.paid)}</td>
                    <td className="px-3 py-2 tabular-nums">{row.leave_percentage}%</td>
                    <td className="px-3 py-2 tabular-nums">{row.late_percentage}%</td>
                    <td className="px-3 py-2 tabular-nums">{row.overtime_hours} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Leave is absence days divided by present plus absence days on generated payroll. Late is the share of attended days whose first punch was after shift start plus grace.
          </p>
        </>
      ) : null}
    </SectionShell>
  );
}
