import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

function toDateInputValue(d) {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export default function CompanySettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [subscriptionForm, setSubscriptionForm] = useState({
    subscription_start_date: '',
    subscription_end_date: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [branches, setBranches] = useState([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchError, setBranchError] = useState(null);

  const loadBranches = async () => {
    if (!isAdmin) return;
    try {
      const res = await authFetch('/api/company/branches');
      if (!res.ok) throw new Error('Failed to load branches');
      const json = await res.json();
      setBranches(Array.isArray(json.data) ? json.data : []);
    } catch {
      setBranches([]);
    }
  };

  useEffect(() => {
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    let isMounted = true;

    const fetchCompany = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await authFetch('/api/company', {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          throw new Error('Unable to load company profile');
        }
        const json = await res.json();
        if (!isMounted) return;
        const data = json.data || {};
        setForm({
          name: data.name || '',
          phone: data.phone || '',
          address: data.address || '',
        });
        setSubscriptionForm({
          subscription_start_date: toDateInputValue(data.subscription_start_date),
          subscription_end_date: toDateInputValue(data.subscription_end_date),
          is_active: data.is_active !== false,
        });
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Unable to load company profile');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCompany();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
    if (saved) setSaved(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    try {
      setSaving(true);
      setError(null);
      const res = await authFetch('/api/company', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        throw new Error('Failed to save company profile');
      }
      const json = await res.json();
      const data = json.data || {};
      setForm({
        name: data.name || '',
        phone: data.phone || '',
        address: data.address || '',
      });
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Failed to save company profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBranch = async (event) => {
    event.preventDefault();
    if (!newBranchName.trim() || branchSaving) return;
    try {
      setBranchSaving(true);
      setBranchError(null);
      const res = await authFetch('/api/company/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBranchName.trim(),
          address: newBranchAddress.trim() === '' ? undefined : newBranchAddress.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to create branch');
      }
      setNewBranchName('');
      setNewBranchAddress('');
      await loadBranches();
    } catch (err) {
      setBranchError(err.message || 'Failed to create branch');
    } finally {
      setBranchSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Company profile</h1>
        <p className="text-xs text-slate-500">
          Add your factory&apos;s legal details so documents and payroll are generated correctly.
        </p>
      </header>

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        {error && (
          <div className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Company name</label>
              <input
                value={form.name}
                onChange={handleChange('name')}
                disabled={loading || saving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                placeholder="e.g. Sunrise Textiles Pvt Ltd"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Phone</label>
              <input
                value={form.phone}
                onChange={handleChange('phone')}
                disabled={loading || saving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-slate-700">Address</label>
              <textarea
                rows={3}
                value={form.address}
                onChange={handleChange('address')}
                disabled={loading || saving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                placeholder="Factory address used on payslips and reports"
              />
            </div>
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            These details are used on payslips, reports, and onboarding progress.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {saved && (
              <span className="text-sm font-medium text-emerald-600">Saved</span>
            )}
            <button
              type="submit"
              disabled={loading || saving}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save company profile'}
            </button>
          </div>
        </form>
      </section>

      {isAdmin && (
        <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Branches</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Add one row per physical location. Employees and devices are assigned to a branch; HR users only see data for branches assigned to them (configured by your service provider).
          </p>
          {branchError && (
            <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {branchError}
            </div>
          )}
          {branches.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {branches.map((b) => (
                <li key={b.id} className="flex flex-wrap gap-2 border-b border-slate-100 py-2 last:border-0">
                  <span className="font-medium text-slate-900">{b.name}</span>
                  {b.address && (
                    <span className="text-xs text-slate-500">{b.address}</span>
                  )}
                  <span className="text-[10px] text-slate-400">ID {b.id}</span>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddBranch} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">New branch name</label>
                <input
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  disabled={branchSaving}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  placeholder="e.g. Bangalore factory"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Address (optional)</label>
                <input
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                  disabled={branchSaving}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  placeholder="City / area"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={branchSaving || !newBranchName.trim()}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-primary-200 hover:text-primary-700 disabled:opacity-50"
            >
              {branchSaving ? 'Adding…' : 'Add branch'}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Subscription</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Your current subscription. Dates and status are managed by the service provider—contact support to make changes.
        </p>
        <div className="mt-4 space-y-3 rounded-lg bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-slate-500">Start date</span>
              <span className="ml-2 font-medium text-slate-900">
                {subscriptionForm.subscription_start_date || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">End date</span>
              <span className="ml-2 font-medium text-slate-900">
                {subscriptionForm.subscription_end_date || '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Status</span>
              <span className={`ml-2 font-medium ${subscriptionForm.is_active ? 'text-emerald-600' : 'text-slate-500'}`}>
                {subscriptionForm.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            After the end date, a 7-day grace period applies before payroll and device sync are blocked.
          </p>
        </div>
      </section>
    </div>
  );
}


