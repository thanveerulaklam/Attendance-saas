import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/api';
import { activeEmployeesFromApi, arrayFromApi } from '../../utils/employeesApi';

export default function ShiftRotationPanel({ shifts }) {
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [rotatingId, setRotatingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    shift_a_id: '',
    shift_b_id: '',
    shift_c_id: '',
    interval_weeks: 2,
    anchor_date: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [groupRes, empRes] = await Promise.all([
        authFetch('/api/shift-rotation/rotation-groups'),
        authFetch('/api/employees?limit=500'),
      ]);
      if (!groupRes.ok) throw new Error('Failed to load rotation groups');
      if (!empRes.ok) throw new Error('Failed to load employees');
      const groupJson = await groupRes.json();
      const empJson = await empRes.json();
      setGroups(arrayFromApi(groupJson));
      setEmployees(activeEmployeesFromApi(empJson));
    } catch (err) {
      setError(err.message || 'Unable to load rotation groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.shift_a_id || !form.shift_b_id) return;
    try {
      setCreating(true);
      setError(null);
      const body = {
        name: form.name.trim(),
        shift_a_id: Number(form.shift_a_id),
        shift_b_id: Number(form.shift_b_id),
        interval_weeks: Number(form.interval_weeks) || 2,
        anchor_date: form.anchor_date,
      };
      if (form.shift_c_id) body.shift_c_id = Number(form.shift_c_id);
      const res = await authFetch('/api/shift-rotation/rotation-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to create group');
      setForm({
        name: '',
        shift_a_id: '',
        shift_b_id: '',
        shift_c_id: '',
        interval_weeks: 2,
        anchor_date: new Date().toISOString().slice(0, 10),
      });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleRotate = async (groupId) => {
    if (!window.confirm('Rotate this group now? Employee shift assignments will update from today.')) {
      return;
    }
    try {
      setRotatingId(groupId);
      setError(null);
      const res = await authFetch(`/api/shift-rotation/rotation-groups/${groupId}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Rotation failed');
      await load();
    } catch (err) {
      setError(err.message || 'Rotation failed');
    } finally {
      setRotatingId(null);
    }
  };

  const updateMemberSlot = async (groupId, employeeId, slot) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const existing = group.members || [];
    const next = existing.some((m) => m.employee_id === employeeId)
      ? existing.map((m) => (m.employee_id === employeeId ? { ...m, slot } : m))
      : [...existing, { employee_id: employeeId, slot }];
    try {
      setError(null);
      const res = await authFetch(`/api/shift-rotation/rotation-groups/${groupId}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: next.map((m) => ({ employee_id: m.employee_id, slot: m.slot })) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to update members');
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update members');
    }
  };

  const addMemberToGroup = async (groupId, employeeId, slot) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group || !employeeId) return;
    const existing = (group.members || []).filter((m) => m.employee_id !== Number(employeeId));
    try {
      setError(null);
      const res = await authFetch(`/api/shift-rotation/rotation-groups/${groupId}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: [
            ...existing.map((m) => ({ employee_id: m.employee_id, slot: m.slot })),
            { employee_id: Number(employeeId), slot },
          ],
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to update members');
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update members');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-700">
        <p className="font-medium text-slate-900">What to do here (optional)</p>
        <p className="mt-1">
          Create a group, link <strong>Shift A</strong> and <strong>Shift B</strong> (your Day and
          Night templates), add employees to slot A or B, and set how many weeks between swaps.
          Use <strong>Rotate now</strong> for an immediate swap, or wait for the next rotation date.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft space-y-3"
      >
        <h2 className="text-sm font-semibold text-slate-900">New rotation group</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Group name (e.g. Production line 1)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={form.shift_a_id}
            onChange={(e) => setForm((p) => ({ ...p, shift_a_id: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Shift A (slot A)</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.shift_name}</option>
            ))}
          </select>
          <select
            value={form.shift_b_id}
            onChange={(e) => setForm((p) => ({ ...p, shift_b_id: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Shift B (slot B)</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.shift_name}</option>
            ))}
          </select>
          <select
            value={form.shift_c_id}
            onChange={(e) => setForm((p) => ({ ...p, shift_c_id: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Shift C (optional)</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.shift_name}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={form.interval_weeks}
            onChange={(e) => setForm((p) => ({ ...p, interval_weeks: e.target.value }))}
            placeholder="Interval (weeks)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.anchor_date}
            onChange={(e) => setForm((p) => ({ ...p, anchor_date: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create group'}
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-slate-500">Loading groups…</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-slate-500">No rotation groups yet.</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.id}
            className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
                <p className="text-[11px] text-slate-500">
                  Every {group.interval_weeks} week(s) · Next rotation:{' '}
                  {String(group.next_rotation_date).slice(0, 10)}
                </p>
                <p className="text-[11px] text-slate-500">
                  A: {group.shift_a_name} · B: {group.shift_b_name}
                  {group.shift_c_name ? ` · C: ${group.shift_c_name}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRotate(group.id)}
                disabled={rotatingId === group.id}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {rotatingId === group.id ? 'Rotating…' : 'Rotate now'}
              </button>
            </div>

            {group.preview?.length > 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <span className="font-medium">After next rotation: </span>
                {group.preview
                  .slice(0, 5)
                  .map((p) => `${p.employee_name} → slot ${p.next_slot}`)
                  .join(' · ')}
                {group.preview.length > 5 ? ` · +${group.preview.length - 5} more` : ''}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[11px] font-medium text-slate-700">Members</p>
              {(group.members || []).length === 0 ? (
                <p className="text-[11px] text-slate-500">No members yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {group.members.map((m) => (
                    <li key={m.employee_id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span>{m.employee_name} ({m.employee_code})</span>
                      <select
                        value={m.slot}
                        onChange={(e) => updateMemberSlot(group.id, m.employee_id, e.target.value)}
                        className="rounded border border-slate-200 px-2 py-1"
                      >
                        <option value="A">Slot A</option>
                        <option value="B">Slot B</option>
                        {group.shift_c_id && <option value="C">Slot C</option>}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <select
                  id={`add-member-${group.id}`}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  defaultValue=""
                >
                  <option value="">Add employee…</option>
                  {employees
                    .filter((e) => !(group.members || []).some((m) => m.employee_id === e.id))
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.employee_code})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const sel = document.getElementById(`add-member-${group.id}`);
                    if (sel?.value) addMemberToGroup(group.id, sel.value, 'A');
                  }}
                  className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  Add to slot A
                </button>
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
