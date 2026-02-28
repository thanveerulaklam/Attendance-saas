const { getDailyAttendance } = require('./attendanceService');

/**
 * Get dashboard summary for a company: KPIs + 7-day attendance trend + today's absent.
 */
async function getDashboardSummary(companyId) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const dailyResult = await getDailyAttendance(companyId, todayStr, null);
  const totalEmployees = (dailyResult || []).length;
  const todayPresent = (dailyResult || []).filter((r) => r.present).length;
  const todayTotal = (dailyResult || []).length;
  const todayAbsent = (dailyResult || [])
    .filter((r) => !r.present)
    .map((r) => r.name)
    .sort();

  const trendDays = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    trendDays.push({ date: dateStr, label: d.toLocaleDateString('en-US', { weekday: 'short' }) });
  }

  const trend = [];
  for (const { date, label } of trendDays) {
    try {
      const dayData = await getDailyAttendance(companyId, date, null);
      const present = (dayData || []).filter((r) => r.present).length;
      const total = (dayData || []).length;
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      trend.push({ date, label, present, total, pct });
    } catch {
      trend.push({ date, label, present: 0, total: totalEmployees, pct: 0 });
    }
  }

  return {
    todayPresent,
    todayTotal,
    todayPct: todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0,
    todayAbsent,
    attendanceTrend: trend,
  };
}

module.exports = { getDashboardSummary };
