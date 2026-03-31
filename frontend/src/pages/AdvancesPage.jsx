import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch } from '../utils/api';

const TABS = ['active', 'monthly', 'history'];

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '0';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n));
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function monthLabel(year, month) {
  if (!year || !month) return '—';
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
}

function statusBadge(status) {
  const map = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    cleared: 'bg-slate-100 text-slate-700 border-slate-200',
    waived: 'bg-blue-50 text-blue-700 border-blue-100',
    on_hold: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${map[status] || map.active}`}>{status}</span>;
}

export default function AdvancesPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [tab, setTab] = useState('active');
  const [employees, setEmployees] = useState([]);
  const [loans, setLoans] = useState([]);
  const [monthlyRepayments, setMonthlyRepayments] = useState([]);
  const [expandedLoanId, setExpandedLoanId] = useState(null);
  const [expandedLoan, setExpandedLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideRepayment, setOverrideRepayment] = useState(null);
  const [skipPending, setSkipPending] = useState(null);
  const [deletePendingLoanId, setDeletePendingLoanId] = useState(null);
  const [markPaidRepaymentId, setMarkPaidRepaymentId] = useState(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState(null);
  const [markPaidAmount, setMarkPaidAmount] = useState('');
  const [form, setForm] = useState({
    employee_id: '',
    loan_amount: '',
    loan_date: new Date().toISOString().slice(0, 10),
    reason: '',
    total_installments: 1,
    monthly_installment: '',
    notes: '',
  });
  const [overrideForm, setOverrideForm] = useState({
    repayment_amount: '',
    override_reason: '',
  });

  const activeLoans = useMemo(() => loans.filter((l) => l.status === 'active' || l.status === 'on_hold'), [loans]);
  const historyLoans = useMemo(() => loans.filter((l) => l.status === 'cleared' || l.status === 'waived'), [loans]);
  const activeLoanWarning = useMemo(() => {
    if (!form.employee_id) return null;
    return activeLoans.find((l) => Number(l.employee_id) === Number(form.employee_id)) || null;
  }, [activeLoans, form.employee_id]);

  const totalMonthlyDeduction = useMemo(
    () => monthlyRepayments.reduce((sum, r) => sum + Number(r.repayment_amount || 0), 0),
    [monthlyRepayments]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(currentYear), month: String(currentMonth) });
      const [empRes, loansRes, monthlyRes] = await Promise.all([
        authFetch('/api/employees?limit=300', { headers: { 'Content-Type': 'application/json' } }),
        authFetch('/api/advance-loans', { headers: { 'Content-Type': 'application/json' } }),
        authFetch(`/api/advance-loans/monthly?${params}`, { headers: { 'Content-Type': 'application/json' } }),
      ]);
      const empJson = empRes.ok ? await empRes.json() : { data: { data: [] } };
      const loansJson = loansRes.ok ? await loansRes.json() : { data: [] };
      const monthlyJson = monthlyRes.ok ? await monthlyRes.json() : { data: [] };
      setEmployees(empJson.data?.data || []);
      setLoans(Array.isArray(loansJson.data) ? loansJson.data : []);
      setMonthlyRepayments(Array.isArray(monthlyJson.data) ? monthlyJson.data : []);
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to load advance loans' });
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const amount = Number(form.loan_amount || 0);
    const installments = Math.max(1, Number(form.total_installments || 1));
    if (!amount) return;
    const calculated = Math.ceil((amount / installments) * 100) / 100;
    setForm((prev) => ({ ...prev, monthly_installment: prev.monthly_installment || String(calculated) }));
  }, [form.loan_amount, form.total_installments]);

  async function handleCreateLoan(force = false) {
    try {
      setCreateError('');
      const loanDate = form.loan_date || new Date().toISOString().split('T')[0];
      const parsedLoanDate = new Date(`${loanDate}T00:00:00`);
      if (Number.isNaN(parsedLoanDate.getTime())) {
        setCreateError('Please select a valid loan date');
        return;
      }

      const employeeId = parseInt(form.employee_id, 10);
      if (Number.isNaN(employeeId) || employeeId < 1) {
        setCreateError('Please select an employee');
        return;
      }

      const installments = parseInt(form.total_installments, 10);
      if (Number.isNaN(installments) || installments < 1) {
        setCreateError('Please enter number of installments');
        return;
      }

      const monthlyAmount = parseFloat(form.monthly_installment);
      if (Number.isNaN(monthlyAmount) || monthlyAmount <= 0) {
        setCreateError('Please enter monthly installment amount');
        return;
      }

      const loanAmount = parseFloat(form.loan_amount);
      if (Number.isNaN(loanAmount) || loanAmount <= 0) {
        setCreateError('Please enter a valid loan amount');
        return;
      }

      const res = await authFetch('/api/advance-loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          loan_amount: loanAmount,
          loan_date: loanDate,
          reason: form.reason || null,
          total_installments: installments,
          monthly_installment: monthlyAmount,
          notes: form.notes || null,
          allow_multiple_loans: force,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to create loan');
      setToast({ type: 'success', message: 'Advance loan recorded successfully' });
      setCreateOpen(false);
      setCreateError('');
      setForm({
        employee_id: '',
        loan_amount: '',
        loan_date: new Date().toISOString().slice(0, 10),
        reason: '',
        total_installments: 1,
        monthly_installment: '',
        notes: '',
      });
      await loadAll();
    } catch (err) {
      setCreateError(err.message || 'Unable to create loan');
      setToast({ type: 'error', message: err.message || 'Unable to create loan' });
    }
  }

  async function openLoanDetails(loanId) {
    if (expandedLoanId === loanId) {
      setExpandedLoanId(null);
      setExpandedLoan(null);
      return;
    }
    setExpandedLoanId(loanId);
    const res = await authFetch(`/api/advance-loans/${loanId}`, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return;
    const json = await res.json();
    setExpandedLoan(json.data);
  }

  async function handleOverrideSubmit() {
    if (!overrideRepayment) return;
    const res = await authFetch(`/api/advance-loans/repayments/${overrideRepayment.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repayment_amount: Number(overrideForm.repayment_amount),
        override_reason: overrideForm.override_reason,
      }),
    });
    if (!res.ok) {
      setToast({ type: 'error', message: 'Override failed' });
      return;
    }
    setOverrideOpen(false);
    setOverrideRepayment(null);
    setOverrideForm({ repayment_amount: '', override_reason: '' });
    await loadAll();
  }

  async function handleSkip(repaymentId) {
    if (!window.confirm('Skip this month repayment?')) return;
    const reason = skipPending || 'Skipped by admin';
    const res = await authFetch(`/api/advance-loans/repayments/${repaymentId}/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      setToast({ type: 'error', message: 'Skip failed' });
      return;
    }
    setSkipPending(null);
    await loadAll();
  }

  async function handleWaive(loanId) {
    const reason = window.prompt('Reason for waiver?') || '';
    const res = await authFetch(`/api/advance-loans/${loanId}/waive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      setToast({ type: 'error', message: 'Unable to waive loan' });
      return;
    }
    await loadAll();
  }

  async function refreshExpandedLoan(loanId) {
    const res = await authFetch(`/api/advance-loans/${loanId}`, { headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      const json = await res.json();
      setExpandedLoan(json.data);
    }
  }

  function openMarkPaidDialog(repayment) {
    setMarkPaidTarget(repayment);
    setMarkPaidAmount(String(repayment.repayment_amount || ''));
    setMarkPaidOpen(true);
  }

  async function handleMarkRepaymentPaidSubmit() {
    if (!markPaidTarget) return;
    const repaymentId = markPaidTarget.id;
    if (!window.confirm('Mark this installment as paid? This updates the loan balance like a payroll deduction.')) return;
    const paidAmount = Number(markPaidAmount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      setToast({ type: 'error', message: 'Please enter a valid amount greater than 0' });
      return;
    }
    setMarkPaidRepaymentId(repaymentId);
    try {
      const res = await authFetch(`/api/advance-loans/repayments/${repaymentId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repayment_amount: paidAmount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not mark as paid');
      setToast({ type: 'success', message: 'Installment marked as paid' });
      setMarkPaidOpen(false);
      setMarkPaidTarget(null);
      setMarkPaidAmount('');
      if (expandedLoanId) await refreshExpandedLoan(expandedLoanId);
      await loadAll();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not mark as paid' });
    } finally {
      setMarkPaidRepaymentId(null);
    }
  }

  async function handleDeleteLoan(loanId) {
    if (!window.confirm('Delete this advance loan? This cannot be undone.')) return;
    setDeletePendingLoanId(loanId);
    try {
      const res = await authFetch(`/api/advance-loans/${loanId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Unable to delete loan');
      if (expandedLoanId === loanId) {
        setExpandedLoanId(null);
        setExpandedLoan(null);
      }
      setToast({ type: 'success', message: 'Advance loan deleted' });
      await loadAll();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Unable to delete loan' });
    } finally {
      setDeletePendingLoanId(null);
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-20 z-30" style={{ right: '20%' }}>
          <div className={`rounded-lg border px-3 py-2 text-xs shadow-soft ${toast.type === 'error' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
            {toast.message}
          </div>
        </div>
      )}

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Advance Loans</h1>
          <p className="text-xs text-slate-500">Track multi-month loan repayments and payroll deductions.</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          New Advance
        </button>
      </header>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-soft">
        <div className="mb-4 flex gap-2">
          <button type="button" onClick={() => setTab('active')} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === 'active' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Active Loans</button>
          <button type="button" onClick={() => setTab('monthly')} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === 'monthly' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>This Month&apos;s Deductions</button>
          <button type="button" onClick={() => setTab('history')} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === 'history' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Loan History</button>
        </div>

        {loading ? (
          <div className="h-24 animate-pulse rounded bg-slate-50" />
        ) : tab === 'active' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="pb-2 pr-3">Employee</th>
                  <th className="pb-2 pr-3">Loan Amount</th>
                  <th className="pb-2 pr-3">Given On</th>
                  <th className="pb-2 pr-3">Total Repaid</th>
                  <th className="pb-2 pr-3">Outstanding</th>
                  <th className="pb-2 pr-3">Monthly EMI</th>
                  <th className="pb-2 pr-3">Next Deduction</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeLoans.map((loan) => (
                  <Fragment key={loan.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium">{loan.employee_name} ({loan.employee_code})</td>
                      <td className="py-2 pr-3">₹{formatMoney(loan.loan_amount)}</td>
                      <td className="py-2 pr-3">{fmtDate(loan.loan_date)}</td>
                      <td className="py-2 pr-3">₹{formatMoney(loan.total_repaid)}</td>
                      <td className="py-2 pr-3 font-semibold text-amber-700">₹{formatMoney(loan.outstanding_balance)}</td>
                      <td className="py-2 pr-3">₹{formatMoney(loan.monthly_installment)}</td>
                      <td className="py-2 pr-3">{monthLabel(loan.next_repayment_year, loan.next_repayment_month)} • ₹{formatMoney(loan.next_repayment_amount || 0)}</td>
                      <td className="py-2 pr-3">{statusBadge(loan.status)}</td>
                      <td className="py-2 pr-3">
                        <button type="button" className="mr-2 text-blue-600" onClick={() => openLoanDetails(loan.id)}>Details</button>
                        <button type="button" className="mr-2 text-rose-600" onClick={() => handleWaive(loan.id)}>Waive</button>
                        <button type="button" className="text-rose-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={deletePendingLoanId === loan.id} onClick={() => handleDeleteLoan(loan.id)}>
                          {deletePendingLoanId === loan.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                    {expandedLoanId === loan.id && expandedLoan && (
                      <tr>
                        <td colSpan={9} className="bg-slate-50 p-3">
                          <p className="mb-2 text-xs text-slate-700">Repaid: ₹{formatMoney(expandedLoan.total_repaid)} / ₹{formatMoney(expandedLoan.loan_amount)}</p>
                          <div className="mb-3 h-2 rounded bg-slate-200">
                            <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, (Number(expandedLoan.total_repaid || 0) / Number(expandedLoan.loan_amount || 1)) * 100)}%` }} />
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-slate-500">
                                <th className="pb-1 pr-2">Month</th>
                                <th className="pb-1 pr-2">Suggested</th>
                                <th className="pb-1 pr-2">Amount</th>
                                <th className="pb-1 pr-2">Status</th>
                                <th className="pb-1 pr-2"> </th>
                              </tr>
                            </thead>
                            <tbody>
                              {(expandedLoan.repayments || []).map((r) => (
                                <tr key={r.id} className="border-t border-slate-200">
                                  <td className="py-1 pr-2">{monthLabel(r.year, r.month)}</td>
                                  <td className="py-1 pr-2">₹{formatMoney(r.suggested_amount)}</td>
                                  <td className="py-1 pr-2">₹{formatMoney(r.repayment_amount)}</td>
                                  <td className="py-1 pr-2">{r.status}</td>
                                  <td className="py-1 pr-2 text-right">
                                    {r.status === 'pending' && ['active', 'on_hold'].includes(expandedLoan.status) && (
                                      <button
                                        type="button"
                                        disabled={markPaidRepaymentId === r.id}
                                        onClick={() => openMarkPaidDialog(r)}
                                        className="text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {markPaidRepaymentId === r.id ? 'Saving...' : 'Mark paid'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'monthly' ? (
          <div>
            <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Total advance deductions this month: ₹{formatMoney(totalMonthlyDeduction)} across {new Set(monthlyRepayments.map((r) => r.employee_id)).size} employees
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="pb-2 pr-3">Employee</th>
                  <th className="pb-2 pr-3">Loan Ref</th>
                  <th className="pb-2 pr-3">Original Amount</th>
                  <th className="pb-2 pr-3">This Month Deduction</th>
                  <th className="pb-2 pr-3">Suggested</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Override</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRepayments.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{r.employee_name} ({r.employee_code})</td>
                    <td className="py-2 pr-3">#{r.loan_id}</td>
                    <td className="py-2 pr-3">₹{formatMoney(r.original_loan_amount)}</td>
                    <td className="py-2 pr-3 font-semibold">₹{formatMoney(r.repayment_amount)}</td>
                    <td className="py-2 pr-3">₹{formatMoney(r.suggested_amount)}</td>
                    <td className="py-2 pr-3">{r.status}</td>
                    <td className="py-2 pr-3 space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideRepayment(r);
                          setOverrideForm({ repayment_amount: String(r.repayment_amount), override_reason: '' });
                          setOverrideOpen(true);
                        }}
                        className="text-blue-600"
                      >
                        Override
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt('Reason to skip this month?') || '';
                          setSkipPending(reason);
                          handleSkip(r.id);
                        }}
                        className="text-amber-600"
                      >
                        Skip Month
                      </button>
                      {r.status === 'pending' && ['active', 'on_hold'].includes(r.loan_status) && (
                        <button
                          type="button"
                          disabled={markPaidRepaymentId === r.id}
                          onClick={() => openMarkPaidDialog(r)}
                          className="text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {markPaidRepaymentId === r.id ? 'Saving...' : 'Mark paid'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="pb-2 pr-3">Employee</th>
                <th className="pb-2 pr-3">Loan Amount</th>
                <th className="pb-2 pr-3">Given On</th>
                <th className="pb-2 pr-3">Closed On</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {historyLoans.map((loan) => (
                <tr key={loan.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{loan.employee_name} ({loan.employee_code})</td>
                  <td className="py-2 pr-3">₹{formatMoney(loan.loan_amount)}</td>
                  <td className="py-2 pr-3">{fmtDate(loan.loan_date)}</td>
                  <td className="py-2 pr-3">{fmtDate((loan.updated_at || '').slice(0, 10))}</td>
                  <td className="py-2 pr-3">{statusBadge(loan.status)}</td>
                  <td className="py-2 pr-3">
                    <button type="button" className="text-rose-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={deletePendingLoanId === loan.id} onClick={() => handleDeleteLoan(loan.id)}>
                      {deletePendingLoanId === loan.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-3">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">New Advance Loan</h2>
            {createError && (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {createError}
              </div>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select value={form.employee_id} onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                <option value="">Select employee</option>
                {employees.filter((e) => e.status === 'active').map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}
              </select>
              <input type="number" min="1" placeholder="Loan amount" value={form.loan_amount} onChange={(e) => setForm((f) => ({ ...f, loan_amount: e.target.value, monthly_installment: '' }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <input type="date" value={form.loan_date} onChange={(e) => setForm((f) => ({ ...f, loan_date: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <input type="text" placeholder="Reason (optional)" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <input type="number" min="1" placeholder="Installments" value={form.total_installments} onChange={(e) => setForm((f) => ({ ...f, total_installments: e.target.value, monthly_installment: '' }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <input type="number" min="1" placeholder="Monthly installment" value={form.monthly_installment} onChange={(e) => setForm((f) => ({ ...f, monthly_installment: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs sm:col-span-2" />
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              Total repayment: ₹{formatMoney((Number(form.total_installments || 0) * Number(form.monthly_installment || 0)) || 0)}
            </p>
            {activeLoanWarning && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This employee already has an active loan: ₹{formatMoney(activeLoanWarning.outstanding_balance)} outstanding from {fmtDate(activeLoanWarning.loan_date)}.
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateError('');
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button type="button" onClick={() => handleCreateLoan(Boolean(activeLoanWarning))} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
                Record Advance Loan
              </button>
            </div>
          </div>
        </div>
      )}

      {overrideOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-3">
          <div className="w-full max-w-sm rounded-xl bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Override Repayment</h2>
            <div className="mt-3 space-y-2">
              <input type="number" min="0" value={overrideForm.repayment_amount} onChange={(e) => setOverrideForm((f) => ({ ...f, repayment_amount: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
              <textarea value={overrideForm.override_reason} onChange={(e) => setOverrideForm((f) => ({ ...f, override_reason: e.target.value }))} placeholder="Reason" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOverrideOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">Cancel</button>
              <button type="button" onClick={handleOverrideSubmit} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white">Save Override</button>
            </div>
          </div>
        </div>
      )}
      {markPaidOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-3">
          <div className="w-full max-w-sm rounded-xl bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Mark Installment as Paid</h2>
            <p className="mt-1 text-xs text-slate-600">
              Enter amount collected for this installment.
            </p>
            <div className="mt-3 space-y-2">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={markPaidAmount}
                onChange={(e) => setMarkPaidAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMarkPaidOpen(false);
                  setMarkPaidTarget(null);
                  setMarkPaidAmount('');
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={markPaidRepaymentId != null}
                onClick={handleMarkRepaymentPaidSubmit}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {markPaidRepaymentId != null ? 'Saving...' : 'Mark Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
