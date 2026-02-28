import { useEffect, useState } from 'react';
import { authFetch } from '../utils/api';

export default function ShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    shift_name: '',
    start_time: '09:00',
    end_time: '18:00',
    grace_minutes: 0,
    late_deduction_minutes: 0,
    late_deduction_amount: 0,
  });

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

  const handleChange = (field) => (event) => {
    const numericFields = ['grace_minutes', 'late_deduction_minutes', 'late_deduction_amount'];
    const value = numericFields.includes(field) ? Number(event.target.value || 0) : event.target.value;
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
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to create shift');
      setForm({
        shift_name: '',
        start_time: '09:00',
        end_time: '18:00',
        grace_minutes: 0,
        late_deduction_minutes: 0,
        late_deduction_amount: 0,
      });
      await loadShifts();
    } catch (err) {
      setError(err.message || 'Failed to create shift');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Shifts</h1>
        <p className="text-xs text-slate-500">
          Define standard working hours and grace time for your factory.
        </p>
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

              <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
                <p className="text-[11px] font-medium text-slate-700">
                  Late arrival deduction (optional)
                </p>
                <p className="text-[10px] text-slate-500">
                  If staff are late by more than the grace minutes, deduct this amount for every late
                  block of minutes you define below.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">
                      Late minutes
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.late_deduction_minutes}
                      onChange={handleChange('late_deduction_minutes')}
                      disabled={creating}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      placeholder="e.g. 15"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-700">
                      Deduction amount
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.late_deduction_amount}
                      onChange={handleChange('late_deduction_amount')}
                      disabled={creating}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                      placeholder="e.g. 50"
                    />
                  </div>
                </div>
              </div>
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
                    <h3 className="text-sm font-semibold text-slate-900">{shift.shift_name}</h3>
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
                      {(shift.late_deduction_minutes != null && shift.late_deduction_minutes > 0) ||
                      (shift.late_deduction_amount != null && shift.late_deduction_amount > 0) ? (
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Late deduction</dt>
                          <dd className="font-medium text-slate-800">
                            {shift.late_deduction_minutes ?? 0} min → {shift.late_deduction_amount ?? 0}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
