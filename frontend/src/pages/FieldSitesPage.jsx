import { useCallback, useEffect, useState } from 'react';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import { Link } from 'react-router-dom';
import { authFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import FieldEmployeesPanel from '../components/employees/FieldEmployeesPanel';
import SiteLocationMap from '../components/field/SiteLocationMap';

const DEFAULT_RADIUS = 200;

function emptyForm() {
  return {
    name: '',
    latitude: '',
    longitude: '',
    radius_m: String(DEFAULT_RADIUS),
  };
}

export default function FieldSitesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManageEmployees = isAdmin || user?.role === 'hr';
  const [enabled, setEnabled] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useAutoDismiss(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [companyRes, sitesRes] = await Promise.all([
        authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } }),
        authFetch('/api/company/field-sites'),
      ]);
      const companyJson = await companyRes.json().catch(() => ({}));
      const sitesJson = await sitesRes.json().catch(() => ({}));
      if (companyRes.ok) {
        setEnabled(Boolean(companyJson.data?.field_attendance_enabled));
      }
      if (!sitesRes.ok) {
        throw new Error(sitesJson.message || 'Failed to load field sites');
      }
      setSites(Array.isArray(sitesJson.data) ? sitesJson.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load field sites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (nextEnabled) => {
    if (!isAdmin) return;
    if (!nextEnabled && enabled) {
      const ok = window.confirm(
        'Turn off field attendance? Employees will no longer be able to punch from PunchPay Field. Office kiosk and biometric punches are not affected.'
      );
      if (!ok) return;
    }
    try {
      setSavingFlag(true);
      setToast(null);
      const res = await authFetch('/api/company/field-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_attendance_enabled: nextEnabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to save');
      setEnabled(Boolean(json.data?.field_attendance_enabled));
      setToast({
        type: 'success',
        message: nextEnabled ? 'Field attendance enabled.' : 'Field attendance disabled.',
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setSavingFlag(false);
    }
  };

  const handleUseMyLocation = () => {
    if (locating || saving) return;
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setToast({
        type: 'error',
        message: 'Location requires HTTPS (or localhost).',
      });
      return;
    }
    if (!navigator.geolocation) {
      setToast({ type: 'error', message: 'Geolocation is not supported in this browser.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: String(Number(pos.coords.latitude.toFixed(6))),
          longitude: String(Number(pos.coords.longitude.toFixed(6))),
        }));
        setToast({
          type: 'success',
          message: `Location filled (±${Math.round(pos.coords.accuracy || 0)}m).`,
        });
        setLocating(false);
      },
      (err) => {
        setToast({ type: 'error', message: err.message || 'Could not read GPS.' });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startEdit = (site) => {
    setEditingId(site.id);
    setForm({
      name: site.name || '',
      latitude: site.latitude != null ? String(site.latitude) : '',
      longitude: site.longitude != null ? String(site.longitude) : '',
      radius_m: site.radius_m != null ? String(site.radius_m) : String(DEFAULT_RADIUS),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!isAdmin || saving) return;
    try {
      setSaving(true);
      setToast(null);
      const payload = {
        name: form.name.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radius_m: Number(form.radius_m),
      };
      const url = editingId
        ? `/api/company/field-sites/${editingId}`
        : '/api/company/field-sites';
      const res = await authFetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to save site');
      setToast({
        type: 'success',
        message: editingId ? 'Site updated.' : 'Site created.',
      });
      cancelEdit();
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save site' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (site) => {
    if (!isAdmin) return;
    const ok = window.confirm(`Delete field site “${site.name}”? Assigned employees will lose this site.`);
    if (!ok) return;
    try {
      const res = await authFetch(`/api/company/field-sites/${site.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to delete');
      setToast({ type: 'success', message: 'Site deleted.' });
      if (editingId === site.id) cancelEdit();
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to delete' });
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs text-slate-500">
          <Link to="/devices" className="text-primary-600 hover:underline">
            Devices
          </Link>
          {' · '}
          PunchPay Field
        </p>
        <h1 className="text-lg font-semibold text-slate-900">Field sites</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Assign GPS sites for employees who punch away from the office with PunchPay Field (selfie + GPS). This is separate from office QR / kiosk geofence.
        </p>
      </header>

      {toast && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            toast.type === 'error'
              ? 'border-rose-100 bg-rose-50 text-rose-700'
              : 'border-emerald-100 bg-emerald-50 text-emerald-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-slate-300"
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={!isAdmin || savingFlag}
          />
          <span>
            <span className="font-medium">Enable field attendance</span>
            <span className="mt-0.5 block text-[11px] text-slate-500">
              Employees with a mobile/both attendance channel, app login, and at least one assigned site can punch from PunchPay Field. Office tablet QR stays unchanged.
            </span>
          </span>
        </label>
        <p className="mt-3 text-[11px] text-slate-500">
          <Link to="/mobile-punch-log" className="font-medium text-indigo-600 underline">
            View punch log
          </Link>
          {' · field attempts appear alongside QR punches.'}
        </p>
      </section>

      {isAdmin && (
        <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">
            {editingId ? 'Edit site' : 'Add a field site'}
          </h2>
          <form onSubmit={handleSave} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-600 sm:col-span-2">
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Warehouse / customer site"
                required
              />
            </label>
            <SiteLocationMap
              latitude={form.latitude}
              longitude={form.longitude}
              radiusM={form.radius_m}
              disabled={saving}
              onChange={({ latitude, longitude }) =>
                setForm((prev) => ({ ...prev, latitude, longitude }))
              }
            />
            <label className="text-xs text-slate-600">
              Latitude
              <input
                value={form.latitude}
                onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-slate-600">
              Longitude
              <input
                value={form.longitude}
                onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-slate-600">
              Radius (metres, 50–5000)
              <input
                type="number"
                min="50"
                max="5000"
                value={form.radius_m}
                onChange={(e) => setForm((p) => ({ ...p, radius_m: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={locating || saving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {locating ? 'Getting location…' : 'Use my location'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Save site' : 'Create site'}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Sites</h2>
        {loading ? (
          <p className="mt-3 text-xs text-slate-500">Loading…</p>
        ) : sites.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No field sites yet. Create one, then assign employees below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {sites.map((site) => (
              <li key={site.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{site.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {Number(site.latitude).toFixed(5)}, {Number(site.longitude).toFixed(5)} · {site.radius_m}m
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(site)}
                      className="text-[11px] font-medium text-primary-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(site)}
                      className="text-[11px] font-medium text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <FieldEmployeesPanel
        sites={sites}
        canManage={canManageEmployees}
        setToast={setToast}
      />
    </div>
  );
}
