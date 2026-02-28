import { useEffect, useState, useMemo } from 'react';
import { authFetch } from '../utils/api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getMonthYear(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function AttendancePage() {
  const [monthYear, setMonthYear] = useState(() => getMonthYear(0));
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [monthlyData, setMonthlyData] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [error, setError] = useState(null);

  const { year, month } = monthYear;
  const dateStr = todayStr();

  useEffect(() => {
    let isMounted = true;
    const fetchEmployees = async () => {
      try {
        const res = await authFetch('/api/employees?limit=200', {
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const json = await res.json();
        const list = json.data?.data || [];
        if (isMounted) setEmployees(list);
      } catch {
        // ignore
      }
    };
    fetchEmployees();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setError(null);
    setLoading(true);
    const params = new URLSearchParams({ year, month });
    if (employeeId) params.set('employee_id', employeeId);
    authFetch(`/api/attendance/monthly?${params}`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load monthly attendance');
        return res.json();
      })
      .then((json) => {
        if (isMounted) setMonthlyData(json.data);
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to load attendance');
          setMonthlyData(null);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [year, month, employeeId]);

  useEffect(() => {
    let isMounted = true;
    setDailyLoading(true);
    authFetch(`/api/attendance/daily?date=${dateStr}`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load today');
        return res.json();
      })
      .then((json) => {
        if (isMounted) setDailyData(Array.isArray(json.data) ? json.data : []);
      })
      .catch(() => {
        if (isMounted) setDailyData([]);
      })
      .finally(() => {
        if (isMounted) setDailyLoading(false);
      });
    return () => { isMounted = false; };
  }, [dateStr]);

  const todaySummary = useMemo(() => {
    if (!dailyData || dailyData.length === 0) {
      return { present: 0, absent: 0, late: 0, total: 0 };
    }
    const present = dailyData.filter((r) => r.present).length;
    const late = dailyData.filter((r) => r.late).length;
    return {
      present,
      absent: dailyData.length - present,
      late,
      total: dailyData.length,
    };
  }, [dailyData]);

  const calendarGrid = useMemo(() => {
    if (!monthlyData || !monthlyData.daysInMonth) return null;
    const { daysInMonth, employees: empList } = monthlyData;
    const firstDay = new Date(year, month - 1, 1);
    const startWeekday = firstDay.getDay();
    const days = [];
    for (let d = 1; d <= daysInMonth; d += 1) days.push(d);

    const totalEmployees = empList?.length || 0;
    const singleEmployee = employeeId && empList && empList[0];
    const dayMap = new Map();

    if (singleEmployee) {
      singleEmployee.days.forEach((x) => dayMap.set(x.day, { ...x, total: 1, presentCount: x.present ? 1 : 0 }));
    } else if (empList && empList.length > 0) {
      for (let d = 1; d <= daysInMonth; d += 1) {
        let presentCount = 0;
        let lateCount = 0;
        empList.forEach((emp) => {
          const dayInfo = emp.days.find((x) => x.day === d);
          if (dayInfo?.present) presentCount += 1;
          if (dayInfo?.late) lateCount += 1;
        });
        dayMap.set(d, {
          day: d,
          present: presentCount > 0,
          late: lateCount > 0,
          presentCount,
          total: totalEmployees,
        });
      }
    }

    const blanks = Array(startWeekday).fill(null);
    const allCells = [...blanks, ...days];
    const rows = [];
    for (let i = 0; i < allCells.length; i += 7) {
      rows.push(allCells.slice(i, i + 7));
    }
    return { rows, dayMap, daysInMonth, totalEmployees, isSingleEmployee: Boolean(employeeId) };
  }, [monthlyData, year, month, employeeId]);

  const goPrev = () => setMonthYear((m) => getMonthYear(-1));
  const goNext = () => setMonthYear((m) => getMonthYear(1));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Attendance</h1>
        <p className="text-xs text-slate-500">
          View daily and monthly attendance with present, late, and overtime.
        </p>
      </header>

      {/* Today summary card */}
      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Today&apos;s summary</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">{dateStr}</p>
        {dailyLoading ? (
          <div className="mt-3 h-16 rounded-lg bg-slate-50 animate-pulse" />
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
              <p className="text-[10px] font-medium text-emerald-700">Present</p>
              <p className="text-lg font-semibold text-emerald-800">{todaySummary.present}</p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="text-[10px] font-medium text-slate-600">Absent</p>
              <p className="text-lg font-semibold text-slate-800">{todaySummary.absent}</p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              <p className="text-[10px] font-medium text-amber-700">Late</p>
              <p className="text-lg font-semibold text-amber-800">{todaySummary.late}</p>
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          {todaySummary.total} active employees
        </p>
      </section>

      {/* Monthly calendar */}
      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Monthly view</h2>
          <div className="flex items-center gap-2">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
            >
              <option value="">All employees (summary)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employee_code})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={goPrev}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:border-primary-200 hover:text-primary-700"
            >
              ← Prev
            </button>
            <span className="text-[11px] font-medium text-slate-700 min-w-[100px] text-center">
              {new Date(year, month - 1, 1).toLocaleString('default', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:border-primary-200 hover:text-primary-700"
            >
              Next →
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-4 h-64 rounded-lg bg-slate-50 animate-pulse" />
        ) : calendarGrid ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200">
                  {WEEKDAYS.map((wd) => (
                    <th
                      key={wd}
                      className="py-2 text-center font-medium text-slate-500"
                    >
                      {wd}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarGrid.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-slate-100">
                    {row.map((dayNum, colIdx) => {
                      if (dayNum == null) {
                        return <td key={colIdx} className="p-1" />;
                      }
                      const info = calendarGrid.dayMap.get(dayNum);
                      const present = info?.present ?? false;
                      const late = info?.late ?? false;
                      const isToday =
                        dayNum === new Date().getDate() &&
                        month === new Date().getMonth() + 1 &&
                        year === new Date().getFullYear();
                      let bg = 'bg-slate-50 text-slate-400';
                      if (present) {
                        bg = late
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                      }
                      if (isToday) {
                        bg += ' ring-2 ring-primary-400 ring-offset-1';
                      }
                      const label =
                        calendarGrid.isSingleEmployee
                          ? dayNum
                          : info?.total
                            ? `${info.presentCount ?? 0}/${info.total}`
                            : dayNum;
                      return (
                        <td key={colIdx} className="p-1">
                          <div
                            className={`rounded-md py-1.5 text-center font-medium ${bg}`}
                            title={
                              info
                                ? `${present ? 'Present' : 'Absent'}${late ? ', Late' : ''}${info.total > 1 ? ` (${info.presentCount}/${info.total})` : ''}`
                                : ''
                            }
                          >
                            {label}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-emerald-200" /> Present
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-amber-200" /> Late
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-slate-200" /> Absent
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-500">
            No shift configured or no data for this month. Add a shift and sync
            device logs to see attendance.
          </div>
        )}
      </section>
    </div>
  );
}
