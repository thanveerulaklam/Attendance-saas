export default function EmployeeFilters({ search, status, onSearchChange, onStatusChange }) {
  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
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

      {/* Status filter */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-slate-500">Status:</span>
        <div className="inline-flex rounded-full bg-slate-100 p-0.5">
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
                className={`px-3 py-1 rounded-full font-medium transition-colors ${
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
    </section>
  );
}

