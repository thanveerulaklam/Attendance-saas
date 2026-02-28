import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../utils/api';

const STEP_ROUTES = {
  company: '/settings/company',
  shift: '/shifts',
  employee: '/employees?onboarding=open_employee_modal',
  device: '/devices',
  device_sync: '/devices',
  payroll: '/payroll',
};

function StepIcon({ completed }) {
  return (
    <div
      className={`relative flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-all ${
        completed
          ? 'border-emerald-400 bg-emerald-50 text-emerald-600 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]'
          : 'border-slate-300 bg-white text-slate-400'
      }`}
    >
      <span
        className={`transition-transform duration-200 ${
          completed ? 'scale-100' : 'scale-0'
        }`}
      >
        ✓
      </span>
    </div>
  );
}

export default function OnboardingChecklist() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [celebrate, setCelebrate] = useState(false);
  const navigate = useNavigate();

  const progress = useMemo(() => {
    if (!status) return 0;
    return Number.isFinite(status.progressPercentage)
      ? Math.min(Math.max(status.progressPercentage, 0), 100)
      : 0;
  }, [status]);

  useEffect(() => {
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await authFetch('/api/onboarding/status', {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          // If unauthorized or forbidden, silently skip the widget
          if (res.status === 401 || res.status === 403) {
            if (isMounted) {
              setStatus(null);
              setLoading(false);
            }
            return;
          }
          throw new Error('Unable to load onboarding status');
        }

        const json = await res.json();
        if (!isMounted) return;

        setStatus(json.data || null);

        if (json.data && json.data.isCompleted) {
          setCelebrate(true);
          // Auto-hide celebration after a short delay
          setTimeout(() => {
            if (isMounted) {
              setCelebrate(false);
            }
          }, 3500);
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Unable to load onboarding status');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleGo = (stepKey) => {
    const target = STEP_ROUTES[stepKey];
    if (!target) return;
    navigate(target);
  };

  if (loading) {
    return (
      <section className="relative overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary-500 via-indigo-500 to-emerald-500" />
        <div className="flex flex-col gap-3 px-5 py-4 animate-pulse">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="h-3 w-64 rounded bg-slate-100" />
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100" />
        </div>
      </section>
    );
  }

  if (error || !status || status.isCompleted) {
    // Hide widget on error or when fully completed
    return null;
  }

  const incompleteSteps = status.steps?.filter((s) => !s.completed) || [];

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary-500 via-indigo-500 to-emerald-500" />

      <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Let&apos;s set up your company
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Complete these steps to start managing attendance with confidence.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-2 w-40 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-500 via-indigo-500 to-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-slate-600">
              {progress}% complete
            </span>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 md:self-stretch md:px-4 md:py-3">
          <p className="font-medium text-slate-800">Next best action</p>
          {incompleteSteps.length > 0 ? (
            <>
              <p className="mt-0.5">
                Start with{' '}
                <span className="font-semibold text-primary-700">
                  {incompleteSteps[0].label}
                </span>
                .
              </p>
              <button
                type="button"
                onClick={() => handleGo(incompleteSteps[0].key)}
                className="mt-2 inline-flex items-center rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Go to step
              </button>
            </>
          ) : (
            <p className="mt-0.5 text-emerald-700">
              All caught up. Great job!
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-3">
        <ul className="grid gap-2 text-xs md:grid-cols-3">
          {status.steps?.map((step) => (
            <li
              key={step.key}
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <StepIcon completed={step.completed} />
                <span
                  className={`text-[11px] font-medium ${
                    step.completed ? 'text-slate-500 line-through' : 'text-slate-800'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {!step.completed && STEP_ROUTES[step.key] && (
                <button
                  type="button"
                  onClick={() => handleGo(step.key)}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:text-primary-700"
                >
                  Go
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {celebrate && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-xs text-emerald-700 shadow-soft">
            <div className="text-base mb-1">🎉</div>
            <p className="font-semibold">Your system is fully set up!</p>
            <p className="mt-0.5 text-[11px]">
              You can always tweak settings as your factory grows.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

