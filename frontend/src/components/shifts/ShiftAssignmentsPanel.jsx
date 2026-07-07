import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../../utils/api';
import { activeEmployeesFromApi, arrayFromApi } from '../../utils/employeesApi';

export default function ShiftAssignmentsPanel({ shifts }) {
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [effectiveShifts, setEffectiveShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [shiftId, setShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [hideAssignedOnTarget, setHideAssignedOnTarget] = useState(true);
  const [moveShiftId, setMoveShiftId] = useState('');
  const [moveIds, setMoveIds] = useState([]);
  const [moving, setMoving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [empRes, assignRes] = await Promise.all([
        authFetch('/api/employees?limit=500'),
        authFetch('/api/shift-rotation/assignments?limit=50'),
      ]);
      if (!empRes.ok) throw new Error('Failed to load employees');
      if (!assignRes.ok) throw new Error('Failed to load assignments');
      const empJson = await empRes.json();
      const assignJson = await assignRes.json();
      setEmployees(activeEmployeesFromApi(empJson));
      setAssignments(arrayFromApi(assignJson));
    } catch (err) {
      setError(err.message || 'Unable to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadEffectiveShifts = useCallback(async (asOf) => {
    if (!asOf) return;
    try {
      setEffectiveLoading(true);
      const res = await authFetch(
        `/api/shift-rotation/assignments/effective-shifts?as_of=${encodeURIComponent(asOf)}`
      );
      if (!res.ok) throw new Error('Failed to load shift roster');
      const json = await res.json();
      setEffectiveShifts(arrayFromApi(json));
    } catch (err) {
      setError(err.message || 'Unable to load shift roster');
      setEffectiveShifts([]);
    } finally {
      setEffectiveLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadEffectiveShifts(effectiveFrom);
  }, [effectiveFrom, loadEffectiveShifts]);

  const effectiveShiftByEmployeeId = useMemo(() => {
    const map = new Map();
    effectiveShifts.forEach((row) => {
      map.set(row.employee_id, row.shift_id);
    });
    return map;
  }, [effectiveShifts]);

  const selectedShift = useMemo(
    () => shifts.find((s) => String(s.id) === String(shiftId)),
    [shifts, shiftId]
  );

  const rosterOnSelectedShift = useMemo(() => {
    if (!shiftId) return [];
    const sid = Number(shiftId);
    return effectiveShifts.filter((row) => Number(row.shift_id) === sid);
  }, [effectiveShifts, shiftId]);

  const employeesForBulkList = useMemo(() => {
    if (!hideAssignedOnTarget || !shiftId) return employees;
    const sid = Number(shiftId);
    return employees.filter(
      (emp) => Number(effectiveShiftByEmployeeId.get(emp.id)) !== sid
    );
  }, [employees, hideAssignedOnTarget, shiftId, effectiveShiftByEmployeeId]);

  const toggleEmployee = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const pool = employeesForBulkList;
    const poolIds = pool.map((e) => e.id);
    const allSelected = poolIds.length > 0 && poolIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !poolIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...poolIds])]);
    }
  };

  const handleMoveOffShift = async (event) => {
    event.preventDefault();
    if (!moveIds.length || !moveShiftId) return;
    try {
      setMoving(true);
      setError(null);
      setSuccess('');
      const res = await authFetch('/api/shift-rotation/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_ids: moveIds,
          shift_id: Number(moveShiftId),
          effective_from: effectiveFrom,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to move employees');
      setSuccess(`Moved ${moveIds.length} employee(s) from ${effectiveFrom}.`);
      setMoveIds([]);
      setMoveShiftId('');
      await Promise.all([load(), loadEffectiveShifts(effectiveFrom)]);
    } catch (err) {
      setError(err.message || 'Failed to move employees');
    } finally {
      setMoving(false);
    }
  };

  const toggleMoveId = (id) => {
    setMoveIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
      await Promise.all([load(), loadEffectiveShifts(effectiveFrom)]);
    } catch (err) {
      setError(err.message || 'Failed to assign shift');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-700">
        <p className="font-medium text-slate-900">What to do here</p>
        <p className="mt-1">
          Select employees not yet on the target shift, choose Day or Night, and set the start date.
          To move someone off a shift, use <strong>Shift details</strong> below and assign them to a
          different shift.
        </p>
      </div>
      <p className="text-xs text-slate-500">
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-700">
              Employees to add
              {shiftId && hideAssignedOnTarget ? (
                <span className="ml-1 font-normal text-slate-500">
                  ({employeesForBulkList.length} not on this shift yet)
                </span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {shiftId && (
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={hideAssignedOnTarget}
                    onChange={(e) => {
                      setHideAssignedOnTarget(e.target.checked);
                      setSelectedIds([]);
                    }}
                  />
                  Hide already on this shift
                </label>
              )}
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] text-blue-600 hover:underline"
              >
                {employeesForBulkList.length > 0 &&
                employeesForBulkList.every((e) => selectedIds.includes(e.id))
                  ? 'Clear all'
                  : 'Select all'}
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
            {loading ? (
              <p className="p-3 text-xs text-slate-500">Loading…</p>
            ) : employeesForBulkList.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">
                {shiftId && hideAssignedOnTarget
                  ? 'Everyone is already on this shift. Uncheck “Hide already on this shift” to see all staff, or use Shift details below to move someone off.'
                  : 'No active employees.'}
              </p>
            ) : (
              employeesForBulkList.map((emp) => (
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

      {shiftId && (
        <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Shift details</h2>
            <p className="text-[11px] text-slate-500">
              {selectedShift?.shift_name || 'Selected shift'} · as of {effectiveFrom}
            </p>
          </div>
          {effectiveLoading ? (
            <p className="mt-2 text-xs text-slate-500">Loading roster…</p>
          ) : rosterOnSelectedShift.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              No employees are assigned to this shift on {effectiveFrom}.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="py-2 pr-2 font-medium w-8" />
                    <th className="py-2 pr-4 font-medium">Employee</th>
                    <th className="py-2 pr-4 font-medium">Department</th>
                    <th className="py-2 font-medium">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterOnSelectedShift.map((row) => (
                    <tr key={row.employee_id} className="border-b border-slate-50">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={moveIds.includes(row.employee_id)}
                          onChange={() => toggleMoveId(row.employee_id)}
                          aria-label={`Select ${row.employee_name} to move`}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        {row.employee_name}
                        <span className="ml-1 text-slate-400">{row.employee_code}</span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{row.department || '—'}</td>
                      <td className="py-2 text-slate-600">
                        {row.effective_from
                          ? String(row.effective_from).slice(0, 10)
                          : 'Default'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rosterOnSelectedShift.length > 0 && (
                <form
                  onSubmit={handleMoveOffShift}
                  className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
                >
                  <p className="w-full text-[11px] text-slate-600">
                    To remove someone from this shift, select them and move to another shift
                    (effective from {effectiveFrom}).
                  </p>
                  <select
                    value={moveShiftId}
                    onChange={(e) => setMoveShiftId(e.target.value)}
                    className="min-w-[180px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    <option value="">Move to shift…</option>
                    {shifts
                      .filter((s) => String(s.id) !== String(shiftId))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.shift_name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="submit"
                    disabled={moving || !moveIds.length || !moveShiftId}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {moving ? 'Moving…' : `Move ${moveIds.length || 0} selected`}
                  </button>
                </form>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                {rosterOnSelectedShift.length} employee
                {rosterOnSelectedShift.length === 1 ? '' : 's'} on this shift.
              </p>
            </div>
          )}
        </section>
      )}

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
