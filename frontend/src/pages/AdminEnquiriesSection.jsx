import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEMO_ENQUIRY_PIPELINE_STATUSES,
  DEMO_ENQUIRY_STATUS_BUTTON_STYLES,
  DEMO_ENQUIRY_STATUS_STYLES,
  demoEnquiryStatusLabel,
  leadSourceLabel,
  DEFAULT_LEAD_SOURCE_SUGGESTIONS,
} from '../constants/demoEnquiryStatus';
import {
  planDefaultLimits,
  planOptionsForAdminSelect,
  planPricingForCountry,
  pricingSymbolForCountry,
} from '../constants/pricingPlans';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY_CODE, countryProfile } from '../constants/countryProfiles';

const PAGE_SIZE = 25;

function adminFetch(path, options = {}, key) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Approval-Secret': key,
    ...(options.headers || {}),
  };
  return fetch(`/api/admin${path}`, { ...options, headers });
}

function messageFromAdminErrorResponse(text, status) {
  if (!text || !String(text).trim()) {
    return status === 429 ? 'Too many requests. Wait a minute and try again.' : `Request failed (${status})`;
  }
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    return parsed.message || parsed.error || text;
  } catch {
    return String(text).trim();
  }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function emptyAddForm() {
  return {
    full_name: '',
    business_name: '',
    phone_number: '',
    email: '',
    employees_range: '',
    source: '',
    expected_plan: 'starter',
    notes: '',
  };
}

function convertFormFromLead(lead) {
  const plan = lead?.expected_plan || 'starter';
  const countryCode = DEFAULT_COUNTRY_CODE;
  const pricing = planPricingForCountry(plan, countryCode);
  const limits = planDefaultLimits(plan);
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 1);
  const email = (lead?.email || '').trim();
  const adminEmail =
    email ||
    (lead?.phone_number
      ? `admin+${String(lead.phone_number).replace(/\D/g, '').slice(-10)}@client.local`
      : '');

  return {
    company_name: lead?.business_name || '',
    company_email: email,
    phone: lead?.phone_number || '',
    address: '',
    admin_name: lead?.full_name || '',
    admin_email: adminEmail,
    admin_password: '',
    plan_code: plan,
    subscription_start_date: today,
    subscription_end_date: end.toISOString().slice(0, 10),
    branches_allowed: limits.branchTotal ?? 1,
    staffs_allowed: limits.staffCap ?? 25,
    onetime_fee_amount: pricing.onetime,
    amc_amount: pricing.amc,
    onetime_fee_paid: false,
    last_amc_payment_date: '',
    country_code: DEFAULT_COUNTRY_CODE,
  };
}

export default function AdminEnquiriesSection({ adminKey, onAuthError, setToast, onCompanyCreated }) {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('open');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [addSaving, setAddSaving] = useState(false);

  const [convertLead, setConvertLead] = useState(null);
  const [convertForm, setConvertForm] = useState(null);
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertResult, setConvertResult] = useState(null);

  const [notesEditId, setNotesEditId] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [sourceSuggestions, setSourceSuggestions] = useState(DEFAULT_LEAD_SOURCE_SUGGESTIONS);
  const [sourceSuggestionsLoading, setSourceSuggestionsLoading] = useState(false);

  const addPlanOptions = useMemo(() => planOptionsForAdminSelect(DEFAULT_COUNTRY_CODE), []);
  const convertPlanOptions = useMemo(
    () => planOptionsForAdminSelect(convertForm?.country_code || DEFAULT_COUNTRY_CODE),
    [convertForm?.country_code]
  );
  const convertMoneySymbol = pricingSymbolForCountry(convertForm?.country_code || DEFAULT_COUNTRY_CODE);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadSourceSuggestions = useCallback(async () => {
    if (!adminKey) return;
    setSourceSuggestionsLoading(true);
    try {
      const res = await adminFetch('/demo-enquiry-suggestions', {}, adminKey);
      if (res.status === 401) {
        onAuthError?.();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.data?.sources) && json.data.sources.length > 0) {
        setSourceSuggestions(json.data.sources);
      }
    } catch {
      /* keep defaults */
    } finally {
      setSourceSuggestionsLoading(false);
    }
  }, [adminKey, onAuthError]);

  const loadStats = useCallback(async () => {
    if (!adminKey) return;
    try {
      const res = await adminFetch('/demo-enquiry-stats', {}, adminKey);
      if (res.status === 401) {
        onAuthError?.();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStats(json.data || null);
    } catch {
      /* non-blocking */
    }
  }, [adminKey, onAuthError]);

  const loadLeads = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter === 'open') {
        params.set('pipeline', 'open');
      } else if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await adminFetch(`/demo-enquiries?${params}`, {}, adminKey);
      if (res.status === 401) {
        onAuthError?.();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load leads');
      const data = json.data || {};
      setLeads(Array.isArray(data.data) ? data.data : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      setError(err.message || 'Failed to load leads');
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [adminKey, page, statusFilter, searchQuery, onAuthError]);

  useEffect(() => {
    loadStats();
    loadLeads();
    loadSourceSuggestions();
  }, [loadStats, loadLeads, loadSourceSuggestions]);

  const filteredSourceSuggestions = useMemo(() => {
    const q = addForm.source.trim().toLowerCase();
    if (!q) return sourceSuggestions;
    return sourceSuggestions.filter((s) => s.toLowerCase().includes(q));
  }, [addForm.source, sourceSuggestions]);

  const quickSourcePicks = useMemo(() => {
    const q = addForm.source.trim().toLowerCase();
    const pool = q
      ? sourceSuggestions.filter((s) => s.toLowerCase().includes(q))
      : sourceSuggestions;
    return pool.slice(0, 8);
  }, [addForm.source, sourceSuggestions]);

  const refreshAll = () => {
    loadStats();
    loadLeads();
  };

  const updateStatus = async (enquiryId, status) => {
    setBusyId(enquiryId);
    try {
      const res = await adminFetch(
        '/demo-enquiry-status',
        { method: 'POST', body: JSON.stringify({ enquiry_id: enquiryId, status }) },
        adminKey
      );
      const text = await res.text();
      if (res.status === 401) {
        onAuthError?.();
        return;
      }
      if (!res.ok) throw new Error(messageFromAdminErrorResponse(text, res.status));
      const json = text ? JSON.parse(text) : {};
      if (json.data?.id) {
        setLeads((prev) => prev.map((q) => (q.id === json.data.id ? { ...q, ...json.data } : q)));
      } else {
        refreshAll();
      }
      loadStats();
      setToast?.({ type: 'success', message: `Marked as ${demoEnquiryStatusLabel(status)}.` });
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to update status' });
    } finally {
      setBusyId(null);
    }
  };

  const saveNotes = async (enquiryId) => {
    setBusyId(enquiryId);
    try {
      const res = await adminFetch(
        '/demo-enquiry-notes',
        { method: 'POST', body: JSON.stringify({ enquiry_id: enquiryId, notes: notesDraft }) },
        adminKey
      );
      const text = await res.text();
      if (!res.ok) throw new Error(messageFromAdminErrorResponse(text, res.status));
      const json = text ? JSON.parse(text) : {};
      if (json.data?.id) {
        setLeads((prev) => prev.map((q) => (q.id === json.data.id ? { ...q, ...json.data } : q)));
      }
      setNotesEditId(null);
      setToast?.({ type: 'success', message: 'Notes saved.' });
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to save notes' });
    } finally {
      setBusyId(null);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (addSaving) return;
    if (
      !addForm.full_name.trim() ||
      !addForm.business_name.trim() ||
      !addForm.phone_number.trim() ||
      !addForm.source.trim()
    ) {
      setToast?.({
        type: 'error',
        message: 'Contact name, business name, phone, and lead source are required.',
      });
      return;
    }
    setAddSaving(true);
    try {
      const res = await adminFetch(
        '/demo-enquiries',
        { method: 'POST', body: JSON.stringify(addForm) },
        adminKey
      );
      const text = await res.text();
      if (!res.ok) throw new Error(messageFromAdminErrorResponse(text, res.status));
      setAddOpen(false);
      setAddForm(emptyAddForm());
      setStatusFilter('open');
      setPage(1);
      refreshAll();
      loadSourceSuggestions();
      setToast?.({ type: 'success', message: 'Lead added to pipeline.' });
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to add lead' });
    } finally {
      setAddSaving(false);
    }
  };

  const openConvert = (lead) => {
    setConvertResult(null);
    setConvertLead(lead);
    setConvertForm(convertFormFromLead(lead));
  };

  const handleConvertChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConvertForm((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      const countryCode = name === 'country_code' ? value : prev.country_code || DEFAULT_COUNTRY_CODE;
      if (name === 'plan_code' || name === 'country_code') {
        const plan = name === 'plan_code' ? value : prev.plan_code;
        const pricing = planPricingForCountry(plan, countryCode);
        next.onetime_fee_amount = pricing.onetime;
        next.amc_amount = pricing.amc;
        if (name === 'plan_code') {
          const limits = planDefaultLimits(value);
          if (limits.staffCap != null) next.staffs_allowed = limits.staffCap;
          if (limits.branchTotal != null) next.branches_allowed = limits.branchTotal;
        }
      }
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

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    if (!convertLead?.id || !convertForm || convertSaving) return;
    if (!convertForm.company_name.trim() || !convertForm.admin_name.trim() || !convertForm.admin_email.trim()) {
      setToast?.({ type: 'error', message: 'Company name, admin name, and admin email are required.' });
      return;
    }
    if (!convertForm.admin_password || convertForm.admin_password.length < 8) {
      setToast?.({ type: 'error', message: 'Admin password must be at least 8 characters.' });
      return;
    }
    setConvertSaving(true);
    try {
      const res = await adminFetch(
        '/convert-enquiry',
        {
          method: 'POST',
          body: JSON.stringify({
            enquiry_id: convertLead.id,
            company: {
              name: convertForm.company_name.trim(),
              email: convertForm.company_email.trim() || null,
              phone: convertForm.phone.trim() || null,
              address: convertForm.address.trim() || null,
            },
            admin: {
              name: convertForm.admin_name.trim(),
              email: convertForm.admin_email.trim(),
              password: convertForm.admin_password,
            },
            plan_code: convertForm.plan_code,
            subscription_start_date: convertForm.subscription_start_date,
            subscription_end_date: convertForm.subscription_end_date,
            branches_allowed: Number(convertForm.branches_allowed),
            staffs_allowed: Number(convertForm.staffs_allowed),
            payment_status: convertForm.onetime_fee_paid ? 'paid' : 'unpaid',
            onetime_fee_paid: convertForm.onetime_fee_paid === true,
            onetime_fee_amount: convertForm.onetime_fee_amount ? Number(convertForm.onetime_fee_amount) : null,
            amc_amount: convertForm.amc_amount ? Number(convertForm.amc_amount) : null,
            last_amc_payment_date: convertForm.last_amc_payment_date || null,
            country_code: convertForm.country_code || DEFAULT_COUNTRY_CODE,
          }),
        },
        adminKey
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Conversion failed');
      setConvertResult(json.data || null);
      setLeads((prev) =>
        prev.map((q) => (q.id === convertLead.id ? { ...q, ...(json.data?.enquiry || {}) } : q))
      );
      loadStats();
      onCompanyCreated?.();
      setToast?.({ type: 'success', message: json.message || 'Lead converted to company.' });
    } catch (err) {
      setToast?.({ type: 'error', message: err.message || 'Failed to convert lead' });
    } finally {
      setConvertSaving(false);
    }
  };

  const kpiCards = useMemo(
    () => [
      { key: 'open', label: 'Open pipeline', value: stats?.open ?? '—', tone: 'text-sky-900 bg-sky-50 border-sky-200' },
      { key: 'in_progress', label: 'In progress', value: stats?.in_progress ?? '—', tone: 'text-indigo-900 bg-indigo-50 border-indigo-200' },
      { key: 'hot', label: 'Ready to close', value: stats?.hot ?? '—', tone: 'text-emerald-900 bg-emerald-50 border-emerald-200' },
      { key: 'converted', label: 'Converted', value: stats?.converted ?? '—', tone: 'text-violet-900 bg-violet-50 border-violet-200' },
      { key: 'lost', label: 'Lost', value: stats?.lost ?? '—', tone: 'text-rose-900 bg-rose-50 border-rose-200' },
    ],
    [stats]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-sky-50/40 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Leads & enquiries</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Capture leads, track follow-ups, and convert won deals into active companies — all in one pipeline.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setAddForm(emptyAddForm());
                setAddOpen(true);
                loadSourceSuggestions();
              }}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 shadow-sm"
            >
              + Add lead
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => {
              setPage(1);
              if (card.key === 'open') setStatusFilter('open');
              else if (card.key === 'in_progress') setStatusFilter('contacted');
              else if (card.key === 'hot') setStatusFilter('sold');
              else setStatusFilter(card.key);
            }}
            className={`rounded-xl border p-4 text-left transition-shadow hover:shadow-md ${card.tone}`}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              className="flex flex-1 gap-2 max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearchQuery(searchInput);
              }}
            >
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, business, phone, email…"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
              >
                Search
              </button>
            </form>
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} · {total} lead{total === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'open', label: 'Open pipeline' },
              { id: 'all', label: 'All' },
              ...DEMO_ENQUIRY_PIPELINE_STATUSES.map((s) => ({ id: s, label: demoEnquiryStatusLabel(s) })),
              { id: 'converted', label: 'Converted' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setPage(1);
                  setStatusFilter(f.id);
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                  statusFilter === f.id
                    ? 'border-violet-700 bg-violet-700 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-rose-700 bg-rose-50 border-b border-rose-200">{error}</div>
        )}

        {loading && leads.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-slate-600 font-medium">No leads in this view</p>
            <p className="text-sm text-slate-500 mt-1">Add a lead manually or wait for landing-page submissions.</p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-4 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
            >
              Add your first lead
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-slate-700">Contact</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-700">Business</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-700">Phone</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-700">Source</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-700">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-700">Created</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-700 min-w-[160px]">Notes</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-700 min-w-[300px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((q) => {
                  const currentStatus = q.status || 'not_contacted';
                  const isConverted = currentStatus === 'converted' || q.converted_company_id;
                  const busy = busyId === q.id;

                  return (
                    <tr key={q.id} className="align-top hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{q.full_name || '—'}</div>
                        {q.email && <div className="text-xs text-slate-500">{q.email}</div>}
                        {q.employees_range && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{q.employees_range} staff</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{q.business_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{q.phone_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{leadSourceLabel(q.source)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            DEMO_ENQUIRY_STATUS_STYLES[currentStatus] || DEMO_ENQUIRY_STATUS_STYLES.not_contacted
                          }`}
                        >
                          {demoEnquiryStatusLabel(currentStatus)}
                        </span>
                        {isConverted && q.converted_company_name && (
                          <p className="text-[10px] text-violet-700 mt-1 font-medium">
                            → {q.converted_company_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTime(q.created_at)}</td>
                      <td className="px-4 py-3">
                        {notesEditId === q.id ? (
                          <div className="space-y-1">
                            <textarea
                              value={notesDraft}
                              onChange={(e) => setNotesDraft(e.target.value)}
                              rows={2}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => saveNotes(q.id)}
                                className="rounded bg-slate-900 px-2 py-0.5 text-[10px] text-white"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setNotesEditId(null)}
                                className="rounded border px-2 py-0.5 text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setNotesEditId(q.id);
                              setNotesDraft(q.notes || '');
                            }}
                            className="text-left text-xs text-slate-600 hover:text-slate-900 max-w-[160px] line-clamp-3"
                            title={q.notes || 'Add notes'}
                          >
                            {q.notes || <span className="text-slate-400 italic">Add notes…</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isConverted ? (
                          <div className="text-xs text-violet-800">
                            <p className="font-medium">Company #{q.converted_company_id}</p>
                            <p className="text-slate-500">{formatDateTime(q.converted_at)}</p>
                            <p className="text-[10px] text-slate-500 mt-1">See Operations → Companies</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1">
                              {DEMO_ENQUIRY_PIPELINE_STATUSES.map((status) => {
                                const isActive = currentStatus === status;
                                return (
                                  <button
                                    key={status}
                                    type="button"
                                    disabled={busy || isActive}
                                    onClick={() => updateStatus(q.id, status)}
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50 ${
                                      isActive
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : DEMO_ENQUIRY_STATUS_BUTTON_STYLES[status]
                                    }`}
                                  >
                                    {demoEnquiryStatusLabel(status)}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              disabled={busy || currentStatus === 'lost'}
                              onClick={() => openConvert(q)}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              Convert to company
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">Add lead</h3>
              <p className="text-xs text-slate-500 mt-0.5">Manual entry for calls, referrals, events, etc.</p>
            </div>
            <form onSubmit={handleAddSubmit} className="p-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">Contact name *</span>
                  <input
                    name="full_name"
                    value={addForm.full_name}
                    onChange={(e) => setAddForm((p) => ({ ...p, full_name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">Business name *</span>
                  <input
                    name="business_name"
                    value={addForm.business_name}
                    onChange={(e) => setAddForm((p) => ({ ...p, business_name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">Phone *</span>
                  <input
                    name="phone_number"
                    value={addForm.phone_number}
                    onChange={(e) => setAddForm((p) => ({ ...p, phone_number: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">Email</span>
                  <input
                    type="email"
                    name="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">Where did this lead come from? *</span>
                  <input
                    name="source"
                    value={addForm.source}
                    onChange={(e) => setAddForm((p) => ({ ...p, source: e.target.value }))}
                    list="lead-source-suggestions"
                    placeholder="e.g. Referral, Google search, Chennai expo…"
                    autoComplete="off"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <datalist id="lead-source-suggestions">
                    {filteredSourceSuggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  {sourceSuggestionsLoading ? (
                    <p className="mt-1 text-[10px] text-slate-400">Loading previous sources…</p>
                  ) : quickSourcePicks.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {quickSourcePicks.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAddForm((p) => ({ ...p, source: s }))}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                            addForm.source.trim().toLowerCase() === s.toLowerCase()
                              ? 'border-violet-700 bg-violet-700 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 hover:bg-violet-50'
                          }`}
                        >
                          {leadSourceLabel(s)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1 text-[10px] text-slate-500">
                    Type to search or pick a suggestion — previous entries appear automatically.
                  </p>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">Employees</span>
                  <input
                    name="employees_range"
                    value={addForm.employees_range}
                    onChange={(e) => setAddForm((p) => ({ ...p, employees_range: e.target.value }))}
                    placeholder="e.g. 25–50"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">Expected plan</span>
                  <select
                    value={addForm.expected_plan}
                    onChange={(e) => setAddForm((p) => ({ ...p, expected_plan: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {addPlanOptions.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">Notes</span>
                  <textarea
                    value={addForm.notes}
                    onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSaving}
                  className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {addSaving ? 'Saving…' : 'Add lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {convertLead && convertForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="border-b border-slate-200 px-5 py-4 sticky top-0 bg-white z-10">
              <h3 className="text-base font-semibold text-slate-900">Convert lead to company</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {convertLead.full_name} · {convertLead.business_name} — creates an active tenant immediately.
              </p>
            </div>

            {convertResult ? (
              <div className="p-5 space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-semibold">Company created successfully</p>
                  <p className="mt-1">
                    <span className="font-medium">{convertResult.company?.name}</span> is active (ID #
                    {convertResult.company?.id}).
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <p className="font-medium text-amber-900">Admin login (share securely, shown once)</p>
                  <p className="mt-1 font-mono text-xs break-all">Email: {convertResult.user?.email}</p>
                  <p className="mt-1 font-mono text-xs break-all">
                    Password: {convertResult.admin_password_plaintext_once}
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setConvertLead(null);
                      setConvertForm(null);
                      setConvertResult(null);
                      refreshAll();
                    }}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConvertSubmit} className="p-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Company name *</span>
                    <input name="company_name" value={convertForm.company_name} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" required />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">Company email</span>
                    <input name="company_email" value={convertForm.company_email} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">Phone</span>
                    <input name="phone" value={convertForm.phone} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Country</span>
                    <select
                      name="country_code"
                      value={convertForm.country_code || DEFAULT_COUNTRY_CODE}
                      onChange={handleConvertChange}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      {COUNTRY_OPTIONS.map((o) => (
                        <option key={o.country_code} value={o.country_code}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Timezone: {countryProfile(convertForm.country_code).timezone} · Currency:{' '}
                      {countryProfile(convertForm.country_code).currency}
                    </p>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-700">Admin name *</span>
                    <input name="admin_name" value={convertForm.admin_name} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" required />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">Admin email *</span>
                    <input name="admin_email" type="email" value={convertForm.admin_email} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" required />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">Admin password *</span>
                    <input name="admin_password" type="password" value={convertForm.admin_password} onChange={handleConvertChange} minLength={8} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" required />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">Plan</span>
                    <select name="plan_code" value={convertForm.plan_code} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                      {convertPlanOptions.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">Branches allowed</span>
                    <input name="branches_allowed" type="number" min={1} value={convertForm.branches_allowed} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">Staff limit</span>
                    <input name="staffs_allowed" type="number" min={1} value={convertForm.staffs_allowed} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">One-time fee ({convertMoneySymbol})</span>
                    <input name="onetime_fee_amount" value={convertForm.onetime_fee_amount} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-700">AMC ({convertMoneySymbol})</span>
                    <input name="amc_amount" value={convertForm.amc_amount} onChange={handleConvertChange} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="flex items-center gap-2 sm:col-span-2 text-sm">
                    <input type="checkbox" name="onetime_fee_paid" checked={convertForm.onetime_fee_paid} onChange={handleConvertChange} />
                    One-time fee already received
                  </label>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button type="button" onClick={() => { setConvertLead(null); setConvertForm(null); }} className="rounded-lg border px-4 py-2 text-sm">
                    Cancel
                  </button>
                  <button type="submit" disabled={convertSaving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {convertSaving ? 'Creating…' : 'Create company & mark converted'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
