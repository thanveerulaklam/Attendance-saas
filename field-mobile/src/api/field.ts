import { apiFetch } from './client';
import type { MeResponse, MonthlySummary, PunchResult } from './types';

type Success<T> = { success: boolean; data: T };

export async function fetchToday() {
  const res = await apiFetch<Success<MeResponse['today']>>('/api/field-app/today');
  return res.data;
}

export async function fetchMonthly(year: number, month: number) {
  const res = await apiFetch<Success<MonthlySummary>>(
    `/api/field-app/attendance/monthly?year=${year}&month=${month}`
  );
  return res.data;
}

export async function fetchSites() {
  const res = await apiFetch<Success<{ sites: MeResponse['sites'] }>>('/api/field-app/sites');
  return res.data.sites;
}

export async function fetchFaceProfile() {
  const res = await apiFetch<
    Success<{
      enrolled: boolean;
      profile: MeResponse['face'];
    }>
  >('/api/field-app/face-profile');
  return res.data;
}

export async function enrollFaceProfile(body: {
  model: string;
  dimension: number;
  embeddings: number[][];
}) {
  return apiFetch<Success<{ enrolled_at?: string }> & { message?: string }>(
    '/api/field-app/face-profile',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

export async function submitFieldPunch(body: {
  latitude: number;
  longitude: number;
  location_accuracy_m: number;
  embedding?: number[];
}) {
  const res = await apiFetch<Success<PunchResult>>('/api/field-app/punch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}
