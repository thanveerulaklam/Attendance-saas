import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CHART = {
  present: '#10b981',
  absent: '#94a3b8',
  late: '#f59e0b',
  fullDay: '#3b82f6',
  overtime: '#8b5cf6',
  payroll: '#336dff',
  grid: '#e2e8f0',
  tick: '#64748b',
};

/** Minimum occurrences in the month (MTD) to flag as a regular pattern. */
export const REGULAR_LATE_MIN_DAYS = 2;
export const REGULAR_ABSENT_MIN_DAYS = 2;
export const REGULAR_ONTIME_MIN_DAYS = 2;

export function computeRegularOffenders(monthlyEmployees, asOfDay, department = '', employeeDirectory = []) {
  const deptById = new Map(
    (employeeDirectory || []).map((e) => [Number(e.id), String(e.department || '').trim()])
  );
  const deptFilter = department ? String(department).trim() : '';

  const mapped = (Array.isArray(monthlyEmployees) ? monthlyEmployees : [])
    .map((emp) => {
      const empId = Number(emp.employee_id);
      const empDept = deptById.get(empId) || '';
      if (deptFilter && empDept !== deptFilter) return null;

      const days = (Array.isArray(emp.days) ? emp.days : []).filter(
        (d) => !asOfDay || Number(d.day) <= asOfDay
      );
      const lateCount = days.filter((d) => d.late).length;
      const absentCount = days.filter((d) => !d.present).length;
      const onTimeCount = days.filter((d) => d.present && !d.late).length;

      return {
        employee_id: empId,
        name: emp.name || 'Unknown',
        employee_code: emp.employee_code || '',
        lateCount,
        absentCount,
        onTimeCount,
      };
    })
    .filter(Boolean);

  const regularLateComers = mapped
    .filter((e) => e.lateCount >= REGULAR_LATE_MIN_DAYS)
    .sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name));

  const regularAbsentees = mapped
    .filter((e) => e.absentCount >= REGULAR_ABSENT_MIN_DAYS)
    .sort((a, b) => b.absentCount - a.absentCount || a.name.localeCompare(b.name));

  const regularOntimeArrivals = mapped
    .filter((e) => e.onTimeCount >= REGULAR_ONTIME_MIN_DAYS)
    .sort((a, b) => b.onTimeCount - a.onTimeCount || a.name.localeCompare(b.name));

  return { regularLateComers, regularAbsentees, regularOntimeArrivals };
}

function truncateLabel(value, max = 14) {
  const s = String(value || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <article
      className={`flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-xs font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex-1 px-3 py-3">{children}</div>
    </article>
  );
}

function CorporateTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label ? <p className="mb-1 font-medium text-slate-800">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-slate-600">
          <span className="font-medium" style={{ color: entry.color || entry.fill }}>
            {entry.name}:
          </span>{' '}
          {entry.value}
        </p>
      ))}
    </div>
  );
}

export function ReportsPageHero({ monthLabel, year, dayLabel }) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-6 shadow-soft sm:px-6">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 left-1/3 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden
      />
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Analytics &amp; exports
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Reports dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300">
          Corporate view of attendance and payroll — day-wise insights, monthly exports, and
          executive summaries in one place.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium text-slate-200">
            {monthLabel} {year}
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-medium text-emerald-200">
            Today: {dayLabel}
          </span>
        </div>
      </div>
    </header>
  );
}

export function MonthOverviewCharts({ payrollRows, regularOntimeArrivals = [], loading }) {
  const topPayroll = useMemo(() => {
    const rows = Array.isArray(payrollRows) ? payrollRows : [];
    return [...rows]
      .sort((a, b) => (Number(b.net_salary) || 0) - (Number(a.net_salary) || 0))
      .slice(0, 8)
      .map((row) => {
        const fullName = row.employee_name || row.employee_code || 'Employee';
        return {
          name: truncateLabel(fullName, 14),
          fullName,
          net: Number(row.net_salary) || 0,
        };
      });
  }, [payrollRows]);

  const topOntime = useMemo(
    () =>
      (regularOntimeArrivals || []).slice(0, 8).map((row) => ({
        name: truncateLabel(row.name, 14),
        fullName: row.name,
        count: row.onTimeCount,
      })),
    [regularOntimeArrivals]
  );

  const payrollChartHeight = Math.max(200, topPayroll.length * 26);
  const ontimeChartHeight = Math.max(200, topOntime.length * 26);

  const payrollAvgPresent = useMemo(() => {
    const rows = Array.isArray(payrollRows) ? payrollRows : [];
    if (rows.length === 0) return 0;
    const sum = rows.reduce((acc, r) => {
      const total = Number(r.total_days) || 0;
      const present = Number(r.present_days) || 0;
      return acc + (total > 0 ? (present / total) * 100 : 0);
    }, 0);
    return Math.round(sum / rows.length);
  }, [payrollRows]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-52 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-52 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (topPayroll.length === 0 && topOntime.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-xs text-slate-500">
        Monthly charts will appear once payroll and attendance records exist for this month.
      </p>
    );
  }

  const payrollTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <p className="font-medium text-slate-800">{row?.fullName || row?.name}</p>
        <p className="text-slate-600">
          Net salary: ₹{Number(payload[0]?.value || 0).toLocaleString('en-IN')}
        </p>
      </div>
    );
  };

  const ontimeTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
        <p className="font-medium text-slate-800">{row?.fullName || row?.name}</p>
        <p className="text-slate-600">On-time arrival days: {payload[0]?.value}</p>
      </div>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title="Top net payroll" subtitle="Highest earners this month (₹)">
        <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500">
          <span>Top 8 employees</span>
          <span>Avg attendance {payrollAvgPresent}%</span>
        </div>
        <div style={{ height: payrollChartHeight }}>
          {topPayroll.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topPayroll}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  interval={0}
                  tick={{ fontSize: 10, fill: CHART.tick }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={payrollTooltip} />
                <Bar dataKey="net" name="Net salary" fill={CHART.payroll} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-xs text-slate-500">No payroll data</p>
          )}
        </div>
      </ChartCard>

      <ChartCard
        title="Regular on-time arrival"
        subtitle={`Employees with ${REGULAR_ONTIME_MIN_DAYS}+ on-time arrival days (month to date)`}
      >
        <div className="mb-2 text-[10px] text-slate-500">
          {regularOntimeArrivals.length}{' '}
          {regularOntimeArrivals.length === 1 ? 'employee' : 'employees'} flagged
        </div>
        <div style={{ height: ontimeChartHeight }}>
          {topOntime.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topOntime}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  interval={0}
                  tick={{ fontSize: 10, fill: CHART.tick }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={ontimeTooltip} />
                <Bar dataKey="count" name="On-time days" fill={CHART.present} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-xs text-slate-500">
              No regular on-time arrivals yet ({REGULAR_ONTIME_MIN_DAYS}+ days required).
            </p>
          )}
        </div>
      </ChartCard>
    </div>
  );
}

export function DayReportCharts({ summary, rows, loading }) {
  const attendanceMix = useMemo(() => {
    const presentOnTime = Math.max(0, (summary?.present || 0) - (summary?.late || 0));
    return [
      { name: 'Present (on time)', value: presentOnTime, color: CHART.present },
      { name: 'Late', value: summary?.late || 0, color: CHART.late },
      { name: 'Absent', value: summary?.absent || 0, color: CHART.absent },
    ].filter((d) => d.value > 0);
  }, [summary]);

  const branchData = useMemo(() => {
    const map = new Map();
    (rows || []).forEach((row) => {
      const branch = String(row?.branch_name || '').trim() || 'Unassigned';
      if (!map.has(branch)) {
        map.set(branch, { branch: truncateLabel(branch, 16), present: 0, absent: 0, total: 0 });
      }
      const entry = map.get(branch);
      entry.total += 1;
      if (row.present) entry.present += 1;
      else entry.absent += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const metricsBar = useMemo(
    () => [
      { label: 'Present', value: summary?.present || 0, fill: CHART.present },
      { label: 'Absent', value: summary?.absent || 0, fill: CHART.absent },
      { label: 'Late', value: summary?.late || 0, fill: CHART.late },
      { label: 'Full day', value: summary?.fullDay || 0, fill: CHART.fullDay },
    ],
    [summary]
  );

  const presentPct =
    summary?.total > 0 ? Math.round((summary.present / summary.total) * 100) : 0;

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-52 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!rows?.length) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Attendance mix" subtitle={`${presentPct}% present rate`}>
        <div className="h-48">
          {attendanceMix.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={attendanceMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {attendanceMix.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CorporateTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-xs text-slate-500">No breakdown available</p>
          )}
        </div>
      </ChartCard>

      <ChartCard title="By branch" subtitle="Headcount present vs absent">
        <div className="h-48">
          {branchData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchData} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="branch" tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} axisLine={false} />
                <Tooltip content={<CorporateTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="present" name="Present" stackId="b" fill={CHART.present} />
                <Bar dataKey="absent" name="Absent" stackId="b" fill={CHART.absent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-xs text-slate-500">No branch data</p>
          )}
        </div>
      </ChartCard>

      <ChartCard title="Day metrics" subtitle={`${summary?.overtimeHours || 0} h total overtime`}>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metricsBar} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} axisLine={false} />
              <Tooltip content={<CorporateTooltip />} />
              <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                {metricsBar.map((entry) => (
                  <Cell key={entry.label} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

export function RegularOffendersPanel({
  regularLateComers,
  regularAbsentees,
  loading,
  periodLabel,
  minLate = REGULAR_LATE_MIN_DAYS,
  minAbsent = REGULAR_ABSENT_MIN_DAYS,
}) {
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-44 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-44 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {periodLabel ? (
        <p className="text-[11px] font-medium text-slate-700">{periodLabel}</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-rose-100 bg-white shadow-sm">
          <div className="border-b border-rose-100 bg-rose-50/40 px-3 py-2.5">
            <h3 className="text-xs font-semibold text-rose-900">Regular absentees</h3>
            <p className="text-[10px] text-rose-800/80">
              {regularAbsentees.length}{' '}
              {regularAbsentees.length === 1 ? 'employee' : 'employees'} with {minAbsent}+ absent days
            </p>
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-rose-50/80 text-rose-900">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Employee</th>
                  <th className="px-3 py-2 text-right font-medium">Absent days</th>
                </tr>
              </thead>
              <tbody>
                {regularAbsentees.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-center text-slate-500">
                      No regular absentees this period.
                    </td>
                  </tr>
                ) : (
                  regularAbsentees.map((row) => (
                    <tr key={row.employee_id} className="border-t border-rose-50">
                      <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-800">{row.absentCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-amber-100 bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-amber-50/40 px-3 py-2.5">
            <h3 className="text-xs font-semibold text-amber-900">Regular late comers</h3>
            <p className="text-[10px] text-amber-800/80">
              {regularLateComers.length}{' '}
              {regularLateComers.length === 1 ? 'employee' : 'employees'} with {minLate}+ late days
            </p>
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-amber-50/80 text-amber-900">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Employee</th>
                  <th className="px-3 py-2 text-right font-medium">Late days</th>
                </tr>
              </thead>
              <tbody>
                {regularLateComers.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-center text-slate-500">
                      No regular late comers this period.
                    </td>
                  </tr>
                ) : (
                  regularLateComers.map((row) => (
                    <tr key={row.employee_id} className="border-t border-amber-50">
                      <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                      <td className="px-3 py-2 text-right font-semibold text-amber-800">{row.lateCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RegularOffendersCharts({ regularLateComers, regularAbsentees, loading }) {
  const topLate = useMemo(
    () =>
      (regularLateComers || []).slice(0, 6).map((r) => ({
        name: truncateLabel(r.name, 12),
        count: r.lateCount,
      })),
    [regularLateComers]
  );

  const topAbsent = useMemo(
    () =>
      (regularAbsentees || []).slice(0, 6).map((r) => ({
        name: truncateLabel(r.name, 12),
        count: r.absentCount,
      })),
    [regularAbsentees]
  );

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-44 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-44 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (topLate.length === 0 && topAbsent.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title="Regular absentees" subtitle={`${regularAbsentees.length} employees (${REGULAR_ABSENT_MIN_DAYS}+ days)`}>
        <div className="h-40">
          {topAbsent.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topAbsent} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} axisLine={false} />
                <Tooltip content={<CorporateTooltip />} />
                <Bar dataKey="count" name="Absent days" fill="#f43f5e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-xs text-slate-500">None flagged</p>
          )}
        </div>
      </ChartCard>

      <ChartCard title="Regular late comers" subtitle={`${regularLateComers.length} employees (${REGULAR_LATE_MIN_DAYS}+ days)`}>
        <div className="h-40">
          {topLate.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topLate} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fill: CHART.tick }} tickLine={false} axisLine={false} />
                <Tooltip content={<CorporateTooltip />} />
                <Bar dataKey="count" name="Late days" fill={CHART.late} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-xs text-slate-500">None flagged</p>
          )}
        </div>
      </ChartCard>
    </div>
  );
}

export function SectionShell({ badge, title, description, children, accent = 'slate' }) {
  const accentBar =
    accent === 'emerald'
      ? 'bg-emerald-500'
      : accent === 'blue'
        ? 'bg-primary-500'
        : 'bg-slate-700';

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-soft">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-5">
        <div className={`mt-1 h-8 w-1 shrink-0 rounded-full ${accentBar}`} aria-hidden />
        <div className="min-w-0 flex-1">
          {badge ? (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{badge}</p>
          ) : null}
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </section>
  );
}
