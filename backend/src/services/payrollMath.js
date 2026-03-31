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

module.exports = {
  computeMonthlyBaseAndAbsence,
};

