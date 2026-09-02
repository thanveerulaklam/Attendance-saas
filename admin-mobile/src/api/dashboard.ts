import { apiFetch } from './client';
import type { DashboardSummary } from './types';

type Success<T> = { success: boolean; data: T };

export async function fetchDashboardSummary() {
  const res = await apiFetch<Success<DashboardSummary>>('/api/dashboard/summary');
  return res.data;
}
