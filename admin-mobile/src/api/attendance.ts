import { apiFetch } from './client';
import type { DailyRow } from './types';

type Success<T> = { success: boolean; data: T };

export async function fetchDailyAttendance(date: string) {
  const res = await apiFetch<Success<DailyRow[]>>(
    `/api/attendance/daily?date=${encodeURIComponent(date)}`
  );
  return Array.isArray(res.data) ? res.data : [];
}
