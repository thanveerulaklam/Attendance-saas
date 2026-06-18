import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/api';

export default function EmployeeBulkImportModal({ open, onClose, onComplete }) {
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setSubmitting(false);
    setToast(null);
    setResult(null);
  }, [open]);

  const downloadTemplate = async () => {
    try {
      setToast(null);
      const res = await authFetch('/api/employees/import-template');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || 'Could not download template');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employee-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Could not download template',
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setToast({ type: 'error', message: 'Choose an Excel or CSV file first.' });
      return;
    }

    try {
      setSubmitting(true);
      setToast(null);
      setResult(null);

      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch('/api/employees/bulk-import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          json?.message ||
          json?.error ||
          'Import failed. Check the file and try again.';
        if (json?.data?.duplicates?.length) {
          setResult({ duplicates: json.data.duplicates });
        }
        setToast({ type: 'error', message: msg });
        return;
      }

      const data = json.data || {};
      setResult({
        created: data.created ?? 0,
        skipped: data.skipped ?? 0,
        failed: Array.isArray(data.failed) ? data.failed : [],
      });
      if (typeof onComplete === 'function') {
        onComplete({
          created: data.created ?? 0,
          skipped: data.skipped ?? 0,
          failed: data.failed || [],
        });
      }
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Unexpected error while uploading',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose?.();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-import-title"
      onClick={handleOverlayClick}
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="bulk-import-title" className="text-sm font-semibold text-slate-900">
              Bulk import employees
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Download the template, fill one row per employee, then upload. Rows with an employee
              code that already exists are skipped.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <span className="sr-only">Close</span>
            ✕
          </button>
        </header>

        <div className="max-h-[min(70vh,32rem)] overflow-y-auto px-5 py-4 space-y-4">
          {toast && (
            <div
              className={`rounded-md px-3 py-2 text-xs ${
                toast.type === 'error'
                  ? 'border border-rose-100 bg-rose-50 text-rose-700'
                  : 'border border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}
            >
              {toast.message}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-primary-200 hover:text-primary-700 disabled:opacity-50"
            >
              Download Excel template
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Spreadsheet file
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={submitting}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    setFile(f || null);
                  }}
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
              </label>
              <p className="mt-1 text-[11px] text-slate-400">
                .xlsx, .xls, or .csv — max 10 MB, up to 500 rows. Required columns (
                <span className="font-medium text-rose-600">name</span>,{' '}
                <span className="font-medium text-rose-600">employee_code</span>,{' '}
                <span className="font-medium text-rose-600">basic_salary</span>,{' '}
                <span className="font-medium text-rose-600">join_date</span>) are shown in red in
                the Excel template.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => !submitting && onClose?.()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !file}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Importing…' : 'Upload and import'}
              </button>
            </div>
          </form>

          {result?.duplicates && result.duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">Duplicates in file</p>
              <ul className="mt-2 max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto text-[11px]">
                {result.duplicates.map((d) => (
                  <li key={`${d.employee_code}-${d.duplicate_row}`}>
                    Code &quot;{d.employee_code}&quot;: first row {d.first_row}, duplicate row{' '}
                    {d.duplicate_row}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result != null && Array.isArray(result.failed) && !result.duplicates && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <p className="font-medium text-slate-900">
                Summary: {result.created} added, {result.skipped} skipped (already in system)
                {result.failed.length > 0 ? `, ${result.failed.length} row(s) failed` : ''}.
              </p>
              {result.failed.length > 0 && (
                <div className="mt-3 max-h-40 overflow-auto rounded border border-slate-200 bg-white">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Row</th>
                        <th className="px-2 py-1.5 font-medium">Code</th>
                        <th className="px-2 py-1.5 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed.map((f) => (
                        <tr key={`${f.row}-${f.code}`} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 tabular-nums">{f.row}</td>
                          <td className="px-2 py-1.5">{f.code ?? '—'}</td>
                          <td className="px-2 py-1.5 text-rose-700">{f.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                type="button"
                onClick={() => onClose?.()}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
