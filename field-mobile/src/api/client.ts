import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../config';
import type { ApiError } from './types';

const TOKEN_KEY = 'punchpay_field_token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

type ApiJson = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: unknown;
};

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let json: ApiJson = {};
  try {
    json = (await res.json()) as ApiJson;
  } catch {
    // non-JSON body
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      onUnauthorized?.();
    }
    const err = new Error(json.message || `Request failed (${res.status})`) as ApiError;
    err.code = json.code;
    err.status = res.status;
    throw err;
  }

  return json as T;
}
