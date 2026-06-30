import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/api';
import { activeEmployeesFromApi, arrayFromApi } from '../../utils/employeesApi';

function shiftNameForSlot(group, slot) {
  if (slot === 'A') return group.shift_a_name || 'Shift 1';
  if (slot === 'B') return group.shift_b_name || 'Shift 2';
  if (slot === 'C') return group.shift_c_name || 'Shift 3';
  return slot;
}

function shiftNameFromList(shifts, id) {
  if (!id) return null;
  return shifts.find((s) => String(s.id) === String(id))?.shift_name;
}

export default function ShiftRotationPanel({ shifts }) {
  const [groups, setGroups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [rotatingId, setRotatingId] = useState(null);
  const [importingId, setImportingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [success, setSuccess] = useState('');
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
      setSuccess('');
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

  const handleImport = async (group) => {
    const asOf = new Date().toISOString().slice(0, 10);
    const shiftList = [group.shift_a_name, group.shift_b_name, group.shift_c_name]
      .filter(Boolean)
      .join(' or ');
    const hasMembers = (group.members || []).length > 0;
    const message = hasMembers
      ? `Replace members in "${group.name}" with everyone currently assigned to ${shiftList} as of ${asOf}?`
      : `Import everyone currently assigned to ${shiftList} as of ${asOf} into "${group.name}"?`;
    if (!window.confirm(message)) return;

    try {
      setImportingId(group.id);
      setError(null);
      setSuccess('');
      const res = await authFetch(`/api/shift-rotation/rotation-groups/${group.id}/import-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ as_of: asOf }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Import failed');
      const result = json.data || {};
      const parts = [
        `${result.imported ?? 0} employee(s) imported`,
        group.shift_a_name ? `${result.by_slot?.A ?? 0} on ${group.shift_a_name}` : null,
        group.shift_b_name ? `${result.by_slot?.B ?? 0} on ${group.shift_b_name}` : null,
        group.shift_c_name ? `${result.by_slot?.C ?? 0} on ${group.shift_c_name}` : null,
      ].filter(Boolean);
      setSuccess(parts.join(' · '));
      await load();
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setImportingId(null);
    }
  };

  const handleDelete = async (group) => {
    const label = group.name || 'this rotation group';
    if (
      !window.confirm(
        `Delete "${label}"? Members stay on their current shifts; only the automatic rotation schedule is removed.`
      )
    ) {
      return;
    }
    try {
      setDeletingId(group.id);
      setError(null);
      const res = await authFetch(`/api/shift-rotation/rotation-groups/${group.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete group');
      }
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete group');
    } finally {
      setDeletingId(null);
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
          Pick the shifts that swap (e.g. Day and Night), then use{' '}
          <strong>Import from assignments</strong> to pull in everyone already on those shifts from
          the Assignments tab. Set how many weeks between swaps, then use <strong>Rotate now</strong>{' '}
          for an immediate swap or wait for the next rotation date.
        </p>
      </div>

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
        onSubmit={handleCreate}
        className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft space-y-3"
      >
        <h2 className="text-sm font-semibold text-slate-900">New rotation group</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Group name (e.g. Production line 1)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              First shift in rotation
            </label>
            <select
              value={form.shift_a_id}
              onChange={(e) => setForm((p) => ({ ...p, shift_a_id: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select shift…</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.shift_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              Second shift in rotation
            </label>
            <select
              value={form.shift_b_id}
              onChange={(e) => setForm((p) => ({ ...p, shift_b_id: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select shift…</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.shift_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              Third shift (optional)
            </label>
            <select
              value={form.shift_c_id}
              onChange={(e) => setForm((p) => ({ ...p, shift_c_id: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.shift_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              Swap every (weeks)
            </label>
            <input
              type="number"
              min={1}
              value={form.interval_weeks}
              onChange={(e) => setForm((p) => ({ ...p, interval_weeks: e.target.value }))}
              placeholder="2"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              Rotation start date
            </label>
            <input
              type="date"
              value={form.anchor_date}
              onChange={(e) => setForm((p) => ({ ...p, anchor_date: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {form.shift_a_id && form.shift_b_id && (
          <p className="text-[11px] text-slate-600">
            Employees swap between{' '}
            <strong>{shiftNameFromList(shifts, form.shift_a_id)}</strong> and{' '}
            <strong>{shiftNameFromList(shifts, form.shift_b_id)}</strong>
            {form.shift_c_id ? (
              <>
                {' '}
                (and <strong>{shiftNameFromList(shifts, form.shift_c_id)}</strong> if 3-way)
              </>
            ) : null}{' '}
            every {form.interval_weeks || 2} week(s).
          </p>
        )}
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
                  Rotates: {group.shift_a_name} ↔ {group.shift_b_name}
                  {group.shift_c_name ? ` ↔ ${group.shift_c_name}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRotate(group.id)}
                  disabled={rotatingId === group.id || deletingId === group.id}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {rotatingId === group.id ? 'Rotating…' : 'Rotate now'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(group)}
                  disabled={deletingId === group.id || rotatingId === group.id}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  {deletingId === group.id ? 'Deleting…' : 'Delete group'}
                </button>
              </div>
            </div>

            {group.preview?.length > 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                <span className="font-medium">After next rotation: </span>
                {group.preview
                  .slice(0, 5)
                  .map((p) => `${p.employee_name} → ${shiftNameForSlot(group, p.next_slot)}`)
                  .join(' · ')}
                {group.preview.length > 5 ? ` · +${group.preview.length - 5} more` : ''}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
                  <span>Members</span>
                  <span className="font-normal text-slate-500">Current shift</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleImport(group)}
                  disabled={
                    importingId === group.id || rotatingId === group.id || deletingId === group.id
                  }
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {importingId === group.id ? 'Importing…' : 'Import from assignments'}
                </button>
              </div>
              {(group.members || []).length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No members yet. Use <strong>Import from assignments</strong> after assigning staff
                  on the Assignments tab, or add employees manually below.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {group.members.map((m) => (
                    <li key={m.employee_id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span>{m.employee_name} ({m.employee_code})</span>
                      <select
                        value={m.slot}
                        onChange={(e) => updateMemberSlot(group.id, m.employee_id, e.target.value)}
                        className="rounded border border-slate-200 px-2 py-1"
                        aria-label={`Current shift for ${m.employee_name}`}
                      >
                        <option value="A">{group.shift_a_name}</option>
                        <option value="B">{group.shift_b_name}</option>
                        {group.shift_c_id && (
                          <option value="C">{group.shift_c_name}</option>
                        )}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  id={`add-member-${group.id}`}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs min-w-[160px]"
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
                  className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  Add to {group.shift_a_name || 'shift 1'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sel = document.getElementById(`add-member-${group.id}`);
                    if (sel?.value) addMemberToGroup(group.id, sel.value, 'B');
                  }}
                  className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  Add to {group.shift_b_name || 'shift 2'}
                </button>
                {group.shift_c_id && (
                  <button
                    type="button"
                    onClick={() => {
                      const sel = document.getElementById(`add-member-${group.id}`);
                      if (sel?.value) addMemberToGroup(group.id, sel.value, 'C');
                    }}
                    className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    Add to {group.shift_c_name || 'shift 3'}
                  </button>
                )}
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
