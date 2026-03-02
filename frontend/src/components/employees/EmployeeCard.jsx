export default function EmployeeCard({ employee, onEdit, onDeactivate }) {
  if (!employee) return null;

  const {
    name,
    employee_code: employeeCode,
    basic_salary: basicSalary,
    join_date: joinDate,
    status,
  } = employee;

  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const formattedSalary =
    basicSalary != null
      ? new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        }).format(basicSalary)
      : '—';

  const formattedJoinDate = joinDate
    ? new Date(joinDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';

  const isActive = status === 'active';

  return (
    <article className="group relative flex flex-col rounded-xl border border-slate-100 bg-white px-4 py-4 shadow-soft transition-all hover:-translate-y-[2px] hover:shadow-lg/70">
      {/* Status pill */}
      <div className="absolute right-4 top-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            isActive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-rose-50 text-rose-700 border border-rose-100'
          }`}
        >
          <span
            className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
              isActive ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          {isActive ? 'Active' : (status || 'Inactive')}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 pr-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-primary-500 to-primary-300 text-xs font-semibold text-white shadow-soft">
          {initials || '?'}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">{name}</h2>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            #{employeeCode}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mt-4 flex flex-1 flex-col justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Basic salary</span>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
            {formattedSalary}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">Joined</span>
          <span className="font-medium text-slate-800">{formattedJoinDate}</span>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => onEdit?.(employee)}
          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-primary-200 hover:text-primary-700"
        >
          <span className="mr-1 text-xs">✏️</span>
          Edit
        </button>
        <button
          type="button"
          onClick={() => isActive && onDeactivate?.(employee)}
          disabled={!isActive}
          className="text-[11px] font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isActive ? 'Deactivate' : 'Deactivated'}
        </button>
      </div>
    </article>
  );
}

