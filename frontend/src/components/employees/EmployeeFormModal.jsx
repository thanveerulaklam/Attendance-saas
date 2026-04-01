import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/api';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function EmployeeFormModal({
  open,
  onClose,
  onCreated,
  employee,
  departmentSuggestions = [],
}) {
  const isEdit = Boolean(employee?.id);

  const [name, setName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [department, setDepartment] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [esiNumber, setEsiNumber] = useState('');
  const [dailyTravelAllowance, setDailyTravelAllowance] = useState('');
  const [esiAmount, setEsiAmount] = useState('');
  const [permissionHoursOverride, setPermissionHoursOverride] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [status, setStatus] = useState('active');
  const [shiftId, setShiftId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [payrollFrequency, setPayrollFrequency] = useState('monthly');

  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);


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

      setBranchesLoading(true);
      authFetch('/api/company/branches')
        .then((res) => res.json())
        .then((json) => {
          const list = json.data || [];
          setBranches(list);
        })
        .catch(() => setBranches([]))
        .finally(() => setBranchesLoading(false));
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (employee) {
        setName(employee.name || '');
        setEmployeeCode(employee.employee_code || '');
        setDepartment(employee.department || '');
        setPhoneNumber(employee.phone_number || '');
        setAadharNumber(employee.aadhar_number || '');
        setEsiNumber(employee.esi_number || '');
        setBasicSalary(
          employee.basic_salary != null ? String(employee.basic_salary) : ''
        );
        setDailyTravelAllowance(
          employee.daily_travel_allowance != null ? String(employee.daily_travel_allowance) : ''
        );
        setEsiAmount(
          employee.esi_amount != null ? String(employee.esi_amount) : ''
        );
        setPermissionHoursOverride(
          employee.permission_hours_override != null
            ? String(employee.permission_hours_override)
            : ''
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
        setBranchId(
          employee.branch_id != null ? String(employee.branch_id) : ''
        );
        setPayrollFrequency(employee.payroll_frequency || 'monthly');
      } else {
        setName('');
        setEmployeeCode('');
        setDepartment('');
        setPhoneNumber('');
        setAadharNumber('');
        setEsiNumber('');
        setBasicSalary('');
        setDailyTravelAllowance('');
        setEsiAmount('');
        setPermissionHoursOverride('');
        setJoinDate('');
        setStatus('active');
        setShiftId('');
        setBranchId('');
        setPayrollFrequency('monthly');
      }
      setErrors({});
      setToast(null);
    }
  }, [open, employee]);

  useEffect(() => {
    if (!open || !branches.length) return;
    if (employee?.id) {
      if (employee.branch_id != null) {
        setBranchId(String(employee.branch_id));
      } else {
        setBranchId(String(branches[0].id));
      }
      return;
    }
    if (!branchId && branches[0]) {
      setBranchId(String(branches[0].id));
    }
  }, [open, branches, employee, branchId]);

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

    if (dailyTravelAllowance.trim() !== '' && (Number.isNaN(Number(dailyTravelAllowance)) || Number(dailyTravelAllowance) < 0)) {
      nextErrors.dailyTravelAllowance = 'Daily travel allowance must be 0 or more';
    }

    if (esiAmount.trim() !== '' && (Number.isNaN(Number(esiAmount)) || Number(esiAmount) < 0)) {
      nextErrors.esiAmount = 'ESI amount must be 0 or more';
    }
    if (
      permissionHoursOverride.trim() !== '' &&
      (Number.isNaN(Number(permissionHoursOverride)) || Number(permissionHoursOverride) < 0)
    ) {
      nextErrors.permissionHoursOverride = 'Permission hours override must be 0 or more';
    }

    if (phoneNumber.trim() !== '') {
      const normalizedPhone = phoneNumber.trim().replace(/[\s-]/g, '');
      if (!/^\+?\d{10,15}$/.test(normalizedPhone)) {
        nextErrors.phoneNumber =
          'Phone number must be 10-15 digits (optionally starting with +).';
      }
    }

    if (aadharNumber.trim() !== '') {
      const normalizedAadhar = aadharNumber.trim().replace(/\s+/g, '');
      if (!/^\d{12}$/.test(normalizedAadhar)) {
        nextErrors.aadharNumber = 'Aadhaar number must be exactly 12 digits.';
      }
    }

    if (esiNumber.trim() !== '' && esiNumber.trim().length > 30) {
      nextErrors.esiNumber = 'ESI number is too long (max 30 characters).';
    }

    if (!joinDate) {
      nextErrors.joinDate = 'Join date is required';
    }

    if (!STATUS_OPTIONS.some((opt) => opt.value === status)) {
      nextErrors.status = 'Invalid status';
    }

    if (branches.length > 1 && !branchId.trim()) {
      nextErrors.branch_id = 'Select a branch';
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

      const normalizedPhone = phoneNumber.trim().replace(/[\s-]/g, '');
      const normalizedAadhar = aadharNumber.trim().replace(/\s+/g, '');

      const payload = {
        name: name.trim(),
        employee_code: employeeCode.trim(),
        department: department.trim() === '' ? null : department.trim(),
        phone_number: normalizedPhone === '' ? null : normalizedPhone,
        aadhar_number: normalizedAadhar === '' ? null : normalizedAadhar,
        esi_number: esiNumber.trim() === '' ? null : esiNumber.trim(),
        basic_salary: Number(basicSalary),
        daily_travel_allowance: dailyTravelAllowance.trim() === '' ? 0 : Number(dailyTravelAllowance),
        esi_amount: esiAmount.trim() === '' ? 0 : Number(esiAmount),
        permission_hours_override:
          permissionHoursOverride.trim() === '' ? null : Number(permissionHoursOverride),
        join_date: joinDate,
        status,
        shift_id: shiftId === '' ? null : Number(shiftId),
        payroll_frequency: payrollFrequency,
      };

      const resolvedBranch =
        branchId.trim() ||
        (branches.length === 1 ? String(branches[0].id) : '');
      if (resolvedBranch) {
        payload.branch_id = Number(resolvedBranch);
      }

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
                Department (optional)
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  list="department-suggestions"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="Engineering"
                />
              </label>
              <datalist id="department-suggestions">
                {(departmentSuggestions || []).map((d) => (
                  <option key={String(d)} value={d} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Phone number (optional)
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="+91 98765 43210"
                />
              </label>
              {errors.phoneNumber && (
                <p className="mt-1 text-[11px] text-rose-600">
                  {errors.phoneNumber}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Aadhaar number (optional)
                <input
                  type="text"
                  value={aadharNumber}
                  onChange={(e) => setAadharNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="1234 5678 9012"
                />
              </label>
              {errors.aadharNumber && (
                <p className="mt-1 text-[11px] text-rose-600">
                  {errors.aadharNumber}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                ESI number (optional)
                <input
                  type="text"
                  value={esiNumber}
                  onChange={(e) => setEsiNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="ESI Reg. No."
                />
              </label>
              {errors.esiNumber && (
                <p className="mt-1 text-[11px] text-rose-600">
                  {errors.esiNumber}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Daily travel allowance (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={dailyTravelAllowance}
                onChange={(e) => setDailyTravelAllowance(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="0 — paid per working day present (not on holidays)"
              />
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Added only for working days when the employee is present; holidays are excluded.
            </p>
            {errors.dailyTravelAllowance && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.dailyTravelAllowance}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              ESI (monthly deduction) (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                value={esiAmount}
                onChange={(e) => setEsiAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="0 — deducted every month from salary"
              />
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              This amount is deducted from the employee’s salary every month.
            </p>
            {errors.esiAmount && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.esiAmount}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Permission hours override (monthly)
              <input
                type="number"
                min="0"
                step="0.5"
                value={permissionHoursOverride}
                onChange={(e) => setPermissionHoursOverride(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="Leave empty to use shift default"
              />
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Optional. If empty, employee uses assigned shift permission hours.
            </p>
            {errors.permissionHoursOverride && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.permissionHoursOverride}</p>
            )}
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

          {branches.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Branch
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  disabled={branchesLoading}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                >
                  {branches.length > 1 && (
                    <option value="">Select branch</option>
                  )}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Employees are tied to one location. HR users only see branches assigned to them; leave as default if you have one branch.
              </p>
              {errors.branch_id && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.branch_id}</p>
              )}
            </div>
          )}

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

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Payroll frequency
              <select
                value={payrollFrequency}
                onChange={(e) => setPayrollFrequency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
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

