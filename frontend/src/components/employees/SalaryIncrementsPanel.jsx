import { useEffect, useMemo, useState } from 'react';
import { useAutoDismiss } from '../../hooks/useAutoDismiss';
import { authFetch } from '../../utils/api';
import { formatMoneyWithSymbol } from '../../utils/formatMoney';

const PAGE_SIZE = 50;

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function todayLocalYmd() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatYmd(value) {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return String(value);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function salaryKind(type) {
  return type === 'per_day' ? 'Daily salary' : 'Monthly basic';
}

function sourceLabel(source) {
  if (source === 'employee_form') return 'Employee profile';
  return 'Salary increments';
}

function formatSignedMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const formatted = formatMoneyWithSymbol(Math.abs(n), currency);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

function previewChange(current, mode, amount) {
  const currentNum = roundMoney(current);
  const entered = roundMoney(amount);
  if (currentNum == null) return { error: 'Current salary is unavailable.' };
  if (entered == null) return { error: '' };
  if (mode === 'set') {
    if (!(entered > 0)) return { error: 'New salary must be greater than zero.' };
    if (entered === currentNum) {
      return { error: 'New salary is the same as the current basic salary.' };
    }
    return { next: entered, delta: roundMoney(entered - currentNum) };
  }
  if (!(entered > 0)) return { error: 'Enter an amount greater than zero.' };
  const next = mode === 'decrease'
    ? roundMoney(currentNum - entered)
    : roundMoney(currentNum + entered);
  if (!(next > 0)) return { error: 'Salary must stay greater than zero.' };
  return { next, delta: roundMoney(next - currentNum) };
}

export default function SalaryIncrementsPanel() {
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [mode, setMode] = useState('increase');
  const [amount, setAmount] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayLocalYmd);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useAutoDismiss('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fmt = (value) => formatMoneyWithSymbol(value, currency);

  useEffect(() => {
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setCurrency(json?.data?.currency || 'INR'))
      .catch(() => setCurrency('INR'));
  }, []);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setListError('');
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const res = await authFetch(`/api/salary-increments?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load employees');
      setEmployees(json.data?.data || []);
      setTotal(json.data?.total || 0);
    } catch (err) {
      setListError(err.message || 'Unable to load employees');
      setEmployees([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status]);

  const loadHistory = async (employeeId) => {
    if (!employeeId) return;
    try {
      setDetailLoading(true);
      setDetailError('');
      const res = await authFetch(`/api/salary-increments/${employeeId}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load salary history');
      setDetail(json.data || null);
    } catch (err) {
      setDetail(null);
      setDetailError(err.message || 'Unable to load salary history');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setMode('increase');
    setAmount('');
    setNotes('');
    setEffectiveDate(todayLocalYmd());
    setFormError('');
    setFormSuccess('');
    loadHistory(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const employee = detail?.employee || null;
  const increments = detail?.increments || [];
  const preview = useMemo(
    () => (employee ? previewChange(employee.basic_salary, mode, amount) : null),
    [employee, mode, amount]
  );

  const handleSave = async (event) => {
    event.preventDefault();
    if (!employee || saving) return;
    if (!preview || preview.error || preview.next == null) {
      setFormError(preview?.error || 'Enter a salary change.');
      setFormSuccess('');
      return;
    }
    try {
      setSaving(true);
      setFormError('');
      setFormSuccess('');
      const body = {
        employee_id: employee.id,
        effective_date: effectiveDate,
        notes: notes.trim(),
      };
      if (mode === 'set') body.new_salary = preview.next;
      else body.change_amount = preview.delta;

      const res = await authFetch('/api/salary-increments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update salary');

      setAmount('');
      setNotes('');
      setFormSuccess(
        `Basic salary updated to ${fmt(json.data?.employee?.basic_salary ?? preview.next)}.`
      );
      await Promise.all([loadEmployees(), loadHistory(employee.id)]);
    } catch (err) {
      setFormError(err.message || 'Failed to update salary');
    } finally {
      setSaving(false);
    }
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
      <section className="rounded-xl border border-slate-100 bg-white px-4 py-5 shadow-soft lg:col-span-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block w-full text-[11px] font-medium text-slate-600 sm:max-w-xs">
            Search employees
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search by name or code"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">Status</span>
            <div className="inline-flex rounded-full bg-slate-100 p-0.5">
              {[
                { value: 'active', label: 'Active' },
                { value: 'all', label: 'All' },
                { value: 'inactive', label: 'Inactive' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setStatus(option.value);
                  }}
                  className={`rounded-full px-3 py-1 font-medium ${
                    status === option.value
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {listError && (
          <div className="mt-4 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {listError}
          </div>
        )}

        <div className="mt-4 max-h-[calc(100vh-18rem)] overflow-auto">
          <table className="min-w-[640px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="bg-white pb-3 pr-4 font-medium">Employee</th>
                <th className="bg-white pb-3 pr-4 font-medium">Current basic</th>
                <th className="bg-white pb-3 font-medium">Last change</th>
              </tr>
            </thead>
            <tbody>
              {loading && employees.length === 0
                ? Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-3 pr-4" colSpan={3}>
                      <span className="inline-block h-4 w-48 rounded bg-slate-100 animate-pulse" />
                    </td>
                  </tr>
                ))
                : null}
              {!loading && employees.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-xs text-slate-500">
                    No employees match this search.
                  </td>
                </tr>
              ) : null}
              {employees.map((row) => {
                const selected = selectedId === row.id;
                const lastAmount = row.last_change_amount;
                const increased = Number(lastAmount) > 0;
                const decreased = Number(lastAmount) < 0;
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => setSelectedId(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedId(row.id);
                      }
                    }}
                    className={`cursor-pointer ${selected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'}`}
                  >
                    <td className="border-b border-slate-100 py-3 pr-4">
                      <span className="block font-medium text-slate-900">{row.name || '—'}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {row.employee_code || '—'}
                        {row.department ? ` · ${row.department}` : ''}
                        {row.status && row.status !== 'active' ? ` · ${row.status}` : ''}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 py-3 pr-4">
                      <span className="block tabular-nums font-medium text-slate-800">
                        {fmt(row.basic_salary)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {salaryKind(row.salary_type)}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 py-3">
                      {lastAmount == null ? (
                        <span className="text-xs text-slate-400">No changes yet</span>
                      ) : (
                        <>
                          <span
                            className={`block tabular-nums text-xs font-medium ${
                              increased
                                ? 'text-emerald-700'
                                : decreased
                                  ? 'text-rose-700'
                                  : 'text-slate-700'
                            }`}
                          >
                            {formatSignedMoney(lastAmount, currency)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {formatYmd(row.last_effective_date)}
                            {Number(row.increment_count) > 1
                              ? ` · ${row.increment_count} changes`
                              : ''}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <p>
            {total === 0
              ? '0 employees'
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </p>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => canPrev && setPage((p) => p - 1)}
              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => canNext && setPage((p) => p + 1)}
              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <aside className="rounded-xl border border-slate-100 bg-white px-4 py-5 shadow-soft sm:px-5 lg:sticky lg:top-4 lg:col-span-2 lg:max-h-[calc(100vh-6.5rem)] lg:self-start lg:overflow-y-auto">
        {!selectedId ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
            <h2 className="text-sm font-semibold text-slate-900">Salary history</h2>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Select an employee to see every increase or decrease, and to change their current basic salary.
            </p>
          </div>
        ) : detailLoading && !employee ? (
          <div className="space-y-3">
            <span className="inline-block h-4 w-40 rounded bg-slate-100 animate-pulse" />
            <span className="inline-block h-4 w-24 rounded bg-slate-100 animate-pulse" />
          </div>
        ) : detailError ? (
          <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {detailError}
          </div>
        ) : employee ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{employee.name}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {employee.employee_code || '—'}
                {employee.department ? ` · ${employee.department}` : ''}
                {' · '}
                {salaryKind(employee.salary_type)}
              </p>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Current basic
              </p>
              <p className="text-xl font-semibold tabular-nums text-slate-900">
                {fmt(employee.basic_salary)}
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-xs font-medium text-slate-800">Adjust salary</p>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-white p-1">
                {[
                  { id: 'increase', label: 'Increase' },
                  { id: 'decrease', label: 'Decrease' },
                  { id: 'set', label: 'Set amount' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setMode(option.id);
                      setFormError('');
                      setFormSuccess('');
                    }}
                    className={`rounded-md px-2 py-1.5 text-[11px] font-medium ${
                      mode === option.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="block text-[11px] font-medium text-slate-600">
                {mode === 'set' ? 'New basic salary' : mode === 'decrease' ? 'Decrease by' : 'Increase by'}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setFormError('');
                    setFormSuccess('');
                  }}
                  placeholder={mode === 'set' ? '45000' : '5000'}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>

              <label className="block text-[11px] font-medium text-slate-600">
                Effective date
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>

              <label className="block text-[11px] font-medium text-slate-600">
                Note
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Annual revision, promotion, correction"
                  className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>

              {amount.trim() && preview?.next != null && !preview.error ? (
                <p className="text-[11px] text-slate-600">
                  {fmt(employee.basic_salary)} → <span className="font-semibold text-slate-900">{fmt(preview.next)}</span>
                  {' '}
                  <span className={preview.delta > 0 ? 'font-medium text-emerald-700' : 'font-medium text-rose-700'}>
                    ({formatSignedMoney(preview.delta, currency)})
                  </span>
                </p>
              ) : null}
              {amount.trim() && preview?.error ? (
                <p className="text-[11px] text-rose-600">{preview.error}</p>
              ) : null}
              {formError ? <p className="text-[11px] text-rose-600">{formError}</p> : null}
              {formSuccess ? <p className="text-[11px] text-emerald-700">{formSuccess}</p> : null}

              <p className="text-[11px] leading-relaxed text-slate-500">
                This updates the current basic salary used for future payroll. The date and amount are kept in the history. Past payslips stay as they were.
              </p>

              <button
                type="submit"
                disabled={saving || !amount.trim() || Boolean(preview?.error)}
                className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save salary change'}
              </button>
            </form>

            <div>
              <h3 className="text-xs font-semibold text-slate-900">History</h3>
              {increments.length === 0 ? (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  No salary changes recorded yet. Current basic is {fmt(employee.basic_salary)}.
                  Edits made from the employee profile are included here too.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {increments.map((entry) => {
                    const delta = Number(entry.change_amount);
                    return (
                      <li key={entry.id} className="rounded-lg border border-slate-100 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-medium text-slate-500">
                              Effective {formatYmd(entry.effective_date)}
                            </p>
                            <p className="mt-1 text-xs tabular-nums text-slate-700">
                              {fmt(entry.previous_salary)} → <span className="font-semibold text-slate-900">{fmt(entry.new_salary)}</span>
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-xs font-semibold tabular-nums ${
                              delta > 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {formatSignedMoney(entry.change_amount, currency)}
                          </span>
                        </div>
                        {entry.notes ? (
                          <p className="mt-2 text-[11px] text-slate-600">{entry.notes}</p>
                        ) : null}
                        <p className="mt-2 text-[10px] text-slate-400">
                          {sourceLabel(entry.source)}
                          {entry.created_by_name ? ` · ${entry.created_by_name}` : ''}
                          {' · '}
                          {formatTimestamp(entry.created_at)}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
