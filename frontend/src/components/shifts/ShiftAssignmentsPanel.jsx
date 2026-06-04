import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../../utils/api';

export default function ShiftAssignmentsPanel({ shifts }) {
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [shiftId, setShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [empRes, assignRes] = await Promise.all([
        authFetch('/api/employees?limit=500&status=active'),
        authFetch('/api/shift-rotation/assignments?limit=50'),
      ]);
      if (!empRes.ok) throw new Error('Failed to load employees');
      if (!assignRes.ok) throw new Error('Failed to load assignments');
      const empJson = await empRes.json();
      const assignJson = await assignRes.json();
      setEmployees((empJson.data || []).filter((e) => e.status === 'active'));
      setAssignments(assignJson.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleEmployee = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === employees.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(employees.map((e) => e.id));
    }
  };

  const handleAssign = async (event) => {
    event.preventDefault();
    if (!selectedIds.length || !shiftId) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess('');
      const res = await authFetch('/api/shift-rotation/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_ids: selectedIds,
          shift_id: Number(shiftId),
          effective_from: effectiveFrom,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to assign shift');
      setSuccess(`Assigned ${selectedIds.length} employee(s) from ${effectiveFrom}.`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to assign shift');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Move employees between day and night shifts with an effective date.{' '}
        <Link to="/settings/company" className="text-blue-600 hover:underline">
          Factory mode settings
        </Link>
      </p>

      {error && (
        <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
          {success}
        </div>
      )}

      <form
        onSubmit={handleAssign}
        className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft space-y-4"
      >
        <h2 className="text-sm font-semibold text-slate-900">Bulk assign shift</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700">Target shift</label>
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shift_name} ({String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700">Effective from</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || !selectedIds.length || !shiftId}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Assigning…' : `Assign ${selectedIds.length || 0} selected`}
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-700">Employees</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] text-blue-600 hover:underline"
            >
              {selectedIds.length === employees.length ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
            {loading ? (
              <p className="p-3 text-xs text-slate-500">Loading…</p>
            ) : employees.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">No active employees.</p>
            ) : (
              employees.map((emp) => (
                <label
                  key={emp.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(emp.id)}
                    onChange={() => toggleEmployee(emp.id)}
                  />
                  <span className="font-medium text-slate-800">{emp.name}</span>
                  <span className="text-slate-400">{emp.employee_code}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </form>

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Recent changes</h2>
        {loading ? (
          <p className="mt-2 text-xs text-slate-500">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No assignments yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Shift</th>
                  <th className="py-2 pr-4 font-medium">From</th>
                  <th className="py-2 pr-4 font-medium">To</th>
                  <th className="py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4">
                      {row.employee_name}
                      <span className="ml-1 text-slate-400">{row.employee_code}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {row.previous_shift_name ? (
                        <span>
                          {row.previous_shift_name} → <strong>{row.shift_name}</strong>
                        </span>
                      ) : (
                        row.shift_name
                      )}
                    </td>
                    <td className="py-2 pr-4">{String(row.effective_from).slice(0, 10)}</td>
                    <td className="py-2 pr-4">
                      {row.effective_to ? String(row.effective_to).slice(0, 10) : '—'}
                    </td>
                    <td className="py-2 capitalize">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
