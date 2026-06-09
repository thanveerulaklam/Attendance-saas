import { useCallback, useEffect, useState } from 'react';

function adminFetch(path, options = {}, key) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Approval-Secret': key,
    ...(options.headers || {}),
  };
  return fetch(`/api/admin${path}`, { ...options, headers });
}

function formatCurrencyInr(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function paymentTypeLabel(type) {
  return type === 'onetime' ? 'One-time fee' : 'AMC';
}

export default function AdminFinanceSection({ adminKey, onAuthError, setToast }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [expandedForecastMonth, setExpandedForecastMonth] = useState(null);

  const loadFinance = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(`/finance-overview?month=${encodeURIComponent(selectedMonth)}`, {}, adminKey);
      if (res.status === 401) {
        onAuthError?.();
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load finance data');
      setFinance(json.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load finance data');
      setFinance(null);
    } finally {
      setLoading(false);
    }
  }, [adminKey, selectedMonth, onAuthError]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  const summary = finance?.summary;
  const allTime = finance?.all_time;
  const outstanding = finance?.outstanding;
  const monthlyHistory = Array.isArray(finance?.monthly_history) ? finance.monthly_history : [];
  const maxHistoryTotal = Math.max(1, ...monthlyHistory.map((m) => m.total_received || 0));
  const amcForecast = Array.isArray(finance?.amc_forecast) ? finance.amc_forecast : [];
  const paymentsInMonth = Array.isArray(finance?.payments_in_month) ? finance.payments_in_month : [];
  const ledger = Array.isArray(finance?.payment_ledger) ? finance.payment_ledger : [];
  const filteredLedger = ledger.filter((p) => {
    if (ledgerFilter === 'all') return true;
    return p.payment_type === ledgerFilter;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-indigo-50/40 p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Accounts & revenue</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Track one-time fees and AMC received by month, review all recorded payments, and see expected AMC
              collections ahead.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={loadFinance}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        {finance?.notes?.length > 0 && (
          <ul className="mt-3 text-[11px] text-slate-500 list-disc pl-4 space-y-0.5">
            {finance.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {loading && !finance ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          Loading finance data…
        </div>
      ) : finance ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800">
                Earned in {finance.selected_month?.month_label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-900 tabular-nums">
                {formatCurrencyInr(summary?.total_received)}
              </p>
              <p className="text-xs text-emerald-800/80 mt-1">
                {summary?.payment_count ?? 0} payment{(summary?.payment_count ?? 0) === 1 ? '' : 's'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">One-time (month)</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                {formatCurrencyInr(summary?.onetime_received)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{summary?.onetime_payment_count ?? 0} payment(s)</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">AMC (month)</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                {formatCurrencyInr(summary?.amc_received)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{summary?.amc_payment_count ?? 0} payment(s)</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-800">All-time recorded</p>
              <p className="mt-1 text-xl font-semibold text-indigo-950 tabular-nums">
                {formatCurrencyInr(allTime?.total_received)}
              </p>
              <p className="text-xs text-indigo-800/80 mt-1">
                OTC {formatCurrencyInr(allTime?.onetime_received)} · AMC {formatCurrencyInr(allTime?.amc_received)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <p className="text-xs font-semibold text-amber-900">Outstanding one-time</p>
              <p className="mt-1 text-lg font-semibold text-amber-950 tabular-nums">
                {formatCurrencyInr(outstanding?.unpaid_onetime_value)}
              </p>
              <p className="text-[11px] text-amber-800">{outstanding?.unpaid_onetime_count ?? 0} tenant(s) not marked paid</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <p className="text-xs font-semibold text-amber-900">AMC due within 30 days</p>
              <p className="mt-1 text-lg font-semibold text-amber-950 tabular-nums">
                {formatCurrencyInr(outstanding?.amc_due_soon_value)}
              </p>
              <p className="text-[11px] text-amber-800">{outstanding?.amc_due_soon_count ?? 0} tenant(s)</p>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">Revenue by month</h3>
              <p className="text-xs text-slate-500">Last {monthlyHistory.length} months (recorded payment dates)</p>
            </div>
            <div className="p-4 space-y-3">
              {monthlyHistory.map((m) => {
                const pct = Math.round(((m.total_received || 0) / maxHistoryTotal) * 100);
                const isSelected = m.month === finance.selected_month?.month_key;
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() => setSelectedMonth(m.month)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                      isSelected ? 'border-indigo-300 bg-indigo-50/60' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                        {m.month_label}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatCurrencyInr(m.total_received)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isSelected ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
                      <span>OTC {formatCurrencyInr(m.onetime_received)}</span>
                      <span>AMC {formatCurrencyInr(m.amc_received)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-indigo-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/50 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">AMC forecast</h3>
                <p className="text-xs text-slate-600">
                  Expected collections by next AMC due date · next {finance.forecast_meta?.months ?? 12} months:{' '}
                  <span className="font-semibold text-indigo-900">
                    {formatCurrencyInr(finance.forecast_meta?.total_expected_amc)}
                  </span>
                </p>
              </div>
            </div>
            {amcForecast.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No AMC amounts scheduled in the forecast window.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {amcForecast.map((bucket) => {
                  const open = expandedForecastMonth === bucket.month;
                  return (
                    <div key={bucket.month}>
                      <button
                        type="button"
                        onClick={() => setExpandedForecastMonth(open ? null : bucket.month)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{bucket.month_label}</p>
                          <p className="text-xs text-slate-500">{bucket.company_count} tenant(s)</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-indigo-900 tabular-nums">
                            {formatCurrencyInr(bucket.expected_amc_total)}
                          </p>
                          <p className="text-[10px] text-slate-500">{open ? 'Hide' : 'Show'} tenants</p>
                        </div>
                      </button>
                      {open && (
                        <div className="px-4 pb-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="text-left py-1 font-medium">Company</th>
                                <th className="text-left py-1 font-medium">Due</th>
                                <th className="text-right py-1 font-medium">AMC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bucket.companies.map((c) => (
                                <tr key={c.company_id} className="border-t border-slate-100">
                                  <td className="py-1.5 text-slate-800">{c.company_name}</td>
                                  <td className="py-1.5 text-slate-600">
                                    {formatDateShort(c.next_amc_due_date)}
                                    {c.days_until_due < 0 && (
                                      <span className="ml-1 text-rose-600 font-medium">overdue</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-right font-medium tabular-nums">
                                    {formatCurrencyInr(c.amc_amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                Payments in {finance.selected_month?.month_label}
              </h3>
            </div>
            {paymentsInMonth.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No payments recorded for this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Date</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Company</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Type</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paymentsInMonth.map((p) => (
                      <tr key={p.ledger_id ?? `${p.company_id}-${p.payment_type}-${p.payment_date}`}>
                        <td className="px-4 py-2 text-slate-700">{formatDateShort(p.payment_date)}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{p.company_name}</td>
                        <td className="px-4 py-2 text-slate-600">{paymentTypeLabel(p.payment_type)}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {formatCurrencyInr(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Payment ledger</h3>
                <p className="text-xs text-slate-500">Full payment history — every one-time fee and AMC renewal</p>
              </div>
              <select
                value={ledgerFilter}
                onChange={(e) => setLedgerFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
              >
                <option value="all">All types</option>
                <option value="onetime">One-time only</option>
                <option value="amc">AMC only</option>
              </select>
            </div>
            {filteredLedger.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Date</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Company</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Type</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-700">Plan</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-700">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLedger.map((p) => (
                      <tr key={p.ledger_id ?? `${p.company_id}-${p.payment_type}-${p.payment_date}`}>
                        <td className="px-4 py-2 text-slate-700">{formatDateShort(p.payment_date)}</td>
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-900">{p.company_name}</div>
                          <div className="text-[10px] text-slate-500 capitalize">{p.company_status}</div>
                        </td>
                        <td className="px-4 py-2 text-slate-600">{paymentTypeLabel(p.payment_type)}</td>
                        <td className="px-4 py-2 text-slate-500 capitalize">{p.plan_code || '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {formatCurrencyInr(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
