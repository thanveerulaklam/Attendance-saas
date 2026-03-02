import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authFetch } from '../utils/api';
import EmployeeFormModal from '../components/employees/EmployeeFormModal';
import EmployeeFilters from '../components/employees/EmployeeFilters';

const PAGE_SIZE = 15;

function formatINR(num) {
  if (num == null || Number.isNaN(Number(num))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Number(num));
}

export default function EmployeesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openFromOnboarding = searchParams.get('onboarding') === 'open_employee_modal';

  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(openFromOnboarding);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [toast, setToast] = useState(null);

  const shiftNameById = Object.fromEntries(
    (shifts || []).map((s) => [String(s.id), s.shift_name])
  );

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

  useEffect(() => {
    authFetch('/api/shifts?limit=500')
      .then((res) => res.json())
      .then((json) => setShifts(json.data || []))
      .catch(() => setShifts([]));
  }, []);

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
    setEditingEmployee(null);
    setPage(1);
    fetchEmployees();
    setToast({
      type: 'success',
      message: employee?.name
        ? `Employee "${employee.name}" saved successfully`
        : 'Employee saved successfully',
    });
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setShowModal(true);
  };

  const handleDeactivate = async (employee) => {
    if (!employee?.id) return;
    const confirmed = window.confirm(
      `Deactivate "${employee.name}"? They will no longer appear in active lists.`
    );
    if (!confirmed) return;
    try {
      const res = await authFetch(`/api/employees/${employee.id}/deactivate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to deactivate employee');
      }
      fetchEmployees();
      setToast({
        type: 'success',
        message: `"${employee.name}" has been deactivated.`,
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to deactivate employee',
      });
    }
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed left-[58%] top-24 z-30 -translate-x-1/2">
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
            Manage your workforce—view all details and options in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingEmployee(null);
            setShowModal(true);
          }}
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
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Employee code</th>
                  <th className="pb-3 pr-4 font-medium">Basic salary</th>
                  <th className="pb-3 pr-4 font-medium">Join date</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Shift</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <tr
                    // eslint-disable-next-line react/no-array-index-key
                    key={idx}
                    className="border-b border-slate-100"
                  >
                    {Array.from({ length: 7 }).map((_, i) => (
                      <td
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        className="py-3 pr-4"
                      >
                        <span className="inline-block h-4 w-24 rounded bg-slate-100 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
              onClick={() => {
                setEditingEmployee(null);
                setShowModal(true);
              }}
              className="mt-4 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-primary-200 hover:text-primary-700"
            >
              Add employee
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Employee code</th>
                    <th className="pb-3 pr-4 font-medium">Basic salary</th>
                    <th className="pb-3 pr-4 font-medium">Join date</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Shift</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => {
                    const isActive = employee.status === 'active';
                    const joinDate = employee.join_date
                      ? new Date(employee.join_date).toLocaleDateString(
                          'en-IN',
                          { year: 'numeric', month: 'short', day: 'numeric' }
                        )
                      : '—';
                    const shiftName = employee.shift_id != null
                      ? shiftNameById[String(employee.shift_id)] ?? `#${employee.shift_id}`
                      : '—';
                    return (
                      <tr
                        key={employee.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="py-3 pr-4 font-medium text-slate-900">
                          {employee.name || '—'}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {employee.employee_code || '—'}
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-slate-700">
                          {formatINR(employee.basic_salary)}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{joinDate}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isActive ? 'Active' : (employee.status || 'Inactive')}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {shiftName}
                        </td>
                        <td className="py-3 text-right">
                          <span className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(employee)}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:text-primary-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => isActive && handleDeactivate(employee)}
                              disabled={!isActive}
                              className="text-[11px] font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isActive ? 'Deactivate' : 'Deactivated'}
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
          employee={editingEmployee}
          onClose={() => {
            setShowModal(false);
            setEditingEmployee(null);
          }}
          onCreated={handleEmployeeCreated}
        />
      )}
    </div>
  );
}

