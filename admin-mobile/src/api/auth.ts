import { apiFetch } from './client';
import type { AdminUser } from './types';

type Success<T> = { success: boolean; data: T };

export async function login(email: string, password: string) {
  return apiFetch<Success<{ token: string; user: AdminUser }>>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function fetchMe() {
  const res = await apiFetch<Success<AdminUser>>('/api/auth/me');
  return res.data;
}
