export function lateDeductionLabel(mode) {
  return String(mode || 'per_day') === 'per_minute' ? 'Late (per minute)' : 'Late (per day)';
}

export function overtimePayLabel(mode) {
  const m = String(mode || 'per_hour');
  if (m === 'per_day') return 'OT (per day)';
  if (m === 'per_minute') return 'OT (per minute)';
  return 'OT (per hour)';
}

export function overtimeWindowLabel(window) {
  const w = String(window || 'total_extra');
  if (w === 'after_end') return 'after end';
  if (w === 'before_start') return 'before start';
  if (w === 'both') return 'before and after';
  return 'total extra';
}
