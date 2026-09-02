import type { AttendanceFilter, DailyRow } from '../api/types';

export function isMissingOut(row: DailyRow) {
  if (!row.present) return false;
  const punches = Array.isArray(row.punches) ? row.punches : [];
  if (punches.length === 0) return false;
  const last = punches[punches.length - 1];
  return String(last.punch_type || '').toLowerCase() === 'in';
}

export function rowHours(row: DailyRow) {
  if (row.total_hours_inside != null) return row.total_hours_inside;
  return row.total_hours_from_shift_start ?? null;
}

export function matchesFilter(row: DailyRow, filter: AttendanceFilter) {
  switch (filter) {
    case 'present':
      return Boolean(row.present);
    case 'absent':
      return !row.present && !row.shift_pending;
    case 'late':
      return Boolean(row.late);
    case 'missing_out':
      return isMissingOut(row);
    default:
      return true;
  }
}

export function statusLabel(row: DailyRow) {
  if (row.open_break_name) return row.open_break_name;
  if (row.shift_pending) return 'Shift later';
  if (!row.present) return 'Absent';
  if (isMissingOut(row) && row.late) return 'Late · in';
  if (isMissingOut(row)) return 'Punched in';
  if (row.late) return 'Late';
  return 'Present';
}

export function statusTone(row: DailyRow): 'success' | 'danger' | 'warning' | 'sky' | 'muted' {
  if (row.open_break_name) return 'sky';
  if (!row.present && !row.shift_pending) return 'danger';
  if (row.late) return 'warning';
  if (isMissingOut(row)) return 'sky';
  if (row.present) return 'success';
  return 'muted';
}
