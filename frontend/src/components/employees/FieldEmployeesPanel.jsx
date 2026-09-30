import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../../utils/api';

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyCreateForm() {
  return {
    name: '',
    employee_code: '',
    email: '',
    password: '',
    basic_salary: '',
    join_date: todayYmd(),
    site_ids: [],
    also_device: false,
  };
}

function draftFor(employee, drafts) {
  return drafts[employee.id] || { email: employee.app_email || '', password: '' };
}

export default function FieldEmployeesPanel({ sites, canManage, setToast }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [loginDrafts, setLoginDrafts] = useState({});
  const [openLoginId, setOpenLoginId] = useState(null);

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/company/field-employees');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load employees');
      setEmployees(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to load employees' });
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((emp) => {
      const hay = `${emp.name || ''} ${emp.employee_code || ''} ${emp.app_email || ''} ${emp.department || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [employees, search]);

  const toggleCreateSite = (siteId, checked) => {
    setCreateForm((prev) => {
      const id = Number(siteId);
      const next = checked
        ? [...new Set([...prev.site_ids, id])]
        : prev.site_ids.filter((value) => value !== id);
      return { ...prev, site_ids: next };
    });
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!canManage || creating) return;
    try {
      setCreating(true);
      const res = await authFetch('/api/company/field-employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          employee_code: createForm.employee_code.trim() || undefined,
          email: createForm.email.trim(),
          password: createForm.password,
          basic_salary: Number(createForm.basic_salary),
          join_date: createForm.join_date,
          site_ids: createForm.site_ids,
          attendance_channel: createForm.also_device ? 'both' : 'mobile',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to add field employee');
      setToast({
        type: 'success',
        message: `${json.data?.name || 'Employee'} can now log in to PunchPay Field.`,
      });
      setCreateForm(emptyCreateForm());
      setShowCreate(false);
      await loadEmployees();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to add field employee' });
    } finally {
      setCreating(false);
    }
  };

  const saveSites = async (employee, siteIds) => {
    const res = await authFetch(`/api/employees/${employee.id}/field-sites`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_ids: siteIds }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to save sites');

    const needsChannel =
      siteIds.length > 0 &&
      employee.attendance_channel !== 'mobile' &&
      employee.attendance_channel !== 'both';
    if (needsChannel) {
      const channelRes = await authFetch(`/api/employees/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_channel: 'both' }),
      });
      const channelJson = await channelRes.json().catch(() => ({}));
      if (!channelRes.ok) throw new Error(channelJson.message || 'Failed to update attendance channel');
    }

    return {
      field_site_ids: (json.data?.site_ids || siteIds).map(Number),
      field_site_names: (json.data?.sites || []).map((site) => site.name),
      attendance_channel: needsChannel ? 'both' : employee.attendance_channel,
    };
  };

  const handleToggleSite = async (employee, siteId, checked) => {
    if (!canManage || savingId) return;
    const id = Number(siteId);
    const nextIds = checked
      ? [...new Set([...(employee.field_site_ids || []), id])]
      : (employee.field_site_ids || []).filter((value) => Number(value) !== id);
    try {
      setSavingId(employee.id);
      const patch = await saveSites(employee, nextIds);
      setEmployees((prev) =>
        prev.map((row) => (row.id === employee.id ? { ...row, ...patch } : row))
      );
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save sites' });
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveLogin = async (employee) => {
    if (!canManage || savingId) return;
    const draft = draftFor(employee, loginDrafts);
    try {
      setSavingId(employee.id);
      const res = await authFetch(`/api/employees/${employee.id}/app-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: draft.email.trim(),
          password: draft.password,
          name: employee.name,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to save app login');
      setEmployees((prev) =>
        prev.map((row) =>
          row.id === employee.id ? { ...row, app_email: json.data?.email || draft.email.trim() } : row
        )
      );
      setLoginDrafts((prev) => ({
        ...prev,
        [employee.id]: { email: json.data?.email || draft.email.trim(), password: '' },
      }));
      setToast({
        type: 'success',
        message: json.message || `Login saved for ${employee.name}.`,
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save app login' });
    } finally {
      setSavingId(null);
    }
  };

  const handleRevokeLogin = async (employee) => {
    if (!canManage || savingId) return;
    const ok = window.confirm(`Remove PunchPay Field login for ${employee.name}?`);
    if (!ok) return;
    try {
      setSavingId(employee.id);
      const res = await authFetch(`/api/employees/${employee.id}/app-access`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to revoke login');
      setEmployees((prev) =>
        prev.map((row) => (row.id === employee.id ? { ...row, app_email: null } : row))
      );
      setLoginDrafts((prev) => ({
        ...prev,
        [employee.id]: { email: '', password: '' },
      }));
      setToast({ type: 'success', message: `Login removed for ${employee.name}.` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to revoke login' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Field employees</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Assign sites and create an email/password for PunchPay Field. New people are added to{' '}
            <Link to="/employees" className="font-medium text-primary-600 hover:underline">
              Employees
            </Link>{' '}
            as well.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate((open) => !open)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            {showCreate ? 'Close' : 'Add field employee'}
          </button>
        )}
      </div>

      {canManage && showCreate && (
        <form onSubmit={handleCreate} className="mt-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
          <p className="text-xs font-medium text-slate-800">New field employee</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-600">
              Name
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-slate-600">
              Employee code
              <input
                value={createForm.employee_code}
                onChange={(e) => setCreateForm((p) => ({ ...p, employee_code: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Leave blank to auto-assign"
              />
            </label>
            <label className="text-xs text-slate-600">
              Field app email
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="employee@company.com"
                required
              />
            </label>
            <label className="text-xs text-slate-600">
              Field app password
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Min 6 characters"
                required
                minLength={6}
              />
            </label>
            <label className="text-xs text-slate-600">
              Basic salary
              <input
                type="number"
                min="1"
                step="0.01"
                value={createForm.basic_salary}
                onChange={(e) => setCreateForm((p) => ({ ...p, basic_salary: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-slate-600">
              Join date
              <input
                type="date"
                value={createForm.join_date}
                onChange={(e) => setCreateForm((p) => ({ ...p, join_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
            </label>
          </div>
          <div>
            <p className="text-xs text-slate-600">Assign sites</p>
            {sites.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">Create a field site above first.</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-2">
                {sites.map((site) => (
                  <label
                    key={site.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={createForm.site_ids.includes(Number(site.id))}
                      onChange={(e) => toggleCreateSite(site.id, e.target.checked)}
                    />
                    {site.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={createForm.also_device}
              onChange={(e) => setCreateForm((p) => ({ ...p, also_device: e.target.checked }))}
            />
            Also punch on biometric / office kiosk
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? 'Saving…' : 'Create employee and login'}
          </button>
        </form>
      )}

      <div className="mt-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-xs"
        />
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-500">Loading employees…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          {employees.length === 0
            ? 'No active employees yet. Add a field employee above, or create one on the Employees page.'
            : 'No employees match that search.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {filtered.map((emp) => {
            const draft = draftFor(emp, loginDrafts);
            const loginOpen = openLoginId === emp.id || !emp.app_email;
            const ready = Boolean(emp.app_email) && (emp.field_site_ids || []).length > 0;
            return (
              <li key={emp.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {emp.name}
                      <span className="ml-1 text-[11px] font-normal text-slate-500">
                        {emp.employee_code}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {emp.app_email ? (
                        <span className="text-emerald-700">Login: {emp.app_email}</span>
                      ) : (
                        <span className="text-amber-700">No Field login</span>
                      )}
                      {' · '}
                      {(emp.field_site_ids || []).length > 0
                        ? emp.field_site_names.join(', ')
                        : 'No site assigned'}
                      {ready ? ' · Ready for PunchPay Field' : ''}
                    </p>
                  </div>
                  {canManage && emp.app_email && (
                    <button
                      type="button"
                      onClick={() => setOpenLoginId((id) => (id === emp.id ? null : emp.id))}
                      className="text-[11px] font-medium text-primary-700"
                    >
                      {openLoginId === emp.id ? 'Hide login' : 'Update login'}
                    </button>
                  )}
                </div>

                {sites.length === 0 ? (
                  <p className="mt-2 text-[11px] text-slate-500">Create a site to assign this employee.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sites.map((site) => (
                      <label
                        key={`${emp.id}-${site.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
                          (emp.field_site_ids || []).includes(Number(site.id))
                            ? 'border-sky-200 bg-sky-50 text-sky-900'
                            : 'border-slate-200 bg-white text-slate-700'
                        } ${!canManage || savingId ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={(emp.field_site_ids || []).includes(Number(site.id))}
                          onChange={(e) => handleToggleSite(emp, site.id, e.target.checked)}
                          disabled={!canManage || savingId === emp.id}
                        />
                        {site.name}
                      </label>
                    ))}
                  </div>
                )}

                {canManage && loginOpen && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="text-[11px] text-slate-600">
                      Email
                      <input
                        type="email"
                        value={draft.email}
                        onChange={(e) =>
                          setLoginDrafts((prev) => ({
                            ...prev,
                            [emp.id]: { ...draft, email: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                        placeholder="employee@company.com"
                      />
                    </label>
                    <label className="text-[11px] text-slate-600">
                      Password
                      <input
                        type="password"
                        value={draft.password}
                        onChange={(e) =>
                          setLoginDrafts((prev) => ({
                            ...prev,
                            [emp.id]: { ...draft, password: e.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                        placeholder={emp.app_email ? 'New password' : 'Min 6 characters'}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveLogin(emp)}
                        disabled={savingId === emp.id}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                      >
                        {savingId === emp.id ? 'Saving…' : emp.app_email ? 'Update login' : 'Create login'}
                      </button>
                      {emp.app_email && (
                        <button
                          type="button"
                          onClick={() => handleRevokeLogin(emp)}
                          disabled={savingId === emp.id}
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-medium text-rose-700"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
