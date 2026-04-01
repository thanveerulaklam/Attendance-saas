function computeMonthlyBaseAndAbsence({
  isMonthComplete,
  attendanceMode,
  basicSalary,
  dailyRate,
  presentDays,
  paidLeaveDaysAllowed,
  absenceDays,
}) {
  const mode = String(attendanceMode || 'day_based').toLowerCase();
  const isHoursBased = mode === 'hours_based';
  const safePresentDays = Number(presentDays || 0);
  const safePaidLeaveDaysAllowed = Number(paidLeaveDaysAllowed || 0);
  const safeAbsenceDays = Number(absenceDays || 0);

  let earnedBasic = 0;
  let absenceDeduction = 0;

  if (isMonthComplete) {
    if (isHoursBased) {
      earnedBasic = dailyRate * (safePresentDays + safePaidLeaveDaysAllowed);
      absenceDeduction = dailyRate * safeAbsenceDays;
    } else {
      earnedBasic = Number(basicSalary || 0);
      absenceDeduction = dailyRate * safeAbsenceDays;
    }
  } else {
    earnedBasic = dailyRate * safePresentDays;
    if (isHoursBased) {
      absenceDeduction = dailyRate * safeAbsenceDays;
    }
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

module.exports = {
  computeMonthlyBaseAndAbsence,
  computePermissionOffset,
};

