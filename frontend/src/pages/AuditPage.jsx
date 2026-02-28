import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';

const PAGE_SIZE = 15;
const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'employee.create', label: 'Employee created' },
  { value: 'employee.update', label: 'Employee updated' },
  { value: 'employee.deactivate', label: 'Employee deactivated' },
  { value: 'payroll.generate', label: 'Payroll generated' },
  { value: 'device.create', label: 'Device created' },
  { value: 'device.update', label: 'Device updated' },
  { value: 'device.activate', label: 'Device activated' },
  { value: 'device.deactivate', label: 'Device deactivated' },
  { value: 'device.regenerate_key', label: 'Device key regenerated' },
  { value: 'device.push', label: 'Device sync (push)' },
  { value: 'auth.login', label: 'Login' },
  { value: 'auth.register', label: 'Register' },
];
const ENTITY_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'employee', label: 'Employee' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'device', label: 'Device' },
  { value: 'user', label: 'User' },
  { value: 'company', label: 'Company' },
];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setForbidden(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (actionType) params.set('action_type', actionType);
    if (entityType) params.set('entity_type', entityType);

    authFetch(`/api/audit?${params}`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (res.status === 403) {
          if (isMounted) setForbidden(true);
          return null;
        }
        if (!res.ok) throw new Error('Failed to load audit log');
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        if (json == null) return;
        const d = json.data;
        setLogs(Array.isArray(d?.data) ? d.data : []);
        setTotal(Number(d?.total ?? 0));
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Unable to load audit log');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [page, actionType, entityType]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Audit log</h1>
        <p className="text-xs text-slate-500">
          View recent actions for compliance and traceability. Admin only.
        </p>
      </header>

      {forbidden && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          You don’t have permission to view the audit log. Only administrators can access this page.
        </section>
      )}

      {!forbidden && (
        <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-600">Action</label>
              <select
                value={actionType}
                onChange={(e) => { setActionType(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 min-w-[160px]"
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-600">Entity</label>
              <select
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 min-w-[120px]"
              >
                {ENTITY_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-50 animate-pulse" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-xs text-slate-500">
              No audit entries match the current filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="pb-2 pr-3 font-medium">Time</th>
                      <th className="pb-2 pr-3 font-medium">Action</th>
                      <th className="pb-2 pr-3 font-medium">Entity</th>
                      <th className="pb-2 pr-3 font-medium">ID</th>
                      <th className="pb-2 pr-3 font-medium">User ID</th>
                      <th className="pb-2 pr-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-800">{row.action_type}</td>
                        <td className="py-2 pr-3 text-slate-700">{row.entity_type}</td>
                        <td className="py-2 pr-3 text-slate-600">{row.entity_id ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-600">{row.user_id ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-500 max-w-[200px] truncate" title={row.metadata ? (typeof row.metadata === 'object' ? JSON.stringify(row.metadata) : String(row.metadata)) : ''}>
                          {row.metadata ? (typeof row.metadata === 'object' ? JSON.stringify(row.metadata) : String(row.metadata)) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  <p>
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded border border-slate-200 px-2 py-1 font-medium disabled:opacity-50 hover:border-primary-200 hover:text-primary-700"
                    >
                      Prev
                    </button>
                    <span>Page {page} of {totalPages}</span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded border border-slate-200 px-2 py-1 font-medium disabled:opacity-50 hover:border-primary-200 hover:text-primary-700"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
