const { isShiftRotationEnabled } = require('./shiftRotationPolicyService');
const {
  resolveShiftIdForEmployeeOnDate,
  resolveShiftIdsForEmployeesOnDate,
} = require('./shiftAssignmentService');

/**
 * Resolve effective shift_id for an employee on a date.
 * When rotation is disabled, returns fallbackShiftId unchanged.
 */
async function resolveEffectiveShiftId(client, companyId, employeeId, dateStr, fallbackShiftId) {
  const enabled = await isShiftRotationEnabled(companyId);
  if (!enabled) return fallbackShiftId ?? null;
  return resolveShiftIdForEmployeeOnDate(
    client,
    companyId,
    employeeId,
    dateStr,
    fallbackShiftId
  );
}

async function resolveEffectiveShiftIdsForDate(
  client,
  companyId,
  employees,
  dateStr
) {
  const enabled = await isShiftRotationEnabled(companyId);
  if (!enabled) {
    const map = new Map();
    for (const emp of employees) {
      map.set(Number(emp.id), emp.shift_id ?? null);
    }
    return map;
  }
  const ids = employees.map((e) => Number(e.id));
  const byId = new Map(employees.map((e) => [Number(e.id), e]));
  return resolveShiftIdsForEmployeesOnDate(client, companyId, ids, dateStr, byId);
}

module.exports = {
  resolveEffectiveShiftId,
  resolveEffectiveShiftIdsForDate,
  isShiftRotationEnabled,
};
