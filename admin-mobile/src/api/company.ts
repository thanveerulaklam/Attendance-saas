import { apiFetch } from './client';
import type { Company } from './types';

type Success<T> = { success: boolean; data: T };

export async function fetchCompany() {
  const res = await apiFetch<Success<Company>>('/api/company');
  return res.data;
}
