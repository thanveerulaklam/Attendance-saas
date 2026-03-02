import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/api';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function EmployeeFormModal({ open, onClose, onCreated, employee }) {
  const isEdit = Boolean(employee?.id);

  const [name, setName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [status, setStatus] = useState('active');
  const [shiftId, setShiftId] = useState('');

  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (open) {
      setShiftsLoading(true);
      authFetch('/api/shifts?limit=100')
        .then((res) => res.json())
        .then((json) => {
          setShifts(json.data || []);
        })
        .catch(() => setShifts([]))
        .finally(() => setShiftsLoading(false));
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (employee) {
        setName(employee.name || '');
        setEmployeeCode(employee.employee_code || '');
        setBasicSalary(
          employee.basic_salary != null ? String(employee.basic_salary) : ''
        );
        setJoinDate(
          employee.join_date
            ? new Date(employee.join_date).toISOString().slice(0, 10)
            : ''
        );
        setStatus(employee.status || 'active');
        setShiftId(
          employee.shift_id != null ? String(employee.shift_id) : ''
        );
      } else {
        setName('');
        setEmployeeCode('');
        setBasicSalary('');
        setJoinDate('');
        setStatus('active');
        setShiftId('');
      }
      setErrors({});
      setToast(null);
    }
  }, [open, employee]);

  const validate = () => {
    const nextErrors = {};

    if (!name.trim()) {
      nextErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      nextErrors.name = 'Name must be at least 2 characters';
    }

    if (!employeeCode.trim()) {
      nextErrors.employeeCode = 'Employee code is required';
    }

    if (!basicSalary.trim()) {
      nextErrors.basicSalary = 'Basic salary is required';
    } else if (Number.isNaN(Number(basicSalary))) {
      nextErrors.basicSalary = 'Basic salary must be a number';
    } else if (Number(basicSalary) <= 0) {
      nextErrors.basicSalary = 'Basic salary must be a positive number';
    }

    if (!joinDate) {
      nextErrors.joinDate = 'Join date is required';
    }

    if (!STATUS_OPTIONS.some((opt) => opt.value === status)) {
      nextErrors.status = 'Invalid status';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      setToast(null);

      const payload = {
        name: name.trim(),
        employee_code: employeeCode.trim(),
        basic_salary: Number(basicSalary),
        join_date: joinDate,
        status,
        shift_id: shiftId === '' ? null : Number(shiftId),
      };

      const url = isEdit ? `/api/employees/${employee.id}` : '/api/employees';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          json?.message ||
          json?.error ||
          (Array.isArray(json?.errors) ? json.errors.join(', ') : null) ||
          'Something went wrong while saving employee';
        setToast({ type: 'error', message });
        return;
      }

      setToast({
        type: 'success',
        message: isEdit ? 'Employee updated successfully' : 'Employee created successfully',
      });

      if (typeof onCreated === 'function') {
        onCreated(json.data);
      } else if (typeof onClose === 'function') {
        onClose();
      }
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Unexpected error while saving employee',
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
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 ease-out"
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
    >
      {/* Slide-over panel */}
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl transform transition-transform duration-200 ease-out translate-x-0 group-[&]:translate-x-0">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {isEdit ? 'Edit employee' : 'Add employee'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Capture key details for attendance and payroll.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <span className="sr-only">Close</span>
            ✕
          </button>
        </header>

        {toast && (
          <div
            className={`mx-5 mt-3 rounded-md px-3 py-2 text-xs ${
              toast.type === 'error'
                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            }`}
          >
            {toast.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="Jane Doe"
              />
            </label>
            {errors.name && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Employee code
                <input
                  type="text"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="EMP-001"
                />
              </label>
              {errors.employeeCode && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.employeeCode}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Basic salary
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={basicSalary}
                  onChange={(e) => setBasicSalary(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="40000"
                />
              </label>
              {errors.basicSalary && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.basicSalary}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Join date
                <input
                  type="date"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              {errors.joinDate && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.joinDate}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {errors.status && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.status}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Shift
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                disabled={shiftsLoading}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
              >
                <option value="">No shift</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.shift_name}
                  </option>
                ))}
              </select>
            </label>
            {errors.shift_id && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.shift_id}</p>
            )}
          </div>
        </form>

        <footer className="border-t border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50/60">
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            formAction={handleSubmit}
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create employee'}
          </button>
        </footer>
      </div>
    </div>
  );
}

