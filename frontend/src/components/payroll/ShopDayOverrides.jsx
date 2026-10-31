import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authFetch } from '../../utils/api';

function ymdAddDays(ymd, days) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eachYmd(from, to) {
  const dates = [];
  let cur = String(from || '').slice(0, 10);
  const end = String(to || '').slice(0, 10);
  while (cur && end && cur <= end && dates.length < 40) {
    dates.push(cur);
    cur = ymdAddDays(cur, 1);
  }
  return dates;
}

function weekdayIndex(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function formatDayLabel(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC',
  });
}

export function periodBoundsForPayroll(mode, { year, month, weekStartDate }) {
  if (mode === 'weekly') {
    const start = String(weekStartDate || '').slice(0, 10);
    if (!start) return null;
    return { from: start, to: ymdAddDays(start, 6) };
  }
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return null;
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${String(m).padStart(2, '0')}-01`,
    to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

export async function fetchShopDayOverrides(from, to) {
  const params = new URLSearchParams({
    from: String(from).slice(0, 10),
    to: String(to).slice(0, 10),
  });
  const res = await authFetch(`/api/holidays/day-overrides?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || 'Failed to load shop days');
  }
  const map = {};
  for (const row of json.data || []) {
    const date = String(row.override_date || '').slice(0, 10);
    if (date) map[date] = row.effect;
  }
  return map;
}

export async function saveShopDayOverride(date, effect) {
  const ymd = String(date).slice(0, 10);
  const res = effect
    ? await authFetch('/api/holidays/day-overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: ymd, effect }),
      })
    : await authFetch(`/api/holidays/day-overrides/${ymd}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || 'Failed to update this day');
  }
  return json.data || {};
}

export function shopDayResultMessage(date, effect, data) {
  const label = formatDayLabel(date);
  const action = effect === 'working'
    ? `Opened ${label} as a working day`
    : effect === 'holiday'
      ? `Marked ${label} as a paid holiday`
      : `Restored ${label}`;
  const count = Number(data?.recalculated || 0);
  const payrollNote = count > 0
    ? ` Updated ${count} payroll record${count === 1 ? '' : 's'}.`
    : ' Generate payroll to use this day.';
  return `${action}.${payrollNote}`;
}

function collectWeeklyOffDays(companyDays, shifts) {
  const days = new Set(
    (companyDays || []).map((day) => Number(day)).filter((day) => day >= 0 && day <= 6)
  );
  for (const shift of shifts || []) {
    const shiftDays = Array.isArray(shift.weekly_off_days) ? shift.weekly_off_days : [];
    if (shiftDays.length === 0) continue;
    for (const day of shiftDays) {
      const n = Number(day);
      if (n >= 0 && n <= 6) days.add(n);
    }
  }
  return days;
}

export default function ShopDayOverrides({
  from,
  to,
  disabled,
  reloadKey = 0,
  onSaved,
  onError,
}) {
  const [loading, setLoading] = useState(false);
  const [savingDate, setSavingDate] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [weeklyOffDays, setWeeklyOffDays] = useState(() => new Set());
  const [overrides, setOverrides] = useState({});
  const [closeDate, setCloseDate] = useState('');

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const months = new Set([String(from).slice(0, 7), String(to).slice(0, 7)]);
      const [holidayLists, weeklyRes, shiftRes, overrideMap] = await Promise.all([
        Promise.all([...months].map(async (ym) => {
          const [year, month] = ym.split('-');
          const params = new URLSearchParams({ year, month: String(Number(month)) });
          const res = await authFetch(`/api/holidays?${params}`, {
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) return [];
          const json = await res.json();
          return Array.isArray(json.data) ? json.data : [];
        })),
        authFetch('/api/holidays/weekly-off', {
          headers: { 'Content-Type': 'application/json' },
        }),
        authFetch('/api/shifts?limit=200', {
          headers: { 'Content-Type': 'application/json' },
        }),
        fetchShopDayOverrides(from, to),
      ]);
      const weeklyJson = weeklyRes.ok ? await weeklyRes.json() : { data: { days: [] } };
      const shiftJson = shiftRes.ok ? await shiftRes.json() : { data: [] };
      setHolidays(holidayLists.flat());
      setWeeklyOffDays(
        collectWeeklyOffDays(weeklyJson.data?.days, Array.isArray(shiftJson.data) ? shiftJson.data : [])
      );
      setOverrides(overrideMap);
    } catch (err) {
      onErrorRef.current?.(err.message || 'Failed to load shop days');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const rows = useMemo(() => {
    if (!from || !to) return [];
    const holidayByDate = new Map();
    for (const holiday of holidays) {
      const date = String(holiday.holiday_date || holiday.date || '').slice(0, 10);
      if (!date || date < from || date > to) continue;
      const name = String(holiday.name || '').trim();
      holidayByDate.set(date, name || 'Holiday');
    }
    return eachYmd(from, to).flatMap((date) => {
      const effect = overrides[date] || null;
      const holidayName = holidayByDate.get(date) || null;
      const weeklyOff = weeklyOffDays.has(weekdayIndex(date));
      const naturalLabel = holidayName || (weeklyOff ? 'Weekly off' : null);
      if (effect === 'working') {
        return [{
          date,
          label: naturalLabel ? `Open · usually ${naturalLabel}` : 'Open',
          action: 'clear',
          actionLabel: 'Undo',
        }];
      }
      if (effect === 'holiday') {
        return [{
          date,
          label: holidayName || 'Paid holiday',
          action: 'clear',
          actionLabel: 'Undo',
        }];
      }
      if (!naturalLabel) return [];
      return [{
        date,
        label: naturalLabel,
        action: 'working',
        actionLabel: 'Open this day',
      }];
    });
  }, [from, to, holidays, weeklyOffDays, overrides]);

  const save = async (date, effect) => {
    if (!date || disabled || savingDate) return;
    setSavingDate(date);
    try {
      const data = await saveShopDayOverride(date, effect);
      await load();
      if (effect === 'holiday') setCloseDate('');
      onSavedRef.current?.(shopDayResultMessage(date, effect, data));
    } catch (err) {
      onError?.(err.message || 'Failed to update this day');
    } finally {
      setSavingDate(null);
    }
  };

  if (!from || !to) {
    return (
      <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        Select a month to open a holiday or mark a working day as a paid holiday.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-900">Shop days</h3>
          <p className="mt-0.5 max-w-xl text-[11px] text-slate-500">
            Open a holiday when the shop works that day. Mark a normal day as a paid holiday when the shop is closed.
            The change is for that date only and applies to every employee.
          </p>
        </div>
      </div>

      <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="px-3 py-3 text-[11px] text-slate-400">Loading shop days…</p>
        ) : rows.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-slate-400">
            No weekly offs or holidays in this period.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={`${row.date}-${row.action}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-800">{formatDayLabel(row.date)}</p>
                  <p className={`text-[10px] ${row.action === 'working' ? 'text-slate-500' : 'text-amber-700'}`}>
                    {row.label}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled || savingDate === row.date}
                  onClick={() => void save(row.date, row.action === 'clear' ? null : row.action)}
                  className={`shrink-0 rounded border px-2 py-1 text-[11px] font-medium disabled:opacity-50 ${
                    row.action === 'working'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {savingDate === row.date ? 'Saving…' : row.actionLabel}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Close a working day</label>
          <input
            type="date"
            min={from}
            max={to}
            value={closeDate}
            disabled={disabled}
            onChange={(e) => setCloseDate(e.target.value)}
            className="mt-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
          />
        </div>
        <button
          type="button"
          disabled={disabled || !closeDate || savingDate === closeDate}
          onClick={() => void save(closeDate, 'holiday')}
          className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {savingDate === closeDate ? 'Saving…' : 'Mark as holiday'}
        </button>
      </div>
    </div>
  );
}
