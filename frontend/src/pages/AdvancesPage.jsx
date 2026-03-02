import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
}));

function currentYear() {
  return new Date().getFullYear();
}

export default function AdvancesPage() {
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [employees, setEmployees] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [localAmounts, setLocalAmounts] = useState({});
  const [localNotes, setLocalNotes] = useState({});
  const [localDates, setLocalDates] = useState({});

  useEffect(() => {
    let isMounted = true;
    authFetch('/api/employees?limit=200', { headers: { 'Content-Type': 'application/json' } })
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
    params.set('month', month);

    authFetch(`/api/advances?${params}`, { headers: { 'Content-Type': 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load advances');
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        const list = Array.isArray(json.data) ? json.data : [];
        setAdvances(list);
        const byEmp = {};
        const notesByEmp = {};
        const datesByEmp = {};
        list.forEach((a) => {
          byEmp[a.employee_id] = a.amount;
          notesByEmp[a.employee_id] = a.note || '';
          datesByEmp[a.employee_id] = a.advance_date || null;
        });
        setLocalAmounts(byEmp);
        setLocalNotes(notesByEmp);
        setLocalDates(datesByEmp);
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to load advances');
          setAdvances([]);
          setLocalAmounts({});
          setLocalNotes({});
          setLocalDates({});
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [year, month]);

  const activeEmployees = employees.filter((e) => e.status === 'active');

  const handleAmountChange = (employeeId, value) => {
    const parsed = value === '' ? '' : Math.max(0, Number(value));
    setLocalAmounts((prev) => ({
      ...prev,
      [employeeId]: parsed === '' ? '' : parsed,
    }));
  };

  const handleNoteChange = (employeeId, value) => {
    setLocalNotes((prev) => ({ ...prev, [employeeId]: value }));
  };

  const saveAdvance = async (employeeId) => {
    const amount = localAmounts[employeeId];
    const numAmount = amount === '' ? 0 : Number(amount);
    const note = localNotes[employeeId] || null;

    setSavingId(employeeId);
    setToast(null);
    try {
      const res = await authFetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          year: Number(year),
          month: Number(month),
          amount: numAmount,
          note: note || undefined,
          advance_date: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to save advance');
      }
      const json = await res.json();
      const rec = json.data;
      setAdvances((prev) => {
        const rest = prev.filter((a) => a.employee_id !== employeeId);
        return [...rest, { ...rec, employee_name: employees.find((e) => e.id === employeeId)?.name, employee_code: employees.find((e) => e.id === employeeId)?.employee_code }].sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''));
      });
      setLocalAmounts((prev) => ({ ...prev, [employeeId]: rec.amount }));
      setLocalNotes((prev) => ({ ...prev, [employeeId]: rec.note || '' }));
      setLocalDates((prev) => ({ ...prev, [employeeId]: rec.advance_date || null }));
      setToast({ type: 'success', message: 'Advance saved with today\'s date. It will be deducted in payroll for this month.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save advance' });
    } finally {
      setSavingId(null);
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

      <header>
        <h1 className="text-lg font-semibold text-slate-900">Salary advances</h1>
        <p className="text-xs text-slate-500">
          Enter advance amounts per staff for a month. These are automatically deducted when you generate payroll for that month.
        </p>
      </header>

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-600">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
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
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
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
              <div key={i} className="h-14 rounded-lg bg-slate-50 animate-pulse" />
            ))}
          </div>
        ) : activeEmployees.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-xs text-slate-500">
            No active employees. Add employees first to record advances.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="pb-2 pr-3 font-medium">Employee</th>
                  <th className="pb-2 pr-3 font-medium w-32 text-right">Advance amount (₹)</th>
                  <th className="pb-2 pr-3 font-medium">Note (optional)</th>
                  <th className="pb-2 pr-3 font-medium w-28">Date saved</th>
                  <th className="pb-2 pr-3 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {activeEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 pr-3">
                      <span className="font-medium text-slate-900">{emp.name}</span>
                      <span className="ml-1 text-slate-500">({emp.employee_code})</span>
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={localAmounts[emp.id] === undefined ? '' : localAmounts[emp.id]}
                        onChange={(e) => handleAmountChange(emp.id, e.target.value)}
                        onBlur={() => saveAdvance(emp.id)}
                        className="w-full max-w-[120px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-slate-800 ml-auto"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={localNotes[emp.id] ?? ''}
                        onChange={(e) => handleNoteChange(emp.id, e.target.value)}
                        onBlur={() => saveAdvance(emp.id)}
                        className="w-full max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800"
                      />
                    </td>
                    <td className="py-3 pr-3 text-slate-600">
                      {localDates[emp.id]
                        ? new Date(localDates[emp.id] + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="py-3 pr-3">
                      <button
                        type="button"
                        onClick={() => saveAdvance(emp.id)}
                        disabled={savingId === emp.id}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {savingId === emp.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 text-[11px] text-slate-600">
        <strong>How it works:</strong> Set the advance amount for each employee for the selected month. When you run &quot;Generate payroll&quot; for that same month, the advance is automatically subtracted from the net salary. You can update amounts here anytime before or after generating payroll; re-running payroll will pick up the latest advance.
      </div>
    </div>
  );
}
