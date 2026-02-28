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
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem(ADMIN_KEY_STORAGE));
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

  useEffect(() => {
    if (adminKey) loadPending();
  }, [adminKey, loadPending]);

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

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pending registrations</h1>
            <p className="text-sm text-slate-500">Approve after payment, or decline.</p>
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
