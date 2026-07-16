/**
 * Normalize branch lists from API payloads (array or { branches: [] }).
 */
export function normalizeBranchesPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.branches)) return payload.branches;
  return [];
}

/**
 * Derive branch filter options from employee rows when the branches API is empty.
 */
export function branchesFromEmployees(employees) {
  const map = new Map();
  for (const emp of employees || []) {
    if (emp?.branch_id == null || emp.branch_id === '') continue;
    const id = Number(emp.branch_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: emp.branch_name || `Branch #${id}`,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
}

/**
 * Derive branch filter options from attendance rows (daily/monthly payloads).
 */
export function branchesFromAttendanceRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.branch_id == null || row.branch_id === '') continue;
    const id = Number(row.branch_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: row.branch_name || `Branch #${id}`,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
}

/**
 * Merge multiple branch lists by id, preferring the first non-empty name seen.
 */
export function mergeBranchLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const branch of list || []) {
      if (branch?.id == null) continue;
      const id = Number(branch.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const existing = map.get(id);
      map.set(id, {
        id,
        name: branch.name || existing?.name || `Branch #${id}`,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );
}
