export default function EmployeeFilters({
  search,
  status,
  branchId,
  department,
  gender,
  branches = [],
  departments = [],
  onSearchChange,
  onStatusChange,
  onBranchChange,
  onDepartmentChange,
  onGenderChange,
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <label className="block text-[11px] font-medium text-slate-600">
            Search employees
            <div className="mt-1 relative rounded-lg shadow-soft">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-xs">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="Search by name or code"
              />
            </div>
          </label>
        </div>

        <div className="flex flex-col items-start gap-2 text-[11px] sm:flex-row sm:items-center">
          <span className="text-slate-500">Status:</span>
          <div className="inline-flex w-full sm:w-auto rounded-full bg-slate-100 p-0.5">
            {[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ].map((option) => {
              const isActive = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onStatusChange?.(option.value)}
                  className={`flex-1 sm:flex-none px-3 py-1 rounded-full font-medium transition-colors ${
                    isActive
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600">Branch</label>
          <select
            value={branchId}
            onChange={(e) => onBranchChange?.(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600">Department</label>
          <select
            value={department}
            onChange={(e) => onDepartmentChange?.(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600">Gender</label>
          <select
            value={gender}
            onChange={(e) => onGenderChange?.(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
          >
            <option value="all">All genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="unset">Not specified</option>
          </select>
        </div>
      </div>
    </section>
  );
}
