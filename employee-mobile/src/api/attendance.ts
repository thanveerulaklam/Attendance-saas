import { apiFetch } from './client';
import type { MeResponse, MonthlySummary, PunchResult } from './types';

type Success<T> = { success: boolean; data: T };

export async function login(email: string, password: string) {
  return apiFetch<Success<{ token: string; user: { role: string; employee_id: number | null } }>>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }
  );
}

export async function fetchMe() {
  const res = await apiFetch<Success<MeResponse>>('/api/employee-app/me');
  return res.data;
}

export async function fetchToday() {
  const res = await apiFetch<Success<MeResponse['today']>>('/api/employee-app/today');
  return res.data;
}

export async function fetchMonthly(year: number, month: number) {
  const res = await apiFetch<Success<MonthlySummary>>(
    `/api/employee-app/attendance/monthly?year=${year}&month=${month}`
  );
  return res.data;
}

export async function submitPunch(body: {
  qr_nonce: string;
  latitude: number;
  longitude: number;
  location_accuracy_m: number;
}) {
  const res = await apiFetch<Success<PunchResult>>('/api/employee-app/punch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}
