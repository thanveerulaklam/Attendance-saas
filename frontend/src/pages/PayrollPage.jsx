import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';
import { getSubscriptionStatus } from '../utils/subscription';

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

export default function PayrollPage() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    year: currentYear(),
    month: String(new Date().getMonth() + 1),
    includeOvertime: true,
    treatHolidayAdjacentAbsenceAsWorking: false,
  });
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState(null);
  const [company, setCompany] = useState(null);

  const subscription = getSubscriptionStatus(company);
  const subscriptionAllowed = subscription.allowed;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
    params.set('year', String(year));
    if (month) params.set('month', month);
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (employeeId) params.set('employee_id', employeeId);

    authFetch(`/api/payroll?${params}`, {
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
  }, [year, month, page, employeeId]);

  const activeCount = employees.filter((e) => e.status === 'active').length;

  const handleGenerateAll = async (e) => {
    e.preventDefault();
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
          treat_holiday_adjacent_absence_as_working: generateForm.treatHolidayAdjacentAbsenceAsWorking === true,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.code === 'SUBSCRIPTION_EXPIRED' ? errData.message : (errData.message || 'Failed to generate payroll');
        throw new Error(msg);
      }
      const json = await res.json();
      const data = json.data || {};
      const generated = data.generated ?? 0;
      const failed = data.failed ?? 0;
      setModalOpen(false);
      const successMsg =
        failed > 0
          ? `Payroll generated for ${generated} employees. ${failed} failed.`
          : `Payroll generated for ${generated} employee${generated !== 1 ? 's' : ''}.`;
      setToast({ type: 'success', message: successMsg });
      setPage(1);
      setYear(Number(y));
      setMonth(m);
      setEmployeeId('');
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to generate payroll' });
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
            <label className="text-[11px] font-medium text-slate-600">Year</label>
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
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
              onChange={(e) => { setMonth(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
            >
              {MONTHS.map((m) => (
                <option key={m.value || 'all'} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
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
                    <th className="pb-2 pr-3 font-medium">Employee</th>
                    <th className="pb-2 pr-3 font-medium">Period</th>
                    <th className="pb-2 pr-3 font-medium text-right">Present</th>
                    <th className="pb-2 pr-3 font-medium text-right">Overtime (hrs)</th>
                    <th className="pb-2 pr-3 font-medium text-right">Gross</th>
                    <th className="pb-2 pr-3 font-medium text-right">Deductions</th>
                    <th className="pb-2 pr-3 font-medium text-right">Net salary</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-3 pr-3">
                        <span className="font-medium text-slate-900">{row.employee_name}</span>
                        <span className="ml-1 text-slate-500">({row.employee_code})</span>
                      </td>
                      <td className="py-3 pr-3 text-slate-700">
                        {new Date(row.year, row.month - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })}
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
                        {formatMoney(row.gross_salary)}
                      </td>
                      <td className="py-3 pr-3 text-right text-amber-700 font-medium">
                        −{formatMoney(row.deductions)}
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
            <h2 className="text-sm font-semibold text-slate-900">Generate payroll for all</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {activeCount > 0
                ? `Create or update payroll for all ${activeCount} active employees for the selected month. Uses current attendance data.`
                : 'No active employees. Add active employees to generate payroll.'}
            </p>
            <form onSubmit={handleGenerateAll} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Year</label>
                  <select
                    value={generateForm.year}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, year: e.target.value }))}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                  >
                    {[currentYear(), currentYear() - 1].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-700">Month</label>
                  <select
                    value={generateForm.month}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, month: e.target.value }))}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
                  >
                    {MONTHS.filter((m) => m.value).map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateForm.includeOvertime}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, includeOvertime: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-700">Include overtime in pay</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generateForm.treatHolidayAdjacentAbsenceAsWorking}
                    onChange={(e) => setGenerateForm((f) => ({ ...f, treatHolidayAdjacentAbsenceAsWorking: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-700">Treat holiday as working day when adjacent day is absent</span>
                </label>
                <p className="text-[10px] text-slate-500">
                  If enabled, e.g. Sunday is holiday and staff is absent Monday, both Sunday and Monday count as absent (2 days).
                </p>
              </div>
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
                  {generating ? 'Generating...' : 'Generate for all'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
