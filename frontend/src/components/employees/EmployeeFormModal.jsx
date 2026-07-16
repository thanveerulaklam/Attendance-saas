import { useEffect, useState } from 'react';
import { authFetch } from '../../utils/api';
import { GENDER_OPTIONS } from '../../utils/employeeGender';
import { currencySymbol } from '../../utils/formatMoney';
import { isIndiaCompany, regionFeaturesForCountry } from '../../utils/regionFeatures';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function EmployeeFormModal({
  open,
  onClose,
  onCreated,
  onDeleted,
  employee,
  departmentSuggestions = [],
}) {
  const isEdit = Boolean(employee?.id);

  const [name, setName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [department, setDepartment] = useState('');
  const [gender, setGender] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [esiNumber, setEsiNumber] = useState('');
  const [pfNumber, setPfNumber] = useState('');
  const [labourCardNumber, setLabourCardNumber] = useState('');
  const [iban, setIban] = useState('');
  const [contractType, setContractType] = useState('unlimited');
  const [dailyTravelAllowance, setDailyTravelAllowance] = useState('');
  const [otherAllowance, setOtherAllowance] = useState('');
  const [esiAmount, setEsiAmount] = useState('');
  const [esiMode, setEsiMode] = useState('fixed');
  const [esiPercent, setEsiPercent] = useState('');
  const [pfAmount, setPfAmount] = useState('');
  const [pfMode, setPfMode] = useState('fixed');
  const [pfPercent, setPfPercent] = useState('');
  const [permissionHoursOverride, setPermissionHoursOverride] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [status, setStatus] = useState('active');
  const [shiftId, setShiftId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [payrollFrequency, setPayrollFrequency] = useState('monthly');
  const [salaryType, setSalaryType] = useState('monthly');

  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [monthlyOnlyPayroll, setMonthlyOnlyPayroll] = useState(false);
  const [factoryShiftRotation, setFactoryShiftRotation] = useState(false);
  const [countryCode, setCountryCode] = useState('IN');
  const [companyCurrency, setCompanyCurrency] = useState('INR');
  const [mobileAttendanceEnabled, setMobileAttendanceEnabled] = useState(false);
  const [attendanceChannel, setAttendanceChannel] = useState('device');
  const [appAccessUser, setAppAccessUser] = useState(null);
  const [appAccessEmail, setAppAccessEmail] = useState('');
  const [appAccessPassword, setAppAccessPassword] = useState('');
  const [appAccessLoading, setAppAccessLoading] = useState(false);
  const [appAccessSaving, setAppAccessSaving] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceLoading, setFaceLoading] = useState(false);
  const [faceSaving, setFaceSaving] = useState(false);
  const [currentAssignment, setCurrentAssignment] = useState(null);

  const showIndiaStatutory = isIndiaCompany(countryCode);
  const showUaeFields = regionFeaturesForCountry(countryCode).wps;
  const moneySymbol = currencySymbol(companyCurrency);


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

      authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          setMonthlyOnlyPayroll(json?.data?.shifts_compact_ui === true);
          setFactoryShiftRotation(json?.data?.enable_shift_rotation === true);
          setCountryCode(json?.data?.country_code || 'IN');
          setCompanyCurrency(json?.data?.currency || 'INR');
          setMobileAttendanceEnabled(Boolean(json?.data?.mobile_attendance_enabled));
        })
        .catch(() => {
          setMonthlyOnlyPayroll(false);
          setFactoryShiftRotation(false);
          setCountryCode('IN');
          setCompanyCurrency('INR');
          setMobileAttendanceEnabled(false);
        });
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      if (employee) {
        setName(employee.name || '');
        setEmployeeCode(employee.employee_code || '');
        setDepartment(employee.department || '');
        setGender(employee.gender || '');
        setPhoneNumber(employee.phone_number || '');
        setAadharNumber(employee.aadhar_number || '');
        setEsiNumber(employee.esi_number || '');
        setPfNumber(employee.pf_number || '');
        setLabourCardNumber(employee.labour_card_number || '');
        setIban(employee.iban || '');
        setContractType(employee.contract_type || 'unlimited');
        setBasicSalary(
          employee.basic_salary != null ? String(employee.basic_salary) : ''
        );
        setDailyTravelAllowance(
          employee.daily_travel_allowance != null ? String(employee.daily_travel_allowance) : ''
        );
        setOtherAllowance(
          employee.other_allowance != null ? String(employee.other_allowance) : ''
        );
        setEsiAmount(
          employee.esi_amount != null ? String(employee.esi_amount) : ''
        );
        setEsiMode(employee.esi_mode === 'percentage' ? 'percentage' : 'fixed');
        setEsiPercent(
          employee.esi_percent != null ? String(employee.esi_percent) : ''
        );
        setPfAmount(
          employee.pf_amount != null ? String(employee.pf_amount) : ''
        );
        setPfMode(employee.pf_mode === 'percentage' ? 'percentage' : 'fixed');
        setPfPercent(
          employee.pf_percent != null ? String(employee.pf_percent) : ''
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
        setSalaryType(employee.salary_type || 'monthly');
        setAttendanceChannel(employee.attendance_channel || 'device');
      } else {
        setName('');
        setEmployeeCode('');
        setDepartment('');
        setGender('');
        setPhoneNumber('');
        setAadharNumber('');
        setEsiNumber('');
        setPfNumber('');
        setLabourCardNumber('');
        setIban('');
        setContractType('unlimited');
        setBasicSalary('');
        setDailyTravelAllowance('');
        setOtherAllowance('');
        setEsiAmount('');
        setEsiMode('fixed');
        setEsiPercent('');
        setPfAmount('');
        setPfMode('fixed');
        setPfPercent('');
        setPermissionHoursOverride('');
        setJoinDate('');
        setStatus('active');
        setShiftId('');
        setBranchId('');
        setPayrollFrequency('monthly');
        setSalaryType('monthly');
        setAttendanceChannel('device');
        setAppAccessUser(null);
        setAppAccessEmail('');
        setAppAccessPassword('');
        setFaceEnrolled(false);
      }
      setErrors({});
      setToast(null);
    }
  }, [open, employee]);

  useEffect(() => {
    if (!open || !isEdit || !employee?.id) {
      setAppAccessUser(null);
      setAppAccessEmail('');
      setAppAccessPassword('');
      return;
    }
    setAppAccessLoading(true);
    authFetch(`/api/employees/${employee.id}/app-access`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.data) {
          setAppAccessUser(json.data);
          setAppAccessEmail(json.data.email || '');
        } else {
          setAppAccessUser(null);
          setAppAccessEmail('');
        }
      })
      .catch(() => setAppAccessUser(null))
      .finally(() => setAppAccessLoading(false));
  }, [open, isEdit, employee?.id]);

  useEffect(() => {
    if (!open || !isEdit || !employee?.id) {
      setFaceEnrolled(false);
      return;
    }
    setFaceLoading(true);
    authFetch(`/api/employees/${employee.id}/face-enrollment`)
      .then((res) => res.json())
      .then((json) => setFaceEnrolled(Boolean(json?.data?.id)))
      .catch(() => setFaceEnrolled(false))
      .finally(() => setFaceLoading(false));
  }, [open, isEdit, employee?.id]);

  useEffect(() => {
    if (!open || !factoryShiftRotation || !employee?.id) {
      setCurrentAssignment(null);
      return;
    }
    authFetch(`/api/shift-rotation/assignments/employee/${employee.id}/current`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setCurrentAssignment(json?.data || null))
      .catch(() => setCurrentAssignment(null));
  }, [open, factoryShiftRotation, employee?.id]);

  useEffect(() => {
    if (!open) return;
    if (monthlyOnlyPayroll) setPayrollFrequency('monthly');
  }, [open, monthlyOnlyPayroll]);

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

    if (otherAllowance.trim() !== '' && (Number.isNaN(Number(otherAllowance)) || Number(otherAllowance) < 0)) {
      nextErrors.otherAllowance = 'Other allowance must be 0 or more';
    }

    if (showIndiaStatutory) {
      if (esiMode === 'fixed') {
        if (esiAmount.trim() !== '' && (Number.isNaN(Number(esiAmount)) || Number(esiAmount) < 0)) {
          nextErrors.esiAmount = 'ESI amount must be 0 or more';
        }
      } else if (esiPercent.trim() === '') {
        nextErrors.esiPercent = 'ESI percentage is required';
      } else if (
        Number.isNaN(Number(esiPercent)) ||
        Number(esiPercent) < 0 ||
        Number(esiPercent) > 100
      ) {
        nextErrors.esiPercent = 'ESI percentage must be between 0 and 100';
      }
      if (pfMode === 'fixed') {
        if (pfAmount.trim() !== '' && (Number.isNaN(Number(pfAmount)) || Number(pfAmount) < 0)) {
          nextErrors.pfAmount = 'PF amount must be 0 or more';
        }
      } else if (pfPercent.trim() === '') {
        nextErrors.pfPercent = 'PF percentage is required';
      } else if (
        Number.isNaN(Number(pfPercent)) ||
        Number(pfPercent) < 0 ||
        Number(pfPercent) > 100
      ) {
        nextErrors.pfPercent = 'PF percentage must be between 0 and 100';
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
      if (pfNumber.trim() !== '' && pfNumber.trim().length > 30) {
        nextErrors.pfNumber = 'PF number is too long (max 30 characters).';
      }
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
        gender: gender === '' ? null : gender,
        phone_number: normalizedPhone === '' ? null : normalizedPhone,
        aadhar_number: showIndiaStatutory && normalizedAadhar !== '' ? normalizedAadhar : null,
        esi_number: showIndiaStatutory && esiNumber.trim() !== '' ? esiNumber.trim() : null,
        pf_number: showIndiaStatutory && pfNumber.trim() !== '' ? pfNumber.trim() : null,
        labour_card_number: showUaeFields && labourCardNumber.trim() !== '' ? labourCardNumber.trim() : null,
        iban: showUaeFields && iban.trim() !== '' ? iban.replace(/\s+/g, '').toUpperCase() : null,
        contract_type: showUaeFields ? contractType : 'unlimited',
        basic_salary: Number(basicSalary),
        daily_travel_allowance: dailyTravelAllowance.trim() === '' ? 0 : Number(dailyTravelAllowance),
        other_allowance: otherAllowance.trim() === '' ? 0 : Number(otherAllowance),
        esi_mode: showIndiaStatutory ? esiMode : 'fixed',
        esi_amount: showIndiaStatutory && esiMode === 'fixed' ? (esiAmount.trim() === '' ? 0 : Number(esiAmount)) : 0,
        esi_percent:
          showIndiaStatutory && esiMode === 'percentage'
            ? esiPercent.trim() === ''
              ? null
              : Number(esiPercent)
            : null,
        pf_mode: showIndiaStatutory ? pfMode : 'fixed',
        pf_amount: showIndiaStatutory && pfMode === 'fixed' ? (pfAmount.trim() === '' ? 0 : Number(pfAmount)) : 0,
        pf_percent:
          showIndiaStatutory && pfMode === 'percentage'
            ? pfPercent.trim() === ''
              ? null
              : Number(pfPercent)
            : null,
        permission_hours_override:
          permissionHoursOverride.trim() === '' ? null : Number(permissionHoursOverride),
        join_date: joinDate,
        status,
        shift_id: shiftId === '' ? null : Number(shiftId),
        payroll_frequency: payrollFrequency,
        salary_type: salaryType,
        attendance_channel: attendanceChannel,
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

  const handleProvisionAppAccess = async () => {
    if (!isEdit || !employee?.id || appAccessSaving) return;
    if (!appAccessEmail.trim() || !appAccessPassword || appAccessPassword.length < 6) {
      setToast({ type: 'error', message: 'Email and password (min 6 chars) are required.' });
      return;
    }
    try {
      setAppAccessSaving(true);
      const res = await authFetch(`/api/employees/${employee.id}/app-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: appAccessEmail.trim(),
          password: appAccessPassword,
          name: name.trim() || employee.name,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to provision app access');
      setAppAccessUser(json.data?.user || json.data);
      setAppAccessPassword('');
      setToast({ type: 'success', message: 'Mobile app login saved.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to save app access' });
    } finally {
      setAppAccessSaving(false);
    }
  };

  const handleRevokeAppAccess = async () => {
    if (!isEdit || !employee?.id || appAccessSaving || !appAccessUser) return;
    const ok = window.confirm('Revoke mobile app login for this employee?');
    if (!ok) return;
    try {
      setAppAccessSaving(true);
      const res = await authFetch(`/api/employees/${employee.id}/app-access`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to revoke app access');
      setAppAccessUser(null);
      setAppAccessEmail('');
      setAppAccessPassword('');
      setToast({ type: 'success', message: 'Mobile app access revoked.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to revoke' });
    } finally {
      setAppAccessSaving(false);
    }
  };

  const handleEnrollFace = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !isEdit || !employee?.id || faceSaving) return;
    try {
      setFaceSaving(true);
      const formData = new FormData();
      formData.append('photo', file);
      const res = await authFetch(`/api/employees/${employee.id}/face-enrollment`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Face enrollment failed');
      setFaceEnrolled(true);
      setToast({ type: 'success', message: json.message || 'Face enrolled for kiosk attendance.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Face enrollment failed' });
    } finally {
      setFaceSaving(false);
    }
  };

  const handleRemoveFace = async () => {
    if (!isEdit || !employee?.id || faceSaving || !faceEnrolled) return;
    if (!window.confirm('Remove face enrollment for this employee?')) return;
    try {
      setFaceSaving(true);
      const res = await authFetch(`/api/employees/${employee.id}/face-enrollment`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to remove face');
      setFaceEnrolled(false);
      setToast({ type: 'success', message: 'Face enrollment removed.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to remove face' });
    } finally {
      setFaceSaving(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose?.();
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !employee?.id || submitting) return;
    const confirmed = window.confirm(
      `Delete "${employee.name || 'this employee'}" permanently? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setSubmitting(true);
      setToast(null);

      const res = await authFetch(`/api/employees/${employee.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const message =
          json?.message || json?.error || 'Something went wrong while deleting employee';
        setToast({ type: 'error', message });
        return;
      }

      const json = res.status === 204 ? null : await res.json().catch(() => ({}));
      const deletionMode = json?.data?.action || 'deleted';
      if (typeof onDeleted === 'function') {
        onDeleted({ ...employee, deletionMode });
      } else if (typeof onClose === 'function') {
        onClose();
      }
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Unexpected error while deleting employee',
      });
    } finally {
      setSubmitting(false);
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
                {salaryType === 'per_day' ? 'Daily salary' : 'Basic salary'}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={basicSalary}
                  onChange={(e) => setBasicSalary(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder={salaryType === 'per_day' ? '400' : '40000'}
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
                Gender (optional)
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value || 'unset'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            {showIndiaStatutory && (
            <>
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

            <div>
              <label className="block text-xs font-medium text-slate-700">
                PF number (optional)
                <input
                  type="text"
                  value={pfNumber}
                  onChange={(e) => setPfNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="PF / UAN No."
                />
              </label>
              {errors.pfNumber && (
                <p className="mt-1 text-[11px] text-rose-600">
                  {errors.pfNumber}
                </p>
              )}
            </div>
            </>
            )}
          </div>

          {showUaeFields && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Labour card number (optional)
                  <input
                    type="text"
                    value={labourCardNumber}
                    onChange={(e) => setLabourCardNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    placeholder="Work permit / labour card"
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Bank IBAN (optional)
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    placeholder="AE07..."
                  />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Contract type
                  <select
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="unlimited">Unlimited</option>
                    <option value="limited">Limited</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Daily travel allowance ({moneySymbol})
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={dailyTravelAllowance}
                  onChange={(e) => setDailyTravelAllowance(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="0 — per working day present"
                />
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Paid per working day when present; holidays excluded.
              </p>
              {errors.dailyTravelAllowance && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.dailyTravelAllowance}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Other allowances ({moneySymbol}/month)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={otherAllowance}
                  onChange={(e) => setOtherAllowance(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="0 — fixed monthly amount"
                />
              </label>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Added to gross salary in payroll (full month, or prorated if month in progress).
              </p>
              {errors.otherAllowance && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.otherAllowance}</p>
              )}
            </div>
          </div>

          {showIndiaStatutory && (
          <>
          <div>
            <label className="block text-xs font-medium text-slate-700">ESI deduction</label>
            <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-slate-700">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="esiMode"
                  checked={esiMode === 'fixed'}
                  onChange={() => setEsiMode('fixed')}
                  className="border-slate-300 text-blue-600"
                />
                Fixed amount ({moneySymbol}/month)
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="esiMode"
                  checked={esiMode === 'percentage'}
                  onChange={() => setEsiMode('percentage')}
                  className="border-slate-300 text-blue-600"
                />
                Percentage of gross wages
              </label>
            </div>
            {esiMode === 'fixed' ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={esiAmount}
                onChange={(e) => setEsiAmount(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="0 — deducted every month from salary"
              />
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={esiPercent}
                  onChange={(e) => setEsiPercent(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="e.g. 0.75"
                />
                <span className="shrink-0 text-sm text-slate-500">%</span>
              </div>
            )}
            <p className="mt-0.5 text-[11px] text-slate-500">
              {esiMode === 'fixed'
                ? 'This amount is deducted from the employee’s salary every month.'
                : 'Calculated on gross wages (basic + overtime + travel allowance) each payroll run. Common rate: 0.75%.'}
            </p>
            {errors.esiAmount && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.esiAmount}</p>
            )}
            {errors.esiPercent && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.esiPercent}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">PF deduction (optional)</label>
            <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-slate-700">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="pfMode"
                  checked={pfMode === 'fixed'}
                  onChange={() => setPfMode('fixed')}
                  className="border-slate-300 text-blue-600"
                />
                Fixed amount ({moneySymbol}/month)
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="pfMode"
                  checked={pfMode === 'percentage'}
                  onChange={() => setPfMode('percentage')}
                  className="border-slate-300 text-blue-600"
                />
                Percentage of earned basic
              </label>
            </div>
            {pfMode === 'fixed' ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={pfAmount}
                onChange={(e) => setPfAmount(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="0 — deducted every month from salary"
              />
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={pfPercent}
                  onChange={(e) => setPfPercent(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="e.g. 12"
                />
                <span className="shrink-0 text-sm text-slate-500">%</span>
              </div>
            )}
            <p className="mt-0.5 text-[11px] text-slate-500">
              {pfMode === 'fixed'
                ? 'Optional PF deduction for this employee, applied every month in payroll.'
                : 'Calculated on earned basic salary each payroll run. Common employee rate: 12%.'}
            </p>
            {errors.pfAmount && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.pfAmount}</p>
            )}
            {errors.pfPercent && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.pfPercent}</p>
            )}
          </div>
          </>
          )}

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
            {factoryShiftRotation && currentAssignment && (
              <p className="mt-1 text-[11px] text-slate-500">
                Current: {currentAssignment.shift_name} (from{' '}
                {String(currentAssignment.effective_from).slice(0, 10)}). Changing shift creates a
                new assignment from today.
              </p>
            )}
            {factoryShiftRotation && !currentAssignment && isEdit && (
              <p className="mt-1 text-[11px] text-slate-500">
                Changing shift creates a dated assignment from today.
              </p>
            )}
            {errors.shift_id && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.shift_id}</p>
            )}
          </div>

          {mobileAttendanceEnabled && isEdit && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-3 space-y-3">
              <p className="text-xs font-semibold text-violet-900">Face attendance (office tablet)</p>
              <p className="text-[11px] text-slate-600">
                Upload a clear front-facing photo. The employee can then punch at the branch kiosk — no personal phone or password needed.
              </p>
              {faceLoading ? (
                <p className="text-[11px] text-slate-500">Checking enrollment…</p>
              ) : faceEnrolled ? (
                <p className="text-[11px] text-emerald-700 font-medium">Face enrolled for kiosk attendance</p>
              ) : (
                <p className="text-[11px] text-amber-700">Not enrolled yet</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50">
                  {faceSaving ? 'Uploading…' : faceEnrolled ? 'Replace photo' : 'Upload face photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    disabled={faceSaving}
                    onChange={handleEnrollFace}
                  />
                </label>
                {faceEnrolled && (
                  <button
                    type="button"
                    onClick={handleRemoveFace}
                    disabled={faceSaving}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-medium text-rose-700"
                  >
                    Remove face
                  </button>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Salary type
              <select
                value={salaryType}
                onChange={(e) => setSalaryType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              >
                <option value="monthly">Monthly</option>
                <option value="per_day">Per-day</option>
              </select>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {salaryType === 'per_day'
                  ? 'Store daily amount in “Daily salary”.'
                  : 'Store monthly amount in “Basic salary”.'}
              </p>
            </label>
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
                {!monthlyOnlyPayroll && <option value="weekly">Weekly</option>}
              </select>
            </label>
            {monthlyOnlyPayroll && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                This client uses monthly payroll only.
              </p>
            )}
          </div>
        </form>

        <footer className="border-t border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => !submitting && onClose?.()}
              className="text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete employee
              </button>
            )}
          </div>
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

