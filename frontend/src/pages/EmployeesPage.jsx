import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/api';
import EmployeeCard from '../components/employees/EmployeeCard';
import EmployeeFormModal from '../components/employees/EmployeeFormModal';
import EmployeeFilters from '../components/employees/EmployeeFilters';

const PAGE_SIZE = 9;

export default function EmployeesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openFromOnboarding = searchParams.get('onboarding') === 'open_employee_modal';

  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(openFromOnboarding);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!openFromOnboarding) return;
    // Clean up the query param after opening from onboarding
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('onboarding');
      return next;
    }, { replace: true });
  }, [openFromOnboarding, setSearchParams]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await authFetch(`/api/employees?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load employees');
      }

      const json = await res.json();
      setEmployees(json.data?.data || []);
      setTotal(json.data?.total || 0);
    } catch (err) {
      setError(err.message || 'Unable to load employees');
      setToast({
        type: 'error',
        message: err.message || 'Unable to load employees',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  const handleSearchChange = (value) => {
    setPage(1);
    setSearch(value);
  };

  const handleStatusChange = (value) => {
    setPage(1);
    setStatusFilter(value);
  };

  const handleEmployeeCreated = (employee) => {
    setShowModal(false);
    setPage(1);
    fetchEmployees();
    setToast({
      type: 'success',
      message: employee?.name
        ? `Employee "${employee.name}" saved successfully`
        : 'Employee saved successfully',
    });
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed right-6 top-20 z-30">
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-soft ${
              toast.type === 'error'
                ? 'border-rose-100 bg-rose-50 text-rose-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            }`}
          >
            <span className="mt-0.5 text-sm">
              {toast.type === 'error' ? '⚠️' : '✅'}
            </span>
            <div>
              <p className="font-medium">
                {toast.type === 'error' ? 'Something went wrong' : 'Success'}
              </p>
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

      {/* Header actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Employees</h1>
          <p className="text-xs text-slate-500">
            Manage your workforce with a modern, card-based overview.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <span className="mr-1 text-base">＋</span>
          Add employee
        </button>
      </div>

      {/* Filters row */}
      <EmployeeFilters
        search={search}
        status={statusFilter}
        onSearchChange={handleSearchChange}
        onStatusChange={handleStatusChange}
      />

      {/* Content */}
      <section className="rounded-xl bg-white border border-slate-100 shadow-soft px-4 py-5 sm:px-5">
        {error && (
          <div className="mb-4 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: PAGE_SIZE }).map((_, idx) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                className="h-40 rounded-xl border border-slate-100 bg-slate-50/80 animate-pulse"
              />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 h-16 w-16 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-primary-100 to-indigo-100" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">No employees yet</h2>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Add your first employees to start tracking attendance, payroll, and workforce health.
            </p>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-primary-200 hover:text-primary-700"
            >
              Add employee
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {employees.map((employee) => (
                <EmployeeCard key={employee.id} employee={employee} />
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:flex-row">
              <p>
                Showing{' '}
                <span className="font-medium text-slate-900">
                  {(page - 1) * PAGE_SIZE + 1}-
                  {Math.min(page * PAGE_SIZE, total)}
                </span>{' '}
                of <span className="font-medium text-slate-900">{total}</span> employees
              </p>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
                  disabled={!canPrev}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary-200 hover:text-primary-700"
                >
                  Prev
                </button>
                <span className="text-[11px] text-slate-500">
                  Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span>
                </span>
                <button
                  type="button"
                  onClick={() => canNext && setPage((p) => p + 1)}
                  disabled={!canNext}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary-200 hover:text-primary-700"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {showModal && (
        <EmployeeFormModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onCreated={handleEmployeeCreated}
        />
      )}
    </div>
  );
}

