import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { PLAN_DISPLAY_NAME, planDefaultLimits } from '../constants/pricingPlans';

function toDateInputValue(d) {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function formatDateLabel(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const WHATSAPP_SEND_MIN_HOUR = 6;
const WHATSAPP_SEND_MAX_HOUR = 22;
const WHATSAPP_SEND_DEFAULT_HOUR = 11;

function hourFromWhatsappSendTime(timeLike) {
  if (timeLike == null || timeLike === '') return WHATSAPP_SEND_DEFAULT_HOUR;
  if (typeof timeLike === 'number' && Number.isFinite(timeLike)) {
    return Math.trunc(timeLike);
  }
  const m = /^(\d{1,2})/.exec(String(timeLike).trim());
  return m ? Number(m[1]) : WHATSAPP_SEND_DEFAULT_HOUR;
}

function formatWhatsappSendHourLabel(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return '';
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period} IST`;
}

const WHATSAPP_SEND_HOUR_OPTIONS = Array.from(
  { length: WHATSAPP_SEND_MAX_HOUR - WHATSAPP_SEND_MIN_HOUR + 1 },
  (_, i) => WHATSAPP_SEND_MIN_HOUR + i
);

export default function CompanySettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [cpCurrentPassword, setCpCurrentPassword] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmNewPassword, setCpConfirmNewPassword] = useState('');
  const [cpSaving, setCpSaving] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [whatsappForm, setWhatsappForm] = useState({
    whatsapp_auto_enabled: false,
    whatsapp_primary_number: '',
    whatsapp_secondary_number: '',
    whatsapp_send_time: WHATSAPP_SEND_DEFAULT_HOUR,
  });
  const [whatsappMeta, setWhatsappMeta] = useState({
    last_sent_for_date: null,
    last_sent_at: null,
  });
  const [whatsappToast, setWhatsappToast] = useState(null);
  const [shiftRotationEnabled, setShiftRotationEnabled] = useState(false);
  const [shiftRotationSaving, setShiftRotationSaving] = useState(false);
  const [shiftRotationToast, setShiftRotationToast] = useState(null);
  const [flexibleHoursEnabled, setFlexibleHoursEnabled] = useState(false);
  const [flexibleHoursSaving, setFlexibleHoursSaving] = useState(false);
  const [flexibleHoursToast, setFlexibleHoursToast] = useState(null);
  const [subscriptionForm, setSubscriptionForm] = useState({
    subscription_start_date: '',
    subscription_end_date: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  /** Enriched from GET /api/company (plan, AMC, caps). */
  const [planSnapshot, setPlanSnapshot] = useState(null);

  const [branches, setBranches] = useState([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchError, setBranchError] = useState(null);
  const [branchSuccess, setBranchSuccess] = useState(null);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');
  const [deleteBranchTarget, setDeleteBranchTarget] = useState(null);
  const [deleteBranchStep, setDeleteBranchStep] = useState(1);
  const [deleteBranchTypedName, setDeleteBranchTypedName] = useState('');

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
        setWhatsappForm({
          whatsapp_auto_enabled: Boolean(data.whatsapp_auto_enabled),
          whatsapp_primary_number: data.whatsapp_primary_number || data.phone || '',
          whatsapp_secondary_number: data.whatsapp_secondary_number || '',
          whatsapp_send_time: hourFromWhatsappSendTime(data.whatsapp_send_time),
        });
        setWhatsappMeta({
          last_sent_for_date: data.whatsapp_last_sent_for_date || null,
          last_sent_at: data.whatsapp_last_sent_at || null,
        });
        setShiftRotationEnabled(Boolean(data.enable_shift_rotation));
        setFlexibleHoursEnabled(Boolean(data.flexible_hours_mode));
        setSubscriptionForm({
          subscription_start_date: toDateInputValue(data.subscription_start_date),
          subscription_end_date: toDateInputValue(data.subscription_end_date),
          is_active: data.is_active !== false,
        });
        setPlanSnapshot({
          plan_code: data.plan_code || 'starter',
          next_amc_due_date: data.next_amc_due_date,
          access_valid_until: data.access_valid_until ?? data.subscription_end_date,
          effective_employee_limit: data.effective_employee_limit,
          branches_allowed_total: data.branches_allowed_total,
          branch_count: data.branch_count,
          active_staff_count: data.active_staff_count,
          onetime_payment_status: data.onetime_payment_status,
          amc_payment_status: data.amc_payment_status,
          last_onetime_payment_date: data.last_onetime_payment_date,
          last_amc_payment_date: data.last_amc_payment_date,
          amc_amount: data.amc_amount,
          onetime_fee_amount: data.onetime_fee_amount,
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

  const handleWhatsappChange = (field) => (event) => {
    const value =
      field === 'whatsapp_auto_enabled' ? event.target.checked : event.target.value;
    setWhatsappForm((prev) => ({ ...prev, [field]: value }));
    if (whatsappToast) setWhatsappToast(null);
  };

  const handleSaveWhatsapp = async (event) => {
    event.preventDefault();
    if (saving) return;
    try {
      setSaving(true);
      setError(null);
      setWhatsappToast(null);
      const res = await authFetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          whatsapp_auto_enabled: whatsappForm.whatsapp_auto_enabled,
          whatsapp_primary_number: whatsappForm.whatsapp_primary_number.trim() || null,
          whatsapp_secondary_number: whatsappForm.whatsapp_secondary_number.trim() || null,
          whatsapp_send_time: Number(whatsappForm.whatsapp_send_time),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to save WhatsApp settings');
      }
      const data = json.data || {};
      setWhatsappForm({
        whatsapp_auto_enabled: Boolean(data.whatsapp_auto_enabled),
        whatsapp_primary_number: data.whatsapp_primary_number || data.phone || '',
        whatsapp_secondary_number: data.whatsapp_secondary_number || '',
        whatsapp_send_time: hourFromWhatsappSendTime(data.whatsapp_send_time),
      });
      setWhatsappMeta({
        last_sent_for_date: data.whatsapp_last_sent_for_date || null,
        last_sent_at: data.whatsapp_last_sent_at || null,
      });
      setWhatsappToast({ type: 'success', message: 'WhatsApp settings saved' });
    } catch (err) {
      setWhatsappToast({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFlexibleHours = async (nextEnabled) => {
    const turningOn = nextEnabled && !flexibleHoursEnabled;
    const turningOff = !nextEnabled && flexibleHoursEnabled;
    if (turningOn) {
      const ok = window.confirm(
        'Enable flexible hours mode? Attendance is tracked daily but payroll settles on monthly total hours — ideal for hospitals and round-the-clock staff without fixed shifts. Factory shift rotation will be turned off.'
      );
      if (!ok) return;
    }
    if (turningOff) {
      const ok = window.confirm(
        'Turn off flexible hours mode? Payroll will return to per-day hours-based rules for each shift.'
      );
      if (!ok) return;
    }
    try {
      setFlexibleHoursSaving(true);
      setFlexibleHoursToast(null);
      const res = await authFetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flexible_hours_mode: nextEnabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to save setting');
      setFlexibleHoursEnabled(Boolean(json.data?.flexible_hours_mode));
      if (nextEnabled) setShiftRotationEnabled(false);
      setFlexibleHoursToast({
        type: 'success',
        message: nextEnabled ? 'Flexible hours mode enabled.' : 'Flexible hours mode disabled.',
      });
    } catch (err) {
      setFlexibleHoursToast({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setFlexibleHoursSaving(false);
    }
  };

  const handleToggleShiftRotation = async (nextEnabled) => {
    const turningOn = nextEnabled && !shiftRotationEnabled;
    const turningOff = !nextEnabled && shiftRotationEnabled;
    if (turningOn) {
      const ok = window.confirm(
        'Enable factory shift rotation? This adds dated shift assignments and rotation tools on the Shifts page. Use only for factories with day/night rotating shifts.'
      );
      if (!ok) return;
    }
    if (turningOff) {
      const ok = window.confirm(
        'Turn off factory shift rotation? The Shifts page will hide rotation tools and attendance will use each employee\'s current shift only. Assignment history is kept.'
      );
      if (!ok) return;
    }
    try {
      setShiftRotationSaving(true);
      setShiftRotationToast(null);
      const res = await authFetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable_shift_rotation: nextEnabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to save setting');
      setShiftRotationEnabled(Boolean(json.data?.enable_shift_rotation));
      setShiftRotationToast({
        type: 'success',
        message: nextEnabled ? 'Factory shift rotation enabled.' : 'Factory shift rotation disabled.',
      });
    } catch (err) {
      setShiftRotationToast({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setShiftRotationSaving(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (cpSaving) return;

    setCpError('');
    setCpSuccess('');

    if (!cpCurrentPassword || !cpNewPassword || !cpConfirmNewPassword) {
      setCpError('All fields are required.');
      return;
    }
    if (cpNewPassword.length < 8) {
      setCpError('New password must be at least 8 characters.');
      return;
    }
    if (cpNewPassword !== cpConfirmNewPassword) {
      setCpError('New password and confirm password do not match.');
      return;
    }

    try {
      setCpSaving(true);
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: cpCurrentPassword,
          new_password: cpNewPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to change password.');
      }

      setCpSuccess(json.message || 'Password changed successfully.');
      setCpCurrentPassword('');
      setCpNewPassword('');
      setCpConfirmNewPassword('');
    } catch (err) {
      setCpError(err.message || 'Failed to change password.');
    } finally {
      setCpSaving(false);
    }
  };

  const handleAddBranch = async (event) => {
    event.preventDefault();
    if (!newBranchName.trim() || branchSaving) return;
    try {
      setBranchSaving(true);
      setBranchError(null);
      setBranchSuccess(null);
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
      setBranchSuccess('Branch added successfully.');
    } catch (err) {
      setBranchError(err.message || 'Failed to create branch');
    } finally {
      setBranchSaving(false);
    }
  };

  const startEditBranch = (branch) => {
    setBranchError(null);
    setBranchSuccess(null);
    setEditingBranchId(branch.id);
    setEditBranchName(branch.name || '');
    setEditBranchAddress(branch.address || '');
  };

  const cancelEditBranch = () => {
    if (branchSaving) return;
    setEditingBranchId(null);
    setEditBranchName('');
    setEditBranchAddress('');
  };

  const handleUpdateBranch = async (branchId) => {
    if (!editBranchName.trim() || branchSaving) return;
    try {
      setBranchSaving(true);
      setBranchError(null);
      setBranchSuccess(null);
      const res = await authFetch(`/api/company/branches/${branchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editBranchName.trim(),
          address: editBranchAddress.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to update branch');
      }
      await loadBranches();
      setEditingBranchId(null);
      setEditBranchName('');
      setEditBranchAddress('');
      setBranchSuccess('Branch details updated.');
    } catch (err) {
      setBranchError(err.message || 'Failed to update branch');
    } finally {
      setBranchSaving(false);
    }
  };

  const openDeleteBranchModal = (branch) => {
    setBranchError(null);
    setBranchSuccess(null);
    setDeleteBranchTarget(branch);
    setDeleteBranchStep(1);
    setDeleteBranchTypedName('');
  };

  const closeDeleteBranchModal = () => {
    if (branchSaving) return;
    setDeleteBranchTarget(null);
    setDeleteBranchStep(1);
    setDeleteBranchTypedName('');
  };

  const handleDeleteBranch = async () => {
    if (!deleteBranchTarget || branchSaving) return;
    if (deleteBranchTypedName.trim() !== deleteBranchTarget.name) return;
    try {
      setBranchSaving(true);
      setBranchError(null);
      setBranchSuccess(null);
      const res = await authFetch(`/api/company/branches/${deleteBranchTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to delete branch');
      }
      await loadBranches();
      closeDeleteBranchModal();
      setBranchSuccess('Branch deleted successfully.');
    } catch (err) {
      setBranchError(err.message || 'Failed to delete branch');
    } finally {
      setBranchSaving(false);
    }
  };

  const planDefaults = planSnapshot ? planDefaultLimits(planSnapshot.plan_code) : null;

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
          <h2 className="text-sm font-semibold text-slate-900">Flexible hours (hospital mode)</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            For hospitals and 24/7 teams without fixed shifts. Staff punch at varying times;
            daily attendance shows present/half/absent, but payroll only penalizes if monthly
            total hours fall short.
          </p>
          {flexibleHoursToast && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
                flexibleHoursToast.type === 'error'
                  ? 'border-rose-100 bg-rose-50 text-rose-700'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}
            >
              {flexibleHoursToast.message}
            </div>
          )}
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={flexibleHoursEnabled}
              onChange={(e) => handleToggleFlexibleHours(e.target.checked)}
              disabled={loading || flexibleHoursSaving || shiftRotationEnabled}
            />
            <span>
              <span className="font-medium">Enable flexible hours mode</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Uses hours-based shifts only. Cannot be used together with factory shift rotation.
              </span>
            </span>
          </label>
          {flexibleHoursEnabled && (
            <p className="mt-3 text-[11px]">
              <a href="/shifts" className="font-medium text-blue-600 hover:underline">
                Go to Shifts →
              </a>{' '}
              use the Hospital flexible preset and assign staff to that shift.
            </p>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Factory shift rotation</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            For factories with day and night shifts that rotate every few weeks. Leave off for
            offices and single-shift businesses — your existing shift setup stays unchanged.
          </p>
          {shiftRotationToast && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
                shiftRotationToast.type === 'error'
                  ? 'border-rose-100 bg-rose-50 text-rose-700'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}
            >
              {shiftRotationToast.message}
            </div>
          )}
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={shiftRotationEnabled}
              onChange={(e) => handleToggleShiftRotation(e.target.checked)}
              disabled={loading || shiftRotationSaving || flexibleHoursEnabled}
            />
            <span>
              <span className="font-medium">Enable shift rotation</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Shows Assignments and Rotation tabs on the Shifts page and tracks which shift
                each employee was on for each date.
              </span>
            </span>
          </label>
          {shiftRotationEnabled && (
            <p className="mt-3 text-[11px]">
              <a href="/shifts" className="font-medium text-blue-600 hover:underline">
                Go to Shifts →
              </a>{' '}
              create Day/Night templates and manage rotations.
            </p>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Daily WhatsApp attendance report</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Automatically send today&apos;s attendance summary via PunchPay WhatsApp at your
            chosen hour (IST) to the numbers below.
          </p>
          {whatsappToast && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
                whatsappToast.type === 'error'
                  ? 'border-rose-100 bg-rose-50 text-rose-700'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}
            >
              {whatsappToast.message}
            </div>
          )}
          <form onSubmit={handleSaveWhatsapp} className="mt-4 space-y-4">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={whatsappForm.whatsapp_auto_enabled}
                onChange={handleWhatsappChange('whatsapp_auto_enabled')}
                disabled={loading || saving}
              />
              <span>
                <span className="font-medium">Enable automatic daily WhatsApp</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  Sends once per day at the hour you choose (IST). Uses Meta template{' '}
                  <code className="text-[10px]">daily_attendance_update</code>.
                </span>
              </span>
            </label>
            <div className="space-y-1 max-w-xs">
              <label className="text-xs font-medium text-slate-700">Daily send time (IST)</label>
              <select
                value={whatsappForm.whatsapp_send_time}
                onChange={handleWhatsappChange('whatsapp_send_time')}
                disabled={loading || saving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
              >
                {WHATSAPP_SEND_HOUR_OPTIONS.map((hour) => (
                  <option key={hour} value={hour}>
                    {formatWhatsappSendHourLabel(hour)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Primary WhatsApp number</label>
                <input
                  value={whatsappForm.whatsapp_primary_number}
                  onChange={handleWhatsappChange('whatsapp_primary_number')}
                  disabled={loading || saving}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                />
                <p className="text-[10px] text-slate-500">
                  Defaults to company phone if empty when saving profile.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Secondary WhatsApp number (optional)
                </label>
                <input
                  value={whatsappForm.whatsapp_secondary_number}
                  onChange={handleWhatsappChange('whatsapp_secondary_number')}
                  disabled={loading || saving}
                  placeholder="+91 optional second recipient"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                />
              </div>
            </div>
            {whatsappMeta.last_sent_at && (
              <p className="text-[11px] text-slate-500">
                Last automatic send:{' '}
                {formatDateLabel(whatsappMeta.last_sent_for_date)}
                {whatsappMeta.last_sent_at
                  ? ` · ${new Date(whatsappMeta.last_sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
                  : ''}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={loading || saving}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save WhatsApp settings'}
              </button>
            </div>
          </form>
        </section>
      )}

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
          {branchSuccess && (
            <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              {branchSuccess}
            </div>
          )}
          {branches.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {branches.map((b) => (
                <li key={b.id} className="border-b border-slate-100 py-2 last:border-0">
                  {editingBranchId === b.id ? (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={editBranchName}
                          onChange={(e) => setEditBranchName(e.target.value)}
                          disabled={branchSaving}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                          placeholder="Branch name"
                        />
                        <input
                          value={editBranchAddress}
                          onChange={(e) => setEditBranchAddress(e.target.value)}
                          disabled={branchSaving}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                          placeholder="Address (optional)"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-slate-400">ID {b.id}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateBranch(b.id)}
                          disabled={branchSaving || !editBranchName.trim()}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {branchSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditBranch}
                          disabled={branchSaving}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{b.name}</span>
                      {b.address && (
                        <span className="text-xs text-slate-500">{b.address}</span>
                      )}
                      <span className="text-[10px] text-slate-400">ID {b.id}</span>
                      <button
                        type="button"
                        onClick={() => startEditBranch(b)}
                        disabled={branchSaving}
                        className="ml-auto text-[11px] font-medium text-primary-700 hover:text-primary-800 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteBranchModal(b)}
                        disabled={branchSaving}
                        className="text-[11px] font-medium text-rose-700 hover:text-rose-800 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
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

      {deleteBranchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-soft">
            <h2 className="text-sm font-semibold text-slate-900">Delete branch</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Step {deleteBranchStep} of 3
            </p>

            {deleteBranchStep === 1 && (
              <div className="mt-3 space-y-3">
                <p className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  Delete <span className="font-semibold">&quot;{deleteBranchTarget.name}&quot;</span>?
                  Employees and devices linked to this branch can break if you remove the location.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeDeleteBranchModal}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteBranchStep(2)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-rose-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {deleteBranchStep === 2 && (
              <div className="mt-3 space-y-3">
                <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Are you absolutely sure? This should only be used for duplicate or invalid branches.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteBranchStep(1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteBranchStep(3)}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-rose-700"
                  >
                    I understand
                  </button>
                </div>
              </div>
            )}

            {deleteBranchStep === 3 && (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] text-slate-600">
                  Final check: type{' '}
                  <span className="rounded bg-slate-100 px-1 font-mono text-slate-900">
                    {deleteBranchTarget.name}
                  </span>{' '}
                  to confirm deletion.
                </p>
                <input
                  value={deleteBranchTypedName}
                  onChange={(e) => setDeleteBranchTypedName(e.target.value)}
                  disabled={branchSaving}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-300"
                  placeholder="Type exact branch name"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteBranchStep(2)}
                    disabled={branchSaving}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteBranch}
                    disabled={branchSaving || deleteBranchTypedName.trim() !== deleteBranchTarget.name}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {branchSaving ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Update your company admin login password.
          </p>

          <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
            {(cpError || cpSuccess) && (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  cpError
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {cpError || cpSuccess}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Current password</label>
              <input
                type="password"
                value={cpCurrentPassword}
                onChange={(e) => setCpCurrentPassword(e.target.value)}
                disabled={cpSaving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">New password</label>
              <input
                type="password"
                value={cpNewPassword}
                onChange={(e) => setCpNewPassword(e.target.value)}
                disabled={cpSaving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Confirm new password</label>
              <input
                type="password"
                value={cpConfirmNewPassword}
                onChange={(e) => setCpConfirmNewPassword(e.target.value)}
                disabled={cpSaving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
              <button
                type="submit"
                disabled={cpSaving}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {cpSaving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Plan &amp; access</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Your one-time fee covers the first year of software access. Annual AMC renews access for each following year; the
          first AMC is due one year after your one-time payment. Dates and limits are managed by the service provider—contact
          support to make changes.
        </p>
        <div className="mt-4 space-y-3 rounded-lg bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-slate-500">Plan</span>
              <span className="ml-2 font-medium text-slate-900">
                {planSnapshot
                  ? PLAN_DISPLAY_NAME[planSnapshot.plan_code] || planSnapshot.plan_code
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Status</span>
              <span className={`ml-2 font-medium ${subscriptionForm.is_active ? 'text-emerald-600' : 'text-slate-500'}`}>
                {subscriptionForm.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-200/80 pt-3 sm:grid-cols-2">
            <div className="text-sm">
              <span className="text-slate-500">Access start</span>
              <div className="font-medium text-slate-900">{formatDateLabel(subscriptionForm.subscription_start_date)}</div>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Access valid until</span>
              <div className="font-medium text-slate-900">{formatDateLabel(subscriptionForm.subscription_end_date)}</div>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Next AMC due</span>
              <div className="font-medium text-slate-900">{formatDateLabel(planSnapshot?.next_amc_due_date)}</div>
            </div>
            {planSnapshot &&
              planSnapshot.onetime_fee_amount != null &&
              planSnapshot.onetime_fee_amount !== '' && (
                <div className="text-sm">
                  <span className="text-slate-500">One-time fee (excl. GST)</span>
                  <div className="font-medium text-slate-900">
                    ₹{Number(planSnapshot.onetime_fee_amount).toLocaleString('en-IN')}
                  </div>
                </div>
              )}
            {planSnapshot && planSnapshot.amc_amount != null && planSnapshot.amc_amount !== '' && (
              <div className="text-sm">
                <span className="text-slate-500">AMC per year (excl. GST)</span>
                <div className="font-medium text-slate-900">
                  ₹{Number(planSnapshot.amc_amount).toLocaleString('en-IN')}
                </div>
              </div>
            )}
            <div className="text-sm">
              <span className="text-slate-500">Active staff</span>
              <div className="font-medium text-slate-900">
                {planSnapshot == null
                  ? '—'
                  : planSnapshot.effective_employee_limit == null
                    ? `${planSnapshot.active_staff_count ?? 0} (no default cap)`
                    : `${planSnapshot.active_staff_count ?? 0} / ${planSnapshot.effective_employee_limit}`}
              </div>
            </div>
            <div className="text-sm sm:col-span-2">
              <span className="text-slate-500">Locations (branches)</span>
              <div className="font-medium text-slate-900">
                {planSnapshot == null
                  ? '—'
                  : planSnapshot.branches_allowed_total == null
                    ? `${planSnapshot.branch_count ?? 0} in use (no cap set)`
                    : `${planSnapshot.branch_count ?? 0} / ${planSnapshot.branches_allowed_total}`}
              </div>
              {planSnapshot && planSnapshot.branches_allowed_total == null && planDefaults?.branchTotal != null && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Default for your plan tier: up to {planDefaults.branchTotal} location
                  {planDefaults.branchTotal === 1 ? '' : 's'} (unless your agreement specifies otherwise).
                </p>
              )}
            </div>
          </div>
          {(planSnapshot?.last_onetime_payment_date || planSnapshot?.last_amc_payment_date) && (
            <div className="border-t border-slate-200/80 pt-3 text-[11px] text-slate-500">
              {planSnapshot.last_onetime_payment_date && (
                <p>
                  Last one-time payment recorded: {formatDateLabel(planSnapshot.last_onetime_payment_date)}
                  {planSnapshot.onetime_payment_status ? ` (${planSnapshot.onetime_payment_status})` : ''}
                </p>
              )}
              {planSnapshot.last_amc_payment_date && (
                <p className="mt-0.5">
                  Last AMC payment: {formatDateLabel(planSnapshot.last_amc_payment_date)}
                  {planSnapshot.amc_payment_status ? ` (${planSnapshot.amc_payment_status})` : ''}
                </p>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            After the access end date, a 7-day grace period applies before payroll and device sync are blocked.
          </p>
        </div>
      </section>
    </div>
  );
}


