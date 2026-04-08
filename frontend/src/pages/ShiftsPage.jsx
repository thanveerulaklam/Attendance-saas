import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../utils/api';

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** @param {boolean} shiftPayloadCompact — Tharagai Readymades (`companies.shifts_compact_ui`): omit manual deduction fields from payload. */
function sanitizeShiftBody(form, shiftPayloadCompact) {
  const body = { ...form };
  if (body.full_day_hours === '' || body.full_day_hours === undefined || body.full_day_hours === null) {
    body.full_day_hours = null;
  } else {
    const n = Number(body.full_day_hours);
    body.full_day_hours = Number.isFinite(n) ? n : null;
  }
  if (shiftPayloadCompact) {
    body.weekly_off_days = [];
    body.late_deduction_minutes = 0;
    body.late_deduction_amount = 0;
    body.lunch_over_deduction_minutes = 0;
    body.lunch_over_deduction_amount = 0;
    body.no_leave_incentive = 0;
    body.allow_overtime = false;
    body.overtime_rate_per_hour = 0;
    body.overtime_rate_mode = 'fixed';
  }
  return body;
}

/** @param {boolean} compact — matches `companies.shifts_compact_ui` (Tharagai-style simplified shifts). */
function getEmptyForm(compact) {
  return {
    shift_name: '',
    start_time: '09:00',
    end_time: '18:00',
    grace_minutes: 0,
    lunch_minutes: 60,
    weekly_off_days: [],
    late_deduction_minutes: 0,
    late_deduction_amount: 0,
    lunch_over_deduction_minutes: 0,
    lunch_over_deduction_amount: 0,
    no_leave_incentive: 0,
    paid_leave_days: compact ? 3 : 0,
    attendance_mode: 'day_based',
    required_hours_per_day: 8,
    half_day_hours: 0,
    full_day_hours: null,
    monthly_permission_hours: 0,
    allow_overtime: true,
    overtime_rate_per_hour: 0,
    overtime_rate_mode: 'fixed',
  };
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(() => getEmptyForm(false));
  const [company, setCompany] = useState(null);
  const hoursBasedOnly = company?.hours_based_shifts_only === true;
  /** Tharagai Readymades (and any company with `shifts_compact_ui`): simplified shifts + neutral legacy columns server-side. */
  const shiftsCompactUi = company?.shifts_compact_ui === true;
  /** Company policy: absent days above this → paid leave from shift not applied (editable). */
  const [plForfeitGt, setPlForfeitGt] = useState('');
  const [savingPlPolicy, setSavingPlPolicy] = useState(false);
  const syncedDefaultPaidLeaveForCompanyId = useRef(null);

  const loadShifts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch('/api/shifts', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Unable to load shifts');
      const json = await res.json();
      setShifts(json.data || []);
    } catch (err) {
      setError(err.message || 'Unable to load shifts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  useEffect(() => {
    let mounted = true;
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (mounted && json?.data) setCompany(json.data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    syncedDefaultPaidLeaveForCompanyId.current = null;
  }, [company?.id]);

  useEffect(() => {
    if (hoursBasedOnly && !editingShift) {
      setForm((prev) => ({ ...prev, attendance_mode: 'hours_based' }));
    }
  }, [hoursBasedOnly, editingShift]);

  useEffect(() => {
    if (!company?.id || editingShift) return;
    if (syncedDefaultPaidLeaveForCompanyId.current === company.id) return;
    syncedDefaultPaidLeaveForCompanyId.current = company.id;
    setForm((prev) => ({ ...prev, paid_leave_days: shiftsCompactUi ? 3 : 0 }));
  }, [company?.id, shiftsCompactUi, editingShift]);

  useEffect(() => {
    if (!company) return;
    const v = company.paid_leave_forfeit_if_absence_gt;
    if (v === null || v === undefined || v === '') {
      setPlForfeitGt('6');
    } else {
      setPlForfeitGt(String(v));
    }
  }, [company]);

  const savePaidLeaveCompanyPolicy = async () => {
    try {
      setSavingPlPolicy(true);
      setError(null);
      const raw = String(plForfeitGt).trim();
      const body =
        raw === ''
          ? { paid_leave_forfeit_if_absence_gt: null }
          : { paid_leave_forfeit_if_absence_gt: Number(raw) };
      const res = await authFetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Failed to save policy');
      }
      const json = await res.json();
      if (json?.data) setCompany(json.data);
    } catch (err) {
      setError(err.message || 'Failed to save policy');
    } finally {
      setSavingPlPolicy(false);
    }
  };

  const handleFullDayHoursChange = (event) => {
    const v = event.target.value;
    if (v === '') {
      setForm((prev) => ({ ...prev, full_day_hours: null }));
      return;
    }
    const n = Number(v);
    setForm((prev) => ({ ...prev, full_day_hours: Number.isFinite(n) ? n : prev.full_day_hours }));
  };

  const toggleFormWeeklyOff = (dayNum) => {
    const current = form.weekly_off_days || [];
    const next = current.includes(dayNum)
      ? current.filter((d) => d !== dayNum)
      : [...current, dayNum].sort((a, b) => a - b);
    setForm((prev) => ({ ...prev, weekly_off_days: next }));
  };

  const handleChange = (field) => (event) => {
    const numericFields = [
      'grace_minutes',
      'lunch_minutes',
      'late_deduction_minutes',
      'late_deduction_amount',
      'lunch_over_deduction_minutes',
      'lunch_over_deduction_amount',
      'no_leave_incentive',
      'paid_leave_days',
      'required_hours_per_day',
      'half_day_hours',
      'monthly_permission_hours',
      'overtime_rate_per_hour',
    ];
    const value = numericFields.includes(field)
      ? Number(event.target.value || 0)
      : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.shift_name.trim()) return;
    try {
      setCreating(true);
      setError(null);
      const res = await authFetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeShiftBody(form, shiftsCompactUi)),
      });
      if (!res.ok) throw new Error('Failed to create shift');
      setForm(getEmptyForm(shiftsCompactUi));
      await loadShifts();
    } catch (err) {
      setError(err.message || 'Failed to create shift');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (shift) => {
    const resolvedMode = company?.hours_based_shifts_only
      ? 'hours_based'
      : shift.attendance_mode || 'day_based';
    setForm({
      shift_name: shift.shift_name || '',
      start_time: (shift.start_time || '09:00').slice(0, 5),
      end_time: (shift.end_time || '18:00').slice(0, 5),
      grace_minutes: shift.grace_minutes ?? 0,
      lunch_minutes: shift.lunch_minutes ?? 60,
      weekly_off_days: Array.isArray(shift.weekly_off_days) ? [...shift.weekly_off_days] : [],
      late_deduction_minutes: shift.late_deduction_minutes ?? 0,
      late_deduction_amount: shift.late_deduction_amount ?? 0,
      lunch_over_deduction_minutes: shift.lunch_over_deduction_minutes ?? 0,
      lunch_over_deduction_amount: shift.lunch_over_deduction_amount ?? 0,
      no_leave_incentive: shift.no_leave_incentive ?? 0,
      paid_leave_days: shift.paid_leave_days ?? 0,
      attendance_mode: resolvedMode,
      required_hours_per_day: shift.required_hours_per_day ?? 8,
      half_day_hours: shift.half_day_hours ?? 0,
      full_day_hours:
        shift.full_day_hours != null && shift.full_day_hours !== ''
          ? Number(shift.full_day_hours)
          : null,
      monthly_permission_hours: shift.monthly_permission_hours ?? 0,
      allow_overtime: shift.allow_overtime !== false,
      overtime_rate_per_hour: shift.overtime_rate_per_hour ?? 0,
      overtime_rate_mode: shift.overtime_rate_mode || 'fixed',
    });
    setEditingShift(shift);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingShift(null);
    setForm(getEmptyForm(shiftsCompactUi));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingShift || !form.shift_name.trim()) return;
    try {
      setSavingEdit(true);
      setError(null);
      const res = await authFetch(`/api/shifts/${editingShift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeShiftBody(form, shiftsCompactUi)),
      });
      if (!res.ok) throw new Error('Failed to update shift');
      setEditingShift(null);
      setForm(getEmptyForm(shiftsCompactUi));
      await loadShifts();
    } catch (err) {
      setError(err.message || 'Failed to update shift');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (shift) => {
    if (!window.confirm(`Delete shift "${shift.shift_name}"? This cannot be undone.`)) return;
    try {
      setDeletingId(shift.id);
      setError(null);
      const res = await authFetch(`/api/shifts/${shift.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete shift');
      await loadShifts();
      if (editingShift?.id === shift.id) cancelEdit();
    } catch (err) {
      setError(err.message || 'Failed to delete shift');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Shifts</h1>
        <p className="text-xs text-slate-500">
          Define standard working hours and grace time for your factory.
        </p>
        {shiftsCompactUi && (
          <p className="mt-1 text-[10px] text-slate-500 max-w-xl">
            Compact shifts for this company (e.g. Tharagai Readymades): weekly-off, late, no-leave incentive, and
            lunch-over deductions are hidden and not saved—payroll follows worked hours. Other companies still see the
            full shift form.
          </p>
        )}
      </header>

      <section className="rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-soft transition-shadow duration-200 hover:shadow-md">
        {error && (
          <div className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-700">Add shift</p>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                <p className="text-[11px] font-medium text-slate-700">Attendance Mode</p>
                <p className="text-[10px] text-slate-500">
                  Choose how attendance is calculated for this shift.
                </p>
                {hoursBasedOnly && (
                  <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                    This company uses <strong>hours-based</strong> shifts only.
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  {!hoursBasedOnly && (
                    <>
                  <label className="inline-flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attendance_mode_create"
                      value="day_based"
                      checked={form.attendance_mode === 'day_based'}
                      onChange={() => setForm((prev) => ({ ...prev, attendance_mode: 'day_based' }))}
                      disabled={creating}
                      className="mt-0.5 text-primary-600"
                    />
                    <span className="text-[11px] text-slate-700">
                      <span className="font-medium">Day based</span>
                      <span className="block text-[10px] text-slate-500">
                        Same calendar day: start and end fall on one IST date (e.g. 09:00–18:00).{' '}
                        {shiftsCompactUi
                          ? 'Lunch and full-day rules use that day.'
                          : 'Late, lunch, and full-day rules use that day.'}
                      </span>
                    </span>
                  </label>
                  <label className="inline-flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attendance_mode_create"
                      value="shift_based"
                      checked={form.attendance_mode === 'shift_based'}
                      onChange={() => setForm((prev) => ({ ...prev, attendance_mode: 'shift_based' }))}
                      disabled={creating}
                      className="mt-0.5 text-primary-600"
                    />
                    <span className="text-[11px] text-slate-700">
                      <span className="font-medium">Shift based (overnight)</span>
                      <span className="block text-[10px] text-slate-500">
                        Night shift: end time is after midnight on the clock (e.g. 22:00–06:00). The whole block is counted on the shift start date.
                      </span>
                    </span>
                  </label>
                    </>
                  )}
                  <label className="inline-flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attendance_mode_create"
                      value="hours_based"
                      checked={form.attendance_mode === 'hours_based'}
                      onChange={() => setForm((prev) => ({ ...prev, attendance_mode: 'hours_based' }))}
                      disabled={creating}
                      className="mt-0.5 text-primary-600"
                    />
                    <span className="text-[11px] text-slate-700">
                      <span className="font-medium">Hours based</span>
                      <span className="block text-[10px] text-slate-500">
                        Flexible mode. Employee must spend minimum required hours inside the premises. Suitable for long shifts with multiple breaks.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">Name</label>
                <input
                  value={form.shift_name}
                  onChange={handleChange('shift_name')}
                  disabled={creating}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  placeholder="General shift"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">Start time</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={handleChange('start_time')}
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">End time</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={handleChange('end_time')}
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  />
                </div>
              </div>

              {(form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Half-day threshold hours (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={form.half_day_hours}
                    onChange={handleChange('half_day_hours')}
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    placeholder="0"
                  />
                  <p className="text-[10px] text-slate-500">
                    If set above 0, days with worked hours below this value are treated as half-day.
                    Leave 0 to use default midpoint logic.
                  </p>
                </div>
              )}

              {(form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Full-day minimum worked hours (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.25}
                    value={form.full_day_hours == null ? '' : form.full_day_hours}
                    onChange={handleFullDayHoursChange}
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    placeholder="Auto (shift span − lunch)"
                  />
                  <p className="text-[10px] text-slate-500">
                    For a paid full day, staff need four punches (IN–OUT–IN–OUT) and at least this many
                    hours worked. Leave empty to use (end − start) minus allotted lunch. Set 0 to ignore
                    worked time (punch pattern only).
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">
                  Monthly permission hours (optional)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.monthly_permission_hours}
                  onChange={handleChange('monthly_permission_hours')}
                  disabled={creating}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  placeholder="e.g. 5"
                />
                <p className="text-[10px] text-slate-500">
                  Paid permission pool per employee per month for this shift. Set 0 to disable.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Grace minutes (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.grace_minutes}
                    onChange={handleChange('grace_minutes')}
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  />
                </div>
                {(form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">
                      Lunch minutes (allotted)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.lunch_minutes}
                      onChange={handleChange('lunch_minutes')}
                      disabled={creating}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      placeholder="60"
                      title="Max minutes staff can take for lunch break"
                    />
                  </div>
                )}
              </div>

              {form.attendance_mode === 'hours_based' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Required Hours Per Day
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={form.required_hours_per_day}
                    onChange={handleChange('required_hours_per_day')}
                    disabled={creating}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    placeholder="10"
                  />
                  <p className="text-[10px] text-slate-500">
                    Employee must be inside for at least this many hours to be marked present.
                  </p>
                </div>
              )}
              {!shiftsCompactUi && (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                <p className="text-[11px] font-medium text-slate-700">
                  Overtime configuration
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allow_overtime === true}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, allow_overtime: e.target.checked }))
                    }
                    disabled={creating}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-300"
                  />
                  <span className="text-[11px] text-slate-700">Allow overtime pay</span>
                </label>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Overtime rate mode
                  </label>
                  <select
                    value={form.overtime_rate_mode || 'fixed'}
                    onChange={handleChange('overtime_rate_mode')}
                    disabled={creating || form.allow_overtime !== true}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-100 disabled:bg-slate-100"
                  >
                    <option value="fixed">Fixed (set ₹/hr)</option>
                    <option value="auto">Auto (daily wage ÷ shift hours)</option>
                  </select>
                  <p className="text-[10px] text-slate-500">
                    If set to Auto, overtime is paid using the employee’s daily wage divided by the shift working hours.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Overtime rate per hour (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.overtime_rate_per_hour}
                    onChange={handleChange('overtime_rate_per_hour')}
                    disabled={
                      creating ||
                      form.allow_overtime !== true ||
                      (form.overtime_rate_mode || 'fixed') === 'auto'
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:bg-slate-100"
                    placeholder="e.g. 100"
                  />
                </div>
              </div>
              )}

              {shiftsCompactUi ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-3">
                  <div>
                    <p className="text-[11px] font-medium text-slate-700">Paid leave</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Payroll follows worked hours. Prescribed days apply when absence rules are met; company policy below
                      controls when paid leave is forfeited for high absence.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">
                      Prescribed paid leave (days/month)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={form.paid_leave_days}
                      onChange={handleChange('paid_leave_days')}
                      disabled={creating}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      placeholder="3"
                    />
                    <p className="text-[10px] text-slate-500">Saved with this shift. Default 3.</p>
                  </div>
                  <div className="space-y-1 border-t border-slate-100 pt-2">
                    <label className="text-[11px] font-medium text-slate-700">
                      Paid leave forfeit — if absent days in a month exceed this number
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={plForfeitGt}
                      onChange={(e) => setPlForfeitGt(e.target.value)}
                      disabled={creating || savingPlPolicy}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      placeholder="6"
                    />
                    <p className="text-[10px] text-slate-500">
                      Company-wide: paid leave from the shift is not applied when total absent days are above this (e.g. 6).
                      Default 6. Save separately from the shift.
                    </p>
                    <button
                      type="button"
                      onClick={savePaidLeaveCompanyPolicy}
                      disabled={creating || savingPlPolicy}
                      className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {savingPlPolicy ? 'Saving…' : 'Save company policy'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">
                      Holidays (weekly off) — paid, no loss of pay
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Select which weekdays are off for this shift (e.g. Sunday).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_LABELS.map((label, dayNum) => (
                        <label
                          key={dayNum}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 cursor-pointer hover:border-primary-200 hover:bg-primary-50/50 has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50"
                        >
                          <input
                            type="checkbox"
                            checked={(form.weekly_off_days || []).includes(dayNum)}
                            onChange={() => toggleFormWeeklyOff(dayNum)}
                            disabled={creating}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-300"
                          />
                          <span className="text-[11px] font-medium text-slate-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">
                      Late arrival deduction (optional)
                    </p>
                    <p className="text-[10px] text-slate-500">
                      If staff punch IN late (after grace), deduct this fixed amount per late day (e.g. late 5 days = 5 × amount).
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-slate-700">Late minutes</label>
                        <input type="number" min={0} value={form.late_deduction_minutes} onChange={handleChange('late_deduction_minutes')} disabled={creating} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300" placeholder="e.g. 15" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-slate-700">Deduction amount</label>
                        <input type="number" min={0} value={form.late_deduction_amount} onChange={handleChange('late_deduction_amount')} disabled={creating} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300" placeholder="e.g. 50" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">
                      No-leave incentive (optional)
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Fixed incentive amount for staff who have zero absences in this shift for the month.
                    </p>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">Incentive amount</label>
                      <input
                        type="number"
                        min={0}
                        value={form.no_leave_incentive}
                        onChange={handleChange('no_leave_incentive')}
                        disabled={creating}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                        placeholder="e.g. 500"
                      />
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">
                      Paid leave allowance (optional)
                    </p>
                    <p className="text-[10px] text-slate-500">
                      For companies without a fixed weekly off, set how many days per month staff can
                      take as paid leave (with salary). For example, set 4 to allow 4 paid leave days.
                    </p>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">
                        Paid leave days per month
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.paid_leave_days}
                        onChange={handleChange('paid_leave_days')}
                        disabled={creating}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                        placeholder="e.g. 4"
                      />
                    </div>
                  </div>

                  {(form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                      <p className="text-[11px] font-medium text-slate-700">
                        Lunch over deduction (optional)
                      </p>
                      <p className="text-[10px] text-slate-500">
                        If staff take more than allotted lunch minutes, deduct this fixed amount per day (e.g. 3 days over = 3 × amount).
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-700">Lunch over minutes</label>
                          <input type="number" min={0} value={form.lunch_over_deduction_minutes} onChange={handleChange('lunch_over_deduction_minutes')} disabled={creating} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300" placeholder="e.g. 15" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-700">Deduction amount</label>
                          <input type="number" min={0} value={form.lunch_over_deduction_amount} onChange={handleChange('lunch_over_deduction_amount')} disabled={creating} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300" placeholder="e.g. 50" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Saving...' : '+ Add shift'}
              </button>
            </div>
          </form>

          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl border border-slate-100 bg-slate-50/80 animate-pulse"
                  />
                ))}
              </div>
            ) : shifts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <span className="text-2xl text-slate-400">🕐</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-800">No shifts yet</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-xs mx-auto">
                  Create your first shift to start tracking attendance and overtime correctly.
                </p>
                <p className="mt-3 text-[11px] text-slate-400">Use the form on the left to add one.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shifts.map((shift) => (
                  <article
                    key={shift.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 transition-all duration-200 hover:border-primary-100 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{shift.shift_name}</h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        {shift.attendance_mode === 'hours_based'
                          ? 'Hours based'
                          : shift.attendance_mode === 'shift_based'
                            ? 'Shift based (overnight)'
                            : 'Day based'}
                      </span>
                      {shift.attendance_mode === 'hours_based' && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          {(shift.required_hours_per_day ?? 8)}h / day
                        </span>
                      )}
                      {!shiftsCompactUi && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        shift.allow_overtime === false
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-violet-50 text-violet-700'
                      }`}>
                        {shift.allow_overtime === false
                          ? 'OT disabled'
                          : shift.overtime_rate_mode === 'auto'
                            ? 'OT Auto'
                            : `OT ₹${shift.overtime_rate_per_hour ?? 0}/hr`}
                      </span>
                      )}
                      {(shift.attendance_mode === 'day_based' || shift.attendance_mode === 'shift_based') &&
                        Number(shift.half_day_hours || 0) > 0 && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            Half-day &lt; {shift.half_day_hours}h
                          </span>
                        )}
                      {Number(shift.monthly_permission_hours || 0) > 0 && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          Permission {shift.monthly_permission_hours}h/month
                        </span>
                      )}
                    </div>
                  </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(shift)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-200"
                          title="Edit shift"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(shift)}
                          disabled={deletingId === shift.id}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-100 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:opacity-50"
                          title="Delete shift"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <dl className="mt-2 space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Start</dt>
                        <dd className="font-medium text-slate-800">{shift.start_time}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">End</dt>
                        <dd className="font-medium text-slate-800">{shift.end_time}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Grace</dt>
                        <dd className="font-medium text-slate-800">
                          {shift.grace_minutes != null ? shift.grace_minutes : 0} min
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Lunch allotted</dt>
                        <dd className="font-medium text-slate-800">
                          {shift.lunch_minutes != null ? shift.lunch_minutes : 60} min
                        </dd>
                      </div>
                      {(shift.attendance_mode === 'day_based' || shift.attendance_mode === 'shift_based') && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500">Full-day worked min</dt>
                          <dd className="font-medium text-slate-800 text-right">
                            {shift.full_day_hours != null && shift.full_day_hours !== ''
                              ? `${shift.full_day_hours} h (fixed)`
                              : 'Auto (shift − lunch)'}
                          </dd>
                        </div>
                      )}
                      {shiftsCompactUi ? (
                        <>
                          {shift.paid_leave_days != null && Number(shift.paid_leave_days) >= 0 ? (
                            <div className="flex justify-between">
                              <dt className="text-slate-500">Prescribed paid leave</dt>
                              <dd className="font-medium text-slate-800">
                                {shift.paid_leave_days} day
                                {Number(shift.paid_leave_days) === 1 ? '' : 's'} / month
                              </dd>
                            </div>
                          ) : null}
                          {company?.paid_leave_forfeit_if_absence_gt != null &&
                          company.paid_leave_forfeit_if_absence_gt !== '' ? (
                            <div className="flex justify-between gap-2">
                              <dt className="text-slate-500">PL forfeit if absent &gt;</dt>
                              <dd className="font-medium text-slate-800 text-right">
                                {company.paid_leave_forfeit_if_absence_gt} days
                              </dd>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {Array.isArray(shift.weekly_off_days) && shift.weekly_off_days.length > 0 ? (
                            <div className="flex justify-between gap-2">
                              <dt className="text-slate-500">Weekly off</dt>
                              <dd className="font-medium text-slate-800 text-right">
                                {shift.weekly_off_days.filter((d) => d >= 0 && d <= 6).map((d) => WEEKDAY_LABELS[d]).join(', ')}
                              </dd>
                            </div>
                          ) : null}
                          {shift.no_leave_incentive != null && Number(shift.no_leave_incentive) > 0 ? (
                            <div className="flex justify-between">
                              <dt className="text-slate-500">No-leave incentive</dt>
                              <dd className="font-medium text-emerald-700">
                                {shift.no_leave_incentive}
                              </dd>
                            </div>
                          ) : null}
                          {(shift.late_deduction_minutes != null && shift.late_deduction_minutes > 0) ||
                          (shift.late_deduction_amount != null && shift.late_deduction_amount > 0) ? (
                            <div className="flex justify-between">
                              <dt className="text-slate-500">Late deduction</dt>
                              <dd className="font-medium text-slate-800">
                                {shift.late_deduction_minutes ?? 0} min → {shift.late_deduction_amount ?? 0}
                              </dd>
                            </div>
                          ) : null}
                          {(shift.lunch_over_deduction_minutes != null && shift.lunch_over_deduction_minutes > 0) ||
                          (shift.lunch_over_deduction_amount != null && shift.lunch_over_deduction_amount > 0) ? (
                            <div className="flex justify-between">
                              <dt className="text-slate-500">Lunch over deduction</dt>
                              <dd className="font-medium text-slate-800">
                                {shift.lunch_over_deduction_minutes ?? 0} min → {shift.lunch_over_deduction_amount ?? 0}
                              </dd>
                            </div>
                          ) : null}
                          {shift.paid_leave_days != null && Number(shift.paid_leave_days) > 0 ? (
                            <div className="flex justify-between">
                              <dt className="text-slate-500">Paid leave allowance</dt>
                              <dd className="font-medium text-slate-800">
                                {shift.paid_leave_days} day
                                {Number(shift.paid_leave_days) === 1 ? '' : 's'} / month
                              </dd>
                            </div>
                          ) : null}
                        </>
                      )}
                      {!shiftsCompactUi && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Overtime</dt>
                        <dd className="font-medium text-slate-800">
                          {shift.allow_overtime === false
                            ? 'Disabled'
                            : shift.overtime_rate_mode === 'auto'
                              ? 'Auto'
                              : `₹${shift.overtime_rate_per_hour ?? 0}/hr`}
                        </dd>
                      </div>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="edit-shift-title">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h2 id="edit-shift-title" className="text-sm font-semibold text-slate-900">Edit shift</h2>
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">Name</label>
                <input
                  value={form.shift_name}
                  onChange={handleChange('shift_name')}
                  disabled={savingEdit}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  placeholder="General shift"
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                <p className="text-[11px] font-medium text-slate-700">Attendance mode</p>
                {hoursBasedOnly && (
                  <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                    Hours-based only for this company.
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  {!hoursBasedOnly && (
                    <>
                  <label className="inline-flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attendance_mode_edit"
                      value="day_based"
                      checked={form.attendance_mode === 'day_based'}
                      onChange={() => setForm((prev) => ({ ...prev, attendance_mode: 'day_based' }))}
                      disabled={savingEdit}
                      className="mt-0.5 text-primary-600"
                    />
                    <span className="text-[11px] text-slate-700">Day based</span>
                  </label>
                  <label className="inline-flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attendance_mode_edit"
                      value="shift_based"
                      checked={form.attendance_mode === 'shift_based'}
                      onChange={() => setForm((prev) => ({ ...prev, attendance_mode: 'shift_based' }))}
                      disabled={savingEdit}
                      className="mt-0.5 text-primary-600"
                    />
                    <span className="text-[11px] text-slate-700">Shift based (overnight)</span>
                  </label>
                    </>
                  )}
                  <label className="inline-flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="attendance_mode_edit"
                      value="hours_based"
                      checked={form.attendance_mode === 'hours_based'}
                      onChange={() => setForm((prev) => ({ ...prev, attendance_mode: 'hours_based' }))}
                      disabled={savingEdit}
                      className="mt-0.5 text-primary-600"
                    />
                    <span className="text-[11px] text-slate-700">Hours based</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">Start time</label>
                  <input type="time" value={form.start_time} onChange={handleChange('start_time')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">End time</label>
                  <input type="time" value={form.end_time} onChange={handleChange('end_time')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                </div>
              </div>
              {form.attendance_mode === 'hours_based' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">Required hours per day</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={form.required_hours_per_day}
                    onChange={handleChange('required_hours_per_day')}
                    disabled={savingEdit}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
              )}
              {!shiftsCompactUi && (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                <p className="text-[11px] font-medium text-slate-700">Overtime configuration</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allow_overtime === true}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, allow_overtime: e.target.checked }))
                    }
                    disabled={savingEdit}
                    className="rounded border-slate-300 text-primary-600"
                  />
                  <span className="text-[11px] text-slate-700">Allow overtime pay</span>
                </label>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Overtime rate mode
                  </label>
                  <select
                    value={form.overtime_rate_mode || 'fixed'}
                    onChange={handleChange('overtime_rate_mode')}
                    disabled={savingEdit || form.allow_overtime !== true}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-100 disabled:bg-slate-100"
                  >
                    <option value="fixed">Fixed (set ₹/hr)</option>
                    <option value="auto">Auto (daily wage ÷ shift hours)</option>
                  </select>
                  <p className="text-[10px] text-slate-500">
                    If set to Auto, overtime is paid using the employee’s daily wage divided by the shift working hours.
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">Overtime rate per hour (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.overtime_rate_per_hour}
                    onChange={handleChange('overtime_rate_per_hour')}
                    disabled={
                      savingEdit ||
                      form.allow_overtime !== true ||
                      (form.overtime_rate_mode || 'fixed') === 'auto'
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs disabled:bg-slate-100"
                  />
                </div>
              </div>
              )}
              {(form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">Half-day threshold hours</label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={form.half_day_hours}
                    onChange={handleChange('half_day_hours')}
                    disabled={savingEdit}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
              )}
              {(form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">
                    Full-day minimum worked hours
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.25}
                    value={form.full_day_hours == null ? '' : form.full_day_hours}
                    onChange={handleFullDayHoursChange}
                    disabled={savingEdit}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    placeholder="Auto (shift span − lunch)"
                  />
                  <p className="text-[10px] text-slate-500">
                    Empty = (end − start) minus lunch. 0 = punch pattern only. Otherwise need this many
                    worked hours for a full paid day after four punches.
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-700">Monthly permission hours</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.monthly_permission_hours}
                  onChange={handleChange('monthly_permission_hours')}
                  disabled={savingEdit}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                />
              </div>
              {shiftsCompactUi ? (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-3">
                  <div>
                    <p className="text-[11px] font-medium text-slate-700">Paid leave</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Prescribed days save with this shift. Forfeit threshold is company-wide (same as add form).
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">
                      Prescribed paid leave (days/month)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={form.paid_leave_days}
                      onChange={handleChange('paid_leave_days')}
                      disabled={savingEdit}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    />
                  </div>
                  <div className="space-y-1 border-t border-slate-100 pt-2">
                    <label className="text-[11px] font-medium text-slate-700">
                      Paid leave forfeit — if absent days exceed
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={plForfeitGt}
                      onChange={(e) => setPlForfeitGt(e.target.value)}
                      disabled={savingEdit || savingPlPolicy}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={savePaidLeaveCompanyPolicy}
                      disabled={savingEdit || savingPlPolicy}
                      className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {savingPlPolicy ? 'Saving…' : 'Save company policy'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">No-leave incentive (optional)</p>
                    <p className="text-[10px] text-slate-500">
                      Fixed incentive for staff with zero absences on this shift for the month.
                    </p>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">Incentive amount</label>
                      <input
                        type="number"
                        min={0}
                        value={form.no_leave_incentive}
                        onChange={handleChange('no_leave_incentive')}
                        disabled={savingEdit}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                        placeholder="e.g. 500"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">Paid leave allowance (optional)</p>
                    <p className="text-[10px] text-slate-500">
                      Days per month that can count as paid (with salary) when the employee would otherwise be absent.
                      Use 0 if you do not offer shift-level paid leave.
                    </p>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">Paid leave days per month</label>
                      <input
                        type="number"
                        min={0}
                        value={form.paid_leave_days}
                        onChange={handleChange('paid_leave_days')}
                        disabled={savingEdit}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                        placeholder="e.g. 4"
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-700">Grace min</label>
                  <input type="number" min={0} value={form.grace_minutes} onChange={handleChange('grace_minutes')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                </div>
                {(form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">Lunch min</label>
                    <input type="number" min={0} value={form.lunch_minutes} onChange={handleChange('lunch_minutes')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                  </div>
                )}
              </div>
              {!shiftsCompactUi && (
                <>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                    <p className="text-[11px] font-medium text-slate-700">Holidays (weekly off)</p>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_LABELS.map((label, dayNum) => (
                        <label key={dayNum} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 cursor-pointer hover:border-primary-200 has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50">
                          <input type="checkbox" checked={(form.weekly_off_days || []).includes(dayNum)} onChange={() => toggleFormWeeklyOff(dayNum)} disabled={savingEdit} className="rounded border-slate-300 text-primary-600" />
                          <span className="text-[11px] font-medium text-slate-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">Late min</label>
                      <input type="number" min={0} value={form.late_deduction_minutes} onChange={handleChange('late_deduction_minutes')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-slate-700">Late deduction amt</label>
                      <input type="number" min={0} value={form.late_deduction_amount} onChange={handleChange('late_deduction_amount')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                    </div>
                  </div>
                </>
              )}
              {!shiftsCompactUi && (form.attendance_mode === 'day_based' || form.attendance_mode === 'shift_based') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">Lunch over min</label>
                    <input type="number" min={0} value={form.lunch_over_deduction_minutes} onChange={handleChange('lunch_over_deduction_minutes')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">Lunch over deduction amt</label>
                    <input type="number" min={0} value={form.lunch_over_deduction_amount} onChange={handleChange('lunch_over_deduction_amount')} disabled={savingEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" />
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={cancelEdit} disabled={savingEdit} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={savingEdit} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {savingEdit ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
