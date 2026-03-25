import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const DEFAULT_LIMIT = 20;

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('default', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EnquiriesPage() {
  const { user } = useAuth();
  const isSuperAdmin =
    user?.role === 'admin' &&
    (user?.company_id == null || Number(user?.company_id) === 0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enquiries, setEnquiries] = useState([]);
  const [page, setPage] = useState(1);
  const limit = DEFAULT_LIMIT;
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const load = async (pageToLoad) => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(
        `/api/demo-enquiries?page=${encodeURIComponent(pageToLoad)}&limit=${encodeURIComponent(limit)}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || 'Failed to load enquiries');
      }
      const data = json.data || {};
      setEnquiries(Array.isArray(data.data) ? data.data : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      setError(err.message || 'Unable to load enquiries');
      setEnquiries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isSuperAdmin]);

  const pageRows = useMemo(() => enquiries || [], [enquiries]);

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-lg font-semibold text-slate-900">Enquiries</h1>
          <p className="text-xs text-slate-500">Only super admin can view enquiries.</p>
        </header>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          You don&apos;t have permission to view this page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Enquiries</h1>
        <p className="text-xs text-slate-500">Requests submitted from the “Free Demo” landing form.</p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-600">
            Showing page <span className="font-medium text-slate-900">{page}</span> of{' '}
            <span className="font-medium text-slate-900">{totalPages}</span> ({total} total)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => load(page)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-50 animate-pulse" />
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-xs text-slate-500">
            No enquiries yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 pr-3 font-medium">Business</th>
                  <th className="pb-2 pr-3 font-medium">Phone</th>
                  <th className="pb-2 pr-3 font-medium">Employees</th>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Created</th>
                  <th className="pb-2 pr-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((q) => (
                  <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-2 pr-3 font-medium text-slate-900">{q.full_name || '—'}</td>
                    <td className="py-2 pr-3 text-slate-700">{q.business_name || '—'}</td>
                    <td className="py-2 pr-3 text-slate-700">{q.phone_number || '—'}</td>
                    <td className="py-2 pr-3 text-slate-700">{q.employees_range || '—'}</td>
                    <td className="py-2 pr-3 text-slate-700">{q.source || 'landing'}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatDateTime(q.created_at)}</td>
                    <td className="py-2 pr-3 text-slate-600">{q.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

