function computeMonthlyBaseAndAbsence({
  isMonthComplete,
  attendanceMode,
  basicSalary,
  dailyRate,
  presentDays,
  paidLeaveDaysAllowed,
  /** Days absent but paid via shift paid-leave pool (hours_based earned only). */
  paidLeaveUsed = 0,
  absenceDays,
}) {
  const mode = String(attendanceMode || 'day_based').toLowerCase();
  const isHoursBased = mode === 'hours_based';
  const safePresentDays = Number(presentDays || 0);
  const safePaidLeaveUsed = Math.max(0, Number(paidLeaveUsed || 0));
  const safeAbsenceDays = Number(absenceDays || 0);

  let earnedBasic = 0;
  let absenceDeduction = 0;

  if (isMonthComplete) {
    if (isHoursBased) {
      // presentDays already excludes absent days and applies half-days as 0.5.
      // Do not also charge absenceDeduction — that double-counts vs pro-rated earned.
      // Add only paid-leave-covered absent days (not the monthly allowance cap).
      earnedBasic = dailyRate * (safePresentDays + safePaidLeaveUsed);
      absenceDeduction = 0;
    } else {
      earnedBasic = Number(basicSalary || 0);
      absenceDeduction = dailyRate * safeAbsenceDays;
    }
  } else if (isHoursBased) {
    earnedBasic = dailyRate * (safePresentDays + safePaidLeaveUsed);
    absenceDeduction = 0;
  } else {
    earnedBasic = dailyRate * safePresentDays;
  }

  return { earnedBasic, absenceDeduction };
}

function computePermissionOffset({
  allocatedHours,
  lateMinutes,
  absenceDays,
  hourlyRate,
  deductionsBeforeOffset,
}) {
  const safeAllocatedHours = Math.max(0, Number(allocatedHours || 0));
  const safeLateMinutes = Math.max(0, Number(lateMinutes || 0));
  const safeAbsenceDays = Math.max(0, Number(absenceDays || 0));
  const safeHourlyRate = Math.max(0, Number(hourlyRate || 0));
  const safeDeductionsBeforeOffset = Math.max(0, Number(deductionsBeforeOffset || 0));

  const allocatedMinutes = safeAllocatedHours * 60;
  const eligibleMinutes = safeLateMinutes + safeAbsenceDays * 8 * 60;
  const usedMinutes = Math.min(allocatedMinutes, eligibleMinutes);
  const rawOffsetAmount = (usedMinutes / 60) * safeHourlyRate;
  const offsetAmount = Math.min(rawOffsetAmount, safeDeductionsBeforeOffset);

  return {
    allocatedHours: safeAllocatedHours,
    usedMinutes,
    offsetAmount,
  };
}

function computePaidLeaveEncashment({
  enabled,
  isMonthComplete,
  paidLeaveDaysAllowed,
  paidLeaveUsed,
  dailyRate,
}) {
  if (enabled !== true || isMonthComplete !== true) {
    return { unusedPaidLeaveDays: 0, paidLeaveEncashmentAmount: 0 };
  }

  const allowed = Math.max(0, Number(paidLeaveDaysAllowed || 0));
  const used = Math.max(0, Number(paidLeaveUsed || 0));
  const rate = Math.max(0, Number(dailyRate || 0));
  const unusedPaidLeaveDays = Math.max(0, allowed - used);

  return {
    unusedPaidLeaveDays,
    paidLeaveEncashmentAmount: unusedPaidLeaveDays * rate,
  };
}

module.exports = {
  computeMonthlyBaseAndAbsence,
  computePermissionOffset,
  computePaidLeaveEncashment,
};

