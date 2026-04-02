import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  PLAN_EMPLOYEE_CAP,
  PLAN_DISPLAY_NAME,
  planDefaultLimits,
  planOptionsForAdminSelect,
} from '../constants/pricingPlans';

const ADMIN_KEY_STORAGE = 'attendance_saas_admin_key';
const ADMIN_PLAN_OPTIONS = planOptionsForAdminSelect();

function adminFetch(path, options = {}, key) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Approval-Secret': key,
    ...(options.headers || {}),
  };
  return fetch(`/api/admin${path}`, { ...options, headers });
}

/** Rate limits and some proxies return JSON as a bare string; parse so we never show a blank message. */
function messageFromAdminErrorResponse(text, status) {
  if (!text || !String(text).trim()) {
    return status === 429
      ? 'Too many requests. Wait a minute and try again.'
      : `Request failed (${status})`;
  }
  try {
    const data = JSON.parse(text);
    if (typeof data === 'string') return data;
    if (data && typeof data.message === 'string') return data.message;
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    /* not JSON */
  }
  return String(text).slice(0, 500);
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

function deriveSubscriptionDates(company) {
  const startRaw = company?.subscription_start_date || company?.created_at || null;
  const endRaw = company?.subscription_end_date || null;
  if (!startRaw && !endRaw) return { start: null, end: null };
  const start = startRaw ? new Date(startRaw) : null;
  if (start && Number.isNaN(start.getTime())) return { start: null, end: null };
  let end = endRaw ? new Date(endRaw) : null;
  if (end && Number.isNaN(end.getTime())) end = null;
  if (!end && start) {
    end = new Date(start);
    end.setDate(end.getDate() + 365);
  }
  return { start, end };
}

function formatPlanWithLimits(c) {
  const plan = (c.plan_code || 'starter').toLowerCase();
  const planLabel = PLAN_DISPLAY_NAME[plan] || plan.charAt(0).toUpperCase() + plan.slice(1);
  const staffCap =
    c.employee_limit_override != null && c.employee_limit_override !== ''
      ? Number(c.employee_limit_override)
      : PLAN_EMPLOYEE_CAP[plan];
  const staffLabel = staffCap == null ? 'No default cap' : `${staffCap} staff max`;
  const branchTotal =
    c.branch_limit_override == null ? '—' : String(1 + Number(c.branch_limit_override || 0));
  return `${planLabel} · ${staffLabel} · ${branchTotal} branch(es)`;
}

function paymentStatusBadgeClass(status) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'trial':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'pending':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'overdue':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'unpaid':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function formatCurrencyInr(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return String(n);
  }
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
  const [approveModalCompany, setApproveModalCompany] = useState(null);
  const [approveSaving, setApproveSaving] = useState(false);
  const [approveForm, setApproveForm] = useState({
    plan_code: 'starter',
    subscription_start_date: new Date().toISOString().slice(0, 10),
    subscription_end_date: '',
    branches_allowed: 1,
    staffs_allowed: 25,
    onetime_fee_amount: '',
    amc_amount: '',
    last_amc_payment_date: '',
    onetime_fee_paid: false,
  });
  const [enquiries, setEnquiries] = useState([]);
  const [enquiriesLoading, setEnquiriesLoading] = useState(false);
  const [enquiriesError, setEnquiriesError] = useState('');
  const [billingForm, setBillingForm] = useState({
    plan_code: 'starter',
    billing_cycle: 'annual',
    next_billing_date: '',
    onetime_payment_status: 'unpaid',
    amc_payment_status: 'unpaid',
    billing_notes: '',
    subscription_start_date: '',
    subscription_end_date: '',
    is_active: true,
    onetime_fee_amount: '',
    amc_amount: '',
    last_amc_payment_date: '',
    last_onetime_payment_date: '',
  });
  const [billingSaving, setBillingSaving] = useState(false);
  const [resetModalCompany, setResetModalCompany] = useState(null);
  const [resetForm, setResetForm] = useState({
    admin_email: '',
    admin_user_id: '',
    new_password: '',
    confirm_new_password: '',
  });
  const [resetSaving, setResetSaving] = useState(false);
  const [lockBusyId, setLockBusyId] = useState(null);
  const [detailsCompany, setDetailsCompany] = useState(null);
  const [collectionsQueue, setCollectionsQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilter, setQueueFilter] = useState('all');
  const [renewBusyId, setRenewBusyId] = useState(null);
  const [dashboardAudit, setDashboardAudit] = useState([]);
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [limitsForm, setLimitsForm] = useState({
    branches_allowed_total: '',
    staffs_allowed: '',
  });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState(() => {
    const t = new Date().toISOString().slice(0, 10);
    const e = new Date(t);
    e.setFullYear(e.getFullYear() + 1);
    return {
      company_name: '',
      company_email: '',
      phone: '',
      address: '',
      admin_name: '',
      admin_email: '',
      admin_password: '',
      plan_code: 'starter',
      subscription_start_date: t,
      subscription_end_date: e.toISOString().slice(0, 10),
      branches_allowed: 1,
      staffs_allowed: 25,
      onetime_fee_amount: '',
      amc_amount: '',
      onetime_fee_paid: false,
      last_amc_payment_date: '',
    };
  });

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

  const loadDashboardAudit = useCallback(async () => {
    if (!adminKey) return;
    try {
      const res = await adminFetch('/recent-superadmin-audit?limit=50', {}, adminKey);
      if (!res.ok) throw new Error('Failed to load audit');
      const json = await res.json();
      setDashboardAudit(Array.isArray(json.data) ? json.data : []);
    } catch {
      setDashboardAudit([]);
    }
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    loadDashboardAudit();
  }, [adminKey, loadDashboardAudit]);

  useEffect(() => {
    if (!detailsCompany?.id) {
      setLimitsForm({ branches_allowed_total: '', staffs_allowed: '' });
      return;
    }
    const branchesAllowedTotal =
      detailsCompany.branch_limit_override == null
        ? ''
        : String(1 + Number(detailsCompany.branch_limit_override || 0));
    const staffsAllowed =
      detailsCompany.employee_limit_override == null ? '' : String(detailsCompany.employee_limit_override);
    setLimitsForm({
      branches_allowed_total: branchesAllowedTotal,
      staffs_allowed: staffsAllowed,
    });
  }, [detailsCompany]);

  useLayoutEffect(() => {
    if (!detailsCompany?.id) return;
    const company = detailsCompany;
    const toDateInput = (value) =>
      value ? new Date(value).toISOString().slice(0, 10) : '';
    setBillingForm({
      plan_code: company.plan_code || 'starter',
      billing_cycle: 'annual',
      next_billing_date: toDateInput(company.subscription_end_date || company.next_billing_date),
      onetime_payment_status: company.onetime_payment_status || 'unpaid',
      amc_payment_status: company.amc_payment_status || 'unpaid',
      billing_notes: company.billing_notes || '',
      subscription_start_date: toDateInput(company.subscription_start_date),
      subscription_end_date: toDateInput(company.subscription_end_date),
      is_active: company.is_active !== false,
      onetime_fee_amount: company.onetime_fee_amount != null ? String(company.onetime_fee_amount) : '',
      amc_amount: company.amc_amount != null ? String(company.amc_amount) : '',
      last_amc_payment_date: toDateInput(company.last_amc_payment_date),
      last_onetime_payment_date: toDateInput(company.last_onetime_payment_date),
    });
  }, [detailsCompany]);

  const handleLimitsChange = (e) => {
    const { name, value } = e.target;
    setLimitsForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveLimits = async () => {
    if (!detailsCompany?.id || limitsSaving) return;
    setLimitsSaving(true);
    try {
      const companyId = detailsCompany.id;

      // Branches: UI is total branches including Main; backend stores "extra branches beyond Main".
      if (limitsForm.branches_allowed_total !== '') {
        const total = Number(limitsForm.branches_allowed_total);
        if (!Number.isInteger(total) || total < 1) {
          throw new Error('Branches allowed must be a positive integer (total, including Main).');
        }
        const override = Math.max(0, total - 1);
        const res = await adminFetch(
          '/set-company-branch-limit',
          {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId, branch_limit_override: override }),
          },
          adminKey
        );
        const text = await res.text();
        if (!res.ok) throw new Error(messageFromAdminErrorResponse(text, res.status));
      }

      // Staffs: employee_limit_override is the effective cap.
      if (limitsForm.staffs_allowed !== '') {
        const n = Number(limitsForm.staffs_allowed);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error('Staffs allowed must be a positive integer.');
        }
        const res = await adminFetch(
          '/set-company-employee-limit',
          {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId, employee_limit_override: n }),
          },
          adminKey
        );
        const text = await res.text();
        if (!res.ok) throw new Error(messageFromAdminErrorResponse(text, res.status));
      }

      setToast({ type: 'success', message: 'Limits updated.' });
      loadOverview();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to update limits' });
    } finally {
      setLimitsSaving(false);
    }
  };

  const openCreateModal = () => {
    const t = new Date().toISOString().slice(0, 10);
    const e = new Date(t);
    e.setFullYear(e.getFullYear() + 1);
    setCreateForm({
      company_name: '',
      company_email: '',
      phone: '',
      address: '',
      admin_name: '',
      admin_email: '',
      admin_password: '',
      plan_code: 'starter',
      subscription_start_date: t,
      subscription_end_date: e.toISOString().slice(0, 10),
      branches_allowed: 1,
      staffs_allowed: 25,
      onetime_fee_amount: '',
      amc_amount: '',
      onetime_fee_paid: false,
      last_amc_payment_date: '',
    });
    setCreateSaving(false);
    setCreateModalOpen(true);
  };

  const handleCreateFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCreateForm((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'subscription_start_date' && value) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) {
          d.setFullYear(d.getFullYear() + 1);
          next.subscription_end_date = d.toISOString().slice(0, 10);
        }
      }
      return next;
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (createSaving) return;
    if (!createForm.company_name.trim() || !createForm.admin_name.trim() || !createForm.admin_email.trim()) {
      setToast({ type: 'error', message: 'Company name, admin name, and admin email are required.' });
      return;
    }
    if (!createForm.admin_password || createForm.admin_password.length < 8) {
      setToast({ type: 'error', message: 'Admin password is required (min 8 characters).' });
      return;
    }
    setCreateSaving(true);
    try {
      const end =
        createForm.subscription_end_date ||
        (() => {
          const d = new Date(createForm.subscription_start_date);
          d.setFullYear(d.getFullYear() + 1);
          return d.toISOString().slice(0, 10);
        })();
      const res = await adminFetch(
        '/create-company',
        {
          method: 'POST',
          body: JSON.stringify({
            company: {
              name: createForm.company_name.trim(),
              email: createForm.company_email.trim() || null,
              phone: createForm.phone.trim() || null,
              address: createForm.address.trim() || null,
            },
            admin: {
              name: createForm.admin_name.trim(),
              email: createForm.admin_email.trim(),
              password: createForm.admin_password,
            },
            plan_code: createForm.plan_code,
            subscription_start_date: createForm.subscription_start_date,
            subscription_end_date: end,
            branches_allowed: Number(createForm.branches_allowed),
            staffs_allowed: Number(createForm.staffs_allowed),
            payment_status: 'unpaid',
            onetime_fee_paid: createForm.onetime_fee_paid === true,
            onetime_fee_amount: createForm.onetime_fee_amount ? Number(createForm.onetime_fee_amount) : null,
            amc_amount: createForm.amc_amount ? Number(createForm.amc_amount) : null,
            last_amc_payment_date: createForm.last_amc_payment_date || null,
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
      if (!res.ok) throw new Error(json.message || 'Create failed');
      const pwd = json?.data?.admin_password_plaintext_once;
      setToast({
        type: 'success',
        message: json.message || 'Company created.',
      });
      if (pwd) {
        window.alert(`Save these credentials for the client (password is not stored in plain text):\n\nEmail: ${json.data.user.email}\nPassword: ${pwd}`);
      }
      setCreateModalOpen(false);
      loadOverview();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to create company' });
    } finally {
      setCreateSaving(false);
    }
  };

  const handleKeySubmit = (e) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setKeyInput('');
  };

  const handleApprove = async (companyId) => {
    const company = Array.isArray(pending) ? pending.find((p) => p.id === companyId) : null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const defaultEnd = (() => {
      const d = new Date(todayStr);
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    })();
    setApproveForm({
      plan_code: 'starter',
      subscription_start_date: todayStr,
      subscription_end_date: defaultEnd,
      branches_allowed: 1,
      staffs_allowed: 25,
      onetime_fee_amount: '',
      amc_amount: '',
      last_amc_payment_date: '',
      onetime_fee_paid: false,
    });
    setApproveSaving(false);
    setApproveModalCompany(company || { id: companyId });
  };

  const handleApproveFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setApproveForm((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'subscription_start_date') {
        const start = value;
        if (start) {
          const d = new Date(start);
          if (!Number.isNaN(d.getTime())) {
            d.setFullYear(d.getFullYear() + 1);
            next.subscription_end_date = d.toISOString().slice(0, 10);
          }
        }
      }
      return next;
    });
  };

  const closeApproveModal = () => {
    setApproveModalCompany(null);
    setApproveSaving(false);
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!approveModalCompany?.id || approveSaving) return;

    const branchesAllowed = Number(approveForm.branches_allowed);
    const staffsAllowed = Number(approveForm.staffs_allowed);
    if (!Number.isInteger(branchesAllowed) || branchesAllowed < 1) {
      setToast({ type: 'error', message: 'Branches allowed must be at least 1.' });
      return;
    }
    if (!Number.isInteger(staffsAllowed) || staffsAllowed < 1) {
      setToast({ type: 'error', message: 'Staffs allowed must be at least 1.' });
      return;
    }
    if (!approveForm.subscription_start_date) {
      setToast({ type: 'error', message: 'Access start date is required.' });
      return;
    }
    if (!approveForm.plan_code) {
      setToast({ type: 'error', message: 'Pack (plan) is required.' });
      return;
    }

    setApproveSaving(true);
    setBusyId(approveModalCompany.id);
    try {
      const start = approveForm.subscription_start_date;
      const computedEnd =
        approveForm.subscription_end_date ||
        (() => {
          const d = new Date(start);
          d.setFullYear(d.getFullYear() + 1);
          return d.toISOString().slice(0, 10);
        })();

      const res = await adminFetch(
        '/approve-company',
        {
          method: 'POST',
          body: JSON.stringify({
            company_id: approveModalCompany.id,
            plan_code: approveForm.plan_code,
            payment_status: 'unpaid',
            subscription_start_date: start,
            subscription_end_date: computedEnd,
            last_payment_date: null,
            branches_allowed: branchesAllowed,
            staffs_allowed: staffsAllowed,
            onetime_fee_paid: approveForm.onetime_fee_paid === true,
            onetime_fee_amount:
              approveForm.onetime_fee_amount === '' || approveForm.onetime_fee_amount == null
                ? null
                : Number(approveForm.onetime_fee_amount),
            amc_amount:
              approveForm.amc_amount === '' || approveForm.amc_amount == null
                ? null
                : Number(approveForm.amc_amount),
            last_amc_payment_date: approveForm.last_amc_payment_date || null,
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
      if (!res.ok) throw new Error(json.message || 'Approve failed');
      setToast({ type: 'success', message: json.message || 'Company approved.' });
      closeApproveModal();
      loadPending();
      loadOverview();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to approve' });
      setApproveSaving(false);
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
      setToast({ type: 'success', message: json.message || 'Renewal updated.' });
      loadOverview();
      loadCollectionsQueue();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed renewal action' });
    } finally {
      setRenewBusyId(null);
    }
  };

  const handleBillingChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'subscription_start_date') {
      if (value) {
        const start = new Date(value);
        if (!Number.isNaN(start.getTime())) {
          const end = new Date(start);
          end.setFullYear(end.getFullYear() + 1);
          const endStr = end.toISOString().slice(0, 10);
          setBillingForm((prev) => ({
            ...prev,
            subscription_start_date: value,
            subscription_end_date: endStr,
            next_billing_date: endStr,
          }));
          return;
        }
      }
      setBillingForm((prev) => ({ ...prev, subscription_start_date: value }));
      return;
    }
    if (name === 'onetime_payment_status') {
      setBillingForm((prev) => {
        const next = { ...prev, onetime_payment_status: value };
        if (value === 'paid' && !String(prev.last_onetime_payment_date || '').trim()) {
          next.last_onetime_payment_date = new Date().toISOString().slice(0, 10);
        }
        return next;
      });
      return;
    }
    if (name === 'amc_payment_status') {
      setBillingForm((prev) => {
        const next = { ...prev, amc_payment_status: value };
        if (value === 'paid' && !String(prev.last_amc_payment_date || '').trim()) {
          next.last_amc_payment_date = new Date().toISOString().slice(0, 10);
        }
        return next;
      });
      return;
    }
    setBillingForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleBillingSubmit = async (e) => {
    e.preventDefault();
    if (!detailsCompany?.id) return;
    const computedStart = billingForm.subscription_start_date || new Date().toISOString().slice(0, 10);
    const computedEnd =
      billingForm.subscription_end_date ||
      (() => {
        const d = new Date(computedStart);
        d.setDate(d.getDate() + 365);
        return d.toISOString().slice(0, 10);
      })();
    setBillingSaving(true);
    try {
      const otcStatus = billingForm.onetime_payment_status || 'unpaid';
      const amcStatus = billingForm.amc_payment_status || 'unpaid';
      const onetimeAmt =
        billingForm.onetime_fee_amount === '' || billingForm.onetime_fee_amount == null
          ? null
          : Number(billingForm.onetime_fee_amount);
      const amcAmt =
        billingForm.amc_amount === '' || billingForm.amc_amount == null ? null : Number(billingForm.amc_amount);

      const res = await adminFetch(
        '/company-billing',
        {
          method: 'POST',
          body: JSON.stringify({
            company_id: detailsCompany.id,
            plan_code: billingForm.plan_code || 'starter',
            billing_cycle: 'annual',
            billing_notes: billingForm.billing_notes ?? '',
            subscription_start_date: computedStart,
            subscription_end_date: computedEnd,
            next_billing_date: computedEnd,
            is_active: billingForm.is_active !== false,
            onetime_payment_status: otcStatus,
            amc_payment_status: amcStatus,
            onetime_fee_paid: otcStatus === 'paid',
            onetime_fee_amount: onetimeAmt,
            amc_amount: amcAmt,
            last_amc_payment_date: billingForm.last_amc_payment_date || null,
            last_onetime_payment_date: billingForm.last_onetime_payment_date || null,
          }),
        },
        adminKey
      );
      let json = {};
      const rawText = await res.text();
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch {
        json = { message: rawText || `HTTP ${res.status}` };
      }
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        return;
      }
      if (!res.ok) {
        const detail =
          (typeof json.message === 'string' && json.message) ||
          (typeof json.error === 'string' && json.error) ||
          rawText ||
          `Request failed (${res.status})`;
        throw new Error(detail);
      }
      setToast({ type: 'success', message: json.message || 'Billing updated.' });
      if (json.data && typeof json.data === 'object') {
        setDetailsCompany((prev) =>
          prev && prev.id === json.data.id ? { ...prev, ...json.data } : prev
        );
      }
      loadOverview();
      loadCollectionsQueue();
      loadDashboardAudit();
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to update billing',
      });
    } finally {
      setBillingSaving(false);
    }
  };

  const openResetModal = (company) => {
    if (!company) return;
    setResetForm({
      admin_email: '',
      admin_user_id: '',
      new_password: '',
      confirm_new_password: '',
    });
    setResetSaving(false);
    setResetModalCompany(company);
  };

  const closeResetModal = () => {
    setResetModalCompany(null);
    setResetSaving(false);
  };

  const handleResetAdminPassword = async (e) => {
    e.preventDefault();
    if (!resetModalCompany || resetSaving) return;

    const adminEmail = resetForm.admin_email.trim();
    const adminUserId = resetForm.admin_user_id.trim();
    const newPassword = resetForm.new_password;
    const confirmPassword = resetForm.confirm_new_password;

    if (!adminEmail && !adminUserId) {
      setToast({ type: 'error', message: 'Enter admin email or admin user ID.' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setToast({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ type: 'error', message: 'New password and confirm password do not match.' });
      return;
    }

    setResetSaving(true);
    try {
      const payload = {
        company_id: resetModalCompany.id,
        new_password: newPassword,
      };
      if (adminEmail) payload.admin_email = adminEmail;
      if (adminUserId) payload.admin_user_id = Number(adminUserId);

      const res = await adminFetch('/reset-company-admin-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, adminKey);
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setKeyError('Invalid admin key');
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setAdminKey('');
        return;
      }
      if (!res.ok) {
        throw new Error(json.message || 'Failed to reset password');
      }
      setToast({ type: 'success', message: json.message || 'Admin password reset successfully.' });
      closeResetModal();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to reset password' });
      setResetSaving(false);
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
  const customers = companies.filter((c) => c.status === 'active' || c.status === 'locked');
  const filteredQueue = collectionsQueue.filter((item) => {
    if (queueFilter === 'expired') return getSubscriptionUrgency(item.subscription_end_date).isExpired;
    if (queueFilter === 'overdue') {
      return (
        item.onetime_payment_status === 'overdue' || item.amc_payment_status === 'overdue'
      );
    }
    if (queueFilter === 'pending') {
      return (
        item.onetime_payment_status === 'pending' || item.amc_payment_status === 'pending'
      );
    }
    if (queueFilter === 'unpaid') {
      return item.onetime_payment_status === 'unpaid' || item.amc_payment_status === 'unpaid';
    }
    return true;
  });
  const detailsDerived = detailsCompany ? deriveSubscriptionDates(detailsCompany) : { start: null, end: null };
  const detailsEndLabel = detailsDerived.end ? detailsDerived.end.toLocaleDateString() : null;
  const billingPlanHints = detailsCompany
    ? planDefaultLimits(billingForm.plan_code || detailsCompany.plan_code || 'starter')
    : { staffCap: null, branchTotal: null };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Business dashboard</h1>
            <p className="text-sm text-slate-500">
              Create tenants, approve signups, track one-time and AMC billing, and access windows in one place.
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-6">
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
                    {key === 'totalCompanies'
                      ? 'Σ'
                      : key === 'activeCompanies'
                        ? 'A'
                        : key === 'pendingCompanies'
                          ? 'P'
                          : key === 'declinedCompanies'
                            ? 'X'
                            : 'L'}
                  </span>
                </div>
                <p className="text-2xl font-semibold text-slate-900">
                  {overviewLoading && !overview ? '…' : value}
                </p>
              </article>
            );
          })}
        </div>

        {/* Create company */}
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white shadow-sm p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Provision a new company</h2>
            <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
              Creates an active tenant with admin login immediately—no approval step. Copy the generated password once and share it securely with your client.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-indigo-700 shrink-0 shadow-sm"
          >
            + Create company
          </button>
        </div>

        {/* Pending signup requests */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Pending signup requests</h2>
            <p className="text-xs text-slate-500">Review self-service registrations. Approve fills in plan, limits, and billing.</p>
          </div>
          {loading ? (
            <div className="p-6 text-center text-slate-500">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-6 text-center text-slate-500">No pending requests.</div>
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

        {/* Customers (approved tenants) */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Customers</h2>
              <p className="text-xs text-slate-500">
                Payment types are one-time fee and AMC only. Access dates are separate (validity window, not a payment line item).
              </p>
            </div>
            {overviewLoading && (
              <span className="text-xs text-slate-500">Refreshing…</span>
            )}
          </div>
          {overviewLoading && !overview ? (
            <div className="p-6 text-sm text-slate-500">Loading overview…</div>
          ) : customers.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No customers yet. Create a company above or approve a pending request.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Company</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Account</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">OTC pay</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">AMC pay</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Plan & limits</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Valid until</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">One-time</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Next AMC</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 w-[200px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => {
                    const derived = deriveSubscriptionDates(c);
                    const subEnd = derived.end ? derived.end.toLocaleDateString() : '—';
                    const urgency = getSubscriptionUrgency(derived.end ? derived.end.toISOString() : null);
                    const statusPillClasses =
                      c.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : c.status === 'locked'
                          ? 'bg-slate-100 text-slate-800 border-slate-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200';
                    const amcDueLabel = c.next_amc_due_date
                      ? new Date(c.next_amc_due_date).toLocaleDateString()
                      : '—';
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
                            className="font-medium text-slate-900 hover:text-indigo-600 hover:underline text-left"
                          >
                            {c.name || '—'}
                          </button>
                          <div className="text-xs text-slate-500">ID {c.id}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusPillClasses}`}
                          >
                            {c.status}
                          </span>
                          <div className="text-xs text-slate-500 mt-1">
                            {c.active_staff}/{c.total_staff} staff
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${paymentStatusBadgeClass(
                              c.onetime_payment_status || 'unpaid'
                            )}`}
                          >
                            {c.onetime_payment_status || 'unpaid'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${paymentStatusBadgeClass(
                              c.amc_payment_status || 'unpaid'
                            )}`}
                          >
                            {c.amc_payment_status || 'unpaid'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-700 leading-snug max-w-[220px]">
                          {formatPlanWithLimits(c)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs ${urgency.isUrgent ? 'text-rose-700 font-medium' : 'text-slate-700'}`}>
                            {subEnd}
                          </span>
                          {urgency.isUrgent && (
                            <div className="text-[11px] text-rose-600">
                              {urgency.isExpired ? 'Expired' : `${urgency.daysLeft}d left`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
                              c.onetime_fee_paid ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.onetime_fee_paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-700">
                          <div>{amcDueLabel}</div>
                          <div className="text-slate-500">{formatCurrencyInr(c.amc_amount)}</div>
                        </td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleLockToggle(c, c.status === 'locked' ? 'unlock' : 'lock')
                              }
                              disabled={lockBusyId === c.id}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {c.status === 'locked' ? 'Unlock' : 'Lock'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openResetModal(c)}
                              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
                            >
                              Pwd
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
              <p className="text-xs text-slate-500">Expiring access, or one-time / AMC unpaid, pending, or overdue.</p>
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
              <option value="unpaid">Unpaid</option>
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
                    <th className="px-4 py-2 text-left">Access valid until</th>
                    <th className="px-4 py-2 text-left">OTC / AMC</th>
                    <th className="px-4 py-2 text-left">Active staff</th>
                    <th className="px-4 py-2 text-left">Quick action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQueue.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-2">{q.name || `Company #${q.id}`}</td>
                      <td className="px-4 py-2">{q.subscription_end_date ? new Date(q.subscription_end_date).toLocaleDateString() : 'Not set'}</td>
                      <td className="px-4 py-2 text-xs text-slate-700">
                        <span className="block">
                          OTC: {q.onetime_payment_status || 'unpaid'}
                        </span>
                        <span className="block text-slate-500">
                          AMC: {q.amc_payment_status || 'unpaid'}
                        </span>
                      </td>
                      <td className="px-4 py-2">{q.active_staff || 0}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => handleRenewAction(q, 'renew_1_year')}
                          disabled={renewBusyId === q.id}
                          className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 disabled:opacity-50"
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

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-900">Super admin activity</h2>
            <p className="text-xs text-slate-500">Latest actions across all tenants (most recent first).</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {dashboardAudit.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No super admin actions logged yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {dashboardAudit.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] text-slate-500">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                      <p className="mt-0.5 font-medium text-slate-900 break-words">{a.action_type}</p>
                      {a.company_name && (
                        <p className="text-xs text-slate-600 truncate" title={a.company_name}>
                          {a.company_name}
                          {a.company_id != null ? ` · #${a.company_id}` : ''}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/login" className="text-blue-600 hover:underline">
            Back to login
          </Link>
        </p>

        {/* Company details modal */}
        {detailsCompany && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-details-title"
            onClick={() => setDetailsCompany(null)}
          >
            <div
              className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200/80 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex-shrink-0 border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 px-5 sm:px-6 py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Tenant</p>
                    <h2 id="company-details-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-900 truncate">
                      {detailsCompany.name || `Company #${detailsCompany.id}`}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-700">
                        ID {detailsCompany.id}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
                          detailsCompany.status === 'active'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : detailsCompany.status === 'locked'
                              ? 'border-slate-300 bg-slate-100 text-slate-800'
                              : detailsCompany.status === 'pending'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-rose-200 bg-rose-50 text-rose-800'
                        }`}
                      >
                        {detailsCompany.status}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${paymentStatusBadgeClass(
                          detailsCompany.onetime_payment_status || 'unpaid'
                        )}`}
                        title="One-time fee"
                      >
                        OTC: {detailsCompany.onetime_payment_status || 'unpaid'}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${paymentStatusBadgeClass(
                          detailsCompany.amc_payment_status || 'unpaid'
                        )}`}
                        title="Annual maintenance"
                      >
                        AMC: {detailsCompany.amc_payment_status || 'unpaid'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailsCompany(null)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center sm:text-left">
                    <p className="text-[11px] font-medium text-slate-500">Active staff</p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
                      {detailsCompany.active_staff ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center sm:text-left">
                    <p className="text-[11px] font-medium text-slate-500">Total staff</p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
                      {detailsCompany.total_staff ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-center sm:text-left sm:col-span-2">
                    <p className="text-[11px] font-medium text-slate-500">Access valid until</p>
                    <p className="mt-0.5 text-base font-semibold text-slate-900">
                      {detailsEndLabel || 'Not set'}
                    </p>
                    {detailsCompany.is_active === false && (
                      <p className="mt-1 text-xs text-rose-600">Access marked inactive</p>
                    )}
                  </div>
                </div>

                {/* Billing — same API as former billing modal */}
                <section className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">Billing & access</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Plan, access window (annual), one-time and AMC payments, and internal notes.
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Saved profile: {formatPlanWithLimits(detailsCompany)}
                  </p>
                  <form onSubmit={handleBillingSubmit} className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Plan</label>
                      <select
                        name="plan_code"
                        value={billingForm.plan_code}
                        onChange={handleBillingChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                      >
                        {ADMIN_PLAN_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          id="details-billing-is-active"
                          type="checkbox"
                          name="is_active"
                          checked={billingForm.is_active}
                          onChange={handleBillingChange}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Access active
                      </label>
                      <span className="text-xs text-slate-500">Renewal cycle: annual · editing start date sets valid till +1 year</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Access start</label>
                        <input
                          type="date"
                          name="subscription_start_date"
                          value={billingForm.subscription_start_date}
                          onChange={handleBillingChange}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Valid till (access end)</label>
                        <input
                          type="date"
                          name="next_billing_date"
                          value={billingForm.subscription_end_date || billingForm.next_billing_date}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBillingForm((prev) => ({
                              ...prev,
                              next_billing_date: val,
                              subscription_end_date: val,
                            }));
                          }}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-4">
                      <p className="text-xs font-semibold text-slate-800">One-time fee</p>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Payment status</label>
                        <select
                          name="onetime_payment_status"
                          value={billingForm.onetime_payment_status}
                          onChange={handleBillingChange}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="trial">Trial</option>
                          <option value="paid">Paid</option>
                          <option value="pending">Pending</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">One-time amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          name="onetime_fee_amount"
                          value={billingForm.onetime_fee_amount}
                          onChange={handleBillingChange}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Last one-time payment date</label>
                        <input
                          type="date"
                          name="last_onetime_payment_date"
                          value={billingForm.last_onetime_payment_date}
                          onChange={handleBillingChange}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          When the one-time fee was actually paid (separate from annual AMC).
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                      <p className="text-xs font-semibold text-slate-800">AMC (annual)</p>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Payment status</label>
                        <select
                          name="amc_payment_status"
                          value={billingForm.amc_payment_status}
                          onChange={handleBillingChange}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="trial">Trial</option>
                          <option value="paid">Paid</option>
                          <option value="pending">Pending</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">AMC amount (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          name="amc_amount"
                          value={billingForm.amc_amount}
                          onChange={handleBillingChange}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                          placeholder="Annual maintenance"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Last AMC payment date</label>
                        <input
                          type="date"
                          name="last_amc_payment_date"
                          value={billingForm.last_amc_payment_date}
                          onChange={handleBillingChange}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Next AMC due in the customer list is this date + 1 year.
                        </p>
                      </div>
                      {detailsCompany.next_amc_due_date && (
                        <p className="text-xs text-slate-600">
                          <span className="font-medium text-slate-700">Next AMC due: </span>
                          {new Date(detailsCompany.next_amc_due_date).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Internal notes</label>
                      <textarea
                        name="billing_notes"
                        value={billingForm.billing_notes}
                        onChange={handleBillingChange}
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                        placeholder="Discounts, contract refs, cheque numbers, etc."
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                        disabled={billingSaving}
                      >
                        {billingSaving ? 'Saving…' : 'Save billing'}
                      </button>
                    </div>
                  </form>
                </section>

                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Contact */}
                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900">Contact</h3>
                    <p className="mt-0.5 text-xs text-slate-500">How you reach this company</p>
                    <dl className="mt-4 space-y-3">
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Email</dt>
                        <dd className="mt-0.5 text-sm text-slate-900 break-all">
                          {detailsCompany.email || <span className="text-slate-400 italic">Not set</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Phone</dt>
                        <dd className="mt-0.5 text-sm text-slate-900">
                          {detailsCompany.phone || <span className="text-slate-400 italic">Not set</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Created</dt>
                        <dd className="mt-0.5 text-sm text-slate-900">
                          {detailsCompany.created_at
                            ? new Date(detailsCompany.created_at).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  {/* Limits editor */}
                  <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900">Adjust limits</h3>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Caps apply to new staff/branches. Leave blank to use plan defaults below.
                    </p>
                    <p className="mt-3 text-xs text-slate-700 rounded-lg bg-white border border-indigo-100/80 px-3 py-2 leading-relaxed">
                      <span className="font-semibold text-slate-900">Defaults for selected plan</span>{' '}
                      (
                      {PLAN_DISPLAY_NAME[
                        (billingForm.plan_code || detailsCompany.plan_code || 'starter').toLowerCase()
                      ] || billingForm.plan_code}
                      ):{' '}
                      {billingPlanHints.staffCap != null
                        ? `${billingPlanHints.staffCap} staff`
                        : 'custom / negotiated staff'}
                      {billingPlanHints.branchTotal != null
                        ? ` · ${billingPlanHints.branchTotal} branch locations (incl. Main)`
                        : ' · custom branches'}
                      .
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Branches (total locations)
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          name="branches_allowed_total"
                          value={limitsForm.branches_allowed_total}
                          onChange={handleLimitsChange}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder="e.g. 3"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">Includes the default “Main” branch.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">Staff cap</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          name="staffs_allowed"
                          value={limitsForm.staffs_allowed}
                          onChange={handleLimitsChange}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          placeholder="e.g. 50"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={saveLimits}
                      disabled={limitsSaving}
                      className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto sm:px-6"
                    >
                      {limitsSaving ? 'Saving…' : 'Save limits'}
                    </button>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}

        {resetModalCompany && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-1">
                Reset admin password – {resetModalCompany.name || `Company #${resetModalCompany.id}`}
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Enter admin email (or user ID) and a new temporary password. Share it securely.
              </p>
              <form onSubmit={handleResetAdminPassword} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Admin email
                    </label>
                    <input
                      type="email"
                      value={resetForm.admin_email}
                      onChange={(e) => setResetForm((prev) => ({ ...prev, admin_email: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      placeholder="admin@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Admin user ID (optional)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={resetForm.admin_user_id}
                      onChange={(e) => setResetForm((prev) => ({ ...prev, admin_user_id: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      placeholder="e.g. 42"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      New password
                    </label>
                    <input
                      type="password"
                      value={resetForm.new_password}
                      onChange={(e) => setResetForm((prev) => ({ ...prev, new_password: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      minLength={8}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      value={resetForm.confirm_new_password}
                      onChange={(e) => setResetForm((prev) => ({ ...prev, confirm_new_password: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      minLength={8}
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    disabled={resetSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                    disabled={resetSaving}
                  >
                    {resetSaving ? 'Resetting…' : 'Reset password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {approveModalCompany && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-1">
                Approve company – {approveModalCompany.name || `Company #${approveModalCompany.id}`}
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Fill these required details. Renewal auto-updates to 1 year from subscription start (editable).
              </p>

              <form onSubmit={handleApproveSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Pack chosen</label>
                    <select
                      name="plan_code"
                      value={approveForm.plan_code}
                      onChange={handleApproveFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                    >
                      {ADMIN_PLAN_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Access start
                    </label>
                    <input
                      type="date"
                      name="subscription_start_date"
                      value={approveForm.subscription_start_date}
                      onChange={handleApproveFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Next renewal (access end)
                    </label>
                    <input
                      type="date"
                      name="subscription_end_date"
                      value={approveForm.subscription_end_date}
                      onChange={handleApproveFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      How many branches allowed? (total)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      name="branches_allowed"
                      value={approveForm.branches_allowed}
                      onChange={handleApproveFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      required
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Includes the default “Main” branch.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      How many staffs allowed?
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      name="staffs_allowed"
                      value={approveForm.staffs_allowed}
                      onChange={handleApproveFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
                  <p className="text-xs font-semibold text-slate-800">One-time fee & AMC</p>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      name="onetime_fee_paid"
                      checked={!!approveForm.onetime_fee_paid}
                      onChange={handleApproveFormChange}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                    One-time fee received
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">One-time amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        name="onetime_fee_amount"
                        value={approveForm.onetime_fee_amount}
                        onChange={handleApproveFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">AMC amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        name="amc_amount"
                        value={approveForm.amc_amount}
                        onChange={handleApproveFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Last AMC paid on</label>
                    <input
                      type="date"
                      name="last_amc_payment_date"
                      value={approveForm.last_amc_payment_date}
                      onChange={handleApproveFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Next AMC due = this date + 1 year (shown in the customer list).
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeApproveModal}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    disabled={approveSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    disabled={approveSaving}
                  >
                    {approveSaving ? 'Approving…' : 'Approve company'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 overflow-y-auto">
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-slate-200 p-6 my-auto max-h-[90vh] overflow-y-auto">
              <h2 className="text-base font-semibold text-slate-900 mb-1">Create company</h2>
              <p className="text-xs text-slate-500 mb-4">
                Tenant is active immediately. Share the admin password securely with the client (shown once after save).
              </p>
              <form onSubmit={handleCreateSubmit} className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Company name *</label>
                    <input
                      name="company_name"
                      value={createForm.company_name}
                      onChange={handleCreateFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Company email</label>
                    <input
                      type="email"
                      name="company_email"
                      value={createForm.company_email}
                      onChange={handleCreateFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      name="phone"
                      value={createForm.phone}
                      onChange={handleCreateFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                    <input
                      name="address"
                      value={createForm.address}
                      onChange={handleCreateFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-3 mt-1">
                  <p className="text-xs font-semibold text-slate-800 mb-2">Admin login</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Admin name *</label>
                      <input
                        name="admin_name"
                        value={createForm.admin_name}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Admin email *</label>
                      <input
                        type="email"
                        name="admin_email"
                        value={createForm.admin_email}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Admin password * (min 8)</label>
                      <input
                        type="password"
                        name="admin_password"
                        value={createForm.admin_password}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        autoComplete="new-password"
                        required
                        minLength={8}
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-3 mt-1">
                  <p className="text-xs font-semibold text-slate-800 mb-2">Plan & access window</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Pack</label>
                      <select
                        name="plan_code"
                        value={createForm.plan_code}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      >
                        {ADMIN_PLAN_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Access start</label>
                      <input
                        type="date"
                        name="subscription_start_date"
                        value={createForm.subscription_start_date}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Access end</label>
                      <input
                        type="date"
                        name="subscription_end_date"
                        value={createForm.subscription_end_date}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Branches (total)</label>
                      <input
                        type="number"
                        min="1"
                        name="branches_allowed"
                        value={createForm.branches_allowed}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Staff cap</label>
                      <input
                        type="number"
                        min="1"
                        name="staffs_allowed"
                        value={createForm.staffs_allowed}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      name="onetime_fee_paid"
                      checked={!!createForm.onetime_fee_paid}
                      onChange={handleCreateFormChange}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    One-time fee received
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">One-time amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        name="onetime_fee_amount"
                        value={createForm.onetime_fee_amount}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">AMC amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        name="amc_amount"
                        value={createForm.amc_amount}
                        onChange={handleCreateFormChange}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Last AMC paid on</label>
                    <input
                      type="date"
                      name="last_amc_payment_date"
                      value={createForm.last_amc_payment_date}
                      onChange={handleCreateFormChange}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    disabled={createSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    disabled={createSaving}
                  >
                    {createSaving ? 'Creating…' : 'Create company'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto fixed top-4 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {toast.message}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-3 text-xs font-medium underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
