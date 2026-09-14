import { useEffect, useState } from 'react';
import { demoEnquiryStatusLabel, leadSourceLabel } from '../constants/demoEnquiryStatus';

function mergeImportResults(a, b) {
  const left = a || { created: 0, skipped: 0, failed: 0, details: [] };
  const right = b || { created: 0, skipped: 0, failed: 0, details: [] };
  return {
    created: (left.created || 0) + (right.created || 0),
    skipped: (left.skipped || 0) + (right.skipped || 0),
    failed: (left.failed || 0) + (right.failed || 0),
    details: [...(left.details || []), ...(right.details || [])],
  };
}

export default function LeadBulkImportModal({
  open,
  onClose,
  adminFetch,
  onAuthError,
  onComplete,
}) {
  const [pasteText, setPasteText] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setPasteText('');
    setFile(null);
    setSubmitting(false);
    setLocalError('');
    setResult(null);
  }, [open]);

  const downloadTemplate = async () => {
    try {
      setLocalError('');
      const res = await adminFetch('/demo-enquiry-import-template');
      if (res.status === 401 || res.status === 403) {
        onAuthError?.();
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || 'Could not download template');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lead-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLocalError(err.message || 'Could not download template');
    }
  };

  const postImport = async (options) => {
    const res = await adminFetch('/demo-enquiries-bulk', {
      method: 'POST',
      ...options,
    });
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      onAuthError?.();
      throw new Error('Admin session expired. Sign in again.');
    }
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      throw new Error(json.message || json.error || text || 'Import failed');
    }
    return json.data || {};
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pasted = pasteText.trim();
    if (!pasted && !file) {
      setLocalError('Paste leads from WhatsApp, or choose an Excel/CSV file.');
      return;
    }

    try {
      setSubmitting(true);
      setLocalError('');
      setResult(null);

      let combined = { created: 0, skipped: 0, failed: 0, details: [] };
      if (pasted) {
        combined = mergeImportResults(
          combined,
          await postImport({ body: JSON.stringify({ text: pasted }) })
        );
      }
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        combined = mergeImportResults(combined, await postImport({ body: formData }));
      }

      setResult(combined);
      onComplete?.(combined);
    } catch (err) {
      setLocalError(err.message || 'Unexpected error while importing');
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

  const skipped = (result?.details || []).filter((row) => row.status === 'skipped');
  const failed = (result?.details || []).filter((row) => row.status === 'failed');

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-bulk-import-title"
      onClick={handleOverlayClick}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 id="lead-bulk-import-title" className="text-base font-semibold text-slate-900">
              Bulk upload leads
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Copy name and phone from WhatsApp Business, paste one lead per line, then import.
              Duplicates by mobile are skipped.
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

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {localError ? (
            <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {localError}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="lead-bulk-paste" className="block text-xs font-medium text-slate-700">
                Paste from WhatsApp
              </label>
              <textarea
                id="lead-bulk-paste"
                rows={7}
                value={pasteText}
                disabled={submitting}
                onChange={(ev) => setPasteText(ev.target.value)}
                placeholder={'Ravi garments 8940040072\nKarthik, 9066096888'}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:bg-slate-50"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                One lead per line: <span className="font-medium text-slate-700">Name 9876543210</span> or{' '}
                <span className="font-medium text-slate-700">Name, 9876543210</span>. Blank source becomes
                WhatsApp.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Download Excel template
              </button>
              <span className="text-[11px] text-slate-400">or upload a sheet you already keep</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Spreadsheet file
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={submitting}
                  onChange={(ev) => {
                    const next = ev.target.files?.[0];
                    setFile(next || null);
                  }}
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
              </label>
              <p className="mt-1 text-[11px] text-slate-400">
                .xlsx, .xls, or .csv — max 10 MB, up to 200 rows. Required columns (
                <span className="font-medium text-rose-600">full_name</span>,{' '}
                <span className="font-medium text-rose-600">phone_number</span>) are in red in the template.
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
                disabled={submitting}
                className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-800 disabled:opacity-50"
              >
                {submitting ? 'Importing…' : 'Import'}
              </button>
            </div>
          </form>

          {result ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <p className="font-medium text-slate-900">
                {result.created} added · {result.skipped} skipped · {result.failed} failed
              </p>

              {skipped.length > 0 ? (
                <div className="mt-3">
                  <p className="font-medium text-amber-900">Already in CRM / duplicates</p>
                  <ul className="mt-1.5 max-h-36 space-y-1.5 overflow-y-auto rounded border border-amber-100 bg-white p-2">
                    {skipped.map((row, idx) => (
                      <li key={`skip-${row.row}-${row.phone_number}-${idx}`} className="text-[11px] text-slate-700">
                        <span className="font-medium text-slate-900">
                          {row.full_name || row.phone_number || `Row ${row.row}`}
                        </span>
                        {row.phone_number ? ` · ${row.phone_number}` : ''}
                        {row.existing ? (
                          <span className="block text-amber-800/90">
                            Existing: {[row.existing.full_name, row.existing.business_name].filter(Boolean).join(' · ')}
                            {row.existing.status ? ` · ${demoEnquiryStatusLabel(row.existing.status)}` : ''}
                            {row.existing.source ? ` · ${leadSourceLabel(row.existing.source)}` : ''}
                          </span>
                        ) : (
                          <span className="block text-amber-800/90">{row.error}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {failed.length > 0 ? (
                <div className="mt-3">
                  <p className="font-medium text-rose-800">Failed rows</p>
                  <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto rounded border border-rose-100 bg-white p-2">
                    {failed.map((row, idx) => (
                      <li key={`fail-${row.row}-${idx}`} className="text-[11px] text-rose-800">
                        Row {row.row}
                        {row.full_name ? ` · ${row.full_name}` : ''}
                        {row.phone_number ? ` · ${row.phone_number}` : ''}
                        : {row.error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
