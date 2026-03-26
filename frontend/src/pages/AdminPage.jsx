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

function getSubscriptionUrgency(subscriptionEndDate) {
  if (!subscriptionEndDate) {
    return { isUrgent: false, isExpired: false, daysLeft: null };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(subscriptionEndDate);
  if (Number.isNaN(end.getTime())) {
    return { isUrgent: false, isExpired: false, daysLeft: null };
  }
  end.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - today.getTime();
  const daysLeft = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const isExpired = daysLeft < 0;
  const isUrgent = isExpired || daysLeft <= 30;
  return { isUrgent, isExpired, daysLeft };
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
  const [enquiries, setEnquiries] = useState([]);
  const [enquiriesLoading, setEnquiriesLoading] = useState(false);
  const [enquiriesError, setEnquiriesError] = useState('');
  const [billingModalCompany, setBillingModalCompany] = useState(null);
  const [billingForm, setBillingForm] = useState({
    plan_code: 'starter',
    billing_cycle: 'monthly',
    next_billing_date: '',
    last_payment_date: '',
    payment_status: 'paid',
    billing_notes: '',
    subscription_start_date: '',
    subscription_end_date: '',
    is_active: true,
  });
  const [billingSaving, setBillingSaving] = useState(false);
  const [lockBusyId, setLockBusyId] = useState(null);
  const [detailsCompany, setDetailsCompany] = useState(null);
  const [collectionsQueue, setCollectionsQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilter, setQueueFilter] = useState('all');
  const [renewBusyId, setRenewBusyId] = useState(null);
  const [detailsAudit, setDetailsAudit] = useState([]);

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

  const loadEnquiries = useCallback(async () => {
    if (!adminKey) return;
    setEnquiriesLoading(true);
    setEnquiriesError('');
    try {
      const res = await adminFetch(`/demo-enquiries?page=1&limit=20`, {}, adminKey);
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        setEnquiries([]);
        return;
      }
      if (res.status === 503) {
        setEnquiriesError('Server: set ADMIN_APPROVAL_SECRET in backend .env and restart the API.');
        setEnquiries([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load demo enquiries');
      const json = await res.json();
      const list = Array.isArray(json?.data?.data) ? json.data.data : [];
      setEnquiries(list);
    } catch (err) {
      setEnquiriesError(err.message || 'Unable to load enquiries');
      setEnquiries([]);
    } finally {
      setEnquiriesLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    loadEnquiries();
  }, [adminKey, loadEnquiries]);

  const loadCollectionsQueue = useCallback(async () => {
    if (!adminKey) return;
    setQueueLoading(true);
    try {
      const res = await adminFetch('/collections-queue?days=30', {}, adminKey);
      if (!res.ok) throw new Error('Failed to load collections queue');
      const json = await res.json();
      setCollectionsQueue(Array.isArray(json.data) ? json.data : []);
    } catch {
      setCollectionsQueue([]);
    } finally {
      setQueueLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    loadCollectionsQueue();
  }, [adminKey, loadCollectionsQueue]);

  useEffect(() => {
    const loadDetailsAudit = async () => {
      if (!adminKey || !detailsCompany?.id) {
        setDetailsAudit([]);
        return;
      }
      try {
        const res = await adminFetch(`/company-audit?company_id=${detailsCompany.id}&page=1&limit=10`, {}, adminKey);
        if (!res.ok) throw new Error('Failed to load audit');
        const json = await res.json();
        setDetailsAudit(Array.isArray(json?.data?.data) ? json.data.data : []);
      } catch {
        setDetailsAudit([]);
      }
    };
    loadDetailsAudit();
  }, [adminKey, detailsCompany]);

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

  const handleLockToggle = async (company, action) => {
    if (!company) return;
    const verb = action === 'lock' ? 'lock' : 'unlock';
    if (
      action === 'lock' &&
      !window.confirm(
        `Lock "${company.name || `Company #${company.id}`}"? Users will no longer be able to log in until you unlock them.`
      )
    ) {
      return;
    }
    setLockBusyId(company.id);
    try {
      const res = await adminFetch(
        action === 'lock' ? '/lock-company' : '/unlock-company',
        {
          method: 'POST',
          body: JSON.stringify({ company_id: company.id }),
        },
        adminKey
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        return;
      }
      if (!res.ok) {
        throw new Error(json.message || `Failed to ${verb} company`);
      }
      setToast({
        type: 'success',
        message: json.message || `Company ${verb}ed.`,
      });
      loadOverview();
      loadCollectionsQueue();
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || `Failed to ${verb} company`,
      });
    } finally {
      setLockBusyId(null);
    }
  };

  const handleRenewAction = async (company, action) => {
    if (!company) return;
    setRenewBusyId(company.id);
    try {
      const res = await adminFetch('/renew-company-subscription', {
        method: 'POST',
        body: JSON.stringify({ company_id: company.id, action }),
      }, adminKey);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Renewal action failed');
      setToast({ type: 'success', message: json.message || 'Subscription updated.' });
      loadOverview();
      loadCollectionsQueue();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed renewal action' });
    } finally {
      setRenewBusyId(null);
    }
  };

  const openBillingModal = (company) => {
    if (!company) return;
    const toDateInput = (value) =>
      value ? new Date(value).toISOString().slice(0, 10) : '';
    setBillingForm({
      plan_code: company.plan_code || 'starter',
      billing_cycle: company.billing_cycle || 'monthly',
      next_billing_date: toDateInput(company.next_billing_date),
      last_payment_date: toDateInput(company.last_payment_date),
      payment_status: company.payment_status || 'paid',
      billing_notes: company.billing_notes || '',
      subscription_start_date: toDateInput(company.subscription_start_date),
      subscription_end_date: toDateInput(company.subscription_end_date),
      is_active: company.is_active !== false,
    });
    setBillingModalCompany(company);
  };

  const closeBillingModal = () => {
    setBillingModalCompany(null);
    setBillingSaving(false);
  };

  const handleBillingChange = (e) => {
    const { name, value, type, checked } = e.target;
    setBillingForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleBillingSubmit = async (e) => {
    e.preventDefault();
    if (!billingModalCompany) return;
    setBillingSaving(true);
    try {
      const res = await adminFetch(
        '/company-billing',
        {
          method: 'POST',
          body: JSON.stringify({
            company_id: billingModalCompany.id,
            ...billingForm,
          }),
        },
        adminKey
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        return;
      }
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update billing');
      }
      setToast({ type: 'success', message: json.message || 'Billing updated.' });
      closeBillingModal();
      loadOverview();
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to update billing',
      });
      setBillingSaving(false);
    }
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
  const filteredQueue = collectionsQueue.filter((item) => {
    if (queueFilter === 'expired') return getSubscriptionUrgency(item.subscription_end_date).isExpired;
    if (queueFilter === 'overdue') return item.payment_status === 'overdue';
    if (queueFilter === 'pending') return item.payment_status === 'pending';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
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
          {['totalCompanies', 'activeCompanies', 'pendingCompanies', 'declinedCompanies', 'lockedCompanies'].map((key) => {
            const labelMap = {
              totalCompanies: 'Total companies',
              activeCompanies: 'Approved (active)',
              pendingCompanies: 'Pending approval',
              declinedCompanies: 'Declined',
              lockedCompanies: 'Locked',
            };
            const colorMap = {
              totalCompanies: 'bg-slate-900',
              activeCompanies: 'bg-emerald-600',
              pendingCompanies: 'bg-amber-500',
              declinedCompanies: 'bg-rose-500',
              lockedCompanies: 'bg-slate-500',
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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
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
              <table className="w-full min-w-[1150px] text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[16%]">
                      Company
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[16%]">
                      Email
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[12%]">
                      Phone
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[9%]">
                      Status
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[22%]">
                      Plan / billing
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[12%]">
                      Staff
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[14%]">
                      Subscription
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[7%]">
                      Created
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[8%]">
                      Controls
                    </th>
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
                    const urgency = getSubscriptionUrgency(c.subscription_end_date);
                    const createdAt = c.created_at
                      ? new Date(c.created_at).toLocaleDateString()
                      : null;
                    const statusPillClasses =
                      c.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : c.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : c.status === 'locked'
                            ? 'bg-slate-50 text-slate-700 border-slate-300'
                            : 'bg-rose-50 text-rose-700 border-rose-100';
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50/60 cursor-pointer"
                        onClick={() => setDetailsCompany(c)}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailsCompany(c);
                            }}
                            className="font-medium text-slate-900 hover:text-blue-600 hover:underline text-left"
                          >
                            {c.name || '—'}
                          </button>
                          <div className="text-xs text-slate-500">ID: {c.id}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{c.email || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{c.phone || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusPillClasses}`}
                          >
                            {c.status || 'unknown'}
                          </span>
                        </td>
                        {/* Plan / billing */}
                        <td className="px-4 py-2.5 text-slate-700">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-slate-900">
                              {(c.plan_code || 'starter')
                                .charAt(0)
                                .toUpperCase() +
                                (c.plan_code || 'starter').slice(1)}
                              {c.billing_cycle ? ` • ${c.billing_cycle}` : ''}
                            </span>
                            <span className="text-xs text-slate-500">
                              {c.next_billing_date
                                ? `Next: ${new Date(
                                    c.next_billing_date
                                  ).toLocaleDateString()}`
                                : 'Next billing not set'}
                            </span>
                            <span
                              className={`inline-flex mt-0.5 w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                c.payment_status === 'overdue'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : c.payment_status === 'pending'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : c.payment_status === 'trial'
                                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {c.payment_status || 'paid'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openBillingModal(c);
                              }}
                              className="mt-1 text-[11px] text-blue-600 hover:underline w-fit"
                            >
                              Manage billing
                            </button>
                          </div>
                        </td>
                        {/* Staff */}
                        <td className="px-4 py-2.5 text-slate-700">
                          {c.active_staff} active
                          <span className="text-slate-400 text-xs">
                            {` of ${c.total_staff} total`}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {subStart && subEnd ? (
                            <div className="flex flex-col">
                              <span
                                className={`text-xs ${
                                  urgency.isUrgent ? 'text-rose-700 font-semibold' : 'text-slate-500'
                                }`}
                              >
                                {subStart} → {subEnd}
                              </span>
                              <span
                                className={`text-xs ${
                                  urgency.isUrgent ? 'text-rose-600' : 'text-slate-500'
                                }`}
                              >
                                {c.is_active === false ? 'Inactive' : 'Active/within grace'}
                              </span>
                              {urgency.isUrgent && (
                                <span className="text-[11px] text-rose-600 font-medium">
                                  {urgency.isExpired
                                    ? 'Expired — renew or lock now'
                                    : `Expiring in ${urgency.daysLeft} day${urgency.daysLeft === 1 ? '' : 's'}`}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{createdAt || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col gap-1">
                            {c.status === 'active' || c.status === 'locked' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLockToggle(
                                    c,
                                    c.status === 'locked' ? 'unlock' : 'lock'
                                  );
                                }}
                                disabled={lockBusyId === c.id}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
                                  c.status === 'locked'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                                } disabled:opacity-50`}
                              >
                                {c.status === 'locked'
                                  ? lockBusyId === c.id
                                    ? 'Unlocking…'
                                    : 'Unlock'
                                  : lockBusyId === c.id
                                    ? 'Locking…'
                                    : 'Lock'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                No actions
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenewAction(c, 'renew_30_days');
                              }}
                              disabled={renewBusyId === c.id}
                              className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            >
                              Renew 1m
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenewAction(c, 'renew_1_year');
                              }}
                              disabled={renewBusyId === c.id}
                              className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              Renew 1y
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Collections queue</h2>
              <p className="text-xs text-slate-500">Expired, expiring in 30 days, pending/overdue.</p>
            </div>
            <select
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="all">All</option>
              <option value="expired">Expired</option>
              <option value="overdue">Overdue</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          {queueLoading ? (
            <div className="p-4 text-sm text-slate-500">Loading queue…</div>
          ) : filteredQueue.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No companies in collections queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left">Company</th>
                    <th className="px-4 py-2 text-left">Subscription end</th>
                    <th className="px-4 py-2 text-left">Payment status</th>
                    <th className="px-4 py-2 text-left">Active staff</th>
                    <th className="px-4 py-2 text-left">Quick action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQueue.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-2">{q.name || `Company #${q.id}`}</td>
                      <td className="px-4 py-2">{q.subscription_end_date ? new Date(q.subscription_end_date).toLocaleDateString() : 'Not set'}</td>
                      <td className="px-4 py-2">{q.payment_status || 'paid'}</td>
                      <td className="px-4 py-2">{q.active_staff || 0}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleRenewAction(q, 'renew_1_year')}
                          className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700"
                        >
                          Renew year
                        </button>
                      </td>
                    </tr>
                  ))}
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

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Demo enquiries</h2>
            <p className="text-xs text-slate-500">Latest free-demo requests from the landing page.</p>
          </div>
          {enquiriesLoading ? (
            <div className="p-8 text-center text-slate-500">Loading…</div>
          ) : enquiriesError ? (
            <div className="p-4 text-sm text-rose-700 bg-rose-50 border-t border-rose-200">{enquiriesError}</div>
          ) : enquiries.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No enquiries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Business</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Employees</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-700">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enquiries.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">{q.full_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{q.business_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{q.phone_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{q.employees_range || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {q.created_at
                          ? new Date(q.created_at).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{q.notes || '—'}</td>
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

        {/* Company details modal */}
        {detailsCompany && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Company details – {detailsCompany.name || `Company #${detailsCompany.id}`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Full view of plan, billing, subscription, and staff summary.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsCompany(null)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
              <div className="px-5 py-4 grid gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    Overview
                  </h3>
                  <dl className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Name</dt>
                      <dd className="font-medium text-slate-900 text-right">
                        {detailsCompany.name || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Company ID</dt>
                      <dd className="font-mono text-[11px] text-slate-900">
                        {detailsCompany.id}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Email</dt>
                      <dd className="text-right">
                        {detailsCompany.email || <span className="italic">Not set</span>}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Phone</dt>
                      <dd className="text-right">
                        {detailsCompany.phone || <span className="italic">Not set</span>}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="text-right capitalize">
                        {detailsCompany.status}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Created</dt>
                      <dd className="text-right">
                        {detailsCompany.created_at
                          ? new Date(detailsCompany.created_at).toLocaleDateString()
                          : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Staff</dt>
                      <dd className="text-right">
                        {detailsCompany.active_staff} active /{' '}
                        {detailsCompany.total_staff} total
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    Plan & billing
                  </h3>
                  <dl className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Plan</dt>
                      <dd className="text-right">
                        {(detailsCompany.plan_code || 'starter')
                          .charAt(0)
                          .toUpperCase() +
                          (detailsCompany.plan_code || 'starter').slice(1)}
                        {detailsCompany.billing_cycle
                          ? ` • ${detailsCompany.billing_cycle}`
                          : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Payment status</dt>
                      <dd className="text-right capitalize">
                        {detailsCompany.payment_status || 'paid'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Next billing date</dt>
                      <dd className="text-right">
                        {detailsCompany.next_billing_date
                          ? new Date(
                              detailsCompany.next_billing_date
                            ).toLocaleDateString()
                          : 'Not set'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Last payment</dt>
                      <dd className="text-right">
                        {detailsCompany.last_payment_date
                          ? new Date(
                              detailsCompany.last_payment_date
                            ).toLocaleDateString()
                          : 'Not set'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Subscription active</dt>
                      <dd className="text-right">
                        {detailsCompany.is_active === false ? 'No' : 'Yes'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    Subscription & notes
                  </h3>
                  <dl className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Subscription period</dt>
                      <dd className="text-right">
                        {detailsCompany.subscription_start_date &&
                        detailsCompany.subscription_end_date ? (
                          <>
                            {new Date(
                              detailsCompany.subscription_start_date
                            ).toLocaleDateString()}{' '}
                            →{' '}
                            {new Date(
                              detailsCompany.subscription_end_date
                            ).toLocaleDateString()}
                          </>
                        ) : (
                          'Not set'
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <div className="text-xs font-medium text-slate-700 mb-1">
                      Internal billing notes
                    </div>
                    <div className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 min-h-[56px] whitespace-pre-wrap">
                      {detailsCompany.billing_notes?.trim()
                        ? detailsCompany.billing_notes
                        : 'No notes added yet.'}
                    </div>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                    Superadmin action history
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 max-h-44 overflow-auto">
                    {detailsAudit.length === 0 ? (
                      <p className="text-xs text-slate-500">No actions found.</p>
                    ) : (
                      detailsAudit.map((a) => (
                        <div key={a.id} className="text-xs text-slate-700 py-1 border-b border-slate-200 last:border-b-0">
                          {new Date(a.created_at).toLocaleString()} - {a.action_type}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {billingModalCompany && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-1">
                Manage billing – {billingModalCompany.name || `Company #${billingModalCompany.id}`}
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Update plan, billing cycle, and manual payment status. Automated gateways can be added later.
              </p>
              <form onSubmit={handleBillingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Plan
                    </label>
                    <select
                      name="plan_code"
                      value={billingForm.plan_code}
                      onChange={handleBillingChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    >
                      <option value="starter">Starter (up to 50)</option>
                      <option value="growth">Growth (up to 100)</option>
                      <option value="business">Business (up to 250)</option>
                      <option value="enterprise">Enterprise (up to 500)</option>
                      <option value="custom">Custom (500+ employees, custom pricing)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Billing cycle
                    </label>
                    <select
                      name="billing_cycle"
                      value={billingForm.billing_cycle}
                      onChange={handleBillingChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Next billing date
                    </label>
                    <input
                      type="date"
                      name="next_billing_date"
                      value={billingForm.next_billing_date}
                      onChange={handleBillingChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Last payment date
                    </label>
                    <input
                      type="date"
                      name="last_payment_date"
                      value={billingForm.last_payment_date}
                      onChange={handleBillingChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Payment status
                    </label>
                    <select
                      name="payment_status"
                      value={billingForm.payment_status}
                      onChange={handleBillingChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    >
                      <option value="trial">Trial</option>
                      <option value="paid">Paid</option>
                      <option value="pending">Pending</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-5 sm:mt-7">
                    <input
                      id="billing-is-active"
                      type="checkbox"
                      name="is_active"
                      checked={billingForm.is_active}
                      onChange={handleBillingChange}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="billing-is-active"
                      className="text-xs font-medium text-slate-700"
                    >
                      Subscription active
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Subscription start
                    </label>
                    <input
                      type="date"
                      name="subscription_start_date"
                      value={billingForm.subscription_start_date}
                      onChange={handleBillingChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Subscription end
                    </label>
                    <input
                      type="date"
                      name="subscription_end_date"
                      value={billingForm.subscription_end_date}
                      onChange={handleBillingChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Internal notes
                  </label>
                  <textarea
                    name="billing_notes"
                    value={billingForm.billing_notes}
                    onChange={handleBillingChange}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    placeholder="e.g. 10% discount until Dec, annual contract, cheque no., etc."
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeBillingModal}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    disabled={billingSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    disabled={billingSaving}
                  >
                    {billingSaving ? 'Saving…' : 'Save billing'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
