import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../utils/api';

const REJECT_LABELS = {
  MOBILE_DISABLED: 'Mobile disabled (company)',
  BRANCH_MOBILE_DISABLED: 'Mobile disabled (branch)',
  EMPLOYEE_CHANNEL_NOT_MOBILE: 'Employee not on mobile channel',
  SUBSCRIPTION_EXPIRED: 'Subscription expired',
  QR_INVALID: 'Invalid QR',
  QR_EXPIRED: 'QR expired',
  GPS_DENIED: 'GPS denied',
  GPS_INACCURATE: 'GPS inaccurate',
  OUTSIDE_GEOFENCE: 'Outside geofence',
  DUPLICATE_PUNCH: 'Duplicate punch',
  EMPLOYEE_INACTIVE: 'Employee inactive',
  BRANCH_MISMATCH: 'Wrong branch',
  RATE_LIMITED: 'Rate limited',
  GEOFENCE_NOT_CONFIGURED: 'Geofence not set',
};

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function MobilePunchAttemptsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branches, setBranches] = useState([]);
  const [status, setStatus] = useState('');
  const [branchId, setBranchId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => daysAgoIso(7).slice(0, 10));
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const branchNameById = useMemo(() => {
    const m = {};
    branches.forEach((b) => {
      m[String(b.id)] = b.name || `Branch #${b.id}`;
    });
    return m;
  }, [branches]);

  useEffect(() => {
    authFetch('/api/company/branches')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setBranches(Array.isArray(json?.data) ? json.data : []))
      .catch(() => setBranches([]));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (status) params.set('status', status);
      if (branchId) params.set('branch_id', branchId);
      if (dateFrom) params.set('date_from', new Date(`${dateFrom}T00:00:00`).toISOString());

      const res = await authFetch(`/api/company/mobile-punch-attempts?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load punch attempts');

      setItems(json.data?.items || []);
      setTotal(json.data?.total ?? 0);
    } catch (err) {
      setError(err.message || 'Failed to load');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, branchId, dateFrom, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs text-slate-500">
          <Link to="/settings/company" className="text-primary-600 hover:underline">
            Company settings
          </Link>
          {' · '}
          Mobile attendance
        </p>
        <h1 className="text-lg font-semibold text-slate-900">Mobile punch log</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Accepted and rejected mobile punch attempts (QR + GPS). Use this to debug geofence or QR issues.
        </p>
      </header>

      <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-600">
            From date
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setOffset(0);
                setDateFrom(e.target.value);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Status
            <select
              value={status}
              onChange={(e) => {
                setOffset(0);
                setStatus(e.target.value);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Branch
            <select
              value={branchId}
              onChange={(e) => {
                setOffset(0);
                setBranchId(e.target.value);
              }}
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-1.5 text-sm min-w-[140px]"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || `Branch #${b.id}`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Branch</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Reason</th>
                <th className="py-2 pr-3 font-medium">GPS</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No punch attempts in this period.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-700">
                      {formatWhen(row.created_at)}
                    </td>
                    <td className="py-2 pr-3 text-slate-800">
                      {row.employee_name || '—'}
                      {row.employee_code ? (
                        <span className="block text-[10px] text-slate-400">{row.employee_code}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {row.branch_name || branchNameById[String(row.branch_id)] || '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          row.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600 max-w-[180px]">
                      {row.status === 'rejected'
                        ? REJECT_LABELS[row.reject_reason] || row.reject_reason || '—'
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                      {row.latitude != null && row.longitude != null ? (
                        <>
                          {Number(row.latitude).toFixed(5)}, {Number(row.longitude).toFixed(5)}
                          {row.location_accuracy_m != null ? (
                            <span className="block text-[10px]">±{Math.round(row.location_accuracy_m)}m</span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>
              {total} total · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset <= 0 || loading}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={offset + limit >= total || loading}
                onClick={() => setOffset((o) => o + limit)}
                className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
