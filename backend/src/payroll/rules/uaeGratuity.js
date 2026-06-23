const { roundMoney } = require('../../utils/statutoryDeductions');

/** Daily wage for gratuity = basic salary / 30 (UAE practice). */
function dailyWageFromBasic(basicSalary) {
  const basic = Number(basicSalary || 0);
  if (basic <= 0) return 0;
  return basic / 30;
}

/**
 * Completed years of service (fractional) from join date to as-of date.
 * @param {string|Date} joinDate
 * @param {string|Date} [asOfDate] YYYY-MM-DD; defaults to today UTC date
 */
function yearsOfService(joinDate, asOfDate) {
  const join = parseYmd(joinDate);
  const asOf = parseYmd(asOfDate) || todayYmdUtc();
  if (!join || !asOf || asOf < join) return 0;

  const joinMs = Date.UTC(join.y, join.m - 1, join.d);
  const asOfMs = Date.UTC(asOf.y, asOf.m - 1, asOf.d);
  const diffDays = (asOfMs - joinMs) / (24 * 60 * 60 * 1000);
  return Math.max(0, diffDays / 365.25);
}

function parseYmd(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function todayYmdUtc() {
  const d = new Date();
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
  };
}

/**
 * Gratuity days per year of service under UAE Labour Law (unlimited contract).
 * Years 1–5: 21 days/year; after 5 years: 30 days/year.
 */
function gratuityDaysPerYear(years) {
  if (years < 1) return 0;
  if (years <= 5) return 21;
  return 30;
}

/**
 * Estimated total end-of-service gratuity (informational).
 */
function estimateTotalGratuity({ basicSalary, joinDate, asOfDate, contractType = 'unlimited' } = {}) {
  const years = yearsOfService(joinDate, asOfDate);
  if (years < 1) return 0;

  const daily = dailyWageFromBasic(basicSalary);
  if (daily <= 0) return 0;

  const type = String(contractType || 'unlimited').toLowerCase();
  if (type === 'limited') {
    // Limited: 21 days per year for first 5 years (simplified).
    const entitledYears = Math.min(years, 5);
    return roundMoney(daily * 21 * entitledYears);
  }

  if (years <= 5) {
    return roundMoney(daily * 21 * years);
  }

  const firstFive = daily * 21 * 5;
  const beyond = daily * 30 * (years - 5);
  return roundMoney(firstFive + beyond);
}

/**
 * Monthly gratuity accrual shown on payslip (not deducted from net).
 * Uses current service tier: 21-day or 30-day rate based on total years.
 */
function computeMonthlyGratuityAccrual({ basicSalary, joinDate, asOfDate, contractType = 'unlimited' } = {}) {
  const years = yearsOfService(joinDate, asOfDate);
  if (years < 1) return 0;

  const daily = dailyWageFromBasic(basicSalary);
  if (daily <= 0) return 0;

  const daysPerYear = gratuityDaysPerYear(years);
  const type = String(contractType || 'unlimited').toLowerCase();
  if (type === 'limited' && years > 5) {
    return roundMoney((daily * 21 * 5) / 12);
  }

  return roundMoney((daily * daysPerYear) / 12);
}

module.exports = {
  dailyWageFromBasic,
  yearsOfService,
  estimateTotalGratuity,
  computeMonthlyGratuityAccrual,
  gratuityDaysPerYear,
};
