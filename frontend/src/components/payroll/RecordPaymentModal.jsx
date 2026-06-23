import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/api';
import { formatMoneyWithSymbol, currencySymbol } from '../../utils/formatMoney';

export const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export function paymentModeLabel(mode) {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label || mode || '—';
}

export default function RecordPaymentModal({
  open,
  onClose,
  payrollRow,
  payrollMode = 'monthly',
  onSaved,
}) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [companyCurrency, setCompanyCurrency] = useState('INR');

  const moneySym = currencySymbol(companyCurrency);
  const fmtSym = (n) => formatMoneyWithSymbol(n, companyCurrency);

  const balanceDue = summary != null
    ? Number(summary.balance_due || 0)
    : Math.max(0, Number(payrollRow?.net_salary || 0) - Number(payrollRow?.total_paid || 0));

  useEffect(() => {
    if (!open || !payrollRow?.id) return undefined;

    let cancelled = false;
    async function loadSummary() {
      setLoadingSummary(true);
      try {
        const path = payrollMode === 'weekly'
          ? `/api/salary-payments/weekly/${payrollRow.id}`
          : `/api/salary-payments/payroll/${payrollRow.id}`;
        const res = await authFetch(path, { headers: { 'Content-Type': 'application/json' } });
        const json = res.ok ? await res.json() : { data: null };
        if (!cancelled) {
          setSummary(json.data || null);
          const bal = Number(json.data?.balance_due ?? balanceDue);
          setAmount(bal > 0 ? String(bal) : '');
        }
      } catch {
        if (!cancelled) {
          const bal = Math.max(0, Number(payrollRow?.net_salary || 0) - Number(payrollRow?.total_paid || 0));
          setAmount(bal > 0 ? String(bal) : '');
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    }

    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMode('bank_transfer');
    setReferenceNumber('');
    setNotes('');
    setError('');
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setCompanyCurrency(json?.data?.currency || 'INR'))
      .catch(() => setCompanyCurrency('INR'));
    loadSummary();
    return () => { cancelled = true; };
  }, [open, payrollRow?.id, payrollMode]);

  if (!open || !payrollRow) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const paidAmount = Number(amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      setError('Enter a valid amount greater than 0');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const body = {
        employee_id: payrollRow.employee_id,
        amount: paidAmount,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        reference_number: referenceNumber.trim() || null,
        notes: notes.trim() || null,
      };
      if (payrollMode === 'weekly') {
        body.weekly_payroll_record_id = payrollRow.id;
      } else {
        body.payroll_record_id = payrollRow.id;
      }

      const res = await authFetch('/api/salary-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not record payment');

      if (json.data?.overpayment_warning) {
        // eslint-disable-next-line no-alert
        window.alert('Payment recorded, but total paid now exceeds net salary.');
      }

      onSaved?.(json.data);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not record payment');
    } finally {
      setSaving(false);
    }
  }

  const periodLabel = payrollMode === 'weekly'
    ? `${String(payrollRow.week_start_date || '').slice(0, 10)} – ${String(payrollRow.week_end_date || '').slice(0, 10)}`
    : new Date(payrollRow.year, payrollRow.month - 1, 1).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-4 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-900">Record salary payment</h2>
        <p className="mt-1 text-xs text-slate-600">
          {payrollRow.employee_name} ({payrollRow.employee_code}) — {periodLabel}
        </p>
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          <div className="flex justify-between">
            <span>Net salary</span>
            <span className="font-semibold">{fmtSym(payrollRow.net_salary)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Already paid</span>
            <span>{fmtSym(summary?.total_paid ?? payrollRow.total_paid ?? 0)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold text-emerald-700">
            <span>Balance due</span>
            <span>{loadingSummary ? '...' : fmtSym(balanceDue)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Amount ({moneySym})</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Payment date</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Payment mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Reference / UTR (optional)</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Transaction ID, cheque no., etc."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
          </div>
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingSummary}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
