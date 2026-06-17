function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeMode(mode) {
  return String(mode || 'fixed').toLowerCase() === 'percentage' ? 'percentage' : 'fixed';
}

function computeEsiDeduction(employee, { grossSalary = 0 } = {}) {
  if (normalizeMode(employee?.esi_mode) === 'percentage') {
    const pct = Number(employee?.esi_percent || 0);
    if (pct <= 0) return 0;
    return roundMoney((Number(grossSalary || 0) * pct) / 100);
  }
  return roundMoney(employee?.esi_amount || 0);
}

function computePfDeduction(employee, { earnedBasic = 0 } = {}) {
  if (normalizeMode(employee?.pf_mode) === 'percentage') {
    const pct = Number(employee?.pf_percent || 0);
    if (pct <= 0) return 0;
    return roundMoney((Number(earnedBasic || 0) * pct) / 100);
  }
  return roundMoney(employee?.pf_amount || 0);
}

function employeeHasEsiConfigured(employee) {
  if (!employee) return false;
  if (normalizeMode(employee.esi_mode) === 'percentage') {
    return Number(employee.esi_percent || 0) > 0;
  }
  return Number(employee.esi_amount || 0) > 0;
}

function employeeHasPfConfigured(employee) {
  if (!employee) return false;
  if (normalizeMode(employee.pf_mode) === 'percentage') {
    return Number(employee.pf_percent || 0) > 0;
  }
  return Number(employee.pf_amount || 0) > 0;
}

function formatStatutoryModeLabel(mode) {
  return normalizeMode(mode) === 'percentage' ? 'Percentage' : 'Fixed';
}

module.exports = {
  roundMoney,
  normalizeMode,
  computeEsiDeduction,
  computePfDeduction,
  employeeHasEsiConfigured,
  employeeHasPfConfigured,
  formatStatutoryModeLabel,
};
