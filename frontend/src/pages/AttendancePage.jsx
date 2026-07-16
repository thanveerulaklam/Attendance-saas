import { Fragment, useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { IST } from '../utils/istDisplay';
import {
  formatLocalTime,
  formatYmdDisplay,
  formatYmdLong,
  todayYmdInTimezone,
  resolveCompanyTimezone,
} from '../utils/companyLocalDisplay';
import { formatWorkedHours } from '../utils/durationFormat';
import {
  branchesFromAttendanceRows,
  branchesFromEmployees,
  mergeBranchLists,
  normalizeBranchesPayload,
} from '../utils/branchOptions';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYMDLocalFromParts(year, month1Based, day) {
  return `${year}-${pad2(month1Based)}-${pad2(day)}`;
}

function formatTimeForInput(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function editPunchRowKey(edit) {
  return edit.isNew ? edit.tempId : edit.id;
}

function matchesEditPunchRow(row, edit) {
  return edit.isNew ? row.tempId === edit.tempId : row.id === edit.id;
}

function getMonthYear(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function isLeftAtLunchStatus(row) {
  return Boolean(row?.present && row?.left_during_lunch && !row?.full_day);
}

function isOnBreakStatus(row, isTodaySelected) {
  if (!isTodaySelected) return false;
  if (String(row?.attendance_mode || '') !== 'hours_based') return false;
  if (!row?.present || row?.full_day || row?.left_during_lunch) return false;
  const punches = Array.isArray(row?.punches) ? row.punches : [];
  if (!punches.length) return false;
  const hasAnyInPunch = punches.some(
    (p) => String(p?.punch_type || '').toLowerCase() === 'in'
  );
  if (!hasAnyInPunch) return false;
  const lastPunchType = String(punches[punches.length - 1]?.punch_type || '').toLowerCase();
  return lastPunchType === 'out';
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [monthYear, setMonthYear] = useState(() => getMonthYear(0));
  const [employeeId, setEmployeeId] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [branches, setBranches] = useState([]);
  const [branchFilter, setBranchFilter] = useState(''); // '' = all allowed branches
  const [deviceFilter, setDeviceFilter] = useState(''); // '' = all devices
  const [devices, setDevices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [monthlyData, setMonthlyData] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [company, setCompany] = useState(null);
  const [mobileAttendanceEnabled, setMobileAttendanceEnabled] = useState(false);
  const [kioskSetupReady, setKioskSetupReady] = useState(false);
  const companyTz = resolveCompanyTimezone(company || user?.company_locale);
  const todayStr = useMemo(() => todayYmdInTimezone(companyTz), [companyTz]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState(null);
  const [manualSuccess, setManualSuccess] = useState(null);
  const [editPunchOpen, setEditPunchOpen] = useState(false);
  const [editPunchSubmitting, setEditPunchSubmitting] = useState(false);
  const [editPunchError, setEditPunchError] = useState(null);
  const [lateModalOpen, setLateModalOpen] = useState(false);
  const [absentModalOpen, setAbsentModalOpen] = useState(false);
  const [presentModalOpen, setPresentModalOpen] = useState(false);
  const [fullDayModalOpen, setFullDayModalOpen] = useState(false);
  const [leftLunchModalOpen, setLeftLunchModalOpen] = useState(false);
  const [editPunchData, setEditPunchData] = useState(null); // { employeeId, employeeName, date, punches }
  const [editPunchEdits, setEditPunchEdits] = useState([]); // [{ id?, tempId?, isNew?, time, punch_type }]
  const [manualForm, setManualForm] = useState({
    employee_id: '',
    date: todayYmdInTimezone(IST),
    time: formatTimeForInput(new Date()),
    punch_type: 'in',
    mode: 'full_day', // 'full_day' | 'single'
    bulk: false,
    selected_ids: [],
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => todayYmdInTimezone(IST));

  const { year, month } = monthYear;
  const dateStr = selectedDate;
  const isTodaySelected = dateStr === todayStr;
  const isTharagaiReadymades = String(company?.name || '').toLowerCase().includes('tharagai readymades');

  const refreshAfterManual = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchEmployees = async () => {
      try {
        const res = await authFetch('/api/employees?limit=200', {
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const json = await res.json();
        const list = json.data?.data || [];
        if (isMounted) setEmployees(list);
      } catch {
        // ignore
      }
    };
    fetchEmployees();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (isMounted) {
          setCompany(json?.data || null);
          setMobileAttendanceEnabled(Boolean(json?.data?.mobile_attendance_enabled));
          const fromCompany = normalizeBranchesPayload(json?.data);
          if (fromCompany.length > 0) {
            setBranches((prev) => mergeBranchLists(prev, fromCompany));
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setCompany(null);
          setMobileAttendanceEnabled(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadBranchOptions() {
      try {
        const res = await authFetch('/api/company/branches', {
          headers: { 'Content-Type': 'application/json' },
        });
        const json = res.ok ? await res.json() : null;
        if (!isMounted) return;
        const fromBranchesApi = normalizeBranchesPayload(json?.data);
        setBranches((prev) =>
          mergeBranchLists(prev, fromBranchesApi, branchesFromEmployees(employees))
        );
      } catch {
        if (!isMounted) return;
        setBranches((prev) => mergeBranchLists(prev, branchesFromEmployees(employees)));
      }
    }

    loadBranchOptions();
    return () => {
      isMounted = false;
    };
  }, [employees]);

  useEffect(() => {
    if (!mobileAttendanceEnabled) {
      setKioskSetupReady(false);
      return undefined;
    }

    let isMounted = true;
    const branchIds = (branches || [])
      .map((b) => Number(b.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (branchIds.length === 0) {
      setKioskSetupReady(false);
      return undefined;
    }

    Promise.all(
      branchIds.map(async (branchId) => {
        try {
          const res = await authFetch(`/api/company/branches/${branchId}/kiosk`, {
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) return false;
          const json = await res.json().catch(() => ({}));
          return Boolean(json.data?.token || json.data?.kiosk?.kiosk_code);
        } catch {
          return false;
        }
      })
    )
      .then((results) => {
        if (isMounted) setKioskSetupReady(results.some(Boolean));
      })
      .catch(() => {
        if (isMounted) setKioskSetupReady(false);
      });

    return () => {
      isMounted = false;
    };
  }, [mobileAttendanceEnabled, branches]);

  useEffect(() => {
    let isMounted = true;
    authFetch('/api/device', { headers: { 'Content-Type': 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load devices');
        const json = await res.json();
        if (!isMounted) return;
        setDevices(Array.isArray(json.data) ? json.data : []);
      })
      .catch(() => {
        if (!isMounted) return;
        setDevices([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const branchFilterOptions = useMemo(
    () => mergeBranchLists(branches, branchesFromEmployees(employees), branchesFromAttendanceRows(dailyData)),
    [branches, employees, dailyData]
  );

  const devicesForBranch = useMemo(() => {
    if (!branchFilter) return devices;
    const bid = Number(branchFilter);
    if (!Number.isFinite(bid)) return devices;
    return (devices || []).filter((d) => Number(d.branch_id) === bid);
  }, [devices, branchFilter]);

  useEffect(() => {
    if (!deviceFilter) return;
    if (deviceFilter === 'manual' || deviceFilter === 'auto_out') return;
    const stillValid = devicesForBranch.some((d) => String(d.id) === deviceFilter);
    if (!stillValid) setDeviceFilter('');
  }, [branchFilter, devicesForBranch, deviceFilter]);

  const employeesForBranch = useMemo(() => {
    if (!branchFilter) return employees;
    const bid = Number(branchFilter);
    if (!Number.isFinite(bid)) return employees;
    return (employees || []).filter((e) => Number(e.branch_id) === bid);
  }, [employees, branchFilter]);

  /** Manual attendance must not list deactivated (inactive) employees; API also rejects them. */
  const employeesForManualAttendance = useMemo(
    () =>
      (employeesForBranch || []).filter(
        (e) => String(e.status || 'active').toLowerCase() === 'active'
      ),
    [employeesForBranch]
  );

  useEffect(() => {
    let isMounted = true;
    authFetch('/api/employees/departments', {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load departments');
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        setDepartmentOptions(json.data || []);
      })
      .catch(() => {
        if (!isMounted) return;
        setDepartmentOptions([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setError(null);
    setLoading(true);
    const params = new URLSearchParams({ year, month });
    if (employeeId) params.set('employee_id', employeeId);
    if (departmentFilter !== 'all') params.set('department', departmentFilter);
    if (branchFilter) params.set('branch_id', branchFilter);
    if (deviceFilter) params.set('device_id', deviceFilter);
    authFetch(`/api/attendance/monthly?${params}`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load monthly attendance');
        return res.json();
      })
      .then((json) => {
        if (isMounted) setMonthlyData(json.data);
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unable to load attendance');
          setMonthlyData(null);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [year, month, employeeId, departmentFilter, refreshKey, branchFilter, deviceFilter]);

  useEffect(() => {
    if (!branchFilter) return;
    if (!employeeId) return;
    const bid = Number(branchFilter);
    const eid = Number(employeeId);
    const stillValid = employeesForBranch.some((e) => e.id === eid && Number(e.branch_id) === bid);
    if (!stillValid) setEmployeeId('');
  }, [branchFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setError(null);
      setDailyLoading(true);
      const params = new URLSearchParams({ date: dateStr });
      if (departmentFilter !== 'all') params.set('department', departmentFilter);
      if (branchFilter) params.set('branch_id', branchFilter);
      if (deviceFilter) params.set('device_id', deviceFilter);
      authFetch(`/api/attendance/daily?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.ok) return res.json();
          // express-rate-limit returns JSON body with the configured message.
          let msg = 'Failed to load today';
          try {
            const j = await res.json();
            msg = j?.message?.message || j?.message || j?.error || msg;
          } catch {
            msg = res.statusText || msg;
          }
          const e = new Error(msg);
          e.status = res.status;
          throw e;
        })
        .then((json) => {
          if (isMounted) setDailyData(Array.isArray(json.data) ? json.data : []);
        })
        .catch((err) => {
          if (!isMounted) return;
          if (err?.name === 'AbortError') return;
          setDailyData([]);
          setError(err?.message || 'Unable to load daily attendance');
        })
        .finally(() => {
          if (isMounted) setDailyLoading(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [dateStr, departmentFilter, refreshKey, branchFilter, deviceFilter]);

  const todaySummary = useMemo(() => {
    if (!dailyData || dailyData.length === 0) {
      return {
        present: 0,
        absent: 0,
        shiftPending: 0,
        late: 0,
        fullDay: 0,
        leftDuringLunch: 0,
        onBreak: 0,
        total: 0,
      };
    }
    const present = dailyData.filter((r) => r.present).length;
    const shiftPending = dailyData.filter((r) => r.shift_pending).length;
    const late = dailyData.filter((r) => r.late).length;
    const fullDay = dailyData.filter((r) => r.full_day).length;
    const leftDuringLunch = dailyData.filter((r) => isLeftAtLunchStatus(r)).length;
    const onBreak = dailyData.filter((r) => isOnBreakStatus(r, isTodaySelected)).length;
    return {
      present,
      shiftPending,
      absent: dailyData.filter((r) => !r.present && !r.shift_pending).length,
      late,
      fullDay,
      leftDuringLunch,
      onBreak,
      total: dailyData.length,
    };
  }, [dailyData, isTodaySelected]);

  const punchTimingBranchGroups = useMemo(() => {
    if (!Array.isArray(dailyData) || dailyData.length === 0) return [];
    const groups = new Map();
    dailyData.forEach((row) => {
      const branchName = String(row?.branch_name || '').trim() || 'Unassigned branch';
      if (!groups.has(branchName)) groups.set(branchName, []);
      groups.get(branchName).push(row);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([branchName, rows]) => ({ branchName, rows }));
  }, [dailyData]);

  const calendarGrid = useMemo(() => {
    if (!monthlyData || !monthlyData.daysInMonth) return null;
    const { daysInMonth, employees: empList } = monthlyData;
    const firstDay = new Date(year, month - 1, 1);
    const startWeekday = firstDay.getDay();
    const days = [];
    for (let d = 1; d <= daysInMonth; d += 1) days.push(d);

    const totalEmployees = empList?.length || 0;
    const singleEmployee = employeeId && empList && empList[0];
    const dayMap = new Map();

    if (singleEmployee) {
      singleEmployee.days.forEach((x) => dayMap.set(x.day, { ...x, total: 1, presentCount: x.present ? 1 : 0 }));
    } else if (empList && empList.length > 0) {
      for (let d = 1; d <= daysInMonth; d += 1) {
        let presentCount = 0;
        let lateCount = 0;
        empList.forEach((emp) => {
          const dayInfo = emp.days.find((x) => x.day === d);
          if (dayInfo?.present) presentCount += 1;
          if (dayInfo?.late) lateCount += 1;
        });
        dayMap.set(d, {
          day: d,
          present: presentCount > 0,
          late: lateCount > 0,
          presentCount,
          total: totalEmployees,
        });
      }
    }

    const blanks = Array(startWeekday).fill(null);
    const allCells = [...blanks, ...days];
    const rows = [];
    for (let i = 0; i < allCells.length; i += 7) {
      rows.push(allCells.slice(i, i + 7));
    }
    return { rows, dayMap, daysInMonth, totalEmployees, isSingleEmployee: Boolean(employeeId) };
  }, [monthlyData, year, month, employeeId]);

  // Shift relative to the currently displayed month/year (not "today"),
  // otherwise "March -> Next" can incorrectly jump based on system date.
  const goPrev = () =>
    setMonthYear((m) => {
      const d = new Date(m.year, m.month - 1, 1);
      d.setMonth(d.getMonth() - 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const goNext = () =>
    setMonthYear((m) => {
      const d = new Date(m.year, m.month - 1, 1);
      d.setMonth(d.getMonth() + 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const handleSelectDate = (dayNum) => {
    const next = formatYMDLocalFromParts(year, month, dayNum);
    if (next === selectedDate) return;
    setSelectedDate(next);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const isBulk = manualForm.mode === 'full_day' && manualForm.bulk;
    const selectedIds = isBulk ? (manualForm.selected_ids || []) : [];

    if (isBulk) {
      if (!selectedIds.length) {
        setManualError('Please select at least one employee');
        return;
      }
    } else if (!manualForm.employee_id) {
      setManualError('Please select an employee');
      return;
    }

    setManualError(null);
    setManualSuccess(null);
    setManualSubmitting(true);

    if (isBulk) {
      authFetch('/api/attendance/manual-full-day-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: selectedIds, date: manualForm.date }),
      })
        .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => {
          if (ok) {
            setManualSuccess(json.message || 'Attendance recorded');
            refreshAfterManual();
            setManualForm((f) => ({ ...f, selected_ids: [] }));
          } else {
            setManualError(json.message || json.error || 'Failed to record attendance');
          }
        })
        .catch(() => setManualError('Network error'))
        .finally(() => setManualSubmitting(false));
      return;
    }

    const url = manualForm.mode === 'full_day'
      ? '/api/attendance/manual-full-day'
      : '/api/attendance/manual-punch';
    const body = manualForm.mode === 'full_day'
      ? { employee_id: Number(manualForm.employee_id), date: manualForm.date }
      : {
          employee_id: Number(manualForm.employee_id),
          punch_time: new Date(`${manualForm.date}T${manualForm.time}:00`).toISOString(),
          punch_type: manualForm.punch_type,
        };
    authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (ok) {
          setManualSuccess(json.message || 'Attendance recorded');
          refreshAfterManual();
          setManualForm((f) => ({ ...f, employee_id: '' }));
        } else {
          setManualError(json.message || json.error || 'Failed to record attendance');
        }
      })
      .catch(() => setManualError('Network error'))
      .finally(() => setManualSubmitting(false));
  };

  const toggleEmployee = (id) => {
    setManualForm((f) => {
      const ids = new Set(f.selected_ids || []);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ...f, selected_ids: Array.from(ids) };
    });
  };

  const selectAllEmployees = () => {
    setManualForm((f) => ({
      ...f,
      selected_ids: employeesForManualAttendance.map((e) => e.id),
    }));
  };

  const clearAllEmployees = () => {
    setManualForm((f) => ({ ...f, selected_ids: [] }));
  };

  const openManualModal = () => {
    setManualError(null);
    setManualSuccess(null);
    setManualForm((f) => ({
      ...f,
      date: todayYmdInTimezone(IST),
      time: formatTimeForInput(new Date()),
      selected_ids: [],
    }));
    setManualModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Attendance</h1>
        <p className="text-xs text-slate-500">
          View daily and monthly attendance with present, late, and overtime.
        </p>
      </header>

      {mobileAttendanceEnabled && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {kioskSetupReady ? (
            <span>Face attendance kiosk is enabled.</span>
          ) : (
            <>
              <span>
                Face attendance kiosk is enabled. Generate a branch kiosk code in{' '}
                <Link to="/settings/company" className="font-medium underline">
                  Company settings
                </Link>
                , install the PunchPay Kiosk app on the office tablet, and enroll employee faces.
              </span>
              <Link
                to="/settings/company"
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-medium text-white"
              >
                Set up kiosk
              </Link>
            </>
          )}
        </div>
      )}

      {/* Daily summary card for selected date */}
      <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Daily summary</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Attendance for {formatYmdLong(dateStr, companyTz)}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
            >
              <option value="all">All departments</option>
              {(departmentOptions || []).map((d) => (
                <option key={String(d)} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
            >
              <option value="">All branches</option>
              {(branchFilterOptions || []).map((b) => (
                <option key={String(b.id)} value={String(b.id)}>
                  {b.name || `Branch #${b.id}`}
                </option>
              ))}
            </select>
            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
            >
              <option value="">All devices</option>
              <option value="manual">Manual attendance</option>
              <option value="mobile">Mobile / QR</option>
              <option value="kiosk">Face kiosk</option>
              <option value="auto_out">Auto OUT</option>
              {(devicesForBranch || []).map((d) => (
                <option key={String(d.id)} value={String(d.id)}>
                  {d.name || `Device #${d.id}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={openManualModal}
              className="w-full sm:w-auto shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
            >
              Mark manual attendance
            </button>
          </div>
        </div>
        {dailyLoading ? (
          <div className="mt-3 h-16 rounded-lg bg-slate-50 animate-pulse" />
        ) : (
          <div
            className={`mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 ${
              isTodaySelected && todaySummary.shiftPending > 0
                ? 'lg:grid-cols-6'
                : 'lg:grid-cols-5'
            }`}
          >
            <button
              type="button"
              onClick={() => todaySummary.present > 0 && setPresentModalOpen(true)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                todaySummary.present > 0
                  ? 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100/60 cursor-pointer'
                  : 'bg-emerald-50 border-emerald-100 cursor-default'
              }`}
              disabled={todaySummary.present === 0}
            >
              <p className="text-[10px] font-medium text-emerald-700">Present</p>
              <p className="text-lg font-semibold text-emerald-800">{todaySummary.present}</p>
            </button>
            <button
              type="button"
              onClick={() => todaySummary.absent > 0 && setAbsentModalOpen(true)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                todaySummary.absent > 0
                  ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 cursor-pointer'
                  : 'bg-slate-50 border-slate-200 cursor-default'
              }`}
              disabled={todaySummary.absent === 0}
            >
              <p className="text-[10px] font-medium text-slate-600">Absent</p>
              <p className="text-lg font-semibold text-slate-800">{todaySummary.absent}</p>
            </button>
            {isTodaySelected && todaySummary.shiftPending > 0 && (
              <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-left">
                <p className="text-[10px] font-medium text-violet-700">Shift not started</p>
                <p className="text-lg font-semibold text-violet-800">{todaySummary.shiftPending}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => todaySummary.late > 0 && setLateModalOpen(true)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                todaySummary.late > 0
                  ? 'bg-amber-50 border-amber-100 hover:bg-amber-100/80 cursor-pointer'
                  : 'bg-amber-50 border-amber-100 cursor-default'
              }`}
              disabled={todaySummary.late === 0}
            >
              <p className="text-[10px] font-medium text-amber-700">Late</p>
              <p className="text-lg font-semibold text-amber-800">{todaySummary.late}</p>
            </button>
            <button
              type="button"
              onClick={() => todaySummary.fullDay > 0 && setFullDayModalOpen(true)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                todaySummary.fullDay > 0
                  ? 'bg-blue-50 border-blue-100 hover:bg-blue-100/60 cursor-pointer'
                  : 'bg-blue-50 border-blue-100 cursor-default'
              }`}
              disabled={todaySummary.fullDay === 0}
            >
              <p className="text-[10px] font-medium text-blue-700">Full day</p>
              <p className="text-lg font-semibold text-blue-800">{todaySummary.fullDay}</p>
            </button>
            <button
              type="button"
              onClick={() =>
                (isTharagaiReadymades ? todaySummary.onBreak : todaySummary.leftDuringLunch) > 0 &&
                setLeftLunchModalOpen(true)
              }
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                (isTharagaiReadymades ? todaySummary.onBreak : todaySummary.leftDuringLunch) > 0
                  ? 'bg-rose-50 border-rose-100 hover:bg-rose-100/60 cursor-pointer'
                  : 'bg-rose-50 border-rose-100 cursor-default'
              }`}
              disabled={(isTharagaiReadymades ? todaySummary.onBreak : todaySummary.leftDuringLunch) === 0}
            >
              <p className="text-[10px] font-medium text-rose-700">
                {isTharagaiReadymades ? 'On break' : 'Left at lunch'}
              </p>
              <p className="text-lg font-semibold text-rose-800">
                {isTharagaiReadymades ? todaySummary.onBreak : todaySummary.leftDuringLunch}
              </p>
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          {todaySummary.total} active employees
        </p>

        {/* Punch timings for selected date */}
        {!dailyLoading && dailyData && dailyData.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-700 mb-2">
              Punch timings for{' '}
              {formatYmdDisplay(dateStr, companyTz)}
            </h3>
            <div className="max-h-[44rem] overflow-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[720px] text-[11px]">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Employee</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Code</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Timings</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Day status</th>
                    <th className="text-left py-2 px-2 font-medium text-slate-600">Lunch</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">Total hours</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {punchTimingBranchGroups.map((group) => (
                    <Fragment key={group.branchName}>
                      <tr className="border-t border-slate-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50">
                        <td
                          colSpan={7}
                          className="px-2 py-2.5 text-xs font-bold tracking-wide text-indigo-700"
                        >
                          {group.branchName}
                        </td>
                      </tr>
                      {group.rows.map((row) => {
                    const punches = row.punches || [];
                    const timingsContent = punches.length
                      ? punches.map((p, idx) => {
                          const timeStr = formatLocalTime(p.punch_time, companyTz);
                          const punchType = (p.punch_type || '').toLowerCase();
                          const deviceId = (p.device_id || '').toLowerCase();
                          const isAuto = deviceId === 'auto_out' && punchType === 'out';
                          const isManual = deviceId === 'manual';
                          const isMobile = deviceId === 'mobile';
                          const isKiosk = deviceId === 'kiosk';
                          const suffix = isAuto
                            ? ' OUT (Auto — shift end)'
                            : isKiosk
                              ? ` ${punchType.toUpperCase()}`
                              : isMobile
                              ? ` ${punchType.toUpperCase()} (Mobile)`
                              : isManual
                                ? ` ${punchType.toUpperCase()} (Manual)`
                                : ` ${punchType.toUpperCase()}`;
                          return (
                            <span
                              key={p.id || `${row.employee_id}-${idx}-${p.punch_time}`}
                              className={
                                isManual
                                  ? 'text-orange-600 font-medium'
                                  : isKiosk
                                    ? 'text-emerald-600 font-medium'
                                    : isMobile
                                    ? 'text-violet-600 font-medium'
                                    : undefined
                              }
                            >
                              {`${timeStr}${suffix}`}
                              {idx < punches.length - 1 ? ', ' : ''}
                            </span>
                          );
                        })
                      : '—';
                    const isHoursBased = row.attendance_mode === 'hours_based';
                    const onBreakNow = isOnBreakStatus(row, isTodaySelected);
                    let dayStatus = 'Absent';
                    if (row.shift_pending) dayStatus = 'Shift not started';
                    else if (row.present) {
                      if (row.full_day) dayStatus = 'Full day';
                      else if (onBreakNow) dayStatus = 'On break';
                      else if (isLeftAtLunchStatus(row)) dayStatus = 'Left at lunch';
                      else dayStatus = 'Present';
                    }
                    if (row.late && (dayStatus === 'Present' || dayStatus === 'Full day')) {
                      dayStatus += ' (late)';
                    }
                    const statusCls =
                      dayStatus === 'Shift not started'
                        ? 'text-violet-600'
                        : dayStatus.startsWith('Full day')
                        ? 'text-blue-600'
                        : dayStatus.startsWith('On break')
                          ? 'text-violet-600'
                        : dayStatus.startsWith('Left')
                          ? 'text-rose-600'
                        : row.present
                          ? 'text-emerald-600'
                          : 'text-slate-500';
                    let hoursLabel = '';
                    if (isHoursBased && row.total_hours_inside != null) {
                      const total = Number(row.total_hours_inside || 0);
                      const required = Number(row.required_hours_per_day || 0);
                      const diffMinutes = required > 0 ? (total - required) * 60 : 0;
                      const absDiffMin = Math.abs(Math.round(diffMinutes));
                      const diffH = Math.floor(absDiffMin / 60);
                      const diffM = absDiffMin % 60;
                      const diffStr =
                        absDiffMin === 0
                          ? ''
                          : diffH > 0
                            ? ` by ${diffH}h ${diffM}m`
                            : ` by ${diffM}m`;
                      const met = total >= required && required > 0;
                      hoursLabel = `Total inside: ${formatWorkedHours(total)} — ${
                        met ? 'Met' : 'Short'
                      }${diffStr}`;
                    }
                    let firstPunchLabel = '';
                    if (row.first_in_time) {
                      const timeStr = formatLocalTime(row.first_in_time, companyTz);
                      const minsLate = Number(row.minutes_late || 0);
                      const lateStr =
                        row.late && minsLate > 0
                          ? `Late by ${minsLate} mins`
                          : 'On time';
                      firstPunchLabel = `First punch: ${timeStr} — ${lateStr}`;
                    }
                    const lunch =
                      row.left_during_lunch
                        ? '—'
                        : row.lunch_minutes != null
                          ? row.lunch_over_minutes != null && row.lunch_over_minutes > 0
                            ? `${row.lunch_minutes}m (+${row.lunch_over_minutes} over)`
                            : `${row.lunch_minutes}m`
                          : '—';
                    const lunchCls =
                      row.lunch_over_minutes != null && row.lunch_over_minutes > 0
                        ? 'text-amber-600'
                        : 'text-slate-600';
                    const totalHoursNum = Number(row.total_hours_from_shift_start ?? 0);
                    const totalHoursDisplay =
                      row.present || totalHoursNum > 0 ? formatWorkedHours(totalHoursNum) : '—';
                    return (
                      <tr key={row.employee_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="py-1.5 px-2 font-medium text-slate-800">
                          {row.name}
                          {row.shift_name ? (
                            <span className="block text-[10px] font-normal text-slate-400">
                              {row.shift_name}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1.5 px-2 text-slate-600">{row.employee_code || '—'}</td>
                        <td className="py-1.5 px-2 text-slate-600">{timingsContent}</td>
                        <td className={`py-1.5 px-2 font-medium ${statusCls}`}>
                          <div className="flex flex-col gap-0.5">
                            <span>{dayStatus}</span>
                            {isHoursBased && hoursLabel && (
                              <span className="text-[10px] font-normal text-slate-600">
                                {hoursLabel}
                              </span>
                            )}
                            {isHoursBased && firstPunchLabel && (
                              <span className="text-[10px] font-normal text-slate-600">
                                {firstPunchLabel}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`py-1.5 px-2 ${lunchCls}`}>{lunch}</td>
                        <td className="py-1.5 px-2 text-right">{totalHoursDisplay}</td>
                        <td className="py-1.5 px-2 text-right">
                          {punches.length > 0 && punches.some((p) => p.id) ? (
                            <button
                              type="button"
                              onClick={() => {
                                const punchesList = punches.map((p) => ({
                                  id: p.id,
                                  punch_time: p.punch_time,
                                  punch_type: (p.punch_type || 'in').toLowerCase(),
                                }));
                                setEditPunchData({
                                  employeeId: row.employee_id,
                                  employeeName: row.name,
                                  date: dateStr,
                                  punches: punchesList,
                                });
                                setEditPunchEdits(
                                  punchesList.map((p) => ({
                                    id: p.id,
                                    time: formatTimeForInput(new Date(p.punch_time)),
                                    punch_type: (p.punch_type || 'in').toLowerCase(),
                                  }))
                                );
                                setEditPunchError(null);
                                setEditPunchOpen(true);
                              }}
                              className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              Edit timings
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

        {/* Monthly calendar */}
      <section className="rounded-xl border border-slate-100 bg-white px-4 sm:px-5 py-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Monthly view</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
            >
              <option value="">All employees (summary)</option>
              {employeesForBranch.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.employee_code})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={goPrev}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:border-primary-200 hover:text-primary-700"
            >
              ← Prev
            </button>
            <span className="text-[11px] font-medium text-slate-700 min-w-[100px] text-center">
              {new Date(year, month - 1, 1).toLocaleString('default', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:border-primary-200 hover:text-primary-700"
            >
              Next →
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-4 h-64 rounded-lg bg-slate-50 animate-pulse" />
        ) : calendarGrid ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] text-[11px]">
              <thead>
                <tr className="border-b border-slate-200">
                  {WEEKDAYS.map((wd) => (
                    <th
                      key={wd}
                      className="py-2 text-center font-medium text-slate-500"
                    >
                      {wd}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarGrid.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-slate-100">
                    {row.map((dayNum, colIdx) => {
                      if (dayNum == null) {
                        return <td key={colIdx} className="p-1" />;
                      }
                      const info = calendarGrid.dayMap.get(dayNum);
                      const present = info?.present ?? false;
                      const late = info?.late ?? false;
                      const isToday =
                        dayNum === new Date().getDate() &&
                        month === new Date().getMonth() + 1 &&
                        year === new Date().getFullYear();
                      const cellDate = formatYMDLocalFromParts(year, month, dayNum);
                      const isSelected = cellDate === selectedDate;
                      let bg = 'bg-slate-50 text-slate-400';
                      if (present) {
                        bg = late
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200';
                      }
                      if (isToday) {
                        bg += ' ring-2 ring-primary-400 ring-offset-1';
                      }
                      if (isSelected) {
                        bg += ' outline outline-[2px] outline-blue-600';
                      }
                      const showSummary = !calendarGrid.isSingleEmployee && info?.total != null && info.total > 0;
                      return (
                        <td key={colIdx} className="p-1">
                          <button
                            type="button"
                            onClick={() => handleSelectDate(dayNum)}
                            className={`w-full rounded-md py-1.5 text-center font-medium transition ${bg}`}
                            title={
                              info
                                ? `${present ? 'Present' : 'Absent'}${late ? ', Late' : ''}${info.total > 1 ? ` (${info.presentCount}/${info.total})` : ''}`
                                : ''
                            }
                          >
                            <span>{dayNum}</span>
                            {showSummary && (
                              <span className="block text-[10px] opacity-90 leading-tight mt-0.5">
                                {info.presentCount ?? 0}/{info.total}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-emerald-200" /> Present
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-amber-200" /> Late
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-slate-200" /> Absent
              </span>
            </div>
            {monthlyData?.flexible_hours_mode && monthlyData.employees?.length > 0 && (
              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-3">
                <p className="text-[11px] font-semibold text-emerald-900">Monthly hours balance</p>
                <p className="mt-0.5 text-[10px] text-emerald-800">
                  Payroll uses monthly total; daily status is for supervision only.
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[280px] text-left text-[11px]">
                    <thead>
                      <tr className="text-slate-600 border-b border-emerald-100">
                        <th className="py-1.5 pr-3 font-medium">Employee</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Worked</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Required</th>
                        <th className="py-1.5 font-medium text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.employees
                        .filter((emp) => emp.monthly_summary)
                        .map((emp) => {
                          const bal = Number(emp.monthly_summary.balance || 0);
                          return (
                            <tr key={emp.employee_id} className="border-b border-emerald-50">
                              <td className="py-1.5 pr-3 font-medium text-slate-800">
                                {emp.name}
                                <span className="ml-1 text-slate-400">{emp.employee_code}</span>
                              </td>
                              <td className="py-1.5 pr-3 text-right">{emp.monthly_summary.worked}h</td>
                              <td className="py-1.5 pr-3 text-right">{emp.monthly_summary.required}h</td>
                              <td
                                className={`py-1.5 text-right font-medium ${
                                  bal < 0 ? 'text-rose-600' : bal > 0 ? 'text-emerald-700' : 'text-slate-600'
                                }`}
                              >
                                {bal > 0 ? '+' : ''}
                                {bal}h
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-500">
            No shift configured or no data for this month. Add a shift and sync
            device logs to see attendance.
          </div>
        )}
      </section>

      {/* Absent staff modal */}
      {absentModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setAbsentModalOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Staff absent today</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {dateStr} — {todaySummary.absent} {todaySummary.absent === 1 ? 'employee' : 'employees'} did not punch in
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 max-h-64">
              <ul className="space-y-2">
                {(dailyData || [])
                  .filter((r) => !r.present && !r.shift_pending)
                  .map((row) => (
                    <li
                      key={row.employee_id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-800">{row.name}</span>
                      {row.employee_code && (
                        <span className="text-[11px] text-slate-500">({row.employee_code})</span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setAbsentModalOpen(false)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Late staff modal */}
      {lateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setLateModalOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Staff late today</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {dateStr} — {todaySummary.late} {todaySummary.late === 1 ? 'employee' : 'employees'} arrived after grace period
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 max-h-64">
              <ul className="space-y-2">
                {(dailyData || [])
                  .filter((r) => r.late)
                  .map((row) => {
                    const firstIn = (row.punches || []).find((p) => (p.punch_type || '').toLowerCase() === 'in');
                    const arrivalTime = firstIn ? formatLocalTime(firstIn.punch_time, companyTz) : '—';
                    return (
                      <li
                        key={row.employee_id}
                        className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2"
                      >
                        <span className="font-medium text-slate-800">{row.name}</span>
                        <span className="text-amber-700 font-medium text-sm">{arrivalTime}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setLateModalOpen(false)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Present staff modal */}
      {presentModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setPresentModalOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Staff present today</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {dateStr} — {todaySummary.present} {todaySummary.present === 1 ? 'employee' : 'employees'} marked present
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 max-h-64">
              <ul className="space-y-2">
                {(dailyData || [])
                  .filter((r) => r.present)
                  .map((row) => {
                    const onBreakNow = isOnBreakStatus(row, isTodaySelected);
                    const status = row.full_day
                      ? 'Full day'
                      : onBreakNow
                        ? 'On break'
                      : row.left_during_lunch
                        ? 'Left at lunch'
                        : 'Present';
                    const statusWithLate = row.late ? `${status} (late)` : status;
                    return (
                      <li
                        key={row.employee_id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
                      >
                        <span className="font-medium text-slate-800">
                          {row.name}
                          {row.employee_code ? (
                            <span className="text-[11px] text-slate-500"> ({row.employee_code})</span>
                          ) : null}
                        </span>
                        <span className="text-[11px] text-emerald-700 font-medium">{statusWithLate}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setPresentModalOpen(false)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full day staff modal */}
      {fullDayModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setFullDayModalOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Staff full day today</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {dateStr} — {todaySummary.fullDay} marked full day
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 max-h-64">
              <ul className="space-y-2">
                {(dailyData || [])
                  .filter((r) => r.present && r.full_day)
                  .map((row) => {
                    const punches = row.punches || [];
                    const firstIn = punches
                      .filter((p) => (p.punch_type || '').toLowerCase() === 'in')
                      .sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time))[0];
                    const lastOut = punches
                      .filter((p) => (p.punch_type || '').toLowerCase() === 'out')
                      .sort((a, b) => new Date(b.punch_time) - new Date(a.punch_time))[0];
                    return (
                      <li
                        key={row.employee_id}
                        className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2"
                      >
                        <span className="font-medium text-slate-800">
                          {row.name}
                          {row.employee_code ? (
                            <span className="text-[11px] text-slate-500"> ({row.employee_code})</span>
                          ) : null}
                        </span>
                        <span className="text-[11px] text-blue-700 font-medium">
                          {firstIn ? formatLocalTime(firstIn.punch_time, companyTz) : '—'} →{' '}
                          {lastOut ? formatLocalTime(lastOut.punch_time, companyTz) : '—'}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setFullDayModalOpen(false)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left at lunch / On break staff modal */}
      {leftLunchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setLeftLunchModalOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {isTharagaiReadymades ? 'Staff on break' : 'Staff left at lunch'}
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {isTharagaiReadymades
                  ? `${dateStr} — ${todaySummary.onBreak} currently on break`
                  : `${dateStr} — ${todaySummary.leftDuringLunch} left during lunch`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 max-h-64">
              <ul className="space-y-2">
                {(dailyData || [])
                  .filter((r) =>
                    isTharagaiReadymades
                      ? isOnBreakStatus(r, isTodaySelected)
                      : isLeftAtLunchStatus(r)
                  )
                  .map((row) => {
                    const punches = row.punches || [];
                    const firstIn = punches
                      .filter((p) => (p.punch_type || '').toLowerCase() === 'in')
                      .sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time))[0];
                    const lastOut = punches
                      .filter((p) => (p.punch_type || '').toLowerCase() === 'out')
                      .sort((a, b) => new Date(b.punch_time) - new Date(a.punch_time))[0];
                    const lunchLabel =
                      row.lunch_minutes != null
                        ? row.lunch_over_minutes != null && row.lunch_over_minutes > 0
                          ? `${row.lunch_minutes}m (+${row.lunch_over_minutes} over)`
                          : `${row.lunch_minutes}m`
                        : '—';
                    const trailingLabel = isTharagaiReadymades ? 'On break' : lunchLabel;
                    return (
                      <li
                        key={row.employee_id}
                        className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2"
                      >
                        <span className="font-medium text-slate-800">
                          {row.name}
                          {row.employee_code ? (
                            <span className="text-[11px] text-slate-500"> ({row.employee_code})</span>
                          ) : null}
                        </span>
                        <span className="text-[11px] text-rose-700 font-medium">
                          {firstIn ? formatLocalTime(firstIn.punch_time, companyTz) : '—'} / {lastOut ? formatLocalTime(lastOut.punch_time, companyTz) : '—'} • {trailingLabel}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setLeftLunchModalOpen(false)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit punch timings modal */}
      {editPunchOpen && editPunchData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !editPunchSubmitting && setEditPunchOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Edit punch timings</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                {editPunchData.employeeName} — {editPunchData.date}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {editPunchError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {editPunchError}
                </div>
              )}
              {editPunchEdits.map((edit, idx) => (
                <div
                  key={editPunchRowKey(edit)}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                >
                  <span className="text-[11px] font-medium text-slate-500 w-16">Punch {idx + 1}</span>
                  <input
                    type="time"
                    value={edit.time}
                    onChange={(e) => {
                      setEditPunchEdits((prev) =>
                        prev.map((p) =>
                          matchesEditPunchRow(p, edit) ? { ...p, time: e.target.value } : p
                        )
                      );
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-800 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  />
                  <select
                    value={edit.punch_type}
                    onChange={(e) => {
                      setEditPunchEdits((prev) =>
                        prev.map((p) =>
                          matchesEditPunchRow(p, edit) ? { ...p, punch_type: e.target.value } : p
                        )
                      );
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-800 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  >
                    <option value="in">IN</option>
                    <option value="out">OUT</option>
                  </select>
                  <button
                    type="button"
                    disabled={editPunchSubmitting}
                    onClick={async () => {
                      if (edit.isNew) {
                        setEditPunchEdits((prev) => prev.filter((p) => !matchesEditPunchRow(p, edit)));
                        return;
                      }
                      if (!window.confirm('Delete this punch? This cannot be undone.')) return;
                      setEditPunchSubmitting(true);
                      setEditPunchError(null);
                      try {
                        const res = await authFetch(`/api/attendance/logs/${edit.id}`, {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                        });
                        if (!res.ok) {
                          const j = await res.json().catch(() => ({}));
                          throw new Error(j?.message || 'Failed to delete punch');
                        }
                        refreshAfterManual();
                        setEditPunchOpen(false);
                      } catch (err) {
                        setEditPunchError(err.message || 'Failed to delete');
                      } finally {
                        setEditPunchSubmitting(false);
                      }
                    }}
                    className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={editPunchSubmitting}
                onClick={() => {
                  const last = editPunchEdits[editPunchEdits.length - 1];
                  const defaultType =
                    last?.punch_type === 'in'
                      ? 'out'
                      : last?.punch_type === 'out'
                        ? 'in'
                        : 'in';
                  setEditPunchEdits((prev) => [
                    ...prev,
                    {
                      isNew: true,
                      tempId: `new-${Date.now()}`,
                      time: last?.time || '09:00',
                      punch_type: defaultType,
                    },
                  ]);
                }}
                className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 disabled:opacity-60"
              >
                + Add timing
              </button>
            </div>
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 flex gap-3">
              <button
                type="button"
                onClick={() => !editPunchSubmitting && setEditPunchOpen(false)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editPunchSubmitting}
                onClick={async () => {
                  setEditPunchSubmitting(true);
                  setEditPunchError(null);
                  try {
                    for (const edit of editPunchEdits) {
                      const punchTime = new Date(`${editPunchData.date}T${edit.time}`).toISOString();
                      const res = edit.isNew
                        ? await authFetch('/api/attendance/manual-punch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              employee_id: Number(editPunchData.employeeId),
                              punch_time: punchTime,
                              punch_type: edit.punch_type,
                            }),
                          })
                        : await authFetch(`/api/attendance/logs/${edit.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              punch_time: punchTime,
                              punch_type: edit.punch_type,
                            }),
                          });
                      if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        throw new Error(
                          j?.message || (edit.isNew ? 'Failed to add punch' : 'Failed to update punch')
                        );
                      }
                    }
                    refreshAfterManual();
                    setEditPunchOpen(false);
                  } catch (err) {
                    setEditPunchError(err.message || 'Failed to save');
                  } finally {
                    setEditPunchSubmitting(false);
                  }
                }}
                className="flex-1 rounded-lg border-2 border-blue-600 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {editPunchSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual attendance modal */}
      {manualModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setManualModalOpen(false)}
        >
          <div
            className="flex w-full max-w-md max-h-[90vh] flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Mark manual attendance</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Use when the biometric device is broken or unavailable
              </p>
            </div>
            <form onSubmit={handleManualSubmit} className="flex flex-1 flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {manualError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {manualError}
                </div>
              )}
              {manualSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                  {manualSuccess}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-2">Mode</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="manual_mode"
                      checked={manualForm.mode === 'full_day'}
                      onChange={() => setManualForm((f) => ({ ...f, mode: 'full_day' }))}
                      className="text-primary-600"
                    />
                    <span className="text-[12px] text-slate-700">Mark full day</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="manual_mode"
                      checked={manualForm.mode === 'single'}
                      onChange={() => setManualForm((f) => ({ ...f, mode: 'single' }))}
                      className="text-primary-600"
                    />
                    <span className="text-[12px] text-slate-700">Single punch</span>
                  </label>
                </div>
              </div>
              {manualForm.mode === 'full_day' && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-2">Bulk (multiple staff)</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualForm.bulk}
                      onChange={(e) => setManualForm((f) => ({ ...f, bulk: e.target.checked, selected_ids: [] }))}
                      className="rounded border-slate-300 text-primary-600"
                    />
                    <span className="text-[12px] text-slate-700">Mark multiple employees at once</span>
                  </label>
                </div>
              )}
              {manualForm.bulk && manualForm.mode === 'full_day' ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-medium text-slate-600">Select employees</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllEmployees}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={clearAllEmployees}
                        className="text-[10px] text-slate-500 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-1">
                    {employeesForManualAttendance.map((emp) => (
                      <label
                        key={emp.id}
                        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={(manualForm.selected_ids || []).includes(emp.id)}
                          onChange={() => toggleEmployee(emp.id)}
                          className="rounded border-slate-300 text-primary-600"
                        />
                        <span className="text-[12px] text-slate-700">{emp.name}</span>
                        <span className="text-[10px] text-slate-400">({emp.employee_code})</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {(manualForm.selected_ids || []).length} selected
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Employee</label>
                  <select
                    value={manualForm.employee_id}
                    onChange={(e) => setManualForm((f) => ({ ...f, employee_id: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    required={!manualForm.bulk}
                  >
                    <option value="">Select employee</option>
                    {employeesForManualAttendance.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employee_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Date</label>
                <input
                  type="date"
                  value={manualForm.date}
                  onChange={(e) => setManualForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  required
                />
              </div>
              {manualForm.mode === 'full_day' && !manualForm.bulk && (
                <p className="text-[10px] text-slate-400">
                  Full day adds IN at shift start and OUT at shift end (with lunch).
                </p>
              )}
              {manualForm.mode === 'single' && (
                <p className="text-[10px] text-slate-400">
                  Single punch adds one IN or OUT at the specified time.
                </p>
              )}
              {manualForm.mode === 'single' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Time</label>
                    <input
                      type="time"
                      value={manualForm.time}
                      onChange={(e) => setManualForm((f) => ({ ...f, time: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Punch type</label>
                    <select
                      value={manualForm.punch_type}
                      onChange={(e) => setManualForm((f) => ({ ...f, punch_type: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    >
                      <option value="in">IN</option>
                      <option value="out">OUT</option>
                    </select>
                  </div>
                </div>
              )}
              </div>
              <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting}
                  className="flex-1 rounded-lg border-2 border-blue-600 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 hover:border-blue-700 disabled:opacity-60"
                >
                  {manualSubmitting
                    ? 'Saving…'
                    : manualForm.bulk && manualForm.mode === 'full_day'
                      ? `Mark ${(manualForm.selected_ids || []).length} employees`
                      : 'Mark attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
