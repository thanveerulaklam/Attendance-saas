import { useState } from 'react';
import { authFetch } from '../utils/api';
import { generateDetailedAttendancePdf } from '../components/reports/DetailedReportPDF';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i, 1).toLocaleString('default', { month: 'long' }),
}));

function currentYear() {
  return new Date().getFullYear();
}

/**
 * Fetch CSV from URL and trigger browser download.
 */
async function downloadCsv(url, defaultFilename) {
  const res = await authFetch(url, {
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Download failed (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition');
  let filename = defaultFilename;
  if (disposition) {
    const match = /filename="?([^";\r\n]+)"?/.exec(disposition);
    if (match) filename = match[1].trim();
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export default function ReportsPage() {
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [detailedEmployeeId, setDetailedEmployeeId] = useState('');
  const [detailedFrom, setDetailedFrom] = useState('');
  const [detailedTo, setDetailedTo] = useState('');
  const [includeWeekends, setIncludeWeekends] = useState(true);

  const params = new URLSearchParams({ year, month });
  const base = '/api/reports';

  const handleDownload = (type) => async () => {
    const urls = {
      attendance: `${base}/attendance.csv?${params}`,
      payroll: `${base}/payroll.csv?${params}`,
      overtime: `${base}/overtime.csv?${params}`,
    };
    const names = {
      attendance: `attendance-${year}-${String(month).padStart(2, '0')}.csv`,
      payroll: `payroll-${year}-${String(month).padStart(2, '0')}.csv`,
      overtime: `overtime-${year}-${String(month).padStart(2, '0')}.csv`,
    };
    try {
      setLoading(type);
      setToast(null);
      await downloadCsv(urls[type], names[type]);
      setToast({ type: 'success', message: `${type} report downloaded` });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Download failed' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed right-6 top-20 z-30">
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-soft ${
              toast.type === 'error'
                ? 'border-rose-100 bg-rose-50 text-rose-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            }`}
          >
            <span className="mt-0.5 text-sm">{toast.type === 'error' ? '⚠️' : '✅'}</span>
            <div>
              <p className="font-medium">{toast.type === 'error' ? 'Error' : 'Success'}</p>
              <p className="mt-0.5">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-[11px] text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <header>
        <h1 className="text-lg font-semibold text-slate-900">Reports</h1>
        <p className="text-xs text-slate-500">
          Export monthly attendance, payroll, and overtime as CSV.
        </p>
      </header>

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Date range</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Select year and month for the report period.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-600">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
            >
              {[currentYear(), currentYear() - 1, currentYear() - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-600">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-900">Download</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Click a button to download the CSV file for {MONTHS.find((m) => m.value === month)?.label} {year}.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownload('attendance')}
            disabled={loading != null}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 disabled:opacity-50"
          >
            {loading === 'attendance' ? 'Downloading...' : 'Download attendance CSV'}
          </button>
          <button
            type="button"
            onClick={handleDownload('payroll')}
            disabled={loading != null}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 disabled:opacity-50"
          >
            {loading === 'payroll' ? 'Downloading...' : 'Download payroll CSV'}
          </button>
          <button
            type="button"
            onClick={handleDownload('overtime')}
            disabled={loading != null}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-800 disabled:opacity-50"
          >
            {loading === 'overtime' ? 'Downloading...' : 'Download overtime CSV'}
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-600">
          <p className="font-medium text-slate-700">Report contents</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li><strong>Attendance:</strong> Employee code, name, present/absent/late days, overtime hours.</li>
            <li><strong>Payroll:</strong> Employee code, name, present/total days, overtime, gross, deductions, net salary.</li>
            <li><strong>Overtime:</strong> Employee code, name, overtime hours for the month.</li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">Detailed Attendance Report (PDF)</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Generate a printable PDF with per-employee summary and per-day attendance details.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Period
              </label>
              <p className="text-[11px] text-slate-500">
                Uses selected month/year above. Optionally override with a custom date range below.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  From date (optional)
                </label>
                <input
                  type="date"
                  value={detailedFrom}
                  onChange={(e) => setDetailedFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  To date (optional)
                </label>
                <input
                  type="date"
                  value={detailedTo}
                  onChange={(e) => setDetailedTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Include weekends
              </label>
              <label className="inline-flex items-center gap-2 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={includeWeekends}
                  onChange={(e) => setIncludeWeekends(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Include Saturdays and Sundays in detailed section</span>
              </label>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Employee
              </label>
              <p className="text-[11px] text-slate-500 mb-1">
                Leave blank for all employees or enter a specific employee ID to focus on one person.
              </p>
              <input
                type="text"
                value={detailedEmployeeId}
                onChange={(e) => setDetailedEmployeeId(e.target.value)}
                placeholder="All employees"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-800"
              />
            </div>
            <div className="pt-2">
              <button
                type="button"
                disabled={detailedLoading}
                onClick={async () => {
                  try {
                    setDetailedLoading(true);
                    setToast(null);
                    await generateDetailedAttendancePdf({
                      year,
                      month,
                      fromDate: detailedFrom || null,
                      toDate: detailedTo || null,
                      employeeId: detailedEmployeeId || null,
                      includeWeekends,
                    });
                    setToast({ type: 'success', message: 'Detailed attendance PDF generated' });
                  } catch (err) {
                    setToast({
                      type: 'error',
                      message: err.message || 'Failed to generate detailed PDF',
                    });
                  } finally {
                    setDetailedLoading(false);
                  }
                }}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {detailedLoading ? 'Generating PDF...' : 'Generate detailed attendance PDF'}
              </button>
              <p className="mt-2 text-[10px] text-slate-500">
                The PDF is generated in your browser using current attendance and company data. No file is stored on the server.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
