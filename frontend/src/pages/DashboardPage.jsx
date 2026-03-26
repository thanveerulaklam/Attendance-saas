import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { authFetch } from '../utils/api';
import { formatIstTime } from '../utils/istDisplay';
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist';

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    authFetch('/api/dashboard/summary', {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load dashboard');
        return res.json();
      })
      .then((json) => {
        if (isMounted) setSummary(json.data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Unable to load dashboard');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const trend = summary?.attendanceTrend || [];
  const branchSummary = summary?.branchSummary || [];
  const kpis = summary
    ? [
        {
          label: "Today's attendance",
          value: `${summary.todayPresent} / ${summary.todayTotal}`,
          trend: summary.todayTotal > 0 ? `${summary.todayPct}% present` : 'No data yet',
          pill: 'Real-time',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <OnboardingChecklist />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <section className="grid gap-5 md:grid-cols-1 max-w-sm transition-opacity duration-300">
        {loading
          ? Array.from({ length: 1 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-white shadow-soft px-5 py-4 border border-slate-100 animate-pulse h-28"
              />
            ))
          : kpis.map((card) => (
              <article
                key={card.label}
                className="rounded-xl bg-white shadow-soft px-5 py-4 border border-slate-100 flex flex-col justify-between transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {card.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-primary-50 text-primary-700 px-3 py-1 text-[11px] font-medium">
                    {card.pill}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{card.trend}</p>
              </article>
            ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl bg-white shadow-soft px-5 py-4 border border-slate-100 flex flex-col transition-all duration-200 hover:shadow-md">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Currently on lunch break</h2>
            <p className="mt-1 text-xs text-slate-500">Punched out for lunch, not yet back</p>
          </div>
          {loading ? (
            <div className="mt-4 h-24 rounded-lg bg-slate-50 animate-pulse" />
          ) : (summary?.todayOnLunch?.length ?? 0) > 0 ? (
            <ul className="mt-2 space-y-2 max-h-40 overflow-y-auto">
              {summary.todayOnLunch.map((emp) => {
                const outAt = emp.punched_out_at ? formatIstTime(emp.punched_out_at) : '';
                return (
                  <li
                    key={emp.name + (emp.employee_code || '')}
                    className="flex items-center gap-2 text-sm text-slate-700 py-1.5 px-2 rounded-lg bg-sky-50 border border-sky-100"
                  >
                    <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
                    <span className="font-medium">{emp.name}</span>
                    {emp.employee_code && (
                      <span className="text-xs text-slate-500">({emp.employee_code})</span>
                    )}
                    {outAt && (
                      <span className="text-xs text-slate-500 ml-auto">Out {outAt}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500 italic">No one on lunch break right now</p>
          )}
        </article>

        <article className="rounded-xl bg-white shadow-soft px-5 py-4 border border-slate-100 flex flex-col transition-all duration-200 hover:shadow-md">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Today&apos;s absent</h2>
            <p className="mt-1 text-xs text-slate-500">Employees who have not marked attendance today</p>
          </div>
          {loading ? (
            <div className="mt-4 h-24 rounded-lg bg-slate-50 animate-pulse" />
          ) : (summary?.todayAbsent?.length ?? 0) > 0 ? (
            <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {summary.todayAbsent.map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 text-sm text-slate-700 py-1.5 px-2 rounded-lg bg-amber-50 border border-amber-100"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500 italic">Everyone is present today</p>
          )}
        </article>
      </section>

      <section>
        <article className="rounded-xl bg-white shadow-soft px-5 py-4 border border-slate-100 flex flex-col transition-all duration-200 hover:shadow-md">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Branch-wise attendance (All branches)</h2>
            <p className="mt-1 text-xs text-slate-500">Default view combines all branches and shows each branch split below</p>
          </div>
          {loading ? (
            <div className="h-28 rounded-lg bg-slate-50 animate-pulse" />
          ) : branchSummary.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-900">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Branch</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Present</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Absent</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Late</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">% Present</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchSummary.map((b) => (
                    <tr key={`${b.branch_id}-${b.branch_name}`}>
                      <td className="px-3 py-2">{b.branch_name}</td>
                      <td className="px-3 py-2 text-emerald-700 font-medium">{b.present}</td>
                      <td className="px-3 py-2 text-amber-700 font-medium">{b.absent}</td>
                      <td className="px-3 py-2 text-rose-700 font-medium">{b.late}</td>
                      <td className="px-3 py-2">{b.total}</td>
                      <td className="px-3 py-2">{b.present_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No branch attendance data yet</p>
          )}
        </article>
      </section>

      <section>
        <article className="rounded-xl bg-white shadow-soft px-5 py-4 border border-slate-100 flex flex-col transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Weekly attendance trend</h2>
              <p className="text-xs text-slate-500">% present over the last 7 days</p>
            </div>
          </div>
          <div className="h-56">
            {loading ? (
              <div className="h-full rounded-lg bg-slate-50 animate-pulse" />
            ) : trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#336dff" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#336dff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    cursor={{ stroke: '#cbd5f5', strokeWidth: 1 }}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
                      fontSize: 12,
                    }}
                    formatter={(value) => [`${value}% present`, 'Attendance']}
                    labelFormatter={(label) => label}
                  />
                  <Area
                    type="monotone"
                    dataKey="pct"
                    stroke="#336dff"
                    strokeWidth={2}
                    fill="url(#attendanceGradient)"
                    dot={{ r: 3, fill: '#336dff', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-500">
                No attendance data for the last 7 days
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
