const { getDailyAttendance } = require('./attendanceService');
const { todayIstYmd, addDaysIst } = require('../utils/istDate');

/**
 * Get dashboard summary for a company: KPIs + 7-day attendance trend + today's absent.
 */
async function getDashboardSummary(companyId, allowedBranchIds = null) {
  const todayStr = todayIstYmd();

  const dailyResult = await getDailyAttendance(companyId, todayStr, null, null, allowedBranchIds);
  const totalEmployees = (dailyResult || []).length;
  const todayPresent = (dailyResult || []).filter((r) => r.present).length;
  const todayTotal = (dailyResult || []).length;
  const todayAbsent = (dailyResult || [])
    .filter((r) => !r.present)
    .map((r) => r.name)
    .sort();

  // Currently on lunch = have exactly 2 punches today (IN, OUT) — out for lunch, not yet back
  const todayOnLunch = (dailyResult || [])
    .filter(
      (r) =>
        r.punches &&
        r.punches.length === 2 &&
        (r.punches[0].punch_type || '').toLowerCase() === 'in' &&
        (r.punches[1].punch_type || '').toLowerCase() === 'out'
    )
    .map((r) => ({
      name: r.name,
      employee_code: r.employee_code || '',
      punched_out_at: r.punches[1].punch_time,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Branch-wise summary for multi-branch admins (defaults to all branches for admin users).
  const branchBuckets = new Map();
  for (const row of dailyResult || []) {
    const branchId = row.branch_id != null ? Number(row.branch_id) : 0;
    const branchName = row.branch_name || 'Unassigned';
    if (!branchBuckets.has(branchId)) {
      branchBuckets.set(branchId, {
        branch_id: branchId,
        branch_name: branchName,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
      });
    }
    const bucket = branchBuckets.get(branchId);
    bucket.total += 1;
    if (row.present) bucket.present += 1;
    else bucket.absent += 1;
    if (row.late) bucket.late += 1;
  }
  const branchSummary = Array.from(branchBuckets.values())
    .sort((a, b) => a.branch_name.localeCompare(b.branch_name))
    .map((b) => ({
      ...b,
      present_pct: b.total > 0 ? Math.round((b.present / b.total) * 100) : 0,
    }));

  const trendDays = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dateStr = addDaysIst(todayStr, -i);
    const label = new Date(`${dateStr}T12:00:00+05:30`).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'Asia/Kolkata',
    });
    trendDays.push({ date: dateStr, label });
  }

  const trend = [];
  for (const { date, label } of trendDays) {
    try {
      const dayData = await getDailyAttendance(companyId, date, null, null, allowedBranchIds);
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
    todayOnLunch,
    branchSummary,
    attendanceTrend: trend,
  };
}

module.exports = { getDashboardSummary };
