import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch } from '../utils/api';
import { createPdf, addReportHeader, addAutoTable, savePdf } from '../utils/pdfGenerator';
import RecordPaymentModal, { paymentModeLabel } from '../components/payroll/RecordPaymentModal';

const TABS = [
  { key: 'ledger', label: 'All payments' },
  { key: 'statement', label: 'Employee statement' },
  { key: 'outstanding', label: 'Outstanding' },
];

const MONTHS = [
  { value: '', label: 'All months' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
  })),
];

function currentYear() {
  return new Date().getFullYear();
}

function formatMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const raw = String(dateStr).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status) {
  const map = {
    unpaid: 'bg-rose-50 text-rose-700 border-rose-100',
    partial: 'bg-amber-50 text-amber-700 border-amber-100',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };
  const label = status === 'partial' ? 'Partial' : status === 'paid' ? 'Paid' : 'Unpaid';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${map[status] || map.unpaid}`}>
      {label}
    </span>
  );
}

function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  if (/[,"\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildStatementPeriodLabel(fromDate, toDate) {
  if (fromDate && toDate) return `${fromDate} to ${toDate}`;
  if (fromDate) return `From ${fromDate}`;
  if (toDate) return `Until ${toDate}`;
  return 'All dates';
}

function safeFileSlug(value) {
  return String(value || 'employee').replace(/\s+/g, '_').replace(/[^\w-]/g, '');
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PaymentsPage() {
  const [tab, setTab] = useState('ledger');
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [recordModal, setRecordModal] = useState({ open: false, row: null, payrollMode: 'monthly' });
  const [voidingId, setVoidingId] = useState(null);
  const [statementEmployeeId, setStatementEmployeeId] = useState('');
  const [statementRows, setStatementRows] = useState([]);
  const [statementTotal, setStatementTotal] = useState(0);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementExportFormat, setStatementExportFormat] = useState('pdf');
  const [statementExporting, setStatementExporting] = useState(false);
  const [company, setCompany] = useState(null);

  const loadFilterOptions = useCallback(async () => {
    try {
      const [empRes, branchRes] = await Promise.all([
        authFetch('/api/employees?limit=500', { headers: { 'Content-Type': 'application/json' } }),
        authFetch('/api/company/branches', { headers: { 'Content-Type': 'application/json' } }),
      ]);
      const empJson = empRes.ok ? await empRes.json() : { data: { data: [] } };
      const branchJson = branchRes.ok ? await branchRes.json() : { data: [] };
      setEmployees(empJson.data?.data || []);
      setBranches(Array.isArray(branchJson.data) ? branchJson.data : []);
    } catch {
      setEmployees([]);
      setBranches([]);
    }
  }, []);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '200' });
      if (year) params.set('payroll_year', String(year));
      if (month) params.set('payroll_month', month);
      if (employeeFilter) params.set('employee_id', employeeFilter);
      if (branchFilter) params.set('branch_id', branchFilter);
      if (paymentModeFilter) params.set('payment_mode', paymentModeFilter);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);

      const res = await authFetch(`/api/salary-payments?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const json = res.ok ? await res.json() : { data: [] };
      setRows(json.data || []);
    } catch {
      setRows([]);
      setToast({ type: 'error', message: 'Could not load payments' });
    } finally {
      setLoading(false);
    }
  }, [year, month, employeeFilter, branchFilter, paymentModeFilter, fromDate, toDate]);

  const loadOutstanding = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '200' });
      if (year) params.set('year', String(year));
      if (month) params.set('month', month);
      if (employeeFilter) params.set('employee_id', employeeFilter);
      if (branchFilter) params.set('branch_id', branchFilter);

      const res = await authFetch(`/api/salary-payments/outstanding?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const json = res.ok ? await res.json() : { data: [] };
      setRows(json.data || []);
    } catch {
      setRows([]);
      setToast({ type: 'error', message: 'Could not load outstanding payrolls' });
    } finally {
      setLoading(false);
    }
  }, [year, month, employeeFilter, branchFilter]);

  const loadStatement = useCallback(async () => {
    if (!statementEmployeeId) {
      setStatementRows([]);
      setStatementTotal(0);
      return;
    }
    setStatementLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      const qs = params.toString();
      const res = await authFetch(
        `/api/salary-payments/employee/${statementEmployeeId}${qs ? `?${qs}` : ''}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      const json = res.ok ? await res.json() : { data: { data: [], total_paid: 0 } };
      setStatementRows(json.data?.data || []);
      setStatementTotal(Number(json.data?.total_paid || 0));
    } catch {
      setStatementRows([]);
      setStatementTotal(0);
      setToast({ type: 'error', message: 'Could not load employee statement' });
    } finally {
      setStatementLoading(false);
    }
  }, [statementEmployeeId, fromDate, toDate]);

  useEffect(() => {
    loadFilterOptions();
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) setCompany(json.data);
      })
      .catch(() => {});
  }, [loadFilterOptions]);

  useEffect(() => {
    if (tab === 'ledger') loadLedger();
    else if (tab === 'outstanding') loadOutstanding();
    else if (tab === 'statement') loadStatement();
  }, [tab, loadLedger, loadOutstanding, loadStatement]);

  const statementEmployee = useMemo(
    () => employees.find((e) => String(e.id) === String(statementEmployeeId)),
    [employees, statementEmployeeId]
  );

  function openRecordFromOutstanding(row) {
    const payrollMode = row.payroll_type === 'weekly' ? 'weekly' : 'monthly';
    setRecordModal({
      open: true,
      row: {
        id: row.payroll_record_id || row.weekly_payroll_record_id || row.id,
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        employee_code: row.employee_code,
        net_salary: row.net_salary,
        total_paid: row.total_paid,
        year: row.year,
        month: row.month,
        week_start_date: row.week_start_date,
        week_end_date: row.week_end_date,
      },
      payrollMode,
    });
  }

  async function handleVoidPayment(paymentId) {
    if (!window.confirm('Void this payment? This cannot be undone.')) return;
    setVoidingId(paymentId);
    try {
      const res = await authFetch(`/api/salary-payments/${paymentId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not void payment');
      setToast({ type: 'success', message: 'Payment voided' });
      if (tab === 'ledger') await loadLedger();
      else if (tab === 'statement') await loadStatement();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Could not void payment' });
    } finally {
      setVoidingId(null);
    }
  }

  async function handlePaymentSaved() {
    setToast({ type: 'success', message: 'Payment recorded' });
    if (tab === 'ledger') await loadLedger();
    else if (tab === 'outstanding') await loadOutstanding();
    else if (tab === 'statement') await loadStatement();
  }

  function buildStatementExportRows() {
    return statementRows.map((row) => [
      String(row.payment_date || '').slice(0, 10),
      row.period_label || '',
      paymentModeLabel(row.payment_mode),
      row.reference_number || '',
      row.notes || '',
      Number(row.amount || 0),
      Number(row.running_total || 0),
    ]);
  }

  function getStatementExportFilename(ext) {
    const code = safeFileSlug(statementEmployee?.employee_code || statementEmployeeId);
    const period = safeFileSlug(buildStatementPeriodLabel(fromDate, toDate));
    return `payment-ledger-${code}-${period}.${ext}`;
  }

  async function downloadEmployeeStatementCsv() {
    if (!statementEmployeeId) return;
    const header = [
      'Payment Date',
      'Period',
      'Payment Mode',
      'Reference',
      'Notes',
      'Amount',
      'Running Total',
    ];
    const body = buildStatementExportRows();
    const csv = [
      header.map(escapeCsvCell).join(','),
      ...body.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    triggerBlobDownload(blob, getStatementExportFilename('csv'));
  }

  async function downloadEmployeeStatementPdf() {
    if (!statementEmployeeId) return;
    const header = [
      'Payment Date',
      'Period',
      'Mode',
      'Reference',
      'Amount',
      'Running Total',
    ];
    const body = statementRows.map((row) => [
      String(row.payment_date || '').slice(0, 10),
      row.period_label || '',
      paymentModeLabel(row.payment_mode),
      row.reference_number || '',
      formatMoney(row.amount),
      formatMoney(row.running_total),
    ]);

    const employeeLabel = statementEmployee
      ? `${statementEmployee.name} (${statementEmployee.employee_code})`
      : 'Employee';
    const periodLabel = buildStatementPeriodLabel(fromDate, toDate);

    const doc = createPdf({ orientation: 'landscape' });
    const startY = addReportHeader(doc, {
      companyName: company?.name,
      companyPhone: company?.phone,
      companyAddress: company?.address,
      title: 'Employee Payment Ledger',
      periodLabel: `${employeeLabel} · ${periodLabel}`,
      generatedAt: new Date().toLocaleString(),
      totalEmployees: statementRows.length,
    });
    addAutoTable(doc, [header], body, {
      startY,
      margin: { left: 24, right: 24 },
      styles: { fontSize: 8 },
    });
    if (statementRows.length > 0) {
      const pageWidth = doc.internal.pageSize.getWidth();
      const y = doc.internal.pageSize.getHeight() - 44;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(`Total paid: INR ${formatMoney(statementTotal)}`, pageWidth * 0.75, y, { align: 'center' });
    }
    savePdf(doc, getStatementExportFilename('pdf'));
  }

  async function handleDownloadEmployeeStatement() {
    if (!statementEmployeeId) {
      setToast({ type: 'error', message: 'Select an employee first' });
      return;
    }
    setStatementExporting(true);
    setToast(null);
    try {
      if (statementExportFormat === 'csv') {
        await downloadEmployeeStatementCsv();
      } else {
        await downloadEmployeeStatementPdf();
      }
      setToast({ type: 'success', message: 'Employee ledger downloaded' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Download failed' });
    } finally {
      setStatementExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Payments</h1>
          <p className="text-xs text-slate-600">Salary disbursement ledger — bank statement style history.</p>
        </div>
      </div>

      {toast && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            toast.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tab !== 'statement' && (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                >
                  {[currentYear(), currentYear() - 1, currentYear() - 2].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value || 'all'} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {tab === 'statement' && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Employee</label>
              <select
                value={statementEmployeeId}
                onChange={(e) => setStatementEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
                ))}
              </select>
            </div>
          )}
          {tab === 'ledger' && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Employee</label>
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                <option value="">All employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          {tab === 'ledger' && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Payment mode</label>
              <select
                value={paymentModeFilter}
                onChange={(e) => setPaymentModeFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                <option value="">All modes</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
          {(tab === 'ledger' || tab === 'statement') && (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">From date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">To date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                />
              </div>
            </>
          )}
        </div>
      </section>

      {tab === 'ledger' && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-xs text-slate-500">Loading payments...</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-xs text-slate-500">No payments found for selected filters.</p>
          ) : (
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium text-right">Balance (period)</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{fmtDate(row.payment_date)}</td>
                    <td className="px-3 py-2">
                      {row.employee_name}
                      <span className="block text-[10px] text-slate-500">{row.employee_code}</span>
                    </td>
                    <td className="px-3 py-2">{row.period_label}</td>
                    <td className="px-3 py-2">{paymentModeLabel(row.payment_mode)}</td>
                    <td className="px-3 py-2 text-slate-600">{row.reference_number || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">₹{formatMoney(row.amount)}</td>
                    <td className="px-3 py-2 text-right">₹{formatMoney(row.balance_due)}</td>
                    <td className="px-3 py-2">{statusBadge(row.payment_status)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={voidingId === row.id}
                        onClick={() => handleVoidPayment(row.id)}
                        className="text-rose-600 hover:underline disabled:opacity-50"
                      >
                        {voidingId === row.id ? 'Voiding...' : 'Void'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'statement' && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {!statementEmployeeId ? (
            <p className="p-4 text-xs text-slate-500">Select an employee to view their payment statement.</p>
          ) : statementLoading ? (
            <p className="p-4 text-xs text-slate-500">Loading statement...</p>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {statementEmployee?.name || 'Employee'} — Payment statement
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Total paid in range:{' '}
                      <span className="font-semibold text-emerald-700">₹{formatMoney(statementTotal)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
                        <input
                          type="radio"
                          name="statement-export-fmt"
                          className="border-slate-300 text-blue-600"
                          checked={statementExportFormat === 'pdf'}
                          onChange={() => setStatementExportFormat('pdf')}
                        />
                        PDF
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-700">
                        <input
                          type="radio"
                          name="statement-export-fmt"
                          className="border-slate-300 text-blue-600"
                          checked={statementExportFormat === 'csv'}
                          onChange={() => setStatementExportFormat('csv')}
                        />
                        CSV
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={statementExporting || statementLoading}
                      onClick={() => void handleDownloadEmployeeStatement()}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50"
                    >
                      {statementExporting
                        ? 'Downloading...'
                        : `Download ledger (${statementExportFormat.toUpperCase()})`}
                    </button>
                  </div>
                </div>
              </div>
              {statementRows.length === 0 ? (
                <p className="p-4 text-xs text-slate-500">No payments in selected date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Period</th>
                        <th className="px-3 py-2 font-medium">Mode</th>
                        <th className="px-3 py-2 font-medium">Reference</th>
                        <th className="px-3 py-2 font-medium text-right">Amount</th>
                        <th className="px-3 py-2 font-medium text-right">Running total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-3 py-2">{fmtDate(row.payment_date)}</td>
                          <td className="px-3 py-2">{row.period_label}</td>
                          <td className="px-3 py-2">{paymentModeLabel(row.payment_mode)}</td>
                          <td className="px-3 py-2">{row.reference_number || '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold">₹{formatMoney(row.amount)}</td>
                          <td className="px-3 py-2 text-right">₹{formatMoney(row.running_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'outstanding' && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-4 text-xs text-slate-500">Loading outstanding payrolls...</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-xs text-slate-500">No outstanding balances for selected period.</p>
          ) : (
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium text-right">Net salary</th>
                  <th className="px-3 py-2 font-medium text-right">Paid</th>
                  <th className="px-3 py-2 font-medium text-right">Balance</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.payroll_type}-${row.id}`} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      {row.employee_name}
                      <span className="block text-[10px] text-slate-500">{row.employee_code}</span>
                    </td>
                    <td className="px-3 py-2">{row.period_label}</td>
                    <td className="px-3 py-2 text-right">₹{formatMoney(row.net_salary)}</td>
                    <td className="px-3 py-2 text-right">₹{formatMoney(row.total_paid)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">₹{formatMoney(row.balance_due)}</td>
                    <td className="px-3 py-2">{statusBadge(row.payment_status)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openRecordFromOutstanding(row)}
                        className="text-emerald-700 hover:underline"
                      >
                        Record payment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <RecordPaymentModal
        open={recordModal.open}
        onClose={() => setRecordModal({ open: false, row: null, payrollMode: 'monthly' })}
        payrollRow={recordModal.row}
        payrollMode={recordModal.payrollMode}
        onSaved={handlePaymentSaved}
      />
    </div>
  );
}
