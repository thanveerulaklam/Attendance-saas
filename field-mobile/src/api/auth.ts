import { apiFetch } from './client';
import type { FieldUser, MeResponse } from './types';

type Success<T> = { success: boolean; data: T };

export async function login(email: string, password: string) {
  return apiFetch<Success<{ token: string; user: FieldUser }>>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function fetchMe() {
  const res = await apiFetch<Success<MeResponse>>('/api/field-app/me');
  return res.data;
}
