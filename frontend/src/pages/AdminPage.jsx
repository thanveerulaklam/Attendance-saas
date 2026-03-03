import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const ADMIN_KEY_STORAGE = 'attendance_saas_admin_key';

function adminFetch(path, options = {}, key) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Approval-Secret': key,
    ...(options.headers || {}),
  };
  return fetch(`/api/admin${path}`, { ...options, headers });
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [keyInput, setKeyInput] = useState('');
  const [pending, setPending] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem(ADMIN_KEY_STORAGE));
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadPending = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setKeyError('');
    try {
      const res = await adminFetch('/pending-companies', {}, adminKey);
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        setPending([]);
        return;
      }
      if (res.status === 503) {
        setKeyError('Server: set ADMIN_APPROVAL_SECRET in backend .env and restart the API.');
        setPending([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : [];
      setPending(list);
    } catch {
      setKeyError('Failed to load pending registrations');
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  const loadOverview = useCallback(async () => {
    if (!adminKey) return;
    setOverviewLoading(true);
    try {
      const res = await adminFetch('/overview', {}, adminKey);
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        setOverview(null);
        return;
      }
      if (res.status === 503) {
        setKeyError('Server: set ADMIN_APPROVAL_SECRET in backend .env and restart the API.');
        setOverview(null);
        return;
      }
      if (!res.ok) throw new Error('Failed to load overview');
      const json = await res.json();
      setOverview(json.data || null);
    } catch {
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (adminKey) {
      loadPending();
      loadOverview();
    }
  }, [adminKey, loadPending, loadOverview]);

  const handleKeySubmit = (e) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setKeyInput('');
  };

  const handleApprove = async (companyId) => {
    setBusyId(companyId);
    try {
      const res = await adminFetch('/approve-company', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId }),
      }, adminKey);
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        return;
      }
      if (!res.ok) throw new Error(json.message || 'Approve failed');
      setToast({ type: 'success', message: json.message || 'Company approved.' });
      loadPending();
      loadOverview();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to approve' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (companyId) => {
    if (!window.confirm('Decline this registration? They will not be able to log in.')) return;
    setBusyId(companyId);
    try {
      const res = await adminFetch('/decline-company', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId }),
      }, adminKey);
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        return;
      }
      if (!res.ok) throw new Error(json.message || 'Decline failed');
      setToast({ type: 'success', message: json.message || 'Registration declined.' });
      loadPending();
      loadOverview();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to decline' });
    } finally {
      setBusyId(null);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey('');
    setKeyInput('');
    setPending([]);
    setOverview(null);
    setKeyError('');
  };

  // Gate: require admin key
  if (!adminKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-lg border border-slate-200 p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-2xl bg-slate-700 flex items-center justify-center text-white font-semibold">
              A
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Super Admin</h1>
              <p className="text-xs text-slate-500">Manage pending registrations</p>
            </div>
          </div>
          <form onSubmit={handleKeySubmit} className="space-y-4">
            {keyError && (
              <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {keyError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Admin key</label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your approval secret"
                autoComplete="current-password"
              />
              <p className="mt-1 text-xs text-slate-500">
                Use the same value as <code className="bg-slate-100 px-1 rounded">ADMIN_APPROVAL_SECRET</code> in backend .env
              </p>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 text-white font-medium py-2.5 hover:bg-blue-700"
            >
              Continue
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            <Link to="/login" className="text-blue-600 font-medium hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Main view: list of pending companies
  const list = Array.isArray(pending) ? pending : [];
  const totals = overview?.totals || {};
  const companies = Array.isArray(overview?.companies) ? overview.companies : [];

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Super admin dashboard</h1>
            <p className="text-sm text-slate-500">
              See all companies, subscriptions, and pending registrations.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            Exit admin
          </button>
        </div>

        {keyError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
            {keyError}
          </div>
        )}

        {/* High-level overview cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          {['totalCompanies', 'activeCompanies', 'pendingCompanies', 'declinedCompanies'].map((key) => {
            const labelMap = {
              totalCompanies: 'Total companies',
              activeCompanies: 'Approved (active)',
              pendingCompanies: 'Pending approval',
              declinedCompanies: 'Declined',
            };
            const colorMap = {
              totalCompanies: 'bg-slate-900',
              activeCompanies: 'bg-emerald-600',
              pendingCompanies: 'bg-amber-500',
              declinedCompanies: 'bg-rose-500',
            };
            const value = totals[key] ?? 0;
            return (
              <article
                key={key}
                className="rounded-xl bg-white shadow-sm border border-slate-200 px-4 py-3 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {labelMap[key]}
                  </p>
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs text-white ${colorMap[key]}`}
                  >
                    {key === 'totalCompanies' ? 'Σ' : key === 'activeCompanies' ? 'A' : key === 'pendingCompanies' ? 'P' : 'D'}
                  </span>
                </div>
                <p className="text-2xl font-semibold text-slate-900">
                  {overviewLoading && !overview ? '…' : value}
                </p>
              </article>
            );
          })}
        </div>

        {/* Companies list with staff & subscription info */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-8">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">All companies</h2>
              <p className="text-xs text-slate-500">
                Staff counts and subscription period for each company.
              </p>
            </div>
            {overviewLoading && (
              <span className="text-xs text-slate-500">Refreshing…</span>
            )}
          </div>
          {overviewLoading && !overview ? (
            <div className="p-6 text-sm text-slate-500">Loading overview…</div>
          ) : companies.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No companies found yet. Once someone registers, they will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Company</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Staff</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Subscription</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((c) => {
                    const subStart = c.subscription_start_date
                      ? new Date(c.subscription_start_date).toLocaleDateString()
                      : null;
                    const subEnd = c.subscription_end_date
                      ? new Date(c.subscription_end_date).toLocaleDateString()
                      : null;
                    const createdAt = c.created_at
                      ? new Date(c.created_at).toLocaleDateString()
                      : null;
                    const statusPillClasses =
                      c.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : c.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : 'bg-rose-50 text-rose-700 border-rose-100';
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{c.name || '—'}</div>
                          <div className="text-xs text-slate-500">ID: {c.id}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{c.email || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusPillClasses}`}
                          >
                            {c.status || 'unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {c.active_staff} active
                          <span className="text-slate-400 text-xs">
                            {` of ${c.total_staff} total`}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {subStart && subEnd ? (
                            <div className="flex flex-col">
                              <span className="text-xs text-slate-500">
                                {subStart} → {subEnd}
                              </span>
                              <span className="text-xs text-slate-500">
                                {c.is_active === false ? 'Inactive' : 'Active/within grace'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{createdAt || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {toast && (
          <div
            className={`mb-4 rounded-lg border px-4 py-2 text-sm ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            {toast.message}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No pending registrations. When someone registers, they will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Company</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Company email</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Admin email</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Created</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.email || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.admin_email || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(row.id)}
                            disabled={busyId === row.id}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecline(row.id)}
                            disabled={busyId === row.id}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/login" className="text-blue-600 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
