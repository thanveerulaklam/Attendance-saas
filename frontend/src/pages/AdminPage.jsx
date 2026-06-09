import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  PLAN_EMPLOYEE_CAP,
  PLAN_DISPLAY_NAME,
  planDefaultLimits,
  planOptionsForAdminSelect,
} from '../constants/pricingPlans';
import AdminFinanceSection from './AdminFinanceSection';

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

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function getDateUrgency(iso, warnDays = 30) {
  const daysLeft = daysUntil(iso);
  if (daysLeft === null) return { text: 'Not set', level: 'none', daysLeft: null };
  if (daysLeft < 0) {
    return { text: `${Math.abs(daysLeft)}d overdue`, level: 'critical', daysLeft };
  }
  if (daysLeft <= warnDays) {
    return { text: daysLeft === 0 ? 'Due today' : `${daysLeft}d left`, level: 'warn', daysLeft };
  }
  return { text: `${daysLeft}d left`, level: 'ok', daysLeft };
}

function urgencyRowClass(level) {
  if (level === 'critical') return 'bg-rose-50/80';
  if (level === 'warn') return 'bg-amber-50/50';
  return '';
}

function urgencyTextClass(level) {
  if (level === 'critical') return 'text-rose-700 font-semibold';
  if (level === 'warn') return 'text-amber-800 font-medium';
  return 'text-slate-700';
}

function paymentNeedsAttention(status) {
  return ['unpaid', 'overdue', 'pending'].includes(status || 'unpaid');
}

function isOnetimePaid(company) {
  if (!company) return false;
  if (company.onetime_fee_paid === true) return true;
  return (company.onetime_payment_status || 'unpaid') === 'paid';
}

function getBillingAttentionReasons(company) {
  const reasons = [];
  const accessEnd = company.subscription_end_date || deriveSubscriptionDates(company).end?.toISOString?.();
  const access = getSubscriptionUrgency(accessEnd);
  const amcDue = getDateUrgency(company.next_amc_due_date, 30);
  const otc = company.onetime_payment_status || 'unpaid';
  const amc = company.amc_payment_status || 'unpaid';

  if (access.isExpired) reasons.push('Access expired');
  else if (access.isUrgent && access.daysLeft != null) reasons.push(`Access ends in ${access.daysLeft}d`);
  if (amcDue.level === 'critical') reasons.push(`AMC overdue (${amcDue.text})`);
  else if (amcDue.level === 'warn') reasons.push(`AMC due soon (${amcDue.text})`);
  if (paymentNeedsAttention(otc)) reasons.push(`One-time ${otc}`);
  if (paymentNeedsAttention(amc)) reasons.push(`AMC ${amc}`);
  if (company.status === 'locked') reasons.push('Account locked');
  return reasons;
}

function companyNeedsBillingAttention(company) {
  return getBillingAttentionReasons(company).length > 0;
}

function computeNextAmcDueDateClient(company) {
  if (!company) return null;
  const addYear = (dateLike) => {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  };
  if (company.last_amc_payment_date) return addYear(company.last_amc_payment_date);
  if (company.last_onetime_payment_date) return addYear(company.last_onetime_payment_date);
  if (company.subscription_start_date) return addYear(company.subscription_start_date);
  return null;
}

function buildBillingPayloadFromCompany(company, patch = {}) {
  const derived = deriveSubscriptionDates(company);
  return {
    company_id: company.id,
    plan_code: company.plan_code || 'starter',
    billing_notes: company.billing_notes || '',
    subscription_start_date: toDateInputValue(company.subscription_start_date || derived.start),
    subscription_end_date: toDateInputValue(company.subscription_end_date || derived.end),
    is_active: company.is_active !== false,
    onetime_payment_status: company.onetime_payment_status || 'unpaid',
    amc_payment_status: company.amc_payment_status || 'unpaid',
    onetime_fee_paid: company.onetime_fee_paid === true || company.onetime_payment_status === 'paid',
    onetime_fee_amount: company.onetime_fee_amount ?? '',
    amc_amount: company.amc_amount ?? '',
    last_amc_payment_date: toDateInputValue(company.last_amc_payment_date),
    last_onetime_payment_date: toDateInputValue(company.last_onetime_payment_date),
    ...patch,
  };
}

function PaymentStatusPill({ status, label }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${paymentStatusBadgeClass(
        status || 'unpaid'
      )}`}
      title={label}
    >
      {status || 'unpaid'}
    </span>
  );
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
  const [deleteCompanyTarget, setDeleteCompanyTarget] = useState(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteConfirmPhrase, setDeleteConfirmPhrase] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [lockBusyId, setLockBusyId] = useState(null);
  const [detailsCompany, setDetailsCompany] = useState(null);
  const [collectionsQueue, setCollectionsQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueFilter, setQueueFilter] = useState('all');
  const [customerBillingFilter, setCustomerBillingFilter] = useState('all');
  const [renewBusyId, setRenewBusyId] = useState(null);
  const [billingQuickBusyId, setBillingQuickBusyId] = useState(null);
  const [adminTab, setAdminTab] = useState('operations');
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

  const handleAdminAuthError = () => {
    setKeyError('Invalid admin key');
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey('');
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
      if (detailsCompany?.id === company.id && json.data) {
        setDetailsCompany((prev) => {
          if (!prev) return prev;
          const merged = { ...prev, ...json.data };
          return { ...merged, next_amc_due_date: computeNextAmcDueDateClient(merged) };
        });
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed renewal action' });
    } finally {
      setRenewBusyId(null);
    }
  };

  const patchCompanyBilling = async (company, patch, successMessage) => {
    if (!company?.id) return;
    setBillingQuickBusyId(company.id);
    try {
      const res = await adminFetch(
        '/company-billing',
        {
          method: 'POST',
          body: JSON.stringify(buildBillingPayloadFromCompany(company, patch)),
        },
        adminKey
      );
      const text = await res.text();
      if (!res.ok) throw new Error(messageFromAdminErrorResponse(text, res.status));
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      setToast({ type: 'success', message: successMessage || json.message || 'Billing updated.' });
      if (json.data && detailsCompany?.id === company.id) {
        setDetailsCompany((prev) => {
          if (!prev) return prev;
          const merged = { ...prev, ...json.data };
          return { ...merged, next_amc_due_date: computeNextAmcDueDateClient(merged) };
        });
      }
      loadOverview();
      loadCollectionsQueue();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to update billing' });
    } finally {
      setBillingQuickBusyId(null);
    }
  };

  const quickMarkAmcPaid = (company) => {
    const today = new Date().toISOString().slice(0, 10);
    return patchCompanyBilling(
      company,
      { amc_payment_status: 'paid', last_amc_payment_date: today },
      'AMC marked as received today.'
    );
  };

  const quickMarkOtcPaid = (company) => {
    const today = new Date().toISOString().slice(0, 10);
    return patchCompanyBilling(
      company,
      {
        onetime_payment_status: 'paid',
        onetime_fee_paid: true,
        last_onetime_payment_date: today,
      },
      'One-time fee marked as received today.'
    );
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
        setDetailsCompany((prev) => {
          if (!prev || prev.id !== json.data.id) return prev;
          const merged = { ...prev, ...json.data };
          return { ...merged, next_amc_due_date: computeNextAmcDueDateClient(merged) };
        });
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

  const openDeleteModal = (company) => {
    if (!company) return;
    setDeleteCompanyTarget(company);
    setDeleteStep(1);
    setDeleteAcknowledged(false);
    setDeleteConfirmName('');
    setDeleteConfirmPhrase('');
    setDeleteSaving(false);
  };

  const closeDeleteModal = () => {
    setDeleteCompanyTarget(null);
    setDeleteStep(1);
    setDeleteAcknowledged(false);
    setDeleteConfirmName('');
    setDeleteConfirmPhrase('');
    setDeleteSaving(false);
  };

  const deleteTargetName = deleteCompanyTarget?.name ? String(deleteCompanyTarget.name).trim() : '';
  const deleteNameMatches =
    deleteTargetName !== '' &&
    deleteConfirmName.trim().toLowerCase() === deleteTargetName.toLowerCase();
  const deletePhraseMatches = deleteConfirmPhrase.trim() === 'DELETE';

  const handleDeleteCompany = async () => {
    if (!deleteCompanyTarget?.id || deleteSaving || deleteStep !== 2) return;
    if (!deleteAcknowledged || !deleteNameMatches || !deletePhraseMatches) {
      setToast({ type: 'error', message: 'Complete all confirmation steps before deleting.' });
      return;
    }
    setDeleteSaving(true);
    try {
      const res = await adminFetch(
        '/delete-company',
        {
          method: 'POST',
          body: JSON.stringify({
            company_id: deleteCompanyTarget.id,
            confirm_name: deleteConfirmName.trim(),
            confirm_phrase: deleteConfirmPhrase.trim(),
          }),
        },
        adminKey
      );
      const text = await res.text();
      if (!res.ok) throw new Error(messageFromAdminErrorResponse(text, res.status));
      let json = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      setToast({ type: 'success', message: json.message || 'Company deleted.' });
      closeDeleteModal();
      setDetailsCompany(null);
      loadOverview();
      loadPending();
      loadCollectionsQueue();
      loadDashboardAudit();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to delete company' });
    } finally {
      setDeleteSaving(false);
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
    if (queueFilter === 'amc_due') {
      const u = getDateUrgency(item.next_amc_due_date, 30);
      return u.level === 'critical' || u.level === 'warn';
    }
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

  const billingMetrics = {
    needAction: collectionsQueue.length,
    accessExpiring: customers.filter((c) => {
      const d = daysUntil(c.subscription_end_date);
      return d != null && d <= 30;
    }).length,
    amcDueSoon: customers.filter((c) => {
      const u = getDateUrgency(c.next_amc_due_date, 30);
      return u.level === 'critical' || u.level === 'warn';
    }).length,
    unpaidOtc: customers.filter((c) => paymentNeedsAttention(c.onetime_payment_status)).length,
    unpaidAmc: customers.filter((c) => paymentNeedsAttention(c.amc_payment_status)).length,
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    const aNeeds = companyNeedsBillingAttention(a) ? 0 : 1;
    const bNeeds = companyNeedsBillingAttention(b) ? 0 : 1;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    const aAccess = daysUntil(a.subscription_end_date);
    const bAccess = daysUntil(b.subscription_end_date);
    if (aAccess != null && bAccess != null && aAccess !== bAccess) return aAccess - bAccess;
    const aAmc = daysUntil(a.next_amc_due_date);
    const bAmc = daysUntil(b.next_amc_due_date);
    if (aAmc != null && bAmc != null && aAmc !== bAmc) return aAmc - bAmc;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const displayedCustomers = sortedCustomers.filter((c) => {
    if (customerBillingFilter === 'all') return true;
    if (customerBillingFilter === 'action') return companyNeedsBillingAttention(c);
    if (customerBillingFilter === 'renewal') {
      const access = getSubscriptionUrgency(c.subscription_end_date);
      const amc = getDateUrgency(c.next_amc_due_date, 30);
      return access.isUrgent || amc.level === 'critical' || amc.level === 'warn';
    }
    if (customerBillingFilter === 'payments') {
      return (
        paymentNeedsAttention(c.onetime_payment_status) ||
        paymentNeedsAttention(c.amc_payment_status)
      );
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
      <div className="max-w-7xl mx-auto">
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

        <nav className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
          <button
            type="button"
            onClick={() => setAdminTab('operations')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              adminTab === 'operations'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Operations
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('accounts')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              adminTab === 'accounts'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Accounts
          </button>
        </nav>

        {adminTab === 'accounts' ? (
          <AdminFinanceSection
            adminKey={adminKey}
            onAuthError={handleAdminAuthError}
            setToast={setToast}
          />
        ) : (
          <>
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

        {/* Billing & renewals at a glance */}
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-amber-50/40 shadow-sm p-4 mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Billing & renewals</h2>
              <p className="text-xs text-slate-600 mt-0.5 max-w-2xl">
                One-time fee unlocks the first year; AMC renews access each year after that. Use the action queue
                below to collect payments and extend access.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomerBillingFilter('action');
                document.getElementById('billing-action-queue')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700"
            >
              View action queue ({billingMetrics.needAction})
            </button>
          </div>
          <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
            {[
              {
                key: 'needAction',
                label: 'Needs attention',
                value: billingMetrics.needAction,
                tone: billingMetrics.needAction > 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white',
                valueTone: billingMetrics.needAction > 0 ? 'text-rose-700' : 'text-slate-900',
              },
              {
                key: 'accessExpiring',
                label: 'Access ≤ 30 days',
                value: billingMetrics.accessExpiring,
                tone: billingMetrics.accessExpiring > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white',
                valueTone: billingMetrics.accessExpiring > 0 ? 'text-amber-800' : 'text-slate-900',
              },
              {
                key: 'amcDueSoon',
                label: 'AMC due ≤ 30 days',
                value: billingMetrics.amcDueSoon,
                tone: billingMetrics.amcDueSoon > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white',
                valueTone: billingMetrics.amcDueSoon > 0 ? 'text-amber-800' : 'text-slate-900',
              },
              {
                key: 'unpaidOtc',
                label: 'One-time unpaid+',
                value: billingMetrics.unpaidOtc,
                tone: billingMetrics.unpaidOtc > 0 ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white',
                valueTone: 'text-slate-900',
              },
              {
                key: 'unpaidAmc',
                label: 'AMC unpaid+',
                value: billingMetrics.unpaidAmc,
                tone: billingMetrics.unpaidAmc > 0 ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white',
                valueTone: 'text-slate-900',
              },
            ].map((card) => (
              <div key={card.key} className={`rounded-xl border px-3 py-3 ${card.tone}`}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${card.valueTone}`}>{card.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Action queue — collections */}
        <div
          id="billing-action-queue"
          className="rounded-xl border-2 border-amber-200 bg-white shadow-sm overflow-hidden mb-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-amber-100 bg-amber-50/60">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Action queue</h2>
              <p className="text-xs text-slate-600">
                Expiring access, AMC due, or payment not received — take action without opening each tenant first.
              </p>
            </div>
            <select
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value="all">All flagged</option>
              <option value="expired">Access expired</option>
              <option value="amc_due">AMC due soon</option>
              <option value="overdue">Payment overdue</option>
              <option value="pending">Payment pending</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          {queueLoading ? (
            <div className="p-6 text-sm text-slate-500">Loading action queue…</div>
          ) : filteredQueue.length === 0 ? (
            <div className="p-6 text-sm text-emerald-700 bg-emerald-50/50">
              No tenants need billing action right now.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-700">Company</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-700">Why flagged</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-700">Access valid until</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-700">One-time</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-700">AMC</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-700 min-w-[220px]">Quick actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQueue.map((q) => {
                    const reasons = getBillingAttentionReasons(q);
                    const accessUrgency = getDateUrgency(q.subscription_end_date, 30);
                    const amcUrgency = getDateUrgency(q.next_amc_due_date, 30);
                    const busy = renewBusyId === q.id || billingQuickBusyId === q.id;
                    return (
                      <tr key={q.id} className={urgencyRowClass(accessUrgency.level === 'critical' ? 'critical' : amcUrgency.level)}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setDetailsCompany(q)}
                            className="font-medium text-slate-900 hover:text-indigo-600 hover:underline text-left"
                          >
                            {q.name || `Company #${q.id}`}
                          </button>
                          <div className="text-[11px] text-slate-500 capitalize">{q.status}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {reasons.map((r) => (
                              <span
                                key={r}
                                className="inline-flex rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={urgencyTextClass(accessUrgency.level)}>{formatDateShort(q.subscription_end_date)}</div>
                          <div className="text-[11px] text-slate-500">{accessUrgency.text}</div>
                        </td>
                        <td className="px-4 py-3">
                          <PaymentStatusPill status={q.onetime_payment_status} />
                          <div className="mt-1 text-xs text-slate-600">{formatCurrencyInr(q.onetime_fee_amount)}</div>
                          {q.last_onetime_payment_date && (
                            <div className="text-[11px] text-slate-500">Paid {formatDateShort(q.last_onetime_payment_date)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <PaymentStatusPill status={q.amc_payment_status} />
                          <div className={`mt-1 text-xs ${urgencyTextClass(amcUrgency.level)}`}>
                            Due {formatDateShort(q.next_amc_due_date)}
                          </div>
                          <div className="text-[11px] text-slate-500">{formatCurrencyInr(q.amc_amount)} / yr</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRenewAction(q, 'renew_1_year')}
                              className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              +1 yr access
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => quickMarkAmcPaid(q)}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              AMC received
                            </button>
                            {!isOnetimePaid(q) && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => quickMarkOtcPaid(q)}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                One-time received
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDetailsCompany(q)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                            >
                              Details
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
              <table className="w-full min-w-[760px] text-sm text-slate-900">
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
                          <button
                            type="button"
                            onClick={() => openDeleteModal(row)}
                            disabled={busyId === row.id || deleteSaving}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Delete
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

        {/* All customers — billing register */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">All customers — billing register</h2>
              <p className="text-xs text-slate-500">
                Sorted by urgency. Click a row for full billing form, limits, and account controls.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {overviewLoading && <span className="text-xs text-slate-500">Refreshing…</span>}
              <select
                value={customerBillingFilter}
                onChange={(e) => setCustomerBillingFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              >
                <option value="all">All customers</option>
                <option value="action">Needs attention</option>
                <option value="renewal">Renewal / access due</option>
                <option value="payments">Payment issues</option>
              </select>
            </div>
          </div>
          {overviewLoading && !overview ? (
            <div className="p-6 text-sm text-slate-500">Loading overview…</div>
          ) : displayedCustomers.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              {customers.length === 0
                ? 'No customers yet. Create a company above or approve a pending request.'
                : 'No customers match this filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm text-slate-900">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Company</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Access</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">One-time fee</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">AMC (annual)</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700">Plan</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-700 min-w-[200px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedCustomers.map((c) => {
                    const accessUrgency = getDateUrgency(c.subscription_end_date, 30);
                    const amcUrgency = getDateUrgency(c.next_amc_due_date, 30);
                    const rowLevel =
                      accessUrgency.level === 'critical' || amcUrgency.level === 'critical'
                        ? 'critical'
                        : accessUrgency.level === 'warn' || amcUrgency.level === 'warn'
                          ? 'warn'
                          : 'none';
                    const statusPillClasses =
                      c.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : c.status === 'locked'
                          ? 'bg-slate-100 text-slate-800 border-slate-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200';
                    const busy = renewBusyId === c.id || billingQuickBusyId === c.id;
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-slate-50/60 cursor-pointer ${urgencyRowClass(rowLevel)}`}
                        onClick={() => setDetailsCompany(c)}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{c.name || '—'}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">ID {c.id}</span>
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${statusPillClasses}`}
                            >
                              {c.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className={urgencyTextClass(accessUrgency.level)}>
                            {formatDateShort(c.subscription_end_date)}
                          </div>
                          <div className="text-[11px] text-slate-500">{accessUrgency.text}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <PaymentStatusPill status={c.onetime_payment_status} />
                          <div className="mt-1 text-xs font-medium text-slate-800">
                            {formatCurrencyInr(c.onetime_fee_amount)}
                          </div>
                          {c.last_onetime_payment_date && (
                            <div className="text-[11px] text-slate-500">
                              Received {formatDateShort(c.last_onetime_payment_date)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <PaymentStatusPill status={c.amc_payment_status} />
                          <div className={`mt-1 text-xs ${urgencyTextClass(amcUrgency.level)}`}>
                            Next due {formatDateShort(c.next_amc_due_date)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatCurrencyInr(c.amc_amount)} / yr
                            {c.last_amc_payment_date && (
                              <> · last {formatDateShort(c.last_amc_payment_date)}</>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-700 leading-snug max-w-[200px]">
                          {formatPlanWithLimits(c)}
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {c.active_staff}/{c.total_staff} staff
                          </div>
                        </td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRenewAction(c, 'renew_1_year')}
                              className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800 disabled:opacity-50"
                            >
                              +1 yr
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => quickMarkAmcPaid(c)}
                              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 disabled:opacity-50"
                            >
                              AMC paid
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetailsCompany(c)}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
                            >
                              Billing
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleLockToggle(c, c.status === 'locked' ? 'unlock' : 'lock')
                              }
                              disabled={lockBusyId === c.id}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 disabled:opacity-50"
                            >
                              {c.status === 'locked' ? 'Unlock' : 'Lock'}
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
              <table className="w-full min-w-[760px] text-sm text-slate-900">
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
          </>
        )}

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
                      onClick={() => openResetModal(detailsCompany)}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                    >
                      Reset tenant admin password
                    </button>
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
                <section className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Payments & renewal snapshot</h3>
                      <p className="mt-0.5 text-xs text-slate-600">
                        One-time covers year one; AMC renews each following year.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={renewBusyId === detailsCompany.id || billingQuickBusyId === detailsCompany.id}
                        onClick={() => handleRenewAction(detailsCompany, 'renew_1_year')}
                        className="rounded-lg border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Extend access +1 year
                      </button>
                      <button
                        type="button"
                        disabled={billingQuickBusyId === detailsCompany.id}
                        onClick={() => quickMarkAmcPaid(detailsCompany)}
                        className="rounded-lg border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        AMC received today
                      </button>
                      {!isOnetimePaid(detailsCompany) && (
                        <button
                          type="button"
                          disabled={billingQuickBusyId === detailsCompany.id}
                          onClick={() => quickMarkOtcPaid(detailsCompany)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          One-time received today
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Software access</p>
                      <p className={`mt-1 text-sm font-semibold ${urgencyTextClass(getDateUrgency(detailsCompany.subscription_end_date, 30).level)}`}>
                        Valid until {formatDateShort(detailsCompany.subscription_end_date)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {getDateUrgency(detailsCompany.subscription_end_date, 30).text}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Started {formatDateShort(detailsCompany.subscription_start_date)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">One-time fee</p>
                      <div className="mt-1 flex items-center gap-2">
                        <PaymentStatusPill status={detailsCompany.onetime_payment_status} />
                        <span className="text-sm font-semibold text-slate-900">
                          {formatCurrencyInr(detailsCompany.onetime_fee_amount)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Last received {formatDateShort(detailsCompany.last_onetime_payment_date)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">AMC (annual)</p>
                      <div className="mt-1 flex items-center gap-2">
                        <PaymentStatusPill status={detailsCompany.amc_payment_status} />
                        <span className="text-sm font-semibold text-slate-900">
                          {formatCurrencyInr(detailsCompany.amc_amount)}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${urgencyTextClass(getDateUrgency(detailsCompany.next_amc_due_date, 30).level)}`}>
                        Next due {formatDateShort(detailsCompany.next_amc_due_date)}
                        {' · '}
                        {getDateUrgency(detailsCompany.next_amc_due_date, 30).text}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Last AMC {formatDateShort(detailsCompany.last_amc_payment_date)}
                      </p>
                    </div>
                  </div>
                  {getBillingAttentionReasons(detailsCompany).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {getBillingAttentionReasons(detailsCompany).map((r) => (
                        <span
                          key={r}
                          className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </section>

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

                <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">Tenant admin password</h3>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Set a new password for this company’s admin login (role admin). Enter their admin email or user ID
                    in the next step, then choose a new password and share it securely with the client.
                  </p>
                  <button
                    type="button"
                    onClick={() => openResetModal(detailsCompany)}
                    className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                  >
                    Reset admin password…
                  </button>
                </section>

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

                  <section className="rounded-xl border border-rose-200 bg-rose-50/40 px-4 py-4 sm:px-5">
                    <h3 className="text-sm font-semibold text-rose-900">Danger zone</h3>
                    <p className="mt-1 text-xs text-rose-800/90 leading-relaxed">
                      Permanently remove this tenant and all associated data (staff, payroll, attendance,
                      devices, branches, and logins). This cannot be undone.
                    </p>
                    <button
                      type="button"
                      onClick={() => openDeleteModal(detailsCompany)}
                      className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-50"
                    >
                      Delete company…
                    </button>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}

        {deleteCompanyTarget && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-company-title"
            onClick={closeDeleteModal}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-rose-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-rose-100 bg-rose-50 px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wider text-rose-700">
                  Step {deleteStep} of 2
                </p>
                <h2 id="delete-company-title" className="mt-1 text-lg font-semibold text-rose-950">
                  Delete company permanently
                </h2>
                <p className="mt-1 text-sm text-rose-900/80">
                  {deleteCompanyTarget.name || `Company #${deleteCompanyTarget.id}`}
                  <span className="ml-2 font-mono text-xs text-rose-700">ID {deleteCompanyTarget.id}</span>
                </p>
              </div>

              {deleteStep === 1 ? (
                <div className="px-5 py-4 space-y-4">
                  <p className="text-sm text-slate-700">
                    You are about to delete this tenant from PunchPay. The following will be removed
                    immediately and cannot be recovered:
                  </p>
                  <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                    <li>All user accounts (admin and HR logins)</li>
                    <li>Employees, shifts, and branch locations</li>
                    <li>Attendance logs and biometric device links</li>
                    <li>Payroll records, advances, and loans</li>
                    <li>Billing profile and subscription history for this tenant</li>
                  </ul>
                  <label className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteAcknowledged}
                      onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm text-slate-800">
                      I understand this action is permanent and all data for this company will be lost.
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeDeleteModal}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!deleteAcknowledged}
                      onClick={() => setDeleteStep(2)}
                      className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 space-y-4">
                  <p className="text-sm text-slate-700">
                    To confirm, type the company name exactly and enter{' '}
                    <span className="font-mono font-semibold text-rose-800">DELETE</span> below.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Company name
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      placeholder={deleteTargetName || 'Company name'}
                      autoComplete="off"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    {deleteConfirmName.trim() !== '' && !deleteNameMatches && (
                      <p className="mt-1 text-xs text-rose-600">Name does not match.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Type DELETE to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmPhrase}
                      onChange={(e) => setDeleteConfirmPhrase(e.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    />
                    {deleteConfirmPhrase.trim() !== '' && !deletePhraseMatches && (
                      <p className="mt-1 text-xs text-rose-600">Must be exactly DELETE (all caps).</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteStep(1);
                        setDeleteConfirmName('');
                        setDeleteConfirmPhrase('');
                      }}
                      disabled={deleteSaving}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteCompany}
                      disabled={deleteSaving || !deleteNameMatches || !deletePhraseMatches}
                      className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
                    >
                      {deleteSaving ? 'Deleting…' : 'Delete permanently'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {resetModalCompany && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40">
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
