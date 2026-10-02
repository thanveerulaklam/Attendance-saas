import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import { authFetch } from '../utils/api';
import BeatDayMap from '../components/field/BeatDayMap';

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function FieldVisitsPage() {
  const [date, setDate] = useState(todayYmd);
  const [days, setDays] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useAutoDismiss(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/company/field-beat-days?date=${encodeURIComponent(date)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load visits');
      const nextDays = json.data?.days || [];
      setDays(nextDays);
      setSelectedId((current) => {
        if (current && nextDays.some((day) => Number(day.employee_id) === Number(current))) {
          return current;
        }
        return nextDays[0]?.employee_id ?? null;
      });
    } catch (err) {
      setError(err.message || 'Failed to load visits');
      setToast({ type: 'error', message: err.message || 'Failed to load visits' });
    } finally {
      setLoading(false);
    }
  }, [date, setToast]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = days.find((day) => Number(day.employee_id) === Number(selectedId)) || null;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[11px] text-slate-500">
          <Link to="/field-sites" className="font-medium text-indigo-600 underline">
            Field sites
          </Link>
          {' · door-to-door Start / Visit / End'}
        </p>
        <h1 className="text-lg font-semibold text-slate-900">Field visits</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Hours come from Start and End day. Each visit is a check-in pin, not live tracking.
        </p>
      </header>

      {toast && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            toast.type === 'error'
              ? 'border-rose-100 bg-rose-50 text-rose-700'
              : 'border-emerald-100 bg-emerald-50 text-emerald-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
        <label className="text-xs text-slate-600">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </section>

      {error && (
        <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <BeatDayMap days={days} selectedEmployeeId={selectedId} />

      <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
        <h2 className="text-sm font-semibold text-slate-900">People</h2>
        {loading ? (
          <p className="mt-3 text-xs text-slate-500">Loading…</p>
        ) : days.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            No door-to-door days on this date. Enable “Door-to-door” on a field employee, then they
            Start day in PunchPay Field.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {days.map((day) => (
              <li key={day.employee_id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(day.employee_id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm ${
                    Number(selectedId) === Number(day.employee_id) ? 'text-slate-900' : 'text-slate-700'
                  }`}
                >
                  <span className="font-medium">
                    {day.name}
                    <span className="ml-1 text-[11px] font-normal text-slate-500">
                      {day.employee_code}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {formatTime(day.started_at)}–{day.ended ? formatTime(day.ended_at) : 'on duty'} ·{' '}
                    {day.visit_count} visit{day.visit_count === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className="rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">{selected.name} · visits</h2>
          {(selected.visits || []).length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No visits yet. Start is on the map.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {selected.visits.map((visit, index) => (
                <li key={visit.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {visit.label || `Visit ${index + 1}`}
                    <span className="ml-2 text-[11px] text-slate-500">
                      {Number(visit.latitude).toFixed(5)}, {Number(visit.longitude).toFixed(5)}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500">{formatTime(visit.visited_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
