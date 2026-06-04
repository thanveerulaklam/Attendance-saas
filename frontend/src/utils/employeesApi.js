/** GET /api/employees returns { data: { data: Employee[], total, page, limit } }. */
export function employeesListFromApi(json) {
  const payload = json?.data;
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export function activeEmployeesFromApi(json) {
  return employeesListFromApi(json).filter((e) => e.status === 'active');
}

export function arrayFromApi(json) {
  const d = json?.data;
  return Array.isArray(d) ? d : [];
}
